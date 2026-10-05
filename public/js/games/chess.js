(function(){
window.GAME_MODULES = window.GAME_MODULES || {};

// A = белые (снизу для A), B = чёрные.
window.GAME_MODULES.chess = function(ctx){
  const { container, youAre, sendMove, setStatus } = ctx;
  const T = window.I18N.t;
  const N=8, CELL=44;
  const WHITE='A', BLACK='B';
  const flip = youAre===BLACK;

  // board[r][c] = {type:'p|n|b|r|q|k', side:'A'|'B', moved:bool} or null
  let board, turn, over, enPassant, selected, legalForSelected;
  let halfmoveNoCapture=0;

  function initBoard(){
    board = Array.from({length:N}, ()=>Array(N).fill(null));
    const back = ['r','n','b','q','k','b','n','r'];
    for(let c=0;c<N;c++){
      board[0][c] = { type:back[c], side:BLACK, moved:false };
      board[1][c] = { type:'p', side:BLACK, moved:false };
      board[6][c] = { type:'p', side:WHITE, moved:false };
      board[7][c] = { type:back[c], side:WHITE, moved:false };
    }
    turn = WHITE; over=false; enPassant=null; selected=null; legalForSelected=[];
  }
  initBoard();

  const GLYPH = {
    p:{A:'♙',B:'♟'}, n:{A:'♘',B:'♞'}, b:{A:'♗',B:'♝'},
    r:{A:'♖',B:'♜'}, q:{A:'♕',B:'♛'}, k:{A:'♔',B:'♚'}
  };

  container.innerHTML='';
  const grid=document.createElement('div');
  grid.className='board-grid';
  grid.style.gridTemplateColumns=`repeat(${N}, ${CELL}px)`;
  grid.style.border='3px solid var(--border-color)';
  container.appendChild(grid);

  const cellEls=[];
  for(let i=0;i<N;i++) cellEls.push(Array(N).fill(null));
  for(let rr=0;rr<N;rr++)for(let cc=0;cc<N;cc++){
    const [r,c] = flip ? [N-1-rr,N-1-cc] : [rr,cc];
    const el=document.createElement('div');
    const dark=(r+c)%2===1;
    el.style.cssText=`width:${CELL}px;height:${CELL}px;background:${dark?'#b58863':'#f0d9b5'};display:flex;align-items:center;justify-content:center;font-size:30px;cursor:pointer;position:relative;`;
    el.addEventListener('click', ()=>onCellClick(r,c));
    grid.appendChild(el);
    cellEls[r][c]=el;
  }

  function inBounds(r,c){ return r>=0&&r<N&&c>=0&&c<N; }
  function cloneBoard(b){ return b.map(row=>row.map(p=>p?{...p}:null)); }

  function findKing(b, side){
    for(let r=0;r<N;r++)for(let c=0;c<N;c++) if(b[r][c] && b[r][c].type==='k' && b[r][c].side===side) return [r,c];
    return null;
  }

  function attacksSquare(b, side, r, c){
    // есть ли у side фигура, атакующая клетку r,c
    for(let rr=0;rr<N;rr++)for(let cc=0;cc<N;cc++){
      const p=b[rr][cc];
      if(!p||p.side!==side) continue;
      if(pseudoAttacks(b,p,rr,cc).some(([tr,tc])=>tr===r&&tc===c)) return true;
    }
    return false;
  }

  // клетки, которые фигура "бьёт" (для пешки — только диагонали, не ход вперёд)
  function pseudoAttacks(b,p,r,c){
    const out=[];
    const dir = p.side===WHITE ? -1 : 1;
    if(p.type==='p'){
      [[dir,-1],[dir,1]].forEach(([dr,dc])=>{ const nr=r+dr,nc=c+dc; if(inBounds(nr,nc)) out.push([nr,nc]); });
    } else if(p.type==='n'){
      [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]].forEach(([dr,dc])=>{
        const nr=r+dr,nc=c+dc; if(inBounds(nr,nc)) out.push([nr,nc]);
      });
    } else if(p.type==='k'){
      for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){ if(!dr&&!dc) continue; const nr=r+dr,nc=c+dc; if(inBounds(nr,nc)) out.push([nr,nc]); }
    } else {
      const dirs = p.type==='b' ? [[-1,-1],[-1,1],[1,-1],[1,1]]
        : p.type==='r' ? [[-1,0],[1,0],[0,-1],[0,1]]
        : [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];
      dirs.forEach(([dr,dc])=>{
        let nr=r+dr,nc=c+dc;
        while(inBounds(nr,nc)){
          out.push([nr,nc]);
          if(b[nr][nc]) break;
          nr+=dr; nc+=dc;
        }
      });
    }
    return out;
  }

  function pseudoMoves(b,p,r,c){
    const moves=[];
    if(p.type==='p'){
      const dir = p.side===WHITE?-1:1;
      const startRow = p.side===WHITE?6:1;
      const oneR=r+dir;
      if(inBounds(oneR,c) && !b[oneR][c]){
        moves.push([oneR,c]);
        const twoR=r+dir*2;
        if(r===startRow && !b[twoR][c]) moves.push([twoR,c]);
      }
      [[dir,-1],[dir,1]].forEach(([dr,dc])=>{
        const nr=r+dr, nc=c+dc;
        if(!inBounds(nr,nc)) return;
        if(b[nr][nc] && b[nr][nc].side!==p.side) moves.push([nr,nc]);
        else if(enPassant && enPassant[0]===nr && enPassant[1]===nc && !b[nr][nc]) moves.push([nr,nc]);
      });
    } else {
      pseudoAttacks(b,p,r,c).forEach(([nr,nc])=>{
        if(!b[nr][nc] || b[nr][nc].side!==p.side) moves.push([nr,nc]);
      });
      if(p.type==='k' && !p.moved){
        // рокировка
        tryCastle(b,p,r,c,moves,'k');
        tryCastle(b,p,r,c,moves,'q');
      }
    }
    return moves;
  }
  function tryCastle(b,king,r,c,moves,side){
    const rookCol = side==='k'?7:0;
    const rook = b[r][rookCol];
    if(!rook || rook.type!=='r' || rook.moved) return;
    const step = side==='k'?1:-1;
    const between = side==='k' ? [c+1,c+2] : [c-1,c-2,c-3];
    for(const cc of between) if(b[r][cc]) return;
    const opp = king.side===WHITE?BLACK:WHITE;
    if(attacksSquare(b,opp,r,c)) return;
    if(attacksSquare(b,opp,r,c+step)) return;
    if(attacksSquare(b,opp,r,c+step*2)) return;
    moves.push([r, c+step*2]);
  }

  function legalMovesFor(r,c){
    const p=board[r][c];
    if(!p||p.side!==turn) return [];
    const raw = pseudoMoves(board,p,r,c);
    const legal=[];
    for(const [nr,nc] of raw){
      const b2 = cloneBoard(board);
      simulateMove(b2, [r,c], [nr,nc], p);
      const kingPos = findKing(b2, p.side);
      if(kingPos && !attacksSquare(b2, p.side===WHITE?BLACK:WHITE, kingPos[0], kingPos[1])) legal.push([nr,nc]);
    }
    return legal;
  }

  function simulateMove(b, from, to, piece){
    const [fr,fc]=from,[tr,tc]=to;
    // en passant capture
    if(piece.type==='p' && fc!==tc && !b[tr][tc]){
      b[fr][tc]=null; // взяли пешку проходом
    }
    b[fr][fc]=null;
    const moved = {...piece, moved:true};
    if(piece.type==='p' && (tr===0||tr===N-1)) moved.type='q';
    b[tr][tc]=moved;
    // рокировка — переносим ладью
    if(piece.type==='k' && Math.abs(tc-fc)===2){
      if(tc>fc){ b[tr][5]=b[tr][7]; b[tr][7]=null; if(b[tr][5]) b[tr][5].moved=true; }
      else { b[tr][3]=b[tr][0]; b[tr][0]=null; if(b[tr][3]) b[tr][3].moved=true; }
    }
  }

  function onCellClick(r,c){
    if(over||turn!==youAre) return;
    if(selected && legalForSelected.some(([lr,lc])=>lr===r&&lc===c)){
      doMove(selected,[r,c]);
      sendMove({ from:selected, to:[r,c] });
      return;
    }
    const p=board[r][c];
    if(p && p.side===youAre){
      selected=[r,c]; legalForSelected=legalMovesFor(r,c); render();
    } else { selected=null; legalForSelected=[]; render(); }
  }

  function doMove(from,to){
    const [fr,fc]=from,[tr,tc]=to;
    const p = board[fr][fc];
    const wasPawn = p.type==='p';
    const wasTwoStep = wasPawn && Math.abs(tr-fr)===2;
    const capture = !!board[tr][tc] || (wasPawn && fc!==tc && !board[tr][tc]);
    simulateMove(board, from, to, p);
    enPassant = wasTwoStep ? [(fr+tr)/2, fc] : null;
    selected=null; legalForSelected=[];
    halfmoveNoCapture = capture ? 0 : halfmoveNoCapture+1;
    endTurn();
  }

  function endTurn(){
    const next = turn===WHITE?BLACK:WHITE;
    turn = next;
    const anyMoves = hasAnyLegalMove(next);
    const inCheck = (()=>{ const k=findKing(board,next); return k && attacksSquare(board, next===WHITE?BLACK:WHITE, k[0],k[1]); })();
    render();
    if(!anyMoves){
      over=true;
      if(inCheck) setStatus(next!==youAre ? T('chess_mate_win') : T('chess_mate_lose'));
      else setStatus(T('chess_stalemate'));
      return;
    }
    if(halfmoveNoCapture>=100){ over=true; setStatus(T('chess_50move')); return; }
    setStatus((turn===youAre?T('your_turn'):T('opp_turn')) + (inCheck?T('chess_check_suffix'):''));
  }
  function hasAnyLegalMove(side){
    for(let r=0;r<N;r++)for(let c=0;c<N;c++){
      if(board[r][c] && board[r][c].side===side){
        const savedTurn=turn; turn=side;
        const m = legalMovesFor(r,c);
        turn=savedTurn;
        if(m.length) return true;
      }
    }
    return false;
  }

  function render(){
    for(let r=0;r<N;r++)for(let c=0;c<N;c++){
      const el=cellEls[r][c];
      const p=board[r][c];
      el.textContent = p ? GLYPH[p.type][p.side] : '';
      el.style.boxShadow='none';
      el.style.outline='none';
    }
    if(selected) cellEls[selected[0]][selected[1]].style.boxShadow='inset 0 0 0 3px var(--coral)';
    legalForSelected.forEach(([r,c])=>{
      cellEls[r][c].style.boxShadow = board[r][c] ? 'inset 0 0 0 4px var(--teal)' : 'inset 0 0 0 4px var(--teal)';
      if(!board[r][c]){
        const dot=document.createElement('div');
        dot.style.cssText='position:absolute;width:14px;height:14px;border-radius:50%;background:rgba(33,169,154,.75);';
        cellEls[r][c].style.position='relative';
      }
    });
  }
  setStatus(turn===youAre?T('chess_your_turn'):T('opp_turn'));
  render();

  return { isOver:()=>over,

    receiveMove(payload){
      if(over || !payload || !Array.isArray(payload.from) || !Array.isArray(payload.to)) return;
      const [fr,fc]=payload.from, [tr,tc]=payload.to;
      const p=board[fr] && board[fr][fc];
      // При рассинхронизации не ломаем обработчик WebSocket.
      if(!p || p.side!==turn) return;
      if(!legalMovesFor(fr,fc).some(([r,c])=>r===tr&&c===tc)) return;
      doMove(payload.from, payload.to);
      render();
    }
  };
};
})();
