(function(){
window.GAME_MODULES = window.GAME_MODULES || {};

// Упрощённые короткие нарды. points[0..23], значение = {side,count}. A движется 23->0, B движется 0->23.
window.GAME_MODULES.backgammon = function(ctx){
  const { container, youAre, sendMove, setStatus } = ctx;
  const T = window.I18N.t;
  const CELL_W = 30;

  let points = Array(24).fill(null);
  function setup(){
    points = Array(24).fill(null);
    points[23]={side:'A',count:2}; points[12]={side:'A',count:5}; points[7]={side:'A',count:3}; points[5]={side:'A',count:5};
    points[0]={side:'B',count:2}; points[11]={side:'B',count:5}; points[16]={side:'B',count:3}; points[18]={side:'B',count:5};
  }
  setup();
  let bar={A:0,B:0}, off={A:0,B:0};
  let turn='A', over=false;
  let dice=[], diceUsed=[];
  let selected=null;

  const dir = { A:-1, B:1 }; // A движется к точке 0 (уменьшение индекса), B к 23

  container.innerHTML='';
  const wrap=document.createElement('div');
  wrap.style.cssText='width:100%;max-width:640px;';
  container.appendChild(wrap);

  const diceRow=document.createElement('div');
  diceRow.style.cssText='display:flex;gap:10px;align-items:center;justify-content:center;margin-bottom:10px;flex-wrap:wrap;';
  wrap.appendChild(diceRow);

  const rollBtn=document.createElement('button');
  rollBtn.className='btn-primary';
  rollBtn.textContent=T('bg_roll');
  diceRow.appendChild(rollBtn);

  const diceDisplay=document.createElement('div');
  diceDisplay.style.cssText='display:flex;gap:6px;';
  diceRow.appendChild(diceDisplay);

  const boardEl=document.createElement('div');
  boardEl.style.cssText=`display:grid;grid-template-columns:repeat(12, ${CELL_W}px);gap:2px;background:#5b3d28;padding:8px;border-radius:8px;`;
  wrap.appendChild(boardEl);

  // построим 24 точки в 2 ряда по 12, зигзагом как в нардах (верх 12..23 справа налево, низ 11..0)
  const topOrder = [12,13,14,15,16,17,18,19,20,21,22,23];
  const botOrder = [11,10,9,8,7,6,5,4,3,2,1,0];
  const pointEls = {};
  function buildCol(idx, rowTop){
    const col=document.createElement('div');
    col.style.cssText=`height:110px;display:flex;flex-direction:${rowTop?'column':'column-reverse'};align-items:center;cursor:pointer;background:${idx%2===0?'#7a5636':'#8a6440'};position:relative;`;
    col.addEventListener('click', ()=>onPointClick(idx));
    pointEls[idx]=col;
    return col;
  }
  topOrder.forEach(idx=>boardEl.appendChild(buildCol(idx,true)));
  botOrder.forEach(idx=>boardEl.appendChild(buildCol(idx,false)));

  const barEl=document.createElement('div');
  barEl.style.cssText='text-align:center;margin-top:8px;font-size:13px;color:var(--muted);';
  wrap.appendChild(barEl);

  const bearOffBtn=document.createElement('button');
  bearOffBtn.className='btn-primary';
  bearOffBtn.textContent=T('bg_bear_off');
  bearOffBtn.style.cssText='display:none;margin:10px auto 0;';
  wrap.appendChild(bearOffBtn);
  bearOffBtn.addEventListener('click', ()=>tryBearOff());

  function allInHome(side){
    if(bar[side]>0) return false;
    for(let idx=0;idx<24;idx++){
      const p=points[idx];
      if(p && p.side===side){
        const inHome = side==='A' ? idx<=5 : idx>=18;
        if(!inHome) return false;
      }
    }
    return true;
  }
  function tryBearOff(){
    if(selected===null || over || turn!==youAre) return;
    const p=points[selected]; if(!p||p.side!==turn) return;
    if(!allInHome(turn)) return;
    const needed = turn==='A' ? selected+1 : 24-selected;
    let dieIndex = dice.findIndex((d,i)=>!diceUsed[i] && d===needed);
    if(dieIndex===-1){
      // овершут разрешён только для самой дальней шашки
      const farthest = turn==='A'
        ? Math.max(...[...Array(24).keys()].filter(i=>points[i]&&points[i].side===turn))
        : Math.min(...[...Array(24).keys()].filter(i=>points[i]&&points[i].side===turn));
      if(selected===farthest){
        dieIndex = dice.findIndex((d,i)=>!diceUsed[i] && d>needed);
      }
    }
    if(dieIndex===-1) return;
    applyBearOff(selected, dieIndex, turn);
    sendMove({ type:'bearoff', from:selected, dieIndex });
  }
  function applyBearOff(from,dieIndex,side){
    const p=points[from];
    p.count--; if(p.count<=0) points[from]=null;
    off[side]++;
    diceUsed[dieIndex]=true;
    selected=null;
    render();
    afterMoveCheck();
  }

  function checkerColor(side){ return side==='A' ? 'var(--coral)' : '#14161F'; }

  function render(){
    Object.keys(pointEls).forEach(k=>{
      const el=pointEls[k]; el.innerHTML=''; el.style.boxShadow='none';
    });
    for(let i=0;i<24;i++){
      const p=points[i]; if(!p) continue;
      const el=pointEls[i];
      for(let n=0;n<Math.min(p.count,5);n++){
        const d=document.createElement('div');
        d.style.cssText=`width:22px;height:22px;border-radius:50%;background:${checkerColor(p.side)};border:2px solid rgba(0,0,0,.3);margin:1px;`;
        el.appendChild(d);
      }
      if(p.count>5){
        const t=document.createElement('div');
        t.style.cssText='font-size:10px;font-weight:800;color:#fff;';
        t.textContent='+'+(p.count-5);
        el.appendChild(t);
      }
    }
    if(selected!==null && points[selected]) pointEls[selected].style.boxShadow='inset 0 0 0 3px var(--teal)';
    legalTargets().forEach(t=>{ if(pointEls[t]!==undefined) pointEls[t].style.boxShadow='inset 0 0 0 3px var(--coral)'; });

    barEl.textContent = T('bg_bar_line', { youBar:bar[youAre], oppBar:bar[youAre==='A'?'B':'A'], youOff:off[youAre], oppOff:off[youAre==='A'?'B':'A'] });
    bearOffBtn.style.display = (turn===youAre && dice.length && selected!==null && allInHome(turn)) ? 'block' : 'none';
    diceDisplay.innerHTML='';
    dice.forEach((d,i)=>{
      const span=document.createElement('span');
      span.textContent=d;
      span.style.cssText=`display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:2px solid var(--border-color);border-radius:6px;font-weight:800;opacity:${diceUsed[i]?0.3:1};`;
      diceDisplay.appendChild(span);
    });
  }

  function rollDice(){
    const d1=1+Math.floor(Math.random()*6), d2=1+Math.floor(Math.random()*6);
    dice = d1===d2 ? [d1,d1,d1,d1] : [d1,d2];
    diceUsed = dice.map(()=>false);
    sendMove({ type:'roll', dice });
    rollBtn.style.display='none';
    if(!hasAnyLegalMoveAnyDie()){
      setTimeout(()=>{ endTurnNoMoves(); }, 700);
    }
    render();
    updateStatus();
  }
  rollBtn.addEventListener('click', ()=>{
    if(over || turn!==youAre || dice.length) return;
    rollDice();
  });

  function pointOwnerOk(idx, side){
    const p=points[idx];
    return !p || p.side===side || p.count<=1;
  }

  function legalTargets(){
    if(selected===null) return [];
    const p = points[selected];
    if(!p) return [];
    const out=[];
    dice.forEach((d,i)=>{
      if(diceUsed[i]) return;
      const target = selected + dir[turn]*d;
      if(target>=0 && target<24 && pointOwnerOk(target, turn)) out.push(target);
    });
    return [...new Set(out)];
  }

  function myBarIndex(side){ return side==='A' ? 24 : -1; } // виртуальные индексы входа

  function onPointClick(idx){
    if(over || turn!==youAre || !dice.length) return;
    if(bar[turn]>0){
      // сначала нужно войти с бара
      tryEnterFromBar(idx);
      return;
    }
    const p = points[idx];
    if(selected!==null){
      const targets = legalTargets();
      if(targets.includes(idx)){
        moveChecker(selected, idx);
        return;
      }
    }
    if(p && p.side===turn){ selected=idx; render(); }
    else { selected=null; render(); }
  }

  function tryEnterFromBar(targetIdx){
    // вход для A на 18-23 (в зависимости от кубика: точка = 24-d), для B на 0-5 (точка = d-1)
    for(let i=0;i<dice.length;i++){
      if(diceUsed[i]) continue;
      const d=dice[i];
      const entry = turn==='A' ? 24-d : d-1;
      if(entry===targetIdx && pointOwnerOk(entry, turn)){
        applyEnter(entry, i, turn);
        sendMove({ type:'enter', to:entry, dieIndex:i });
        return;
      }
    }
  }
  function applyEnter(entry, dieIndex, side){
    const p = points[entry];
    if(p && p.side!==side){ // сбили одиночную шашку
      bar[p.side]++; points[entry]=null;
    }
    bar[side]--;
    if(points[entry] && points[entry].side===side) points[entry].count++;
    else points[entry]={side,count:1};
    diceUsed[dieIndex]=true;
    selected=null;
    render();
    afterMoveCheck();
  }

  function moveChecker(from,to){
    const dieIndex = dice.findIndex((d,i)=>!diceUsed[i] && from+dir[turn]*d===to);
    if(dieIndex===-1) return;
    applyMove(from,to,dieIndex,turn);
    sendMove({ type:'move', from, to, dieIndex });
  }
  function applyMove(from,to,dieIndex,side){
    const fp = points[from];
    fp.count--; if(fp.count<=0) points[from]=null;
    const tp = points[to];
    if(tp && tp.side!==side){ bar[tp.side]++; points[to]={side,count:1}; }
    else if(tp){ tp.count++; }
    else points[to]={side,count:1};
    diceUsed[dieIndex]=true;
    selected=null;
    render();
    afterMoveCheck();
  }

  function hasAnyLegalMoveAnyDie(){
    if(bar[turn]>0){
      for(let i=0;i<dice.length;i++){
        if(diceUsed[i]) continue;
        const entry = turn==='A' ? 24-dice[i] : dice[i]-1;
        if(pointOwnerOk(entry,turn)) return true;
      }
      return false;
    }
    for(let idx=0;idx<24;idx++){
      const p=points[idx]; if(!p||p.side!==turn) continue;
      for(let i=0;i<dice.length;i++){
        if(diceUsed[i]) continue;
        const t = idx+dir[turn]*dice[i];
        if(t>=0&&t<24&&pointOwnerOk(t,turn)) return true;
      }
    }
    return false;
  }

  function afterMoveCheck(){
    checkWin();
    if(over) return;
    if(diceUsed.every(Boolean) || !hasAnyLegalMoveAnyDie()){
      endTurn();
    } else {
      updateStatus();
    }
  }
  function endTurnNoMoves(){
    setStatus(T('bg_no_moves'));
    endTurn();
  }
  function endTurn(){
    dice=[]; diceUsed=[]; selected=null;
    turn = turn==='A'?'B':'A';
    rollBtn.style.display = (turn===youAre) ? 'inline-flex' : 'none';
    render();
    updateStatus();
  }
  function checkWin(){
    let onBoardA=0,onBoardB=0;
    points.forEach(p=>{ if(p){ if(p.side==='A') onBoardA+=p.count; else onBoardB+=p.count; } });
    // победа засчитывается, когда у стороны не осталось шашек ни на доске, ни на баре
    // (то есть все 15 выведены через bearOff)
    if(onBoardA===0 && bar.A===0){ over=true; setStatus(youAre==='A'?T('bg_you_win'):T('bg_opp_win')); }
    else if(onBoardB===0 && bar.B===0){ over=true; setStatus(youAre==='B'?T('bg_you_win'):T('bg_opp_win')); }
  }

  function updateStatus(){
    if(over) return;
    if(turn!==youAre){ setStatus(T('bg_opp_turn')); return; }
    if(!dice.length) setStatus(T('bg_your_turn_roll'));
    else setStatus(T('bg_your_turn_move'));
  }

  rollBtn.style.display = (turn===youAre) ? 'inline-flex' : 'none';
  render(); updateStatus();

  return { isOver:()=>over,

    receiveMove(payload){
      if(over) return;
      if(payload.type==='roll'){
        dice = payload.dice; diceUsed = dice.map(()=>false);
        render(); updateStatus();
        if(!hasAnyLegalMoveAnyDie()) setTimeout(endTurn, 700);
        return;
      }
      if(payload.type==='enter'){ applyEnter(payload.to, payload.dieIndex, turn); return; }
      if(payload.type==='move'){ applyMove(payload.from, payload.to, payload.dieIndex, turn); return; }
      if(payload.type==='bearoff'){ applyBearOff(payload.from, payload.dieIndex, turn); return; }
    }
  };
};
})();
