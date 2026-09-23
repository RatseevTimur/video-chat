#!/usr/bin/env bash
# Family Chat — one-command bootstrap for a clean VPS
# Works on Ubuntu/Debian (apt). No .env required.
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Family Chat · one-command start"
echo ""

have() { command -v "$1" >/dev/null 2>&1; }

as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif have sudo; then
    sudo "$@"
  else
    echo "Need root or sudo to install packages."
    echo "Нужен root или sudo для установки пакетов."
    exit 1
  fi
}

ensure_apt_tools() {
  if ! have apt-get; then
    echo "This auto-installer supports Ubuntu/Debian (apt)."
    echo "Install Node.js 18+ manually, then re-run ./start.sh"
    exit 1
  fi
  export DEBIAN_FRONTEND=noninteractive
  as_root apt-get update -y
  as_root apt-get install -y curl ca-certificates gnupg
}

ensure_node() {
  if have node && have npm; then
    local major
    major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
    if [ "$major" -ge 18 ]; then
      echo "==> Node $(node -v) OK"
      return
    fi
    echo "==> Node $(node -v) is too old — installing Node 20…"
  else
    echo "==> Installing Node.js 20…"
  fi

  ensure_apt_tools
  # NodeSource Node 20
  curl -fsSL https://deb.nodesource.com/setup_20.x | as_root bash -
  as_root apt-get install -y nodejs

  if ! have node || ! have npm; then
    echo "Node install failed."
    exit 1
  fi
  echo "==> Node $(node -v) / npm $(npm -v)"
}

ensure_yarn() {
  if have yarn; then
    echo "==> Yarn $(yarn -v) OK"
    return
  fi
  echo "==> Installing yarn…"
  as_root npm i -g yarn
}

ensure_node
ensure_yarn

echo "==> Installing root…"
yarn install --silent 2>/dev/null || yarn install

echo "==> Installing server…"
yarn --cwd server install --silent 2>/dev/null || yarn --cwd server install

echo "==> Installing client…"
yarn --cwd client install --silent 2>/dev/null || yarn --cwd client install

if [ ! -d client/node_modules/@mediapipe/tasks-vision ]; then
  if [ -d node_modules/@mediapipe/tasks-vision ]; then
    mkdir -p client/node_modules/@mediapipe
    cp -R node_modules/@mediapipe/tasks-vision client/node_modules/@mediapipe/
  else
    echo "==> Installing @mediapipe/tasks-vision…"
    yarn --cwd client add @mediapipe/tasks-vision@1.0.1 || true
  fi
fi

echo "==> Building client…"
yarn --cwd client build

# Open firewall if ufw exists (best-effort)
if have ufw && as_root ufw status 2>/dev/null | grep -qi active; then
  echo "==> Allowing port 4000/tcp (ufw)…"
  as_root ufw allow 4000/tcp || true
fi

PORT="${PORT:-4000}"
echo ""
echo "==> Starting on 0.0.0.0:${PORT} (Ctrl+C to stop)"
echo "    Keep this SSH session open, or use: nohup ./start.sh &"
echo ""
export PORT
exec yarn --cwd server start
