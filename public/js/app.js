(function(){
"use strict";
const T = (key, vars) => window.I18N.t(key, vars);

/* ============ GAMES CATALOG ============ */
const GAME_IDS = ['chess','checkers','tictactoe','battleship'];
const GAME_ICONS = { chess:'♞', checkers:'⛁', tictactoe:'⌗', battleship:'🚢' };
function gameMeta(id){
  return { id, icon: GAME_ICONS[id], name: T('game_'+id+'_name'), desc: T('game_'+id+'_desc') };
}
// личный чат с соперником
const EMOJIS = ['😂','🤣','😎','😜','🔥','💪','👍','👎','😱','🥳','🤯','😢','❤️','🎉','🤔','😏','👀','🙌','💀','😴'];
// общий чат — смешные смайлики
const GLOBAL_EMOJIS = ['😂','🤣','😜','🤪','😎','🥳','🤡','👻','💩','🙈','🙉','🙊','🐸','🦄','🐒','🍕','🍌','🔥','🎉','🤯','😱','🥴','😏','🤓'];

/* ============ STATE ============ */
const state = {
  ws:null,
  connected:false,
  myId:null,
  me:{ nick:'', gender:'o', age:25 },
  currentQueueGame:null,
  waitingSince:0,
  room:null,           // { game, youAre, opponent, opponentLeft }
  gameHandle:null,     // {receiveMove, isOver}
  chatHistory:[],
  resumeToken: sessionStorage.getItem('arena_resume_token') || '',
  roomCursor: 0,
  roomEventBuffer: new Map(),
};

/* ============ DOM SHORTCUTS ============ */
const $ = (id)=>document.getElementById(id);
const els = {
  setupBackdrop:$('setupBackdrop'), nickInput:$('nickInput'), genderSeg:$('genderSeg'),
  ageInput:$('ageInput'), ageLabel:$('ageLabel'), setupContinue:$('setupContinue'),
  lobby:$('lobby'), gameGrid:$('gameGrid'),
  onlineCount:$('onlineCount'), themeToggle:$('themeToggle'), langToggle:$('langToggle'),
  waitingBackdrop:$('waitingBackdrop'), waitingTitle:$('waitingTitle'), waitingSub:$('waitingSub'),
  waitingCount:$('waitingCount'), waitingTolerance:$('waitingTolerance'), cancelQueue:$('cancelQueue'),
  proposalBackdrop:$('proposalBackdrop'), oppAvatar:$('oppAvatar'), oppName:$('oppName'), oppMeta:$('oppMeta'),
  acceptMatch:$('acceptMatch'), declineMatch:$('declineMatch'),
  room:$('room'), vsYou:$('vsYou'), vsOpp:$('vsOpp'), roomGameName:$('roomGameName'),
  boardWrap:$('boardWrap'), boardStatus:$('boardStatus'), leaveRoom:$('leaveRoom'),
  chatLog:$('chatLog'), chatForm:$('chatForm'), chatInput:$('chatInput'), emojiRow:$('emojiRow'),
  toast:$('toast'), adSlotBottom:$('adSlotBottom'),
  finishActions:$('finishActions'), rematchBtn:$('rematchBtn'), backLobbyBtn:$('backLobbyBtn'),
  gchatFab:$('gchatFab'), gchatBadge:$('gchatBadge'), gchat:$('gchat'), gchatClose:$('gchatClose'),
  gchatOnline:$('gchatOnline'), gchatLog:$('gchatLog'), gchatEmpty:$('gchatEmpty'),
  gchatEmoji:$('gchatEmoji'), gchatForm:$('gchatForm'), gchatInput:$('gchatInput'),
};

/* ============ TOAST ============ */
let toastTimer=null;
function toast(msg){
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>els.toast.classList.remove('show'), 2600);
}

/* ============ THEME ============ */
function applyTheme(t){
  if(t) document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
  els.themeToggle.textContent = (t==='dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches)) ? '☀️' : '🌙';
}
(function initTheme(){
  const saved = localStorage.getItem('bos_theme');
  applyTheme(saved);
  els.themeToggle.addEventListener('click', ()=>{
    const cur = document.documentElement.getAttribute('data-theme') ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    localStorage.setItem('bos_theme', next);
    applyTheme(next);
  });
})();

/* ============ LANGUAGE ============ */
function refreshLangButton(){
  els.langToggle.setAttribute('data-active', window.I18N.getLang());
}
(function initLang(){
  refreshLangButton();
  els.langToggle.addEventListener('click', ()=>{
    const next = ({en:'ru',ru:'az',az:'en'})[window.I18N.getLang()] || 'en';
    window.I18N.setLang(next);
  });
  window.I18N.onChange(()=>{
    refreshLangButton();
    renderLobby();
    refreshDynamicTexts();
  });
})();

// перерисовывает те тексты, что не покрываются data-i18n (собраны из переменных)
function refreshDynamicTexts(){
  if(state.currentQueueGame && !els.waitingBackdrop.hidden){
    showWaiting(state.currentQueueGame, true);
  }
  if(state.room && !els.room.hidden){
    els.vsYou.textContent = state.me.nick + T('you_suffix');
    els.roomGameName.textContent = gameMeta(state.room.game).name;
    if(!els.finishActions.hidden) showFinishActions();
  }
  updateGlobalOnline();
}

/* ============ SETUP MODAL ============ */
let selectedGender = null;
els.genderSeg.addEventListener('click', (e)=>{
  const btn = e.target.closest('button'); if(!btn) return;
  [...els.genderSeg.children].forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  selectedGender = btn.dataset.val;
  checkSetupValid();
});
els.ageInput.addEventListener('input', ()=>{ els.ageLabel.textContent = els.ageInput.value; });
els.nickInput.addEventListener('input', checkSetupValid);
function checkSetupValid(){
  els.setupContinue.disabled = !(els.nickInput.value.trim().length>0 && selectedGender);
}
checkSetupValid();

els.setupContinue.addEventListener('click', ()=>{
  state.me.nick = els.nickInput.value.trim().slice(0,20) || 'Player';
  state.me.gender = selectedGender;
  state.me.age = parseInt(els.ageInput.value,10);
  els.setupBackdrop.hidden = true;
  els.lobby.hidden = false;
  els.gchatFab.hidden = false;
  connect();
  startControlSync();
});

/* ============ LOBBY RENDER ============ */
const gStats = {};
function renderLobby(){
  els.gameGrid.innerHTML = '';
  GAME_IDS.forEach(id=>{
    const g = gameMeta(id);
    const card = document.createElement('button');
    card.className = 'game-card';
    card.innerHTML = `
      <div class="g-icon">${g.icon}</div>
      <div class="g-name">${g.name}</div>
      <div class="g-stats">
        <span><b class="w-${g.id}">${gStats[g.id]||0}</b> ${T('stats_waiting')}</span>
      </div>`;
    card.addEventListener('click', ()=>startQueue(g.id));
    els.gameGrid.appendChild(card);
  });
}
renderLobby();

document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState === 'visible'){
    if(!state.ws || state.ws.readyState === WebSocket.CLOSED) connect();
    runControlSync();
  }
});

let onlineNow = 0;
function updateStatsUI(stats){
  onlineNow = stats.online;
  els.onlineCount.textContent = stats.online;
  updateGlobalOnline();
  Object.keys(stats.perGame||{}).forEach(gid=>{
    gStats[gid] = stats.perGame[gid];
    const el = els.gameGrid.querySelector('.w-'+gid);
    if(el) el.textContent = stats.perGame[gid];
    if(state.currentQueueGame === gid) els.waitingCount.textContent = stats.perGame[gid];
  });
}

/* ============ WEBSOCKET ============ */
const WS_RECONNECT_BASE_MS = 1000;
const WS_RECONNECT_MAX_MS = 10000;
const WS_HEARTBEAT_MS = 15000;
const WS_WATCHDOG_MS = 45000;
let reconnectTimer = null;
let reconnectAttempt = 0;
let heartbeatTimer = null;
let watchdogTimer = null;
let syncTimer = null;
let syncInFlight = false;
let lastSocketActivity = 0;
let hadConnectionBefore = false;
let reconnectToastShown = false;

function wsUrl(){
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return proto + '//' + location.host;
}

function persistResumeState(){
  try{
    if(state.resumeToken) sessionStorage.setItem('arena_resume_token', state.resumeToken);
  }catch(e){}
}

function stopSocketTimers(){
  clearInterval(heartbeatTimer);
  clearInterval(watchdogTimer);
  heartbeatTimer = null;
  watchdogTimer = null;
}

function startSocketTimers(ws){
  stopSocketTimers();
  heartbeatTimer = setInterval(()=>{
    if(state.ws !== ws || ws.readyState !== WebSocket.OPEN) return;
    send({type:'heartbeat', t:Date.now()});
  }, WS_HEARTBEAT_MS);
  watchdogTimer = setInterval(()=>{
    if(state.ws !== ws || ws.readyState !== WebSocket.OPEN) return;
    if(Date.now() - lastSocketActivity > WS_WATCHDOG_MS){
      try{ ws.close(); }catch(e){}
    }
  }, 5000);
}

function scheduleReconnect(){
  if(reconnectTimer) return;
  const delay = Math.min(WS_RECONNECT_MAX_MS, WS_RECONNECT_BASE_MS * Math.pow(2, Math.min(reconnectAttempt, 4)));
  reconnectAttempt++;
  reconnectTimer = setTimeout(()=>{
    reconnectTimer = null;
    connect();
  }, delay);
}

function connect(){
  if(state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) return;
  let ws;
  try{ ws = new WebSocket(wsUrl()); }catch(e){ scheduleReconnect(); return; }
  state.ws = ws;

  ws.addEventListener('open', ()=>{
    if(state.ws !== ws) return;
    state.connected = true;
    hadConnectionBefore = true;
    reconnectAttempt = 0;
    reconnectToastShown = false;
    lastSocketActivity = Date.now();
    startSocketTimers(ws);
    send({
      type:'hello',
      nick:state.me.nick,
      gender:state.me.gender,
      age:state.me.age,
      resumeToken:state.resumeToken || '',
      lastRoomCursor:state.roomCursor || 0,
    });
  });

  ws.addEventListener('close', ()=>{
    stopSocketTimers();
    if(state.ws !== ws) return;
    state.ws = null;
    state.connected = false;
    if(hadConnectionBefore && !reconnectToastShown){
      toast(T('connection_lost_toast'));
      reconnectToastShown = true;
    }
    scheduleReconnect();
  });

  ws.addEventListener('error', ()=>{
    // close последует автоматически, отдельный error не показываем, чтобы не спамить UI.
  });

  ws.addEventListener('message', (ev)=>{
    if(state.ws !== ws) return;
    lastSocketActivity = Date.now();
    let msg; try{ msg = JSON.parse(ev.data); }catch(e){ return; }
    handleServerMessage(msg);
  });
}

function send(obj){
  if(state.ws && state.ws.readyState === WebSocket.OPEN){
    try{ state.ws.send(JSON.stringify(obj)); return true; }catch(e){}
  }
  return false;
}

let waitingTimerInterval=null;
const ROOM_SYNC_INTERVAL_MS = 3000;
const ROOM_SYNC_TIMEOUT_MS = 2500;

function resetRoomEventCursor(){
  state.roomCursor = 0;
  state.roomEventBuffer.clear();
}

function acceptRoomEvent(msg){
  if(!state.room || !msg || msg.round !== state.room.round) return;
  const cursor = Number(msg.recipientSeq);
  if(!Number.isFinite(cursor) || cursor <= state.roomCursor) return;
  state.roomEventBuffer.set(cursor, msg);
  flushRoomEventBuffer();
}

function flushRoomEventBuffer(){
  if(!state.room) return;
  while(state.roomEventBuffer.has(state.roomCursor + 1)){
    const nextCursor = state.roomCursor + 1;
    const msg = state.roomEventBuffer.get(nextCursor);
    state.roomEventBuffer.delete(nextCursor);
    applyRoomEvent(msg);
    state.roomCursor = nextCursor;
  }
}

function applyRoomEvent(msg){
  switch(msg.type){
    case 'opponent_move':
      if(state.gameHandle && state.gameHandle.receiveMove) state.gameHandle.receiveMove(msg.payload);
      break;
    case 'opponent_chat':
      addChatMsg('them', msg.text, msg.senderNick || (state.room?.opponent?.nick || ''));
      break;
  }
}

function updateRoomFromSync(roomInfo){
  if(!roomInfo) return;
  if(!state.room || els.room.hidden || state.room.game !== roomInfo.game){
    enterRoom(roomInfo.game, roomInfo.youAre, roomInfo.opponent, roomInfo.round);
  }else if(roomInfo.round && state.room.round !== roomInfo.round){
    state.room.youAre = roomInfo.youAre || state.room.youAre;
    state.room.opponent = roomInfo.opponent || state.room.opponent;
    state.room.round = roomInfo.round;
    resetRoomEventCursor();
    restartCurrentGame();
  }
  if(state.room){
    const wasDisconnected = !!state.room.opponentDisconnected;
    const isDisconnected = roomInfo.opponentConnected === false;
    state.room.opponentDisconnected = isDisconnected;
    if(wasDisconnected && !isDisconnected) addChatMsg('sys', T('opponent_connection_restored'));
    if(!wasDisconnected && isDisconnected) addChatMsg('sys', T('opponent_connection_lost'));
  }
}

async function runControlSync(){
  if(syncInFlight || !state.resumeToken) return;
  syncInFlight = true;
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(), ROOM_SYNC_TIMEOUT_MS);
  try{
    const res = await fetch('/api/sync', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      cache:'no-store',
      body:JSON.stringify({
        resumeToken:state.resumeToken,
        lastRoomCursor:state.roomCursor || 0,
      }),
      signal:controller.signal,
    });
    if(!res.ok) return;
    const data = await res.json();
    if(!data || data.ok === false) return;

    if(data.room){
      updateRoomFromSync(data.room);
      (data.events || []).forEach(acceptRoomEvent);
      flushRoomEventBuffer();
    }else if(state.currentQueueGame && data.queueGame === state.currentQueueGame && !state.room){
      if(data.pendingOpponent && els.proposalBackdrop.hidden) showProposal(data.pendingOpponent);
    }
  }catch(e){
    // Контрольный канал best-effort; основной WebSocket продолжает reconnect.
  }finally{
    clearTimeout(timeout);
    syncInFlight = false;
  }
}

function startControlSync(){
  clearInterval(syncTimer);
  syncTimer = setInterval(runControlSync, ROOM_SYNC_INTERVAL_MS);
  runControlSync();
}

function stopControlSync(){
  clearInterval(syncTimer);
  syncTimer = null;
}

function handleServerMessage(msg){
  switch(msg.type){
    case 'hello_ok':
      state.myId = msg.id;
      if(msg.resumeToken){ state.resumeToken = msg.resumeToken; persistResumeState(); runControlSync(); }
      if(msg.resumed && state.room && !els.room.hidden){
        toast(T('connection_restored_toast'));
      }
      break;
    case 'heartbeat_ack': break;
    case 'queue_resumed':
      state.currentQueueGame = msg.game || state.currentQueueGame;
      if(state.currentQueueGame && !state.room){ showWaiting(state.currentQueueGame); }
      break;
    case 'room_resumed': {
      const sameRoom = state.room && state.room.game === msg.game && !els.room.hidden;
      if(!sameRoom){
        enterRoom(msg.game, msg.youAre, msg.opponent, msg.round);
      }else if(msg.round && state.room.round !== msg.round){
        state.room.youAre = msg.youAre || state.room.youAre;
        state.room.opponent = msg.opponent || state.room.opponent;
        state.room.round = msg.round;
        state.room.opponentDisconnected = msg.opponentConnected === false;
        resetRoomEventCursor();
        restartCurrentGame();
      }else if(state.room){
        state.room.opponentDisconnected = msg.opponentConnected === false;
      }
      break;
    }
    case 'opponent_disconnected':
      if(state.room){
        state.room.opponentDisconnected = true;
        addChatMsg('sys', T('opponent_connection_lost'));
      }
      break;
    case 'opponent_reconnected':
      if(state.room){
        state.room.opponentDisconnected = false;
        addChatMsg('sys', T('opponent_connection_restored'));
        toast(T('connection_restored_toast'));
      }
      break;
    case 'server_error':
      toast(T('server_error_toast'));
      break;
    case 'stats': updateStatsUI(msg); break;

    case 'global_history': {
      els.gchatLog.querySelectorAll('.gmsg').forEach(n=>n.remove());
      (msg.messages||[]).forEach(m=>addGlobalMsg(m, true));
      break;
    }
    case 'global_chat': addGlobalMsg(msg.message, false); break;
    case 'global_error': {
      toast(msg.reason==='slow' ? T('gchat_slow') : T('gchat_rejected'));
      break;
    }

    case 'match_proposed': {
      showProposal(msg.opponent);
      break;
    }
    case 'match_declined': {
      els.proposalBackdrop.hidden = true;
      if(state.currentQueueGame){
        showWaiting(state.currentQueueGame);
        toast(T('opponent_declined_toast'));
      }
      break;
    }
    case 'match_confirmed': {
      enterRoom(msg.game, msg.youAre, msg.opponent);
      break;
    }
    case 'opponent_move':
    case 'opponent_chat':
      acceptRoomEvent(msg);
      break;
    case 'rematch_waiting': {
      toast(T('rematch_opponent'));
      break;
    }
    case 'rematch_start': {
      if(!state.room) break;
      rematchRequested=false;
      // в реванше стороны меняются: кто ходил первым, теперь ходит вторым
      state.room.youAre = state.room.youAre==='A' ? 'B' : 'A';
      state.room.round = msg.round || ((state.room.round || 1) + 1);
      resetRoomEventCursor();
      addChatMsg('sys', T('rematch_swapped'));
      restartCurrentGame();
      break;
    }
    case 'opponent_left': {
      if(!state.room) break;
      state.room.opponentLeft = true;
      addChatMsg('sys', T('opponent_left_chat'));
      els.boardStatus.textContent = T('opponent_left_status');
      toast(T('opponent_left_toast'));
      showFinishActions(); // реванша не будет — остаётся только «в меню»
      break;
    }
  }
}

/* ============ QUEUE / WAITING ============ */
function startQueue(gameId){
  state.currentQueueGame = gameId;
  state.waitingSince = Date.now();
  send({ type:'queue', game: gameId });
  showWaiting(gameId);
}
function showWaiting(gameId, keepTitle){
  const g = gameMeta(gameId);
  els.waitingBackdrop.hidden = false;
  if(!keepTitle) els.waitingTitle.textContent = T('waiting_title');
  els.waitingSub.textContent = T('waiting_sub', { game:g.name });
  els.waitingCount.textContent = gStats[gameId] || 0;
  clearInterval(waitingTimerInterval);
  updateTolerance();
  waitingTimerInterval = setInterval(updateTolerance, 1000);
}
function updateTolerance(){
  const waited = (Date.now() - state.waitingSince)/1000;
  const tol = Math.min(20, 2 + Math.floor(waited/15)*2);
  els.waitingTolerance.textContent = '±'+tol;
}
els.cancelQueue.addEventListener('click', ()=>{
  send({ type:'leave_queue' });
  state.currentQueueGame = null;
  clearInterval(waitingTimerInterval);
  els.waitingBackdrop.hidden = true;
});

/* ============ PROPOSAL ============ */
function genderWord(g){ return g==='m' ? T('gender_short_m') : g==='f' ? T('gender_short_f') : T('gender_short_o'); }
function showProposal(opp){
  els.waitingBackdrop.hidden = true;
  els.proposalBackdrop.hidden = false;
  els.oppAvatar.textContent = (opp.nick||'?').slice(0,1).toUpperCase();
  els.oppName.textContent = opp.nick;
  els.oppMeta.textContent = `${genderWord(opp.gender)} · ${T('years_old',{age:opp.age})}`;
}
els.acceptMatch.addEventListener('click', ()=>{
  send({ type:'match_response', accept:true });
  els.proposalBackdrop.hidden = true;
  els.waitingTitle.textContent = T('waiting_title_confirm');
  els.waitingBackdrop.hidden = false;
});
els.declineMatch.addEventListener('click', ()=>{
  send({ type:'match_response', accept:false });
  els.proposalBackdrop.hidden = true;
  showWaiting(state.currentQueueGame);
});

/* ============ FINISH / REMATCH ============ */
let finishPoll=null;
let rematchRequested=false;

function showFinishActions(){
  if(!state.room) return;
  els.finishActions.hidden = false;
  if(state.room.opponentLeft){
    // соперник ушёл — реванш невозможен
    els.rematchBtn.hidden = true;
    return;
  }
  els.rematchBtn.hidden = false;
  if(rematchRequested){
    els.rematchBtn.disabled = true;
    els.rematchBtn.textContent = T('rematch_waiting');
  } else {
    els.rematchBtn.disabled = false;
    els.rematchBtn.textContent = T('rematch');
  }
}
function hideFinishActions(){
  els.finishActions.hidden = true;
  els.rematchBtn.hidden = false;
  els.rematchBtn.disabled = false;
  rematchRequested=false;
  els.rematchBtn.textContent = T('rematch');
}
function pollGameFinished(){
  if(!state.room || !state.gameHandle) return;
  if(typeof state.gameHandle.isOver === 'function' && state.gameHandle.isOver()) showFinishActions();
}
function mountGame(){
  const {game,youAre} = state.room;
  const factory = window.GAME_MODULES && window.GAME_MODULES[game];
  if(!factory){ els.boardWrap.textContent = 'This game is still being prepared.'; return; }
  state.gameHandle = factory({
    container: els.boardWrap,
    youAre,
    sendMove: (payload)=>send({ type:'game_move', payload }),
    setStatus: (text)=>{ els.boardStatus.textContent = text; },
    onGameOver: showFinishActions
  });
}
function restartCurrentGame(){
  if(!state.room) return;
  hideFinishActions();
  els.boardWrap.innerHTML='';
  els.boardStatus.textContent=T('rematch_starting');
  mountGame();
}
els.rematchBtn.addEventListener('click',()=>{
  if(!state.room || state.room.opponentLeft || rematchRequested) return;
  rematchRequested=true;
  els.rematchBtn.disabled=true;
  els.rematchBtn.textContent=T('rematch_waiting');
  send({type:'rematch_request'});
});
els.backLobbyBtn.addEventListener('click',()=>{
  if(state.room) send({type:'leave_room'});
  backToLobby();
});

/* ============ ROOM ============ */
function enterRoom(gameId, youAre, opponent, round){
  clearInterval(waitingTimerInterval);
  clearInterval(finishPoll);
  hideFinishActions();
  els.waitingBackdrop.hidden = true;
  els.proposalBackdrop.hidden = true;
  state.currentQueueGame = null;
  state.room = { game:gameId, youAre, opponent, opponentLeft:false, opponentDisconnected:false, round:round || 1 };
  resetRoomEventCursor();
  state.chatHistory = [];

  els.lobby.hidden = true;
  els.room.hidden = false;
  els.adSlotBottom.hidden = true;
  els.vsYou.textContent = state.me.nick + T('you_suffix');
  els.vsOpp.textContent = opponent.nick;
  els.roomGameName.textContent = gameMeta(gameId).name;
  els.boardWrap.innerHTML = '';
  els.boardStatus.textContent = '';
  els.chatLog.innerHTML = '';
  addChatMsg('sys', T('opponent_found_chat', { name:opponent.nick }));

  renderEmojiRow(els.emojiRow, EMOJIS, els.chatInput);
  mountGame();
  finishPoll = setInterval(pollGameFinished, 250);
}

els.leaveRoom.addEventListener('click', ()=>{
  send({ type:'leave_room' });
  backToLobby();
});
function backToLobby(){
  clearInterval(finishPoll);
  hideFinishActions();
  state.room = null;
  state.gameHandle = null;
  els.room.hidden = true;
  els.lobby.hidden = false;
  els.adSlotBottom.hidden = false;
}

/* ============ PRIVATE CHAT (с соперником) ============ */
function renderEmojiRow(row, list, input){
  row.innerHTML = '';
  list.forEach(e=>{
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = e;
    b.addEventListener('click', ()=>{
      input.value += e;
      input.focus();
    });
    row.appendChild(b);
  });
}
function addChatMsg(kind, text, senderName){
  const div = document.createElement('div');
  div.className = 'chat-msg ' + kind;
  if(kind === 'sys'){
    div.textContent = text;
  }else{
    const sender = document.createElement('b');
    sender.className = 'chat-sender';
    sender.textContent = senderName || (kind === 'me' ? state.me.nick : (state.room?.opponent?.nick || ''));
    const body = document.createElement('span');
    body.className = 'chat-text';
    body.textContent = text;
    div.appendChild(sender);
    div.appendChild(body);
  }
  els.chatLog.appendChild(div);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
}
els.chatForm.addEventListener('submit', (e)=>{
  e.preventDefault();
  const text = els.chatInput.value.trim();
  if(!text) return;
  const cleaned = text.replace(/https?:\/\/\S+/gi,'').replace(/\b\S+\.(com|ru|net|org|io|me|рф)\S*/gi,'').trim();
  if(!cleaned) return;
  send({ type:'chat', text:cleaned });
  addChatMsg('me', cleaned, state.me.nick);
  els.chatInput.value = '';
});

/* ============ GLOBAL CHAT (для всех на сайте) ============ */
let gchatOpen = false;
let gchatUnread = 0;
renderEmojiRow(els.gchatEmoji, GLOBAL_EMOJIS, els.gchatInput);

function updateGlobalOnline(){
  els.gchatOnline.textContent = onlineNow ? T('gchat_online', { n:onlineNow }) : '';
}
function setGlobalChatOpen(open){
  gchatOpen = open;
  els.gchat.hidden = !open;
  if(open){
    gchatUnread = 0;
    els.gchatBadge.hidden = true;
    els.gchatLog.scrollTop = els.gchatLog.scrollHeight;
    els.gchatInput.focus();
  }
}
els.gchatFab.addEventListener('click', ()=>setGlobalChatOpen(!gchatOpen));
els.gchatClose.addEventListener('click', ()=>setGlobalChatOpen(false));

function addGlobalMsg(m, fromHistory){
  if(!m || typeof m.text !== 'string') return;
  if(els.gchatEmpty.parentNode) els.gchatEmpty.remove();
  const nearBottom = els.gchatLog.scrollHeight - els.gchatLog.scrollTop - els.gchatLog.clientHeight < 60;
  const div = document.createElement('div');
  const g = ['m','f','o'].includes(m.gender) ? m.gender : 'o';
  const mine = m.from === state.myId;
  div.className = 'gmsg g-' + g + (mine ? ' me' : '');
  const nick = document.createElement('b');
  nick.textContent = m.nick;
  const text = document.createElement('span');
  text.textContent = m.text;
  div.appendChild(nick);
  div.appendChild(text);
  els.gchatLog.appendChild(div);
  const all = els.gchatLog.querySelectorAll('.gmsg');
  if(all.length > 100) all[0].remove();
  if(mine || nearBottom || fromHistory) els.gchatLog.scrollTop = els.gchatLog.scrollHeight;
  if(!gchatOpen && !fromHistory && !mine){
    gchatUnread++;
    els.gchatBadge.textContent = gchatUnread > 99 ? '99+' : String(gchatUnread);
    els.gchatBadge.hidden = false;
  }
}
els.gchatForm.addEventListener('submit', (e)=>{
  e.preventDefault();
  const text = els.gchatInput.value.trim();
  if(!text) return;
  send({ type:'global_chat', text });  // сервер отфильтрует и разошлёт всем, включая отправителя
  els.gchatInput.value = '';
});

})();
