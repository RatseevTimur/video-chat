#!/usr/bin/env bash
# Family Chat — one-command bootstrap
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Family Chat · one-command start"
echo ""

have() { command -v "$1" >/dev/null 2>&1; }

as_root() {
  if [ "$(id -u)" -eq 0 ]; then "$@"
  elif have sudo; then sudo "$@"
  else echo "Need root or sudo"; exit 1
  fi
}

ensure_apt_tools() {
  if ! have apt-get; then echo "Need apt (Ubuntu/Debian)"; exit 1; fi
  export DEBIAN_FRONTEND=noninteractive
  as_root apt-get update -y
  as_root apt-get install -y curl ca-certificates gnupg openssl
}

ensure_node() {
  if have node && have npm; then
    local major; major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
    if [ "$major" -ge 18 ]; then echo "==> Node $(node -v) OK"; return; fi
  fi
  echo "==> Installing Node.js 20…"
  ensure_apt_tools
  curl -fsSL https://deb.nodesource.com/setup_20.x | as_root bash -
  as_root apt-get install -y nodejs
}

ensure_yarn() {
  have yarn && return
  as_root npm i -g yarn
}

ensure_cloudflared() {
  have cloudflared && return
  [ -x "./bin/cloudflared" ] && return
  echo "==> Downloading cloudflared…"
  mkdir -p bin
  local arch url
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64) url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64" ;;
    aarch64|arm64) url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64" ;;
    *) return ;;
  esac
  curl -fsSL -o bin/cloudflared "$url" && chmod +x bin/cloudflared || true
}

cf() {
  if have cloudflared; then command -v cloudflared
  elif [ -x ./bin/cloudflared ]; then echo ./bin/cloudflared
  else echo ""; fi
}

ensure_node
ensure_yarn
have openssl || ensure_apt_tools

yarn install --silent 2>/dev/null || yarn install
yarn --cwd server install --silent 2>/dev/null || yarn --cwd server install
yarn --cwd client install --silent 2>/dev/null || yarn --cwd client install

if [ ! -d client/node_modules/@mediapipe/tasks-vision ]; then
  yarn --cwd client add @mediapipe/tasks-vision@1.0.1 || true
fi

if have ufw && as_root ufw status 2>/dev/null | grep -qi active; then
  as_root ufw allow 4000/tcp || true
fi

PORT="${PORT:-4000}"
INVITE="${INVITE:-$(openssl rand -hex 6)}"

# Load optional secrets (never committed)
if [ -f server/.env ]; then
  set -a
  # shellcheck disable=SC1091
  . server/.env
  set +a
fi
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . .env
  set +a
fi

export PORT INVITE
[ -n "${MAIL_URL:-}" ] && export MAIL_URL
[ -n "${MAIL_STORE:-}" ] && export MAIL_STORE
[ -n "${SMTP_FROM:-}" ] && export SMTP_FROM
[ -n "${OPEN_ROOM:-}" ] && export OPEN_ROOM

if [ "${TUNNEL:-1}" = "1" ]; then ensure_cloudflared; fi

echo ""
echo "==> FREE MEET MODE (no email) — rebuild client"
rm -rf client/dist
yarn --cwd client build

# Survive SSH disconnect even without nohup
trap '' HUP

echo "==> Starting server (node, not yarn — yarn exits and used to kill the tunnel)"
(
  cd server
  exec node index.js
) &
SERVER_PID=$!

TUNNEL_PID=""
cleanup() {
  [ -n "${TUNNEL_PID:-}" ] && kill "$TUNNEL_PID" 2>/dev/null || true
  kill "$SERVER_PID" 2>/dev/null || true
  # orphaned children from restart loop
  pkill -f "cloudflared tunnel --url https://127.0.0.1:${PORT}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Wait until HTTPS answers (self-signed ok)
for _ in $(seq 1 40); do
  curl -sk "https://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1 && break
  sleep 0.25
done

publish_url() {
  local PUBLIC="$1"
  printf '%s\n' "$PUBLIC" > public-url.txt
  curl -sk -X POST "https://127.0.0.1:${PORT}/api/runtime/public-url" \
    -H 'Content-Type: application/json' \
    -d "{\"invite\":\"${INVITE}\",\"url\":\"${PUBLIC}\"}" >/dev/null 2>&1 || true
  OPEN_ROOM="${OPEN_ROOM:-$(openssl rand -hex 4)}"
  {
    echo ""
    echo "════════════════════════════════════════════════════════"
    echo "  СВОБОДНЫЙ РЕЖИМ — откройте и создайте ссылку:"
    echo "  → ${PUBLIC}/"
    echo ""
    echo "  Или сразу общая комната (все по одной ссылке):"
    echo "  → ${PUBLIC}/room/${OPEN_ROOM}"
    echo ""
    echo "  Family (email OTP, optional):"
    echo "  → ${PUBLIC}/family?invite=${INVITE}"
    echo "════════════════════════════════════════════════════════"
    echo ""
  } | tee -a chat.url
}

BIN="$(cf)"
if [ -n "$BIN" ] && [ "${TUNNEL:-1}" = "1" ]; then
  LOG="$(pwd)/tunnel.log"
  : >"$LOG"
  # Keep tunnel alive: if cloudflared dies, URL dies (NXDOMAIN)
  (
    while kill -0 "$SERVER_PID" 2>/dev/null; do
      "$BIN" tunnel --url "https://127.0.0.1:${PORT}" --no-tls-verify >>"$LOG" 2>&1 &
      CF_PID=$!
      echo "$CF_PID" > tunnel.pid
      # wait for hostname once per process
      for _ in $(seq 1 60); do
        PUBLIC="$(grep -Eo 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$LOG" | tail -1 || true)"
        if [ -n "$PUBLIC" ]; then
          # only announce when URL changes
          if [ ! -f public-url.txt ] || [ "$(cat public-url.txt 2>/dev/null)" != "$PUBLIC" ]; then
            publish_url "$PUBLIC"
          fi
          break
        fi
        kill -0 "$CF_PID" 2>/dev/null || break
        sleep 0.5
      done
      wait "$CF_PID" 2>/dev/null || true
      rm -f tunnel.pid
      kill -0 "$SERVER_PID" 2>/dev/null || break
      echo "==> cloudflared exited — restarting tunnel in 2s…"
      sleep 2
      : >"$LOG"
    done
  ) &
  TUNNEL_PID=$!
fi

wait "$SERVER_PID"
