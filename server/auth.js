/* Player accounts: log in with an email code or with LINE, login sessions and cloud saves.
 * - Email: a 6-digit code is emailed (Resend API); only its hash is kept, it expires in 10 minutes
 * - LINE: LINE Login (OAuth 2.1 / OpenID Connect) — the server swaps the code for an ID token and verifies it with LINE
 * - One account can have both an email and a LINE login linked to it
 * - Sessions are random tokens (only their SHA-256 is stored) · data/auth.json holds accounts + sessions
 * - data/saves/<uid>.json holds each player's game save
 *
 * Settings (environment variables):
 *   PUBLIC_URL            https address of this server, e.g. https://play.farmdtest.com (needed for LINE)
 *   LINE_CHANNEL_ID       LINE Login channel ID      (LINE Developers console)
 *   LINE_CHANNEL_SECRET   LINE Login channel secret
 *   RESEND_API_KEY        API key from resend.com to send login emails (without it the code is printed in the server log)
 *   MAIL_FROM             sender, e.g. "Farm <login@farmdtest.com>" (domain verified in Resend)
 *   ALLOWED_ORIGINS       comma-separated game web addresses allowed to receive a LINE login, e.g. https://farmdtest.com,https://www.farmdtest.com
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const EMAIL_RX = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/;
const MAX_SAVE = 1024 * 1024;               // bytes per game save
const SESSION_MS = 180 * 24 * 3600 * 1000;  // stay logged in for 180 days
const CODE_MS = 10 * 60 * 1000, CODE_TRIES = 5;
const LINE_AUTH = process.env.LINE_AUTH_URL || 'https://access.line.me/oauth2/v2.1/authorize';
const LINE_API = process.env.LINE_API_URL || 'https://api.line.me';

module.exports = function createAuth(dataDir) {
  const AUTH_FILE = path.join(dataDir, 'auth.json');
  const SAVE_DIR = path.join(dataDir, 'saves');
  const env = process.env;
  let accounts = {}, sessions = {};         // accounts: uid -> {uid,email?,line?:{id,name},t} · sessions: sha256(token) -> {uid,t}
  try { const d = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8')); accounts = d.accounts || {}; sessions = d.sessions || {}; }
  catch (e) { if (e.code !== 'ENOENT') console.error('auth load failed:', e.message); }
  const idx = new Map();                    // 'email:<addr>' | 'line:<id>' -> uid
  for (const a of Object.values(accounts)) { if (a.email) idx.set('email:' + a.email, a.uid); if (a.line) idx.set('line:' + a.line.id, a.uid); }
  const codes = new Map();                  // email -> {hash,exp,tries}
  const sends = new Map();                  // email -> [timestamps]
  const lineStates = new Map();             // state -> {nonce,ret,claim,link,exp}
  const tickets = new Map();                // ticket -> {ret,claim,link,exp}

  let saveT = 0;
  function persist() { if (saveT) return; saveT = setTimeout(flush, 1000); }
  function flush() {
    clearTimeout(saveT); saveT = 0;
    const now = Date.now(); for (const k in sessions) if (now - sessions[k].t > SESSION_MS) delete sessions[k];
    try { fs.mkdirSync(dataDir, { recursive: true }); const tmp = AUTH_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify({ accounts, sessions })); fs.renameSync(tmp, AUTH_FILE); }
    catch (e) { console.error('auth save failed:', e.message); }
  }
  setInterval(() => { const now = Date.now(); for (const m of [codes, lineStates, tickets]) for (const [k, v] of m) if (v.exp < now) m.delete(k); }, 60000).unref();

  const sha = s => crypto.createHash('sha256').update(s).digest('hex');
  const rnd = n => crypto.randomBytes(n).toString('hex');
  const maskEmail = e => { const [u, d] = e.split('@'); return (u.length <= 2 ? u[0] + '*' : u.slice(0, 2) + '***') + '@' + d; };
  const label = a => a.line ? a.line.name || 'LINE' : a.email ? maskEmail(a.email) : 'player';
  const validUid = u => typeof u === 'string' && /^[\w-]{6,64}$/.test(u);
  function newSession(acc, isNew) { const token = rnd(32); sessions[sha(token)] = { uid: acc.uid, t: Date.now() }; persist(); return { token, uid: acc.uid, user: label(acc), isNew: !!isNew }; }

  /** key = 'email:x' | 'line:id' · claim = guest id to keep (new accounts only) · link = uid of the logged-in account to attach this login to */
  function signIn(key, fields, claim, link) {
    const owner = idx.get(key);
    if (link) {
      const acc = accounts[link]; if (!acc) throw 'no_account';
      if (owner && owner !== link) throw 'already_linked';
      Object.assign(acc, fields); idx.set(key, link); persist();
      return { linked: true, user: label(acc) };
    }
    if (owner && accounts[owner]) { const acc = accounts[owner]; if (fields.line) acc.line = fields.line; persist(); return newSession(acc, false); }
    const uid = validUid(claim) && !accounts[claim] ? claim : 'a' + rnd(12);
    const acc = Object.assign({ uid, t: Date.now() }, fields); accounts[uid] = acc; idx.set(key, uid); persist();
    return newSession(acc, true);
  }

  async function sendMail(to, code) {
    if (!env.RESEND_API_KEY) { console.log('[dev] login code for ' + to + ': ' + code + '  (set RESEND_API_KEY to send real emails)'); return; }
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM || 'Farm <onboarding@resend.dev>', to: [to], subject: 'รหัสเข้าเกม Farm: ' + code,
        text: 'รหัสเข้าสู่ระบบเกม Farm ของคุณคือ ' + code + '\nรหัสนี้ใช้ได้ 10 นาที ถ้าคุณไม่ได้ขอรหัสนี้ ไม่ต้องทำอะไร\n\nYour Farm login code is ' + code + ' (valid for 10 minutes).',
        html: '<div style="font-family:sans-serif;font-size:16px">รหัสเข้าสู่ระบบเกม <b>Farm</b> ของคุณ<div style="font-size:34px;font-weight:bold;letter-spacing:6px;margin:14px 0">' + code + '</div>ใช้ได้ 10 นาที · ถ้าคุณไม่ได้ขอรหัสนี้ ไม่ต้องทำอะไร<br><small>Your Farm login code (valid for 10 minutes)</small></div>' }),
    });
    if (!r.ok) { console.error('email send failed:', r.status, await r.text().catch(() => '')); throw 'mail_failed'; }
  }
  const allowedOrigins = () => {
    const o = new Set((env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean));
    if (env.PUBLIC_URL) o.add(new URL(env.PUBLIC_URL).origin);
    return o;
  };
  function okReturn(ret) {
    try { const u = new URL(ret); if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true; return allowedOrigins().has(u.origin); } catch (e) { return false; }
  }

  return {
    /** uid owned by an account → that uid can only be used with a login token */
    isOwned: uid => !!accounts[uid],
    /** token → {uid,user} or null */
    session(token) {
      if (typeof token !== 'string' || token.length !== 64) return null;
      const s = sessions[sha(token)]; if (!s || !accounts[s.uid]) return null;
      if (Date.now() - s.t > SESSION_MS) { delete sessions[sha(token)]; persist(); return null; }
      return { uid: s.uid, user: label(accounts[s.uid]) };
    },
    info(uid) { const a = accounts[uid]; if (!a) return null; return { user: label(a), email: a.email ? maskEmail(a.email) : '', line: a.line ? a.line.name || 'LINE' : '' }; },
    lineEnabled: () => !!(env.LINE_CHANNEL_ID && env.LINE_CHANNEL_SECRET && env.PUBLIC_URL),

    async emailStart(email) {
      email = String(email || '').trim().toLowerCase(); if (email.length > 254 || !EMAIL_RX.test(email)) throw 'bad_email';
      const now = Date.now(), s = (sends.get(email) || []).filter(t => now - t < 3600000);
      if (s.length && now - s[s.length - 1] < 60000) throw 'wait_minute';
      if (s.length >= 5) throw 'too_many_tries';
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      s.push(now); sends.set(email, s); codes.set(email, { hash: sha(email + ':' + code), exp: now + CODE_MS, tries: 0 });
      await sendMail(email, code);
      return { dev: !env.RESEND_API_KEY };
    },
    emailVerify(email, code, claim, link) {
      email = String(email || '').trim().toLowerCase(); const c = codes.get(email);
      if (!c || c.exp < Date.now()) throw 'code_expired';
      if (++c.tries > CODE_TRIES) { codes.delete(email); throw 'too_many_tries'; }
      const h = sha(email + ':' + String(code || '').trim());
      if (!crypto.timingSafeEqual(Buffer.from(h), Buffer.from(c.hash))) throw 'bad_code';
      codes.delete(email);
      return signIn('email:' + email, { email }, claim, link);
    },

    /** step 1 (over the websocket): a short-lived ticket so the claim/link can't be forged in a URL */
    lineTicket(ret, claim, link) {
      if (!this.lineEnabled()) throw 'line_off';
      if (!okReturn(ret)) throw 'bad_return';
      const t = rnd(16); tickets.set(t, { ret, claim, link, exp: Date.now() + 5 * 60000 }); return t;
    },
    /** step 2 (browser visits /auth/line/start?t=…): where to send the browser */
    lineStartUrl(ticket) {
      const tk = tickets.get(ticket); if (!tk) return null; tickets.delete(ticket);
      const state = rnd(16), nonce = rnd(16); lineStates.set(state, Object.assign({ nonce, exp: Date.now() + 10 * 60000 }, tk));
      const q = new URLSearchParams({ response_type: 'code', client_id: env.LINE_CHANNEL_ID, redirect_uri: env.PUBLIC_URL.replace(/\/$/, '') + '/auth/line/callback', state, scope: 'profile openid', nonce });
      return LINE_AUTH + '?' + q;
    },
    /** step 3 (LINE sends the browser back to /auth/line/callback): returns where to go next, with the result in the #hash */
    async lineFinish(code, state, error) {
      const st = lineStates.get(state); if (!st) return null; lineStates.delete(state);
      const back = (h) => st.ret.split('#')[0] + '#' + new URLSearchParams(h);
      if (error || !code) return back({ farm_login_error: 'line_cancel' });
      try {
        const tok = await fetch(LINE_API + '/oauth2/v2.1/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: env.PUBLIC_URL.replace(/\/$/, '') + '/auth/line/callback', client_id: env.LINE_CHANNEL_ID, client_secret: env.LINE_CHANNEL_SECRET }) }).then(r => r.json());
        if (!tok.id_token) throw new Error('no id_token: ' + JSON.stringify(tok).slice(0, 200));
        const v = await fetch(LINE_API + '/oauth2/v2.1/verify', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ id_token: tok.id_token, client_id: env.LINE_CHANNEL_ID, nonce: st.nonce }) }).then(r => r.json());
        if (!v.sub) throw new Error('verify failed: ' + JSON.stringify(v).slice(0, 200));
        const r = signIn('line:' + v.sub, { line: { id: v.sub, name: String(v.name || 'LINE').slice(0, 40) } }, st.claim, st.link);
        return r.linked ? back({ farm_linked: 'line' }) : back({ farm_token: r.token, farm_new: r.isNew ? 1 : 0 });
      } catch (e) {
        if (typeof e === 'string') return back({ farm_login_error: e });
        console.error('LINE login failed:', e.message); return back({ farm_login_error: 'line_failed' });
      }
    },

    logout(token) { if (typeof token === 'string' && sessions[sha(token)]) { delete sessions[sha(token)]; persist(); } },
    saveGet(uid) {
      try { return JSON.parse(fs.readFileSync(path.join(SAVE_DIR, uid + '.json'), 'utf8')); }
      catch (e) { return null; }
    },
    /** base = the save version this device last synced; a newer save from another device is not overwritten */
    savePut(uid, t, data, base) {
      if (typeof data !== 'string' || data.length > MAX_SAVE) throw 'too_large';
      try { JSON.parse(data); } catch (e) { throw 'bad_data'; }
      if (base != null) { const cur = this.saveGet(uid); if (cur && +cur.t > +base) throw 'conflict'; }
      fs.mkdirSync(SAVE_DIR, { recursive: true });
      const f = path.join(SAVE_DIR, uid + '.json'), tmp = f + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ t: +t || Date.now(), data })); fs.renameSync(tmp, f);
    },
    flush,
  };
};
