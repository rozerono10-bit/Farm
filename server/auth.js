/* Accounts (username + password), login sessions and cloud saves.
 * - Passwords are hashed with scrypt; sessions are random tokens (only their SHA-256 is stored)
 * - data/auth.json holds accounts + sessions, data/saves/<uid>.json holds each player's game save
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const USER_RX = /^[a-zA-Z0-9_]{3,20}$/;
const MIN_PASS = 6, MAX_PASS = 100;
const MAX_SAVE = 1024 * 1024;               // bytes per game save
const SESSION_MS = 180 * 24 * 3600 * 1000;  // stay logged in for 180 days
const FAIL_LIMIT = 10, FAIL_WINDOW = 10 * 60 * 1000; // 10 wrong passwords per username per 10 minutes

module.exports = function createAuth(dataDir) {
  const AUTH_FILE = path.join(dataDir, 'auth.json');
  const SAVE_DIR = path.join(dataDir, 'saves');
  let accounts = {}, sessions = {};         // accounts: lower(user) -> {user,salt,hash,uid,t} · sessions: sha256(token) -> {uid,user,t}
  try { const d = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8')); accounts = d.accounts || {}; sessions = d.sessions || {}; }
  catch (e) { if (e.code !== 'ENOENT') console.error('auth load failed:', e.message); }
  const uidOwner = new Map(Object.values(accounts).map(a => [a.uid, a.user]));
  const fails = new Map();                  // lower(user) -> [timestamps]

  let saveT = 0;
  function persist() { if (saveT) return; saveT = setTimeout(flush, 1000); }
  function flush() {
    clearTimeout(saveT); saveT = 0;
    const now = Date.now(); for (const k in sessions) if (now - sessions[k].t > SESSION_MS) delete sessions[k];
    try { fs.mkdirSync(dataDir, { recursive: true }); const tmp = AUTH_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify({ accounts, sessions })); fs.renameSync(tmp, AUTH_FILE); }
    catch (e) { console.error('auth save failed:', e.message); }
  }
  const sha = s => crypto.createHash('sha256').update(s).digest('hex');
  const hashPass = (pass, salt) => new Promise((res, rej) => crypto.scrypt(pass, salt, 64, (e, k) => e ? rej(e) : res(k.toString('hex'))));
  function newSession(acc) { const token = crypto.randomBytes(32).toString('hex'); sessions[sha(token)] = { uid: acc.uid, user: acc.user, t: Date.now() }; persist(); return { token, uid: acc.uid, user: acc.user }; }
  function checkInput(user, pass) {
    if (typeof user !== 'string' || !USER_RX.test(user)) return 'bad_user';
    if (typeof pass !== 'string' || pass.length < MIN_PASS || pass.length > MAX_PASS) return 'bad_pass';
    return '';
  }

  return {
    /** uid currently claimed by an account → that uid can only be used with a login token */
    isOwned: uid => uidOwner.has(uid),
    /** token → {uid,user} or null */
    session(token) {
      if (typeof token !== 'string' || token.length !== 64) return null;
      const s = sessions[sha(token)]; if (!s) return null;
      if (Date.now() - s.t > SESSION_MS) { delete sessions[sha(token)]; persist(); return null; }
      return { uid: s.uid, user: s.user };
    },
    /** claimUid: the guest id this player already used, so their online farm stays theirs */
    async register(user, pass, claimUid) {
      const bad = checkInput(user, pass); if (bad) throw bad;
      const k = user.toLowerCase(); if (accounts[k]) throw 'user_taken';
      const uid = typeof claimUid === 'string' && /^[\w-]{6,64}$/.test(claimUid) && !uidOwner.has(claimUid) ? claimUid : 'a' + crypto.randomBytes(12).toString('hex');
      const salt = crypto.randomBytes(16).toString('hex');
      const acc = { user, salt, hash: await hashPass(pass, salt), uid, t: Date.now() };
      if (accounts[k]) throw 'user_taken';    // registered while hashing
      accounts[k] = acc; uidOwner.set(uid, user); persist();
      return newSession(acc);
    },
    async login(user, pass) {
      if (typeof user !== 'string' || typeof pass !== 'string' || pass.length > MAX_PASS) throw 'bad_login';
      const k = user.toLowerCase(), now = Date.now();
      const f = (fails.get(k) || []).filter(t => now - t < FAIL_WINDOW); fails.set(k, f);
      if (f.length >= FAIL_LIMIT) throw 'too_many_tries';
      const acc = accounts[k]; const h = await hashPass(pass, acc ? acc.salt : 'x');
      if (!acc || !crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(acc.hash, 'hex'))) { f.push(now); throw 'bad_login'; }
      fails.delete(k); return newSession(acc);
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
