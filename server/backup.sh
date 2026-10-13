#!/usr/bin/env bash
# Daily backup of server/data (accounts, saves, farms) to Cloudflare R2.
# Needs rclone (sudo apt install -y rclone) and these values in server/.env:
#   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT (https://<account>.r2.cloudflarestorage.com), R2_BUCKET (farm-backup)
# Run by cron every day, e.g.:  17 4 * * *  /home/farm/Farm/server/backup.sh >> /home/farm/backup.log 2>&1
# Old backups are deleted by the bucket's 30-day lifecycle rule.
set -euo pipefail
cd "$(dirname "$0")"
# read only the R2_* lines from .env (sourcing the whole file breaks on values like "Farm <login@...>")
if [ -f .env ]; then while IFS='=' read -r k v; do v="${v%$'\r'}"; v="${v#[\"\']}"; v="${v%[\"\']}"; export "$k=$v"; done < <(grep -E '^R2_[A-Z_]+=' .env); fi
if [ -z "${R2_ACCESS_KEY_ID:-}" ] || [ -z "${R2_SECRET_ACCESS_KEY:-}" ] || [ -z "${R2_ENDPOINT:-}" ] || [[ "$R2_ENDPOINT" == *xxxxxxxx* ]]; then echo "R2 keys not set in .env — backup skipped"; exit 0; fi
BUCKET="${R2_BUCKET:-farm-backup}"
export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare RCLONE_CONFIG_R2_ENDPOINT="$R2_ENDPOINT" \
       RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true

if [ "${1:-}" = "check" ]; then
  # ./backup.sh check   → test the R2 keys without uploading anything
  if rclone lsf "r2:$BUCKET/" >/dev/null; then echo "R2 OK: keys work, bucket $BUCKET has $(rclone lsf "r2:$BUCKET/" | wc -l) file(s)"; else echo "R2 FAILED: check R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ENDPOINT in .env and that the token can write to $BUCKET"; exit 1; fi
  exit 0
fi

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
rclone lsf "r2:$BUCKET/$NAME" | grep -q . || { echo "upload of $NAME not found in R2"; rm -f "/tmp/$NAME"; exit 1; }
echo "$(date -u +%FT%TZ) uploaded $NAME ($(du -h "/tmp/$NAME" | cut -f1))"
rm -f "/tmp/$NAME"
