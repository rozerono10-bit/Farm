#!/usr/bin/env bash
# Install or update the Farm game server on a fresh Ubuntu 22.04/24.04 VPS (run as root).
#   curl -fsSL https://raw.githubusercontent.com/rozerono10-bit/farm/claude/happy-bell-5sj3qh/server/install.sh | bash
# Running it again pulls the latest code and restarts the server.
set -euo pipefail
REPO="https://github.com/rozerono10-bit/farm.git"
BRANCH="${FARM_BRANCH:-claude/happy-bell-5sj3qh}"
APP_USER=farm
APP_DIR=/home/$APP_USER/Farm
[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }

echo "== 1/6 packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -q
apt-get install -y -q git curl ufw rclone nodejs npm ca-certificates
node -v

echo "== 2/6 user + code"
id $APP_USER >/dev/null 2>&1 || useradd -m -s /bin/bash $APP_USER
if [ -d "$APP_DIR/.git" ]; then sudo -u $APP_USER git -C "$APP_DIR" fetch -q origin "$BRANCH" && sudo -u $APP_USER git -C "$APP_DIR" reset -q --hard "origin/$BRANCH"
else sudo -u $APP_USER git clone -q -b "$BRANCH" "$REPO" "$APP_DIR"; fi
cd "$APP_DIR/server"
sudo -u $APP_USER npm install --omit=dev --no-audit --no-fund -q
if [ ! -f .env ]; then sudo -u $APP_USER cp .env.example .env; chmod 600 .env; echo "   created server/.env (fill in later)"; fi

echo "== 3/6 service (runs 24/7, restarts on crash and after reboot)"
cat > /etc/systemd/system/farm.service <<UNIT
[Unit]
Description=Farm game server
After=network-online.target
Wants=network-online.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR/server
Environment=PORT=80
AmbientCapabilities=CAP_NET_BIND_SERVICE
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable -q farm
systemctl restart farm

echo "== 4/6 firewall: SSH open, web port 80 only from Cloudflare"
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null
for ip in $(curl -fsSL https://www.cloudflare.com/ips-v4) $(curl -fsSL https://www.cloudflare.com/ips-v6); do ufw allow from "$ip" to any port 80 proto tcp >/dev/null; done
ufw --force enable >/dev/null
ufw status | head -5

echo "== 5/6 daily backup to R2 (skips until R2 keys are in .env)"
( crontab -u $APP_USER -l 2>/dev/null | grep -v 'server/backup.sh' ; echo "17 4 * * * $APP_DIR/server/backup.sh >> /home/$APP_USER/backup.log 2>&1" ) | crontab -u $APP_USER -

echo "== 6/6 check"
sleep 2
if curl -fsS http://127.0.0.1/health; then echo; echo "OK — Farm server is running."; else echo "server not answering — see: journalctl -u farm -n 50"; fi
echo "Next: point play.<your-domain> to this server in Cloudflare (proxied), then edit $APP_DIR/server/.env and run: systemctl restart farm"
