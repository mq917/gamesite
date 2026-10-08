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
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

// WebSocket reliability: transport heartbeat + resumable sessions.
const HEARTBEAT_INTERVAL_MS = 15000;
const RESUME_GRACE_MS = 45000;
const ROOM_EVENT_LIMIT = 2000;
const MAX_WS_PAYLOAD = 64 * 1024;

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

const wss = new WebSocketServer({ server, maxPayload: MAX_WS_PAYLOAD });

// ---- состояние в памяти ----
let nextId = 1;
const clients = new Map(); // только реально подключённые ws -> session
const sessionsByResumeToken = new Map(); // token -> session во время grace-window
const queues = new Map();  // gameId -> Set(session)
GAMES.forEach(g => queues.set(g.id, new Set()));
const rooms = new Map();   // roomId -> {a, b, game, rematch, round, seq, events}
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
  if (!ws || ws.readyState !== ws.OPEN) return false;
  try {
    ws.send(JSON.stringify(obj));
    return true;
  } catch (e) {
    // Ошибка конкретного клиента не должна превращаться в падение процесса.
    try { ws.terminate(); } catch (_) {}
    return false;
  }
}

function isConnected(session) {
  return !!(session && session.ws && session.ws.readyState === session.ws.OPEN);
}

function countConnectedInQueue(q) {
  let n = 0;
  for (const s of q || []) if (s.ready && isConnected(s)) n++;
  return n;
}

function broadcastStats() {
  const perGame = {};
  GAMES.forEach(g => { perGame[g.id] = countConnectedInQueue(queues.get(g.id)); });
  const stats = { type: 'stats', online: clients.size, perGame };
  for (const ws of clients.keys()) safeSend(ws, stats);
}

function createResumeToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function rememberRoomEvent(room, recipient, type, payload) {
  const event = { seq: ++room.seq, round: room.round, recipientId: recipient.id, type, payload };
  room.events.push(event);
  if (room.events.length > ROOM_EVENT_LIMIT) {
    room.events.splice(0, room.events.length - ROOM_EVENT_LIMIT);
  }
  if (isConnected(recipient)) {
    safeSend(recipient.ws, { type, ...payload, seq: event.seq, round: event.round });
  }
}

function replayRoomEvents(room, session, afterSeq) {
  const minSeq = Number.isFinite(afterSeq) ? afterSeq : 0;
  for (const event of room.events) {
    if (event.round !== room.round || event.recipientId !== session.id || event.seq <= minSeq) continue;
    if (isConnected(session)) {
      safeSend(session.ws, { type: event.type, ...event.payload, seq: event.seq, round: event.round });
    }
  }
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
    if (a.pendingProposal || !a.ready || !isConnected(a)) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.pendingProposal || !b.ready || !isConnected(b)) continue;
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
  rooms.set(roomId, { game: gameId, a, b, rematch: new Set(), round: 1, seq: 0, events: [] });
  safeSend(a.ws, { type: 'match_confirmed', opponent: publicProfile(b), youAre: 'A', game: gameId });
  safeSend(b.ws, { type: 'match_confirmed', opponent: publicProfile(a), youAre: 'B', game: gameId });
}

function closeRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  rooms.delete(roomId);
  for (const s of [room.a, room.b]) {
    if (s) {
      s.room = null;
      if (s.roomExpiryTimer) {
        clearTimeout(s.roomExpiryTimer);
        s.roomExpiryTimer = null;
      }
    }
  }
}

function scheduleRoomExpiry(session) {
  if (!session.room || session.roomExpiryTimer) return;
  const roomId = session.room;
  session.roomExpiryTimer = setTimeout(() => {
    session.roomExpiryTimer = null;
    if (session.ws || session.room !== roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    const opp = room.a === session ? room.b : room.a;
    if (opp && isConnected(opp)) safeSend(opp.ws, { type: 'opponent_left' });
    closeRoom(roomId);
    leaveQueue(session);
    sessionsByResumeToken.delete(session.resumeToken);
  }, RESUME_GRACE_MS);
}

function handleDisconnect(session, ws) {
  if (!session || session.ws !== ws) return;
  clients.delete(ws);
  session.ws = null;
  session.disconnectedAt = Date.now();
  if (!session.ready) {
    sessionsByResumeToken.delete(session.resumeToken);
    return;
  }

  if (session.pendingProposal && session.game) {
    const opp = clearPendingBoth(session, session.pendingProposal, session.game);
    if (opp && isConnected(opp)) safeSend(opp.ws, { type: 'match_declined' });
  }

  if (session.room) {
    const room = rooms.get(session.room);
    if (room) {
      const opp = room.a === session ? room.b : room.a;
      if (opp && isConnected(opp)) {
        safeSend(opp.ws, { type: 'opponent_disconnected', graceMs: RESUME_GRACE_MS });
      }
      scheduleRoomExpiry(session);
    }
  }

  if (!session.room && session.game) {
    if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
    session.reconnectTimer = setTimeout(() => {
      if (session.ws) return;
      leaveQueue(session);
      sessionsByResumeToken.delete(session.resumeToken);
      session.reconnectTimer = null;
      broadcastStats();
      tryMatchAll();
    }, RESUME_GRACE_MS);
  }

  broadcastStats();
}

function restoreSession(ws, token) {
  if (!token || typeof token !== 'string') return null;
  const session = sessionsByResumeToken.get(token);
  if (!session || !session.ready) return null;
  if (session.ws && session.ws !== ws) {
    try { session.ws.close(4001, 'Session resumed elsewhere'); } catch (_) {}
    clients.delete(session.ws);
  }
  session.ws = ws;
  session.disconnectedAt = 0;
  if (session.reconnectTimer) { clearTimeout(session.reconnectTimer); session.reconnectTimer = null; }
  if (session.roomExpiryTimer) { clearTimeout(session.roomExpiryTimer); session.roomExpiryTimer = null; }
  clients.set(ws, session);
  return session;
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  let session = null;
  try {
    session = {
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
      avoid: new Set(),
      resumeToken: createResumeToken(),
      reconnectTimer: null,
      roomExpiryTimer: null,
      disconnectedAt: 0,
    };
    clients.set(ws, session);
    sessionsByResumeToken.set(session.resumeToken, session);
    broadcastStats();
  } catch (err) {
    console.error('Failed to initialize WebSocket session:', err);
    try { ws.close(1011, 'Server error'); } catch (_) {}
    return;
  }

  ws.on('error', (err) => {
    // Prevent an unhandled socket 'error' event from terminating the Node.js process.
    console.warn('WebSocket client error:', err && err.message ? err.message : err);
  });

  ws.on('message', (raw) => {
    try {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
      if (!msg || typeof msg.type !== 'string') return;

      switch (msg.type) {
        case 'heartbeat': {
          safeSend(ws, { type: 'heartbeat_ack', t: msg.t || Date.now() });
          break;
        }

        case 'hello': {
          if (session.ready) return;

          const requestedToken = typeof msg.resumeToken === 'string' ? msg.resumeToken : '';
          const previousTempToken = session.resumeToken;
          const resumed = restoreSession(ws, requestedToken);
          if (resumed) {
            sessionsByResumeToken.delete(previousTempToken);
            session = resumed;
            safeSend(ws, {
              type: 'hello_ok',
              id: session.id,
              resumeToken: session.resumeToken,
              resumed: true,
              room: session.room || null,
              game: session.game || null,
            });
            safeSend(ws, { type: 'global_history', messages: globalHistory });

            if (session.room) {
              const room = rooms.get(session.room);
              if (room) {
                const opp = room.a === session ? room.b : room.a;
                safeSend(ws, {
                  type: 'room_resumed',
                  game: room.game,
                  youAre: room.a === session ? 'A' : 'B',
                  opponent: publicProfile(opp),
                  round: room.round,
                });
                if (opp && isConnected(opp)) safeSend(opp.ws, { type: 'opponent_reconnected' });
                const lastSeq = Number.isFinite(Number(msg.lastRoomSeq)) ? Number(msg.lastRoomSeq) : 0;
                replayRoomEvents(room, session, lastSeq);
              }
            } else if (session.game) {
              safeSend(ws, { type: 'queue_resumed', game: session.game });
              tryMatch(session.game);
            }
            broadcastStats();
            break;
          }

          const nick = String(msg.nick || '').slice(0, 20).trim() || 'Игрок';
          const gender = ['m', 'f', 'o'].includes(msg.gender) ? msg.gender : 'o';
          let age = parseInt(msg.age, 10);
          if (!Number.isFinite(age)) age = 25;
          age = Math.max(13, Math.min(99, age));
          session.nick = nick;
          session.gender = gender;
          session.age = age;
          session.ready = true;
          safeSend(ws, { type: 'hello_ok', id: session.id, resumeToken: session.resumeToken, resumed: false });
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
        if (!room || !room.a || !room.b) return;
        const opp = room.a === session ? room.b : room.a;
        rememberRoomEvent(room, opp, 'opponent_move', { payload: msg.payload });
        break;
      }

      case 'chat': { // личный чат в комнате
        const room = session.room && rooms.get(session.room);
        if (!room || !room.a || !room.b) return;
        let text = String(msg.text || '').slice(0, 300);
        text = text.replace(/https?:\/\/\S+/gi, '').replace(/\b\S+\.(com|ru|net|org|io|me|рф)\S*/gi, '');
        text = text.trim();
        if (!text) return;
        const opp = room.a === session ? room.b : room.a;
        rememberRoomEvent(room, opp, 'opponent_chat', { text });
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
          room.round += 1;
          room.seq = 0;
          room.events = [];
          safeSend(room.a.ws, { type: 'rematch_start', round: room.round });
          safeSend(room.b.ws, { type: 'rematch_start', round: room.round });
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
    } catch (err) {
      console.error('WebSocket message handler error:', err);
      safeSend(ws, { type: 'server_error', reason: 'request_failed' });
    }
  });

  ws.on('close', () => {
    handleDisconnect(session, ws);
  });
});

const heartbeatTimer = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      try { ws.terminate(); } catch (_) {}
      continue;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch (_) {
      try { ws.terminate(); } catch (_) {}
    }
  }
}, HEARTBEAT_INTERVAL_MS);
heartbeatTimer.unref?.();

setInterval(() => {
  broadcastStats();
  tryMatchAll();
}, 3000);

// Слушаем 0.0.0.0 — на Render и большинстве PaaS прокси стучится снаружи контейнера.
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on 0.0.0.0:${PORT}`);
});
