'use strict';
/* ことばカード（スマホ・ブラウザ版）：Googleドライブ同期のログインと読み書き
 *  スマホに入れたアプリでは、Googleのログイン用ポップアップがうまく動かないことがあるため、
 *  Googleのページへ移動してログイン → アプリに戻る方式（戻るときに1時間使える鍵を受け取る）。
 *  鍵が切れたら、☁（タップで同期）を押すと、確認だけしてすぐ戻ってくる。
 */
(function () {
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata', NAME = 'kotoba-sync.json';
  const K = { cid: 'kc-drive-cid', tok: 'kc-drive-token', state: 'kc-drive-state', on: 'kc-drive-on' };
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, del: (k) => { try { localStorage.removeItem(k); } catch (e) {} } };
  const redirectUri = () => location.origin + location.pathname.replace(/index\.html$/, '');
  let fileId = '';
  const token = () => { try { const t = JSON.parse(ls.get(K.tok) || 'null'); return t && t.exp > Date.now() + 60000 ? t.access : ''; } catch (e) { return ''; } };
  function go(prompt) {
    const cid = ls.get(K.cid);
    if (!cid) return { ok: false, error: 'クライアントIDが設定されていません' };
    try { if (typeof db !== 'undefined' && db) window.api.saveSync(db); } catch (e) {}
    const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
    ls.set(K.state, state);
    const q = new URLSearchParams({ client_id: cid, redirect_uri: redirectUri(), response_type: 'token', scope: SCOPE, state, include_granted_scopes: 'true' });
    if (prompt) q.set('prompt', prompt);
    location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + q.toString());
    return { ok: false, redirecting: true };
  }
  async function api(url, opts = {}) {
    const t = token();
    if (!t) return { needAuth: true };
    let r;
    try { r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + t } }); }
    catch (e) { return { error: 'インターネットにつながっていません' }; }
    if (r.status === 401) { ls.del(K.tok); return { needAuth: true }; }
    return { r };
  }
  async function find() {
    if (fileId) return { id: fileId };
    const q = encodeURIComponent(`name='${NAME}' and trashed=false`);
    const f = await api(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc&pageSize=10`);
    if (!f.r) return f;
    if (!f.r.ok) return { error: 'ドライブ：HTTP ' + f.r.status };
    const files = (await f.r.json()).files || [];
    fileId = files[0] ? files[0].id : '';
    return { id: fileId };
  }
  window.api.drive = {
    async status() { return { config: { clientId: ls.get(K.cid) || '', hasSecret: false }, needsSecret: false, signedIn: ls.get(K.on) === '1' }; },
    async setConfig({ clientId }) { if (ls.get(K.cid) !== clientId) { ls.del(K.tok); ls.del(K.on); fileId = ''; } ls.set(K.cid, clientId); return true; },
    async signIn() { return go(ls.get(K.on) === '1' ? '' : 'consent'); },
    async signOut() {
      const t = token();
      if (t) { try { await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'token=' + encodeURIComponent(t) }); } catch (e) {} }
      ls.del(K.tok); ls.del(K.on); fileId = '';
      return true;
    },
    // Googleのページから戻ってきたとき：アドレスの後ろ（#access_token=…）から鍵を受け取る
    async resume() {
      const h = location.hash.startsWith('#') ? new URLSearchParams(location.hash.slice(1)) : null;
      if (!h || (!h.get('access_token') && !h.get('error'))) return null;
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
      const ok = h.get('state') && h.get('state') === ls.get(K.state);
      ls.del(K.state);
      if (!ok) return { ok: false };
      if (h.get('error')) { if (typeof toast === 'function') toast('ログインを取り消しました'); return { ok: false }; }
      ls.set(K.tok, JSON.stringify({ access: h.get('access_token'), exp: Date.now() + (Number(h.get('expires_in')) || 3600) * 1000 }));
      ls.set(K.on, '1');
      return { ok: true };
    },
    async read() {
      const f = await find();
      if (f.needAuth) return { ok: false, needAuth: true };
      if (f.error) return { ok: false, error: f.error };
      if (!f.id) return { ok: true, text: null };
      const g = await api(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`);
      if (g.needAuth) return { ok: false, needAuth: true };
      if (g.error) return { ok: false, error: g.error };
      if (g.r.status === 404) { fileId = ''; return { ok: true, text: null }; }
      if (!g.r.ok) return { ok: false, error: 'ドライブ：HTTP ' + g.r.status };
      return { ok: true, text: await g.r.text() };
    },
    async write(text) {
      const f = await find();
      if (f.needAuth) return { ok: false, needAuth: true };
      if (f.error) return { ok: false, error: f.error };
      let w;
      if (f.id) w = await api(`https://www.googleapis.com/upload/drive/v3/files/${f.id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: text });
      else {
        const bd = 'kc' + Math.random().toString(36).slice(2);
        const body = `--${bd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: NAME, parents: ['appDataFolder'] })}\r\n--${bd}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${bd}--`;
        w = await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + bd }, body });
      }
      if (w.needAuth) return { ok: false, needAuth: true };
      if (w.error) return { ok: false, error: w.error };
      if (w.r.status === 404) { fileId = ''; return this.write(text); }
      if (!w.r.ok) return { ok: false, error: 'ドライブ：HTTP ' + w.r.status };
      if (!f.id) { try { fileId = (await w.r.json()).id || ''; } catch (e) {} }
      return { ok: true };
    }
  };
})();
