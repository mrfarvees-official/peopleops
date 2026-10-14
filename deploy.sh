#!/usr/bin/env bash
# Deploy PeopleOps with PM2: pull from git, stop the running process, build, start.
#   ./deploy.sh              # deploy the current branch
#   BRANCH=main ./deploy.sh  # deploy a specific branch
# Nginx config lives in deploy/nginx.conf (see the install steps at its top).
set -euo pipefail

APP_NAME="${APP_NAME:-peopleops}"
BRANCH="${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
PORT="${PORT:-3003}"
DOMAIN="${DOMAIN:-peopleops.farvees.xyz}"
CERT_EMAIL="${CERT_EMAIL:-saroathfarvees@gmail.com}"
cd "$(dirname "$0")"

[ -f .env ] || { echo "Missing .env (copy .env.example and fill it in)"; exit 1; }
command -v pm2 >/dev/null || { echo "pm2 not found: npm i -g pm2"; exit 1; }

echo "==> Pulling $BRANCH"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "==> Stopping existing PM2 process"
pm2 delete "$APP_NAME" 2>/dev/null || true

echo "==> Installing dependencies"
npm ci

echo "==> Applying database migrations"
npx prisma migrate deploy --config prisma7.config.ts

echo "==> Building"
npm run build

echo "==> Starting with PM2"
NODE_ENV=production PORT="$PORT" HOSTNAME=127.0.0.1 \
  pm2 start npm --name "$APP_NAME" --update-env -- start
pm2 save

echo "==> Nginx + HTTPS for $DOMAIN"
SITE=/etc/nginx/sites-available/peopleops
sudo mkdir -p /var/www/certbot
sudo ln -sf "$SITE" /etc/nginx/sites-enabled/peopleops
if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  echo "    No certificate yet: requesting one"
  sudo cp deploy/nginx-bootstrap.conf "$SITE"
  sudo nginx -t
  sudo systemctl reload nginx
  sudo certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" -m "$CERT_EMAIL" \
    --agree-tos --no-eff-email --non-interactive
fi
sudo cp deploy/nginx.conf "$SITE"
sudo nginx -t
sudo systemctl reload nginx

echo "==> Done. App on 127.0.0.1:$PORT (https://$DOMAIN)"
