(function(){
"use strict";
const T = (key, vars) => window.I18N.t(key, vars);

/* ============ GAMES CATALOG ============ */
const GAME_IDS = ['chess','checkers','tictactoe','reversi','gomoku','backgammon','battleship','dots','uno','hangman'];
const GAME_ICONS = {
  chess:'♞', checkers:'⛁', tictactoe:'⌗', reversi:'⬤', gomoku:'●',
  backgammon:'🎲', battleship:'🚢', dots:'▦', uno:'🃏', hangman:'🙈'
};
function gameMeta(id){
  return { id, icon: GAME_ICONS[id], name: T('game_'+id+'_name'), desc: T('game_'+id+'_desc') };
}
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
  }
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
  connect();
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
    toast(T('connection_lost_toast'));
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
    case 'opponent_move': {
      if(state.gameHandle && state.gameHandle.receiveMove) state.gameHandle.receiveMove(msg.payload);
      break;
    }
    case 'opponent_chat': {
      addChatMsg('them', msg.text);
      break;
    }
    case 'rematch_waiting': {
      toast(T('rematch_opponent'));
      break;
    }
    case 'rematch_start': {
      rematchRequested=false;
      restartCurrentGame();
      break;
    }
    case 'opponent_left': {
      addChatMsg('sys', T('opponent_left_chat'));
      els.boardStatus.textContent = T('opponent_left_status');
      toast(T('opponent_left_toast'));
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
let lastProposalOpponent = null;
function showProposal(opp){
  lastProposalOpponent = opp;
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
  els.rematchBtn.disabled = false;
  rematchRequested=false;
  els.rematchBtn.textContent = T('rematch');
}
function pollGameFinished(){
  if(!state.room || !state.gameHandle) return;
  if(typeof state.gameHandle.isOver === 'function' && state.gameHandle.isOver()) showFinishActions();
}
function restartCurrentGame(){
  if(!state.room) return;
  hideFinishActions();
  els.boardWrap.innerHTML='';
  els.boardStatus.textContent=T('rematch_starting');
  const {game,youAre,opponent}=state.room;
  const factory=window.GAME_MODULES && window.GAME_MODULES[game];
  if(factory){
    state.gameHandle=factory({
      container:els.boardWrap, youAre,
      sendMove:(payload)=>send({type:'game_move',payload}),
      setStatus:(text)=>{ els.boardStatus.textContent=text; },
      onGameOver:showFinishActions
    });
  }
}
els.rematchBtn.addEventListener('click',()=>{
  if(!state.room || rematchRequested) return;
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
function enterRoom(gameId, youAre, opponent){
  clearInterval(waitingTimerInterval);
  clearInterval(finishPoll);
  hideFinishActions();
  els.waitingBackdrop.hidden = true;
  els.proposalBackdrop.hidden = true;
  state.currentQueueGame = null;
  state.room = { game:gameId, youAre, opponent };
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

  renderEmojiRow();

  const factory = window.GAME_MODULES && window.GAME_MODULES[gameId];
  if(factory){
    state.gameHandle = factory({
      container: els.boardWrap,
      youAre,
      sendMove: (payload)=>send({ type:'game_move', payload }),
      setStatus: (text)=>{ els.boardStatus.textContent = text; },
      onGameOver: showFinishActions
    });
  } else {
    els.boardWrap.textContent = 'This game is still being prepared.';
  }
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
  const cleaned = text.replace(/https?:\/\/\S+/gi,'').replace(/\b\S+\.(com|ru|net|org|io|me|рф)\S*/gi,'').trim();
  if(!cleaned) return;
  send({ type:'chat', text:cleaned });
  addChatMsg('me', cleaned);
  els.chatInput.value = '';
});

})();
