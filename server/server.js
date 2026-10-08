/**
 * Two-Player Arena — игровой сервер.
 * Задача сервера намеренно узкая:
 *   1. Держать список игр и счётчики онлайн/в очереди.
 *   2. Подбирать пару игроков (тот же game, противоположный пол,
 *      разница в возрасте в пределах текущего допуска).
 *   3. Спросить обоих "согласны сыграть?" и, если оба да — свести их в комнату.
 *   4. Внутри комнаты — пересылать JSON-сообщения (ходы, личный чат) от одного к другому.
 *   5. Общий чат для всех подключённых: только слова и смайлики, без ссылок.
 *
 * Ничего не сохраняется на диск и в БД: всё живёт в памяти процесса
 * (включая последние 50 сообщений общего чата — они пропадают при перезапуске).
 * Вся игровая логика (правила, подсветка ходов, проверка победы) — на фронтенде.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

const GAMES = [
  { id: 'chess', name: 'Шахматы' },
  { id: 'checkers', name: 'Шашки' },
  { id: 'tictactoe', name: 'Крестики-нолики 5×5' },
  { id: 'battleship', name: 'Морской бой' },
];
const GAME_IDS = new Set(GAMES.map(g => g.id));

// ---- статика фронтенда ----
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  let reqPath;
  try { reqPath = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); return res.end(); }
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, reqPath);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

// ---- состояние в памяти ----
let nextId = 1;
const clients = new Map(); // ws -> session
const queues = new Map();  // gameId -> Set(session)
GAMES.forEach(g => queues.set(g.id, new Set()));
const rooms = new Map();   // roomId -> {a, b, game, rematch:Set}
let nextRoomId = 1;

// ---- общий чат ----
const GLOBAL_MAX_LEN = 200;
const GLOBAL_HISTORY_LIMIT = 50;
const GLOBAL_MIN_INTERVAL_MS = 1200;
const globalHistory = [];
let nextGlobalMsgId = 1;

// Оставляем только слова, цифры (не длинные), простую пунктуацию и эмодзи.
function sanitizeGlobalText(raw) {
  let t = String(raw == null ? '' : raw).normalize('NFC');
  t = Array.from(t).slice(0, GLOBAL_MAX_LEN * 2).join('');
  t = t
    .replace(/(?:https?:\/\/|www\.)\S+/gi, '')                         // ссылки
    .replace(/\S+@\S+\.\S+/g, '')                                      // e-mail
    .replace(/[\p{L}\p{N}-]+\.(?:com|ru|net|org|io|me|az|info|biz|xyz|ly|gg|tv|co|рф)\b\S*/giu, '') // домены
    .replace(/\+?\d[\d\s().-]{6,}\d/g, '')                             // телефоны
    .replace(/\d{5,}/g, '')                                            // длинные числа
    .replace(/[^\p{L}\p{M}\p{N}\s.,!?:;'"()\-…\p{Extended_Pictographic}\p{Emoji_Modifier}\u200d\ufe0f]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(t).slice(0, GLOBAL_MAX_LEN).join('').trim();
}

function otherGender(g) {
  if (g === 'm') return 'f';
  if (g === 'f') return 'm';
  return null; // "other" играет с кем угодно
}

function ageToleranceFor(session) {
  const waited = (Date.now() - session.queueStartedAt) / 1000;
  // ±2 сразу, ещё +2 за каждые 15 секунд ожидания, потолок ±20
  return Math.min(20, 2 + Math.floor(waited / 15) * 2);
}

function safeSend(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    try { ws.send(JSON.stringify(obj)); } catch (e) { /* ignore */ }
  }
}

function broadcastStats() {
  const perGame = {};
  GAMES.forEach(g => { perGame[g.id] = queues.get(g.id).size; });
  const stats = { type: 'stats', online: clients.size, perGame };
  for (const ws of clients.keys()) safeSend(ws, stats);
}

function publicProfile(session) {
  return { nick: session.nick, gender: session.gender, age: session.age };
}

function tryMatch(gameId) {
  const q = queues.get(gameId);
  if (!q || q.size < 2) return;
  const list = Array.from(q);
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.pendingProposal) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.pendingProposal) continue;
      if (a.avoid.has(b.id) || b.avoid.has(a.id)) continue;
      const need = otherGender(a.gender);
      if (need && b.gender !== need) continue;
      const needB = otherGender(b.gender);
      if (needB && a.gender !== needB) continue;
      const tol = Math.min(ageToleranceFor(a), ageToleranceFor(b));
      if (Math.abs(a.age - b.age) > tol) continue;

      // нашли пару — предлагаем обоим, ждём подтверждения
      a.pendingProposal = b.id;
      b.pendingProposal = a.id;
      a.acceptedProposal = null;
      b.acceptedProposal = null;
      safeSend(a.ws, { type: 'match_proposed', opponent: publicProfile(b) });
      safeSend(b.ws, { type: 'match_proposed', opponent: publicProfile(a) });
      return; // по одной паре за раз, дальше по таймеру/событию
    }
  }
}

function tryMatchAll() {
  for (const g of GAMES) tryMatch(g.id);
}

function findSessionById(gameId, id) {
  const q = queues.get(gameId);
  if (!q) return null;
  for (const s of q) if (s.id === id) return s;
  return null;
}

function leaveQueue(session, { keepAvoid } = {}) {
  if (!session.game) return;
  const q = queues.get(session.game);
  if (q) q.delete(session);
  if (!keepAvoid) session.game = null;
}

function clearPendingBoth(session, opponentId, gameId) {
  session.pendingProposal = null;
  session.acceptedProposal = null;
  const opp = findSessionById(gameId, opponentId);
  if (opp) { opp.pendingProposal = null; opp.acceptedProposal = null; }
  return opp;
}

function makeRoom(gameId, a, b) {
  const roomId = 'r' + (nextRoomId++);
  queues.get(gameId).delete(a);
  queues.get(gameId).delete(b);
  a.room = roomId; b.room = roomId;
  a.pendingProposal = null; b.pendingProposal = null;
  rooms.set(roomId, { game: gameId, a, b, rematch: new Set() });
  safeSend(a.ws, { type: 'match_confirmed', opponent: publicProfile(b), youAre: 'A', game: gameId });
  safeSend(b.ws, { type: 'match_confirmed', opponent: publicProfile(a), youAre: 'B', game: gameId });
}

function closeRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  rooms.delete(roomId);
  for (const s of [room.a, room.b]) {
    if (s) { s.room = null; }
  }
}

wss.on('connection', (ws) => {
  const session = {
    id: nextId++,
    ws,
    ready: false,
    nick: '',
    gender: null,
    age: null,
    game: null,
    room: null,
    pendingProposal: null,
    acceptedProposal: null,
    queueStartedAt: 0,
    lastGlobalAt: 0,
    avoid: new Set(), // id соперников, которых этот игрок отклонил (не предлагать снова пока не закроет вкладку)
  };
  clients.set(ws, session);
  broadcastStats();

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
    if (!msg || typeof msg.type !== 'string') return;

    switch (msg.type) {
      case 'hello': {
        if (session.ready) return;
        const nick = String(msg.nick || '').slice(0, 20).trim() || 'Игрок';
        const gender = ['m', 'f', 'o'].includes(msg.gender) ? msg.gender : 'o';
        let age = parseInt(msg.age, 10);
        if (!Number.isFinite(age)) age = 25;
        age = Math.max(13, Math.min(99, age));
        session.nick = nick;
        session.gender = gender;
        session.age = age;
        session.ready = true;
        safeSend(ws, { type: 'hello_ok', id: session.id });
        safeSend(ws, { type: 'global_history', messages: globalHistory });
        break;
      }

      case 'queue': {
        if (!session.ready) return;
        if (!GAME_IDS.has(msg.game)) return;
        if (session.room) return;
        if (session.game) leaveQueue(session);
        session.game = msg.game;
        session.queueStartedAt = Date.now();
        queues.get(msg.game).add(session);
        broadcastStats();
        tryMatch(msg.game);
        break;
      }

      case 'leave_queue': {
        if (session.pendingProposal && session.game) {
          const opp = clearPendingBoth(session, session.pendingProposal, session.game);
          if (opp) safeSend(opp.ws, { type: 'match_declined' });
        }
        leaveQueue(session);
        broadcastStats();
        break;
      }

      case 'match_response': {
        const gameId = session.game;
        const oppId = session.pendingProposal;
        if (!gameId || !oppId) return;
        const opp = findSessionById(gameId, oppId);
        if (!opp) { session.pendingProposal = null; session.acceptedProposal = null; break; }

        if (!msg.accept) {
          session.avoid.add(opp.id);
          session.pendingProposal = null; session.acceptedProposal = null;
          opp.pendingProposal = null; opp.acceptedProposal = null;
          safeSend(opp.ws, { type: 'match_declined' });
          // и себе тоже "declined", чтобы фронт вернулся в очередь
          safeSend(ws, { type: 'match_declined' });
          break;
        }

        session.acceptedProposal = oppId;
        if (opp.acceptedProposal === session.id) {
          // оба согласны
          session.acceptedProposal = null;
          opp.acceptedProposal = null;
          makeRoom(gameId, session, opp);
        }
        break;
      }

      case 'game_move': {
        const room = session.room && rooms.get(session.room);
        if (!room) return;
        const opp = room.a === session ? room.b : room.a;
        safeSend(opp.ws, { type: 'opponent_move', payload: msg.payload });
        break;
      }

      case 'chat': { // личный чат в комнате
        const room = session.room && rooms.get(session.room);
        if (!room) return;
        let text = String(msg.text || '').slice(0, 300);
        text = text.replace(/https?:\/\/\S+/gi, '').replace(/\b\S+\.(com|ru|net|org|io|me|рф)\S*/gi, '');
        text = text.trim();
        if (!text) return;
        const opp = room.a === session ? room.b : room.a;
        safeSend(opp.ws, { type: 'opponent_chat', text });
        break;
      }

      case 'global_chat': { // общий чат для всех
        if (!session.ready) return;
        const now = Date.now();
        if (now - session.lastGlobalAt < GLOBAL_MIN_INTERVAL_MS) {
          safeSend(ws, { type: 'global_error', reason: 'slow' });
          return;
        }
        const text = sanitizeGlobalText(msg.text);
        if (!text) {
          safeSend(ws, { type: 'global_error', reason: 'rejected' });
          return;
        }
        session.lastGlobalAt = now;
        const entry = { id: nextGlobalMsgId++, from: session.id, nick: session.nick, gender: session.gender, text, ts: now };
        globalHistory.push(entry);
        if (globalHistory.length > GLOBAL_HISTORY_LIMIT) globalHistory.shift();
        const out = { type: 'global_chat', message: entry };
        for (const [cws, s] of clients) if (s.ready) safeSend(cws, out);
        break;
      }

      case 'rematch_request': {
        if (!session.room) return;
        const room = rooms.get(session.room);
        if (!room) return;
        room.rematch.add(session.id);
        const opp = room.a === session ? room.b : room.a;
        if (room.rematch.size >= 2) {
          room.rematch.clear();
          safeSend(room.a.ws, { type: 'rematch_start' });
          safeSend(room.b.ws, { type: 'rematch_start' });
        } else if (opp) {
          safeSend(opp.ws, { type: 'rematch_waiting' });
        }
        break;
      }

      case 'leave_room': {
        if (session.room) {
          const room = rooms.get(session.room);
          if (room) {
            room.rematch.clear();
            const opp = room.a === session ? room.b : room.a;
            if (opp) safeSend(opp.ws, { type: 'opponent_left' });
          }
          closeRoom(session.room);
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (session.pendingProposal && session.game) {
      const opp = clearPendingBoth(session, session.pendingProposal, session.game);
      if (opp) safeSend(opp.ws, { type: 'match_declined' });
    }
    if (session.room) {
      const room = rooms.get(session.room);
      if (room) {
        const opp = room.a === session ? room.b : room.a;
        if (opp) safeSend(opp.ws, { type: 'opponent_left' });
      }
      closeRoom(session.room);
    }
    leaveQueue(session);
    clients.delete(ws);
    broadcastStats();
  });
});

setInterval(() => {
  broadcastStats();
  tryMatchAll();
}, 3000);

// Слушаем 0.0.0.0 — на Render и большинстве PaaS прокси стучится снаружи контейнера.
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on 0.0.0.0:${PORT}`);
});
