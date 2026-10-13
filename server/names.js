/* 🏷️ Character names are unique: one name per account (data/names.json: normalized name -> uid).
 * - The game claims a name when a character is created (name_claim) and every save is checked (check)
 * - Names compare without case / extra spaces, so "Ri", "ri" and " R i " count as the same
 * - Changing name releases the old one
 */
'use strict';
const fs = require('fs');
const path = require('path');

const norm = s => String(s == null ? '' : s).normalize('NFC').toLowerCase().replace(/\s+/g, '').slice(0, 40);

module.exports = function createNames(dataDir) {
  const FILE = path.join(dataDir, 'names.json');
  let byName = {}; try { byName = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') console.error('names load failed:', e.message); }
  const byUid = {}; for (const [k, u] of Object.entries(byName)) byUid[u] = k;
  /* ✏️ แอดมินเปลี่ยนชื่อให้ (node admin.js rename <UID> <ชื่อ>) → data/renames.json: uid -> ชื่อใหม่ · ค้างไว้จนเกมของคนนั้นเซฟชื่อใหม่แล้ว */
  const RFILE = path.join(dataDir, 'renames.json'); let renames = {}, rAt = 0, onRename = () => {};
  const rLoad = () => { try { renames = JSON.parse(fs.readFileSync(RFILE, 'utf8')) || {}; rAt = fs.statSync(RFILE).mtimeMs; } catch (e) { renames = {}; } };
  const rSave = () => { try { fs.writeFileSync(RFILE + '.tmp', JSON.stringify(renames)); fs.renameSync(RFILE + '.tmp', RFILE); rAt = fs.statSync(RFILE).mtimeMs; } catch (e) { console.error('renames save failed:', e.message); } };
  function force(uid, name) { const k = norm(name); if (!k) return; const o = byName[k]; if (o && o !== uid) delete byUid[o]; if (byUid[uid] && byUid[uid] !== k) delete byName[byUid[uid]]; byName[k] = uid; byUid[uid] = k; persist(); }
  /** save JSON with the forced name put in (or the same string when nothing to change) */
  function patch(uid, data) { const n = renames[uid]; if (!n) return data; let d; try { d = JSON.parse(data); } catch (e) { return data; }
    if (!d || !d.char) return data; if (d.char.name === n) return data; d.char.name = n; return JSON.stringify(d); }
  let tm = 0;
  const persist = () => { if (tm) return; tm = setTimeout(flush, 800); };
  function flush() { clearTimeout(tm); tm = 0; try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(FILE + '.tmp', JSON.stringify(byName)); fs.renameSync(FILE + '.tmp', FILE); } catch (e) { console.error('names save failed:', e.message); } }
  /* เริ่มหลังประกาศ persist/flush แล้ว (มีชื่อค้างใน renames.json ตอนเปิดเซิร์ฟ → ใส่ให้เลย) */
  rLoad(); for (const [u, n] of Object.entries(renames)) force(u, n);
  setInterval(() => { try { const mt = fs.statSync(RFILE).mtimeMs; if (mt <= rAt + 50) return; const before = renames; rLoad();
    for (const [u, n] of Object.entries(renames)) if (before[u] !== n) { force(u, n); console.log('✏️ rename:', u, '→', n); onRename(u, n); } } catch (e) {} }, 4000).unref();
  return {
    norm, flush,
    owner: name => byName[norm(name)] || '',
    /** take this name for uid (frees its old one) → throws 'name_taken' / 'bad_name' */
    claim(uid, name) {
      const k = norm(name); if (!k || k.length < 1 || String(name).trim().length > 12) throw 'bad_name';
      const o = byName[k]; if (o && o !== uid) throw 'name_taken';
      if (o === uid) return k;
      if (byUid[uid]) delete byName[byUid[uid]];
      byName[k] = uid; byUid[uid] = k; persist(); return k;
    },
    /** the name in a save must be this account's (claims it when free) */
    pending: uid => renames[uid] || '', onRename: f => { onRename = f; }, patch,
    /** a save arrived: put in a pending admin rename · once the game itself saves the new name, the rename is done */
    fix(uid, data) { const n = renames[uid]; if (!n) return data; let d; try { d = JSON.parse(data); } catch (e) { return data; }
      if (d && d.char && d.char.name === n) { delete renames[uid]; rSave(); return data; } return patch(uid, data); },
    check(uid, data) { let d; try { d = JSON.parse(data); } catch (e) { return; } const n = d && d.char && d.char.name; if (!n) return; this.claim(uid, n); },
  };
};
module.exports.norm = norm;
