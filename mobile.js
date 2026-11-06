'use strict';
/* ことばカード：スマホ用の操作（引き出し・スワイプ・バックグラウンド時の保存） */
(function () {
  const $ = (id) => document.getElementById(id);
  const mq = window.matchMedia('(max-width: 760px)');
  // ☰（単語一覧）と ＋（単語を追加）を上の帯に
  const bar = document.querySelector('.topbar');
  const menu = document.createElement('button');
  menu.className = 'm-btn m-only'; menu.id = 'mMenu'; menu.textContent = '☰'; menu.title = '単語一覧'; menu.setAttribute('aria-label', '単語一覧');
  const add = document.createElement('button');
  add.className = 'm-btn m-add m-only'; add.id = 'mAdd'; add.textContent = '＋'; add.title = '単語を追加'; add.setAttribute('aria-label', '単語を追加');
  bar.insertBefore(menu, bar.firstChild);
  bar.insertBefore(add, bar.querySelector('.topbar-right'));
  const back = document.createElement('div'); back.className = 'm-backdrop'; document.body.appendChild(back);
  const open = () => document.body.classList.add('drawer-open');
  const close = () => document.body.classList.remove('drawer-open');
  menu.onclick = open; back.onclick = close;
  add.onclick = () => { close(); $('btnAdd').click(); };
  // 一覧で単語を選んだら引き出しを閉じる
  $('list').addEventListener('click', (e) => { if (mq.matches && e.target.closest('li')) setTimeout(close, 120); });
  $('btnSettings').addEventListener('click', () => { if (mq.matches) close(); });
  $('btnAdd').addEventListener('click', () => { if (mq.matches) close(); });

  // ---------- ページめくり（v1.36） ----------
  // ・左右フリック：「未評価・未確認」の高さから下なら、画面の端から端までどこでも（上の帯・入力欄・開いている画面は除く）
  // ・単語が変わるときは、いつも（フリック・＜＞・理解度ボタンで次へ・一覧で選ぶ など）ページがめくれる
  // ・めくる音（設定で消せる。自動再生中は鳴らさない）
  const stage = document.querySelector('.stage');
  const card = $('card');
  const NO_SWIPE = '.topbar, input, textarea, .m-backdrop, .overlay, .side';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const soundOn = () => { try { return set().pageSound !== false; } catch (e) { return true; } };

  // 紙をめくる音（音声ファイルを使わず、その場で作る）
  let ac = null;
  function flipSound(strength = 1) {
    if (!soundOn()) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      const now = ac.currentTime, dur = 0.24;
      const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        const x = i / d.length;
        // ざらっとした紙の音：雑音を細かく揺らしながら、すっと消える
        const env = Math.pow(1 - x, 2.2) * (x < 0.06 ? x / 0.06 : 1);
        const flutter = 0.55 + 0.45 * Math.sin(x * 70 + Math.sin(x * 23) * 2);
        d[i] = (Math.random() * 2 - 1) * env * flutter;
      }
      const src = ac.createBufferSource(); src.buffer = buf;
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8;
      bp.frequency.setValueAtTime(1300, now); bp.frequency.exponentialRampToValueAtTime(4200, now + dur);
      const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
      const gain = ac.createGain(); gain.gain.value = 0.55 * strength;
      src.connect(bp); bp.connect(hp); hp.connect(gain); gain.connect(ac.destination);
      src.start(now);
    } catch (e) {}
  }

  // めくる「ページ」：カードの見た目を写して上に重ねる
  function makePage(from, dir) {
    const page = from.cloneNode(true);
    page.removeAttribute('id'); page.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    page.classList.remove('m-blank', 'm-under'); page.classList.add('m-page');
    const sr = stage.getBoundingClientRect(), cr = card.getBoundingClientRect();
    Object.assign(page.style, { left: (cr.left - sr.left) + 'px', top: (cr.top - sr.top) + 'px', width: cr.width + 'px', height: cr.height + 'px',
      transformOrigin: dir === 'next' ? 'left center' : 'right center', transform: '' });
    const shade = document.createElement('div'); shade.className = 'm-shade ' + dir; page.appendChild(shade);
    stage.appendChild(page);
    return page;
  }
  function setTurn(p, dir, t) { // t：0（平ら）〜1（めくり終わり）
    const ang = (dir === 'next' ? -1 : 1) * (t * 112);
    p.style.transform = `perspective(1300px) rotateY(${ang}deg)`;
    p.style.boxShadow = `0 ${6 + t * 18}px ${18 + t * 40}px rgba(0,0,0,${0.08 + t * 0.22})`;
    const sh = p.querySelector('.m-shade'); if (sh) sh.style.opacity = String(Math.min(.55, t * .9));
  }
  function finishTurn(page, dir, commit) {
    page.classList.add('m-anim');
    requestAnimationFrame(() => { setTurn(page, dir, commit ? 1 : 0); if (commit) page.style.opacity = '0'; });
    setTimeout(() => page.remove(), 320);
  }
  // 単語が変わったら、前の見た目（snap）をめくって見せる
  let snap = null, snapId = null, snapIdx = 0, byGesture = false;
  const curId = () => { try { const w = current(); return w ? w.id : null; } catch (e) { return null; } };
  function afterRender() {
    const id = curId();
    if (mq.matches && snap && id && snapId && id !== snapId && !byGesture && !card.classList.contains('m-blank')) {
      const n = (S.queue || []).length;
      const dir = (S.idx === (snapIdx + 1) % Math.max(1, n)) ? 'next' : (S.idx === (snapIdx - 1 + n) % Math.max(1, n)) ? 'prev' : (S.idx > snapIdx ? 'next' : 'prev');
      const page = makePage(snap, dir);
      setTurn(page, dir, 0);
      card.classList.add('m-under'); setTimeout(() => card.classList.remove('m-under'), 340);
      finishTurn(page, dir, true);
      if (!S.playing) flipSound(0.9);
    }
    byGesture = false;
    snap = card.cloneNode(true); snapId = id; snapIdx = S.idx;
  }
  new MutationObserver(() => afterRender()).observe(card, { childList: true });

  // 指でめくる
  let g = null;
  const topLimit = () => { const b = card.querySelector('.card-top') || card; return b.getBoundingClientRect().top - 4; };
  const blocked = (e) => document.body.classList.contains('drawer-open') || (e.target.closest && e.target.closest(NO_SWIPE)) || ['editModal', 'setModal', 'askModal'].some(id => $(id) && !$(id).hidden);
  document.addEventListener('touchstart', (e) => {
    if (g && g.page) return;
    g = null;
    if (!mq.matches || e.touches.length !== 1 || blocked(e)) return;
    const t = e.touches[0];
    if (t.clientY < topLimit()) return; // 「未評価・未確認」より上は対象外
    g = { x0: t.clientX, y0: t.clientY, t0: Date.now(), page: null, dir: null, dx: 0 };
  }, { passive: true, capture: true });
  document.addEventListener('touchmove', (e) => {
    if (!g) return;
    const t = e.touches[0], dx = t.clientX - g.x0, dy = t.clientY - g.y0;
    if (!g.page && !g.edge) {
      if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { g = null; return; } // 縦のスクロール
      if (Math.abs(dx) < 12) return;
      const dir = dx < 0 ? 'next' : 'prev';
      const btn = dir === 'next' ? $('btnNext') : $('btnPrev');
      if (btn.disabled || !curId()) { g.edge = true; }
      else { g.dir = dir; g.page = makePage(card, dir); card.classList.add('m-blank'); }
    }
    if (g.edge) { card.style.transform = `translateX(${dx * 0.18}px)`; return; } // 端：少しだけ動いて戻る
    g.dx = dx;
    const w = card.getBoundingClientRect().width || 360;
    setTurn(g.page, g.dir, clamp((g.dir === 'next' ? -dx : dx) / (w * 0.95), 0, 1));
  }, { passive: true, capture: true });
  function release(cancel) {
    if (!g) return;
    const cur = g; g = null;
    if (cur.edge) { card.style.transition = 'transform .2s'; card.style.transform = ''; setTimeout(() => { card.style.transition = ''; }, 220); return; }
    if (!cur.page) return;
    const w = card.getBoundingClientRect().width || 360;
    const dist = cur.dir === 'next' ? -cur.dx : cur.dx;
    const speed = dist / Math.max(1, Date.now() - cur.t0);
    const commit = !cancel && (dist > w * 0.28 || (speed > 0.45 && dist > 30));
    if (commit) {
      byGesture = true;
      (cur.dir === 'next' ? $('btnNext') : $('btnPrev')).click(); // 下のカードに次の単語を表示
      card.classList.remove('m-blank');
      card.classList.add('m-under'); setTimeout(() => card.classList.remove('m-under'), 340);
      flipSound(1);
      finishTurn(cur.page, cur.dir, true);
    } else {
      finishTurn(cur.page, cur.dir, false);
      setTimeout(() => card.classList.remove('m-blank'), 300);
    }
  }
  document.addEventListener('touchend', () => release(false), { passive: true, capture: true });
  document.addEventListener('touchcancel', () => release(true), { passive: true, capture: true });

  // 設定に「めくる音」を追加
  const autoSpeak = $('optAutoSpeak');
  if (autoSpeak) {
    const row = document.createElement('label');
    row.className = 'set-row chk';
    row.innerHTML = '<input type="checkbox" id="optPageSound"> <span>単語を移るときに、ページをめくる音を鳴らす（自動再生中は鳴らしません）</span>';
    autoSpeak.closest('label').after(row);
    const cb = row.querySelector('input');
    const sync = () => { cb.checked = soundOn(); };
    $('btnSettings').addEventListener('click', () => setTimeout(sync, 0));
    cb.onchange = () => { set().pageSound = cb.checked; save(); if (cb.checked) flipSound(0.8); };
    setTimeout(sync, 1500);
  }

  // 大きな単語が途中で改行されないように、はみ出すときは文字を小さくする（熟語は単語の切れ目でだけ改行）
  function fitWord() {
    const el = card.querySelector('.word');
    if (!el) return;
    el.style.removeProperty('--fit');
    let size = parseFloat(getComputedStyle(el).fontSize) || 40;
    for (let i = 0; i < 30 && el.scrollWidth > el.clientWidth + 1 && size > 14; i++) {
      size = size * 0.92;
      el.style.setProperty('font-size', size.toFixed(1) + 'px', 'important');
    }
  }
  new MutationObserver(() => requestAnimationFrame(fitWord)).observe(card, { childList: true });
  window.addEventListener('resize', () => requestAnimationFrame(fitWord));
  requestAnimationFrame(fitWord);

  // 引き出しも左スワイプで閉じる
  let sx = 0, sy = 0;
  const side = document.querySelector('.side');
  side.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  side.addEventListener('touchend', (e) => { const t = e.changedTouches[0]; if (sx - t.clientX > 70 && Math.abs(t.clientY - sy) < 60) close(); }, { passive: true });

  // アプリを切り替えた・閉じたときに、すぐ保存（スマホは裏で終了されることがあるため）
  const flush = () => { try { if (typeof db !== 'undefined' && db) window.api.saveSync(db); } catch (e) {} };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);

  // PC専用の設定（日本語入力の自動切り替え・保存フォルダを開く）は隠す
  const hidePc = () => {
    const ime = $('optIme'); if (ime) { const row = ime.closest('label'); if (row) row.classList.add('pc-only'); row && (row.style.display = 'none'); }
    const of = $('btnOpenFolder'); if (of) of.style.display = 'none';
  };
  hidePc();
  // データの説明をスマホ（ブラウザ）向けに
  const dataHint = 'データはこの端末のブラウザの中に保存しています。ブラウザの「閲覧データの削除」でサイトのデータを消すと単語も消えるので、Googleドライブ同期を使うか、ときどき「バックアップを書き出す」で保存してください。毎日の自動バックアップ（14日分）もブラウザの中に残します。';
  try { if (typeof I18N !== 'undefined' && I18N.ja) I18N.ja['set.data.hint'] = dataHint; } catch (e) {}
  document.querySelectorAll('[data-i18n="set.data.hint"]').forEach(el => { el.textContent = dataHint; });
  // 戻るボタン（Android）で引き出し・画面を閉じる
  window.addEventListener('popstate', () => {
    if (document.body.classList.contains('drawer-open')) { close(); return; }
    const m = ['editModal', 'setModal', 'askModal'].find(id => $(id) && !$(id).hidden);
    if (m) { $(m).hidden = true; }
  });
  const pushState = () => { try { history.pushState({ kc: 1 }, ''); } catch (e) {} };
  menu.addEventListener('click', pushState);
  ['editModal', 'setModal'].forEach(id => {
    const el = $(id); if (!el) return;
    new MutationObserver(() => { if (!el.hidden) pushState(); }).observe(el, { attributes: true, attributeFilter: ['hidden'] });
  });
})();
