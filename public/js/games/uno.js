(function(){
window.GAME_MODULES = window.GAME_MODULES || {};

window.GAME_MODULES.uno = function(ctx){
  const { container, youAre, sendMove, setStatus } = ctx;
  const T = window.I18N.t;
  const COLORS = ['red','green','blue','yellow'];
  const COLOR_HEX = { red:'#E5453F', green:'#2E9E5B', blue:'#3266D6', yellow:'#E8B92E', wild:'#3a3a44' };

  // A строит и тасует колоду детерминированно из общего сида, чтобы у обоих было одинаковое представление —
  // проще: А раздаёт (авторитетно), рассылает результат раздачи.
  let deck=[], discard=[], myHand=[], oppHandCount=0, currentColor=null, turn='A', over=false, drawPending=null;
  let iAmDealer = youAre==='A';

  function buildDeck(){
    const d=[];
    COLORS.forEach(c=>{
      d.push({color:c, kind:'num', value:0});
      for(let v=1;v<=9;v++){ d.push({color:c,kind:'num',value:v}); d.push({color:c,kind:'num',value:v}); }
      for(let i=0;i<2;i++){ d.push({color:c,kind:'skip'}); d.push({color:c,kind:'reverse'}); d.push({color:c,kind:'draw2'}); }
    });
    for(let i=0;i<4;i++){ d.push({color:'wild',kind:'wild'}); d.push({color:'wild',kind:'wild4'}); }
    // Fisher-Yates
    for(let i=d.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [d[i],d[j]]=[d[j],d[i]]; }
    return d;
  }

  container.innerHTML='';
  const wrap=document.createElement('div');
  wrap.style.cssText='width:100%;display:flex;flex-direction:column;gap:14px;align-items:center;';
  container.appendChild(wrap);

  const oppRow=document.createElement('div');
  oppRow.style.cssText='font-size:13px;color:var(--muted);font-weight:700;';
  wrap.appendChild(oppRow);

  const tableRow=document.createElement('div');
  tableRow.style.cssText='display:flex;gap:18px;align-items:center;justify-content:center;';
  wrap.appendChild(tableRow);
  const drawPile=cardEl(null,'⟳','var(--surface-2)');
  drawPile.style.cursor='pointer';
  drawPile.addEventListener('click', ()=>tryDraw());
  const discardWrap=document.createElement('div');
  tableRow.appendChild(drawPile);
  tableRow.appendChild(discardWrap);

  const colorPickerRow=document.createElement('div');
  colorPickerRow.style.cssText='display:none;gap:8px;';
  COLORS.forEach(c=>{
    const b=document.createElement('button');
    b.style.cssText=`width:34px;height:34px;border-radius:50%;background:${COLOR_HEX[c]};border:2px solid rgba(0,0,0,.3);`;
    b.addEventListener('click', ()=>chooseColor(c));
    colorPickerRow.appendChild(b);
  });
  wrap.appendChild(colorPickerRow);

  const handRow=document.createElement('div');
  handRow.style.cssText='display:flex;gap:6px;flex-wrap:wrap;justify-content:center;max-width:520px;';
  wrap.appendChild(handRow);

  function cardEl(card, textOverride, bgOverride){
    const el=document.createElement('div');
    const bg = bgOverride || (card ? COLOR_HEX[card.color] : '#888');
    el.style.cssText=`width:52px;height:74px;border-radius:8px;background:${bg};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:18px;box-shadow:0 2px 0 rgba(0,0,0,.25);flex-shrink:0;`;
    el.textContent = textOverride!==undefined ? textOverride : cardLabel(card);
    return el;
  }
  function cardLabel(card){
    if(!card) return '';
    if(card.kind==='num') return String(card.value);
    if(card.kind==='skip') return '⦸';
    if(card.kind==='reverse') return '⇄';
    if(card.kind==='draw2') return '+2';
    if(card.kind==='wild') return '★';
    if(card.kind==='wild4') return '+4';
  }

  let pendingChoice=null; // карта, ожидающая выбора цвета (wild)

  function startGameAsDealer(){
    deck = buildDeck();
    let top = deck.pop();
    while(top.kind==='wild4'){ deck.unshift(top); top=deck.pop(); } // первая карта не может быть +4
    const handA = deck.splice(0,7);
    const handB = deck.splice(0,7);
    discard=[top];
    currentColor = top.color==='wild' ? COLORS[Math.floor(Math.random()*4)] : top.color;
    turn='A';
    myHand = handA;
    oppHandCount = handB.length;
    sendMove({ type:'deal', handB, deckRest:deck, topCard:top, currentColor });
    render();
    updateStatus();
  }

  function canPlay(card){
    const top = discard[discard.length-1];
    if(card.color==='wild') return true;
    return card.color===currentColor || (card.kind==='num' && top.kind==='num' && card.value===top.value) || card.kind===top.kind;
  }

  function render(){
    oppRow.textContent = T('uno_opp_cards',{n:oppHandCount});
    discardWrap.innerHTML='';
    const top = discard[discard.length-1];
    const tc = cardEl(top);
    if(top.color==='wild'){
      const ring=document.createElement('div');
      ring.style.cssText=`position:relative;`;
      tc.style.boxShadow = `0 0 0 4px ${COLOR_HEX[currentColor]}`;
    }
    discardWrap.appendChild(tc);

    handRow.innerHTML='';
    myHand.forEach((card,i)=>{
      const el=cardEl(card);
      const playable = !over && turn===youAre && !pendingChoice && !drawPending && canPlay(card);
      el.style.cursor = playable ? 'pointer':'default';
      el.style.opacity = (!over && turn===youAre && !playable) ? 0.55 : 1;
      el.style.transform = 'translateY(0)';
      if(playable) el.addEventListener('click', ()=>playCard(i));
      handRow.appendChild(el);
    });
  }

  function playCard(i){
    const card = myHand[i];
    if(!canPlay(card)) return;
    if(card.color==='wild'){
      pendingChoice = { card, index:i };
      colorPickerRow.style.display='flex';
      return;
    }
    commitPlay(i, null);
  }
  function chooseColor(c){
    if(!pendingChoice) return;
    colorPickerRow.style.display='none';
    commitPlay(pendingChoice.index, c);
    pendingChoice=null;
  }
  function commitPlay(i, chosenColor){
    const card = myHand[i];
    myHand.splice(i,1);
    discard.push(card);
    currentColor = card.color==='wild' ? chosenColor : card.color;
    sendMove({ type:'play', card, chosenColor, cardIndex:i });
    afterPlayEffects(card, true);
  }

  function afterPlayEffects(card, isMine){
    if(myHand.length===0 && isMine){ over=true; render(); setStatus(T('uno_you_win')); return; }
    let nextTurn = turn==='A'?'B':'A';
    if(card.kind==='skip' || card.kind==='reverse'){
      nextTurn = turn; // в игре на двоих skip/reverse = ход остаётся у текущего игрока
    }
    if(card.kind==='draw2'){
      drawPending = { count:2, target: turn==='A'?'B':'A' };
    } else if(card.kind==='wild4'){
      drawPending = { count:4, target: turn==='A'?'B':'A' };
    }
    turn = nextTurn;
    render();
    updateStatus();
  }

  function drawCards(count){
    const drawn=[];
    for(let n=0;n<count;n++){
      if(deck.length===0){
        // Перемешиваем сброс, кроме верхней карты. Новая последовательность
        // отправляется сопернику вместе с результатом, поэтому копии колоды
        // никогда не расходятся.
        if(discard.length>1){
          const top=discard[discard.length-1];
          deck=discard.slice(0,-1);
          for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
          discard=[top];
        }
      }
      if(deck.length===0) break;
      drawn.push(deck.pop());
    }
    return drawn;
  }

  function tryDraw(){
    if(over || turn!==youAre || pendingChoice) return;
    const count = (drawPending && drawPending.target===turn) ? drawPending.count : 1;
    const drawn = drawCards(count);
    if(!drawn.length){
      // Нечего брать — просто передаём ход, чтобы игра не зависала.
      drawPending=null;
      const nextTurn=turn==='A'?'B':'A';
      sendMove({type:'draw_result',count:0,drawn:[],deckRest:deck,nextTurn});
      turn=nextTurn; render(); updateStatus(); return;
    }
    myHand.push(...drawn);
    drawPending = null;
    const nextTurn = turn==='A'?'B':'A';
    sendMove({ type:'draw_result', count:drawn.length, drawn, deckRest:deck, nextTurn });
    turn = nextTurn;
    render(); updateStatus();
  }

  function updateStatus(){
    if(over) return;
    if(!myHand.length && oppHandCount===undefined){ return; }
    setStatus(turn===youAre ? T('uno_your_turn') : T('uno_opp_turn'));
  }

  if(iAmDealer){
    startGameAsDealer();
  } else {
    setStatus(T('uno_dealing'));
  }

  return { isOver:()=>over,

    receiveMove(payload){
      if(payload.type==='deal'){
        myHand = payload.handB;
        deck = payload.deckRest;
        discard = [payload.topCard];
        currentColor = payload.currentColor;
        oppHandCount = 7;
        turn='A';
        render(); updateStatus();
        return;
      }
      if(payload.type==='play'){
        const card = payload.card;
        discard.push(card);
        currentColor = card.color==='wild' ? payload.chosenColor : card.color;
        oppHandCount = Math.max(0, oppHandCount-1);
        if(oppHandCount===0){ over=true; render(); setStatus(T('uno_opp_win')); return; }
        afterPlayEffects(card, false);
        return;
      }
      if(payload.type==='draw_result'){
        // Авторитетное состояние колоды приходит от игрока, который тянул карты.
        // Это устраняет рассинхронизацию после перераспределения сброса.
        deck = Array.isArray(payload.deckRest) ? payload.deckRest : deck;
        oppHandCount += Number(payload.count)||0;
        turn = payload.nextTurn;
        render(); updateStatus();
        return;
      }
    }
  };
};
})();
