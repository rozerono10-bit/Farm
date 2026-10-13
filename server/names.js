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
  let tm = 0;
  const persist = () => { if (tm) return; tm = setTimeout(flush, 800); };
  function flush() { clearTimeout(tm); tm = 0; try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(FILE + '.tmp', JSON.stringify(byName)); fs.renameSync(FILE + '.tmp', FILE); } catch (e) { console.error('names save failed:', e.message); } }
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
    check(uid, data) { let d; try { d = JSON.parse(data); } catch (e) { return; } const n = d && d.char && d.char.name; if (!n) return; this.claim(uid, n); },
  };
};
