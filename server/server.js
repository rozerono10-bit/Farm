/* Farm online server
 * - Serves the game (../index.html) over HTTP and a WebSocket at /ws
 * - Replaces the claude.ai capabilities the game uses: user (id), db (doc/collection), room (join/emit/presence/peers)
 * - Stores shared docs (farms/, players/, chatw/) in memory and saves them to data/db.json
 * - Player accounts, login sessions and cloud saves: see auth.js
 *
 * Run:  npm install && npm start      (PORT=8080 by default)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
/* settings from server/.env (KEY=value per line), e.g. LINE_CHANNEL_ID, RESEND_API_KEY — see auth.js */
try { for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2'); } }
catch (e) { if (e.code !== 'ENOENT') console.error('.env read failed:', e.message); }
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const createAuth = require('./auth');

const PORT = +process.env.PORT || 8080;
const GAME = path.resolve(process.env.GAME_FILE || path.join(__dirname, '..', 'index.html'));
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const DB_FILE = path.join(DATA_DIR, 'db.json');

const MAX_DOC = 256 * 1024;          // bytes per document (same limit as claude.ai db)
const MAX_MSG = 1200 * 1024;         // bytes per websocket message (a cloud save can be up to 1 MB)
const SEASON = process.env.SEASON || 'cbt'; /* 🧪 รอบเกม (cbt / obt …) · เปลี่ยนค่า = เกมทุกเครื่องล้างเซฟในเครื่องตัวเอง (ดู obt-reset.sh) */
const MAX_ROOM_PEERS = +process.env.MAX_ROOM_PEERS || 100;
const RATE = { msgs: 60, per: 1000 }; // per connection
const POS_KEYS = new Set(['x', 'y', 'fx', 'fy', 'mv', 'ts']); // ts = sender's clock (ms) so others can place each position at the time it was sent
const COLLECTIONS = new Set(['farms', 'players', 'chatw']);
const OWN_ONLY = new Set(['players', 'chatw']); // only the owner (players/<uid>, chatw/<uid>) may write

/* ---------- storage ---------- */
const auth = createAuth(DATA_DIR);
const pay = require('./pay')(DATA_DIR);
const guard = require('./guard')(DATA_DIR, pay); /* 🛡️ กันโกง: ตรวจทุกเซฟก่อนเก็บ (ดู guard.js · node admin.js) */
guard.onBan((uid, reason) => { const c = online.get(uid); if (c) { send(c, { t: 'banned', reason }); c.ws.close(4003, 'banned'); } });
const slip = require('./slip')(DATA_DIR, pay); pay.useSlip(slip.enabled); /* 🧾 พร้อมเพย์ + สลิป (EasySlip) — ถ้าตั้งค่าไว้ จะใช้แทน Stripe */
pay.onGrant((uid, owned, give) => { const c = online.get(uid); if (c) { c.premT = 0; send(c, { t: 'ent', owned, give }); } }); /* 💳 ซื้อสำเร็จ → แจ้งเกมที่เปิดอยู่ทันที */
let docs = new Map();
try { const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); docs = new Map(Object.entries(raw)); console.log('loaded', docs.size, 'docs'); }
catch (e) { if (e.code !== 'ENOENT') console.error('db load failed:', e.message); }
let saveT = 0;
function saveSoon() { if (saveT) return; saveT = setTimeout(saveNow, 2000); }
function saveNow() {
  clearTimeout(saveT); saveT = 0;
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); const tmp = DB_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(docs))); fs.renameSync(tmp, DB_FILE); }
  catch (e) { console.error('db save failed:', e.message); }
}
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function deepMerge(a, b) { const o = isObj(a) ? { ...a } : {}; for (const k in b) o[k] = isObj(b[k]) && isObj(o[k]) ? deepMerge(o[k], b[k]) : b[k]; return o; }
function parsePath(p) {
  if (typeof p !== 'string' || p.length > 200) return null;
  const s = p.split('/'); if (!s.every(x => /^[\w@.+~:,-]{1,120}$/.test(x))) return null;
  if (!COLLECTIONS.has(s[0])) return null; return s;
}

/* ---------- subscriptions ---------- */
const docSubs = new Map(); // path -> Set<{c,sid}>
const colSubs = new Map(); // collection -> Set<{c,sid,pend:Map}>
function notify(p) {
  const v = docs.has(p) ? docs.get(p) : null;
  for (const s of docSubs.get(p) || []) send(s.c, { t: 'snap', sid: s.sid, data: v });
  const [col, id] = p.split('/');
  for (const s of colSubs.get(col) || []) { s.pend.set(id, v); if (!s.tm) s.tm = setTimeout(() => flushCol(s), 300); }
}
function flushCol(s) { s.tm = 0; if (!s.pend.size) return; const ch = [...s.pend].map(([id, data]) => ({ id, data })); s.pend.clear(); send(s.c, { t: 'snap', sid: s.sid, ch }); }
function colDocs(col) { const out = []; for (const [p, v] of docs) { const s = p.split('/'); if (s.length === 2 && s[0] === col) out.push({ id: s[1], data: v }); } return out; }

/* ---------- rooms ---------- */
const rooms = new Map(); // name -> Map<peer, conn>
/* 🛡️ แอดมิน: data/admins.json = รายการ UID 7 หลัก (แก้ด้วย node admin.js admin add <UID>) · เซิร์ฟติดป้าย adm ให้เอง ปลอมไม่ได้ */
const ADMINS_FILE = path.join(DATA_DIR, 'admins.json'); let admins = new Set(), adminsAt = 0;
function loadAdmins() { try { const mt = fs.statSync(ADMINS_FILE).mtimeMs; if (mt === adminsAt) return; adminsAt = mt; admins = new Set(JSON.parse(fs.readFileSync(ADMINS_FILE, 'utf8')).map(String)); } catch (e) { if (adminsAt) { admins = new Set(); adminsAt = 0; } } }
loadAdmins(); setInterval(loadAdmins, 5000).unref();
const online = new Map(); // account uid -> its one logged-in connection (logging in again elsewhere kicks the old one)
function roomPeers(name) { const r = rooms.get(name); return r ? [...r.values()] : []; }
function peerInfo(c, name) { return { peer: c.peer, uid: c.uid, presence: c.pres.get(name) || null }; }

/* ---------- connections ---------- */
/** 👑 มีมงกุฎพรีเมียมจริง (ซื้อด้วยเงินจริง หรือมีมาก่อนช่วง CBT) — จำผลไว้ 30 วินาที */
function premium(c) { if (!c.user) return false; const now = Date.now(); if (c.premT && now - c.premT < 30000) return c.prem; c.premT = now; c.prem = guard.hasCrown(c.uid); return c.prem; }
function send(c, m) { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(m)); }
function reply(c, id, ok, data) { send(c, ok ? { t: 'res', id, ok: 1, data } : { t: 'res', id, ok: 0, err: data }); }

function handle(c, m) {
  const { t, id } = m;
  if (t === 'hello') {
    if (m.token) { const s = auth.session(m.token); if (!s) return reply(c, id, 0, 'bad_token');
      const bn = guard.banned(s.uid); if (bn) { send(c, { t: 'banned', reason: bn.reason, num: s.num }); return reply(c, id, 0, 'banned'); } c.uid = s.uid; c.user = s.user; c.num = s.num; c.token = m.token;
      const old = online.get(s.uid); if (old && old !== c) { send(old, { t: 'kick', why: 'elsewhere' }); old.ws.close(4001, 'logged in elsewhere'); }
      online.set(s.uid, c); }
    else if (typeof m.uid === 'string' && /^[\w-]{6,64}$/.test(m.uid)) { if (auth.isOwned(m.uid)) return reply(c, id, 0, 'login_required'); c.uid = m.uid; c.user = ''; }
    c.admin = !!(c.user && c.num && admins.has(String(c.num)));
    return reply(c, id, 1, { uid: c.uid, peer: c.peer, user: c.user || '', num: c.user ? c.num : '', season: SEASON, admin: c.admin ? 1 : 0 });
  }
  if (t === 'email_start' || t === 'email_verify' || t === 'line_ticket' || t === 'oauth_ticket') {
    const now = Date.now(); c.authTries = (c.authTries || []).filter(x => now - x < 60000);
    if (c.authTries.length >= 15) return reply(c, id, 0, 'too_many_tries'); c.authTries.push(now);
    // link = attach this login to the account already logged in on this connection · otherwise sign in (new accounts keep this guest id)
    const link = m.link && c.user ? c.uid : '', claim = c.user ? '' : c.uid;
    const fail = e => reply(c, id, 0, typeof e === 'string' ? e : (console.error(e), 'error'));
    try {
      if (t === 'email_start') return void auth.emailStart(m.email).then(r => reply(c, id, 1, r), fail);
      if (t === 'email_verify') return reply(c, id, 1, auth.emailVerify(m.email, m.code, claim, link));
      return reply(c, id, 1, { ticket: auth.oauthTicket(t === 'line_ticket' ? 'line' : m.p, m.ret, claim, link) });
    } catch (e) { return fail(e); }
  }
  if (t === 'auth_cfg') return reply(c, id, 1, auth.enabled());
  if (t === 'ping') return reply(c, id, 1);
  if (t === 'pay_cfg') return reply(c, id, 1, pay.catalog(c.user ? c.uid : ''));
  if (t === 'pay_ack') { if (c.user) pay.ack(c.uid, m.refs); return reply(c, id, 1); }
  if (t === 'pay_start' || t === 'pay_check' || t === 'slip_order' || t === 'slip_send') {
    if (!c.user) return reply(c, id, 0, 'login_required');
    const now = Date.now(); c.payTries = (c.payTries || []).filter(x => now - x < 60000);
    if (c.payTries.length >= 10) return reply(c, id, 0, 'too_many_tries'); c.payTries.push(now);
    const fail = e => reply(c, id, 0, typeof e === 'string' ? e : (console.error('pay:', e.message), 'pay_failed'));
    if (t === 'slip_order') { try { return reply(c, id, 1, slip.order(c.uid, m.item)); } catch (e) { return fail(e); } }
    if (t === 'slip_send') return void slip.verify(c.uid, m.oid, m.image).then(r => reply(c, id, 1, r), fail);
    if (t === 'pay_start') { if (!auth.okReturn(m.ret)) return reply(c, id, 0, 'bad_return'); return void pay.start(c.uid, c.num, m.item, m.ret).then(url => reply(c, id, 1, { url }), fail); }
    return void pay.check(c.uid, m.sid).then(r => reply(c, id, 1, r), fail);
  }
  if (!c.uid) return reply(c, id, 0, 'hello_first');
  if (t === 'logout') { auth.logout(c.token); return reply(c, id, 1); }
  if (t === 'acct_info') return reply(c, id, 1, c.user ? auth.info(c.uid) : null);
  if (t === 'save_get' || t === 'save_put') {
    if (!c.user) return reply(c, id, 0, 'login_required');
    if (t === 'save_get') return reply(c, id, 1, auth.saveGet(c.uid));
    try { const prev = auth.saveGet(c.uid); guard.check(c.uid, prev && prev.data, m.data); auth.savePut(c.uid, m.ts, m.data, m.base); c.premT = 0; return reply(c, id, 1); }
    catch (e) { if (e === 'banned') { const bn = guard.banned(c.uid); send(c, { t: 'banned', reason: bn ? bn.reason : '', num: c.num }); } return reply(c, id, 0, typeof e === 'string' ? e : 'error'); }
  }

  if (t === 'get' || t === 'set' || t === 'update') {
    const s = parsePath(m.path); if (!s || s.length % 2) return reply(c, id, 0, 'bad_path');
    const p = s.join('/');
    if (t === 'get') return reply(c, id, 1, docs.has(p) ? docs.get(p) : null);
    if (OWN_ONLY.has(s[0]) && s[1] !== c.uid) return reply(c, id, 0, 'not_allowed');
    if (!isObj(m.data)) return reply(c, id, 0, 'bad_data');
    const next = t === 'set' ? m.data : (docs.has(p) ? deepMerge(docs.get(p), m.data) : undefined);
    if (next === undefined) return reply(c, id, 0, 'invalid_argument');
    if (Buffer.byteLength(JSON.stringify(next)) > MAX_DOC) return reply(c, id, 0, 'too_large');
    docs.set(p, next); saveSoon(); notify(p); return reply(c, id, 1);
  }
  if (t === 'list') { const s = parsePath(m.path); if (!s || s.length !== 1) return reply(c, id, 0, 'bad_path'); return reply(c, id, 1, colDocs(s[0])); }
  if (t === 'sub') {
    const s = parsePath(m.path); if (!s || typeof m.sid !== 'string' || c.subs.size > 50) return reply(c, id, 0, 'bad_sub');
    if (s.length === 1) { const e = { c, sid: m.sid, pend: new Map(), tm: 0 }; if (!colSubs.has(s[0])) colSubs.set(s[0], new Set()); colSubs.get(s[0]).add(e); c.subs.set(m.sid, () => { clearTimeout(e.tm); colSubs.get(s[0]).delete(e); }); send(c, { t: 'snap', sid: m.sid, full: colDocs(s[0]) }); }
    else if (s.length % 2 === 0) { const p = s.join('/'), e = { c, sid: m.sid }; if (!docSubs.has(p)) docSubs.set(p, new Set()); docSubs.get(p).add(e); c.subs.set(m.sid, () => docSubs.get(p).delete(e)); send(c, { t: 'snap', sid: m.sid, data: docs.has(p) ? docs.get(p) : null }); }
    else return reply(c, id, 0, 'bad_path');
    return reply(c, id, 1);
  }
  if (t === 'unsub') { const f = c.subs.get(m.sid); if (f) { f(); c.subs.delete(m.sid); } return; }

  if (t === 'join') {
    const name = m.room; if (typeof name !== 'string' || !/^[\w-]{1,40}$/.test(name)) return reply(c, id, 0, 'bad_room');
    if (!rooms.has(name)) rooms.set(name, new Map()); const r = rooms.get(name);
    if (!r.has(c.peer) && r.size >= MAX_ROOM_PEERS) return reply(c, id, 0, 'room_full');
    r.set(c.peer, c); c.rooms.add(name);
    for (const o of r.values()) if (o !== c) send(o, { t: 'peer', room: name, p: peerInfo(c, name) });
    return reply(c, id, 1, { peers: [...r.values()].map(o => peerInfo(o, name)) });
  }
  if (t === 'leave') { leaveRoom(c, m.room); return reply(c, id, 1); }
  if (t === 'emit') {
    if (!c.rooms.has(m.room) || typeof m.topic !== 'string' || m.topic.length > 40) return reply(c, id, 0, 'not_joined');
    /* 🤝 เทรดของ (topic tx*): ได้เฉพาะคนที่มีมงกุฎพรีเมียมจริงทั้งสองฝั่ง */
    if (/^tx/.test(m.topic)) { const to = m.data && m.data.to, o = roomPeers(m.room).find(x => x.peer === to); if (!premium(c) || !o || !premium(o)) return reply(c, id, 0, 'need_premium'); }
    const ev = { t: 'ev', room: m.room, topic: m.topic, peer: c.peer, uid: c.uid, data: m.data };
    for (const o of roomPeers(m.room)) send(o, ev); // the sender hears its own emit too (isMe), like claude.ai
    return reply(c, id, 1);
  }
  if (t === 'pres') {
    if (!c.rooms.has(m.room) || !isObj(m.data)) return reply(c, id, 0, 'not_joined');
    const old = c.pres.get(m.room) || {}, nu = Object.assign({}, m.data); delete nu.adm; if (c.admin) nu.adm = 1; nu.pc = premium(c) ? 1 : 0; c.pres.set(m.room, nu); /* 👑 มงกุฎหน้าชื่อ = ของจริงเท่านั้น */
    const mapChanged = old.map !== nu.map || old.at !== nu.at;
    const onlyPos = !mapChanged && Object.keys(nu).every(k => POS_KEYS.has(k) || JSON.stringify(old[k]) === JSON.stringify(nu[k]));
    for (const o of roomPeers(m.room)) {
      if (o === c) continue;
      const op = o.pres.get(m.room) || {};
      // interest management: position-only updates go to players on the same map; everything else goes to everyone
      if (onlyPos && (op.map !== nu.map || (nu.map === 'farm' && op.at !== nu.at))) continue;
      send(o, { t: 'pres', room: m.room, peer: c.peer, presence: nu });
    }
    if (mapChanged) for (const o of roomPeers(m.room)) if (o !== c && o.pres.get(m.room)) send(c, { t: 'pres', room: m.room, peer: o.peer, presence: o.pres.get(m.room) });
    return reply(c, id, 1);
  }
  reply(c, id, 0, 'unknown');
}
function leaveRoom(c, name) {
  const r = rooms.get(name); if (!r || !r.delete(c.peer)) return; c.rooms.delete(name); c.pres.delete(name);
  for (const o of r.values()) send(o, { t: 'gone', room: name, peer: c.peer });
  if (!r.size) rooms.delete(name);
}

/* ---------- http + websocket ---------- */
const server = http.createServer((req, res) => {
  const u = (req.url || '/').split('?')[0];
  if (u === '/stripe/webhook' && req.method === 'POST') {
    const parts = []; let size = 0, big = false;
    req.on('data', d => { size += d.length; if (size > 512 * 1024) { big = true; req.destroy(); } else parts.push(d); });
    req.on('end', () => { if (big) return; const code = pay.webhook(Buffer.concat(parts).toString('utf8'), req.headers['stripe-signature']); res.writeHead(code, { 'content-type': 'application/json' }); res.end(code === 200 ? '{"received":true}' : '{"error":"bad signature"}'); });
    return;
  }
  const am = u.match(/^\/auth\/(line|google)\/(start|callback)$/);
  if (am) {
    const [, p, step] = am, q = new URL(req.url, 'http://x').searchParams;
    const go = to => { res.writeHead(to ? 302 : 400, to ? { location: to } : { 'content-type': 'text/plain; charset=utf-8' }); res.end(to ? '' : 'ลิงก์หมดอายุ กลับไปกดเข้าสู่ระบบในเกมอีกครั้ง'); };
    if (step === 'start') return go(auth.oauthStartUrl(p, q.get('t') || ''));
    auth.oauthFinish(p, q.get('code'), q.get('state') || '', q.get('error')).then(go);
    return;
  }
  if (u === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: 1, conns: wss.clients.size, rooms: rooms.size, docs: docs.size })); }
  if (u === '/' || u === '/index.html') {
    fs.readFile(GAME, 'utf8', (err, html) => {
      if (err) { res.writeHead(500); return res.end('game file not found: ' + GAME); }
      // tell the page to use this server (same origin, /ws)
      html = html.replace('<head>', '<head><script>window.FARM_SERVER=(location.protocol==="https:"?"wss://":"ws://")+location.host+"/ws";</script>');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }); res.end(html);
    });
    return;
  }
  res.writeHead(404); res.end('not found');
});
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MSG });
wss.on('connection', ws => {
  const c = { ws, peer: crypto.randomBytes(6).toString('hex'), uid: '', subs: new Map(), rooms: new Set(), pres: new Map(), win: Date.now(), n: 0 };
  ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', buf => {
    const now = Date.now(); if (now - c.win > RATE.per) { c.win = now; c.n = 0; }
    if (++c.n > RATE.msgs) return; // drop flood
    let m; try { m = JSON.parse(buf); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    try { handle(c, m); } catch (e) { console.error('handle error:', e); }
  });
  ws.on('close', () => { if (online.get(c.uid) === c) online.delete(c.uid); for (const f of c.subs.values()) f(); c.subs.clear(); for (const r of [...c.rooms]) leaveRoom(c, r); });
});
// drop connections that stopped answering pings (closed tabs, lost phones)
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 30000);

process.on('SIGINT', () => { saveNow(); auth.flush(); guard.flush(); process.exit(0); });
process.on('SIGTERM', () => { saveNow(); auth.flush(); guard.flush(); process.exit(0); });
server.listen(PORT, () => console.log('Farm server on http://localhost:' + PORT + '  (game: ' + GAME + ')'));
