/* 💳 รายชื่อคนที่ซื้อของด้วยเงินจริง:  node purchases-report.js   (หรือ  node purchases-report.js csv > buyers.csv) */
'use strict';
const fs = require('fs'), path = require('path');
const dir = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const read = f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { return {}; } };
const pay = read('purchases.json'), acc = (read('auth.json').accounts) || {};
const rows = {};
for (const [ref, r] of Object.entries(pay.sessions || {})) {
  const a = acc[r.uid] || {}, x = rows[r.uid] || (rows[r.uid] = { uid: r.uid, num: a.num || '', name: (a.google && a.google.name) || (a.line && a.line.name) || '', thb: 0, items: [], last: 0 });
  x.thb += +r.thb || 0; x.items.push(r.item); x.last = Math.max(x.last, r.t || 0);
}
const list = Object.values(rows).sort((a, b) => b.thb - a.thb);
if (process.argv[2] === 'csv') { console.log('uid_7,name,total_thb,count,items,last_purchase'); for (const r of list) console.log([r.num, JSON.stringify(r.name), r.thb.toFixed(2), r.items.length, JSON.stringify(r.items.join(' ')), new Date(r.last).toISOString()].join(',')); }
else {
  for (const r of list) console.log(`UID ${r.num || '-'}  ${r.name || '(ไม่มีชื่อ)'}  ฿${r.thb.toFixed(2)}  ${r.items.length} ครั้ง  [${r.items.join(', ')}]  ล่าสุด ${new Date(r.last).toLocaleString('th-TH')}`);
  console.log(`— รวม ${list.length} คน · ฿${list.reduce((s, r) => s + r.thb, 0).toFixed(2)}`);
}
