#!/usr/bin/env bash
# One-command restart: kill old chat+tunnel, start in background, print HTTPS URL.
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-4000}"

fuser -k "${PORT}/tcp" 2>/dev/null || true
pkill -f "cloudflared tunnel --url https://127.0.0.1:${PORT}" 2>/dev/null || true
# only our node server in this folder
pkill -f "node index.js" 2>/dev/null || true
sleep 1

rm -f public-url.txt chat.url tunnel.pid server.pid
: > chat.log
: > tunnel.log

nohup ./start.sh >> chat.log 2>&1 &
echo "==> starting… (build + tunnel, ~30–90s)"

for _ in $(seq 1 90); do
  if [ -f public-url.txt ]; then
    U="$(tr -d '\n' < public-url.txt)"
    echo ""
    echo "READY → ${U}/"
    echo "Family → ${U}/family?invite=$(grep -E '^INVITE=' server/.env 2>/dev/null | cut -d= -f2- || true)"
    exit 0
  fi
  U="$(grep -Eo 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' chat.log tunnel.log 2>/dev/null | tail -1 || true)"
  if [ -n "$U" ]; then
    echo "$U" > public-url.txt
    echo ""
    echo "READY → ${U}/"
    exit 0
  fi
  sleep 2
done

echo "FAIL — no trycloudflare URL. Last log:"
tail -50 chat.log
exit 1
