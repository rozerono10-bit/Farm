/* 🛡️ แอดมิน: ดู/แบน/ปลดแบน ผู้เล่น (เซิร์ฟเวอร์รับรู้เองภายในไม่กี่วินาที ไม่ต้อง restart)
 *   node admin.js bans                 รายชื่อที่ถูกแบน + เหตุผล
 *   node admin.js unban 1234567        ปลดแบน (ใช้ UID 7 หลักที่ผู้เล่นเห็นในเกม)
 *   node admin.js ban 1234567 เหตุผล    แบนเอง
 *   node admin.js jumps                เงิน/เพชร/เลเวลที่เพิ่มมากสุดใน 1 เซฟ ของแต่ละคน (ใช้ตั้ง CHEAT_*_JUMP)
 *   node admin.js who 1234567          ดูข้อมูลผู้เล่นคนนั้น (ของที่ซื้อ, ประวัติที่ระบบจดไว้)
 */
'use strict';
const fs = require('fs'), path = require('path');
const dir = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const read = f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { return {}; } };
const write = (f, d) => { const p = path.join(dir, f); fs.writeFileSync(p + '.tmp', JSON.stringify(d)); fs.renameSync(p + '.tmp', p); };
const acc = read('auth.json').accounts || {}, bans = read('bans.json'), guard = read('guard.json'), pay = read('purchases.json');
const who = id => { if (acc[id]) return id; const a = Object.values(acc).find(x => x.num === String(id)); return a ? a.uid : null; };
const name = uid => { const a = acc[uid] || {}; return 'UID ' + (a.num || '-') + ' ' + ((a.google && a.google.name) || (a.line && a.line.name) || ''); };
const when = t => new Date(t).toLocaleString('th-TH');
const [cmd, id, ...rest] = process.argv.slice(2);
if (cmd === 'bans') { const l = Object.entries(bans); for (const [u, b] of l) console.log(name(u), '·', when(b.t), '·', b.reason); console.log('— แบนอยู่ ' + l.length + ' คน'); }
else if (cmd === 'unban' || cmd === 'ban') {
  const u = who(id); if (!u) { console.log('ไม่พบผู้เล่น UID', id); process.exit(1); }
  if (cmd === 'unban') { if (!bans[u]) { console.log(name(u), 'ไม่ได้ถูกแบน'); process.exit(0); } delete bans[u]; write('bans.json', bans); console.log('✅ ปลดแบน', name(u)); }
  else { bans[u] = { t: Date.now(), reason: rest.join(' ') || 'แอดมินแบน' }; write('bans.json', bans); console.log('🚫 แบน', name(u), '·', bans[u].reason); }
}
else if (cmd === 'jumps') {
  const l = Object.entries(guard).filter(([, r]) => r && r.jump).sort((a, b) => (b[1].jump.coins || 0) - (a[1].jump.coins || 0));
  for (const [u, r] of l.slice(0, 30)) console.log(name(u).padEnd(30), '🪙+' + (r.jump.coins || 0).toLocaleString(), ' 💎+' + (r.jump.gems || 0), ' Lv+' + (r.jump.lv || 0));
  console.log('— เรียงจากเงินเพิ่มมากสุดใน 1 เซฟ (เซฟทุก ~10 วินาที) · ตั้ง CHEAT_COIN_JUMP / CHEAT_GEM_JUMP / CHEAT_LV_JUMP ใน .env ให้สูงกว่าคนเล่นปกติ');
}
else if (cmd === 'who') {
  const u = who(id); if (!u) { console.log('ไม่พบผู้เล่น UID', id); process.exit(1); }
  console.log(name(u), bans[u] ? '🚫 แบน: ' + bans[u].reason : '✅ ปกติ');
  console.log('ของที่ซื้อ:', (pay.owned && pay.owned[u] || []).join(', ') || '-', '· โล่ที่ซื้อ:', (pay.give && pay.give[u] || []).map(x => x.grant).join(', ') || '-');
  const r = guard[u]; if (r) { console.log('เพิ่มมากสุดต่อเซฟ: 🪙+' + (r.jump.coins || 0), '💎+' + (r.jump.gems || 0), 'Lv+' + (r.jump.lv || 0)); for (const f of r.flags || []) console.log(' ', when(f.t), f.kind, f.text); }
}
else console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 7).join('\n'));
