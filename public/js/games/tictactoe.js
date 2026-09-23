(function(){
window.GAME_MODULES = window.GAME_MODULES || {};

window.GAME_MODULES.tictactoe = function(ctx){
  const { container, youAre, sendMove, setStatus } = ctx;
  const SIZE = 5, WIN_LEN = 3;
  const myMark = youAre === 'A' ? '✕' : '◯';
  const oppMark = youAre === 'A' ? '◯' : '✕';
  let cells = Array(SIZE*SIZE).fill(null);
  let turn = 'A';
  let over = false;

  container.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'board-grid';
  grid.style.gridTemplateColumns = `repeat(${SIZE}, 46px)`;
  grid.style.gap = '4px';
  container.appendChild(grid);

  const cellEls = [];
  for(let i=0;i<SIZE*SIZE;i++){
    const c = document.createElement('div');
    c.className = 'sq';
    c.style.cssText = 'width:46px;height:46px;font-size:22px;font-weight:800;border:2px solid var(--border-color);border-radius:8px;cursor:pointer;background:var(--surface);';
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
    cellEls[i].textContent = who === 'A' ? '✕' : '◯';
    cellEls[i].style.color = who === 'A' ? 'var(--coral)' : 'var(--teal-deep)';
    const win = checkWin(who);
    if(win){
      over = true;
      win.forEach(idx=>cellEls[idx].style.background = 'var(--surface-2)');
      setStatus(who === youAre ? 'Ты выиграл(а)! 🎉' : 'Соперник выиграл.');
      return;
    }
    if(cells.every(c=>c)){
      over = true;
      setStatus('Ничья!');
      return;
    }
    turn = who === 'A' ? 'B' : 'A';
    updateStatus();
  }

  function checkWin(who){
    const dirs = [[1,0],[0,1],[1,1],[1,-1]];
    for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){
      if(cells[r*SIZE+c] !== who) continue;
      for(const [dr,dc] of dirs){
        const line=[r*SIZE+c];
        let ok=true;
        for(let k=1;k<WIN_LEN;k++){
          const nr=r+dr*k, nc=c+dc*k;
          if(nr<0||nr>=SIZE||nc<0||nc>=SIZE||cells[nr*SIZE+nc]!==who){ ok=false; break; }
          line.push(nr*SIZE+nc);
        }
        if(ok) return line;
      }
    }
    return null;
  }

  function updateStatus(){
    if(over) return;
    setStatus(turn === youAre ? `Твой ход (${myMark})` : `Ход соперника (${oppMark})`);
  }
  updateStatus();

  return {
    receiveMove(payload){
      if(over) return;
      place(payload.index, turn); // it's opponent's turn by construction
    }
  };
};
})();
