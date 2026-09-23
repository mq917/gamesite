(function(){
window.GAME_MODULES = window.GAME_MODULES || {};

window.GAME_MODULES.reversi = function(ctx){
  const { container, youAre, sendMove, setStatus } = ctx;
  const N = 8, CELL = 42;
  const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  let board = Array.from({length:N}, ()=>Array(N).fill(null));
  board[3][3]='B'; board[3][4]='A'; board[4][3]='A'; board[4][4]='B';
  let turn = 'A';
  let over = false;

  container.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'board-grid';
  grid.style.gridTemplateColumns = `repeat(${N}, ${CELL}px)`;
  grid.style.gap = '2px';
  grid.style.background = 'var(--teal-deep)';
  grid.style.padding = '6px';
  grid.style.borderRadius = '8px';
  container.appendChild(grid);

  const cellEls = [];
  for(let r=0;r<N;r++){ cellEls.push([]); for(let c=0;c<N;c++){
    const el = document.createElement('div');
    el.className='sq';
    el.style.cssText = `width:${CELL}px;height:${CELL}px;background:#1f8f74;cursor:pointer;position:relative;border-radius:3px;`;
    el.addEventListener('click', ()=>tryPlace(r,c));
    grid.appendChild(el);
    cellEls[r].push(el);
  }}

  function legalMoves(who){
    const moves=[];
    for(let r=0;r<N;r++)for(let c=0;c<N;c++){
      if(board[r][c]) continue;
      if(flipsFor(r,c,who).length) moves.push([r,c]);
    }
    return moves;
  }
  function flipsFor(r,c,who){
    const opp = who==='A'?'B':'A';
    let all=[];
    for(const [dr,dc] of DIRS){
      let rr=r+dr, cc=c+dc, line=[];
      while(rr>=0&&rr<N&&cc>=0&&cc<N&&board[rr][cc]===opp){ line.push([rr,cc]); rr+=dr; cc+=dc; }
      if(line.length && rr>=0&&rr<N&&cc>=0&&cc<N&&board[rr][cc]===who) all=all.concat(line);
    }
    return all;
  }

  function render(){
    const moves = new Set(legalMoves(turn).map(([r,c])=>r+'_'+c));
    for(let r=0;r<N;r++)for(let c=0;c<N;c++){
      const el = cellEls[r][c];
      el.innerHTML='';
      if(board[r][c]){
        const disc=document.createElement('div');
        disc.style.cssText=`width:80%;height:80%;margin:10%;border-radius:50%;background:${board[r][c]==='A'?'var(--coral)':'#14161F'};border:2px solid rgba(0,0,0,.25);`;
        el.appendChild(disc);
      } else if(!over && turn===youAre && moves.has(r+'_'+c)){
        el.style.boxShadow='inset 0 0 0 3px rgba(255,255,255,.55)';
      } else {
        el.style.boxShadow='none';
      }
    }
  }

  function tryPlace(r,c){
    if(over || turn!==youAre) return;
    const flips = flipsFor(r,c,turn);
    if(!flips.length) return;
    applyMove(r,c,turn,flips);
    sendMove({ index:[r,c] });
  }

  function applyMove(r,c,who,flips){
    board[r][c]=who;
    flips.forEach(([fr,fc])=>board[fr][fc]=who);
    advanceTurn();
  }

  function advanceTurn(){
    const next = turn==='A'?'B':'A';
    checkEndOrPass(next);
  }

  function checkEndOrPass(next){
    const nextMoves = legalMoves(next);
    if(nextMoves.length){
      turn = next;
      render(); updateStatus();
      return;
    }
    const otherMoves = legalMoves(next==='A'?'B':'A');
    if(!otherMoves.length){
      // никто не может ходить — конец игры
      over = true;
      render();
      finish();
    } else {
      // next пропускает ход
      turn = next==='A'?'B':'A';
      render();
      setStatus((turn===youAre?'Ты ходишь':'Соперник ходит') + ' — у соперника не было ходов, ход пропущен');
    }
  }

  function finish(){
    let a=0,b=0;
    board.forEach(row=>row.forEach(v=>{ if(v==='A')a++; if(v==='B')b++; }));
    const myScore = youAre==='A'?a:b, oppScore = youAre==='A'?b:a;
    if(myScore>oppScore) setStatus(`Игра окончена: ты выиграл(а) ${myScore}:${oppScore} 🎉`);
    else if(myScore<oppScore) setStatus(`Игра окончена: соперник выиграл ${oppScore}:${myScore}`);
    else setStatus(`Ничья ${myScore}:${myScore}`);
  }

  function updateStatus(){
    if(over) return;
    setStatus(turn===youAre?'Твой ход':'Ход соперника');
  }

  render(); updateStatus();

  return {
    receiveMove(payload){
      if(over) return;
      const [r,c] = payload.index;
      const flips = flipsFor(r,c,turn);
      applyMove(r,c,turn,flips);
    }
  };
};
})();
