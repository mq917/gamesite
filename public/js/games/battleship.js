(function(){
window.GAME_MODULES = window.GAME_MODULES || {};

// Морской бой 8×8. Флот расставляется автоматически и сразу виден на «Твоём флоте»;
// можно перемешать до нажатия «Готов». Попал — стреляешь снова.
// Каждый выстрел и его результат видят оба игрока: на чужом поле — ✹ / •, на своём — обстрел соперника.
window.GAME_MODULES.battleship = function(ctx){
  const { container, youAre, sendMove, setStatus } = ctx;
  const T = window.I18N.t;
  const N = 8, CELL = 32;
  const SHIP_SIZES = [4,3,3,2,2,1,1];
  const COL = {
    ship:'#4b6f8f', hit:'#D9502F', sunk:'#8f2a14', miss:'var(--surface-2)', empty:'var(--surface)',
    last:'inset 0 0 0 3px #F2B705', reveal:'#7d9bb5'
  };
  const key=(r,c)=>r+'_'+c;
  const parse=(k)=>k.split('_').map(Number);

  // --- состояние ---
  let myShips=new Set(), myShipCells=new Map();      // мои корабли: клетки и id корабля
  let myHitSet=new Set(), mySunkCells=new Set();     // куда попали по мне / клетки потопленных моих кораблей
  let mySunkCount=0, oppSunkCount=0;
  let oppShots=new Map();                            // выстрелы соперника по мне: k -> 'hit'|'miss'
  let myShots=new Map();                             // мои выстрелы: k -> 'hit'|'miss'|'sunk'
  let revealed=new Set();                            // открытые в конце корабли соперника
  let lastOppShot=null, lastMyShot=null;
  let ready=false, oppReady=false, started=false, over=false, awaiting=false;
  let turn='A';                                      // A стреляет первым

  // --- DOM ---
  container.innerHTML='';
  const wrap=document.createElement('div');
  wrap.style.cssText='display:flex;flex-direction:column;gap:14px;align-items:center;';
  container.appendChild(wrap);

  const setupBox=document.createElement('div');
  setupBox.style.cssText='text-align:center;display:flex;flex-direction:column;align-items:center;gap:8px;';
  const btnRow=document.createElement('div');
  btnRow.style.cssText='display:flex;gap:10px;flex-wrap:wrap;justify-content:center;';
  const shuffleBtn=document.createElement('button');
  shuffleBtn.className='btn-ghost'; shuffleBtn.type='button'; shuffleBtn.textContent=T('bs_shuffle');
  const readyBtn=document.createElement('button');
  readyBtn.className='btn-primary'; readyBtn.type='button'; readyBtn.textContent=T('bs_ready_btn');
  btnRow.appendChild(shuffleBtn); btnRow.appendChild(readyBtn);
  setupBox.appendChild(btnRow);
  const setupHint=document.createElement('p');
  setupHint.style.cssText='color:var(--muted);font-size:13px;max-width:300px;';
  setupHint.textContent=T('bs_setup_hint');
  setupBox.appendChild(setupHint);
  wrap.appendChild(setupBox);

  const boardsRow=document.createElement('div');
  boardsRow.style.cssText='display:flex;gap:22px;flex-wrap:wrap;justify-content:center;';
  wrap.appendChild(boardsRow);

  const fleetLine=document.createElement('div');
  fleetLine.style.cssText='font-size:13px;font-weight:700;color:var(--muted);text-align:center;';
  wrap.appendChild(fleetLine);

  function label(text){ const d=document.createElement('div'); d.style.cssText='font-weight:800;font-size:12px;text-align:center;margin-bottom:6px;color:var(--muted);'; d.textContent=text; return d; }
  function makeGrid(){
    const g=document.createElement('div');
    g.className='board-grid';
    g.style.gridTemplateColumns=`repeat(${N}, ${CELL}px)`;
    g.style.gap='2px';
    return g;
  }
  const myCol=document.createElement('div');
  myCol.appendChild(label(T('bs_your_field')));
  const myGrid=makeGrid(); myCol.appendChild(myGrid);
  const oppCol=document.createElement('div');
  oppCol.appendChild(label(T('bs_opp_field')));
  const oppGrid=makeGrid(); oppCol.appendChild(oppGrid);
  boardsRow.appendChild(myCol); boardsRow.appendChild(oppCol);

  const myCells=[], oppCells=[];
  const baseCss=`width:${CELL}px;height:${CELL}px;border:1px solid var(--border-color);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:15px;color:#fff;`;
  for(let r=0;r<N;r++){ myCells.push([]); oppCells.push([]); for(let c=0;c<N;c++){
    const m=document.createElement('div'); m.style.cssText=baseCss; myGrid.appendChild(m); myCells[r].push(m);
    const o=document.createElement('div'); o.style.cssText=baseCss+'cursor:pointer;';
    o.addEventListener('click', ()=>tryShoot(r,c));
    oppGrid.appendChild(o); oppCells[r].push(o);
  }}

  // --- расстановка (с возвратом назад, корабли не касаются друг друга) ---
  function generateFleet(){
    const occ=new Set(), cells=new Map();
    const ships=SHIP_SIZES.slice().sort((a,b)=>b-a);
    const shuffled=(arr)=>{ for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];} return arr; };
    const canPlace=(coords)=>coords.every(([r,c])=>{
      if(r<0||r>=N||c<0||c>=N) return false;
      for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++) if(occ.has(key(r+dr,c+dc))) return false;
      return true;
    });
    const candidates=(size)=>{
      const out=[];
      for(let r=0;r<N;r++)for(let c=0;c<N;c++)for(const horiz of (size===1?[true]:[true,false])){
        const coords=Array.from({length:size},(_,i)=>horiz?[r,c+i]:[r+i,c]);
        if(canPlace(coords)) out.push(coords);
      }
      return shuffled(out);
    };
    function solve(i){
      if(i===ships.length) return true;
      for(const coords of candidates(ships[i])){
        coords.forEach(([r,c])=>{occ.add(key(r,c));cells.set(key(r,c),i);});
        if(solve(i+1)) return true;
        coords.forEach(([r,c])=>{occ.delete(key(r,c));cells.delete(key(r,c));});
      }
      return false;
    }
    return solve(0) ? {occ,cells} : null;
  }
  function placeFleet(){
    let f=null;
    for(let t=0;t<50 && !f;t++) f=generateFleet();
    myShips=f.occ; myShipCells=f.cells;
  }
  placeFleet();

  shuffleBtn.addEventListener('click', ()=>{ if(ready) return; placeFleet(); renderMy(); });
  readyBtn.addEventListener('click', ()=>{
    if(ready) return;
    ready=true;
    shuffleBtn.disabled=true; readyBtn.disabled=true;
    readyBtn.textContent=T('bs_placed');
    sendMove({ type:'ready' });
    checkStart();
    updateStatus();
  });
  function checkStart(){
    if(ready && oppReady && !started){
      started=true;
      setupBox.style.display='none';
      render(); updateStatus();
    }
  }

  // --- отрисовка ---
  function renderMy(){
    for(let r=0;r<N;r++)for(let c=0;c<N;c++){
      const k=key(r,c), el=myCells[r][c];
      const shot=oppShots.get(k);
      el.style.boxShadow = (k===lastOppShot) ? COL.last : 'none';
      if(shot==='hit'){ el.style.background = mySunkCells.has(k)?COL.sunk:COL.hit; el.textContent='✹'; }
      else if(shot==='miss'){ el.style.background=COL.miss; el.style.color='var(--muted)'; el.textContent='•'; }
      else if(myShips.has(k)){ el.style.background=COL.ship; el.textContent='■'; el.style.color='#fff'; }
      else { el.style.background=COL.empty; el.textContent=''; }
      if(shot!=='miss') el.style.color='#fff';
    }
  }
  function renderOpp(){
    const canShoot = started && !over && turn===youAre && !awaiting;
    for(let r=0;r<N;r++)for(let c=0;c<N;c++){
      const k=key(r,c), el=oppCells[r][c];
      const s=myShots.get(k);
      el.style.boxShadow = (k===lastMyShot) ? COL.last : 'none';
      if(s==='hit'){ el.style.background=COL.hit; el.style.color='#fff'; el.textContent='✹'; }
      else if(s==='sunk'){ el.style.background=COL.sunk; el.style.color='#fff'; el.textContent='✹'; }
      else if(s==='miss'){ el.style.background=COL.miss; el.style.color='var(--muted)'; el.textContent='•'; }
      else if(revealed.has(k)){ el.style.background=COL.reveal; el.style.color='#fff'; el.textContent='■'; }
      else { el.style.background=COL.empty; el.textContent=''; }
      el.style.cursor = (canShoot && !s) ? 'pointer' : 'default';
    }
  }
  function renderFleetLine(){
    fleetLine.textContent = started ? T('bs_fleet_line',{ you:SHIP_SIZES.length-mySunkCount, opp:SHIP_SIZES.length-oppSunkCount }) : '';
  }
  function render(){ renderMy(); renderOpp(); renderFleetLine(); }

  function turnText(){ return turn===youAre ? T('bs_your_shot') : T('bs_opp_aiming'); }
  function updateStatus(extra){
    if(over) return;
    if(!started){ setStatus(ready ? T('bs_wait_opp_ready') : T('bs_ready_start')); return; }
    setStatus((extra ? extra+' · ' : '') + turnText());
  }

  // --- мой выстрел ---
  function tryShoot(r,c){
    if(!started||over||turn!==youAre||awaiting) return;
    const k=key(r,c);
    if(myShots.has(k)) return;
    awaiting=true;                       // пока нет ответа — повторно стрелять нельзя
    lastMyShot=k;
    renderOpp();
    setStatus(T('bs_waiting_result'));
    sendMove({ type:'shot', r, c });
  }

  function neighbours(cells){
    const out=new Set();
    cells.forEach(([r,c])=>{
      for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
        const rr=r+dr, cc=c+dc;
        if(rr>=0&&rr<N&&cc>=0&&cc<N) out.add(key(rr,cc));
      }
    });
    return out;
  }
  const inRange=(v)=>Number.isInteger(v)&&v>=0&&v<N;

  render(); updateStatus();   // сразу показываем свой флот и подсказку

  return { isOver:()=>over,

    receiveMove(payload){
      if(!payload) return;

      if(payload.type==='ready'){ oppReady=true; checkStart(); return; }

      // соперник стреляет по мне
      if(payload.type==='shot'){
        if(!started||over||turn===youAre) return;
        if(!inRange(payload.r)||!inRange(payload.c)) return;
        const k=key(payload.r,payload.c);
        if(oppShots.has(k)) return;
        const hit=myShips.has(k);
        oppShots.set(k, hit?'hit':'miss');
        lastOppShot=k;
        let sunk=false, sunkCells=null;
        if(hit){
          myHitSet.add(k);
          const id=myShipCells.get(k);
          const shipKeys=[...myShipCells].filter(([,v])=>v===id).map(([kk])=>kk);
          if(shipKeys.every(kk=>myHitSet.has(kk))){
            sunk=true; mySunkCount++;
            shipKeys.forEach(kk=>mySunkCells.add(kk));
            sunkCells=shipKeys.map(parse);
          }
        }
        const allSunk = mySunkCount===SHIP_SIZES.length;
        sendMove({ type:'result', r:payload.r, c:payload.c, hit, sunk, sunkCells, gameover:allSunk });
        if(allSunk){
          over=true; render(); setStatus(T('bs_you_sunk'));
          return;
        }
        // попал — стреляет дальше, промахнулся — ход переходит ко мне
        turn = hit ? turn : youAre;
        render();
        updateStatus(sunk ? T('bs_opp_sunk_ship') : hit ? T('bs_opp_hit') : T('bs_opp_miss'));
        return;
      }

      // результат моего выстрела
      if(payload.type==='result'){
        if(!awaiting) return;
        awaiting=false;
        const k=key(payload.r,payload.c);
        const hit=!!payload.hit;
        myShots.set(k, hit?'hit':'miss');
        if(payload.sunk && Array.isArray(payload.sunkCells)){
          oppSunkCount++;
          payload.sunkCells.forEach(([r,c])=>myShots.set(key(r,c),'sunk'));
          // вокруг потопленного корабля кораблей нет — отмечаем клетки как «мимо»
          neighbours(payload.sunkCells).forEach(nk=>{ if(!myShots.has(nk)) myShots.set(nk,'miss'); });
        }
        if(payload.gameover){
          over=true; render(); setStatus(T('bs_opp_sunk'));
          // победитель открывает проигравшему оставшиеся корабли
          sendMove({ type:'reveal', cells:[...myShips].filter(kk=>!myHitSet.has(kk)).map(parse) });
          return;
        }
        if(!hit) turn = (youAre==='A'?'B':'A');
        render();
        updateStatus(payload.sunk ? T('bs_sunk_ship') : hit ? T('bs_hit') : T('bs_miss'));
        return;
      }

      if(payload.type==='reveal' && over && Array.isArray(payload.cells)){
        payload.cells.forEach(cell=>{ if(Array.isArray(cell)&&inRange(cell[0])&&inRange(cell[1])) revealed.add(key(cell[0],cell[1])); });
        renderOpp();
      }
    }
  };
};
})();
