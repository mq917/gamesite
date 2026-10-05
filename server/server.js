/**
 * "Битва полов" — игровой сервер.
 * Задача сервера ПРЕДЕЛЬНО узкая и намеренно "тупая":
 *   1. Держать список игр и счётчики онлайн/в очереди.
 *   2. Подбирать пару игроков (тот же game, противоположный пол,
 *      разница в возрасте в пределах текущего допуска).
 *   3. Спросить обоих "согласны сыграть?" и, если оба да — свести их в комнату.
 *   4. Внутри комнаты — тупо пересылать JSON-сообщения (ходы, чат) от одного к другому.
 *
 * Никаких данных нигде не сохраняется: ни на диск, ни в БД. Всё живёт только
 * в оперативной памяти процесса и исчезает при разрыве соединения (закрытии вкладки).
 * Вся игровая логика (правила, подсветка ходов, проверка победы) — на фронтенде,
 * сервер её не понимает и не проверяет.
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
  { id: 'reversi', name: 'Реверси' },
  { id: 'gomoku', name: 'Пять в ряд' },
  { id: 'backgammon', name: 'Нарды' },
  { id: 'battleship', name: 'Морской бой' },
  { id: 'dots', name: 'Точки и квадраты' },
  { id: 'uno', name: 'Цветные карты' },
  { id: 'hangman', name: 'Виселица' },
];
const GAME_IDS = new Set(GAMES.map(g => g.id));

// ---- статика фронтенда ----
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = http.createServer(async (req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);

  // Проверка английского слова для «Виселицы». Игровой процесс от этого
  // сервиса не зависит: словарь используется только при вводе слова.
  if (reqPath === '/api/check-word') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const word = new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams.get('word') || '';
    if (!/^[a-z]+$/i.test(word) || word.length < 2 || word.length > 24) {
      res.writeHead(200); return res.end(JSON.stringify({ valid:false }));
    }
    try {
      const r = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word));
      res.writeHead(200); return res.end(JSON.stringify({ valid:r.ok }));
    } catch (e) {
      res.writeHead(200); return res.end(JSON.stringify({ valid:null }));
    }
  }
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, reqPath);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
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
  const opp = findSessionById(gameId, opponentId);
  if (opp) opp.pendingProposal = null;
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

function closeRoom(roomId, reasonForOther) {
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
    nick: '',
    gender: null,
    age: null,
    game: null,
    room: null,
    pendingProposal: null,
    queueStartedAt: 0,
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
        const nick = String(msg.nick || '').slice(0, 20).trim() || 'Игрок';
        const gender = ['m', 'f', 'o'].includes(msg.gender) ? msg.gender : 'o';
        let age = parseInt(msg.age, 10);
        if (!Number.isFinite(age)) age = 25;
        age = Math.max(13, Math.min(99, age));
        session.nick = nick;
        session.gender = gender;
        session.age = age;
        safeSend(ws, { type: 'hello_ok' });
        break;
      }

      case 'queue': {
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
        if (!opp) { session.pendingProposal = null; break; }

        if (!msg.accept) {
          session.avoid.add(opp.id);
          session.pendingProposal = null;
          opp.pendingProposal = null;
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

      case 'chat': {
        const room = session.room && rooms.get(session.room);
        if (!room) return;
        let text = String(msg.text || '').slice(0, 300);
        // только текст/эмодзи, никаких ссылок
        text = text.replace(/https?:\/\/\S+/gi, '').replace(/\b\S+\.(com|ru|net|org|io|me|рф)\S*/gi, '');
        text = text.trim();
        if (!text) return;
        const opp = room.a === session ? room.b : room.a;
        safeSend(opp.ws, { type: 'opponent_chat', text });
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

// Явно слушаем 0.0.0.0 — на Render (и большинстве PaaS) прокси стучится
// снаружи контейнера, и если слушать только 127.0.0.1, снаружи сервис
// недоступен и деплой зависает на "Application loading...".
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on 0.0.0.0:${PORT}`);
});
