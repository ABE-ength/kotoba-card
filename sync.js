'use strict';
/* ことばカード：Googleドライブ同期（PC版・スマホ版で共通）
 *  - Googleドライブの「アプリ専用の隠しフォルダ」に kotoba-sync.json を1つ置き、各端末がそれと突き合わせる
 *  - 単語ごとに「最後に変わった時刻（mtime）」を比べ、新しい方を採用。削除した単語は記録（deleted）して復活させない
 *  - 同じ単語（つづりが同じ）が別々の端末で登録されていたら、新しい方を残す
 *  - 関連例文・発音記号・辞書の検索結果は各端末で作り直せるので、同期しない（データを軽く）
 *  - 設定（背景の色など）は端末ごと
 *  端末ごとの違い（ログイン方法・ドライブへの読み書き）は window.api.drive にある
 */
(function () {
  const drive = window.api && window.api.drive;
  const FIELDS = ['word', 'meaning', 'example', 'exampleJa', 'note', 'status', 'nNo', 'nSome', 'nYes', 'views', 'lastSeen', 'created'];
  const KEEP_DELETED = 365 * 864e5; // 削除の記録は1年残す
  const sig = (w) => JSON.stringify(FIELDS.map(k => (w[k] === undefined ? null : w[k])));
  // 短い目印（内容が変わったかどうかの判定用）
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + s.length.toString(36); }

  // 保存のたびに：内容が変わった単語に更新時刻をつける
  function touch() {
    const now = Date.now();
    for (const w of db.words) {
      const h = hash(sig(w));
      if (w._h === h) continue;
      // 初めて見る単語（以前の版のデータ・新規登録）は登録時刻、変わった単語は今の時刻
      w.mtime = w._h === undefined ? (w.mtime || Math.max(w.created || 0, w.lastSeen || 0) || now) : now;
      w._h = h;
    }
  }
  const slim = (w) => { const o = { id: w.id, mtime: w.mtime || 0 }; for (const k of FIELDS) o[k] = w[k] === undefined ? null : w[k]; return o; };
  function pack() {
    const del = {}; const cut = Date.now() - KEEP_DELETED;
    for (const [id, t] of Object.entries(db.deleted || {}).sort((a, b) => (a[0] < b[0] ? -1 : 1))) if (t > cut) del[id] = t;
    return { app: 'kotoba-card', schema: 1, at: Date.now(), words: db.words.map(slim).sort((a, b) => (a.created - b.created) || (a.id < b.id ? -1 : 1)), deleted: del };
  }

  // 手元のデータとドライブのデータを1つにまとめる
  function merge(remote) {
    const now = Date.now();
    const del = { ...(db.deleted || {}) };
    for (const [id, t] of Object.entries((remote && remote.deleted) || {})) if (!del[id] || t > del[id]) del[id] = t;
    const local = new Map(db.words.map(w => [w.id, w]));
    const rem = new Map(((remote && remote.words) || []).filter(w => w && w.id && w.word).map(w => [w.id, w]));
    const out = [];
    let fromRemote = 0;
    // ドライブにすでにデータがあるとき、この端末で自動的に入ったサンプル単語（未使用）は持ち込まない
    const remoteHasData = rem.size > 0 || Object.keys((remote && remote.deleted) || {}).length > 0;
    const unused = (x) => !((x.mtime || 0) > (x.created || 0) + 1000 || (x.lastSeen || 0) > 0 || x.status);
    for (const id of new Set([...local.keys(), ...rem.keys()])) {
      const l = local.get(id), r = rem.get(id);
      let w;
      if (l && r) {
        if ((r.mtime || 0) > (l.mtime || 0)) { w = { ...l }; for (const k of FIELDS) w[k] = r[k] ?? (k === 'status' ? null : w[k]); w.mtime = r.mtime; fromRemote++; }
        else w = l;
      } else if (l) { if (remoteHasData && l.sample && unused(l)) continue; w = l; }
      else { w = { ...newWord(r), id: r.id, mtime: r.mtime || 0 }; fromRemote++; }
      if (del[id] && del[id] >= (w.mtime || 0)) continue; // 削除の方が新しい
      out.push(w);
    }
    // 同じつづりの単語が2つあれば、新しい方を残す（初回のサンプル単語や、別々の端末での同じ登録）
    const byWord = new Map();
    for (const w of out) {
      const k = String(w.word || '').trim().toLowerCase();
      const o = byWord.get(k);
      if (!o) { byWord.set(k, w); continue; }
      // 登録したあと一度でも使った（理解度・編集）ものを優先し、次に新しい方
      const used = (x) => ((x.mtime || 0) > (x.created || 0) + 1000 || (x.lastSeen || 0) > 0) ? 1 : 0;
      const keep = (used(w) - used(o) || (w.mtime || 0) - (o.mtime || 0)) > 0 ? w : o, drop = keep === w ? o : w;
      byWord.set(k, keep); del[drop.id] = Math.max(now, (drop.mtime || 0) + 1);
    }
    const words = out.filter(w => byWord.get(String(w.word || '').trim().toLowerCase()) === w);
    for (const w of words) w._h = hash(sig(w)); // 取り込んだ内容は「変更」扱いにしない
    return { words, deleted: del, fromRemote };
  }

  // ---------- 状態と画面 ----------
  const st = { busy: false, last: 0, needAuth: false, error: '', timer: 0, info: null };
  const on = () => !!(set().sync && set().sync.on);
  const fmt = (t) => { if (!t) return '—'; const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  function chip() {
    const c = $('syncChip'); if (!c) return;
    c.hidden = !on();
    c.classList.toggle('warn', !!(st.needAuth || st.error));
    c.classList.toggle('busy', st.busy);
    c.querySelector('span').textContent = st.busy ? '同期中…' : st.needAuth ? 'タップで同期' : st.error ? '同期エラー' : (st.last ? '同期 ' + fmt(st.last).split(' ')[1] : '同期');
    c.title = st.error ? st.error : st.needAuth ? 'Googleドライブへのログインの確認が必要です（タップ）' : 'Googleドライブと同期（タップで今すぐ）';
  }
  async function panel() {
    const box = $('syncPanel'); if (!box || !drive) return;
    let s = {};
    try { s = await drive.status(); } catch (e) {}
    st.info = s;
    const cfg = s.config || {};
    $('syncCid').value = cfg.clientId || '';
    const sec = $('syncSecretRow'); if (sec) sec.hidden = !s.needsSecret;
    if ($('syncSecret')) $('syncSecret').placeholder = cfg.hasSecret ? '（保存済み）' : 'GOCSPX-…';
    const lines = [];
    if (!cfg.clientId) lines.push('まだ設定されていません。下の手順で作った「クライアントID」を入力してください。');
    else if (!s.signedIn) lines.push('Googleにログインしていません。「Googleでログイン」を押してください。');
    else lines.push('Googleドライブに接続しています' + (s.account ? `（${esc(s.account)}）` : '') + '。');
    if (on()) lines.push(`最後の同期：${fmt(st.last || (set().sync && set().sync.last))}` + (st.error ? `　<b class="sync-err">${esc(st.error)}</b>` : ''));
    $('syncStatus').innerHTML = lines.join('<br>');
    $('syncLogin').hidden = !cfg.clientId || !!s.signedIn;
    $('syncNowBtn').hidden = !s.signedIn;
    $('syncLogout').hidden = !s.signedIn;
    chip();
  }

  // ---------- 同期の本体 ----------
  async function syncNow(interactive) {
    if (!drive || st.busy) return;
    if (!on() && !interactive) return;
    st.busy = true; st.error = ''; chip();
    try {
      if (window.KCSync) touch();
      let r = await drive.read(interactive);
      if (r && r.needAuth) { st.needAuth = true; if (interactive) { const a = await drive.signIn(); if (a && a.redirecting) return; if (!a || !a.ok) throw new Error(a && a.error || 'ログインできませんでした'); r = await drive.read(true); } else return; }
      if (!r || !r.ok) throw new Error((r && r.error) || 'ドライブを読めませんでした');
      st.needAuth = false;
      let remote = null;
      if (r.text) { try { remote = JSON.parse(r.text); } catch (e) { remote = null; } }
      if (remote && remote.app !== 'kotoba-card') remote = null;
      const canon = (o) => o ? JSON.stringify({ w: (o.words || []).map(slim).sort((a, b) => (a.id < b.id ? -1 : 1)), d: Object.entries(o.deleted || {}).sort((a, b) => (a[0] < b[0] ? -1 : 1)) }) : '';
      const before = canon(remote);
      const curId = current() && current().id;
      const m = merge(remote);
      const localChanged = m.fromRemote > 0 || m.words.length !== db.words.length || Object.keys(m.deleted).length !== Object.keys(db.deleted || {}).length;
      db.words = m.words; db.deleted = m.deleted;
      const out = pack();
      if (canon(out) !== before) {
        const wr = await drive.write(JSON.stringify(out));
        if (wr && wr.needAuth) { st.needAuth = true; throw new Error('ログインの確認が必要です'); }
        if (!wr || !wr.ok) throw new Error((wr && wr.error) || 'ドライブに保存できませんでした');
      }
      st.last = Date.now();
      if (!set().sync) set().sync = {};
      set().sync.on = true; set().sync.last = st.last;
      if (localChanged) {
        if (typeof stopPlay === 'function' && S.playing) stopPlay();
        buildQueue(curId); renderAll();
        if (typeof relatedBackground === 'function') relatedBackground();
        if (m.fromRemote) toast(`ドライブから ${m.fromRemote} 語の変更を取り込みました`);
      }
      store.save(db).catch(() => {});
      if (interactive) toast('同期しました');
    } catch (e) {
      st.error = String((e && e.message) || e || '同期できませんでした');
      if (interactive) toast(st.error);
    } finally {
      st.busy = false; chip();
      if (!$('setModal').hidden) panel();
    }
  }
  // 変更のあと少し待ってから送る（続けて操作しているあいだは待つ）
  function changed() {
    if (!on() || !drive) return;
    clearTimeout(st.timer);
    st.timer = setTimeout(() => syncNow(false), 20000);
  }

  window.KCSync = { touch, changed, syncNow, merge, pack };
  if (!drive) return;

  // ---------- 画面の操作 ----------
  $('syncChip') && ($('syncChip').onclick = () => syncNow(true));
  $('syncSave').onclick = async () => {
    const cid = $('syncCid').value.trim(), sec = $('syncSecret') ? $('syncSecret').value.trim() : '';
    if (!/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/i.test(cid)) { toast('クライアントIDの形が違います（…apps.googleusercontent.com）'); return; }
    await drive.setConfig({ clientId: cid, clientSecret: sec || undefined });
    if ($('syncSecret')) $('syncSecret').value = '';
    toast('保存しました'); panel();
  };
  $('syncLogin').onclick = async () => {
    const r = await drive.signIn();
    if (r && r.redirecting) return; // スマホ版：Googleのページへ移動
    if (!r || !r.ok) { toast((r && r.error) || 'ログインできませんでした'); panel(); return; }
    if (!set().sync) set().sync = {};
    set().sync.on = true; save();
    await syncNow(true);
  };
  $('syncNowBtn').onclick = () => { if (!set().sync) set().sync = {}; set().sync.on = true; syncNow(true); };
  $('syncLogout').onclick = async () => {
    await drive.signOut();
    if (set().sync) set().sync.on = false;
    save(); st.needAuth = false; st.error = ''; panel();
    toast('ログアウトしました（この端末のデータはそのまま残ります）');
  };
  $('btnSettings').addEventListener('click', () => setTimeout(panel, 50));

  // 起動したら同期。スマホ版はログインから戻ってきたときも
  (async () => {
    await sleep(1500);
    if (drive.resume) { const back = await drive.resume(); if (back && back.ok) { if (!set().sync) set().sync = {}; set().sync.on = true; save(); await syncNow(true); return; } }
    st.last = (set().sync && set().sync.last) || 0;
    chip();
    if (on()) syncNow(false);
  })();
  // アプリに戻ってきたら、1分以上たっていれば同期
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && on() && Date.now() - st.last > 60000) syncNow(false);
    if (document.visibilityState === 'hidden' && on() && st.timer) { clearTimeout(st.timer); st.timer = 0; syncNow(false); }
  });
})();
