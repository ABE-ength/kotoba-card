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

  // 左右にフリック → 次・前の単語（画面の下の端まで、どこでも）
  // 本のページをめくるように、今のカードが指について回転しながらめくれ、下から次の単語が現れる
  const main = document.querySelector('.main');
  const stage = document.querySelector('.stage');
  const card = $('card');
  const NO_SWIPE = '.topbar, input, textarea, .m-backdrop, .overlay';
  let g = null; // 指の動き
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function makePage(dir) {
    // 今のカードの見た目を写した「ページ」を上に重ね、下のカードは中身を隠して白紙にする
    const page = card.cloneNode(true);
    page.removeAttribute('id'); page.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    page.classList.add('m-page');
    const sr = stage.getBoundingClientRect(), cr = card.getBoundingClientRect();
    Object.assign(page.style, { left: (cr.left - sr.left) + 'px', top: (cr.top - sr.top) + 'px', width: cr.width + 'px', height: cr.height + 'px',
      transformOrigin: dir === 'next' ? 'left center' : 'right center' });
    const shade = document.createElement('div'); shade.className = 'm-shade ' + dir; page.appendChild(shade);
    stage.appendChild(page);
    const b1 = card.querySelector('.card-body'), b2 = page.querySelector('.card-body');
    if (b1 && b2) b2.scrollTop = b1.scrollTop;
    card.classList.add('m-blank');
    return page;
  }
  function setTurn(p, dir, t) {
    // t：0（平ら）〜1（めくり終わり）
    const ang = (dir === 'next' ? -1 : 1) * (t * 112);
    p.style.transform = `perspective(1300px) rotateY(${ang}deg)`;
    p.style.boxShadow = `0 ${6 + t * 18}px ${18 + t * 40}px rgba(0,0,0,${0.08 + t * 0.22})`;
    const sh = p.querySelector('.m-shade'); if (sh) sh.style.opacity = String(Math.min(.55, t * .9));
  }
  function endTurn(commit) {
    const { page, dir } = g; g = null;
    page.classList.add('m-anim');
    if (commit) {
      (dir === 'next' ? $('btnNext') : $('btnPrev')).click(); // 下のカードに次の単語を表示
      card.classList.remove('m-blank');
      card.classList.add('m-under'); setTimeout(() => card.classList.remove('m-under'), 320);
      setTurn(page, dir, 1);
      page.style.opacity = '0';
    } else {
      setTurn(page, dir, 0);
    }
    setTimeout(() => { page.remove(); if (!commit) card.classList.remove('m-blank'); }, 300);
  }
  main.addEventListener('touchstart', (e) => {
    if (g && g.page) return;
    if (!mq.matches || e.touches.length !== 1 || (e.target.closest && e.target.closest(NO_SWIPE))) { g = null; return; }
    const t = e.touches[0];
    g = { x0: t.clientX, y0: t.clientY, t0: Date.now(), page: null, dir: null, dx: 0 };
  }, { passive: true });
  main.addEventListener('touchmove', (e) => {
    if (!g) return;
    const t = e.touches[0], dx = t.clientX - g.x0, dy = t.clientY - g.y0;
    if (!g.page) {
      if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { g = null; return; } // 縦のスクロール
      if (Math.abs(dx) < 14) return;
      const dir = dx < 0 ? 'next' : 'prev';
      const btn = dir === 'next' ? $('btnNext') : $('btnPrev');
      if (btn.disabled) { g.edge = true; card.style.transform = `translateX(${dx * 0.18}px)`; return; } // 端：少しだけ動いて戻る
      g.dir = dir; g.page = makePage(dir);
    }
    if (g.edge) { card.style.transform = `translateX(${dx * 0.18}px)`; return; }
    g.dx = dx;
    const w = card.getBoundingClientRect().width || 360;
    const prog = clamp((g.dir === 'next' ? -dx : dx) / (w * 0.95), 0, 1);
    setTurn(g.page, g.dir, prog);
  }, { passive: true });
  const finish = () => {
    if (!g) return;
    if (g.edge) { card.style.transition = 'transform .2s'; card.style.transform = ''; setTimeout(() => { card.style.transition = ''; }, 220); g = null; return; }
    if (!g.page) { g = null; return; }
    const w = card.getBoundingClientRect().width || 360;
    const dist = g.dir === 'next' ? -g.dx : g.dx;
    const speed = dist / Math.max(1, Date.now() - g.t0);
    endTurn(dist > w * 0.28 || (speed > 0.45 && dist > 30));
  };
  main.addEventListener('touchend', finish, { passive: true });
  main.addEventListener('touchcancel', () => { if (g && g.page) endTurn(false); else g = null; }, { passive: true });

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
