/* 💳 Real-money purchases with Stripe Checkout (PromptPay QR + cards).
 * - The game asks for a checkout link (over the websocket, logged-in players only); the browser goes to Stripe's page
 * - Stripe calls POST /stripe/webhook when the payment is done → the item is recorded for that account (data/purchases.json)
 * - The game also asks /pay_check when it comes back from Stripe, so a late webhook doesn't keep the player waiting
 * - Each Stripe session is granted at most once
 *
 * Settings (server/.env):
 *   STRIPE_SECRET_KEY      sk_live_… / sk_test_…  (Stripe Dashboard > Developers > API keys)
 *   STRIPE_WEBHOOK_SECRET  whsec_…                (Developers > Webhooks > endpoint https://play.<domain>/stripe/webhook)
 *   STRIPE_METHODS         payment methods, default "card,promptpay"
 * Products and prices: products.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PRODUCTS = require('./products');

const API = process.env.STRIPE_API_URL || 'https://api.stripe.com';

module.exports = function createPay(dataDir) {
  const FILE = path.join(dataDir, 'purchases.json');
  const env = process.env;
  let db = { sessions: {}, owned: {} };     // sessions: stripe session id -> {uid,item,thb,t} · owned: uid -> [item ids]
  try { db = Object.assign(db, JSON.parse(fs.readFileSync(FILE, 'utf8'))); }
  catch (e) { if (e.code !== 'ENOENT') console.error('purchases load failed:', e.message); }
  function persist() {
    try { fs.mkdirSync(dataDir, { recursive: true }); const tmp = FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, FILE); }
    catch (e) { console.error('purchases save failed:', e.message); }
  }
  const byId = id => PRODUCTS.find(p => p.id === id);
  const owned = uid => db.owned[uid] || [];
  const enabled = () => !!env.STRIPE_SECRET_KEY;
  let onGrant = () => {};

  async function stripe(method, p, form) {
    const r = await fetch(API + p, { method, headers: { authorization: 'Bearer ' + env.STRIPE_SECRET_KEY, 'content-type': 'application/x-www-form-urlencoded' },
      body: form ? new URLSearchParams(form) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('stripe ' + r.status + ': ' + ((j.error && j.error.message) || '').slice(0, 200));
    return j;
  }
  /** record one payment (idempotent by ref) → true when newly granted */
  function grantRef(ref, uid, item, thb) {
    const prod = byId(item); if (!ref || !uid || !prod || db.sessions[ref]) return false;
    db.sessions[ref] = { uid, item: prod.id, thb: +thb || 0, t: Date.now() };
    const o = db.owned[uid] || (db.owned[uid] = []); if (!o.includes(prod.id)) o.push(prod.id);
    persist(); console.log('💳 paid:', uid, prod.id, +thb || 0, 'THB', ref);
    onGrant(uid, owned(uid)); return true;
  }
  /** a Stripe checkout session that is paid */
  function grant(s) {
    const m = s.metadata || {};
    if (!s.id || s.payment_status !== 'paid') return false;
    return grantRef(s.id, m.uid, m.item, (s.amount_total || 0) / 100);
  }

  let slipOn = () => false;
  return {
    enabled, grantRef, useSlip: f => { slipOn = f; },
    onGrant: f => { onGrant = f; },
    /** what the game shows: the products, and which ones this account already has */
    catalog: uid => ({ on: enabled() || slipOn(), mode: slipOn() ? 'slip' : enabled() ? 'stripe' : '', items: PRODUCTS.map(p => ({ id: p.id, e: p.e, name: p.name, desc: p.desc, thb: p.thb, once: !!p.once, grant: p.grant })), owned: uid ? owned(uid) : [] }),
    owned,
    /** create a Stripe Checkout page for one product → its url */
    async start(uid, num, item, ret) {
      if (!enabled()) throw 'pay_off';
      const prod = byId(item); if (!prod) throw 'bad_item';
      if (prod.once && owned(uid).includes(prod.id)) throw 'already_owned';
      const back = String(ret).split('#')[0];
      const form = {
        mode: 'payment', client_reference_id: uid, 'metadata[uid]': uid, 'metadata[item]': prod.id, 'metadata[num]': num || '',
        'payment_intent_data[metadata][uid]': uid, 'payment_intent_data[metadata][item]': prod.id,
        'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': 'thb', 'line_items[0][price_data][unit_amount]': String(Math.round(prod.thb * 100)),
        'line_items[0][price_data][product_data][name]': prod.e + ' ' + prod.name + ' (Farm D Test)',
        success_url: back + '#farm_paid={CHECKOUT_SESSION_ID}', cancel_url: back + '#farm_pay_cancel=1',
      };
      (env.STRIPE_METHODS || 'card,promptpay').split(',').map(s => s.trim()).filter(Boolean).forEach((m, i) => { form['payment_method_types[' + i + ']'] = m; });
      const s = await stripe('POST', '/v1/checkout/sessions', form);
      if (!s.url) throw new Error('no checkout url');
      return s.url;
    },
    /** the game came back from Stripe: look the session up directly (in case the webhook is late) */
    async check(uid, sid) {
      if (!enabled() || typeof sid !== 'string' || !/^cs_[\w]{8,200}$/.test(sid)) throw 'bad_session';
      if (!db.sessions[sid]) { const s = await stripe('GET', '/v1/checkout/sessions/' + sid); if ((s.metadata || {}).uid !== uid) throw 'bad_session'; grant(s); }
      const rec = db.sessions[sid]; if (rec && rec.uid !== uid) throw 'bad_session';
      return { paid: !!rec, item: rec ? rec.item : '', owned: owned(uid) };
    },
    /** POST /stripe/webhook (raw body + Stripe-Signature header) → http status */
    webhook(raw, sigHeader) {
      const secret = env.STRIPE_WEBHOOK_SECRET; if (!secret) return 400;
      const parts = {}; for (const kv of String(sigHeader || '').split(',')) { const i = kv.indexOf('='); if (i > 0) (parts[kv.slice(0, i)] = parts[kv.slice(0, i)] || []).push(kv.slice(i + 1)); }
      const t = +(parts.t || [])[0]; if (!t || Math.abs(Date.now() / 1000 - t) > 600) return 400;
      const want = Buffer.from(crypto.createHmac('sha256', secret).update(t + '.' + raw).digest('hex'));
      if (!(parts.v1 || []).some(v => v.length === want.length && crypto.timingSafeEqual(Buffer.from(v), want))) return 400;
      let ev; try { ev = JSON.parse(raw); } catch (e) { return 400; }
      if (ev.type === 'checkout.session.completed' || ev.type === 'checkout.session.async_payment_succeeded') grant(ev.data && ev.data.object || {});
      return 200;
    },
  };
};
