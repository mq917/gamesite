(function(){
window.GAME_MODULES = window.GAME_MODULES || {};

window.GAME_MODULES.dots = function(ctx){
  const { container, youAre, sendMove, setStatus } = ctx;
  const T = window.I18N.t;
  const BOXES = 4; // 4x4 клетки -> 5x5 точек
  const DOTS = BOXES+1;
  const GAP = 52;
  const PAD = 20;

  // horiz[r][c] — линия между точкой (r,c) и (r,c+1), r:0..DOTS-1, c:0..BOXES-1
  // vert[r][c]  — линия между точкой (r,c) и (r+1,c), r:0..BOXES-1, c:0..DOTS-1
  let horiz = Array.from({length:DOTS}, ()=>Array(BOXES).fill(null));
  let vert  = Array.from({length:BOXES}, ()=>Array(DOTS).fill(null));
  let boxes = Array.from({length:BOXES}, ()=>Array(BOXES).fill(null));
  let turn='A', over=false;
  let score={A:0,B:0};

  const size = PAD*2 + GAP*BOXES;
  container.innerHTML='';
  const svgNS='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(svgNS,'svg');
  svg.setAttribute('width',size); svg.setAttribute('height',size);
  container.appendChild(svg);

  function px(i){ return PAD + i*GAP; }

  function colorFor(side){ return side==='A' ? 'var(--coral)' : 'var(--teal-deep)'; }

  function draw(){
    svg.innerHTML='';
    // заполненные клетки
    for(let r=0;r<BOXES;r++)for(let c=0;c<BOXES;c++){
      if(boxes[r][c]){
        const rect=document.createElementNS(svgNS,'rect');
        rect.setAttribute('x',px(c)+4); rect.setAttribute('y',px(r)+4);
        rect.setAttribute('width',GAP-8); rect.setAttribute('height',GAP-8);
        rect.setAttribute('fill', boxes[r][c]==='A' ? 'rgba(255,107,74,.25)' : 'rgba(18,119,107,.25)');
        svg.appendChild(rect);
        const t=document.createElementNS(svgNS,'text');
        t.setAttribute('x',px(c)+GAP/2); t.setAttribute('y',px(r)+GAP/2+5);
        t.setAttribute('text-anchor','middle'); t.setAttribute('font-size','14');
        t.setAttribute('fill', colorFor(boxes[r][c]));
        t.textContent = boxes[r][c]==='A' ? '✕' : '◯';
        svg.appendChild(t);
      }
    }
    // горизонтальные линии
    for(let r=0;r<DOTS;r++)for(let c=0;c<BOXES;c++){
      const line=document.createElementNS(svgNS,'line');
      line.setAttribute('x1',px(c)); line.setAttribute('y1',px(r));
      line.setAttribute('x2',px(c+1)); line.setAttribute('y2',px(r));
      line.setAttribute('stroke-width', horiz[r][c]?6:10);
      line.setAttribute('stroke-linecap','round');
      line.setAttribute('stroke', horiz[r][c] ? colorFor(horiz[r][c]) : 'var(--border-color)');
      line.style.cursor = (!over && !horiz[r][c] && turn===youAre) ? 'pointer':'default';
      line.style.opacity = horiz[r][c] ? 1 : 0.35;
      line.addEventListener('click', ()=>tryLine('h',r,c));
      svg.appendChild(line);
    }
    // вертикальные линии
    for(let r=0;r<BOXES;r++)for(let c=0;c<DOTS;c++){
      const line=document.createElementNS(svgNS,'line');
      line.setAttribute('x1',px(c)); line.setAttribute('y1',px(r));
      line.setAttribute('x2',px(c)); line.setAttribute('y2',px(r+1));
      line.setAttribute('stroke-width', vert[r][c]?6:10);
      line.setAttribute('stroke-linecap','round');
      line.setAttribute('stroke', vert[r][c] ? colorFor(vert[r][c]) : 'var(--border-color)');
      line.style.cursor = (!over && !vert[r][c] && turn===youAre) ? 'pointer':'default';
      line.style.opacity = vert[r][c] ? 1 : 0.35;
      line.addEventListener('click', ()=>tryLine('v',r,c));
      svg.appendChild(line);
    }
    // точки
    for(let r=0;r<DOTS;r++)for(let c=0;c<DOTS;c++){
      const dot=document.createElementNS(svgNS,'circle');
      dot.setAttribute('cx',px(c)); dot.setAttribute('cy',px(r)); dot.setAttribute('r',4);
      dot.setAttribute('fill','var(--fg)');
      svg.appendChild(dot);
    }
  }

  function tryLine(kind,r,c){
    if(over||turn!==youAre) return;
    if(kind==='h' && horiz[r][c]) return;
    if(kind==='v' && vert[r][c]) return;
    applyLine(kind,r,c,turn);
    sendMove({kind,r,c});
  }

  function boxesCompletedBy(kind,r,c){
    const completed=[];
    if(kind==='h'){
      if(r>0 && horiz[r][c] && vert[r-1][c] && vert[r-1][c+1]) completed.push([r-1,c]);
      if(r<BOXES && vert[r][c] && vert[r][c+1]) completed.push([r,c]);
    } else {
      if(c>0 && vert[r][c] && horiz[r][c-1] && horiz[r+1][c-1]) completed.push([r,c-1]);
      if(c<BOXES && horiz[r][c] && horiz[r+1][c]) completed.push([r,c]);
    }
    return completed;
  }

  function applyLine(kind,r,c,who){
    if(kind==='h') horiz[r][c]=who; else vert[r][c]=who;
    // проверяем какие клетки закрылись именно этой линией
    let gained=0;
    for(let br=0;br<BOXES;br++)for(let bc=0;bc<BOXES;bc++){
      if(boxes[br][bc]) continue;
      if(horiz[br][bc] && horiz[br+1][bc] && vert[br][bc] && vert[br][bc+1]){
        boxes[br][bc]=who; score[who]++; gained++;
      }
    }
    draw();
    const totalBoxes = BOXES*BOXES;
    if(score.A+score.B === totalBoxes){
      over=true;
      const my=score[youAre], opp=score[youAre==='A'?'B':'A'];
      setStatus(my>opp? T('dots_win',{a:my,b:opp}) : my<opp? T('dots_lose',{a:my,b:opp}) : T('dots_draw',{a:my,b:opp}));
      return;
    }
    if(gained===0) turn = who==='A'?'B':'A'; // без завершённой клетки ход переходит
    updateStatus();
  }
  function updateStatus(){
    if(over) return;
    setStatus(T('dots_status',{who: turn===youAre?T('your_turn'):T('opp_turn'), a:score.A, b:score.B}));
  }

  draw(); updateStatus();

  return { isOver:()=>over,

    receiveMove(payload){ if(over) return; applyLine(payload.kind,payload.r,payload.c,turn); }
  };
};
})();
