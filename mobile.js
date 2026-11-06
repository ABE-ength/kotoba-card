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

  // 左右にフリック → 次・前の単語（カードの下・理解度ボタン・自動再生の部分も含む画面全体で）
  // ただし、横にスクロールする部分（出題順・速度など）や入力欄・選択欄の上では反応しない
  let sx = 0, sy = 0, st = 0, sOk = false;
  const main = document.querySelector('.main');
  const NO_SWIPE = '.topbar, .speeds, select, input, textarea, .m-backdrop, .overlay';
  main.addEventListener('touchstart', (e) => {
    const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now();
    sOk = e.touches.length === 1 && !(e.target.closest && e.target.closest(NO_SWIPE));
  }, { passive: true });
  main.addEventListener('touchend', (e) => {
    if (!sOk || !mq.matches) return;
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Date.now() - st > 700 || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    (dx < 0 ? $('btnNext') : $('btnPrev')).click();
  }, { passive: true });
  const card = $('card');

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
