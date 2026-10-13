#!/usr/bin/env bash
# Daily backup of server/data (accounts, saves, farms) to Cloudflare R2.
# Needs rclone (sudo apt install -y rclone) and these values in server/.env:
#   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT (https://<account>.r2.cloudflarestorage.com), R2_BUCKET (farm-backup)
# Run by cron every day, e.g.:  17 4 * * *  /home/farm/Farm/server/backup.sh >> /home/farm/backup.log 2>&1
# Old backups are deleted by the bucket's 30-day lifecycle rule.
set -euo pipefail
cd "$(dirname "$0")"
set -a; [ -f .env ] && . ./.env; set +a
: "${R2_ACCESS_KEY_ID:?missing in .env}" "${R2_SECRET_ACCESS_KEY:?missing in .env}" "${R2_ENDPOINT:?missing in .env}"
BUCKET="${R2_BUCKET:-farm-backup}"
export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare RCLONE_CONFIG_R2_ENDPOINT="$R2_ENDPOINT" \
       RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true

if [ "${1:-}" = "restore" ]; then
  # ./backup.sh restore                 → list backups
  # ./backup.sh restore <file.tar.gz>   → stop the server first, then restore that backup into data/
  if [ -z "${2:-}" ]; then rclone lsl "r2:$BUCKET/"; exit 0; fi
  rclone copyto "r2:$BUCKET/$2" "/tmp/$2"
  [ -d data ] && mv data "data.before-restore.$(date +%Y%m%d-%H%M%S)"
  tar -xzf "/tmp/$2" && rm -f "/tmp/$2" && echo "restored $2 into data/ — start the server again"
  exit 0
fi

[ -d data ] || { echo "no data/ folder yet"; exit 0; }
NAME="farm-$(date -u +%Y%m%d-%H%M%S).tar.gz"
tar -czf "/tmp/$NAME" data
rclone copyto "/tmp/$NAME" "r2:$BUCKET/$NAME"
echo "$(date -u +%FT%TZ) uploaded $NAME ($(du -h "/tmp/$NAME" | cut -f1))"
rm -f "/tmp/$NAME"
