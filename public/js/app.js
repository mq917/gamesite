(function(){
"use strict";

/* ============ GAMES CATALOG ============ */
const GAMES = [
  { id:'chess',      name:'Шахматы',              icon:'♞', desc:'Классика. Ходы подсвечиваются.' },
  { id:'checkers',   name:'Шашки',                icon:'⛁', desc:'Взятие обязательно, ходы подсвечены.' },
  { id:'tictactoe',  name:'Крестики-нолики 5×5',  icon:'⌗', desc:'Собери 3 в ряд на большом поле.' },
  { id:'reversi',    name:'Реверси',              icon:'⬤', desc:'Окружай — и переворачивай фишки.' },
  { id:'gomoku',     name:'Пять в ряд',           icon:'●', desc:'Собери 5 своих фишек подряд.' },
  { id:'backgammon', name:'Нарды',                icon:'🎲', desc:'Короткие нарды с броском кубиков.' },
  { id:'battleship', name:'Морской бой',          icon:'🚢', desc:'Расставь флот и топи корабли врага.' },
  { id:'dots',       name:'Точки и квадраты',     icon:'▦', desc:'Замыкай квадраты линиями.' },
  { id:'uno',        name:'Цветные карты',        icon:'🃏', desc:'Сбрось карты быстрее соперника.' },
  { id:'hangman',    name:'Виселица',             icon:'🙈', desc:'Загадай слово — соперник его отгадывает.' },
];
const GAME_BY_ID = Object.fromEntries(GAMES.map(g=>[g.id,g]));
const EMOJIS = ['😂','🤣','😎','😜','🔥','💪','👍','👎','😱','🥳','🤯','😢','❤️','🎉','🤔','😏','👀','🙌','💀','😴'];

/* ============ STATE ============ */
const state = {
  ws:null,
  connected:false,
  me:{ nick:'', gender:'o', age:25 },
  currentQueueGame:null,
  waitingSince:0,
  room:null,           // { game, youAre, opponent }
  gameHandle:null,      // {receiveMove}
  chatHistory:[],
};

/* ============ DOM SHORTCUTS ============ */
const $ = (id)=>document.getElementById(id);
const els = {
  setupBackdrop:$('setupBackdrop'), nickInput:$('nickInput'), genderSeg:$('genderSeg'),
  ageInput:$('ageInput'), ageLabel:$('ageLabel'), setupContinue:$('setupContinue'),
  lobby:$('lobby'), gameGrid:$('gameGrid'),
  onlineCount:$('onlineCount'), themeToggle:$('themeToggle'),
  waitingBackdrop:$('waitingBackdrop'), waitingTitle:$('waitingTitle'), waitingSub:$('waitingSub'),
  waitingCount:$('waitingCount'), waitingTolerance:$('waitingTolerance'), cancelQueue:$('cancelQueue'),
  proposalBackdrop:$('proposalBackdrop'), oppAvatar:$('oppAvatar'), oppName:$('oppName'), oppMeta:$('oppMeta'),
  acceptMatch:$('acceptMatch'), declineMatch:$('declineMatch'),
  room:$('room'), vsYou:$('vsYou'), vsOpp:$('vsOpp'), roomGameName:$('roomGameName'),
  boardWrap:$('boardWrap'), boardStatus:$('boardStatus'), leaveRoom:$('leaveRoom'),
  chatLog:$('chatLog'), chatForm:$('chatForm'), chatInput:$('chatInput'), emojiRow:$('emojiRow'),
  toast:$('toast'),
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
  state.me.nick = els.nickInput.value.trim().slice(0,20) || 'Игрок';
  state.me.gender = selectedGender;
  state.me.age = parseInt(els.ageInput.value,10);
  els.setupBackdrop.hidden = true;
  els.lobby.hidden = false;
  connect();
});

/* ============ LOBBY RENDER ============ */
const gStats = {};
function renderLobby(){
  els.gameGrid.innerHTML = '';
  GAMES.forEach(g=>{
    const card = document.createElement('button');
    card.className = 'game-card';
    card.innerHTML = `
      <div class="g-icon">${g.icon}</div>
      <div class="g-name">${g.name}</div>
      <div class="g-stats">
        <span><b class="w-${g.id}">${gStats[g.id]||0}</b> ждут</span>
      </div>`;
    card.addEventListener('click', ()=>startQueue(g.id));
    els.gameGrid.appendChild(card);
  });
}
renderLobby();

function updateStatsUI(stats){
  els.onlineCount.textContent = stats.online;
  Object.keys(stats.perGame||{}).forEach(gid=>{
    gStats[gid] = stats.perGame[gid];
    const el = els.gameGrid.querySelector('.w-'+gid);
    if(el) el.textContent = stats.perGame[gid];
    if(state.currentQueueGame === gid) els.waitingCount.textContent = stats.perGame[gid];
  });
}

/* ============ WEBSOCKET ============ */
function wsUrl(){
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return proto + '//' + location.host;
}
function connect(){
  const ws = new WebSocket(wsUrl());
  state.ws = ws;
  ws.addEventListener('open', ()=>{
    state.connected = true;
    send({ type:'hello', nick:state.me.nick, gender:state.me.gender, age:state.me.age });
  });
  ws.addEventListener('close', ()=>{
    state.connected = false;
    toast('Соединение потеряно. Обновите страницу.');
  });
  ws.addEventListener('message', (ev)=>{
    let msg; try{ msg = JSON.parse(ev.data); }catch(e){ return; }
    handleServerMessage(msg);
  });
}
function send(obj){
  if(state.ws && state.ws.readyState === WebSocket.OPEN) state.ws.send(JSON.stringify(obj));
}

let waitingTimerInterval=null;
function handleServerMessage(msg){
  switch(msg.type){
    case 'stats': updateStatsUI(msg); break;

    case 'match_proposed': {
      showProposal(msg.opponent);
      break;
    }
    case 'match_declined': {
      // вернулись в очередь автоматически (сервер уже держит нас там же)
      els.proposalBackdrop.hidden = true;
      if(state.currentQueueGame){
        showWaiting(state.currentQueueGame);
        toast('Соперник отказался, ищем дальше…');
      }
      break;
    }
    case 'match_confirmed': {
      enterRoom(msg.game, msg.youAre, msg.opponent);
      break;
    }
    case 'opponent_move': {
      if(state.gameHandle && state.gameHandle.receiveMove) state.gameHandle.receiveMove(msg.payload);
      break;
    }
    case 'opponent_chat': {
      addChatMsg('them', msg.text);
      break;
    }
    case 'opponent_left': {
      addChatMsg('sys', 'Соперник покинул игру.');
      els.boardStatus.textContent = 'Соперник вышел из игры.';
      toast('Соперник покинул игру');
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
function showWaiting(gameId){
  const g = GAME_BY_ID[gameId];
  els.waitingBackdrop.hidden = false;
  els.waitingTitle.textContent = 'Ищем соперника…';
  els.waitingSub.textContent = 'Игра: ' + g.name;
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
function genderWord(g){ return g==='m' ? 'М' : g==='f' ? 'Ж' : '—'; }
function showProposal(opp){
  els.waitingBackdrop.hidden = true;
  els.proposalBackdrop.hidden = false;
  els.oppAvatar.textContent = (opp.nick||'?').slice(0,1).toUpperCase();
  els.oppName.textContent = opp.nick;
  els.oppMeta.textContent = `${genderWord(opp.gender)} · ${opp.age} лет`;
}
els.acceptMatch.addEventListener('click', ()=>{
  send({ type:'match_response', accept:true });
  els.proposalBackdrop.hidden = true;
  els.waitingTitle.textContent = 'Ждём подтверждения соперника…';
  els.waitingBackdrop.hidden = false;
});
els.declineMatch.addEventListener('click', ()=>{
  send({ type:'match_response', accept:false });
  els.proposalBackdrop.hidden = true;
  showWaiting(state.currentQueueGame);
});

/* ============ ROOM ============ */
function enterRoom(gameId, youAre, opponent){
  clearInterval(waitingTimerInterval);
  els.waitingBackdrop.hidden = true;
  els.proposalBackdrop.hidden = true;
  state.currentQueueGame = null;
  state.room = { game:gameId, youAre, opponent };
  state.chatHistory = [];

  els.lobby.hidden = true;
  els.room.hidden = false;
  els.vsYou.textContent = state.me.nick + ' (ты)';
  els.vsOpp.textContent = opponent.nick;
  els.roomGameName.textContent = GAME_BY_ID[gameId].name;
  els.boardWrap.innerHTML = '';
  els.boardStatus.textContent = '';
  els.chatLog.innerHTML = '';
  addChatMsg('sys', 'Соперник найден: ' + opponent.nick + '. Удачи!');

  renderEmojiRow();

  const factory = window.GAME_MODULES && window.GAME_MODULES[gameId];
  if(factory){
    state.gameHandle = factory({
      container: els.boardWrap,
      youAre,
      sendMove: (payload)=>send({ type:'game_move', payload }),
      setStatus: (text)=>{ els.boardStatus.textContent = text; },
    });
  } else {
    els.boardWrap.textContent = 'Эта игра ещё готовится.';
  }
}

els.leaveRoom.addEventListener('click', ()=>{
  send({ type:'leave_room' });
  backToLobby();
});
function backToLobby(){
  state.room = null;
  state.gameHandle = null;
  els.room.hidden = true;
  els.lobby.hidden = false;
}

/* ============ CHAT ============ */
function renderEmojiRow(){
  els.emojiRow.innerHTML = '';
  EMOJIS.forEach(e=>{
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = e;
    b.addEventListener('click', ()=>{
      els.chatInput.value += e;
      els.chatInput.focus();
    });
    els.emojiRow.appendChild(b);
  });
}
function addChatMsg(kind, text){
  const div = document.createElement('div');
  div.className = 'chat-msg ' + kind;
  div.textContent = text;
  els.chatLog.appendChild(div);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
}
els.chatForm.addEventListener('submit', (e)=>{
  e.preventDefault();
  const text = els.chatInput.value.trim();
  if(!text) return;
  // только буквы/цифры/эмодзи/пунктуация — вырезаем ссылки на клиенте тоже
  const cleaned = text.replace(/https?:\/\/\S+/gi,'').replace(/\b\S+\.(com|ru|net|org|io|me|рф)\S*/gi,'').trim();
  if(!cleaned) return;
  send({ type:'chat', text:cleaned });
  addChatMsg('me', cleaned);
  els.chatInput.value = '';
});

})();
