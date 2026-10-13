#!/usr/bin/env bash
# 🔄 อัปเดตเกมจาก GitHub แล้วรีสตาร์ตเซิร์ฟเวอร์ทุกครั้ง:  sudo /home/farm/Farm/server/update.sh
#   ผู้เล่นที่เปิดเกมอยู่จะต่อใหม่เอง แล้วเกมโหลดเวอร์ชันใหม่ให้อัตโนมัติ (เซฟก่อนโหลด)
set -euo pipefail
# รันจากสำเนาชั่วคราว: git pull อาจเขียนทับไฟล์นี้ระหว่างที่ bash กำลังอ่าน
if [ -z "${FARM_UPD_DIR:-}" ]; then T="$(mktemp /tmp/farm-update.XXXXXX)"; cp "$0" "$T"; FARM_UPD_DIR="$(cd "$(dirname "$0")/.." && pwd)" exec bash "$T" "$@"; fi
trap 'rm -f "$0"' EXIT
cd "$FARM_UPD_DIR"
OWNER="$(stat -c %U .)"
BR="$(sudo -u "$OWNER" git rev-parse --abbrev-ref HEAD)"
OLD="$(sudo -u "$OWNER" git rev-parse HEAD)"
sudo -u "$OWNER" git pull --ff-only origin "$BR"
NEW="$(sudo -u "$OWNER" git rev-parse HEAD)"
if [ "$OLD" != "$NEW" ] && sudo -u "$OWNER" git diff --name-only "$OLD" "$NEW" | grep -q '^server/package'; then
  echo "== package.json เปลี่ยน → npm install"; (cd server && sudo -u "$OWNER" npm install --omit=dev --no-audit --no-fund)
fi
systemctl restart farm
sleep 2
systemctl is-active --quiet farm && echo "✅ เซิร์ฟเวอร์รีสตาร์ตแล้ว · $(sudo -u "$OWNER" git log --oneline -1)" || { echo "❌ เซิร์ฟเวอร์ไม่ทำงาน — ดู: journalctl -u farm -n 30 --no-pager"; exit 1; }
