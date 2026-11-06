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
  // 紙の音（v1.38）：文庫本の1ページをめくるような、小さく軽い「サラッ」。低い音は入れない。
  //   進む＝明るく上がっていく「サラッ」、戻る＝少し短く下がっていく「スッ」
  function paperSound(ctx, out, t0, strength, dir = 'next') {
    const sr = ctx.sampleRate, fwd = dir !== 'prev';
    const dur = fwd ? 0.15 : 0.12;
    const b = ctx.createBuffer(1, Math.floor(sr * dur), sr), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const x = i / d.length;
      // ふわっと立ち上がって、すっと消える。途中で紙がこすれる小さな波を2回
      const env = Math.min(1, x / 0.12) * Math.pow(1 - x, fwd ? 1.6 : 2.0) * (0.75 + 0.25 * Math.sin(Math.PI * 2 * (fwd ? 2.2 : 1.6) * x));
      let v = (Math.random() * 2 - 1) * 0.55;
      if (Math.random() < 0.012) v += (Math.random() * 2 - 1) * 1.6; // 紙のかすかなカサカサ
      d[i] = v * env;
    }
    const src = ctx.createBufferSource(); src.buffer = b;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800; hp.Q.value = 0.5;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
    if (fwd) { bp.frequency.setValueAtTime(3000, t0); bp.frequency.exponentialRampToValueAtTime(6200, t0 + dur); }
    else { bp.frequency.setValueAtTime(5600, t0); bp.frequency.exponentialRampToValueAtTime(2800, t0 + dur); }
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000; // 耳に痛い高い音は抑える
    const g = ctx.createGain(); g.gain.value = (fwd ? 1.15 : 0.95) * strength;
    src.connect(hp); hp.connect(bp); bp.connect(lp); lp.connect(g); g.connect(out);
    src.start(t0);
  }
  // v1.39：本をめくった録音（利用者の録音を切り出して整えたもの）を使う。読み込めないときは作った音
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
      const master = ac.createGain(); master.gain.value = strength;
      master.connect(ac.destination);
      const buf = rec[dir === 'prev' ? 'prev' : 'next'];
      if (buf) { const s2 = ac.createBufferSource(); s2.buffer = buf; s2.connect(master); s2.start(ac.currentTime + 0.005); }
      else paperSound(ac, master, ac.currentTime + 0.01, 0.8, dir);
    } catch (e) {}
  }
  window.__kcPaperSound = paperSound; // 確認用

  // ---------- 曲がりながらめくれるページ ----------
  // ページを細い短冊に分け、短冊ごとに角度を少しずつ変えて並べる → 紙がたわんだ曲面に見える
  const STRIPS = 18;
  function makePage(from, dir) {
    const sr = stage.getBoundingClientRect(), cr = card.getBoundingClientRect();
    const W = cr.width, H = cr.height, sw = W / STRIPS;
    const wrap = document.createElement('div');
    wrap.className = 'm-curl';
    Object.assign(wrap.style, { left: (cr.left - sr.left) + 'px', top: (cr.top - sr.top) + 'px', width: W + 'px', height: H + 'px' });
    const base = from.cloneNode(true);
    base.removeAttribute('id'); base.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    base.classList.remove('m-blank', 'm-under', 'm-peek'); base.style.cssText = '';
    const scroll = (from.querySelector('.card-body') || {}).scrollTop || 0;
    const strips = [];
    for (let i = 0; i < STRIPS; i++) {
      // 短冊 i は、軸（次へ＝左端、前へ＝右端）から i 番目
      const st = document.createElement('div'); st.className = 'm-strip';
      const left = dir === 'next' ? i * sw : W - (i + 1) * sw; // 元の位置（左から）
      Object.assign(st.style, { width: (sw + 1.2) + 'px', height: H + 'px', left: (dir === 'next' ? left : left - 1.2) + 'px',
        transformOrigin: dir === 'next' ? 'left center' : 'right center' });
      const c = i === 0 ? base : base.cloneNode(true);
      c.classList.add('m-face');
      Object.assign(c.style, { position: 'absolute', top: '0', left: (dir === 'next' ? -left : -left + 1.2) + 'px', width: W + 'px', height: H + 'px', margin: '0' });
      const sh = document.createElement('div'); sh.className = 'm-sh';
      st.appendChild(c); st.appendChild(sh); wrap.appendChild(st);
      strips.push({ el: st, sh, face: c });
    }
    stage.appendChild(wrap);
    strips.forEach(s1 => { const b = s1.face.querySelector('.card-body'); if (b) b.scrollTop = scroll; });
    return { wrap, strips, dir, W, sw, t: 0 };
  }
  function setTurn(pg, t) {
    // t：0（平ら）〜1（めくり終わり）。β＝ページ全体の角度、κ＝端ほど強く反る量
    pg.t = t;
    const beta = t * 180, kappa = Math.sin(Math.PI * Math.min(1, t)) * 85;
    let x = 0, z = 0;
    for (let i = 0; i < pg.strips.length; i++) {
      const r = (i + 0.5) / pg.strips.length;
      const phi = Math.min(180, beta + kappa * r * r);
      const rad = phi * Math.PI / 180;
      const s1 = pg.strips[i];
      // 軸から曲面に沿って x 進んだ位置・手前に z 浮いた位置に、角度 phi で置く
      if (pg.dir === 'next') s1.el.style.transform = `translate3d(${x - i * pg.sw}px,0,${z}px) rotateY(${-phi}deg)`;
      else s1.el.style.transform = `translate3d(${-x + i * pg.sw}px,0,${z}px) rotateY(${phi}deg)`;
      const back = Math.cos(rad) < 0;
      s1.el.classList.toggle('back', back);
      // 影は短冊の中でなめらかに変える（短冊の境目が目立たないように）
      const shade = (deg) => { const c = Math.cos(Math.min(180, deg) * Math.PI / 180); return c < 0 ? 0.18 + 0.25 * (1 + c) : (1 - c) * 0.42; };
      const ra = i / pg.strips.length, rb = (i + 1) / pg.strips.length;
      const a0 = shade(beta + kappa * ra * ra), a1 = shade(beta + kappa * rb * rb);
      s1.sh.style.opacity = '1';
      s1.sh.style.background = `linear-gradient(${pg.dir === 'next' ? 90 : 270}deg, rgba(0,0,0,${a0.toFixed(3)}), rgba(0,0,0,${a1.toFixed(3)}))`;
      x += pg.sw * Math.cos(rad); z += pg.sw * Math.sin(rad);
    }
    pg.wrap.style.filter = `drop-shadow(0 ${6 + t * 14}px ${10 + t * 20}px rgba(0,0,0,${0.08 + Math.sin(Math.PI * t) * 0.22}))`;
    card.style.setProperty('--pk', String(Math.min(1, t * 1.15)));
  }
  function animateTo(pg, target, ms, done) {
    const from = pg.t, t0 = performance.now();
    const ease = (u) => 1 - Math.pow(1 - u, 3);
    const step = (now) => {
      const u = Math.min(1, (now - t0) / ms);
      setTurn(pg, from + (target - from) * ease(u));
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
      animateTo(pg, 1, 430, peekEnd);
      if (!S.playing) flipSound(0.9, dir);
    }
    byGesture = false;
    snap = card.cloneNode(true); snapId = id; snapIdx = S.idx;
  }
  new MutationObserver(() => afterRender()).observe(card, { childList: true });

  // ---------- 指でめくる ----------
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
    e.target.addEventListener('touchmove', onMove, { passive: true });
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
      animateTo(cur.page, 1, 260 * (1 - cur.page.t) + 80, () => {
        g = null; peekEnd();
        // 確定：前の位置に戻してから正式に移動（一覧の印・自動発音など）
        S.idx = cur.save.idx; byGesture = true;
        go(cur.dir === 'next' ? S.idx + 1 : S.idx - 1);
        snap = card.cloneNode(true); snapId = curId(); snapIdx = S.idx;
      });
    } else {
      animateTo(cur.page, 0, 260 * cur.page.t + 60, () => { g = null; peekEnd(); unpeek(cur.save); snap = card.cloneNode(true); snapId = curId(); snapIdx = S.idx; });
    }
  }
  function onEnd() { release(false); }
  function onCancel() { release(true); }

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
    cb.onchange = () => { set().pageSound = cb.checked; save(); if (cb.checked) flipSound(0.9, 'next'); };
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
