(function(){
window.GAME_MODULES = window.GAME_MODULES || {};

// A = "красные" (внизу для A), B = "белые". 8x8, тёмные клетки играбельны.
window.GAME_MODULES.checkers = function(ctx){
  const { container, youAre, sendMove, setStatus } = ctx;
  const N = 8, CELL = 44;
  let board = Array.from({length:N}, ()=>Array(N).fill(null)); // {side:'A'|'B', king:bool}
  for(let r=0;r<3;r++)for(let c=0;c<N;c++) if((r+c)%2===1) board[r][c]={side:'B',king:false};
  for(let r=5;r<8;r++)for(let c=0;c<N;c++) if((r+c)%2===1) board[r][c]={side:'A',king:false};

  let turn='A';
  let over=false;
  let selected=null; // [r,c]
  let legalForSelected=[]; // [{to:[r,c], captured:[[r,c],...], path:[[r,c],...]}]
  const flip = youAre==='B';

  container.innerHTML='';
  const grid=document.createElement('div');
  grid.className='board-grid';
  grid.style.gridTemplateColumns=`repeat(${N}, ${CELL}px)`;
  grid.style.border='3px solid var(--border-color)';
  container.appendChild(grid);

  const cellEls=[];
  for(let rr=0;rr<N;rr++){ cellEls.push([]); for(let cc=0;cc<N;cc++){
    const [r,c] = flip ? [N-1-rr, N-1-cc] : [rr,cc];
    const el=document.createElement('div');
    el.className='sq';
    const dark=(r+c)%2===1;
    el.style.cssText=`width:${CELL}px;height:${CELL}px;background:${dark?'#7a5a43':'#e9d9c4'};cursor:pointer;position:relative;`;
    el.dataset.r=r; el.dataset.c=c;
    el.addEventListener('click', ()=>onCellClick(r,c));
    grid.appendChild(el);
    cellEls[r] = cellEls[r]||[];
    cellEls[r][c]=el;
  }}

  function pieceCaptures(r,c,piece, b){
    b = b || board;
    const dirs = piece.king ? [[-1,-1],[-1,1],[1,-1],[1,1]] : [[-1,-1],[-1,1],[1,-1],[1,1]];
    const opp = piece.side==='A'?'B':'A';
    const results=[];
    for(const [dr,dc] of dirs){
      if(piece.king){
        let rr=r+dr, cc=c+dc, seenEnemy=null;
        while(rr>=0&&rr<N&&cc>=0&&cc<N){
          const cell=b[rr][cc];
          if(!cell){ if(seenEnemy){ results.push({to:[rr,cc], captured:[seenEnemy]}); } rr+=dr; cc+=dc; continue; }
          if(cell.side===opp && !seenEnemy){ seenEnemy=[rr,cc]; rr+=dr; cc+=dc; continue; }
          break;
        }
      } else {
        const mr=r+dr, mc=c+dc, lr=r+dr*2, lc=c+dc*2;
        if(mr<0||mr>=N||mc<0||mc>=N||lr<0||lr>=N||lc<0||lc>=N) continue;
        const mid=b[mr][mc], land=b[lr][lc];
        if(mid && mid.side===opp && !land) results.push({to:[lr,lc], captured:[[mr,mc]]});
      }
    }
    return results;
  }
  function pieceSlides(r,c,piece){
    if(over) return [];
    const results=[];
    const dirs = piece.king ? [[-1,-1],[-1,1],[1,-1],[1,1]] : (piece.side==='A' ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]]);
    if(piece.king){
      for(const [dr,dc] of dirs){
        let rr=r+dr, cc=c+dc;
        while(rr>=0&&rr<N&&cc>=0&&cc<N&&!board[rr][cc]){ results.push({to:[rr,cc], captured:[]}); rr+=dr; cc+=dc; }
      }
    } else {
      for(const [dr,dc] of dirs){
        const rr=r+dr, cc=c+dc;
        if(rr>=0&&rr<N&&cc>=0&&cc<N&&!board[rr][cc]) results.push({to:[rr,cc], captured:[]});
      }
    }
    return results;
  }

  // все обязательные взятия для стороны (с учётом цепочек через рекурсивный поиск максимума не требуем — упрощённо: любой захват обязателен, продолжение цепочки обязательно тем же шашками пока есть взятия)
  function allCapturesForSide(side){
    const out=[];
    for(let r=0;r<N;r++)for(let c=0;c<N;c++){
      const p=board[r][c];
      if(p && p.side===side){
        const caps=pieceCaptures(r,c,p);
        if(caps.length) out.push({from:[r,c]});
      }
    }
    return out;
  }

  function movesFor(r,c){
    const p=board[r][c];
    if(!p||p.side!==turn) return [];
    const mustCapture = allCapturesForSide(turn).length>0;
    const caps = pieceCaptures(r,c,p);
    if(mustCapture) return caps;
    return pieceSlides(r,c,p);
  }

  function onCellClick(r,c){
    if(over||turn!==youAre) return;
    const p = board[r][c];
    if(selected && legalForSelected.some(m=>m.to[0]===r&&m.to[1]===c)){
      const move = legalForSelected.find(m=>m.to[0]===r&&m.to[1]===c);
      doMove(selected, move);
      sendMove({ from:selected, to:move.to, captured:move.captured });
      return;
    }
    if(p && p.side===youAre){
      const moves = movesFor(r,c);
      if(!moves.length){ selected=null; legalForSelected=[]; render(); return; }
      selected=[r,c]; legalForSelected=moves; render();
    } else {
      selected=null; legalForSelected=[]; render();
    }
  }

  function doMove(from, move){
    const [fr,fc]=from, [tr,tc]=move.to;
    const p = board[fr][fc];
    board[fr][fc]=null;
    move.captured.forEach(([cr,cc])=>board[cr][cc]=null);
    if((p.side==='A'&&tr===0)||(p.side==='B'&&tr===N-1)) p.king=true;
    board[tr][tc]=p;

    // цепочка захвата тем же зверем
    if(move.captured.length){
      const more = pieceCaptures(tr,tc,p);
      if(more.length){
        selected=[tr,tc]; legalForSelected=more; render();
        setStatus(turn===youAre ? 'Продолжай взятие тем же ходом' : 'Соперник продолжает взятие');
        return;
      }
    }
    selected=null; legalForSelected=[];
    endTurn();
  }

  function endTurn(){
    const next = turn==='A'?'B':'A';
    const hasAny = hasAnyMove(next);
    if(!hasAny){
      over=true; render();
      setStatus((turn===youAre?'Ты выиграл(а)! 🎉':'Соперник выиграл.'));
      return;
    }
    turn=next; render(); updateStatus();
  }
  function hasAnyMove(side){
    for(let r=0;r<N;r++)for(let c=0;c<N;c++){
      const p=board[r][c];
      if(p&&p.side===side){
        const mustCapture=allCapturesForSide(side).length>0;
        const m = mustCapture?pieceCaptures(r,c,p):pieceSlides(r,c,p).concat(pieceCaptures(r,c,p));
        if(m.length) return true;
      }
    }
    return false;
  }

  function render(){
    for(let r=0;r<N;r++)for(let c=0;c<N;c++){
      const el=cellEls[r][c]; el.innerHTML=''; el.style.boxShadow='none';
      const p=board[r][c];
      if(p){
        const d=document.createElement('div');
        const col = p.side==='A' ? '#D9502F' : '#F1EFE7';
        d.style.cssText=`width:78%;height:78%;margin:11%;border-radius:50%;background:${col};border:2px solid rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:16px;`;
        if(p.king) d.textContent='♛';
        el.appendChild(d);
      }
      if(selected && selected[0]===r&&selected[1]===c) el.style.boxShadow='inset 0 0 0 3px var(--coral)';
    }
    legalForSelected.forEach(m=>{
      const el=cellEls[m.to[0]][m.to[1]];
      el.style.boxShadow='inset 0 0 0 4px var(--teal)';
    });
  }
  function updateStatus(){
    if(over) return;
    setStatus(turn===youAre?'Твой ход':'Ход соперника');
  }

  render(); updateStatus();

  return {
    receiveMove(payload){
      if(over) return;
      const p = board[payload.from[0]][payload.from[1]];
      if(!p) return;
      doMove(payload.from, { to:payload.to, captured:payload.captured });
    }
  };
};
})();
