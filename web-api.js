'use strict';
/* ことばカード（スマホ・ブラウザ版）：PC版の window.api をブラウザの機能で置き換える */
(function () {
  const P = self.KCPattern;
  // ---------- 保存：IndexedDB（メイン）＋ localStorage（予備・閉じる直前用） ----------
  const DB_NAME = 'kotoba-card', STORE = 'kv';
  let dbp = null;
  function idb() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function idbGet(k) {
    const d = await idb();
    return new Promise((res, rej) => { const t = d.transaction(STORE).objectStore(STORE).get(k); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); });
  }
  async function idbSet(k, v) {
    const d = await idb();
    return new Promise((res, rej) => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(v, k); tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); });
  }
  async function idbKeys() {
    const d = await idb();
    return new Promise((res, rej) => { const t = d.transaction(STORE).objectStore(STORE).getAllKeys(); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); });
  }
  async function idbDel(k) {
    const d = await idb();
    return new Promise((res) => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(k); tx.oncomplete = () => res(true); tx.onerror = () => res(false); });
  }
  const LS = 'kotoba-card-data';
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  // 1日1回、日付つきのバックアップを残す（最新14日分・ブラウザの中）
  async function dailyBackup(text) {
    try {
      const k = 'backup-' + today();
      const keys = (await idbKeys()).filter(x => /^backup-\d{4}-\d{2}-\d{2}$/.test(x)).sort();
      if (!keys.includes(k)) {
        await idbSet(k, text);
        keys.push(k);
        while (keys.length > 14) await idbDel(keys.shift());
      }
    } catch (e) {}
  }
  // できるだけ消されない保存を申請（ホーム画面に追加したアプリでは通りやすい）
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}

  // ---------- 例文検索・辞書（バックグラウンドのワーカー） ----------
  let worker = null, seq = 0;
  const waiting = new Map();
  function getWorker() {
    if (worker) return worker;
    worker = new Worker('web-worker.js');
    worker.onmessage = (e) => { const { id, result } = e.data || {}; const f = waiting.get(id); if (f) { waiting.delete(id); f(result); } };
    worker.onerror = () => { for (const f of waiting.values()) f(null); waiting.clear(); };
    return worker;
  }
  function ask(msg, ms = 60000) {
    return new Promise(res => {
      const id = ++seq; waiting.set(id, res);
      getWorker().postMessage({ id, ...msg });
      setTimeout(() => { if (waiting.has(id)) { waiting.delete(id); res(null); } }, ms);
    });
  }

  // ---------- ファイルの書き出し・読み込み ----------
  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function pickFile(accept) {
    return new Promise(resolve => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = accept; inp.style.display = 'none';
      let done = false;
      const fin = (v) => { if (!done) { done = true; inp.remove(); resolve(v); } };
      inp.onchange = () => fin(inp.files && inp.files[0] ? inp.files[0] : null);
      inp.addEventListener('cancel', () => fin(null));
      document.body.appendChild(inp); inp.click();
    });
  }

  window.api = {
    async load() {
      let fromIdb = null, fromLs = null;
      try { fromIdb = await idbGet('data'); } catch (e) {}
      try { fromLs = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) {}
      // 新しく保存された方を使う（閉じる直前の保存は localStorage にだけ入ることがあるため）
      const a = fromIdb && fromIdb.data ? fromIdb : null, b = fromLs && fromLs.data ? fromLs : null;
      const pick = a && b ? (b.at > a.at ? b : a) : (a || b);
      return pick ? pick.data : null;
    },
    async save(data) {
      const rec = { at: Date.now(), data };
      try { localStorage.setItem(LS, JSON.stringify(rec)); } catch (e) {}
      try { await idbSet('data', rec); dailyBackup(JSON.stringify(data)); return true; } catch (e) { return false; }
    },
    saveSync(data) {
      try { localStorage.setItem(LS, JSON.stringify({ at: Date.now(), data })); } catch (e) {}
      idbSet('data', { at: Date.now(), data }).catch(() => {});
      return true;
    },
    dataPath: async () => 'このスマホ（ブラウザ）の中に保存しています。ときどき「書き出し」でバックアップしてください。',
    openDataFolder: async () => {},
    async exportFile({ defaultName, content, kind }) {
      const type = kind === 'csv' ? 'text/csv' : 'application/json';
      const body = (kind === 'csv' ? '﻿' : '') + content;
      // スマホでは「共有」から Googleドライブ・LINE・メールに直接送れるようにする
      try {
        const file = new File([body], defaultName, { type });
        if (navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
          await navigator.share({ files: [file], title: defaultName });
          return defaultName;
        }
      } catch (e) { if (e && e.name === 'AbortError') return null; }
      download(defaultName, body, type);
      return 'ダウンロード：' + defaultName;
    },
    async importFile() {
      const f = await pickFile('.json,.csv,.tsv,.txt,application/json,text/csv,text/plain');
      if (!f) return null;
      let text = await f.text();
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      return { name: f.name, ext, text };
    },
    setZoom(z) { document.documentElement.style.zoom = String(z); },
    related: (word, exclude, meaning, useGeneral) => ask({ type: 'related', word, exclude, meaning, useGeneral }).then(r => r || []),
    dictLookup: (word) => ask({ type: 'dict', word }),
    async relatedHits(word, sentences) {
      const pat = P.buildPattern(word);
      return (sentences || []).map(en => {
        if (!pat) return null;
        const m = pat.re.exec(P.norm(String(en || '')));
        return m ? P.hitRanges(m, en) : null;
      });
    },
    webExamples: (word, ui) => self.KCNet.webExamples(word, ui).catch(() => ({ ok: false, items: [] })),
    webPhonetic: (word) => self.KCNet.webPhonetic(word).catch(() => ({ ok: false, uk: '', us: '' })),
    dictWeb: (word) => self.KCNet.webDict(word).catch(() => ({ ok: false, blocks: [] }))
  };
  // 起動直後に例文データの準備を始めておく
  setTimeout(() => { try { getWorker().postMessage({ id: 0, type: 'warm' }); } catch (e) {} }, 800);

  // ---------- オフライン対応（Service Worker） ----------
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
        // アプリに戻ってきたときにも新しい版がないか確かめる
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
      }).catch(() => {});
    });
    // 新しい版が使えるようになったら、一度だけ自動で読み直す（初めての登録のときは除く）
    if (navigator.serviceWorker.controller) {
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
    }
  }
})();
