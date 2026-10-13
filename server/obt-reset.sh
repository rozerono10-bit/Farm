#!/usr/bin/env bash
# 🧪 เปิดรอบใหม่ (เช่น CBT → OBT): ล้างข้อมูลเกมทั้งหมด แต่เก็บ "บัญชีผู้เล่น" และ "ของที่ซื้อด้วยเงินจริง" ไว้
#   ล้าง: data/db.json (ฟาร์ม ผู้เล่น แชท) · data/saves/ (เซฟบนเซิร์ฟ) · เซฟในเครื่องผู้เล่น (เกมล้างเองเมื่อ SEASON เปลี่ยน)
#   เก็บ: data/auth.json (บัญชี Google/LINE + UID) · data/purchases.json (ของที่ซื้อ) · data/slips.json (สลิปที่ใช้แล้ว)
#   ผู้เล่นล็อกอินบัญชีเดิม → ได้มงกุฎ/ชุด/ท่าเก็บ/โล่ที่เคยซื้อคืนอัตโนมัติ
# ใช้:  sudo ./obt-reset.sh obt      (ชื่อรอบใหม่ ใส่อะไรก็ได้ที่ไม่ซ้ำรอบเดิม เช่น obt, obt2)
set -euo pipefail
cd "$(dirname "$0")"
NEW="${1:-}"; [[ "$NEW" =~ ^[a-z0-9_-]{2,20}$ ]] || { echo "ใส่ชื่อรอบใหม่ เช่น: sudo ./obt-reset.sh obt"; exit 1; }
CUR="$(grep -E '^SEASON=' .env 2>/dev/null | tail -1 | cut -d= -f2)"; CUR="${CUR:-cbt}"
[ "$NEW" != "$CUR" ] || { echo "รอบตอนนี้คือ $CUR อยู่แล้ว — ใช้ชื่ออื่น"; exit 1; }
echo "จะล้างข้อมูลเกมทั้งหมด ($CUR → $NEW) · บัญชีและของที่ซื้อด้วยเงินจริงจะยังอยู่"
read -rp "พิมพ์ RESET เพื่อยืนยัน: " ok; [ "$ok" = "RESET" ] || { echo "ยกเลิก"; exit 1; }
OWNER="$(stat -c %U data 2>/dev/null || echo root)"
systemctl stop farm
TS="$(date +%Y%m%d-%H%M%S)"; tar -czf "../data-before-$NEW-$TS.tar.gz" data && echo "สำรองไว้ที่ $(cd ..; pwd)/data-before-$NEW-$TS.tar.gz"
sudo -u "$OWNER" ./backup.sh || echo "(อัปโหลดสำรองขึ้น R2 ไม่สำเร็จ — ยังมีไฟล์สำรองในเครื่อง)"
rm -f data/db.json data/db.json.tmp; rm -rf data/saves
sed -i '/^SEASON=/d' .env; echo "SEASON=$NEW" >> .env
systemctl start farm
echo "✅ เปิดรอบ $NEW แล้ว · ผู้เล่นเปิดเกมครั้งถัดไป เซฟในเครื่องจะถูกล้าง แล้วได้ของพรีเมียมที่ซื้อไว้คืน"
