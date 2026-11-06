'use strict';
/* ことばカード - 画面の処理 */

// ---------- 保存（Electron / 開発用のlocalStorage） ----------
const store = window.api || {
  load: async () => { try { return JSON.parse(localStorage.getItem('kotoba') || 'null'); } catch (e) { return null; } },
  save: async (d) => { try { localStorage.setItem('kotoba', JSON.stringify(d)); } catch (e) {} return true; },
  saveSync: (d) => { try { localStorage.setItem('kotoba', JSON.stringify(d)); } catch (e) {} return true; },
  dataPath: async () => t('browserStore'),
  openDataFolder: async () => {},
  exportFile: async () => null,
  importFile: async () => null
};

const DEFAULT_SETTINGS = {
  mode: 'order', filter: 'all', hideMode: 'none', autoNext: true, autoSpeak: false,
  playContent: 'wm', rate: 1.0, gap: 1, loop: false, accent: 'uk-f', jaVoice: '', zoom: 1, theme: 'sky', showRelated: true, useGeneral: true, webSearch: true, showIpa: true, showDict: true, imeAuto: true, lang: 'ja', blindAlpha: 3
};
const BLIND_MIN = 0, BLIND_MAX = 20, BLIND_DEF = 3; // 目隠しの透明度（％・1％単位）
const ZOOMS = [
  { v: 0.8 }, { v: 0.9 }, { v: 1 }, { v: 1.15 }, { v: 1.3 }
];
const GAPS = [0.1, 0.3, 0.5, 1, 2];
const SPEEDS = [0.5, 0.8, 1.0, 1.2, 1.5, 2.0, 2.5, 3.0];
const THEMES = [
  { id: 'sky', bg: '#EAF3FB', ac: '#4A8FCB' },
  { id: 'aqua', bg: '#E7F5F7', ac: '#3A9DA9' },
  { id: 'lavender', bg: '#EEF0FB', ac: '#6A7ED0' },
  { id: 'mist', bg: '#F3F6F9', ac: '#5C8DB8' },
  { id: 'cream', bg: '#FAF5EC', ac: '#D9835A' },
  { id: 'sakura', bg: '#FCEFF3', ac: '#C96B8C' },
  { id: 'rose', bg: '#F7EFF1', ac: '#A97888' }
];
const STATUS = {
  no: { get label() { return t('status.no'); }, cls: 's-no' },
  some: { get label() { return t('status.some'); }, cls: 's-some' },
  yes: { get label() { return t('status.yes'); }, cls: 's-yes' }
};

// サンプル単語は i18n.js（SAMPLE_WORDS・SAMPLE_TR）にあり、表示言語に合わせた意味・訳で作る

let db = { version: 1, words: [], settings: { ...DEFAULT_SETTINGS } };
const S = { openKeys: new Set(), search: '', queue: [], idx: 0, revealed: false, playing: false, speakingPart: null, editingId: null };
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const set = () => db.settings;

function newWord(o) {
  return {
    id: uid(), word: (o.word || '').trim(), meaning: (o.meaning || '').trim(),
    example: (o.example || '').trim(), exampleJa: (o.exampleJa || '').trim(), note: (o.note || '').trim(),
    status: o.status && STATUS[o.status] ? o.status : null,
    nNo: Number(o.nNo) || 0, nSome: Number(o.nSome) || 0, nYes: Number(o.nYes) || 0,
    views: Number(o.views) || 0, lastSeen: Number(o.lastSeen) || 0, created: Number(o.created) || Date.now(),
    related: Array.isArray(o.related) ? o.related : undefined,
    relatedKey: typeof o.relatedKey === 'string' ? o.relatedKey : undefined,
    relShown: Array.isArray(o.relShown) ? o.relShown : undefined,
    relCursor: typeof o.relCursor === 'number' ? o.relCursor : undefined,
    webState: typeof o.webState === 'string' ? o.webState : undefined,
    ipa: o.ipa && typeof o.ipa === 'object' ? { uk: String(o.ipa.uk || ''), us: String(o.ipa.us || '') } : undefined,
    ipaFor: typeof o.ipaFor === 'string' ? o.ipaFor : undefined,
    dictWeb: o.dictWeb && typeof o.dictWeb === 'object' && Array.isArray(o.dictWeb.blocks) ? o.dictWeb : undefined,
    // v1.34 同期用：最後に内容（単語・意味・理解度など）が変わった時刻と、その目印
    mtime: Number(o.mtime) || 0, _h: typeof o._h === 'string' ? o._h : undefined,
    sample: o.sample === true ? true : undefined // 初回に自動で入るサンプル単語（同期で重複させないため）
  };
}

// ---------- 保存 ----------
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (window.KCSync) KCSync.touch(); // 変わった単語に更新時刻をつける（同期用）
    store.save(db).catch(() => toast(t('toast.saveFail')));
    if (window.KCSync) KCSync.changed();
  }, 250);
}
window.addEventListener('beforeunload', () => { if (saveTimer) { clearTimeout(saveTimer); if (window.KCSync) KCSync.touch(); store.saveSync(db); } });
// 削除した単語を記録（同期したとき、ほかの端末からよみがえらないように）
function markDeleted(ids) {
  if (!db.deleted || typeof db.deleted !== 'object') db.deleted = {};
  const now = Date.now();
  for (const id of ids) if (id) db.deleted[id] = now;
}

// ---------- 出題順 ----------
const rank = (w) => ({ no: 0, some: 1 }[w.status] ?? (w.status === 'yes' ? 3 : 2));
function matchSearch(w) {
  if (!S.search) return true;
  const q = S.search.toLowerCase();
  return [w.word, w.meaning, w.example, w.exampleJa, w.note].some(t => (t || '').toLowerCase().includes(q));
}
function matchFilter(w) {
  const f = set().filter;
  if (f === 'all') return true;
  if (f === 'none') return !w.status;
  return w.status === f;
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// v1.27：理解度ボタンを押した回数（分からない nNo／少しわかる nSome／分かる nYes）で並べる
const cntNo = (w) => w.nNo || 0, cntSome = (w) => w.nSome || 0, cntYes = (w) => w.nYes || 0;
const unratedW = (w) => !w.status && !cntNo(w) && !cntSome(w) && !cntYes(w);
// v1.31：忘れかけた順（間隔反復の考え方）
// 記憶の持ち（日数）＝今の判定と、その判定が続いた回数で決める。判定が変わると回数は1からなので、持ちも短くなる。
//   分からない：0.5日（いつも上位）／少しわかる：1→2→4→8日…（最大60日）／分かる：3→7.5→19→47日…（最大180日）
// 覚えている見込み R ＝ 上限 × 0.9^(経過日数 ÷ 持ち)。持ちの日数がたつとちょうど上限の90％になる。
// 上限：分からない 50％／少しわかる 85％／分かる 100％。R が低い（忘れかけている）順に出す。未評価は最後（登録順）。
const DAY = 864e5;
function memStability(w) {
  const n = Math.max(1, { no: cntNo(w), some: cntSome(w), yes: cntYes(w) }[w.status] || 1);
  if (w.status === 'no') return 0.5;
  if (w.status === 'some') return Math.min(60, Math.pow(2, n - 1));
  if (w.status === 'yes') return Math.min(180, 3 * Math.pow(2.5, n - 1));
  return 0;
}
function memRetention(w, now = Date.now()) {
  if (!w.status) return null;
  const cap = { no: 0.5, some: 0.85, yes: 1 }[w.status];
  const days = Math.max(0, (now - (w.lastSeen || 0)) / DAY);
  return cap * Math.pow(0.9, days / memStability(w));
}
// 次に復習する目安（日数。0以下＝今日）
function nextReviewDays(w, now = Date.now()) {
  if (!w.status) return null;
  return Math.ceil(((w.lastSeen || 0) + memStability(w) * DAY - now) / DAY);
}
const byCreated = (a, b) => (a.created || 0) - (b.created || 0);
function buildQueue(keepId) {
  const mode = set().mode;
  const order = new Map(db.words.map((w, i) => [w.id, i]));
  const reg = (a, b) => byCreated(a, b) || (order.get(a.id) - order.get(b.id));
  let ws = db.words.filter(w => matchFilter(w) && matchSearch(w));
  if (mode === 'random') {
    shuffle(ws); // ランダム：毎回ランダムな順番
  } else if (mode === 'hard') {
    // 分からない順：「分からない」を押した回数が多い順（同じなら今の理解度が低い順 → 最後に見たのが古い順）
    shuffle(ws);
    ws.sort((a, b) => (cntNo(b) - cntNo(a)) || (rank(a) - rank(b)) || (a.lastSeen - b.lastSeen));
  } else if (mode === 'efficient') {
    // 効率学習：忘れかけた順（覚えている見込みが低い順。未評価は最後に登録順）
    const now = Date.now();
    shuffle(ws);
    ws.sort((a, b) => {
      const ra = memRetention(a, now), rb = memRetention(b, now);
      if (ra === null || rb === null) return (ra === null) - (rb === null) || reg(a, b);
      return (ra - rb) || (a.lastSeen - b.lastSeen);
    });
  } else if (mode === 'alpha') {
    // v1.33：アルファベット順（大文字・小文字は区別しない。先頭の「〜」などの記号は無視）
    const key = (w) => String(w.word || '').replace(/^[^A-Za-z0-9]+/, '');
    ws.sort((a, b) => key(a).localeCompare(key(b), 'en', { sensitivity: 'base', numeric: true }) || reg(a, b));
  } else {
    ws.sort((a, b) => reg(b, a)); // 登録順：新しく登録した単語が上（v1.33）
  }
  S.queue = ws.map(w => w.id);
  const k = keepId ? S.queue.indexOf(keepId) : -1;
  S.idx = k >= 0 ? k : 0;
  S.revealed = false; S.openKeys.clear();
}
// 並べ直しボタンが不要な（順番が決まっている）出題順
const FIXED_ORDER = (m) => m === 'order' || m === 'alpha';
const byId = (id) => db.words.find(w => w.id === id);
const current = () => byId(S.queue[S.idx]);

// ---------- 描画：一覧 ----------
function renderFilters() {
  const c = { all: db.words.length, none: 0, no: 0, some: 0, yes: 0 };
  db.words.forEach(w => { c[w.status || 'none']++; });
  const defs = [
    ['all', t('filter.all'), ''], ['none', t('status.none'), 's-none'], ['no', t('status.no'), 's-no'],
    ['some', t('status.some'), 's-some'], ['yes', t('status.yes'), 's-yes']
  ];
  $('filters').innerHTML = defs.map(([k, label, cls]) =>
    `<button class="chip ${set().filter === k ? 'on' : ''}" data-f="${k}">` +
    `${cls ? `<span class="dot ${cls}"></span>` : ''}${label}<span class="n">${c[k]}</span></button>`).join('');
  $('listNote').textContent = t('list.note.' + set().mode) || '';
  $('totalCount').textContent = t('side.total', { n: db.words.length });
}

function renderList() {
  const ul = $('list');
  if (!S.queue.length) {
    ul.innerHTML = `<li class="list-empty">${db.words.length
      ? t('list.empty.filter')
      : t('list.empty.none')}</li>`;
    return;
  }
  const frag = document.createDocumentFragment();
  S.queue.forEach((id, i) => {
    const w = byId(id);
    const li = document.createElement('li');
    li.className = 'item' + (i === S.idx ? ' cur' : '');
    li.dataset.i = i;
    li.innerHTML = `<span class="dot ${w.status ? STATUS[w.status].cls : ''}"></span>` +
      `<div class="txt"><div class="w">${esc(w.word)}</div><div class="m">${set().hideMode === 'none' ? esc(w.meaning) : ''}</div></div>` +
      `<span class="num">${i + 1}</span>`;
    frag.appendChild(li);
  });
  ul.innerHTML = '';
  ul.appendChild(frag);
  scrollToCurrent();
}
function updateListCurrent() {
  document.querySelectorAll('#list .item.cur').forEach(el => el.classList.remove('cur'));
  const el = document.querySelector(`#list .item[data-i="${S.idx}"]`);
  if (el) el.classList.add('cur');
  scrollToCurrent();
}
function updateListItem(w) {
  const i = S.queue.indexOf(w.id);
  const el = document.querySelector(`#list .item[data-i="${i}"]`);
  if (!el) return;
  el.querySelector('.dot').className = 'dot ' + (w.status ? STATUS[w.status].cls : '');
  el.querySelector('.w').textContent = w.word;
  el.querySelector('.m').textContent = w.meaning;
}
function scrollToCurrent() {
  const el = document.querySelector('#list .item.cur');
  if (el) el.scrollIntoView({ block: 'nearest' });
}

// ---------- 描画：カード ----------
const SPEAKER = `<svg viewBox="0 0 24 24"><path d="M4 9.5h3.2L12 5.2v13.6l-4.8-4.3H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z"/><path class="wave" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>`;

function wordSize(text, compact) {
  const n = text.length;
  const base = n <= 8 ? 84 : n <= 12 ? 72 : n <= 18 ? 58 : n <= 26 ? 46 : 38;
  // カードの幅・高さに収まるように自動で縮める
  const fitW = (78 / Math.max(4, Math.min(n, 18) * 0.6)).toFixed(2);
  return `min(${base}px, ${fitW}cqw, ${compact ? 17 : 26}cqh)`;
}

function renderCard() {
  const card = $('card');
  const w = current();
  card.className = 'card' + (w && w.status ? ' st-' + w.status : '');

  if (!w) {
    card.innerHTML = db.words.length
      ? `<div class="empty"><h2>${t('card.empty.title')}</h2>${t('card.empty.filter')}</div>`
      : `<div class="empty"><h2>${t('card.welcome.title')}</h2>${t('card.welcome.body')}<br><button class="btn btn-primary" data-act="add">${t('card.welcome.btn')}</button></div>`;
    updateRate(); updateNav();
    return;
  }

  const showAns = set().hideMode !== 'all' || S.revealed;
  // 和訳の目隠し：クリックした部分だけ表示（Enterですべて表示）
  //   word … 大きく表示された単語の和訳（意味）だけ隠す ／ ja … 例文の和訳も含めてすべて隠す
  const blindOn = (set().hideMode === 'ja' || set().hideMode === 'word') && !S.revealed;
  const blind = (key, html) => blindOn && !S.openKeys.has(key) && (set().hideMode === 'ja' || key === 'm')
    ? `<span class="blind" data-act="unblind" data-k="${key}" data-label="${esc(t('blind'))}" title="${esc(t('blind'))}">${html}</span>`
    : html;
  const sp = S.speakingPart;
  const views = w.views ? t('card.views', { n: w.views }) : t('card.unseen');
  const hasRel = showAns && set().showRelated && shownRelated(w).length > 0;
  card.innerHTML = `
    <div class="card-top">
      <span>${S.idx + 1} / ${S.queue.length}</span>
      <span class="badge ${w.status ? 'b-' + w.status : ''}" title="${w.status ? esc(t('card.nextTip')) : ''}">${w.status ? STATUS[w.status].label : t('status.none')}${t('sep')}${views}${w.status ? t('sep') + (nextReviewDays(w) <= 0 ? t('card.dueNow') : t('card.dueIn', { n: nextReviewDays(w) })) : ''}</span>
    </div>
    <div class="card-body ${hasRel ? 'has-rel' : ''}">
      <div class="word-row">
        <h1 class="word ${sp === 'w' ? 'speaking' : ''}" style="font-size:${wordSize(w.word, hasRel)}">${esc(w.word)}</h1>
        <button class="speak" data-act="say-word" title="${t('card.speak')}">${SPEAKER}</button>
      </div>
      ${ipaHtml(w)}
      ${showAns ? `
        <div class="answer">
          <div class="meaning ${sp === 'm' ? 'speaking' : ''}">${blind('m', esc(w.meaning))}</div>
          ${dictHtml(w, blind)}
          ${w.example ? `
            <div class="ex-box">
              <p class="ex ${sp === 'e' ? 'speaking' : ''}">${esc(w.example)}</p>
              <button class="speak sm" data-act="say-ex" title="${t('card.speakEx')}">${SPEAKER}</button>
              ${w.exampleJa ? `<p class="exja ${sp === 'ej' ? 'speaking' : ''}">${blind('ej', esc(w.exampleJa))}</p>` : ''}
            </div>` : ''}
          ${w.note ? `<div class="note">${esc(w.note)}</div>` : ''}
          ${relatedHtml(w, blind)}
        </div>` : `
        <button class="btn btn-ghost reveal-btn" data-act="reveal">${t('card.reveal')}</button>
        <div class="hidden-hint">${t('card.revealHint')}</div>`}
    </div>
    <div class="card-actions">
      <button class="link-btn" data-act="edit">${t('card.edit')}</button>
      <button class="link-btn del" data-act="delete">${t('card.delete')}</button>
    </div>`;
  updateRate(); updateNav();
  ensureRelated(w);
  ensureIpa(w);
}

// ---------- 発音記号（1単語だけ登録されているとき、ネットで調べて表示） ----------
const isSingleWord = (s) => /^[A-Za-z][A-Za-z'’\-]*$/.test(String(s || '').trim());
const ipaPending = new Set(), ipaFail = {};
// 発音記号のアクセントを辞書式に：ˈ（第1）→ 母音の上に ´、ˌ（第2）→ 母音の上に `（例：/ˈsteɪ/ → /stéɪ/）
const IPA_V = 'aeiouyæɑɒɔəɛɜɪʊʌɐɘɵɨʉøœɶɤɯɞɚɝ';
function ipaAccent(ipa) {
  let s = String(ipa || '').replace(/'/g, 'ˈ').replace(/(?<=\S)\.(?=\S)/g, ''); // 音節の区切り「.」は外す
  const isV = (c) => IPA_V.includes(c);
  const out = [];
  let pending = null, marked = false;
  for (const ch of s) {
    if (ch === 'ˈ' || ch === 'ˌ') { pending = ch === 'ˈ' ? 'p' : 's'; continue; }
    if (pending && isV(ch)) {
      out.push(`<span class="ipa-acc ${pending === 'p' ? 'acc1' : 'acc2'}">${esc(ch)}${pending === 'p' ? '́' : '̀'}</span>`);
      marked = marked || pending === 'p'; pending = null; continue;
    }
    out.push(esc(ch));
  }
  // アクセント記号がなく、1音節だけの語（/steɪ/ など）は、その母音にアクセントを付ける
  if (!marked && !/[ˈˌ]/.test(s)) {
    const nuclei = s.match(new RegExp(`[${IPA_V}][${IPA_V}ːˑ]*`, 'g')) || [];
    if (nuclei.length === 1) {
      const i = [...s].findIndex(isV);
      const chars = [...s].map(esc);
      chars[i] = `<span class="ipa-acc acc1">${chars[i]}́</span>`;
      return chars.join('');
    }
  }
  return out.join('');
}
function ipaHtml(w) {
  if (!set().showIpa || !isSingleWord(w.word) || w.ipaFor !== w.word || !w.ipa) return '';
  const { uk, us } = w.ipa;
  if (!uk && !us) return '';
  const ukFirst = set().accent !== 'us-m';
  const item = (label, v, on) => v ? `<span class="ipa-item ${on ? 'on' : ''}"><span class="ipa-lab">${label}</span><span class="ipa-txt">${ipaAccent(v)}</span></span>` : '';
  const body = uk && us && uk === us
    ? `<span class="ipa-item on"><span class="ipa-txt">${ipaAccent(uk)}</span></span>`
    : (ukFirst ? item(t('ipa.uk'), uk, true) + item(t('ipa.us'), us, false) : item(t('ipa.us'), us, true) + item(t('ipa.uk'), uk, false));
  return `<div class="ipa" title="${esc(t('ipa.t'))}">${body}</div>`;
}
async function fetchIpa(w) {
  if (!window.api || !window.api.webPhonetic) return false;
  if (!set().showIpa || !isSingleWord(w.word) || w.ipaFor === w.word || ipaPending.has(w.id)) return false;
  if (ipaFail[w.id] && Date.now() - ipaFail[w.id] < 60000) return false;
  ipaPending.add(w.id);
  try {
    const r = await window.api.webPhonetic(w.word.trim());
    if (!r || !r.ok) { ipaFail[w.id] = Date.now(); return false; } // ネットにつながらない：後で再試行
    w.ipa = { uk: r.uk || '', us: r.us || '' };
    w.ipaFor = w.word;
    save();
    return true;
  } catch (e) { return false; } finally { ipaPending.delete(w.id); }
}
function ensureIpa(w) {
  if (!w || w.ipaFor === w.word || !isSingleWord(w.word) || !set().showIpa) return;
  fetchIpa(w).then(ch => { if (ch && current() && current().id === w.id && !S.playing) renderCard(); });
}
async function ipaBackground() {
  for (const w of db.words.slice()) {
    if (!set().showIpa) return;
    if (!isSingleWord(w.word) || w.ipaFor === w.word) continue;
    const ch = await fetchIpa(w);
    if (ch && current() && current().id === w.id && !S.playing) renderCard();
    await sleep(500);
  }
}

// ---------- 関連例文（同梱のTatoeba英日例文から自動検索） ----------
// 候補を最大20文保存し、そのうち2文を表示。「更新」で未表示の候補に入れ替える。
const REL_VER = 6; // v1.11：置き換え表現（A・B・sb・be・doing・〜 など）に対応したので探し直す // v1.8：TOEIC例文を3,277文に増やしたので全単語を探し直す（v1.9はネット検索の有無もキーに含む）
const relPending = new Set();
const relKey = (w) => `${REL_VER}|${set().useGeneral ? 1 : 0}${set().webSearch ? 1 : 0}|${w.word}|${w.meaning}|${w.example}` + (w.webState ? `|${CUR_LANG}` : '');
const webFail = {}; // ネットにつながらなかった単語（1分間は再試行しない）
function relShown(w) {
  const pool = w.related || [];
  if (!pool.length) return [];
  let s = Array.isArray(w.relShown) ? w.relShown.filter(i => i >= 0 && i < pool.length) : [];
  s = [...new Set(s)];
  for (let i = 0; s.length < Math.min(2, pool.length) && i < pool.length; i++) if (!s.includes(i)) s.push(i);
  w.relShown = s;
  return s;
}
function shownRelated(w) { return relShown(w).map(i => w.related[i]); }
// 次の候補（表示中のものは飛ばし、全部見たら最初に戻る）
function nextRelIdx(w, avoid) {
  const n = w.related.length;
  let c = typeof w.relCursor === 'number' ? w.relCursor : Math.max(...relShown(w));
  for (let k = 1; k <= n; k++) {
    const i = (c + k) % n;
    if (!avoid.includes(i)) { w.relCursor = i; return i; }
  }
  return -1;
}
function refreshRelated(slot) {
  const w = current();
  if (!w || !w.related) return;
  const shown = relShown(w).slice();
  if (w.related.length <= shown.length) { toast(t('toast.relNoMore')); return; }
  if (slot === 'all') {
    const a = nextRelIdx(w, shown);
    const b = shown.length > 1 ? nextRelIdx(w, [...shown, a]) : -1;
    w.relShown = [a, b].filter(i => i >= 0);
  } else {
    const k = Number(slot);
    const i = nextRelIdx(w, shown);
    if (i >= 0) shown[k] = i;
    w.relShown = shown;
  }
  save();
  renderCard();
  const el = document.querySelectorAll('.rel-item');
  if (slot === 'all') el.forEach(x => x.classList.add('fresh'));
  else if (el[Number(slot)]) el[Number(slot)].classList.add('fresh');
}
// 強調は登録した語（compare / with など）の部分だけ。A・B・sb・be・doing などに当たる語は強調しない（v1.20）
function markHit(r) {
  const en = String(r.en || '');
  let ranges = Array.isArray(r.h) ? r.h.filter(x => Array.isArray(x) && x[1] > x[0] && x[1] <= en.length) : null;
  if (!ranges || !ranges.length) {
    if (typeof r.s !== 'number' || r.e <= r.s) return esc(en);
    ranges = [[r.s, r.e]];
  }
  let out = '', pos = 0;
  for (const [s, e] of ranges) {
    if (s < pos) continue;
    out += esc(en.slice(pos, s)) + '<mark>' + esc(en.slice(s, e)) + '</mark>';
    pos = e;
  }
  return out + esc(en.slice(pos));
}
// 以前のバージョンで保存した例文には強調範囲がないので、表示するときに付け直して保存する
const hitFixing = new Set();
function fixHits(w) {
  if (!w || !Array.isArray(w.related) || !window.api?.relatedHits || hitFixing.has(w.id)) return;
  if (!w.related.some(r => r && r.h === undefined)) return;
  hitFixing.add(w.id);
  const word = w.word, list = w.related;
  window.api.relatedHits(word, list.map(r => r.en)).then(res => {
    if (w.word !== word || w.related !== list || !Array.isArray(res)) return;
    // 見つからなかった文は false（従来どおり一致部分全体を強調）にして、何度も問い合わせないようにする
    list.forEach((r, i) => { if (r && r.h === undefined) r.h = Array.isArray(res[i]) && res[i].length ? res[i] : false; });
    save();
    if (current() === w) renderCard();
  }).catch(() => {}).finally(() => hitFixing.delete(w.id));
}
const REFRESH = `<svg viewBox="0 0 24 24"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/></svg>`;
// ---------- 辞書の意味（v1.30）：入力した意味の下に、品詞付きで小さく補足 ----------
// 同梱の英和辞書（EJDict-hand＋WordNetの品詞）→ ない熟語はWiktionaryの訳語（検索情報）→ それもなければ中心の語の意味
const dictLocal = new Map();   // 単語 → 同梱辞書の結果（null＝なし）
const dictBusy = new Set();
const dictWebTry = new Map();  // 単語 → 最後にネットで調べようとした時刻（オフライン時の再試行用）
const DICT_POS = { '名': '名詞', '動': '動詞', '形': '形容詞', '副': '副詞', '前': '前置詞', '接': '接続詞', '代': '代名詞', '助': '助動詞', '冠': '冠詞', '間': '間投詞', '限': '限定詞', '句': '成句' };
const needDictWeb = (w) => {
  const d = w.dictWeb;
  if (d && d.word === w.word && (d.blocks.length || Date.now() - (d.at || 0) < 7 * 864e5)) return false; // 見つからなかった語は7日後に再検索
  return Date.now() - (dictWebTry.get(w.word) || 0) > 60000;
};
async function ensureDict(w) {
  if (!w || !set().showDict || !window.api?.dictLookup) return;
  const word = w.word, key = w.id + '|' + word;
  if (dictBusy.has(key)) return;
  const local = dictLocal.get(word);
  const wantWeb = (local === null || (local && !local.exact)) && set().webSearch && needDictWeb(w);
  if (local !== undefined && !wantWeb) return;
  dictBusy.add(key);
  try {
    if (local === undefined) {
      const r = await window.api.dictLookup(word);
      dictLocal.set(word, r || null);
    }
    const l2 = dictLocal.get(word);
    if ((l2 === null || (l2 && !l2.exact)) && set().webSearch && needDictWeb(w)) {
      dictWebTry.set(word, Date.now());
      const r = await window.api.dictWeb(word);
      if (r && r.ok && w.word === word) { w.dictWeb = { word, key: r.key || '', blocks: r.blocks || [], at: Date.now() }; save(); }
    }
  } catch (e) {}
  finally { dictBusy.delete(key); }
  if (current() === w && !S.playing) renderCard();
}
// 入力した意味との近さ（共通する漢字・カタカナ・2文字のつながり）で、近い意味を先に出す（v1.32）
const SIM_STOP = new Set(['する', 'して', 'した', 'ない', 'こと', 'もの', 'など', 'ている', 'れる', 'られ', 'させ', 'から', 'まで', 'での', 'には', 'との', 'への', 'ある', 'いる', 'なる']);
function simPrep(s) {
  s = String(s || '').replace(/[(（][^)）]*[)）]|〈[^〉]*〉|《[^》]*》|[A-Za-z]+|[〜～…・、，,；;／\/\s]/g, ' ');
  const chars = new Set(s.match(/[一-鿿々ァ-ヺ]/g) || []);
  const grams = new Set();
  for (const run of s.split(' ')) for (let i = 0; i + 1 < run.length; i++) { const g = run.slice(i, i + 2); if (!SIM_STOP.has(g)) grams.add(g); }
  return { chars, grams, text: s.replace(/\s+/g, '') };
}
function simScore(sense, q) {
  if (!q.text) return 0;
  const p = simPrep(sense);
  let sc = 0;
  for (const c of p.chars) if (q.chars.has(c)) sc += /[一-鿿々]/.test(c) ? 2 : 0.5;
  for (const g of p.grams) if (q.grams.has(g)) sc += 3;
  if (p.text && (q.text.includes(p.text) || p.text.includes(q.text))) sc += 5;
  return sc;
}
// 品詞の行・意味の並びを、入力した意味に近い順にする（同点なら辞書の順）
function rankBlocks(blocks, meaning) {
  const q = simPrep(meaning);
  return blocks.map((b, bi) => {
    const ss = b.senses.map((s, i) => ({ s, i, sc: simScore(s, q) })).sort((x, y) => (y.sc - x.sc) || (x.i - y.i));
    return { pos: b.pos, senses: ss, best: ss.length ? ss[0].sc : 0, bi };
  }).sort((x, y) => (y.best - x.best) || (x.bi - y.bi));
}
function dictHtml(w, blind = (k, h) => h) {
  if (!set().showDict || !w.word) return '';
  const local = dictLocal.get(w.word);
  if (local === undefined || ((local === null || !local.exact) && set().webSearch && needDictWeb(w))) ensureDict(w);
  const web = w.dictWeb && w.dictWeb.word === w.word && w.dictWeb.blocks.length ? w.dictWeb : null;
  let parts = [], isWeb = false;
  if (local && local.exact) parts = [{ key: local.key, blocks: local.blocks }];
  else if (web) { parts = [{ key: web.key || w.word, blocks: web.blocks }]; isWeb = true; }
  else if (local && local.parts) parts = local.parts;
  if (!parts.length) return '';
  const cut = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  const perPart = parts.length === 1 ? 4 : 2; // 1語なら品詞4行まで、熟語の中身の語は各2行まで
  let cells = '';
  for (const p of parts) {
    const ranked = rankBlocks(p.blocks, w.meaning).slice(0, perPart);
    ranked.forEach((b, i) => {
      const shown = b.senses.slice(0, 3).map(x => x.sc >= 3 ? `<b>${esc(cut(x.s, 26))}</b>` : esc(cut(x.s, 26))).join(' ／ ') + (b.senses.length > 3 ? ' …' : '');
      const full = `${p.key}：` + (b.pos ? `【${DICT_POS[b.pos] || b.pos}】` : '') + b.senses.map(x => x.s).join(' ／ ');
      cells += `<span class="dict-w${i ? ' cont' : ''}">${i ? '' : esc(p.key)}</span>` +
        `<span class="dict-p">${b.pos ? `<span class="dict-pos" data-pos="${esc(b.pos)}">${esc(DICT_POS[b.pos] || b.pos)}</span>` : ''}</span>` +
        `<span class="dict-s" title="${esc(cut(full, 800))}">${shown}</span>`;
    });
  }
  const head = isWeb ? `<span class="dict-src">${esc(t('dict.web'))}</span>` : '';
  return `<div class="dict">${blind('m', `${head}<span class="dict-grid">${cells}</span>`)}</div>`;
}

function relatedHtml(w, blind = (k, h) => h) {
  if (!set().showRelated) return '';
  const items = shownRelated(w);
  if (!items.length) {
    // 検索が終わっていて、見つからなかったときだけ案内を出す
    const offline = w.webState === 'offline' && w.relatedKey !== relKey(w);
    if ((w.relatedKey !== relKey(w) && !offline) || w.example) return '';
    const sub = offline
      ? t('rel.none.offline') + '<br>'
      : (set().webSearch ? t('rel.none.notfound') + '<br>' : '')
        + (set().useGeneral ? '' : t('rel.none.general') + '<br>');
    return `
    <div class="rel rel-none">
      <div class="rel-none-box">
        <p class="rel-none-title">${t('rel.none.title')}</p>
        <p class="rel-none-sub">${sub}${t('rel.none.own')}</p>
        <button class="btn btn-ghost btn-sm" data-act="edit-ex">${t('rel.none.btn')}</button>
      </div>
    </div>`;
  }
  const more = w.related.length > items.length;
  fixHits(w);
  return `
    <div class="rel">
      <div class="rel-head">
        <span>${t('rel.head')} <small>${t('rel.cands', { n: w.related.length })}</small></span>
        <button class="link-btn sm refresh-all" data-act="rel-all" ${more ? '' : `disabled title="${t('rel.nomore')}"`}>${REFRESH}${t('rel.refresh')}</button>
      </div>
      <div class="rel-list">${items.map((r, i) => `
        <div class="rel-item">
          <p class="rel-en ${S.speakingPart === 'r' + i ? 'speaking' : ''}">${r.src === 'g' ? `<span class="src-g" title="${esc(t('src.general.t'))}">${t('src.general')}</span>` : ''}${r.src === 'w' ? `<span class="src-g src-w" title="${esc(t('src.web.t', { s: r.source || t('internet') }))}">${t('src.web')}</span>` : ''}${markHit(r)}</p>
          <div class="rel-btns">
            <button class="speak xs" data-act="say-rel" data-i="${i}" title="${t('rel.speak')}">${SPEAKER}</button>
            <button class="rel-refresh" data-act="rel-one" data-i="${i}" ${more ? `title="${t('rel.one')}"` : `disabled title="${t('rel.nomore')}"`}>${REFRESH}</button>
          </div>
          <p class="rel-ja ${S.speakingPart === 'rj' + i ? 'speaking' : ''}">${r.src === 'w' ? `${r.ja ? blind('r' + i, esc(r.ja)) + '<br>' : ''}<span class="rel-src">${esc(t('rel.source', { s: r.source || t('internet') }))}${r.ja || CUR_LANG === 'en' ? '' : t('rel.noTrans')}</span>` : blind('r' + i, esc(r.ja))}</p>
        </div>`).join('')}</div>
    </div>`;
}
// 単語の登録・編集・表示のときに自動で検索して保存する（登録した「意味」に合う例文を優先）
async function fetchRelated(w) {
  if (!window.api || !window.api.related) return false;
  const key = relKey(w);
  if (w.relatedKey === key || relPending.has(w.id)) return false;
  if (webFail[w.id] && Date.now() - webFail[w.id] < 60000) return false;
  relPending.add(w.id);
  try {
    let r = await window.api.related(w.word, w.example, w.meaning, set().useGeneral);
    w.webState = undefined;
    // 同梱の例文で見つからなければ、インターネットで検索する
    if ((!Array.isArray(r) || !r.length) && set().webSearch && window.api.webExamples) {
      const res = await window.api.webExamples(w.word, CUR_LANG);
      if (!res || !res.ok) {
        webFail[w.id] = Date.now();
        w.webState = 'offline';
        w.related = [];
        return true; // 検索済みにしない（次回また探す）
      }
      r = res.items;
      w.webState = r.length ? 'found' : 'none';
    }
    w.related = Array.isArray(r) ? r : [];
    w.relatedKey = relKey(w); // ネット検索の結果なら表示言語もキーに含める
    w.relShown = [];
    w.relCursor = undefined;
    relShown(w);
    save();
    return true;
  } catch (e) { return false; } finally { relPending.delete(w.id); }
}
function ensureRelated(w) {
  if (!w || w.relatedKey === relKey(w)) return;
  fetchRelated(w).then(changed => {
    if (changed && current() && current().id === w.id && !S.playing) renderCard();
  });
}
// 起動後、未検索の単語をまとめて少しずつ検索（操作の邪魔をしない）
async function relatedBackground() {
  for (const w of db.words.slice()) {
    if (w.relatedKey === relKey(w)) continue;
    await fetchRelated(w);
    await sleep(w.webState ? 400 : 30); // ネット検索をした場合は間隔をあける
  }
}

function updateRate() {
  const w = current();
  document.querySelectorAll('.rate-btn').forEach(b => {
    b.classList.toggle('on', !!w && w.status === b.dataset.rate);
    b.disabled = !w;
  });
}
function updateNav() {
  $('btnPrev').disabled = S.idx <= 0;
  $('btnNext').disabled = S.idx >= S.queue.length - 1;
}

function renderModes() {
  document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === set().mode));
  $('btnReshuffle').style.display = FIXED_ORDER(set().mode) ? 'none' : '';
}
function renderPlayer() {
  $('speeds').innerHTML = SPEEDS.map(s => `<button data-speed="${s}" class="${s === set().rate ? 'on' : ''}">${s.toFixed(1)}</button>`).join('');
  $('selContent').value = set().playContent;
  $('selGap').value = String(set().gap);
  $('optLoop').checked = set().loop;
  document.querySelectorAll('#hideModes button').forEach(b => b.classList.toggle('on', b.dataset.hide === set().hideMode));
  $('btnPlay').classList.toggle('playing', S.playing);
  $('playLabel').textContent = S.playing ? t('play.stop') : t('play.start');
}
function applyTheme() {
  if (!THEMES.some(x => x.id === set().theme)) set().theme = 'sky';
  document.documentElement.dataset.theme = set().theme;
  const box = $('themes');
  if (box) box.innerHTML = THEMES.map(x =>
    `<button class="theme-btn ${x.id === set().theme ? 'on' : ''}" data-theme-id="${x.id}">` +
    `<span class="sw" style="background:${x.bg};--ac:${x.ac}"></span>${t('theme.' + x.id)}</button>`).join('');
}
// 文字の大きさ：画面全体をその場で拡大・縮小（再起動不要）
function applyZoom() {
  const z = set().zoom;
  if (window.api && window.api.setZoom) window.api.setZoom(z);
  else document.body.style.zoom = z; // 開発用
  const box = $('sizes');
  if (box) box.innerHTML = ZOOMS.map(x => `<button data-zoom="${x.v}" class="${x.v === z ? 'on' : ''}">${t('zoom.' + x.v)}</button>`).join('');
}
function setZoom(z) {
  if (!ZOOMS.some(x => x.v === z)) return;
  set().zoom = z; save(); applyZoom();
  toast(t('toast.zoom', { l: t('zoom.' + z) }));
}
function stepZoom(d) {
  const i = ZOOMS.findIndex(x => x.v === set().zoom);
  const n = Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 2 : i) + d));
  setZoom(ZOOMS[n].v);
}
// 目隠しの透明度：0％＝完全に隠す〜20％＝うっすら透ける（既定3％・1％単位）
function clampBlind(v) {
  v = Math.round(Number(v));
  return Number.isFinite(v) ? Math.max(BLIND_MIN, Math.min(BLIND_MAX, v)) : BLIND_DEF;
}
function applyBlindAlpha() {
  const a = clampBlind(set().blindAlpha);
  set().blindAlpha = a;
  document.documentElement.style.setProperty('--blind-cover', String((100 - a) / 100));
  const box = $('blindAlphas');
  if (!box) return;
  if (!$('blindRange')) {
    box.innerHTML = `<button class="ba-step" data-bstep="-1" aria-label="-1%">－</button>` +
      `<input type="range" id="blindRange" min="${BLIND_MIN}" max="${BLIND_MAX}" step="1">` +
      `<button class="ba-step" data-bstep="1" aria-label="+1%">＋</button>` +
      `<output id="blindVal"></output>`;
  }
  $('blindRange').value = String(a);
  $('blindRange').style.setProperty('--p', `${(a - BLIND_MIN) / (BLIND_MAX - BLIND_MIN) * 100}%`);
  $('blindVal').textContent = `${a}%`;
  box.querySelector('[data-bstep="-1"]').disabled = a <= BLIND_MIN;
  box.querySelector('[data-bstep="1"]').disabled = a >= BLIND_MAX;
}
let blindToastT = 0;
function setBlindAlpha(v) {
  const a = clampBlind(v);
  if (a === set().blindAlpha && $('blindVal')?.textContent === `${a}%`) return;
  set().blindAlpha = a; applyBlindAlpha(); save();
  clearTimeout(blindToastT);
  blindToastT = setTimeout(() => toast(t('toast.blindAlpha', { v: a })), 250);
}
// 目隠し：none（オフ）／word（単語の和訳だけ）／ja（和訳すべて）／all（答え全部）
const HIDE_MODES = ['none', 'word', 'ja', 'all'];
function setHideMode(m) {
  if (!HIDE_MODES.includes(m)) return;
  set().hideMode = m; S.revealed = false; S.openKeys.clear(); save();
  renderPlayer(); renderList(); renderCard();
  toast(t('toast.hide.' + m));
}
// ---------- 表示言語 ----------
function renderGapOptions() {
  [...$('selGap').options].forEach(o => { o.textContent = t('gap.s', { n: o.value }); });
}
function renderAll() { renderModes(); renderFilters(); renderList(); renderCard(); renderPlayer(); renderAccents(); }

// ---------- 移動 ----------
function go(i, opts = {}) {
  if (!S.queue.length) return;
  i = Math.max(0, Math.min(S.queue.length - 1, i));
  if (i === S.idx && !opts.force) return;
  S.idx = i;
  S.revealed = false; S.openKeys.clear();
  S.speakingPart = null;
  renderCard();
  updateListCurrent();
  if (S.playing && !opts.fromPlayer) startPlay(); // 再生中なら選んだ単語から再生し直す
  else if (!S.playing && set().autoSpeak && !opts.fromPlayer) sayWord();
}
const next = () => go(S.idx + 1);
const prev = () => go(S.idx - 1);

function reveal() {
  if (S.revealed || set().hideMode === 'none') return;
  S.revealed = true;
  renderCard();
}

// ---------- 理解度 ----------
function rate(st) {
  const w = current();
  if (!w) return;
  // v1.28：判定が変わったら、それまでの回数（履歴）を消してから数え直す
  if (w.status && w.status !== st) { w.nNo = 0; w.nSome = 0; w.nYes = 0; }
  w.status = st;
  if (st === 'no') w.nNo = cntNo(w) + 1; else if (st === 'some') w.nSome = cntSome(w) + 1; else if (st === 'yes') w.nYes = cntYes(w) + 1;
  // v1.29：カードの「確認 ◯ 回」も、今の判定になってからの回数にする（判定が変わったら1から）
  w.views = { no: cntNo(w), some: cntSome(w), yes: cntYes(w) }[st] || 1;
  w.lastSeen = Date.now();
  save();
  const btn = document.querySelector(`.rate-btn[data-rate="${st}"]`);
  if (btn) { btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop'); }
  renderFilters();
  updateListItem(w);
  if (!S.revealed && set().hideMode !== 'none') S.revealed = true;
  renderCard();
  if (set().autoNext && !S.playing && S.idx < S.queue.length - 1) {
    const id = w.id;
    setTimeout(() => { if (current() && current().id === id) next(); }, 380);
  }
}

// ---------- 音声 ----------
let voices = [];
const keepAlive = [];
// v1.25：Windowsの新形式の音声（OneCore：設定アプリで追加した日本語・イギリス英語など）も使う。
// 従来形式（SAPI）を先に並べ、同じ条件なら従来形式を優先（反応が速い）。
let oneVoices = [];
function loadVoices() {
  const sapi = ('speechSynthesis' in window) ? speechSynthesis.getVoices() : [];
  voices = [...sapi, ...oneVoices];
  fillVoiceSelects();
}
async function loadOneVoices() {
  if (!window.api || !window.api.ttsVoices) return;
  try {
    const list = await window.api.ttsVoices();
    oneVoices = (list || []).map(v => ({ name: `${v.name}（新形式）`, lang: String(v.lang), voiceURI: v.id, gender: v.gender, onecore: true, localService: true }));
  } catch (e) { oneVoices = []; }
  if (oneVoices.length) loadVoices();
}
const isFemale = (v) => v.gender ? /female/i.test(v.gender) : FEMALE.test(v.name);
const isMale = (v) => v.gender ? /^male/i.test(v.gender) : MALE.test(v.name.replace(FEMALE, ''));
function voicesFor(lang) { return voices.filter(v => v.lang.toLowerCase().replace('_', '-').startsWith(lang)); }
// Windowsの音声名から性別を判定（Microsoft Hazel=英女性, David=米男性 など）
const FEMALE = /(hazel|susan|libby|sonia|maisie|mia|abbi|bella|hollie|olivia|zira|aria|jenny|ana|michelle|emma|ava|serena|kate|female)/i;
const MALE = /(david|mark|guy|christopher|eric|roger|steffan|andrew|brian|davis|jason|tony|george|ryan|alfie|elliot|ethan|noah|oliver|thomas|james|male)/i;
const ACCENTS = {
  'uk-f': { lang: /en-gb/i, female: true, want: FEMALE, avoid: MALE, get label() { return t('accent.uk.long'); }, get pack() { return t('accent.uk.pack'); } },
  'us-m': { lang: /en-us/i, female: false, want: MALE, avoid: FEMALE, get label() { return t('accent.us.long'); }, get pack() { return t('accent.us.pack'); } }
};
function enVoiceInfo() {
  const a = ACCENTS[set().accent] || ACCENTS['uk-f'];
  const en = voicesFor('en');
  const sameLang = en.filter(v => a.lang.test(v.lang.replace('_', '-')));
  const fits = (v) => a.female ? isFemale(v) : isMale(v);
  const exact = sameLang.find(fits);
  if (exact) return { voice: exact, ok: true };
  if (sameLang.length) return { voice: sameLang[0], ok: false, why: 'gender' };
  return { voice: en.find(fits) || en[0] || null, ok: false, why: 'lang' };
}
// 意味の読み上げは表示言語の音声で（日本語→日本語、中文→中国語、한국어→韓国語、English→英語）
const meaningLang = () => (LANGS.find(x => x.id === CUR_LANG) || LANGS[0]).speech;
function pickVoice(lang) {
  if (lang === 'ja') lang = meaningLang();
  if (lang === 'en') return enVoiceInfo().voice;
  const list = voicesFor(lang);
  return list.find(v => v.name === set().jaVoice) || list[0] || null;
}
// v1.23：Windowsの音声（SAPI）は速度を「-10〜+10の整数段階（1段階＝約1.12倍）」で扱い、
// Chromiumは 10×log10(倍率) を切り捨てて渡すため、そのままだと 0.8・1.0・1.2 が同じ速さ、2倍が実際は約1.4倍になる。
// 指定した倍率に一番近い段階になるよう、渡す値を補正する（最大は約3倍）。
const IS_WIN = /Windows/i.test(navigator.userAgent);
function engineRate(x) {
  if (!IS_WIN) return x;
  let r = Math.round(10 * Math.log(x) / Math.log(3));
  r = Math.max(-10, Math.min(10, r));
  if (r === 0) return 1;
  return Math.pow(10, (r + (r > 0 ? 0.05 : -0.05)) / 10);
}
// ---- 新形式の音声：PowerShellで作った音声データ（WAV）を再生する ----
let curAudio = null, curAudioDone = null, audioSeq = 0;
const oneCache = new Map(); // 「声|速度|文」→ Promise<blob URL>（先読み・くり返し用）
function oneUrl(text, v, rate) {
  const key = `${v.voiceURI}|${rate}|${text}`;
  if (oneCache.has(key)) { const p = oneCache.get(key); oneCache.delete(key); oneCache.set(key, p); return p; }
  const p = window.api.ttsSpeak(text, v.voiceURI, rate).then(r => {
    if (!r || !r.ok || !r.wav) throw new Error((r && r.error) || 'tts');
    return URL.createObjectURL(new Blob([r.wav], { type: 'audio/wav' }));
  });
  p.catch(() => oneCache.delete(key));
  oneCache.set(key, p);
  while (oneCache.size > 60) {
    const [k, old] = oneCache.entries().next().value;
    oneCache.delete(k); old.then(u => setTimeout(() => URL.revokeObjectURL(u), 60000)).catch(() => {});
  }
  return p;
}
function prefetchSpeech(text, lang, rate) {
  text = (text || '').trim();
  const v = text && pickVoice(lang);
  if (v && v.onecore) oneUrl(text, v, rate).catch(() => {});
}
let oneErrShown = false;
function speakOne(text, v, rate, resolve) {
  const my = ++audioSeq;
  let done = false;
  const finish = () => { if (done) return; done = true; if (curAudioDone === finish) { curAudio = null; curAudioDone = null; } resolve(); };
  curAudioDone = finish;
  oneUrl(text, v, rate).then(url => {
    if (my !== audioSeq || done) return;
    const a = new Audio(url);
    curAudio = a;
    a.onended = finish; a.onerror = finish;
    a.play().catch(finish);
  }).catch((e) => {
    if (my !== audioSeq) return;
    if (!oneErrShown) { oneErrShown = true; toast(t('toast.oneFail'), 4000); }
    finish();
  });
}
function cancelSpeech() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  audioSeq++;
  if (curAudio) { try { curAudio.pause(); } catch (e) {} }
  if (curAudioDone) curAudioDone();
}
function speak(text, lang, rate) {
  return new Promise(resolve => {
    text = (text || '').trim();
    if (!text) return resolve();
    const v = pickVoice(lang);
    if (v && v.onecore) return speakOne(text, v, rate, resolve);
    if (!v && lang !== 'en') { setTimeout(resolve, Math.min(5000, 500 + text.length * 140) / rate); return; }
    const u = new SpeechSynthesisUtterance(text);
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = lang === 'en' ? 'en-US' : 'ja-JP';
    u.rate = engineRate(rate);
    keepAlive.push(u);
    let done = false;
    const t = setTimeout(() => finish(), 4000 + text.length * 220 / rate);
    function finish() {
      if (done) return; done = true; clearTimeout(t);
      const k = keepAlive.indexOf(u); if (k >= 0) keepAlive.splice(k, 1);
      resolve();
    }
    u.onend = finish; u.onerror = finish;
    speechSynthesis.speak(u);
  });
}
function sayOnce(text, lang) {
  stopPlay();
  cancelSpeech();
  speak(text, lang, set().rate);
}
function sayWord() { const w = current(); if (w) sayOnce(w.word, 'en'); }
function sayEx() { const w = current(); if (w) sayOnce(w.example, 'en'); }

// ---------- 自動再生 ----------
let playToken = 0;
// r＝関連する例文（画面に出ている2文・英語）、rj＝その和訳。v1.26：単語＋例文（we）を追加し、例文を読むものは関連する例文も読む
const PARTS = { w: ['w'], m: ['m'], e: ['e', 'r'], wm: ['w', 'm'], we: ['w', 'e', 'r'], all: ['w', 'm', 'e', 'ej', 'r', 'rj'] };
// 1単語ぶんの読み上げ順を作る：[{ key, text, lang }]
function speechSeq(w, parts) {
  const seq = [];
  const rel = parts.includes('r') && set().showRelated ? shownRelated(w) : [];
  for (const p of parts) {
    if (p === 'r') {
      rel.forEach((r, i) => {
        if (r && r.en) seq.push({ key: 'r' + i, text: r.en, lang: 'en' });
        if (parts.includes('rj') && r && r.ja) seq.push({ key: 'rj' + i, text: r.ja, lang: 'ja' });
      });
    } else if (p !== 'rj') {
      const text = { w: w.word, m: w.meaning, e: w.example, ej: w.exampleJa }[p];
      if (text) seq.push({ key: p, text, lang: (p === 'w' || p === 'e') ? 'en' : 'ja' });
    }
  }
  return seq;
}
// 関連する例文がまだ探し終わっていなければ、少しだけ待つ（同梱の例文はすぐ、ネット検索は最大2.5秒）
async function waitRelated(w, ms = 2500) {
  if (!w || !set().showRelated || w.relatedKey === relKey(w)) return;
  await Promise.race([fetchRelated(w), sleep(ms)]);
}

function startPlay() {
  if (!S.queue.length) { toast(t('toast.noPlay')); return; }
  const token = ++playToken;
  cancelSpeech();
  S.playing = true;
  renderPlayer();
  playLoop(token);
}
function stopPlay() {
  if (!S.playing) return;
  playToken++;
  S.playing = false;
  S.speakingPart = null;
  cancelSpeech();
  renderPlayer();
  renderCard();
}
function togglePlay() { S.playing ? stopPlay() : startPlay(); }

async function playLoop(token) {
  const alive = () => S.playing && token === playToken;
  while (alive()) {
    const w = current();
    if (!w) break;
    const parts = PARTS[set().playContent] || PARTS.wm;
    S.revealed = set().hideMode === 'none' || parts.some(p => p !== 'w');
    if (parts.includes('r')) { await waitRelated(w); if (!alive()) return; }
    const seq = speechSeq(w, parts);
    const nw = S.queue.length ? (S.idx < S.queue.length - 1 ? byId(S.queue[S.idx + 1]) : (set().loop ? byId(S.queue[0]) : null)) : null;
    if (nw && parts.includes('r')) ensureRelated(nw); // 次の単語の関連例文も先に探しておく
    for (let k = 0; k < seq.length; k++) {
      if (!alive()) return;
      const it = seq[k];
      S.speakingPart = it.key;
      renderCard();
      const spoken = speak(it.text, it.lang, set().rate);
      // 次に読む部分（この単語の続き・次の単語の最初）を先に作っておき、待ち時間をなくす
      const ahead = seq.slice(k + 1, k + 3).concat(nw && k >= seq.length - 2 ? speechSeq(nw, parts).slice(0, 2) : []);
      ahead.forEach(x => prefetchSpeech(x.text, x.lang, set().rate));
      await spoken;
      if (!alive()) return;
      await sleep(Math.min(220, set().gap * 1000)); // 単語→意味の間も「間隔」に合わせて短く
    }
    S.speakingPart = null;
    renderCard();
    await sleep(set().gap * 1000);
    if (!alive()) return;
    if (S.idx < S.queue.length - 1) go(S.idx + 1, { fromPlayer: true });
    else if (set().loop) go(0, { fromPlayer: true, force: true });
    else break;
  }
  if (token === playToken) { S.playing = false; S.speakingPart = null; renderPlayer(); renderCard(); }
}

// ---------- 追加・編集 ----------
// v1.33：入力欄に合わせて日本語入力を切り替える。単語・例文＝半角英数（日本語入力オフ）、意味・訳・メモ＝全角ひらがな
const IME_FIELDS = { fWord: 'en', fEx: 'en', fMeaning: 'ja', fExJa: 'ja', fNote: 'ja' };
let imeLast = '', imeFailShown = false;
function imeFor(id) {
  const mode = IME_FIELDS[id];
  if (!mode || !set().imeAuto || !window.api?.setIme) return;
  imeLast = mode;
  window.api.setIme(mode).then(ok => {
    if (!ok && !imeFailShown) { imeFailShown = true; console.warn('IME switch unavailable'); }
  }).catch(() => {});
}
// 英語の欄：全角の英数字・記号・空白が入ったら半角に直す（日本語入力がオンのまま打った場合の保険）
function toHalfWidth(el) {
  const v = el.value;
  const nv = v.replace(/[\uFF01-\uFF5E]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/\u3000/g, ' ').replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
  if (nv === v) return;
  const pos = el.selectionStart;
  el.value = nv;
  try { el.setSelectionRange(pos, pos); } catch (e) {}
}
function setupImeFields() {
  for (const [id, mode] of Object.entries(IME_FIELDS)) {
    const el = $(id);
    el.lang = mode === 'en' ? 'en' : 'ja';
    el.setAttribute('autocapitalize', 'off');
    el.addEventListener('focus', () => imeFor(id));
    if (mode === 'en') {
      el.spellcheck = true;
      el.addEventListener('input', (e) => { if (!e.isComposing) toHalfWidth(el); });
      el.addEventListener('compositionend', () => setTimeout(() => toHalfWidth(el), 0));
    }
  }
}

function openEdit(id, focusField) {
  stopPlay();
  S.editingId = id || null;
  const w = id ? byId(id) : null;
  $('editTitle').textContent = w ? t('edit.edit') : t('edit.add');
  $('fWord').value = w ? w.word : '';
  $('fMeaning').value = w ? w.meaning : '';
  $('fEx').value = w ? w.example : '';
  $('fExJa').value = w ? w.exampleJa : '';
  $('fNote').value = w ? w.note : '';
  $('keepWrap').style.display = w ? 'none' : '';
  document.querySelectorAll('.field.err').forEach(e => e.classList.remove('err'));
  $('editModal').hidden = false;
  setTimeout(() => $(focusField || 'fWord').focus(), 30);
}
function closeModal(id) {
  $(id).hidden = true;
  // 追加・編集を閉じたら日本語入力をオフに戻す（ひらがなのままだとキー操作が効かないため）
  if (id === 'editModal' && imeLast === 'ja' && set().imeAuto && window.api?.setIme) { imeLast = 'en'; window.api.setIme('en').catch(() => {}); }
}

function submitEdit() {
  const word = $('fWord').value.trim(), meaning = $('fMeaning').value.trim();
  $('fWord').parentElement.classList.toggle('err', !word);
  $('fMeaning').parentElement.classList.toggle('err', !meaning);
  if (!word) { $('fWord').focus(); return; }
  if (!meaning) { $('fMeaning').focus(); return; }
  const vals = { word, meaning, example: $('fEx').value.trim(), exampleJa: $('fExJa').value.trim(), note: $('fNote').value.trim() };

  if (S.editingId) {
    const w = byId(S.editingId);
    Object.assign(w, vals);
    save();
    closeModal('editModal');
    renderFilters(); updateListItem(w); renderCard();
    toast(t('toast.saved'));
    return;
  }
  const dup = db.words.find(x => x.word.toLowerCase() === word.toLowerCase());
  const w = newWord(vals);
  db.words.push(w);
  save();
  // 登録した単語をすぐに表示（例文もすぐに検索して表示される）
  const visible = matchFilter(w) && matchSearch(w);
  if (visible && FIXED_ORDER(set().mode)) buildQueue(w.id);
  else { S.queue.splice(S.idx + 1, 0, w.id); S.idx = S.queue.length > 1 ? S.idx + 1 : 0; S.revealed = false; S.openKeys.clear(); }
  stopPlay();
  renderFilters(); renderList(); renderCard();
  toast(dup ? t('toast.addedDup', { w: word }) : t('toast.added', { w: word }));
  if ($('fKeep').checked) {
    ['fWord', 'fMeaning', 'fEx', 'fExJa', 'fNote'].forEach(k => { $(k).value = ''; });
    $('fWord').focus();
  } else closeModal('editModal');
}

async function deleteCurrent() {
  const w = current();
  if (!w) return;
  stopPlay();
  const ok = await ask(t('del.title'), t('del.msg', { w: w.word }), [
    { label: t('cancel'), value: false, cls: 'btn-ghost' },
    { label: t('del.ok'), value: true, cls: 'btn-danger' }
  ]);
  if (!ok) return;
  markDeleted([w.id]);
  db.words = db.words.filter(x => x.id !== w.id);
  const i = S.idx;
  S.queue = S.queue.filter(id => id !== w.id);
  S.idx = Math.min(i, Math.max(0, S.queue.length - 1));
  S.revealed = false; S.openKeys.clear();
  save();
  renderFilters(); renderList(); renderCard();
  toast(t('toast.deleted'));
}

// ---------- 確認ダイアログ・トースト ----------
function ask(title, msg, buttons) {
  return new Promise(resolve => {
    $('askTitle').textContent = title;
    $('askMsg').textContent = msg;
    const box = $('askBtns');
    box.innerHTML = '<div class="spacer"></div>';
    buttons.forEach((b, i) => {
      const el = document.createElement('button');
      el.className = 'btn ' + (b.cls || 'btn-ghost');
      el.textContent = b.label;
      el.onclick = () => { closeModal('askModal'); resolve(b.value); };
      box.appendChild(el);
      if (i === buttons.length - 1) setTimeout(() => el.focus(), 30);
    });
    $('askModal').hidden = false;
    $('askModal')._cancel = () => { closeModal('askModal'); resolve(buttons[0].value); };
  });
}
let toastTimer;
function toast(msg, ms = 2200) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------- 設定 ----------
function fillVoiceSelects() {
  const fill = (sel, lang, cur) => {
    const list = voicesFor(lang);
    sel.innerHTML = list.length
      ? list.map(v => `<option value="${esc(v.name)}" ${v.name === cur ? 'selected' : ''}>${esc(v.name)}</option>`).join('')
      : `<option value="">${t('voice.none')}</option>`;
    if (list.length && !list.some(v => v.name === cur)) {
      const p = pickVoice(lang); if (p) sel.value = p.name;
    }
  };
  fill($('selJaVoice'), meaningLang(), set().jaVoice);
  renderAccents();
  const msgs = [];
  if (!voicesFor(meaningLang()).length) msgs.push(t('voice.mMissing', { l: t('voice.langName') }));
  $('voiceHint').textContent = msgs.length ? msgs.join(' ') : '';
  $('voiceHint').classList.toggle('warn', msgs.length > 0);
}
function renderAccents() {
  document.querySelectorAll('[data-accent]').forEach(b => b.classList.toggle('on', b.dataset.accent === set().accent));
  const a = ACCENTS[set().accent] || ACCENTS['uk-f'];
  const info = enVoiceInfo();
  const el = $('enVoiceInfo');
  if (!el) return;
  if (!voices.length) {
    el.textContent = t('voice.loading');
    el.classList.add('warn');
  } else if (info.ok) {
    el.textContent = t('voice.using', { v: info.voice.name });
    el.classList.remove('warn');
  } else {
    el.textContent = t('voice.fallback', { a: a.label, v: info.voice ? info.voice.name : t('voice.nothing'), p: a.pack });
    el.classList.add('warn');
  }
}
function setAccent(acc) {
  if (!ACCENTS[acc]) return;
  set().accent = acc; save();
  renderAccents();
  renderCard(); // 発音記号の英・米の並び順を更新
  const info = enVoiceInfo();
  // v1.22：ぴったりの声がないときは「何で代用しているか」を表示して、そのまま発音もする
  if (voices.length && !info.ok) {
    toast(info.voice
      ? t('toast.accentSub', { a: ACCENTS[acc].label, v: voiceDesc(info.voice) })
      : t('toast.accentMissing', { a: ACCENTS[acc].label }), 5200);
  }
  const w = current(); if (w && info.voice) sayOnce(w.word, 'en');
}
// 声の説明（例：Zira（アメリカ英語・女性））
function voiceDesc(v) {
  const name = v.name.replace(/^Microsoft\s+/i, '').replace(/\s*(Desktop|Online \(Natural\))?\s*-.*$/, '').trim() || v.name;
  const l = v.lang.toLowerCase().replace('_', '-');
  const region = l.startsWith('en-gb') ? t('voice.region.gb') : l.startsWith('en-us') ? t('voice.region.us') : l.startsWith('en-au') ? t('voice.region.au') : l.startsWith('en-in') ? t('voice.region.in') : t('voice.region.en');
  const g = isFemale(v) ? t('voice.female') : isMale(v) ? t('voice.male') : '';
  return `${name}（${region}${g ? '・' + g : ''}）`;
}
async function openSettings() {
  stopPlay();
  fillVoiceSelects();
  $('optAutoNext').checked = set().autoNext;
  $('optAutoSpeak').checked = set().autoSpeak;
  $('optRelated').checked = set().showRelated;
  $('optGeneral').checked = set().useGeneral;
  $('optWeb').checked = set().webSearch;
  $('optIpa').checked = set().showIpa;
  $('optDict').checked = set().showDict;
  if ($('optIme')) $('optIme').checked = set().imeAuto;
  $('dataPath').textContent = await store.dataPath();
  $('setModal').hidden = false;
}

// ---------- インポート・エクスポート ----------
function parseDelimited(text) {
  const firstLine = text.split(/\r?\n/)[0] || '';
  const delim = (firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length ? '\t' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}
const STATUS_IN = {};
['no', 'some', 'yes'].forEach(k => { STATUS_IN[k] = k; Object.keys(I18N).forEach(l => { STATUS_IN[I18N[l]['status.' + k].toLowerCase()] = k; }); });

async function doImport() {
  const f = await store.importFile({ title: t('dialog.import'), filterName: t('dialog.filter') });
  if (!f) return;
  let incoming = [];
  try {
    if (f.ext === 'json') {
      const j = JSON.parse(f.text);
      const arr = Array.isArray(j) ? j : j.words;
      if (!Array.isArray(arr)) throw new Error('format');
      incoming = arr.filter(o => o && o.word).map(o => ({ ...newWord(o), id: o.id || uid() }));
      if (!Array.isArray(j) && j.words) {
        const mode = await ask(t('import.title'), t('import.msg', { f: f.name, n: incoming.length }), [
          { label: t('cancel'), value: null, cls: 'btn-ghost' },
          { label: t('import.merge'), value: 'merge', cls: 'btn-ghost' },
          { label: t('import.replace'), value: 'replace', cls: 'btn-primary' }
        ]);
        if (!mode) return;
        if (mode === 'replace') {
          const keep = new Set(incoming.map(x => x.id));
          markDeleted(db.words.filter(x => !keep.has(x.id)).map(x => x.id));
          db.words = incoming;
          if (j.settings) db.settings = { ...DEFAULT_SETTINGS, ...j.settings };
          save(); buildQueue(); renderAll(); relatedBackground();
          toast(t('toast.loaded', { n: incoming.length }));
          return;
        }
      }
    } else {
      const rows = parseDelimited(f.text);
      if (rows.length && /^(単語|word|英単語|表|单词|단어)$/i.test((rows[0][0] || '').trim())) rows.shift();
      incoming = rows.filter(r => (r[0] || '').trim() && (r[1] || '').trim()).map(r => newWord({
        word: r[0], meaning: r[1], example: r[2], exampleJa: r[3], note: r[4], status: STATUS_IN[(r[5] || '').trim()]
      }));
    }
  } catch (e) {
    toast(t('toast.readFail')); return;
  }
  const have = new Set(db.words.map(w => w.word.toLowerCase()));
  const ids = new Set(db.words.map(w => w.id));
  let added = 0, skipped = 0;
  incoming.forEach(w => {
    if (have.has(w.word.toLowerCase())) { skipped++; return; }
    if (ids.has(w.id)) w.id = uid();
    db.words.push(w); have.add(w.word.toLowerCase()); added++;
  });
  save(); buildQueue(current() && current().id); renderAll(); relatedBackground();
  toast(t('toast.importAdded', { n: added }) + (skipped ? t('toast.importSkipped', { n: skipped }) : ''));
}

function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}
async function exportJson() {
  const p = await store.exportFile({ defaultName: `kotoba-card-${stamp()}.json`, content: JSON.stringify(db, null, 2), kind: 'json', title: t('dialog.export') });
  if (p) toast(t('toast.exported'));
}
async function exportCsv() {
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const lines = [t('csv.head').split(',').map(q).join(',')];
  db.words.forEach(w => lines.push([w.word, w.meaning, w.example, w.exampleJa, w.note, w.status ? STATUS[w.status].label : '', w.views].map(q).join(',')));
  const p = await store.exportFile({ defaultName: `kotoba-card-${stamp()}.csv`, content: lines.join('\r\n'), kind: 'csv', title: t('dialog.export') });
  if (p) toast(t('toast.exported'));
}

// ---------- イベント ----------
function bind() {
  $('btnAdd').onclick = () => openEdit();
  $('btnSettings').onclick = openSettings;
  $('btnPrev').onclick = prev;
  $('btnNext').onclick = next;
  $('btnPlay').onclick = togglePlay;
  $('btnReshuffle').onclick = () => { stopPlay(); buildQueue(); renderList(); renderCard(); toast(t('toast.reshuffled')); };

  let st;
  $('search').oninput = (e) => {
    clearTimeout(st);
    st = setTimeout(() => { S.search = e.target.value.trim(); stopPlay(); buildQueue(current() && current().id); renderList(); renderCard(); }, 150);
  };
  $('filters').onclick = (e) => {
    const b = e.target.closest('.chip'); if (!b || b.disabled) return;
    stopPlay(); set().filter = b.dataset.f; save();
    buildQueue(current() && current().id); renderFilters(); renderList(); renderCard();
  };
  $('list').onclick = (e) => {
    const li = e.target.closest('.item'); if (!li) return;
    go(Number(li.dataset.i), { force: true });
  };
  $('modes').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    stopPlay(); set().mode = b.dataset.mode; save();
    buildQueue(FIXED_ORDER(set().mode) ? current() && current().id : null);
    renderModes(); renderFilters(); renderList(); renderCard();
  };
  $('hideModes').onclick = (e) => { const b = e.target.closest('[data-hide]'); if (b) setHideMode(b.dataset.hide); };
  $('rate').onclick = (e) => { const b = e.target.closest('.rate-btn'); if (b && !b.disabled) rate(b.dataset.rate); };

  $('card').onclick = (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act;
    if (a === 'unblind') { S.openKeys.add(b.dataset.k); renderCard(); }
    else if (a === 'say-word') sayWord();
    else if (a === 'say-ex') sayEx();
    else if (a === 'say-rel') { const w = current(); const r = w && shownRelated(w)[Number(b.dataset.i)]; if (r) sayOnce(r.en, 'en'); }
    else if (a === 'rel-all') refreshRelated('all');
    else if (a === 'rel-one') refreshRelated(b.dataset.i);
    else if (a === 'reveal') reveal();
    else if (a === 'edit') { const w = current(); if (w) openEdit(w.id); }
    else if (a === 'edit-ex') { const w = current(); if (w) openEdit(w.id, 'fEx'); }
    else if (a === 'delete') deleteCurrent();
    else if (a === 'add') openEdit();
  };

  $('selContent').onchange = (e) => { set().playContent = e.target.value; save(); };
  $('selGap').onchange = (e) => { set().gap = Number(e.target.value); save(); };
  $('optLoop').onchange = (e) => { set().loop = e.target.checked; save(); };
  $('speeds').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    set().rate = Number(b.dataset.speed); save(); renderPlayer();
  };

  // 編集
  $('editForm').onsubmit = (e) => { e.preventDefault(); submitEdit(); };
  $('editCancel').onclick = () => closeModal('editModal');
  $('editForm').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitEdit(); }
  });

  // 設定
  $('setClose').onclick = () => closeModal('setModal');
  ['accents', 'accents2'].forEach(id => {
    $(id).onclick = (e) => { const b = e.target.closest('[data-accent]'); if (b) setAccent(b.dataset.accent); };
  });
  $('selJaVoice').onchange = (e) => { set().jaVoice = e.target.value; save(); };
  $('testEn').onclick = () => { cancelSpeech(); speak('Thank you for your patience. The meeting will begin shortly.', 'en', set().rate); };
  $('testJa').onclick = () => { cancelSpeech(); speak(t('voice.test'), 'ja', set().rate); };
  $('blindAlphas').onclick = (e) => {
    const b = e.target.closest('[data-bstep]'); if (!b) return;
    setBlindAlpha(set().blindAlpha + Number(b.dataset.bstep));
  };
  $('blindAlphas').oninput = (e) => { if (e.target.id === 'blindRange') setBlindAlpha(e.target.value); };
  $('sizes').onclick = (e) => {
    const b = e.target.closest('[data-zoom]'); if (!b) return;
    setZoom(Number(b.dataset.zoom));
  };
  $('themes').onclick = (e) => {
    const b = e.target.closest('[data-theme-id]'); if (!b) return;
    set().theme = b.dataset.themeId; save(); applyTheme();
  };
  $('optAutoNext').onchange = (e) => { set().autoNext = e.target.checked; save(); };
  $('optAutoSpeak').onchange = (e) => { set().autoSpeak = e.target.checked; save(); };
  $('optRelated').onchange = (e) => { set().showRelated = e.target.checked; save(); renderCard(); };
  $('optGeneral').onchange = (e) => { set().useGeneral = e.target.checked; save(); renderCard(); relatedBackground(); };
  $('optWeb').onchange = (e) => { set().webSearch = e.target.checked; save(); renderCard(); relatedBackground(); };
  $('optDict').onchange = (e) => { set().showDict = e.target.checked; save(); renderCard(); };
  $('optIme').checked = set().imeAuto;
  $('optIme').onchange = (e) => { set().imeAuto = e.target.checked; save(); };
  setupImeFields();
  $('optIpa').onchange = (e) => { set().showIpa = e.target.checked; save(); renderCard(); if (set().showIpa) ipaBackground(); };
  $('btnImport').onclick = () => { closeModal('setModal'); doImport(); };
  $('btnExportJson').onclick = exportJson;
  $('btnExportCsv').onclick = exportCsv;
  $('btnOpenFolder').onclick = () => store.openDataFolder();
  $('btnResetStats').onclick = async () => {
    const ok = await ask(t('reset.title'), t('reset.msg'), [
      { label: t('cancel'), value: false }, { label: t('reset.ok'), value: true, cls: 'btn-danger' }
    ]);
    if (!ok) return;
    db.words.forEach(w => { w.status = null; w.views = 0; w.lastSeen = 0; w.nNo = 0; w.nSome = 0; w.nYes = 0; });
    save(); buildQueue(current() && current().id); renderAll(); toast(t('toast.reset'));
  };

  // 背景クリックで閉じる
  ['editModal', 'setModal', 'askModal'].forEach(id => {
    $(id).addEventListener('mousedown', (e) => {
      if (e.target !== $(id)) return;
      if (id === 'askModal' && $(id)._cancel) $(id)._cancel(); else closeModal(id);
    });
  });

  // キーボード
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && !e.altKey && (e.key === '+' || e.key === '=' || e.key === ';')) { e.preventDefault(); stepZoom(1); return; }
    if (e.ctrlKey && !e.altKey && e.key === '-') { e.preventDefault(); stepZoom(-1); return; }
    if (e.ctrlKey && !e.altKey && e.key === '0') { e.preventDefault(); setZoom(1); return; }
    const openModal = ['askModal', 'editModal', 'setModal'].find(id => !$(id).hidden);
    if (e.key === 'Escape' && openModal) {
      if (openModal === 'askModal' && $('askModal')._cancel) $('askModal')._cancel(); else closeModal(openModal);
      return;
    }
    if (openModal) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowDown') { e.preventDefault(); next(); }
    else if (k === 'ArrowLeft' || k === 'ArrowUp') { e.preventDefault(); prev(); }
    else if (k === ' ') { e.preventDefault(); sayWord(); }
    else if (k === 'Enter') { e.preventDefault(); reveal(); }
    else if (k === 'h' || k === 'H') setHideMode(HIDE_MODES[(HIDE_MODES.indexOf(set().hideMode) + 1) % HIDE_MODES.length]);
    else if (k === '1') rate('no');
    else if (k === '2') rate('some');
    else if (k === '3') rate('yes');
    else if (k === 'p' || k === 'P') togglePlay();
    else if (k === 'n' || k === 'N') { e.preventDefault(); openEdit(); }
    else if (k === 'e' || k === 'E') { const w = current(); if (w) { e.preventDefault(); openEdit(w.id); } }
  });
}

// ---------- 起動 ----------
(async function init() {
  const d = await store.load();
  if (d && Array.isArray(d.words)) {
    db = { version: 1, ...d, settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) } };
    db.words = d.words.map(o => ({ ...newWord(o), id: o.id || uid() }));
  } else {
    // 初めて使うとき：サンプル単語を作る
    const tr = SAMPLE_TR.ja;
    db.words = SAMPLE_WORDS.map(([word, example], i) => ({ ...newWord({ word, meaning: tr[i][0], example, exampleJa: tr[i][1], created: Date.now() + i }), sample: true }));
    save();
  }
  // 画面は日本語のみ（v1.17で多言語表示を削除。以前に別の言語を選んでいた場合も日本語に戻す）
  set().lang = 'ja';
  CUR_LANG = 'ja';
  applyI18nDom();
  renderGapOptions();
  // 速度：旧バージョンの 0.6・0.7・1.1 倍などは一番近い値に置き換え
  if (!SPEEDS.includes(Number(set().rate))) { const r = Number(set().rate) || 1; set().rate = SPEEDS.reduce((a, b) => Math.abs(b - r) < Math.abs(a - r) ? b : a); }
  // 間隔：旧バージョンの3秒・5秒などは一番近い値に置き換え
  if (!GAPS.includes(Number(set().gap))) {
    const g = Number(set().gap) || 1;
    set().gap = GAPS.reduce((a, b) => Math.abs(b - g) < Math.abs(a - g) ? b : a);
  }
  if (!ACCENTS[set().accent]) set().accent = 'uk-f';
  // 旧バージョンの「意味を隠す」を引き継ぐ
  if (set().hideAnswer !== undefined) { if (set().hideAnswer) set().hideMode = 'all'; delete set().hideAnswer; }
  if (!HIDE_MODES.includes(set().hideMode)) set().hideMode = 'none';
  applyTheme();
  // 旧バージョンの設定（scale）を引き継ぐ
  if (set().scale !== undefined) {
    if (set().zoom === undefined || set().zoom === 1) set().zoom = { 0.9: 0.9, 1: 1, 1.15: 1.15, 1.3: 1.3 }[set().scale] || 1;
    delete set().scale;
  }
  if (!ZOOMS.some(x => x.v === set().zoom)) set().zoom = 1;
  applyZoom();
  // v1.19：目隠し透明度の既定を10％→5％に（旧既定のままの人だけ一度切り替え）
  if (!set().blindAlphaV2) { if (set().blindAlpha === undefined || Number(set().blindAlpha) === 10) set().blindAlpha = 5; set().blindAlphaV2 = true; }
  // v1.19：既定を3％に（旧既定5％のままの人だけ一度切り替え）。範囲は0〜20％・1％単位
  // v1.27：理解度ボタンの回数を数え始める。以前の記録は今の理解度を1回分として引き継ぐ
  if (!set().cntV1) {
    db.words.forEach(w => { if (!cntNo(w) && !cntSome(w) && !cntYes(w)) { if (w.status === 'no') w.nNo = 1; else if (w.status === 'some') w.nSome = 1; else if (w.status === 'yes') w.nYes = 1; } });
    set().cntV1 = true;
  }
  // v1.28：判定が変わったら履歴を消す方式に。今の判定以外の回数は消す（一度だけ）
  if (!set().cntV2) {
    db.words.forEach(w => {
      if (w.status !== 'no') w.nNo = 0;
      if (w.status !== 'some') w.nSome = 0;
      if (w.status !== 'yes') w.nYes = 0;
    });
    set().cntV2 = true;
  }
  // v1.29：「確認 ◯ 回」を今の判定の回数にそろえる（一度だけ）
  if (!set().cntV3) {
    db.words.forEach(w => { w.views = w.status ? ({ no: cntNo(w), some: cntSome(w), yes: cntYes(w) }[w.status] || 1) : 0; });
    set().cntV3 = true;
  }
  if (!set().blindAlphaV3) { if (set().blindAlpha === undefined || Number(set().blindAlpha) === 5) set().blindAlpha = BLIND_DEF; set().blindAlphaV3 = true; }
  applyBlindAlpha();
  delete set().enVoice;
  bind();
  if ('speechSynthesis' in window) {
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }
  loadOneVoices();
  buildQueue();
  renderAll();
  setTimeout(relatedBackground, 1500);
  setTimeout(ipaBackground, 4000);
})();
