#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Family Chat · one-command start"
echo ""

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Need $1 installed (Node.js 18+)."
    exit 1
  }
}

need_cmd node
need_cmd npm

if ! command -v yarn >/dev/null 2>&1; then
  echo "==> Installing yarn…"
  npm i -g yarn
fi

echo "==> Installing root…"
yarn install --silent 2>/dev/null || yarn install

echo "==> Installing server…"
yarn --cwd server install --silent 2>/dev/null || yarn --cwd server install

echo "==> Installing client…"
yarn --cwd client install --silent 2>/dev/null || yarn --cwd client install

# MediaPipe may live at root from earlier installs — ensure client has it
if [ ! -d client/node_modules/@mediapipe/tasks-vision ]; then
  if [ -d node_modules/@mediapipe/tasks-vision ]; then
    mkdir -p client/node_modules/@mediapipe
    cp -R node_modules/@mediapipe/tasks-vision client/node_modules/@mediapipe/
  else
    yarn --cwd client add @mediapipe/tasks-vision@1.0.1 || true
  fi
fi

echo "==> Building client…"
yarn --cwd client build

echo ""
echo "==> Starting server (Ctrl+C to stop)"
echo ""
exec yarn --cwd server start
