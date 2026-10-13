# เซิร์ฟเวอร์ออนไลน์ของเกม Farm

เซิร์ฟเวอร์นี้ทำหน้าที่แทนระบบออนไลน์ของ claude.ai ที่เกมใช้อยู่ ได้แก่ ตัวตนผู้เล่น, ฐานข้อมูล (`farms/`, `players/`, `chatw/`) และห้องเรียลไทม์ (เดิน แชท กระซิบ ชวนไปฟาร์ม เทรด) โค้ดเกมเดิมจึงไม่ต้องแก้

## ลองรันในเครื่องตัวเอง

ต้องมี [Node.js](https://nodejs.org) เวอร์ชัน 18 ขึ้นไป

```bash
cd server
npm install
npm start
```

จากนั้นเปิด http://localhost:8080 เกมจะต่อเซิร์ฟเวอร์ให้เอง ถ้าเปิดอีกหน้าต่างแบบไม่ระบุตัวตน (Incognito) จะได้ผู้เล่นคนที่ 2 ไว้ทดสอบ

- ข้อมูลเก็บที่ `server/data/db.json` (บันทึกทุก 2 วินาที และตอนปิดเซิร์ฟเวอร์)
- ดูสถานะได้ที่ http://localhost:8080/health

## ตั้งค่า (ตัวแปรสภาพแวดล้อม)

| ตัวแปร | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `PORT` | `8080` | พอร์ตของเซิร์ฟเวอร์ |
| `GAME_FILE` | `../index.html` | ไฟล์เกมที่เปิดให้เล่น |
| `DATA_DIR` | `./data` | โฟลเดอร์เก็บข้อมูล |
| `MAX_ROOM_PEERS` | `100` | จำนวนคนสูงสุดต่อเซิร์ฟ (ห้อง) |

## ใช้กับเกมที่ฝากไว้ที่อื่น (เช่น Cloudflare Pages)

ใส่ที่อยู่เซิร์ฟเวอร์ใน `index.html` ตรง `const FARM_SERVER_URL=''` เช่น

```js
const FARM_SERVER_URL='wss://play.myfarm.com/ws';
```

หรือทดสอบโดยเปิดลิงก์ `https://เว็บเกม/?server=wss://play.myfarm.com/ws`

ถ้าไม่ได้ตั้งค่า เกมจะใช้ระบบเดิม คือ claude.ai ถ้าเปิดเป็น Artifact หรือเล่นแบบออฟไลน์

## บัญชีผู้เล่น: เข้าสู่ระบบด้วย Google หรือ LINE

- หน้าเริ่มเกมมีปุ่ม **ดำเนินการต่อด้วย Google** และ **ดำเนินการต่อด้วย LINE** (ขึ้นเฉพาะตอนต่อเซิร์ฟเวอร์นี้ และเฉพาะปุ่มที่ตั้งค่าแล้ว) ครั้งแรกจะสมัครให้อัตโนมัติ
- **Google:** ใช้ Sign in with Google เซิร์ฟเวอร์รับข้อมูลตัวตนจาก Google โดยตรง
- **LINE:** ใช้ LINE Login ของ LINE เอง เซิร์ฟเวอร์ตรวจสอบตัวตนกับ LINE โดยตรง
- เชื่อม Google และ LINE เข้าบัญชีเดียวกันได้ (⚙️ ตั้งค่า > บัญชีผู้เล่น)
- ล็อกอินครั้งแรก ฟาร์มและเซฟที่เล่นอยู่ในเครื่องนั้นยังเป็นของคุณ · ล็อกอินเครื่องใหม่ = ได้เซฟจากเซิร์ฟเวอร์
- เล่นแล้วเซฟขึ้นเซิร์ฟเองทุก ~10 วินาที และตอนสลับแอป · ไม่เขียนทับเซฟใหม่กว่าจากอีกเครื่อง
- ไอดีที่เป็นบัญชีแล้ว ใช้ได้เฉพาะคนที่ล็อกอิน (กันปลอมตัว)
- ข้อมูลบัญชีอยู่ที่ `data/auth.json` · เซฟอยู่ที่ `data/saves/<id>.json` (ต้องสำรองทั้งโฟลเดอร์ `data/`)

### ตั้งค่า (คัดลอก `.env.example` เป็น `.env`)

| ค่า | ได้จากไหน |
|---|---|
| `PUBLIC_URL` | ที่อยู่ https ของเซิร์ฟเวอร์ เช่น `https://play.farmdtest.com` |
| `ALLOWED_ORIGINS` | เว็บเกมที่อนุญาต เช่น `https://farmdtest.com,https://www.farmdtest.com` |
| `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET` | developers.line.biz > สร้าง Provider > สร้างช่อง **LINE Login** · ตั้ง Callback URL เป็น `https://play.farmdtest.com/auth/line/callback` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | console.cloud.google.com > APIs & Services > Credentials > OAuth client ID (Web application) · Authorized redirect URI: `https://play.farmdtest.com/auth/google/callback` |
| `RESEND_API_KEY`, `MAIL_FROM` | resend.com > เพิ่มโดเมน `farmdtest.com` (ใส่ DNS ใน Cloudflare) > สร้าง API Key |

ไม่ใส่ค่า Google / LINE = ปุ่มนั้นจะไม่ขึ้น · หน้าเกมไม่มีเข้าด้วยอีเมลแล้ว (เซิร์ฟเวอร์ยังรองรับอยู่ ค่า Resend ไม่ใส่ก็ได้)

## สำรองข้อมูล (Backup) ไปที่ Cloudflare R2

1. ติดตั้ง rclone: `sudo apt install -y rclone`
2. ใส่ค่า `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET` ใน `.env`
3. ทดสอบกุญแจก่อนด้วย `./backup.sh check` (ไม่อัปโหลดอะไร) ต้องขึ้น `R2 OK`
4. ลองรัน `./backup.sh` จะอัปโหลดโฟลเดอร์ `data/` (บีบอัด) ขึ้น R2
5. ตั้งให้รันทุกวันด้วย `crontab -e` แล้วใส่บรรทัด `17 4 * * * /ที่อยู่/Farm/server/backup.sh >> ~/backup.log 2>&1`

กู้คืน: `./backup.sh restore` (ดูรายการ) แล้ว `./backup.sh restore farm-YYYYMMDD-HHMMSS.tar.gz` (ปิดเซิร์ฟเวอร์ก่อน)
Backup เก่าเกิน 30 วันจะถูกลบเองจาก lifecycle rule ของถัง

## งานที่เหลือ ทำทีละขั้น (บน VPS ใช้ `ssh root@45.32.101.188`)

แก้ `.env` ด้วย `sudo -u farm nano /home/farm/Farm/server/.env` แล้วต้อง `systemctl restart farm` ทุกครั้งหลังแก้ (backup.sh อ่าน .env เองไม่ต้อง restart)

### 1. ทดสอบ Backup
1. Cloudflare > R2 > Manage API tokens > สร้าง token สิทธิ์ **Object Read & Write** เฉพาะถัง `farm-backup`
2. ใส่ `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT` (หน้า token จะบอก `https://<account-id>.r2.cloudflarestorage.com`) ใน `.env`
3. `sudo -u farm /home/farm/Farm/server/backup.sh check` → ต้องขึ้น `R2 OK`
4. `sudo -u farm /home/farm/Farm/server/backup.sh` → ต้องขึ้น `uploaded farm-....tar.gz` และเห็นไฟล์ในถังบนหน้าเว็บ Cloudflare
5. วันถัดไปดู `tail /home/farm/backup.log` ว่า cron รันเอง

### 2. ตั้ง Resend (ส่งอีเมลรหัส)
1. resend.com > Domains > Add Domain > `farmdtest.com` (เลือก region ใกล้สุด เช่น Tokyo)
2. Resend จะให้ DNS 3–4 รายการ (MX + TXT ของ `send`, TXT DKIM `resend._domainkey`) → ใส่ใน Cloudflare DNS ตามนั้นทุกตัว (เป็น TXT/MX ไม่มีปุ่ม Proxy ไม่ต้องสนใจ)
3. กด Verify ใน Resend รอจนเป็น Verified (ปกติไม่กี่นาที)
4. Resend > API Keys > Create (สิทธิ์ Sending access, เลือกโดเมน farmdtest.com) → ใส่ `RESEND_API_KEY=re_...` ใน `.env` ส่วน `MAIL_FROM=Farm <login@farmdtest.com>` ใช้ได้เลย
5. `systemctl restart farm` แล้วลองล็อกอินด้วยอีเมลในเกม · ถ้าไม่ได้รับ ดู `journalctl -u farm -n 50` จะเห็น `email send failed: ...` พร้อมเหตุผล

### 2.5 ตั้ง Google Login
1. console.cloud.google.com > สร้างโปรเจกต์ (เช่น Farm)
2. APIs & Services > **OAuth consent screen** (หรือ Google Auth Platform > Branding) > ใส่ชื่อแอป `Farm`, อีเมลติดต่อ · Audience = **External**
3. APIs & Services > **Credentials** > Create credentials > **OAuth client ID** > Application type = **Web application**
4. **Authorized redirect URIs** ใส่ `https://play.farmdtest.com/auth/google/callback`
5. คัดลอก **Client ID** และ **Client secret** ใส่ `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` ใน `.env` แล้ว `systemctl restart farm`
6. ระหว่างแอปเป็น **Testing** เข้าได้เฉพาะอีเมลที่เพิ่มใน Test users · พร้อมเปิดให้ทุกคนกด **Publish app** (ใช้แค่ชื่อโปรไฟล์ ไม่ต้องรอ Google ตรวจ)

### 3. ตั้ง LINE Login
1. developers.line.biz > Console > สร้าง Provider (เช่น Farm) > Create a new channel > **LINE Login**
2. App types เลือก **Web app** · ใส่ชื่อ/ไอคอน/อีเมล
3. แท็บ LINE Login > Callback URL: `https://play.farmdtest.com/auth/line/callback`
4. แท็บ Basic settings คัดลอก **Channel ID** และ **Channel secret** ใส่ `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET` ใน `.env`
5. `systemctl restart farm` → ปุ่ม LINE จะขึ้นในเกม
6. ช่องที่ยังเป็น **Developing** ล็อกอินได้เฉพาะบัญชีที่เป็น admin/tester ของช่อง · พร้อมเปิดให้คนทั่วไปแล้วกด **Publish** (มุมบนของหน้าช่อง)

### 3.5 ตั้งระบบเติมเงิน (Stripe: พร้อมเพย์ + บัตร)
ของที่ขายและราคาอยู่ที่ `server/products.js` (มงกุฎ ฿69 · ชุดแฟชั่นชุดละ ฿29 · ของแต่งตัวทุกชิ้น ฿29 · ท่าเก็บ ฿39 · โล่กันอีกา 10/50 อัน ฿10/฿50 แก้ได้ · Stripe ขั้นต่ำ ฿10) · ผู้เล่นซื้อได้ที่ 👑 ร้านพรีเมียม > แท็บ 💳 เติมเงิน (ขึ้นเฉพาะตอนล็อกอินและตั้งค่า Stripe แล้ว)
1. dashboard.stripe.com > Settings > **Payment methods** > เปิด **PromptPay** และ Cards
2. Developers > **API keys** > คัดลอก **Secret key** ใส่ `STRIPE_SECRET_KEY` ใน `.env` (ทดสอบก่อนด้วย `sk_test_...` ได้ ไม่มีเงินจริง)
3. Developers > **Webhooks** > Add endpoint: `https://play.farmdtest.com/stripe/webhook` · เลือก events `checkout.session.completed` และ `checkout.session.async_payment_succeeded` · คัดลอก **Signing secret** ใส่ `STRIPE_WEBHOOK_SECRET`
4. `systemctl restart farm` แล้วลองซื้อ (โหมดทดสอบใช้บัตร `4242 4242 4242 4242` วันหมดอายุอะไรก็ได้ในอนาคต)
5. ประวัติการซื้ออยู่ที่ `data/purchases.json` (รวมอยู่ใน backup) และใน Stripe Dashboard > Payments
6. เปลี่ยนเป็นเงินจริง: ใช้ `sk_live_...` และสร้าง webhook ใหม่ในโหมด Live (signing secret คนละตัวกับโหมดทดสอบ)

### 3.6 รับเงินด้วยพร้อมเพย์ของตัวเอง + ตรวจสลิปอัตโนมัติ (EasySlip) — ใช้แทน Stripe ได้
ผู้เล่นกดซื้อ → เกมแสดง QR พร้อมเพย์ที่มียอดเงินของออเดอร์นั้น (ราคา + เศษสตางค์ไม่ซ้ำกัน เช่น ฿99.37 ใช้ได้ 30 นาที) → โอน → อัปโหลดสลิป → เซิร์ฟเวอร์ส่งให้ EasySlip ตรวจกับธนาคาร แล้วเช็กว่า ยอดตรงทุกสตางค์ · โอนเข้าชื่อ/บัญชีของคุณ · สลิปทำหลังออเดอร์ · สลิปไม่เคยใช้มาก่อน → ให้ของทันที
1. สมัคร developer.easyslip.com > เลือกแพ็กเกจ > คัดลอก API key ใส่ `SLIP_API_KEY`
2. `PROMPTPAY_QR` = ข้อความใน QR พร้อมเพย์ของคุณ (อ่าน QR ด้วยแอปสแกน QR ได้ ขึ้นต้นด้วย `000201`)
3. `SLIP_RECEIVER_NAME` = ชื่อจริงของคุณตามที่ขึ้นในสลิป (เช่น ชื่อต้นอย่างเดียว) · เลขบัญชีจะเช็ก 3 ตัวท้ายจาก QR ให้เอง
4. `systemctl restart farm` · สลิปที่ใช้แล้วเก็บที่ `data/slips.json` · ของที่ขายแล้วอยู่ `data/purchases.json`
5. หน้าเกมไม่แสดงชื่อผู้รับ (SLIP_RECEIVER_NAME ใช้ตรวจในเซิร์ฟเวอร์เท่านั้น) · แต่แอปธนาคารของผู้โอนจะแสดงชื่อเจ้าของบัญชีตอนสแกน QR เสมอ

### 3.7 CBT → OBT (ล้างข้อมูลเกม แต่ของที่ซื้อด้วยเงินจริงไม่หาย)
- ตอนนี้รอบเกมคือ `cbt` (ค่าเริ่มต้นของ `SEASON` ใน `.env`) · ร้านพรีเมียมมีประกาศว่าของที่ซื้อจะไม่หายตอน OBT
- ประวัติการซื้อทุกครั้งเก็บถาวรที่ `data/purchases.json` ผูกกับบัญชี Google/LINE (รวมโล่ที่ซื้อ) · ดูรายชื่อคนที่ซื้อ: `node /home/farm/Farm/server/purchases-report.js` (หรือ `... purchases-report.js csv > buyers.csv`)
- วันเปิด OBT: `cd /home/farm/Farm/server && sudo ./obt-reset.sh obt` → สำรองข้อมูลก่อน แล้วลบฟาร์ม/เซฟทั้งหมด เปลี่ยน `SEASON=obt` · ผู้เล่นเปิดเกมครั้งถัดไป เซฟในเครื่องจะถูกล้าง ล็อกอินบัญชีเดิมแล้วได้มงกุฎ/ชุด/ท่าเก็บ/โล่ที่เคยซื้อคืนอัตโนมัติ
- ห้ามลบ `data/auth.json` และ `data/purchases.json` (ถ้าลบ ระบบจะจำไม่ได้ว่าใครซื้ออะไร)

### 3.8 กันโกง (ขั้นที่ 1) — `guard.js`
เซิร์ฟเวอร์ตรวจทุกเซฟก่อนเก็บ:
- **แบนอัตโนมัติ** (เล่นปกติทำไม่ได้แน่นอน): มีมงกุฎ/ชุด/ท่าเก็บ/ของแต่งตัวที่ไม่ได้ซื้อด้วยเงินจริง · โล่กันอีกาเพิ่มเกินที่ซื้อ · อ้างรหัสการจ่ายเงินปลอม
- **ไม่รับเซฟ** (อาจเป็นบั๊ก ไม่แบน): ตัวเลขเสีย เช่น ติดลบ / ไม่ใช่ตัวเลข / ใหญ่เกิน · เกมจะโหลดเซฟล่าสุดที่ดีกลับมาเอง
- **จดไว้ดู**: เงิน/เพชร/เลเวลที่เพิ่มมากสุดใน 1 เซฟของแต่ละคน → ดูด้วย `node admin.js jumps` แล้วค่อยตั้ง `CHEAT_COIN_JUMP` / `CHEAT_GEM_JUMP` / `CHEAT_LV_JUMP` ใน `.env` ให้สูงกว่าคนเล่นปกติ (ตั้งแล้วเกินจะแบนอัตโนมัติ)
- ช่วง CBT: ของที่บัญชีมีอยู่แล้วตอนระบบนี้เริ่มตรวจครั้งแรก (เช่น ที่เคยซื้อด้วยเพชร) ไม่ถือว่าโกง · ตั้งแต่ OBT ไม่มีข้อยกเว้นนี้
- มงกุฎและโล่กันอีกาเทรดให้คนอื่นไม่ได้ (ซื้อด้วยเงินจริง)
- คำสั่งแอดมิน (เซิร์ฟเวอร์รับรู้เองภายใน ~5 วินาที ไม่ต้อง restart): `node admin.js bans` · `node admin.js who <UID>` · `node admin.js unban <UID>` · `node admin.js ban <UID> เหตุผล`
- แอดมิน (ป้าย ADMIN สีแดงหน้าชื่อ ผู้เล่นทุกคนเห็น เซิร์ฟเวอร์ติดให้เอง ปลอมไม่ได้): `node admin.js admin add <UID>` · `admin remove <UID>` · `admin list` (มีผลเมื่อคนนั้นรีเฟรชเกม)
- ข้อจำกัด: เกมยังคำนวณในเครื่องผู้เล่น คนที่แก้เงิน/เพชรทีละนิดยังไม่ถูกจับ (ต้องทำขั้นที่ 2: ย้ายการซื้อขายไปคำนวณบนเซิร์ฟเวอร์)

### 4. แก้ farmdtest.com ขึ้น 404
สาเหตุ: Cloudflare Workers สร้างเว็บจาก branch หลักของ repo (`claude/female-hairstyle-anime-fashion-16gg9i`) ซึ่งยังไม่มีไฟล์ `wrangler.jsonc` / โค้ดล่าสุด · ไฟล์ตั้งค่าอยู่ใน branch `claude/happy-bell-5sj3qh`
1. Cloudflare > Workers & Pages > `farmdtest` > Settings > Build > **Branch control** > Production branch = `claude/happy-bell-5sj3qh` (หรือ merge branch นี้เข้า branch หลักบน GitHub ก็ได้)
2. Build command เว้นว่าง · Deploy command = `npx wrangler deploy` · Root directory = `/`
3. แท็บ Deployments กด Retry / push ใหม่ แล้วดู log ว่า deploy สำเร็จ และ `farmdtest.rozerono10.workers.dev` เปิดเกมได้
4. Settings > Domains & Routes > Add > **Custom domain** ใส่ `farmdtest.com` และอีกอันคือ `www.farmdtest.com` (ถ้า DNS มีเรคคอร์ด `@`/`www` เดิมอยู่ ให้ลบก่อน ไม่งั้นเพิ่มไม่ได้) · ห้ามแตะเรคคอร์ด `play`
5. ชื่อ Worker ใน Cloudflare ต้องตรงกับ `"name"` ใน `wrangler.jsonc` (ตอนนี้คือ `farmdtest`)

### ภายหลัง (ไม่ด่วน)
- เปลี่ยน SSL/TLS จาก Flexible เป็น **Full (strict)**: สร้าง Origin Certificate ใน Cloudflare แล้วให้ VPS รับ https ที่พอร์ต 443 (Flexible = ช่วง Cloudflare→VPS ไม่เข้ารหัส)
- Firewall VPS ให้รับพอร์ต 80/443 เฉพาะ IP ของ Cloudflare

## สิ่งที่ทำแล้ว

- ส่งตำแหน่งตัวละครเฉพาะคนที่อยู่แมพเดียวกัน (ลดเน็ตได้มากเมื่อคนเยอะ)
- จำกัดข้อความต่อวินาทีต่อคน กันสแปม
- `players/<id>` และ `chatw/<id>` แก้ได้เฉพาะเจ้าของ
- หลุดแล้วต่อใหม่เองอัตโนมัติ

## ยังต้องทำก่อนเปิดให้คนทั่วไปเล่น

- ผู้เล่นที่ไม่ล็อกอินยังเป็นไอดีสุ่มในเบราว์เซอร์เหมือนเดิม (ล้างเบราว์เซอร์แล้วเซฟหาย)
- **กันโกงขั้นที่ 2:** เงิน เพชร และกระเป๋ายังคำนวณในเครื่องผู้เล่น (ขั้นที่ 1 ตรวจเซฟแล้ว ดูหัวข้อ 3.8) ควรย้ายการซื้อขายมาคำนวณบนเซิร์ฟเวอร์ · ของที่ซื้อด้วยเงินจริงบันทึกบนเซิร์ฟเวอร์แล้ว (ล้างเครื่องก็ได้คืน) แต่คนที่แก้ค่าในเบราว์เซอร์ยังเปิดมงกุฎเองได้
- **ฐานข้อมูลจริง:** ไฟล์ JSON เหมาะกับช่วงทดสอบ ถ้าคนเยอะควรย้ายไป PostgreSQL
- **HTTPS:** ตอนขึ้น VPS ต้องมีโดเมนและใบรับรอง (ใช้ Cloudflare หรือ Caddy ได้ฟรี) เพราะเว็บแบบ https ต่อ `ws://` ไม่ได้ ต้องเป็น `wss://`
