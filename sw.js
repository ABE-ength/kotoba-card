// ことばカード：オフライン用（自動生成）
const CACHE = 'kc-1.41.0-f1739f96b2';
const CORE = ["./", "index.html", "style.css", "mobile.css", "renderer.js", "i18n.js", "pattern.js", "web-net.js", "web-api.js", "mobile.js", "web-worker.js", "web-drive.js", "sync.js", "manifest.webmanifest", "sounds/flip-forward.wav", "sounds/flip-back.wav", "icons/icon-192.png", "icons/icon-512.png", "fonts/zmg-500.css", "fonts/zmg-700.css", "data/toeic.tsv.gz", "data/examples.tsv.gz", "data/dict.tsv.gz", "data/dict-lemma.tsv.gz"];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
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
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});
