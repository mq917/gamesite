(function(){
"use strict";

const DICTS = {
en: {
  brand: "TWO-PLAYER ARENA",
  online_tooltip: "Players online right now",

  setup_title: "What should we call you?",
  age_label_prefix: "Age:",
  setup_sub: "No sign-up. Everything stays only in this tab.",
  nick_label: "Nickname",
  nick_placeholder: "e.g. Breezy",
  gender_label: "Your gender",
  gender_m: "♂ Male",
  gender_f: "♀ Female",
  gender_o: "✧ Rather not say",
  age_label: "Age: {age}",
  setup_continue: "Continue →",

  lobby_h1: "Choose a game",
  lobby_p: "Your opponent will be of the opposite gender, as close in age as possible. A match needs approval from both sides.",
  stats_waiting: "waiting",

  waiting_title: "Looking for an opponent…",
  waiting_title_confirm: "Waiting for the other player to confirm…",
  waiting_sub: "Game: {game}",
  waiting_of_game: "waiting for this game",
  waiting_tolerance: "age tolerance",
  cancel_search: "Cancel search",

  proposal_eyebrow: "Opponent found",
  proposal_note: "If you skip, this player won't be suggested again until you close the tab.",
  decline: "Skip",
  accept: "Play!",
  gender_short_m: "M",
  gender_short_f: "F",
  gender_short_o: "—",
  years_old: "{age} y.o.",

  leave_room: "← Leave",
  vs: "vs",
  you_suffix: " (you)",
  chat_placeholder: "Message your opponent…",
  ad_slot: "Ad space",

  opponent_found_chat: "Opponent found: {name}. Good luck!",
  opponent_left_chat: "Opponent left the game.",
  opponent_left_status: "Opponent left the game.",
  opponent_declined_toast: "Opponent declined, still searching…",
  connection_lost_toast: "Connection lost. Please refresh the page.",
  opponent_left_toast: "Opponent left the game",

  your_turn: "Your turn",
  opp_turn: "Opponent's turn",
  you_win: "You won! 🎉",
  opp_win: "Opponent won.",
  draw: "Draw!",

  game_chess_name: "Chess",
  game_chess_desc: "Classic. Legal moves are highlighted.",
  game_checkers_name: "Checkers",
  game_checkers_desc: "Captures are mandatory, moves highlighted.",
  game_tictactoe_name: "Tic-Tac-Toe 5×5",
  game_tictactoe_desc: "Get 3 in a row on a big board.",
  game_battleship_name: "Battleship",
  game_battleship_desc: "Shuffle your fleet, then sink the enemy's.",

  ttt_your_mark: "Your turn ({mark})",
  ttt_opp_mark: "Opponent's turn ({mark})",

  checkers_continue_you: "Keep capturing with the same piece",
  checkers_continue_opp: "Opponent is still capturing",

  chess_your_turn: "Your turn (white)",
  chess_check_suffix: " — check!",
  chess_mate_win: "Checkmate! You won 🎉",
  chess_mate_lose: "Checkmate! Opponent won.",
  chess_stalemate: "Stalemate — draw.",
  chess_50move: "Draw (50 moves without a capture).",

  bs_your_field: "Your fleet",
  bs_opp_field: "Opponent's field — fire here",
  bs_shuffle: "🔀 Shuffle",
  bs_ready_btn: "✅ Ready",
  bs_setup_hint: "Your fleet is already on the field. Shuffle it if you don't like it, then press Ready.",
  bs_placed: "Ready ✓",
  bs_wait_opp_ready: "Waiting for the opponent to get ready…",
  bs_ready_start: "Arrange your fleet and press Ready",
  bs_your_shot: "Your turn — fire at the opponent's field",
  bs_opp_aiming: "Opponent is taking aim…",
  bs_waiting_result: "Waiting for the shot result…",
  bs_you_sunk: "Opponent sank your whole fleet 😢",
  bs_opp_sunk: "You sank the opponent's whole fleet! 🎉",
  bs_hit: "Hit!",
  bs_miss: "Miss",
  bs_sunk_ship: "Ship sunk!",
  bs_opp_hit: "Opponent hit your ship",
  bs_opp_miss: "Opponent missed",
  bs_opp_sunk_ship: "Opponent sank your ship!",
  bs_fleet_line: "Ships left — you: {you} · opponent: {opp}",

  rematch: "Rematch",
  rematch_waiting: "Waiting for the opponent to accept the rematch…",
  rematch_starting: "Starting a new game…",
  rematch_swapped: "Sides are swapped for the rematch.",
  back_lobby: "Back to game menu",
  rematch_opponent: "Your opponent wants a rematch!",

  gchat_title: "Global chat",
  gchat_placeholder: "Say something funny…",
  gchat_hint: "Words and funny emoji only — no links or phone numbers.",
  gchat_empty: "It's quiet here. Break the silence! 🦗",
  gchat_online: "{n} online",
  gchat_slow: "Not so fast — wait a second.",
  gchat_rejected: "Message not sent: words and emoji only.",
},
ru: {
  brand: "ИГРА НАДВОИХ",
  online_tooltip: "Игроков онлайн сейчас",

  setup_title: "Как к тебе обращаться?",
  age_label_prefix: "Возраст:",
  setup_sub: "Без регистрации. Всё хранится только в этой вкладке.",
  nick_label: "Никнейм",
  nick_placeholder: "Например, Ветерок",
  gender_label: "Твой пол",
  gender_m: "♂ Мужской",
  gender_f: "♀ Женский",
  gender_o: "✧ Не скажу",
  age_label: "Возраст: {age}",
  setup_continue: "Продолжить →",

  lobby_h1: "Выбери игру",
  lobby_p: "Соперник — противоположного пола, максимально близкий по возрасту. Пара подбирается и подтверждается обеими сторонами.",
  stats_waiting: "ждут",

  waiting_title: "Ищем соперника…",
  waiting_title_confirm: "Ждём подтверждения соперника…",
  waiting_sub: "Игра: {game}",
  waiting_of_game: "ждут этой игры",
  waiting_tolerance: "допуск по возрасту",
  cancel_search: "Отменить поиск",

  proposal_eyebrow: "Соперник найден",
  proposal_note: "Если пропустишь — этот игрок больше не предложится, пока не закроешь вкладку.",
  decline: "Пропустить",
  accept: "Играть!",
  gender_short_m: "М",
  gender_short_f: "Ж",
  gender_short_o: "—",
  years_old: "{age} лет",

  leave_room: "← Выйти",
  vs: "vs",
  you_suffix: " (ты)",
  chat_placeholder: "Написать сопернику…",
  ad_slot: "Место для рекламы",

  opponent_found_chat: "Соперник найден: {name}. Удачи!",
  opponent_left_chat: "Соперник покинул игру.",
  opponent_left_status: "Соперник вышел из игры.",
  opponent_declined_toast: "Соперник отказался, ищем дальше…",
  connection_lost_toast: "Соединение потеряно. Обновите страницу.",
  opponent_left_toast: "Соперник покинул игру",

  your_turn: "Твой ход",
  opp_turn: "Ход соперника",
  you_win: "Ты выиграл(а)! 🎉",
  opp_win: "Соперник выиграл.",
  draw: "Ничья!",

  game_chess_name: "Шахматы",
  game_chess_desc: "Классика. Ходы подсвечиваются.",
  game_checkers_name: "Шашки",
  game_checkers_desc: "Взятие обязательно, ходы подсвечены.",
  game_tictactoe_name: "Крестики-нолики 5×5",
  game_tictactoe_desc: "Собери 3 в ряд на большом поле.",
  game_battleship_name: "Морской бой",
  game_battleship_desc: "Перемешай свой флот и топи корабли врага.",

  ttt_your_mark: "Твой ход ({mark})",
  ttt_opp_mark: "Ход соперника ({mark})",

  checkers_continue_you: "Продолжай взятие тем же ходом",
  checkers_continue_opp: "Соперник продолжает взятие",

  chess_your_turn: "Твой ход (белые)",
  chess_check_suffix: " — шах!",
  chess_mate_win: "Мат! Ты выиграл(а) 🎉",
  chess_mate_lose: "Мат! Соперник выиграл.",
  chess_stalemate: "Пат — ничья.",
  chess_50move: "Ничья (50 ходов без взятий).",

  bs_your_field: "Твой флот",
  bs_opp_field: "Поле соперника — стреляй сюда",
  bs_shuffle: "🔀 Перемешать",
  bs_ready_btn: "✅ Готов",
  bs_setup_hint: "Твой флот уже на поле. Перемешай расстановку, если не нравится, и нажми «Готов».",
  bs_placed: "Готов ✓",
  bs_wait_opp_ready: "Ждём, когда соперник будет готов…",
  bs_ready_start: "Расставь флот и нажми «Готов»",
  bs_your_shot: "Твой ход — стреляй по полю соперника",
  bs_opp_aiming: "Соперник целится…",
  bs_waiting_result: "Ждём результат выстрела…",
  bs_you_sunk: "Соперник потопил весь твой флот 😢",
  bs_opp_sunk: "Ты потопил весь флот соперника! 🎉",
  bs_hit: "Попадание!",
  bs_miss: "Мимо",
  bs_sunk_ship: "Корабль потоплен!",
  bs_opp_hit: "Соперник попал по твоему кораблю",
  bs_opp_miss: "Соперник промахнулся",
  bs_opp_sunk_ship: "Соперник потопил твой корабль!",
  bs_fleet_line: "Кораблей осталось — у тебя: {you} · у соперника: {opp}",

  rematch: "Реванш",
  rematch_waiting: "Ждём согласия соперника на реванш…",
  rematch_starting: "Запускаем новую игру…",
  rematch_swapped: "В реванше стороны меняются.",
  back_lobby: "Вернуться в меню игр",
  rematch_opponent: "Соперник хочет реванш!",

  gchat_title: "Общий чат",
  gchat_placeholder: "Скажи что-нибудь смешное…",
  gchat_hint: "Только слова и смешные смайлики — без ссылок и номеров.",
  gchat_empty: "Тут тихо. Нарушь тишину! 🦗",
  gchat_online: "{n} онлайн",
  gchat_slow: "Не так быстро — подожди секунду.",
  gchat_rejected: "Сообщение не отправлено: только слова и смайлики.",
},
az: {
  brand: "İKİ NƏFƏRLİ ARENA",
  online_tooltip: "Hazırda onlayn oyunçular",
  setup_title: "Sənə necə müraciət edək?",
  age_label_prefix: "Yaş:",
  setup_sub: "Qeydiyyat yoxdur. Məlumatlar yalnız bu vərəqdə saxlanılır.",
  nick_label: "Ləqəb",
  nick_placeholder: "məsələn, Breezy",
  gender_label: "Cinsiniz",
  gender_m: "♂ Kişi",
  gender_f: "♀ Qadın",
  gender_o: "✧ Demək istəmirəm",
  age_label: "Yaş: {age}",
  setup_continue: "Davam et →",
  lobby_h1: "Oyun seç",
  lobby_p: "Rəqib mümkün qədər yaxın yaşda və əks cinsdən seçilir. Oyun hər iki tərəfin təsdiqindən sonra başlayır.",
  stats_waiting: "gözləyir",
  waiting_title: "Rəqib axtarılır…",
  waiting_title_confirm: "Digər oyunçunun təsdiqi gözlənilir…",
  waiting_sub: "Oyun: {game}",
  waiting_of_game: "bu oyunu gözləyir",
  waiting_tolerance: "yaş fərqi",
  cancel_search: "Axtarışı ləğv et",
  proposal_eyebrow: "Rəqib tapıldı",
  proposal_note: "Keçsəniz, bu oyunçu vərəqi bağlayana qədər yenidən təklif olunmayacaq.",
  decline: "Keç",
  accept: "Oyna!",
  gender_short_m: "K",
  gender_short_f: "Q",
  gender_short_o: "—",
  years_old: "{age} yaş",
  leave_room: "← Çıx",
  vs: "vs",
  you_suffix: " (siz)",
  chat_placeholder: "Rəqibə mesaj yazın…",
  ad_slot: "Reklam sahəsi",
  opponent_found_chat: "Rəqib tapıldı: {name}. Uğurlar!",
  opponent_left_chat: "Rəqib oyunu tərk etdi.",
  opponent_left_status: "Rəqib oyunu tərk etdi.",
  opponent_declined_toast: "Rəqib imtina etdi, axtarış davam edir…",
  connection_lost_toast: "Bağlantı kəsildi. Səhifəni yeniləyin.",
  opponent_left_toast: "Rəqib oyunu tərk etdi",
  your_turn: "Sizin növbəniz",
  opp_turn: "Rəqibin növbəsi",
  you_win: "Siz qalib gəldiniz! 🎉",
  opp_win: "Rəqib qalib gəldi.",
  draw: "Heç-heçə!",
  game_chess_name: "Şahmat",
  game_chess_desc: "Klassik oyun. Qanuni gedişlər göstərilir.",
  game_checkers_name: "Dama",
  game_checkers_desc: "Vurma məcburidir, gedişlər göstərilir.",
  game_tictactoe_name: "Xaç-sıfır 5×5",
  game_tictactoe_desc: "Böyük lövhədə 3 nişanı ardıcıl düz.",
  game_battleship_name: "Dəniz döyüşü",
  game_battleship_desc: "Donanmanı qarışdır və rəqibin gəmilərini batır.",
  ttt_your_mark: "Sizin növbəniz ({mark})",
  ttt_opp_mark: "Rəqibin növbəsi ({mark})",
  checkers_continue_you: "Eyni daşla vurmağa davam edin",
  checkers_continue_opp: "Rəqib vurmağa davam edir",
  chess_your_turn: "Sizin növbəniz (ağlar)",
  chess_check_suffix: " — şah!",
  chess_mate_win: "Mat! Siz qalib gəldiniz 🎉",
  chess_mate_lose: "Mat! Rəqib qalib gəldi.",
  chess_stalemate: "Pat — heç-heçə.",
  chess_50move: "Heç-heçə (50 gediş ərzində vurma olmayıb).",
  bs_your_field: "Sizin donanmanız",
  bs_opp_field: "Rəqibin sahəsi — burada atəş açın",
  bs_shuffle: "🔀 Qarışdır",
  bs_ready_btn: "✅ Hazıram",
  bs_setup_hint: "Donanmanız artıq sahədədir. Xoşunuza gəlməsə qarışdırın, sonra «Hazıram» düyməsinə basın.",
  bs_placed: "Hazır ✓",
  bs_wait_opp_ready: "Rəqibin hazır olması gözlənilir…",
  bs_ready_start: "Donanmanı yerləşdirin və «Hazıram» düyməsinə basın",
  bs_your_shot: "Sizin növbəniz — rəqibin sahəsinə atəş açın",
  bs_opp_aiming: "Rəqib nişan alır…",
  bs_waiting_result: "Atəşin nəticəsi gözlənilir…",
  bs_you_sunk: "Rəqib bütün donanmanızı batırdı 😢",
  bs_opp_sunk: "Rəqibin bütün donanmasını batırdınız! 🎉",
  bs_hit: "Vurdunuz!",
  bs_miss: "Boş atəş",
  bs_sunk_ship: "Gəmi batdı!",
  bs_opp_hit: "Rəqib gəminizi vurdu",
  bs_opp_miss: "Rəqib boş atdı",
  bs_opp_sunk_ship: "Rəqib gəminizi batırdı!",
  bs_fleet_line: "Qalan gəmilər — sizdə: {you} · rəqibdə: {opp}",
  rematch: "Revanş",
  rematch_waiting: "Rəqibin revanşı qəbul etməsi gözlənilir…",
  rematch_starting: "Yeni oyun başlayır…",
  rematch_swapped: "Revanşda tərəflər dəyişir.",
  back_lobby: "Oyun menyusuna qayıt",
  rematch_opponent: "Rəqib revanş istəyir!",
  gchat_title: "Ümumi çat",
  gchat_placeholder: "Nəsə gülməli yaz…",
  gchat_hint: "Yalnız sözlər və gülməli smaylıklar — link və nömrə olmadan.",
  gchat_empty: "Burada sakitdir. Sükutu poz! 🦗",
  gchat_online: "{n} onlayn",
  gchat_slow: "Bu qədər tez yox — bir saniyə gözlə.",
  gchat_rejected: "Mesaj göndərilmədi: yalnız sözlər və smaylıklar.",
},
};

let currentLang = localStorage.getItem('bos_lang') || 'en';
const listeners = [];

function t(key, vars){
  const dict = DICTS[currentLang] || DICTS.en;
  let str = dict[key] !== undefined ? dict[key] : (DICTS.en[key] !== undefined ? DICTS.en[key] : key);
  if(vars){
    Object.keys(vars).forEach(k=>{
      str = str.split('{'+k+'}').join(vars[k]);
    });
  }
  return str;
}

function applyDom(root){
  root = root || document;
  root.querySelectorAll('[data-i18n]').forEach(el=>{
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
  root.querySelectorAll('[data-i18n-title]').forEach(el=>{
    el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
  });
}

function setLang(lang){
  if(!['en','ru','az'].includes(lang)) return;
  currentLang = lang;
  localStorage.setItem('bos_lang', lang);
  document.documentElement.setAttribute('lang', lang);
  applyDom(document);
  listeners.forEach(cb=>{ try{ cb(lang); }catch(e){} });
}

window.I18N = {
  t,
  getLang: ()=>currentLang,
  setLang,
  applyDom,
  onChange: (cb)=>listeners.push(cb),
};

document.documentElement.setAttribute('lang', currentLang);
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded', ()=>applyDom(document));
} else {
  applyDom(document);
}

})();
