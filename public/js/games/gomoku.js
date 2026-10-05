(function(){
window.GAME_MODULES = window.GAME_MODULES || {};

window.GAME_MODULES.gomoku = function(ctx){
  const { container, youAre, sendMove, setStatus } = ctx;
  const T = window.I18N.t;
  const SIZE = 13, WIN_LEN = 5;
  const CELL = 26;
  let cells = Array(SIZE*SIZE).fill(null);
  let turn = 'A';
  let over = false;

  container.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'board-grid';
  grid.style.gridTemplateColumns = `repeat(${SIZE}, ${CELL}px)`;
  grid.style.gap = '1px';
  grid.style.background = 'var(--border-color)';
  grid.style.border = '2px solid var(--border-color)';
  container.appendChild(grid);

  const cellEls = [];
  for(let i=0;i<SIZE*SIZE;i++){
    const c = document.createElement('div');
    c.className = 'sq';
    c.style.cssText = `width:${CELL}px;height:${CELL}px;font-size:15px;font-weight:800;cursor:pointer;background:var(--surface);`;
    c.addEventListener('click', ()=>tryPlace(i));
    grid.appendChild(c);
    cellEls.push(c);
  }

  function tryPlace(i){
    if(over || turn !== youAre || cells[i]) return;
    place(i, youAre);
    sendMove({ index:i });
  }
  function place(i, who){
    cells[i] = who;
    cellEls[i].textContent = who === 'A' ? '●' : '●';
    cellEls[i].style.color = who === 'A' ? 'var(--coral)' : 'var(--teal-deep)';
    const win = checkWin(i, who);
    if(win){
      over = true;
      win.forEach(idx=>cellEls[idx].style.background = 'var(--surface-2)');
      setStatus(who === youAre ? T('you_win') : T('opp_win'));
      return;
    }
    if(cells.every(c=>c)){ over = true; setStatus(T('draw')); return; }
    turn = who === 'A' ? 'B' : 'A';
    updateStatus();
  }
  function checkWin(idx, who){
    const r0 = Math.floor(idx/SIZE), c0 = idx%SIZE;
    const dirs = [[1,0],[0,1],[1,1],[1,-1]];
    for(const [dr,dc] of dirs){
      let line = [idx];
      for(let dir=-1; dir<=1; dir+=2){
        let r=r0+dr*dir, c=c0+dc*dir;
        while(r>=0&&r<SIZE&&c>=0&&c<SIZE&&cells[r*SIZE+c]===who){
          line.push(r*SIZE+c);
          r+=dr*dir; c+=dc*dir;
        }
      }
      if(line.length>=WIN_LEN) return line;
    }
    return null;
  }
  function updateStatus(){
    if(over) return;
    setStatus(turn === youAre ? T('your_turn') : T('opp_turn'));
  }
  updateStatus();

  return { isOver:()=>over,
 receiveMove(payload){ if(over) return; place(payload.index, turn); } };
};
})();
