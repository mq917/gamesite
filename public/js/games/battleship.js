(function(){
window.GAME_MODULES = window.GAME_MODULES || {};

window.GAME_MODULES.battleship = function(ctx){
  const { container, youAre, sendMove, setStatus } = ctx;
  const T = window.I18N.t;
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
  setupBtn.textContent=T('bs_setup_btn');
  setupBox.appendChild(setupBtn);
  const setupHint=document.createElement('p');
  setupHint.style.cssText='color:var(--muted);font-size:13px;margin-top:10px;max-width:280px;';
  setupHint.textContent=T('bs_setup_hint');
  setupBox.appendChild(setupHint);
  wrap.appendChild(setupBox);

  const boardsRow=document.createElement('div');
  boardsRow.style.cssText='display:flex;gap:22px;flex-wrap:wrap;justify-content:center;';
  wrap.appendChild(boardsRow);

  function label(text){ const d=document.createElement('div'); d.style.cssText='font-weight:800;font-size:12px;text-align:center;margin-bottom:6px;color:var(--muted);'; d.textContent=text; return d; }

  const myCol=document.createElement('div');
  myCol.appendChild(label(T('bs_your_field')));
  const myGrid=document.createElement('div');
  myGrid.className='board-grid';
  myGrid.style.gridTemplateColumns=`repeat(${N}, ${CELL}px)`;
  myGrid.style.gap='2px';
  myCol.appendChild(myGrid);

  const oppCol=document.createElement('div');
  oppCol.appendChild(label(T('bs_opp_field')));
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
    // Надёжная расстановка с возвратом назад. Старый случайный алгоритм мог
    // исчерпать попытки на плотном поле 8×8 и оставить флот неполным.
    const occ=new Set(), cells=new Map();
    const ships=SHIP_SIZES.slice();
    const shuffled=(arr)=>{
      for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}
      return arr;
    };
    function canPlace(coords){
      for(const [r,c] of coords){
        if(r<0||r>=N||c<0||c>=N||occ.has(key(r,c))) return false;
        for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
          if(occ.has(key(r+dr,c+dc))) return false;
        }
      }
      return true;
    }
    function placeShip(coords,id){
      coords.forEach(([r,c])=>{occ.add(key(r,c));cells.set(key(r,c),id);});
    }
    function removeShip(coords){
      coords.forEach(([r,c])=>{occ.delete(key(r,c));cells.delete(key(r,c));});
    }
    function candidates(size){
      const out=[];
      for(let r=0;r<N;r++)for(let c=0;c<N;c++){
        for(const horizontal of [true,false]){
          const coords=[];
          for(let i=0;i<size;i++) coords.push(horizontal?[r,c+i]:[r+i,c]);
          if(canPlace(coords)) out.push(coords);
        }
      }
      return shuffled(out);
    }
    function solve(i){
      if(i===ships.length) return true;
      const size=ships[i];
      for(const coords of candidates(size)){
        const id=i;
        placeShip(coords,id);
        if(solve(i+1)) return true;
        removeShip(coords);
      }
      return false;
    }
    // Большие корабли сначала резко уменьшают ветвление.
    const ordered=ships.slice().sort((a,b)=>b-a);
    ships.splice(0,ships.length,...ordered);
    if(!solve(0)){
      // Теоретически на этом поле решение существует; если генератор всё же
      // не нашёл его, разрешаем касание кораблей как безопасный fallback.
      occ.clear(); cells.clear();
      let id=0;
      for(const size of ships){
        let done=false;
        for(let tries=0;tries<1000&&!done;tries++){
          const horizontal=Math.random()<.5;
          const r=Math.floor(Math.random()*(horizontal?N:N-size+1));
          const c=Math.floor(Math.random()*(horizontal?N-size+1:N));
          const coords=Array.from({length:size},(_,i)=>horizontal?[r,c+i]:[r+i,c]);
          if(coords.every(([rr,cc])=>rr<N&&cc<N&& !occ.has(key(rr,cc)))){
            placeShip(coords,id++); done=true;
          }
        }
      }
    }
    return {occ,cells};
  }

  setupBtn.addEventListener('click', ()=>{
    const placement = autoPlace();
    myShips = placement.occ;
    myShipCells = placement.cells;
    ready = true;
    renderMyBoard();
    setupBtn.disabled = true;
    setupBtn.textContent = T('bs_placed');
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
        el.style.background = oppShotsKnown.get(k)==='hit' ? '#D9502F' : 'var(--surface-2)'; el.textContent = oppShotsKnown.get(k)==='hit' ? '✹' : '•';
      } else if(myShips && myShips.has(k)){
        el.style.background = '#4b6f8f'; el.textContent = '■'; el.style.color = '#fff'; el.style.fontWeight='900'; el.style.textAlign='center'; el.style.lineHeight=CELL+'px';
      } else {
        el.style.background = 'var(--surface)'; el.textContent='';
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
    setStatus(T('bs_waiting_result'));
  }

  function checkAllSunk(shipCellsMap, hitSet){
    if(shipCellsMap.size===0) return false;
    for(const k of shipCellsMap.keys()) if(!hitSet.has(k)) return false;
    return true;
  }

  function updateStatus(){
    if(over) return;
    if(!started){ setStatus(ready ? T('bs_wait_opp_ready') : T('bs_ready_start')); return; }
    setStatus(turn===youAre ? T('bs_your_shot') : T('bs_opp_aiming'));
  }

  return { isOver:()=>over,

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
        if(allSunk){ over=true; setStatus(T('bs_you_sunk')); }
        else { turn = hit ? shooter : youAre; updateStatus(); }
        return;
      }
      if(payload.type==='result'){
        const { r, c, hit, sunk, gameover } = payload;
        myShots.set(key(r,c), hit?'hit':'miss');
        renderOppBoard();
        if(gameover){ over=true; setStatus(T('bs_opp_sunk')); return; }
        const opp = youAre==='A'?'B':'A';
        turn = hit ? youAre : opp;
        updateStatus();
        return;
      }
    }
  };
};
})();
