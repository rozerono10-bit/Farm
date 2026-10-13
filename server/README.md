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

## บัญชีผู้เล่น: เข้าสู่ระบบด้วย LINE หรืออีเมล

- หน้าเริ่มเกมและ ⚙️ ตั้งค่า มีปุ่ม **เข้าสู่ระบบด้วย LINE / อีเมล** (ขึ้นเฉพาะตอนต่อเซิร์ฟเวอร์นี้) ครั้งแรกจะสมัครให้อัตโนมัติ
- **อีเมล:** ส่งรหัส 6 หลักไปทางอีเมล ใช้ได้ 10 นาที ใส่ผิดได้ 5 ครั้ง ขอรหัสใหม่ได้นาทีละครั้ง (ชั่วโมงละ 5 ครั้ง)
- **LINE:** ใช้ LINE Login ของ LINE เอง เซิร์ฟเวอร์ตรวจสอบตัวตนกับ LINE โดยตรง
- เชื่อม LINE และอีเมลเข้าบัญชีเดียวกันได้ (⚙️ ตั้งค่า > บัญชีผู้เล่น)
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
| `RESEND_API_KEY`, `MAIL_FROM` | resend.com > เพิ่มโดเมน `farmdtest.com` (ใส่ DNS ใน Cloudflare) > สร้าง API Key |

ไม่ใส่ `RESEND_API_KEY` = โหมดทดสอบ รหัสอีเมลจะแสดงในหน้าต่างเซิร์ฟเวอร์แทน · ไม่ใส่ค่า LINE = ปุ่ม LINE จะไม่ขึ้น

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

### 3. ตั้ง LINE Login
1. developers.line.biz > Console > สร้าง Provider (เช่น Farm) > Create a new channel > **LINE Login**
2. App types เลือก **Web app** · ใส่ชื่อ/ไอคอน/อีเมล
3. แท็บ LINE Login > Callback URL: `https://play.farmdtest.com/auth/line/callback`
4. แท็บ Basic settings คัดลอก **Channel ID** และ **Channel secret** ใส่ `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET` ใน `.env`
5. `systemctl restart farm` → ปุ่ม LINE จะขึ้นในเกม
6. ช่องที่ยังเป็น **Developing** ล็อกอินได้เฉพาะบัญชีที่เป็น admin/tester ของช่อง · พร้อมเปิดให้คนทั่วไปแล้วกด **Publish** (มุมบนของหน้าช่อง)

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
- **กันโกง:** เงิน เพชร และกระเป๋ายังเก็บในเครื่องผู้เล่น ควรย้ายมาคำนวณบนเซิร์ฟเวอร์
- **ฐานข้อมูลจริง:** ไฟล์ JSON เหมาะกับช่วงทดสอบ ถ้าคนเยอะควรย้ายไป PostgreSQL
- **HTTPS:** ตอนขึ้น VPS ต้องมีโดเมนและใบรับรอง (ใช้ Cloudflare หรือ Caddy ได้ฟรี) เพราะเว็บแบบ https ต่อ `ws://` ไม่ได้ ต้องเป็น `wss://`
