// ことばカード：オフライン用（自動生成）
const CACHE = 'kc-1.42.0-17dbb0c4b7';
const CORE = ["./", "index.html", "style.css", "mobile.css", "renderer.js", "i18n.js", "pattern.js", "web-net.js", "web-api.js", "mobile.js", "web-worker.js", "web-drive.js", "sync.js", "manifest.webmanifest", "sounds/flip-forward.wav", "sounds/flip-back.wav", "icons/icon-192.png", "icons/icon-512.png", "fonts/zmg-500.css", "fonts/zmg-700.css", "data/toeic.tsv.gz", "data/examples.tsv.gz", "data/dict.tsv.gz", "data/dict-lemma.tsv.gz"];
self.addEventListener('install', (e) => {
  // ブラウザの一時保存を通さず、必ずサーバーから最新を取る
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('kc-') && k !== CACHE && k !== 'kc-fonts').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // ネット検索はそのまま
  // フォント（文字ごとに分かれたファイル）は使ったものだけ保存
  if (u.pathname.includes('/fonts/files/')) {
    e.respondWith(caches.open('kc-fonts').then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }))));
    return;
  }
  // 大きなデータ（data/）は保存済みを使う。画面とプログラムはネットから最新を取り、つながらないときだけ保存済みを使う
  if (u.pathname.includes('/data/')) {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
    return;
  }
  e.respondWith((async () => {
    try {
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch(e.request, { cache: 'no-cache', signal: ctl.signal }); clearTimeout(tm);
      if (r.ok) { const c = await caches.open(CACHE); c.put(e.request, r.clone()); }
      return r;
    } catch (err) {
      return (await caches.match(e.request, { ignoreSearch: true })) || Response.error();
    }
  })());
});
