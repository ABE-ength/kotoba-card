(function () {
// 登録した語句 → 例文検索用のパターン（同梱例文の検索とネット検索で共通）
// 置き換え表現（A / B / sb / sth / one's / oneself / be / do / doing / 〜 / 〜ing）を「空欄」として扱う。
//   compare A with B            → compare this year's sales with last year's
//   be looking forward to doing → I'm looking forward to meeting
//   look forward to 〜ing        → look forward to seeing

const IRREGULAR = {
  be: ['am', 'is', 'are', 'was', 'were', 'been', 'being'], have: ['has', 'had', 'having'], do: ['does', 'did', 'done', 'doing'],
  go: ['goes', 'went', 'gone', 'going'], take: ['took', 'taken'], make: ['made'], get: ['got', 'gotten', 'getting'],
  give: ['gave', 'given'], come: ['came'], see: ['saw', 'seen'], know: ['knew', 'known'], think: ['thought'],
  buy: ['bought'], bring: ['brought'], hold: ['held'], keep: ['kept'], leave: ['left'], meet: ['met'], pay: ['paid'],
  send: ['sent'], spend: ['spent'], build: ['built'], lead: ['led'], set: ['setting'], put: ['putting'], run: ['ran', 'running'],
  write: ['wrote', 'written'], speak: ['spoke', 'spoken'], break: ['broke', 'broken'], choose: ['chose', 'chosen'],
  begin: ['began', 'begun', 'beginning'], fall: ['fell', 'fallen'], find: ['found'], feel: ['felt'], tell: ['told'],
  sell: ['sold'], stand: ['stood'], understand: ['understood'], wear: ['wore', 'worn'], win: ['won', 'winning'],
  draw: ['drew', 'drawn'], grow: ['grew', 'grown'], drive: ['drove', 'driven'], rise: ['rose', 'risen'],
  arise: ['arose', 'arisen'], seek: ['sought'], teach: ['taught'], catch: ['caught'], fly: ['flew', 'flown'],
  forget: ['forgot', 'forgotten'], hire: ['hired'], lay: ['laid'], lend: ['lent'], lose: ['lost'], mean: ['meant'],
  shut: ['shutting'], cut: ['cutting'], deal: ['dealt'], undertake: ['undertook', 'undertaken'], withdraw: ['withdrew', 'withdrawn'],
  oversee: ['oversaw', 'overseen'], overcome: ['overcame'], forecast: ['forecasts'], child: ['children'], person: ['people'],
  look: ['looks', 'looked', 'looking'], fill: ['filled', 'filling'], sign: ['signed', 'signing']
};
// 活用形（postpone → postpones / postponed / postponing など）
function forms(w) {
  w = w.toLowerCase();
  const f = new Set([w, w + 's', w + 'es', w + 'ed', w + 'd', w + 'ing']);
  if (w.endsWith('e')) f.add(w.slice(0, -1) + 'ing');
  if (/[^aeiou]y$/.test(w)) { f.add(w.slice(0, -1) + 'ies'); f.add(w.slice(0, -1) + 'ied'); }
  if (/(^|[^aeiou])[aeiou][bdgklmnprt]$/.test(w)) { const d = w + w.slice(-1); f.add(d + 'ed'); f.add(d + 'ing'); }
  if (/(fe|f)$/.test(w)) f.add(w.replace(/(fe|f)$/, 'ves'));
  // looking → look 系も含める（be looking forward to … を look forward to … でも見つける）
  if (/ing$/.test(w) && w.length > 5) { const base = w.slice(0, -3); f.add(base); f.add(base + 's'); f.add(base + 'ed'); }
  (IRREGULAR[w] || []).forEach(x => f.add(x));
  return [...f];
}
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
const FUNCTION_WORDS = new Set(['a', 'an', 'the', 'in', 'on', 'at', 'to', 'of', 'for', 'with', 'by', 'from', 'as', 'up', 'out', 'off', 'into', 'and', 'or']);

// 空欄の正規表現
const P = {
  // 文中の空欄：1〜4語（できるだけ短く）
  WMID: "[^\\s.!?;:]+(?:\\s+[^\\s.!?;:]+){0,3}?",
  // 末尾の空欄：1〜3語（接続詞・前置詞の手前で止める）
  WEND: "[^\\s.!?;:,]+(?:\\s+(?!(?:and|but|or|because|when|while|which|that|who|so|if|as|than|to|in|on|at|for|by|from|with|after|before|until)\\b)[^\\s.!?;:,]+){0,2}",
  // -ing 形（morning / something / during など、動詞でない -ing 語は除く）
  ING: "(?!(?:morning|evening|thing|nothing|something|anything|everything|during|spring|string|ring|king|ceiling|wedding|bring|sing|swing|wing|sibling|pudding|darling|shilling)\\b)[a-z]+ing",
  VERB: "[a-z]+",
  POSS: "(?:my|your|his|her|its|our|their|one's|[a-z]+'s|[a-z]+s')",
  SELF: "(?:myself|yourself|himself|herself|itself|oneself|ourselves|yourselves|themselves)",
  BE: "(?:[a-z]+'(?:m|re|s)|am|is|are|was|were|be|been|being)"
};

function classify(raw, idx) {
  const t = raw.replace(/^[.,;:!?"]+|[.,;:!?"]+$/g, '');
  const low = t.toLowerCase();
  if (!t) return null;
  if (/^~$/.test(t)) return { k: 'W' };
  if (/^~ing$/i.test(t) || (low === 'doing' && idx > 0)) return { k: 'ING' };
  if (/^~/.test(t)) return { k: 'W' };
  if (low === 'do' && idx > 0) return { k: 'VERB' };
  if (/^[ABCXY]$/.test(t)) return { k: 'W' };
  if (/^(sb|sth|someone|something|somebody|someplace|somewhere)\.?$/.test(low)) return { k: 'W' };
  if (/^(sb's|sth's|someone's|somebody's|one's)$/.test(low)) return { k: 'POSS' };
  if (/^(oneself|sbself)$/.test(low)) return { k: 'SELF' };
  if (low === 'be') return { k: 'BE' };
  const lit = low.replace(/[^a-z'\-]/g, '');
  if (!lit || !/[a-z]/.test(lit)) return null;
  return { k: 'L', v: lit };
}

// 戻り値：{ re, literals:[{ variants:[…] }], webQuery } または null（英語の語がない）
function buildPattern(query) {
  const s = norm(query)
    .replace(/\(.*?\)|（.*?）|\[.*?\]|【.*?】/g, ' ')
    .replace(/[’‘`]/g, "'")
    .replace(/[～〜~]/g, ' ~')
    .replace(/[/／]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const tokens = [];
  s.split(' ').forEach((raw, i) => {
    const c = classify(raw, i);
    if (!c) return;
    if (c.k === 'W' && tokens.length && tokens[tokens.length - 1].k === 'W') return; // 空欄の連続はまとめる
    tokens.push(c);
  });
  // 先頭の空欄（sb / 〜 など）は条件にならないので外す
  while (tokens.length && tokens[0].k === 'W') tokens.shift();
  if (!tokens.some(t => t.k === 'L')) return null;

  const firstLit = tokens.findIndex(t => t.k === 'L');
  const lastIdx = tokens.length - 1;
  const literals = [];
  const parts = tokens.map((t, i) => {
    if (t.k === 'L') {
      let variants;
      if (i === firstLit && (t.v.length >= 3 || IRREGULAR[t.v]) && !FUNCTION_WORDS.has(t.v) && !/['\-]/.test(t.v)) variants = forms(t.v);
      else if (i === lastIdx && /^[a-z]+$/.test(t.v) && !FUNCTION_WORDS.has(t.v)) variants = [t.v, t.v + 's', t.v + 'es'];
      else variants = [t.v];
      literals.push({ variants: variants.map(v => v.split(/[-']/)[0]).filter(Boolean), word: t.v });
      return `(${variants.map(reEsc).join('|')})`; // 登録語の部分だけ捕まえて強調に使う
    }
    if (t.k === 'W') return i === lastIdx ? P.WEND : P.WMID;
    return P[t.k];
  });
  // 先頭の be は省略可（be looking forward to → looking forward to でも可）
  let body = '';
  parts.forEach((p, i) => {
    if (i === 0) { body = tokens[0].k === 'BE' && parts.length > 1 ? `(?:${p}[\\s-]+)?` : p; return; }
    body += (i === 1 && tokens[0].k === 'BE' && parts.length > 1) ? p : '[\\s-]+' + p;
  });
  const endsWithWord = ['L', 'ING', 'VERB', 'SELF', 'BE'].includes(tokens[lastIdx].k);
  const re = new RegExp('\\b' + body + (endsWithWord ? '\\b' : ''), 'id');
  const webQuery = tokens.filter(t => t.k === 'L').map(t => t.v).join(' ');
  return { re, literals, webQuery };
}

// 強調する範囲：登録した語（compare / with など）だけ。置き換え表現（A・B・sb・be・doing など）に当たる語は強調しない。
// 続いている語（look forward to）は1つにまとめる。戻り値 [[開始, 終了], …]
function hitRanges(m, text) {
  const out = [];
  for (let k = 1; k < (m.indices || []).length; k++) {
    const r = m.indices[k];
    if (!r) continue;
    const last = out[out.length - 1];
    if (last && /^[\s\-]*$/.test(text.slice(last[1], r[0]))) last[1] = r[1];
    else out.push([r[0], r[1]]);
  }
  return out;
}

const __kcp = { forms, buildPattern, norm, reEsc, hitRanges };
if (typeof module !== 'undefined' && module.exports) module.exports = __kcp; else self.KCPattern = __kcp;

})();
