'use strict';
/* 例文検索・辞書（PC版 related-worker.js から自動生成）：データを読み込んでから処理する */
importScripts('pattern.js');
const __files = {};
const __gz = async (name) => {
  const r = await fetch('data/' + name);
  if (!r.ok) throw new Error(name);
  const ds = r.body.pipeThrough(new DecompressionStream('gzip'));
  return await new Response(ds).text();
};
const __ready = (async () => {
  const [t, e, d, l] = await Promise.all(['toeic.tsv.gz', 'examples.tsv.gz', 'dict.tsv.gz', 'dict-lemma.tsv.gz'].map(n => __gz(n).catch(() => '')));
  __files['toeic.tsv'] = t; __files['examples.tsv'] = e; __files['dict.tsv.br'] = d; __files['dict-lemma.tsv.br'] = l;
})();
const __base = '';
const __handlers = [];
const parentPort = { on: (ev, fn) => __handlers.push(fn), postMessage: (m) => self.postMessage(m) };
const fs = { existsSync: () => false, readFileSync: (p) => __files[String(p).split('/').pop()] || '' };
const path = { join: (...a) => a.filter(Boolean).join('/') };
const __zlib = { brotliDecompressSync: (x) => x };
function require(m) { if (m === 'zlib') return __zlib; if (m === './pattern') return self.KCPattern; return {}; }
self.onmessage = async (e) => {
  await __ready;
  const msg = e.data || {};
  if (msg.type === 'warm') { try { loadCorpus(); loadDict(); } catch (err) {} return; }
  for (const h of __handlers) h(msg);
};
// 関連例文の検索（バックグラウンドで実行し、画面を固まらせない）
let corpus = null;
// アクセント記号を外して比較（résumé → resume）。文字数は変わらない
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
// TOEIC例文（アプリ作成・優先）と一般例文（Tatoeba・補助）を読み込む
function loadCorpus() {
  if (corpus) return corpus;
  const en = [], enN = [], ja = [], src = [], index = new Map(), seen = new Set();
  const add = (file, tag) => {
    let text = '';
    // v1.24：容量削減のため圧縮版（.br）があればそれを使う（内容は同じ）
    const p = path.join(__base, 'data', file);
    try {
      if (fs.existsSync(p + '.br')) text = require('zlib').brotliDecompressSync(fs.readFileSync(p + '.br')).toString('utf8');
      else text = fs.readFileSync(p, 'utf8');
    } catch (e) { return; }
    for (const line of text.split('\n')) {
      const t = line.indexOf('\t');
      if (t < 0) continue;
      const e = line.slice(0, t), n = norm(e);
      const key = n.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const i = en.length;
      en.push(e); enN.push(n); ja.push(line.slice(t + 1)); src.push(tag);
      for (const k of new Set(key.match(/[a-z]+/g) || [])) {
        let a = index.get(k);
        if (!a) { a = []; index.set(k, a); }
        a.push(i);
      }
    }
  };
  add('toeic.tsv', 't');
  add('examples.tsv', 'g');
  corpus = { en, enN, ja, src, index };
  return corpus;
}

const { buildPattern, hitRanges } = self.KCPattern;

// 登録した「意味」から、和訳に含まれていれば同じ意味の例文とみなす手がかりを作る
// 例：「延期する」→「延期」、「未払いの；際立った」→「未払い」「際立った」
function meaningKeys(meaning) {
  const keys = new Set();
  String(meaning || '').split(/[、,，;；/／・\s()（）「」『』【】\[\]〜~…]+/).forEach(part => {
    part = part.trim();
    if (!part || /^[ぁ-んー]+$/.test(part)) return;
    if (part.length >= 2) keys.add(part);
    const stem = part.replace(/[ぁ-んー]+$/, '');
    if (stem.length >= 2) keys.add(stem);
    (part.match(/[一-龯々]{2,}/g) || []).forEach(k => keys.add(k));
  });
  return [...keys];
}

function searchRelated(query, exclude, meaning, useGeneral) {
  const c = loadCorpus();
  // 置き換え表現（A / B / sb / one's / be / doing / 〜 など）は空欄として扱う（pattern.js）
  const pat = buildPattern(query);
  if (!pat) return [];
  const re = pat.re;
  // 候補の絞り込み：語句の中でいちばん出現が少ない語を手がかりにする
  let ids = null;
  for (const lit of pat.literals) {
    const set = new Set();
    for (const v of lit.variants) (c.index.get(v) || []).forEach(i => set.add(i));
    if (!set.size) return [];
    if (!ids || set.size < ids.size) ids = set;
  }
  if (!ids) return [];
  const ex = norm(String(exclude || '')).trim().toLowerCase();
  const keys = meaningKeys(meaning);
  const hits = [];
  for (const i of ids) {
    if (c.src[i] === 'g' && !useGeneral) continue;
    const m = re.exec(c.enN[i]);
    if (!m) continue;
    if (ex && c.enN[i].toLowerCase() === ex) continue;
    const n = c.en[i].split(/\s+/).length;
    const score = Math.abs(n - 11) + (n < 5 ? 6 : 0) + (n > 22 ? 12 : 0);
    const sense = keys.some(k => c.ja[i].includes(k)) ? 1 : 0;
    hits.push({ i, score, sense, toeic: c.src[i] === 't' ? 1 : 0, start: m.index, end: m.index + m[0].length, h: hitRanges(m, c.enN[i]) });
  }
  // TOEIC例文を優先 → 意味が一致 → 長さがちょうどよい順
  hits.sort((a, b) => (b.toeic - a.toeic) || (b.sense - a.sense) || (a.score - b.score) || (a.i - b.i));
  // TOEIC例文が4文以上あれば一般例文は使わない。足りないときだけ一般例文で補う（合計最大12文）
  const t = hits.filter(h => h.toeic);
  const pool = t.length >= 4 ? t.slice(0, 20) : t.concat(hits.filter(h => !h.toeic).slice(0, Math.max(0, 12 - t.length)));
  return pool.map(h => ({ en: c.en[h.i], ja: c.ja[h.i], s: h.start, e: h.end, h: h.h, m: h.sense, src: c.src[h.i] }));
}


// ---------- 英和辞書（v1.30）：EJDict-hand（CC0）＋ WordNet 3.0 の品詞 ----------
let dict = null, lemmaExc = null;
function loadDict() {
  if (dict) return dict;
  dict = new Map(); lemmaExc = new Map();
  const read = (f) => require('zlib').brotliDecompressSync(fs.readFileSync(path.join(__base, 'data', f))).toString('utf8');
  try {
    for (const line of read('dict.tsv.br').split('\n')) {
      const i = line.indexOf('\t'); if (i < 0) continue;
      dict.set(line.slice(0, i), line.slice(i + 1));
    }
    for (const line of read('dict-lemma.tsv.br').split('\n')) {
      const [a, b] = line.split('\t'); if (a && b) lemmaExc.set(a, b);
    }
  } catch (e) {}
  return dict;
}
const PH_UPPER = new Set(['A', 'B', 'C', 'X', 'Y']);
const PH = new Set(['sb', 'sth', 'someone', 'somebody', 'something', "one's", 'oneself', "someone's", '〜', '~', '…', '...', 'doing', '〜ing', '~ing', 'do']);
const PARTICLE = new Set(['forward', 'down', 'off', 'over', 'back', 'away', 'around', 'about', 'through', 'along', 'ahead', 'across', 'behind', 'apart', 'aside', 'together', 'than', 'not', 'no', 'one', 'some', 'any', 'this', 'that', 'such', 'so', 'very', 'well']);
const STOP = new Set(['be', 'a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'by', 'from', 'as', 'and', 'or', 'is', 'are', 'was', 'were', 'it', 'up', 'out', 'into']);
// 変化形 → 原形の候補（例外表 → 規則）
function lemmas(t) {
  const out = [];
  if (lemmaExc.has(t)) out.push(lemmaExc.get(t));
  const rules = [[/ies$/, 'y'], [/ves$/, 'f'], [/ves$/, 'fe'], [/(ss|sh|ch|x|z|o)es$/, '$1'], [/s$/, ''], [/ied$/, 'y'], [/([^aeiou])\1ed$/, '$1'], [/ed$/, 'e'], [/ed$/, ''],
    [/([^aeiou])\1ing$/, '$1'], [/ing$/, 'e'], [/ing$/, ''], [/ier$/, 'y'], [/iest$/, 'y'], [/([^aeiou])\1er$/, '$1'], [/([^aeiou])\1est$/, '$1'], [/er$/, ''], [/est$/, ''], [/er$/, 'e'], [/est$/, 'e']];
  for (const [re, rep] of rules) if (re.test(t)) out.push(t.replace(re, rep));
  return out.filter(x => x && x !== t);
}
function parseRec(rec) {
  return rec.split('\t').map(b => { const [pos, txt] = b.split('\x1f'); return { pos: pos || '', senses: (txt || '').split(' ／ ').filter(Boolean) }; });
}
// 登録した語を辞書で調べる。熟語の置き換え表現（A・B・sb・doing など）は外して探す
function lookupDict(word) {
  loadDict();
  const raw = String(word || '').replace(/[’‘]/g, "'").replace(/[.!?。]+$/, '').replace(/\s+/g, ' ').trim();
  if (!raw) return null;
  const toks = raw.split(' ');
  const core = toks.filter((x, i) => !PH_UPPER.has(x) && !PH.has(x.toLowerCase()) && !(i === 0 && /^be$/i.test(x) && toks.length > 1)).map(x => x.toLowerCase());
  const cands = [];
  const add = (s) => { s = s.trim(); if (s && !cands.includes(s)) cands.push(s); };
  add(raw.toLowerCase()); add(core.join(' '));
  if (core.length) for (const l of lemmas(core[0])) add([l, ...core.slice(1)].join(' '));
  for (const c of cands) if (dict.has(c)) return { key: c, exact: true, phrase: toks.length > 1, blocks: parseRec(dict.get(c)) };
  // v1.32：辞書に載っていない熟語・複合語 → 中身の語（置き換え表現・前置詞・副詞の小さな語を除く、最大3語）をそれぞれ引く
  //   in a slow period → slow・period ／ compare A with B → compare ／ floor plan → floor・plan
  if (toks.length > 1) {
    const parts = [];
    for (const x of core) {
      if (STOP.has(x) || PARTICLE.has(x)) continue;
      const k = [x, ...lemmas(x)].find(y => dict.has(y));
      if (k && !parts.some(p => p.key === k)) parts.push({ key: k, blocks: parseRec(dict.get(k)) });
      if (parts.length >= 3) break;
    }
    if (parts.length) return { key: raw, exact: false, phrase: true, parts, blocks: [] };
  }
  return null;
}

parentPort.on('message', ({ id, type, word, exclude, meaning, useGeneral }) => {
  let result = [];
  if (type === 'dict') {
    try { result = lookupDict(word); } catch (e) { result = null; }
    return parentPort.postMessage({ id, result });
  }
  try { result = searchRelated(word, exclude, meaning, useGeneral !== false); } catch (e) {}
  parentPort.postMessage({ id, result });
});
