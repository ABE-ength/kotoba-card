'use strict';
/* ネット検索（PC版 main.js から自動生成） */
(function () {
async function fetchJson(url, ms = 8000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      headers: { 'Accept': 'application/json' }
    });
    if (r.status === 404) return { notFound: true };
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return { data: await r.json() };
  } finally { clearTimeout(timer); }
}
const stripHtml = (s) => String(s || '').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();
const { buildPattern, hitRanges } = self.KCPattern;

// 文章を文に区切る（Wikipedia などの本文から例文を取り出す用）
function splitSentences(text) {
  return String(text || '').replace(/\[\d+\]/g, '').replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z"'“])/).map(s => s.trim()).filter(Boolean);
}
// Tatoeba の応答から、指定した言語（jpn / cmn / kor）の訳を探す（新旧どちらの形式にも対応）
function findTr(obj, tl, depth = 0) {
  if (!obj || !tl || depth > 6) return '';
  if (Array.isArray(obj)) { for (const x of obj) { const r = findTr(x, tl, depth + 1); if (r) return r; } return ''; }
  if (typeof obj === 'object') {
    if (obj.lang === tl && typeof obj.text === 'string') return obj.text;
    for (const k of Object.keys(obj)) { if (k === 'text') continue; const r = findTr(obj[k], tl, depth + 1); if (r) return r; }
  }
  return '';
}
// 表示言語 → Tatoeba の言語コード（英語表示では訳は不要）
const TATOEBA_LANG = { ja: 'jpn', zh: 'cmn', ko: 'kor', en: '' };
function listOf(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') for (const k of ['data', 'results', 'sentences']) if (Array.isArray(data[k])) return data[k];
  return [];
}

// 各検索先（どれも無料・登録不要）。結果は { reached, items:[{en, ja, source}] }
const SOURCES = {
  async freeDictionary(q) {
    const r = await fetchJson('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(q.toLowerCase()));
    const out = [];
    if (Array.isArray(r.data)) for (const e of r.data) for (const m of (e.meanings || [])) for (const d of (m.definitions || []))
      if (d && d.example) out.push({ en: stripHtml(d.example), source: 'Free Dictionary API' });
    return out;
  },
  async wiktionary(q) {
    const r = await fetchJson('https://en.wiktionary.org/api/rest_v1/page/definition/' + encodeURIComponent(q.replace(/\s+/g, '_')));
    const out = [], groups = r.data && r.data.en;
    if (Array.isArray(groups)) for (const g of groups) for (const d of (g.definitions || [])) {
      for (const p of (d.parsedExamples || [])) if (p && p.example) out.push({ en: stripHtml(p.example), source: 'Wiktionary' });
      for (const x of (d.examples || [])) if (typeof x === 'string') out.push({ en: stripHtml(x), source: 'Wiktionary' });
    }
    return out;
  },
  // Tatoeba（オンライン版・表示言語の訳付き）。新しいAPIが使えなければ旧APIを試す
  async tatoeba(q, ui) {
    const query = q.includes(' ') ? `"${q}"` : q;
    const tl = TATOEBA_LANG[ui] ?? 'jpn';
    let r;
    try {
      r = await fetchJson('https://api.tatoeba.org/v1/sentences?lang=eng&q=' + encodeURIComponent(query) +
        (tl ? `&trans:lang=${tl}&showtrans:lang=${tl}` : '') + '&sort=relevance');
      if (r.notFound) throw new Error('v1 not found');
    } catch (e) {
      r = await fetchJson('https://tatoeba.org/eng/api_v0/search?from=eng&orphans=no&unapproved=no&sort=relevance' +
        (tl ? `&to=${tl}&trans_filter=limit&trans_to=${tl}` : '') + '&query=' + encodeURIComponent(query));
    }
    return listOf(r.data).map(s => ({ en: stripHtml(s && s.text), ja: stripHtml(findTr(s && s.translations, tl)), source: 'Tatoeba' })).filter(x => x.en);
  },
  // MediaWiki 系（Wikinews・Wikipedia）：全文検索 → 上位ページの本文から該当文を取り出す
  async wikinews(q) { return mediaWiki('en.wikinews.org', 'Wikinews', q); },
  async wikipedia(q) { return mediaWiki('en.wikipedia.org', 'Wikipedia', q); }
};
async function mediaWiki(host, name, q) {
  const s = await fetchJson(`https://${host}/w/api.php?origin=*&action=query&list=search&format=json&formatversion=2&srlimit=4&srnamespace=0&srsearch=` + encodeURIComponent(`"${q}"`));
  const titles = (((s.data || {}).query || {}).search || []).map(x => x.title).slice(0, 3);
  const pages = await Promise.allSettled(titles.map(title =>
    fetchJson(`https://${host}/w/api.php?origin=*&action=query&prop=extracts&explaintext=1&format=json&formatversion=2&titles=` + encodeURIComponent(title))));
  const out = [];
  for (const p of pages) {
    if (p.status !== 'fulfilled') continue;
    for (const pg of ((((p.value.data || {}).query || {}).pages) || [])) {
      for (const sen of splitSentences(pg.extract)) out.push({ en: sen, source: name });
    }
  }
  return out;
}

async function webExamples(word, ui = 'ja') {
  // 置き換え表現（A / B / sb / be / doing / 〜 など）を除いた語で検索し、空欄パターンで絞り込む
  const pat = buildPattern(word);
  if (!pat || !pat.webQuery) return { ok: true, items: [] };
  const q = pat.webQuery;
  // 5つの検索先に同時に問い合わせる
  const order = ['tatoeba', 'wikinews', 'freeDictionary', 'wiktionary', 'wikipedia'];
  const results = await Promise.allSettled(order.map(k => SOURCES[k](q, ui)));
  if (!results.some(r => r.status === 'fulfilled')) return { ok: false, items: [] }; // ネットにつながらなかった
  // 単語（活用形・複数形を含む）が入っている、適度な長さの文だけを使う
  const re = pat.re;
  const seen = new Set(), items = [];
  const perSource = { Tatoeba: 4, Wikinews: 4, 'Free Dictionary API': 3, Wiktionary: 3, Wikipedia: 4 };
  const count = {};
  results.forEach((r) => {
    if (r.status !== 'fulfilled') return;
    for (const x of r.value) {
      let en = String(x.en || '').replace(/^[\s"“'‘]+|[\s"”'’]+$/g, '');
      if (!en || /[=|{}<>]/.test(en)) continue;
      en = en[0].toUpperCase() + en.slice(1);
      if (!/[.!?]$/.test(en)) en += '.';
      const n = en.split(/\s+/).length;
      if (n < 5 || n > 32) continue;
      const m = re.exec(en);
      if (!m) continue;
      const key = en.toLowerCase();
      if (seen.has(key) || (count[x.source] || 0) >= (perSource[x.source] || 3)) continue;
      seen.add(key);
      count[x.source] = (count[x.source] || 0) + 1;
      items.push({ en, ja: x.ja || '', s: m.index, e: m.index + m[0].length, h: hitRanges(m, en), src: 'w', source: x.source });
    }
  });
  // 和訳のある文を先に
  items.sort((a, b) => (b.ja ? 1 : 0) - (a.ja ? 1 : 0));
  return { ok: true, items: items.slice(0, 12) };
}

// ---------- 発音記号（1単語だけのとき）：Free Dictionary API → Wiktionary の順に調べる ----------
const cleanIpa = (s) => {
  s = String(s || '').trim();
  if (!s) return '';
  if (!/^[\/\[]/.test(s)) s = '/' + s + '/';
  return s.length > 40 ? '' : s;
};
// 熟語など同梱の辞書にない語：Wiktionary（英語版）の訳語表から日本語訳を品詞ごとに集める
const WK_POS = { noun: '名', 'proper noun': '名', verb: '動', adjective: '形', adverb: '副', preposition: '前', conjunction: '接',
  interjection: '間', pronoun: '代', determiner: '限', phrase: '句', idiom: '句', 'prepositional phrase': '句', proverb: '句', 'verb phrase': '句', 'noun phrase': '句' };
function wkCandidates(word) {
  const raw = String(word || '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
  const toks = raw.split(' ');
  const PH = /^(A|B|C|X|Y)$|^(sb|sth|someone|somebody|something|one's|oneself|someone's|〜|~|…|\.\.\.|doing|〜ing|~ing|do)$/i;
  const core = toks.filter((x, i) => !PH.test(x) && !(i === 0 && /^be$/i.test(x) && toks.length > 1));
  const out = [];
  const add = (s) => { s = s.trim(); if (s && !out.includes(s)) out.push(s); };
  add(raw); add(raw.toLowerCase()); add(core.join(' ').toLowerCase());
  if (core.length) {
    const f = core[0].toLowerCase(), rest = core.slice(1).join(' ').toLowerCase();
    for (const [re, rep] of [[/ing$/, ''], [/ing$/, 'e'], [/([^aeiou])\1ing$/, '$1'], [/ied$/, 'y'], [/ed$/, ''], [/ed$/, 'e'], [/ies$/, 'y'], [/s$/, '']]) {
      if (re.test(f)) add((f.replace(re, rep) + ' ' + rest).trim());
    }
    // compare A with B → compare … with も Wiktionary では「compare with」
  }
  return out.slice(0, 5);
}
function wkTerms(line) {
  const terms = [];
  line = line.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1'); // [[楽しみ]][[に]]… や [[a|b]] のリンクを外す
  const re = /\{\{tt?\+?\|ja\|([^}|]+)[^}]*\}\}/g;
  let m;
  while ((m = re.exec(line))) {
    const t = m[1].replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2').replace(/<[^>]+>/g, '').trim();
    if (t && !terms.includes(t)) terms.push(t);
  }
  return terms;
}
async function webDict(word) {
  let reached = false;
  for (const title of wkCandidates(word)) {
    let r;
    try { r = await fetchJson('https://en.wiktionary.org/w/api.php?origin=*&action=parse&prop=wikitext&redirects=1&format=json&formatversion=2&page=' + encodeURIComponent(title)); }
    catch (e) { continue; }
    reached = true;
    const text = String((((r.data || {}).parse || {}).wikitext) || '');
    const start = text.indexOf('==English==');
    if (start < 0) continue;
    const rest = text.slice(start + 11);
    const end = rest.search(/\n==[^=]/);
    const en = end >= 0 ? rest.slice(0, end) : rest;
    const blocks = [];
    let pos = '';
    for (const line of en.split('\n')) {
      const h = /^={3,5}\s*([^=]+?)\s*={3,5}\s*$/.exec(line);
      if (h) { const k = h[1].toLowerCase(); if (k in WK_POS) pos = WK_POS[k]; else if (!/translation|synonym|related|derived|see also|usage|anagram|reference|descendant|coordinate|hypernym|hyponym|antonym|quotation|collocation/.test(k)) pos = ''; continue; }
      if (!pos || !/^\*:?\s*Japanese\s*:/.test(line)) continue;
      const terms = wkTerms(line);
      if (!terms.length) continue;
      let b = blocks.find(x => x.pos === pos);
      if (!b) { b = { pos, senses: [] }; blocks.push(b); }
      const s = terms.join('、');
      if (!b.senses.includes(s)) b.senses.push(s);
    }
    if (blocks.length) return { ok: true, key: title, blocks };
  }
  return { ok: reached, key: '', blocks: [] };
}

async function webPhonetic(word) {
  const w = String(word || '').trim().toLowerCase();
  if (!/^[a-z][a-z'\-]*$/.test(w)) return { ok: true, uk: '', us: '' };
  let uk = '', us = '', any = '', reached = false;
  // 1) Free Dictionary API：音声ファイル名（…-uk.mp3 / …-us.mp3）で英米を判別
  try {
    const r = await fetchJson('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(w));
    reached = true;
    if (Array.isArray(r.data)) for (const e of r.data) {
      if (!any && e.phonetic) any = cleanIpa(e.phonetic);
      for (const p of (e.phonetics || [])) {
        const t = cleanIpa(p && p.text);
        if (!t) continue;
        const a = String((p && p.audio) || '');
        if (!uk && /-uk\.mp3$/i.test(a)) uk = t;
        else if (!us && /-us\.mp3$/i.test(a)) us = t;
        else if (!any) any = t;
      }
    }
  } catch (e) {}
  // 2) Wiktionary：English の Pronunciation 欄の {{IPA|en|…}} を読む（{{a|UK}} / {{a|US}} で英米を判別）
  if (!uk || !us) {
    try {
      const r = await fetchJson('https://en.wiktionary.org/w/api.php?origin=*&action=parse&prop=wikitext&format=json&formatversion=2&page=' + encodeURIComponent(w));
      reached = true;
      const text = String((((r.data || {}).parse || {}).wikitext) || '');
      const start = text.indexOf('==English==');
      if (start >= 0) {
        const rest = text.slice(start + 11);
        const end = rest.search(/\n==[^=]/);
        const en = end >= 0 ? rest.slice(0, end) : rest;
        for (const line of en.split('\n')) {
          const m = /\{\{IPA\|en\|([^}]*)\}\}/.exec(line);
          if (!m) continue;
          const ipa = cleanIpa(m[1].split('|').find(x => x && !x.includes('=')));
          if (!ipa) continue;
          const isUK = /\{\{(?:a|accent)\|[^}]*\b(UK|RP|British|Received Pronunciation)\b/i.test(line) || /\ba=[^|}]*\b(UK|RP)\b/.test(m[1]);
          const isUS = /\{\{(?:a|accent)\|[^}]*\b(US|GA|GenAm|General American|American)\b/i.test(line) || /\ba=[^|}]*\b(US|GA)\b/.test(m[1]);
          if (isUK && !uk) uk = ipa;
          if (isUS && !us) us = ipa;
          if (!isUK && !isUS && !any) any = ipa;
        }
      }
    } catch (e) {}
  }
  if (!reached) return { ok: false, uk: '', us: '' };
  // 英米の区別がない場合は共通の記号を使う
  if (!uk && !us && any) { uk = any; us = any; }
  return { ok: true, uk, us };
}

self.KCNet = { webExamples, webPhonetic, webDict };
})();
