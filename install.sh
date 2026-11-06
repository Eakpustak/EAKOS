#!/usr/bin/env bash
# One-shot installer for a fresh Ubuntu/Debian OCI VM (ARM or x86).
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

if ! command -v docker >/dev/null 2>&1; then
  say "Installing Docker"
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
fi
DC="docker compose"
if ! $DC version >/dev/null 2>&1; then DC="sudo docker compose"; fi
if ! docker info >/dev/null 2>&1; then DC="sudo docker compose"; fi

if [ -f .env ]; then
  say ".env already exists, keeping it"
else
  say "Configuring"
  read -rp "Domain (DNS A record must already point to this VM): " DOMAIN
  read -rp "Admin email: " ADMIN_EMAIL
  PG=$(openssl rand -hex 24)
  NA=$(openssl rand -base64 36 | tr -d '\n')
  AP=$(openssl rand -base64 18 | tr -d '/+=\n')
  cat > .env <<ENV
DOMAIN=$DOMAIN
POSTGRES_PASSWORD=$PG
NEXTAUTH_SECRET=$NA
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_NAME=Administrator
ADMIN_PASSWORD=$AP
ENV
  chmod 600 .env
  NEW_ADMIN_PASSWORD="$AP"
fi

# OCI Ubuntu images ship iptables rules that block 80/443 by default.
if command -v iptables >/dev/null 2>&1 && ! sudo iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null; then
  say "Opening ports 80/443 in the VM firewall"
  sudo iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT
  sudo iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT
  command -v netfilter-persistent >/dev/null 2>&1 && sudo netfilter-persistent save || \
    echo "Tip: apt install iptables-persistent to keep these rules after reboot."
fi

say "Building and starting (first build takes a few minutes)"
$DC up -d --build

say "Waiting for the app to become healthy"
for i in $(seq 1 60); do
  s=$($DC ps --format '{{.Health}}' app 2>/dev/null | head -n1 || true)
  [ "$s" = "healthy" ] && break
  sleep 5
done
[ "${s:-}" = "healthy" ] || { echo "App did not become healthy. Check: $DC logs app"; exit 1; }

# The first admin exists now; do not keep the bootstrap password on disk.
sed -i '/^ADMIN_PASSWORD=/d' .env

. ./.env
say "Done"
echo "URL:   https://$DOMAIN"
echo "Admin: $ADMIN_EMAIL"
[ -n "${NEW_ADMIN_PASSWORD:-}" ] && echo "Password (shown once, change it after login): $NEW_ADMIN_PASSWORD"
echo
echo "Remember: in the OCI console, allow ingress TCP 80 and 443 in the subnet's Security List / NSG."
echo "Update later with: ./update.sh"
