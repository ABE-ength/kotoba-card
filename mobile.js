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

  // ---------- めくる音（v1.37：音声ファイルを使わず、その場で作る。前より大きく、はっきり） ----------
  let ac = null;
  function unlockAudio() { // スマホは、最初に画面に触れたときに音を出せるようにしておく
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state !== 'running') ac.resume();
      loadRec();
      const b = ac.createBuffer(1, 1, ac.sampleRate), s0 = ac.createBufferSource(); s0.buffer = b; s0.connect(ac.destination); s0.start(0);
    } catch (e) {}
  }
  ['touchstart', 'pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, unlockAudio, { once: true, capture: true, passive: true }));
  // 軽やかな紙の音（v1.43）：音ファイルが読めないときの代わり。ふんわり始まり、ふんわり消える小さな「ふわっ」
  function paperSound(ctx, out, t0, strength, dir = 'next') {
    const sr = ctx.sampleRate, fwd = dir !== 'prev';
    const dur = fwd ? 0.20 : 0.17, pk = fwd ? 0.30 : 0.28;
    const b = ctx.createBuffer(1, Math.floor(sr * dur), sr), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const x = i / d.length;
      const env = x < pk ? Math.pow(Math.sin(Math.PI / 2 * x / pk), 2) : Math.pow(Math.cos(Math.PI / 2 * (x - pk) / (1 - pk)), 2);
      d[i] = (Math.random() * 2 - 1) * env;
    }
    const src = ctx.createBufferSource(); src.buffer = b;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.7;
    if (fwd) { bp.frequency.setValueAtTime(2400, t0); bp.frequency.exponentialRampToValueAtTime(3800, t0 + dur); }
    else { bp.frequency.setValueAtTime(3500, t0); bp.frequency.exponentialRampToValueAtTime(2300, t0 + dur); }
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6000; // 耳に刺さる高い音は入れない
    const g = ctx.createGain(); g.gain.value = (fwd ? 0.0113 : 0.0095) * strength;
    src.connect(bp); bp.connect(lp); lp.connect(g); g.connect(out);
    src.start(t0);
  }
  // v1.40：やさしく小さい音ファイルを使う。読み込めないときは同じ形の作った音
  const rec = { next: null, prev: null, loading: false };
  function loadRec() {
    if (rec.loading || !ac) return;
    rec.loading = true;
    [['next', 'sounds/flip-forward.wav'], ['prev', 'sounds/flip-back.wav']].forEach(([k, url]) => {
      fetch(url).then(r => r.arrayBuffer()).then(b => new Promise((res, rej) => ac.decodeAudioData(b, res, rej))).then(buf => { rec[k] = buf; }).catch(() => {});
    });
  }
  function flipSound(strength = 1, dir = 'next') {
    if (!soundOn()) return;
    try {
      unlockAudio(); loadRec();
      const master = ac.createGain(); master.gain.value = strength * volMul();
      master.connect(ac.destination);
      const buf = rec[dir === 'prev' ? 'prev' : 'next'];
      if (buf) { const s2 = ac.createBufferSource(); s2.buffer = buf; s2.connect(master); s2.start(ac.currentTime + 0.005); }
      else paperSound(ac, master, ac.currentTime + 0.01, 1, dir);
      // 鳴らし終わったら音の出口を休ませる（スマホで読み上げの音とぶつからないように。v1.46）
      clearTimeout(flipSound.rest);
      flipSound.rest = setTimeout(() => { try { if (ac && ac.state === 'running') ac.suspend(); } catch (e) {} }, 450);
    } catch (e) {}
  }

  // ---------- タップの取りこぼし対策（v1.46） ----------
  // めくった直後など、ブラウザがタップを「押した」と扱わないことがある。
  // カードの中のボタン（スピーカーなど）を軽くタップしたのに押されなかったときは、こちらで押す
  let tap = null, rescued = null;
  document.addEventListener('touchstart', (e) => {
    tap = null;
    if (e.touches.length !== 1) return;
    const b = e.target.closest && e.target.closest('#card [data-act], #card button');
    if (!b) return;
    const t = e.touches[0];
    tap = { x: t.clientX, y: t.clientY, at: Date.now(), b };
  }, { capture: true, passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!tap) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - tap.x) > 10 || Math.abs(t.clientY - tap.y) > 10) tap = null;
  }, { capture: true, passive: true });
  document.addEventListener('touchend', () => {
    const cur = tap; tap = null;
    if (!cur || Date.now() - cur.at > 700) return;
    let clicked = false;
    const seen = (ev) => { if (cur.b.contains(ev.target)) clicked = true; };
    document.addEventListener('click', seen, true);
    setTimeout(() => {
      document.removeEventListener('click', seen, true);
      if (clicked || !cur.b.isConnected) return;
      rescued = { b: cur.b, at: Date.now() };
      cur.b.click();
    }, 160);
  }, { capture: true, passive: true });
  // こちらで押したあとに、遅れてブラウザの「押した」が届いたら、二重にならないよう捨てる
  document.addEventListener('click', (e) => {
    if (rescued && e.isTrusted && Date.now() - rescued.at < 800 && rescued.b.contains(e.target)) { e.stopImmediatePropagation(); e.preventDefault(); rescued = null; }
  }, true);
  // 音の大きさ：小さめ（標準）・ふつう・大きめ
  const VOL = { small: 0.6, normal: 1, large: 1.6 };
  function volMul() { return VOL[set().pageVol] || VOL.small; }
  window.__kcPaperSound = paperSound; // 確認用

  // ---------- めくれるページ（v1.43：v1.35 の動きに戻した） ----------
  // 今のカードを写した1枚のページを重ね、端を軸に回転させる（最大112°・裏は見せない）。影はめくる側の端に
  function makePage(from, dir) {
    const sr = stage.getBoundingClientRect(), cr = card.getBoundingClientRect();
    const page = from.cloneNode(true);
    page.removeAttribute('id'); page.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    page.classList.remove('m-blank', 'm-under', 'm-peek'); page.style.cssText = '';
    page.classList.add('m-page');
    Object.assign(page.style, { left: (cr.left - sr.left) + 'px', top: (cr.top - sr.top) + 'px', width: cr.width + 'px', height: cr.height + 'px',
      transformOrigin: dir === 'next' ? 'left center' : 'right center' });
    const shade = document.createElement('div'); shade.className = 'm-shade ' + dir; page.appendChild(shade);
    stage.appendChild(page);
    const b1 = from.querySelector('.card-body'), b2 = page.querySelector('.card-body');
    if (b1 && b2) b2.scrollTop = b1.scrollTop;
    return { wrap: page, shade, dir, t: 0 };
  }
  function setTurn(pg, t) {
    // t：0（平ら）〜1（めくり終わり）
    pg.t = t;
    const ang = (pg.dir === 'next' ? -1 : 1) * (t * 112);
    pg.wrap.style.transform = `perspective(1300px) rotateY(${ang}deg)`;
    pg.wrap.style.boxShadow = `0 ${6 + t * 18}px ${18 + t * 40}px rgba(0,0,0,${0.08 + t * 0.22})`;
    pg.shade.style.opacity = String(Math.min(.55, t * .9));
    card.style.setProperty('--pk', String(Math.min(1, t * 1.15)));
  }
  function animateTo(pg, target, ms, done) {
    const from = pg.t, t0 = performance.now();
    const ease = (u) => 1 - Math.pow(1 - u, 3);
    const step = (now) => {
      const u = Math.min(1, (now - t0) / ms);
      setTurn(pg, from + (target - from) * ease(u));
      if (target === 1) pg.wrap.style.opacity = String(1 - u * u);
      if (u < 1) requestAnimationFrame(step);
      else { pg.wrap.remove(); done && done(); }
    };
    requestAnimationFrame(step);
  }
  // 次の単語を下にうっすら見せる（めくるほどはっきり）
  // （カードは描き直されると class が戻るので、外側の stage に印を付ける）
  function peekStart() { stage.classList.add('m-peeking'); card.style.setProperty('--pk', '0'); }
  function peekEnd() { stage.classList.remove('m-peeking'); card.style.removeProperty('--pk'); }

  // 単語が変わったら（＜＞・理解度ボタン・一覧など）、前の見た目をめくって見せる
  let snap = null, snapId = null, snapIdx = 0, byGesture = false;
  const curId = () => { try { const w = current(); return w ? w.id : null; } catch (e) { return null; } };
  function afterRender() {
    if (g && g.page) return; // 指でめくっている途中
    const id = curId();
    if (mq.matches && snap && id && snapId && id !== snapId && !byGesture) {
      const n = Math.max(1, (S.queue || []).length);
      const dir = (S.idx === (snapIdx + 1) % n) ? 'next' : (S.idx === (snapIdx - 1 + n) % n) ? 'prev' : (S.idx > snapIdx ? 'next' : 'prev');
      const pg = makePage(snap, dir);
      peekStart(); setTurn(pg, 0);
      animateTo(pg, 1, 300, peekEnd);
      if (!S.playing) flipSound(0.9, dir);
    }
    byGesture = false;
    snap = card.cloneNode(true); snapId = id; snapIdx = S.idx;
  }
  new MutationObserver(() => afterRender()).observe(card, { childList: true });

  // ---------- 指でめくる ----------
  // 指でめくったときは、下のカードに次の単語を描いてあるので、確定のときに描き直さない
  let noRender = false;
  const renderCard0 = window.renderCard;
  window.renderCard = function () { if (noRender) return; return renderCard0.apply(this, arguments); };
  let g = null;
  const topLimit = () => { const b = card.querySelector('.card-top') || card; return b.getBoundingClientRect().top - 4; };
  const blocked = (e) => document.body.classList.contains('drawer-open') || (e.target.closest && e.target.closest(NO_SWIPE)) || ['editModal', 'setModal', 'askModal'].some(id => $(id) && !$(id).hidden);
  // めくり始めたら、下のカードに次の単語を（まだ確定せずに）表示しておく
  function peekTo(dir) {
    const save = { idx: S.idx, revealed: S.revealed, keys: new Set(S.openKeys), sp: S.speakingPart };
    const target = dir === 'next' ? S.idx + 1 : S.idx - 1;
    S.idx = target; S.revealed = false; S.openKeys.clear(); S.speakingPart = null;
    byGesture = true; renderCard();
    return save;
  }
  function unpeek(save) {
    S.idx = save.idx; S.revealed = save.revealed; S.openKeys = save.keys; S.speakingPart = save.sp;
    byGesture = true; renderCard();
  }
  document.addEventListener('touchstart', (e) => {
    if (g && g.page) return;
    if (g) unbind(g.tgt);
    g = null;
    if (!mq.matches || e.touches.length !== 1 || blocked(e)) return;
    const t = e.touches[0];
    if (t.clientY < topLimit()) return; // 「未評価・未確認」より上は対象外
    g = { x0: t.clientX, y0: t.clientY, t0: Date.now(), page: null, dir: null, dx: 0, tgt: e.target };
    // 指の下の要素は、めくり始めに描き直されて画面から外れることがある。
    // そのあとも指の動きを受け取れるよう、触れた要素そのものにも受け取り口を付ける
    e.target.addEventListener('touchmove', onMove, { passive: false }); // 横にめくるときはブラウザの「はじき」の動きを止める（下で preventDefault）
    e.target.addEventListener('touchend', onEnd, { passive: true });
    e.target.addEventListener('touchcancel', onCancel, { passive: true });
  }, { passive: true, capture: true });
  function unbind(tgt) { if (!tgt) return; tgt.removeEventListener('touchmove', onMove); tgt.removeEventListener('touchend', onEnd); tgt.removeEventListener('touchcancel', onCancel); }
  function onMove(e) {
    if (!g) return;
    const t = e.touches[0], dx = t.clientX - g.x0, dy = t.clientY - g.y0;
    if (!g.page && !g.edge) {
      if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { unbind(g.tgt); g = null; return; } // 縦のスクロール
      if (Math.abs(dx) < 12) return;
      const dir = dx < 0 ? 'next' : 'prev';
      const btn = dir === 'next' ? $('btnNext') : $('btnPrev');
      if (btn.disabled || !curId()) { g.edge = true; }
      else {
        if (S.playing) stopPlay();
        g.dir = dir; g.page = makePage(card, dir);
        g.save = peekTo(dir); peekStart(); setTurn(g.page, 0);
      }
    }
    // 横にめくっている間はブラウザに指の動きを渡さない。渡すと指を離したあとも「はじき」の動きが続き、
    // その間のタップ（スピーカーなど）が「はじきを止める操作」として扱われて押せなかった（v1.44で修正）
    if (e.cancelable) e.preventDefault();
    if (g.edge) { card.style.transform = `translateX(${dx * 0.18}px)`; return; } // 端：少しだけ動いて戻る
    g.dx = dx;
    const w = g.page.W || 360;
    setTurn(g.page, clamp((g.dir === 'next' ? -dx : dx) / (w * 0.95), 0, 1));
  }
  function release(cancel) {
    if (!g || g.released) return;
    const cur = g; cur.released = true; unbind(cur.tgt);
    if (cur.edge) { g = null; card.style.transition = 'transform .2s'; card.style.transform = ''; setTimeout(() => { card.style.transition = ''; }, 220); return; }
    if (!cur.page) { g = null; return; }
    const w = cur.page.W || 360;
    const dist = cur.dir === 'next' ? -cur.dx : cur.dx;
    const speed = dist / Math.max(1, Date.now() - cur.t0);
    const commit = !cancel && (dist > w * 0.28 || (speed > 0.45 && dist > 30));
    if (commit) {
      flipSound(1, cur.dir);
      // 確定はめくり始めに済ませる（一覧の印・自動発音など）。下のカードはもう次の単語なので描き直さない。
      // 以前はめくり終わりに描き直していたため、その瞬間にスピーカーを押すと押した印が消えて鳴らなかった（v1.44で修正）
      S.idx = cur.save.idx; byGesture = true;
      noRender = true;
      try { go(cur.dir === 'next' ? S.idx + 1 : S.idx - 1); } finally { noRender = false; }
      byGesture = false;
      snap = card.cloneNode(true); snapId = curId(); snapIdx = S.idx;
      animateTo(cur.page, 1, 280, () => { g = null; peekEnd(); });
    } else {
      animateTo(cur.page, 0, 280, () => { g = null; peekEnd(); unpeek(cur.save); snap = card.cloneNode(true); snapId = curId(); snapIdx = S.idx; });
    }
  }
  function onEnd() { release(false); }
  function onCancel() { release(true); }

  // 設定に「めくる音」を追加（v1.48：なし・小さめ・ふつう・大きめ から選ぶ）
  const autoSpeak = $('optAutoSpeak');
  if (autoSpeak) {
    const vrow = document.createElement('div');
    vrow.className = 'set-row m-vol';
    vrow.innerHTML = '<span>めくる音</span> <select id="optPageVol"><option value="off">なし</option><option value="small">小さめ</option><option value="normal">ふつう</option><option value="large">大きめ</option></select>';
    autoSpeak.closest('label').after(vrow);
    const ver = document.createElement('div');
    ver.className = 'set-row m-ver';
    ver.innerHTML = '<span style="opacity:.6;font-size:.85em">スマホ版 v1.48.0</span>';
    vrow.after(ver);
    const sel = vrow.querySelector('select');
    sel.onchange = () => {
      if (sel.value === 'off') set().pageSound = false;
      else { set().pageSound = true; set().pageVol = sel.value; }
      save(); flipSound(1, 'next');
    };
    const sync = () => { sel.value = soundOn() ? (set().pageVol || 'small') : 'off'; };
    $('btnSettings').addEventListener('click', () => setTimeout(sync, 0));
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
  // スマホ（Android）の声は、ブラウザから男女を選べないことが多い。その場合は端末の「読み上げの声」の設定で決まる（v1.47）
  try {
    if (/Android/i.test(navigator.userAgent) && typeof I18N !== 'undefined' && I18N.ja) {
      I18N.ja['voice.fallback'] = '「{a}」の声をアプリから選べないため、端末の声「{v}」で読み上げています。スマホの「設定 → テキスト読み上げ（音声出力）→ Google 音声サービス の歯車 → 音声データをインストール → {p}」で、男性・女性の声を選んでください。';
      I18N.ja['toast.accentSub'] = '「{a}」の声をアプリから選べないため、{v}で読み上げます（スマホの読み上げ設定で声を選べます。設定画面の「発音」に手順があります）';
      I18N.ja['accent.uk.pack'] = 'English (United Kingdom)';
      I18N.ja['accent.us.pack'] = 'English (United States)';
    }
  } catch (e) {}
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
