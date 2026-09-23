(function(){
window.GAME_MODULES = window.GAME_MODULES || {};

// A придумывает слово, B отгадывает.
window.GAME_MODULES.hangman = function(ctx){
  const { container, youAre, sendMove, setStatus } = ctx;
  const setter = 'A', guesser = 'B';
  const MAX_WRONG = 6;
  const STAGES = ['🙂','😟','😦','😧','😱','💀','☠️'];

  let secret = '';       // известен только setter'у
  let length = 0;
  let guessedLetters = new Set();
  let wrongCount = 0;
  let over = false;
  let phase = youAre===setter ? 'typing' : 'waiting';

  container.innerHTML='';
  const wrap=document.createElement('div');
  wrap.style.cssText='width:100%;max-width:420px;text-align:center;';
  container.appendChild(wrap);

  function renderTyping(){
    wrap.innerHTML = `
      <p style="margin-bottom:10px;font-weight:700;">Загадай слово для соперника</p>
      <input id="hmWordInput" maxlength="20" style="width:100%;padding:12px;border-radius:8px;border:2px solid var(--border-color);background:var(--bg);color:var(--fg);font-size:16px;text-align:center;letter-spacing:2px;" placeholder="слово или фраза" autocomplete="off">
      <button id="hmSetBtn" class="btn-primary" style="margin-top:12px;width:100%;">Загадать</button>
      <p style="margin-top:10px;font-size:12px;color:var(--muted);">Соперник увидит только количество букв.</p>
    `;
    wrap.querySelector('#hmSetBtn').addEventListener('click', ()=>{
      const val = wrap.querySelector('#hmWordInput').value.trim().toLowerCase();
      if(!val) return;
      secret = val;
      length = [...val].filter(ch=>ch!==' ').length;
      const spaces = [...val].map(ch=>ch===' ');
      sendMove({ type:'word', pattern: [...val].map(ch=> ch===' ' ? ' ' : null) });
      phase='guessing_wait';
      setStatus('Соперник отгадывает…');
      renderSetterView();
    });
  }

  function renderSetterView(){
    wrap.innerHTML = `<p style="font-size:22px;letter-spacing:4px;font-family:var(--font-display);">${maskDisplay()}</p>
      <p style="margin-top:10px;color:var(--muted);">Ошибок: ${wrongCount}/${MAX_WRONG} ${STAGES[wrongCount]}</p>
      <p style="margin-top:6px;font-size:13px;color:var(--muted);">Слово: <b style="color:var(--fg);">${secret}</b> (видно только тебе)</p>`;
  }

  function maskDisplay(){
    return [...secret].map(ch=> ch===' ' ? '  ' : (guessedLetters.has(ch) ? ch : '_')).join(' ');
  }

  function renderWaiting(){
    wrap.innerHTML = `<p style="color:var(--muted);">Соперник придумывает слово…</p>`;
  }

  let pattern = [];
  function renderGuessing(){
    const display = pattern.map(ch => ch===' ' ? '  ' : (guessedLetters.has(ch) ? ch : (ch===null?'_':ch))).join(' ');
    wrap.innerHTML = `
      <p style="font-size:22px;letter-spacing:4px;font-family:var(--font-display);">${display.replace(/_/g, m=>'_')}</p>
      <p style="margin-top:8px;color:var(--muted);">Ошибок: ${wrongCount}/${MAX_WRONG} ${STAGES[wrongCount]}</p>
      <div id="hmKeys" style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:14px;"></div>
    `;
    const keysEl = wrap.querySelector('#hmKeys');
    const alphabet = 'абвгдежзийклмнопрстуфхцчшщыэюя'.split('');
    alphabet.forEach(letter=>{
      const b=document.createElement('button');
      b.textContent=letter;
      const already = guessedLetters.has(letter);
      b.disabled = already || over;
      b.style.cssText=`width:30px;height:34px;border-radius:6px;border:2px solid var(--border-color);background:${already?'var(--surface-2)':'var(--surface)'};font-weight:700;cursor:${already||over?'default':'pointer'};`;
      b.addEventListener('click', ()=>{
        if(guessedLetters.has(letter)||over) return;
        sendMove({ type:'guess', letter });
        setStatus('Ждём ответ…');
        b.disabled=true;
      });
      keysEl.appendChild(b);
    });
  }

  function updateGuessingBoard(){
    if(youAre===guesser) renderGuessing();
    else renderSetterView();
  }

  if(phase==='typing') renderTyping(); else renderWaiting();
  setStatus(youAre===setter ? 'Придумай слово' : 'Ждём соперника…');

  return {
    receiveMove(payload){
      if(over) return;
      if(payload.type==='word'){
        pattern = payload.pattern.map(v=>v); // null for letters, ' ' for spaces
        length = pattern.filter(v=>v!==' ').length;
        phase='guessing';
        setStatus('Твой ход — выбирай буквы');
        updateGuessingBoard();
        return;
      }
      if(payload.type==='guess'){
        // я — setter, проверяю букву в своём secret
        const letter = payload.letter;
        const positions = [];
        [...secret].forEach((ch,i)=>{ if(ch===letter) positions.push(i); });
        const correct = positions.length>0;
        if(!correct) wrongCount++;
        else guessedLetters.add(letter);
        const wordGuessed = [...secret].every(ch => ch===' ' || guessedLetters.has(ch));
        const lost = wrongCount>=MAX_WRONG;
        sendMove({ type:'guess_result', letter, correct, positions, wrongCount, wordGuessed, lost, secret: (wordGuessed||lost)?secret:undefined });
        renderSetterView();
        if(wordGuessed){ over=true; setStatus('Соперник отгадал слово!'); }
        else if(lost){ over=true; setStatus('Соперник не угадал — ты выиграл(а)! 🎉'); }
        return;
      }
      if(payload.type==='guess_result'){
        const { letter, correct, positions, wrongCount:wc, wordGuessed, lost, secret:revealed } = payload;
        guessedLetters.add(letter);
        wrongCount = wc;
        if(correct && positions) positions.forEach(i => { pattern[i] = letter; });
        if(wordGuessed){
          over=true;
          if(revealed) pattern = [...revealed].map(ch => ch);
          setStatus('Ты отгадал(а) слово! 🎉');
        } else if(lost){
          over=true;
          setStatus('Попытки закончились. Слово было: ' + (revealed||''));
        } else {
          setStatus('Твой ход — выбирай буквы');
        }
        updateGuessingBoard();
      }
    }
  };
};
})();
