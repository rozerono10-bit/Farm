/* 🧾 Pay by PromptPay QR + bank slip, checked automatically by EasySlip.
 * 1. The player picks an item → an order with a unique amount (price + random satang, e.g. ฿99.37) and a PromptPay QR
 *    with that amount filled in (built from your own PromptPay QR)
 * 2. The player transfers, then uploads the slip picture
 * 3. EasySlip reads the slip with the bank → the server checks: amount = this order, paid to you (name / account),
 *    slip made after the order, and the slip was never used before → the item is given (pay.grantRef)
 *
 * Settings (server/.env):
 *   PROMPTPAY_QR        the text inside your PromptPay QR (starts 000201…)
 *   SLIP_API_KEY        EasySlip API key (developer.easyslip.com)
 *   SLIP_RECEIVER_NAME  part of your name as it shows on slips, e.g. วีรภัทร (optional but recommended)
 *   SLIP_RECEIVER_ACC   last digits of the receiving account / PromptPay id, default = last 3 digits from PROMPTPAY_QR
 *   SLIP_API_URL        default https://api.easyslip.com/v2
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const qrcode = require('./vendor/qrcode-generator');
const PRODUCTS = require('./products');

const ORDER_MS = 30 * 60 * 1000;            // an order (its QR amount) is valid for 30 minutes

/* ---- PromptPay (EMVCo) QR: set the amount and recompute the CRC ---- */
function crc16(s) { let c = 0xFFFF; for (const b of Buffer.from(s, 'utf8')) { c ^= b << 8; for (let i = 0; i < 8; i++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF; } return c.toString(16).toUpperCase().padStart(4, '0'); }
function tlv(s) { const out = []; let i = 0; while (i + 4 <= s.length) { const id = s.slice(i, i + 2), n = +s.slice(i + 2, i + 4); out.push([id, s.slice(i + 4, i + 4 + n)]); i += 4 + n; } return out; }
function withAmount(base, amount) {
  const f = tlv(base).filter(([id]) => !['01', '54', '63'].includes(id));
  f.push(['01', '12'], ['54', amount.toFixed(2)]); f.sort((a, b) => a[0].localeCompare(b[0]));
  const body = f.map(([id, v]) => id + String(v.length).padStart(2, '0') + v).join('') + '6304';
  return body + crc16(body);
}
const qrValid = s => typeof s === 'string' && /^000201/.test(s) && s.length > 30 && crc16(s.slice(0, -4)) === s.slice(-4).toUpperCase();
const proxyTail = s => { for (const [id, v] of tlv(s)) if (id === '29' || id === '30') for (const [k, x] of tlv(v)) if (k !== '00') return x.replace(/\D/g, '').slice(-3); return ''; };

module.exports = function createSlip(dataDir, pay) {
  const env = process.env, FILE = path.join(dataDir, 'slips.json');
  let db = { used: {}, orders: {} };       // used: transRef -> {uid,item,amount,t} · orders: oid -> {uid,item,amount,t}
  try { db = Object.assign(db, JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch (e) { if (e.code !== 'ENOENT') console.error('slips load failed:', e.message); }
  function persist() {
    const now = Date.now(); for (const k in db.orders) if (now - db.orders[k].t > 24 * 3600000) delete db.orders[k];
    try { fs.mkdirSync(dataDir, { recursive: true }); const tmp = FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, FILE); } catch (e) { console.error('slips save failed:', e.message); }
  }
  const base = () => String(env.PROMPTPAY_QR || '').trim();
  const enabled = () => !!(env.SLIP_API_KEY && qrValid(base()));
  if (env.PROMPTPAY_QR && !qrValid(base())) console.error('PROMPTPAY_QR is not a valid PromptPay QR text (CRC mismatch) — slip payments are off');
  const pending = new Set();                // orders being checked right now (no double submit)

  async function easyslip(image) {
    const r = await fetch((env.SLIP_API_URL || 'https://api.easyslip.com/v2') + '/verify/bank', { method: 'POST',
      headers: { authorization: 'Bearer ' + env.SLIP_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ base64: image }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.success === false) {
      const code = (j.error && j.error.code) || j.message || ('HTTP_' + r.status);
      if (/SLIP_NOT_FOUND|INVALID_PAYLOAD|invalid_payload|slip_not_found/i.test(code)) throw 'slip_unreadable';
      throw new Error('easyslip ' + r.status + ' ' + code + ' ' + ((j.error && j.error.message) || '').slice(0, 150));
    }
    const d = j.data || {}; return d.rawSlip || d;
  }

  return {
    enabled,
    /** new order: unique amount + QR (svg) */
    order(uid, item) {
      if (!enabled()) throw 'pay_off';
      const prod = PRODUCTS.find(p => p.id === item); if (!prod) throw 'bad_item';
      if (prod.once && pay.owned(uid).includes(prod.id)) throw 'already_owned';
      const now = Date.now(), live = new Set(Object.values(db.orders).filter(o => now - o.t < ORDER_MS).map(o => o.amount.toFixed(2)));
      let amount; for (let i = 0; i < 200; i++) { amount = prod.thb + (1 + crypto.randomInt(99)) / 100; if (!live.has(amount.toFixed(2))) break; }
      const oid = crypto.randomBytes(8).toString('hex'); db.orders[oid] = { uid, item: prod.id, amount, t: now }; persist();
      const q = qrcode(0, 'M'); q.addData(withAmount(base(), amount)); q.make();
      return { oid, amount: amount.toFixed(2), exp: now + ORDER_MS, svg: q.createSvgTag({ cellSize: 6, margin: 24, scalable: true }), name: env.SLIP_RECEIVER_NAME || '' };
    },
    /** slip picture (base64 / data URI) for an order → { ok, item } or throws a code */
    async verify(uid, oid, image) {
      if (!enabled()) throw 'pay_off';
      const o = db.orders[oid]; if (!o || o.uid !== uid) throw 'order_expired';
      if (o.done) return { ok: true, item: o.item, owned: pay.owned(uid) };
      if (typeof image !== 'string' || image.length < 1000 || image.length > 1100 * 1024) throw 'bad_image';
      if (pending.has(oid)) throw 'busy'; pending.add(oid);
      try {
        const s = await easyslip(image);
        const ref = String(s.transRef || ''), amt = +((s.amount && s.amount.amount) != null ? s.amount.amount : s.amount);
        if (!ref) throw 'slip_unreadable';
        if (db.used[ref]) throw 'slip_used';
        if (!(Math.abs(amt - o.amount) < 0.005)) throw 'wrong_amount';
        const acc = (s.receiver && s.receiver.account) || {}, nm = [acc.name && acc.name.th, acc.name && acc.name.en, acc.name].filter(x => typeof x === 'string').join(' ');
        const accNo = String((acc.proxy && acc.proxy.account) || (acc.bank && acc.bank.account) || '').replace(/[^\dxX]/g, '');
        const wantName = String(env.SLIP_RECEIVER_NAME || '').trim(), wantAcc = String(env.SLIP_RECEIVER_ACC || proxyTail(base())).replace(/\D/g, '');
        if (wantName && !nm.replace(/\s+/g, '').includes(wantName.replace(/\s+/g, ''))) throw 'wrong_receiver';
        if (wantAcc && accNo && !accNo.endsWith(wantAcc)) throw 'wrong_receiver';
        const when = Date.parse(s.date || ''); if (when && when < o.t - 5 * 60000) throw 'slip_old';
        db.used[ref] = { uid, item: o.item, amount: amt, t: Date.now() }; o.done = 1; persist();
        pay.grantRef('slip:' + ref, uid, o.item, amt);
        return { ok: true, item: o.item, owned: pay.owned(uid) };
      } finally { pending.delete(oid); }
    },
    _withAmount: withAmount, _qrValid: qrValid,
  };
};
