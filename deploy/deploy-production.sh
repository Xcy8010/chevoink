#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/opt/chevoink"
RELEASE_ROOT="$APP_ROOT/app"
CURRENT_RELEASE="$RELEASE_ROOT/current"
SHARED_ENV="$APP_ROOT/shared/app.env"
WEB_ROOT="/var/www/chevoink/current"

mkdir -p "$CURRENT_RELEASE" "$WEB_ROOT"

if [[ ! -f "$SHARED_ENV" ]]; then
  echo "[chevoink] missing shared env: $SHARED_ENV" >&2
  exit 1
fi

ln -sfn "$SHARED_ENV" "$CURRENT_RELEASE/.env"

cd "$CURRENT_RELEASE"
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build:client

if [[ -f "ecosystem.config.cjs" ]]; then
  pm2 startOrReload ecosystem.config.cjs --update-env
  pm2 save
fi

rm -rf "$WEB_ROOT"/*
cp -R dist/. "$WEB_ROOT"/

if [[ -f "deploy/nginx.chevoink.conf" ]]; then
  # 配置文件不存在或内容有变更时自动刷新，无需手动设置 CHEVOINK_REFRESH_NGINX
  if [[ ! -f /etc/nginx/sites-available/chevoink.conf ]] || ! cmp -s deploy/nginx.chevoink.conf /etc/nginx/sites-available/chevoink.conf || [[ "${CHEVOINK_REFRESH_NGINX:-0}" == "1" ]]; then
    sudo cp deploy/nginx.chevoink.conf /etc/nginx/sites-available/chevoink.conf
    sudo ln -sfn /etc/nginx/sites-available/chevoink.conf /etc/nginx/sites-enabled/chevoink.conf
    sudo rm -f /etc/nginx/sites-enabled/default
  fi

  sudo nginx -t
  sudo systemctl reload nginx
fi

echo "[chevoink] deployment finished"
