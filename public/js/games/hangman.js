(function(){
window.GAME_MODULES = window.GAME_MODULES || {};

window.GAME_MODULES.hangman = function(ctx){
  const { container, youAre, sendMove, setStatus } = ctx;
  const T = window.I18N.t;
  const setter='A', guesser='B', MAX_WRONG=6;
  const STAGES=['🙂','😟','😦','😧','😱','💀','☠️'];

  let secret='', pattern=[], guessedLetters=new Set(), wrongCount=0, over=false;
  let phase=youAre===setter?'typing':'waiting';

  container.innerHTML='';
  const wrap=document.createElement('div');
  wrap.style.cssText='width:100%;max-width:520px;text-align:center;';
  container.appendChild(wrap);

  function mask(word){
    return [...word].map(ch=>ch===' ' ? '  ' : (guessedLetters.has(ch)?ch:'_')).join(' ');
  }

  function renderTyping(message=''){
    wrap.innerHTML='';
    const p=document.createElement('p');
    p.textContent=T('hm_prompt');
    p.style.cssText='margin-bottom:10px;font-weight:700;';
    wrap.appendChild(p);

    const input=document.createElement('input');
    input.id='hmWordInput';
    input.maxLength=24;
    input.autocomplete='off';
    input.spellcheck=false;
    input.inputMode='latin';
    input.placeholder=T('hm_placeholder');
    input.style.cssText='width:100%;padding:12px;border-radius:8px;border:2px solid var(--border-color);background:var(--bg);color:var(--fg);font-size:16px;text-align:center;letter-spacing:2px;';
    wrap.appendChild(input);

    const btn=document.createElement('button');
    btn.id='hmSetBtn';
    btn.className='btn-primary';
    btn.textContent=T('hm_set_btn');
    btn.style.cssText='margin-top:12px;width:100%;';
    wrap.appendChild(btn);

    const hint=document.createElement('p');
    hint.textContent=T('hm_hint_only_length');
    hint.style.cssText='margin-top:10px;font-size:12px;color:var(--muted);';
    wrap.appendChild(hint);

    const msgEl=document.createElement('p');
    msgEl.id='hmWordMsg';
    msgEl.style.cssText='margin-top:8px;font-size:12px;color:var(--coral);min-height:18px;';
    msgEl.textContent=message;
    wrap.appendChild(msgEl);

    btn.addEventListener('click', async ()=>{
      const val=input.value.trim().toLowerCase();
      if(!/^[a-z]+$/.test(val) || val.length<2){
        msgEl.textContent=T('hm_invalid_word'); return;
      }
      btn.disabled=true; input.disabled=true; msgEl.style.color='var(--muted)';
      msgEl.textContent=T('hm_checking_word');
      let valid=null;
      try{
        const r=await fetch('/api/check-word?word='+encodeURIComponent(val),{cache:'no-store'});
        if(r.ok){ const data=await r.json(); valid=!!data.valid; }
      }catch(e){}
      if(valid===false){
        btn.disabled=false; input.disabled=false; msgEl.style.color='var(--coral)';
        msgEl.textContent=T('hm_invalid_word'); return;
      }
      if(valid===null){
        // Без доступа к словарю не блокируем игру полностью: допускаем только латинское слово.
        msgEl.textContent=T('hm_dictionary_unavailable');
      }
      secret=val;
      pattern=[...val].map(ch=>ch===' '? ' ':null);
      guessedLetters=new Set(); wrongCount=0; over=false;
      sendMove({type:'word',pattern});
      phase='guessing_wait';
      setStatus(T('hm_waiting_guess'));
      renderSetterView();
    });
  }

  function renderSetterView(){
    wrap.innerHTML='';
    const title=document.createElement('div');
    title.style.cssText='font-size:28px;letter-spacing:5px;font-family:var(--font-display);';
    title.textContent=mask(secret);
    wrap.appendChild(title);

    const m=document.createElement('p');
    m.style.cssText='margin-top:10px;color:var(--muted);';
    m.textContent=T('hm_mistakes',{n:wrongCount,max:MAX_WRONG,stage:STAGES[wrongCount]});
    wrap.appendChild(m);

    const w=document.createElement('p');
    w.style.cssText='margin-top:6px;font-size:13px;color:var(--muted);';
    w.textContent=T('hm_word_visible',{word:secret});
    wrap.appendChild(w);
  }

  function renderWaiting(){
    wrap.innerHTML='';
    const p=document.createElement('p');
    p.style.color='var(--muted)';
    p.textContent=T('hm_waiting_word');
    wrap.appendChild(p);
  }

  function renderGuessing(){
    wrap.innerHTML='';
    const display=document.createElement('div');
    display.style.cssText='font-size:28px;letter-spacing:5px;font-family:var(--font-display);word-break:break-word;';
    display.textContent=pattern.map(ch=>ch===' ' ? '  ' : (ch===null?'_':ch)).join(' ');
    wrap.appendChild(display);

    const m=document.createElement('p');
    m.style.cssText='margin-top:8px;color:var(--muted);';
    m.textContent=T('hm_mistakes',{n:wrongCount,max:MAX_WRONG,stage:STAGES[wrongCount]});
    wrap.appendChild(m);

    const keys=document.createElement('div');
    keys.style.cssText='display:grid;grid-template-columns:repeat(9,minmax(28px,1fr));gap:6px;margin-top:16px;';
    wrap.appendChild(keys);

    for(const letter of 'abcdefghijklmnopqrstuvwxyz'){
      const b=document.createElement('button');
      b.type='button'; b.textContent=letter.toUpperCase();
      const used=guessedLetters.has(letter);
      b.disabled=used||over;
      b.style.cssText='height:36px;border-radius:7px;border:2px solid var(--border-color);background:'+(used?'var(--surface-2)':'var(--surface)')+';color:var(--fg);font-weight:800;text-transform:uppercase;';
      b.addEventListener('click',()=>{
        if(used||over) return;
        guessedLetters.add(letter);
        b.disabled=true;
        b.style.background='var(--surface-2)';
        sendMove({type:'guess',letter});
        setStatus(T('hm_waiting_answer'));
      });
      keys.appendChild(b);
    }
  }

  function revealSecret(){
    if(!secret) return;
    pattern=[...secret].map(ch=>ch);
  }

  function renderCurrent(){
    if(youAre===setter) renderSetterView(); else renderGuessing();
  }

  if(phase==='typing') renderTyping(); else renderWaiting();
  setStatus(youAre===setter?T('hm_your_pick'):T('hm_wait_opp'));

  return {
    isOver:()=>over,
    receiveMove(payload){
      if(over) return;

      if(payload.type==='word'){
        pattern=payload.pattern.map(v=>v);
        guessedLetters=new Set();
        wrongCount=0;
        phase='guessing';
        setStatus(T('hm_your_turn_pick_letter'));
        renderGuessing();
        return;
      }

      if(payload.type==='guess'){
        const letter=String(payload.letter||'').toLowerCase();
        if(!/^[a-z]$/.test(letter)) return;
        const positions=[];
        [...secret].forEach((ch,i)=>{if(ch===letter) positions.push(i);});
        const correct=positions.length>0;
        if(!correct) wrongCount++;
        else guessedLetters.add(letter);
        const wordGuessed=[...secret].every(ch=>ch===' '||guessedLetters.has(ch));
        const lost=wrongCount>=MAX_WRONG;
        sendMove({type:'guess_result',letter,correct,positions,wrongCount,wordGuessed,lost,secret:(wordGuessed||lost)?secret:undefined});
        renderSetterView();
        if(wordGuessed){over=true;setStatus(T('hm_opp_guessed'));}
        else if(lost){over=true;setStatus(T('hm_opp_failed_you_win'));}
        return;
      }

      if(payload.type==='guess_result'){
        const letter=String(payload.letter||'').toLowerCase();
        if(/^[a-z]$/.test(letter)) guessedLetters.add(letter);
        wrongCount=Number(payload.wrongCount)||0;
        if(payload.correct && Array.isArray(payload.positions)){
          payload.positions.forEach(i=>{pattern[i]=letter;});
        }
        if(payload.wordGuessed){
          over=true; revealSecret(); setStatus(T('hm_you_guessed'));
        }else if(payload.lost){
          over=true;
          if(payload.secret) {secret=payload.secret; revealSecret();}
          setStatus(T('hm_you_failed',{word:payload.secret||''}));
        }else{
          setStatus(T('hm_your_turn_pick_letter'));
        }
        renderGuessing();
      }
    }
  };
};
})();