(function(){
window.GAME_MODULES = window.GAME_MODULES || {};

window.GAME_MODULES.battleship = function(ctx){
  const { container, youAre, sendMove, setStatus } = ctx;
  const N = 8, CELL = 32;
  const SHIP_SIZES = [4,3,3,2,2,1,1];

  let myShips;      // Set of "r_c" occupied by my ships
  let myHit = new Set(); // cells of mine that were hit
  let myShipCells = new Map(); // "r_c" -> shipId, for sink detection
  let oppShotsKnown = new Map(); // my board: cells opponent shot -> 'hit'|'miss'
  let myShots = new Map(); // "r_c" -> 'hit'|'miss'|'pending' on opponent board
  let ready=false, oppReady=false, started=false, over=false;
  let turn='A'; // A shoots first

  container.innerHTML='';
  const wrap=document.createElement('div');
  wrap.style.cssText='display:flex;flex-direction:column;gap:16px;align-items:center;';
  container.appendChild(wrap);

  const setupBox=document.createElement('div');
  setupBox.style.textAlign='center';
  const setupBtn=document.createElement('button');
  setupBtn.className='btn-primary';
  setupBtn.textContent='🎲 Расставить флот и начать';
  setupBox.appendChild(setupBtn);
  const setupHint=document.createElement('p');
  setupHint.style.cssText='color:var(--muted);font-size:13px;margin-top:10px;max-width:280px;';
  setupHint.textContent='Флот расставляется автоматически. Затем по очереди стреляете по полю соперника.';
  setupBox.appendChild(setupHint);
  wrap.appendChild(setupBox);

  const boardsRow=document.createElement('div');
  boardsRow.style.cssText='display:flex;gap:22px;flex-wrap:wrap;justify-content:center;';
  wrap.appendChild(boardsRow);

  function label(text){ const d=document.createElement('div'); d.style.cssText='font-weight:800;font-size:12px;text-align:center;margin-bottom:6px;color:var(--muted);'; d.textContent=text; return d; }

  const myCol=document.createElement('div');
  myCol.appendChild(label('Твоё поле'));
  const myGrid=document.createElement('div');
  myGrid.className='board-grid';
  myGrid.style.gridTemplateColumns=`repeat(${N}, ${CELL}px)`;
  myGrid.style.gap='2px';
  myCol.appendChild(myGrid);

  const oppCol=document.createElement('div');
  oppCol.appendChild(label('Поле соперника — стреляй сюда'));
  const oppGrid=document.createElement('div');
  oppGrid.className='board-grid';
  oppGrid.style.gridTemplateColumns=`repeat(${N}, ${CELL}px)`;
  oppGrid.style.gap='2px';
  oppCol.appendChild(oppGrid);

  const myCells=[], oppCells=[];
  for(let r=0;r<N;r++){ myCells.push([]); oppCells.push([]); for(let c=0;c<N;c++){
    const m=document.createElement('div');
    m.style.cssText=`width:${CELL}px;height:${CELL}px;background:var(--surface);border:1px solid var(--border-color);`;
    myGrid.appendChild(m); myCells[r].push(m);
    const o=document.createElement('div');
    o.style.cssText=`width:${CELL}px;height:${CELL}px;background:var(--surface);border:1px solid var(--border-color);cursor:pointer;`;
    o.addEventListener('click', ()=>tryShoot(r,c));
    oppGrid.appendChild(o); oppCells[r].push(o);
  }}

  function key(r,c){ return r+'_'+c; }

  function autoPlace(){
    const occ = new Set();
    const cells = new Map();
    let shipId=0;
    for(const size of SHIP_SIZES){
      let placed=false, attempts=0;
      while(!placed && attempts<400){
        attempts++;
        const horizontal = Math.random()<0.5;
        const r = Math.floor(Math.random()* (horizontal?N:(N-size+1)));
        const c = Math.floor(Math.random()* (horizontal?(N-size+1):N));
        const coords=[];
        for(let i=0;i<size;i++) coords.push(horizontal ? [r,c+i] : [r+i,c]);
        let ok = coords.every(([rr,cc])=>rr<N&&cc<N);
        if(ok){
          for(const [rr,cc] of coords){
            for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
              const k=key(rr+dr,cc+dc);
              if(occ.has(k)){ ok=false; }
            }
          }
        }
        if(ok){
          coords.forEach(([rr,cc])=>{ occ.add(key(rr,cc)); cells.set(key(rr,cc), shipId); });
          placed=true; shipId++;
        }
      }
    }
    return { occ, cells };
  }

  setupBtn.addEventListener('click', ()=>{
    const placement = autoPlace();
    myShips = placement.occ;
    myShipCells = placement.cells;
    ready = true;
    renderMyBoard();
    setupBtn.disabled = true;
    setupBtn.textContent = 'Флот расставлен ✓';
    sendMove({ type:'ready' });
    checkStart();
  });

  function checkStart(){
    if(ready && oppReady && !started){
      started = true;
      setupBox.style.display='none';
      updateStatus();
    }
  }

  function renderMyBoard(){
    for(let r=0;r<N;r++)for(let c=0;c<N;c++){
      const k=key(r,c);
      const el=myCells[r][c];
      if(oppShotsKnown.has(k)){
        el.style.background = oppShotsKnown.get(k)==='hit' ? '#D9502F' : 'var(--surface-2)';
      } else if(myShips && myShips.has(k)){
        el.style.background = '#8a97b3';
      } else {
        el.style.background = 'var(--surface)';
      }
    }
  }
  function renderOppBoard(){
    for(let r=0;r<N;r++)for(let c=0;c<N;c++){
      const k=key(r,c);
      const el=oppCells[r][c];
      const s = myShots.get(k);
      el.style.background = s==='hit' ? '#D9502F' : s==='miss' ? 'var(--surface-2)' : 'var(--surface)';
      el.style.cursor = (started && !over && turn===youAre && !s) ? 'pointer' : 'default';
    }
  }

  function tryShoot(r,c){
    if(!started||over||turn!==youAre) return;
    const k=key(r,c);
    if(myShots.has(k)) return;
    myShots.delete(k);
    sendMove({ type:'shot', r, c });
    setStatus('Ждём результат выстрела…');
  }

  function checkAllSunk(shipCellsMap, hitSet){
    if(shipCellsMap.size===0) return false;
    for(const k of shipCellsMap.keys()) if(!hitSet.has(k)) return false;
    return true;
  }

  function updateStatus(){
    if(over) return;
    if(!started){ setStatus(ready ? 'Ждём, когда соперник расставит флот…' : 'Расставь свой флот, чтобы начать'); return; }
    setStatus(turn===youAre ? 'Твой ход — стреляй по полю соперника' : 'Соперник целится…');
  }

  return {
    receiveMove(payload){
      if(payload.type==='ready'){
        oppReady = true;
        checkStart();
        return;
      }
      if(payload.type==='shot'){
        const { r, c } = payload;
        const k = key(r,c);
        const hit = myShips.has(k);
        oppShotsKnown.set(k, hit?'hit':'miss');
        if(hit) myHit.add(k);
        const shipId = myShipCells.get(k);
        let sunk=false;
        if(hit && shipId!==undefined){
          const shipCells = new Map([...myShipCells].filter(([kk,v])=>v===shipId));
          sunk = checkAllSunk(shipCells, myHit);
        }
        const allSunk = myShipCells.size>0 && [...myShipCells.keys()].every(kk=>myHit.has(kk));
        renderMyBoard();
        sendMove({ type:'result', r, c, hit, sunk, gameover: allSunk });
        const shooter = youAre==='A'?'B':'A';
        if(allSunk){ over=true; setStatus('Соперник потопил весь твой флот 😢'); }
        else { turn = hit ? shooter : youAre; updateStatus(); }
        return;
      }
      if(payload.type==='result'){
        const { r, c, hit, sunk, gameover } = payload;
        myShots.set(key(r,c), hit?'hit':'miss');
        renderOppBoard();
        if(gameover){ over=true; setStatus('Ты потопил весь флот соперника! 🎉'); return; }
        const opp = youAre==='A'?'B':'A';
        turn = hit ? youAre : opp;
        updateStatus();
        return;
      }
    }
  };
};
})();
