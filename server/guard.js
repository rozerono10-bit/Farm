/* 🛡️ Anti-cheat, step 1: every save a player uploads is checked against the previous one before it is kept.
 *
 * Auto-ban (things normal play can never do):
 *   - premium items (crown, outfits, poses, accessories) that were never bought with real money
 *     (CBT only: what an account already had the first time it is checked is kept as "legacy" · from OBT on nothing is grandfathered)
 *   - crow shields going up by more than what was just bought
 *   - claiming a payment ref that the server never issued
 * Reject only (save not kept, the game reloads the last good save): broken numbers (negative, NaN, absurdly large)
 * Watch: the biggest coin / gem / level jump per save is recorded for each account (node admin.js jumps);
 *   set CHEAT_COIN_JUMP / CHEAT_GEM_JUMP / CHEAT_LV_JUMP in .env to also ban above those numbers (0 = off)
 *
 * Files: data/bans.json (who is banned and why) · data/guard.json (legacy items, biggest jumps, recent flags)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const MAXV = 1e15;
const arr = v => Array.isArray(v) ? v : [];
const num = v => (typeof v === 'number' ? v : +v);

module.exports = function createGuard(dataDir, pay) {
  const env = process.env, BANS = path.join(dataDir, 'bans.json'), GUARD = path.join(dataDir, 'guard.json');
  const load = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') console.error('guard load failed:', f, e.message); return {}; } };
  let bans = load(BANS), info = load(GUARD);
  let tm = 0; const persist = () => { if (tm) return; tm = setTimeout(flush, 1000); };
  let wroteAt = 0;
  /* admin.js edits bans.json while the server runs → pick the change up within a few seconds */
  setInterval(() => { try { const mt = fs.statSync(BANS).mtimeMs; if (mt > wroteAt + 50) { const nb = load(BANS); for (const uid of Object.keys(nb)) if (!bans[uid]) { bans[uid] = nb[uid]; onBan(uid, nb[uid].reason); } for (const uid of Object.keys(bans)) if (!nb[uid]) delete bans[uid]; wroteAt = mt; } } catch (e) {} }, 4000).unref();
  function flush() { clearTimeout(tm); tm = 0;
    for (const [f, d] of [[BANS, bans], [GUARD, info]]) { try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(d)); fs.renameSync(f + '.tmp', f); } catch (e) { console.error('guard save failed:', e.message); } }
    try { wroteAt = fs.statSync(BANS).mtimeMs; } catch (e) {} }
  let onBan = () => {};
  const season = () => env.SEASON || 'cbt', lenient = () => /^cbt/i.test(season());

  const premOf = d => ({ crown: !!d.crown, ownSk: arr(d.ownSk).map(Number), ownHp: arr(d.ownHp).map(String), own: arr(d.own).map(Number) });
  const g = uid => info[uid] || (info[uid] = { jump: { coins: 0, gems: 0, lv: 0 }, flags: [] });
  function flag(uid, kind, text) { const r = g(uid); r.flags.push({ t: Date.now(), kind, text }); if (r.flags.length > 30) r.flags.shift(); persist(); }
  function ban(uid, reason) {
    if (bans[uid]) return; bans[uid] = { t: Date.now(), reason }; flag(uid, 'ban', reason); flush();
    console.log('🚫 banned:', uid, reason); onBan(uid, reason);
  }

  /** what this account may own: bought with real money, or owned before the guard existed */
  function allowed(uid) {
    const r = g(uid), L = (r.legacy && r.legacy.season === season()) ? r.legacy : { crown: false, ownSk: [], ownHp: [], own: [] }, a = { crown: L.crown, ownSk: new Set(L.ownSk), ownHp: new Set(L.ownHp), own: new Set(L.own), allAcc: false };
    const PRODUCTS = require('./products');
    for (const id of pay.owned(uid)) { const p = PRODUCTS.find(x => x.id === id); if (!p) continue; const gr = p.grant || '';
      if (gr === 'crown') a.crown = true; else if (gr.startsWith('skin:')) a.ownSk.add(+gr.slice(5)); else if (gr.startsWith('pose:')) a.ownHp.add(gr.slice(5)); else if (gr === 'acc:all') a.allAcc = true; }
    return a;
  }

  return {
    onBan: f => { onBan = f; },
    banned: uid => bans[uid] || null,
    ban, unban(uid) { if (!bans[uid]) return false; delete bans[uid]; flag(uid, 'unban', 'admin'); flush(); return true; },
    list: () => ({ bans, info }),
    flush,
    /** prevRaw / nextRaw = the save JSON strings → throws 'banned' | 'save_rejected' when the new save must not be kept */
    check(uid, prevRaw, nextRaw) {
      if (bans[uid]) throw 'banned';
      let n, p = null; try { n = JSON.parse(nextRaw); } catch (e) { throw 'bad_data'; }
      try { p = prevRaw ? JSON.parse(prevRaw) : null; } catch (e) { p = null; }
      if (!n || typeof n !== 'object') throw 'bad_data';
      const r = g(uid);
      let baseline = false; /* CBT: the first save we see from an account is taken as it is (it may hold things bought with gems before) */
      if (!r.legacy || r.legacy.season !== season()) { r.legacy = Object.assign(lenient() ? premOf(p || n) : premOf({}), { season: season() }); baseline = lenient(); persist(); }

      /* broken numbers → reject (could be a bug, not proof of cheating) */
      for (const k of ['coins', 'gems', 'lv', 'xp', 'shields']) { if (n[k] == null) continue; const v = num(n[k]);
        if (!Number.isFinite(v) || v < 0 || v > MAXV) { flag(uid, 'reject', k + '=' + String(n[k]).slice(0, 30)); throw 'save_rejected'; } }

      /* premium items without a purchase → ban */
      const a = allowed(uid), m = premOf(n), bad = [];
      if (m.crown && !a.crown) bad.push('crown');
      for (const i of m.ownSk) if (!a.ownSk.has(i)) bad.push('skin:' + i);
      for (const k of m.ownHp) if (!a.ownHp.has(k)) bad.push('pose:' + k);
      if (!a.allAcc) for (const i of m.own) if (!a.own.has(i)) bad.push('acc:' + i);
      if (bad.length) { ban(uid, 'ของพรีเมียมที่ไม่ได้ซื้อ: ' + bad.slice(0, 8).join(', ')); throw 'banned'; }

      /* crow shields: may only go up by the packs whose refs this save just applied (refs must be real) */
      const gives = pay.gives(uid), byRef = new Map(gives.map(x => [x.ref, x])), newRefs = arr(n.payRefs).filter(x => !arr(p && p.payRefs).includes(x));
      const fake = newRefs.filter(x => !byRef.has(x)); if (fake.length) { ban(uid, 'อ้างรหัสการจ่ายเงินที่ไม่มีจริง: ' + fake.slice(0, 3).join(', ')); throw 'banned'; }
      if (!baseline) { let room = 0; for (const x of newRefs) { const mm = /^shields:(\d+)$/.exec(byRef.get(x).grant || ''); if (mm) room += +mm[1]; }
        const before = p ? num(p.shields) || 0 : 0, after = num(n.shields) || 0;
        if (after > before + room) { ban(uid, 'โล่กันอีกาเพิ่มเองจาก ' + before + ' เป็น ' + after + ' (ซื้อเพิ่ม ' + room + ')'); throw 'banned'; } }

      /* coins / gems / level jumps: always recorded · ban only above the limits set in .env */
      if (p) for (const [k, lim] of [['coins', 'CHEAT_COIN_JUMP'], ['gems', 'CHEAT_GEM_JUMP'], ['lv', 'CHEAT_LV_JUMP']]) {
        const d = (num(n[k]) || 0) - (num(p[k]) || 0); if (d > (r.jump[k] || 0)) { r.jump[k] = d; persist(); }
        const L = +env[lim] || 0; if (L > 0 && d > L) { ban(uid, k + ' เพิ่มทีเดียว ' + d + ' (เกิน ' + L + ')'); throw 'banned'; }
      }
    },
  };
};
