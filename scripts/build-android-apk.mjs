#!/usr/bin/env node
/**
 * Builds a slim Capacitor Android APK → client/public/downloads/video-chat.apk
 *
 *   CAP_SERVER_URL=http://192.168.0.29:4000 yarn apk
 *
 * Size tricks:
 *  - never nest the APK inside itself
 *  - do not embed MediaPipe wasm (~34MB) — APK loads it from CAP_SERVER_URL
 *  - keep only app shell + UI JS/CSS
 */
import { spawnSync } from 'child_process'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const client = join(root, 'client')
const android = join(client, 'android')
const configPath = join(client, 'capacitor.config.json')
const outDir = join(client, 'public', 'downloads')
const apkOut = join(outDir, 'video-chat.apk')
const dist = join(client, 'dist')

function run(cmd, args, cwd, env = process.env) {
  console.log(`$ ${cmd} ${args.join(' ')}`)
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32'
  })
  if (res.status !== 0) process.exit(res.status || 1)
}

const serverUrl = String(process.env.CAP_SERVER_URL || '').replace(/\/$/, '')
const remoteUi = process.env.CAP_REMOTE_UI === '1'
const config = JSON.parse(readFileSync(configPath, 'utf8'))

if (!serverUrl) {
  console.error('Set CAP_SERVER_URL to your API host, e.g.')
  console.error('  CAP_SERVER_URL=http://192.168.0.29:4000 yarn apk')
  process.exit(1)
}

if (remoteUi) {
  config.server = {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http://'),
    androidScheme: 'https'
  }
  console.log('CAP_REMOTE_UI=1 — WebView will load', serverUrl)
} else {
  const cleartext = serverUrl.startsWith('http://')
  config.server = {
    androidScheme: cleartext ? 'http' : 'https',
    cleartext,
    hostname: 'localhost',
    allowNavigation: [
      serverUrl.replace(/^https?:\/\//, '').split('/')[0]
    ]
  }
  console.log('Slim embedded shell. API/wasm →', serverUrl)
}

writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)

run('yarn', ['build'], client, {
  ...process.env,
  VITE_SERVER_URL: serverUrl
})

// Slim assets copied into the APK (server dist keeps full mediapipe below).
const slimMediapipe = join(dist, 'mediapipe')
const slimDownloads = join(dist, 'downloads')
const backupMediapipe = join(client, '.apk-mediapipe-backup')
if (existsSync(slimMediapipe)) {
  rmSync(backupMediapipe, { recursive: true, force: true })
  cpSync(slimMediapipe, backupMediapipe, { recursive: true })
  rmSync(slimMediapipe, { recursive: true, force: true })
}
rmSync(slimDownloads, { recursive: true, force: true })
// Drop old broken mask PNGs if somehow still present — procedural masks need no images.
;['Mask.png', 'glasses.png', 'sunglasses.png'].forEach((name) => {
  // hashed names live in assets/; nothing to do
})

if (!existsSync(android)) {
  run('npx', ['cap', 'add', 'android'], client)
} else {
  run('npx', ['cap', 'sync', 'android'], client)
}

// Restore mediapipe into dist so the running server can still serve wasm to the APK.
if (existsSync(backupMediapipe)) {
  cpSync(backupMediapipe, slimMediapipe, { recursive: true })
  rmSync(backupMediapipe, { recursive: true, force: true })
}

if (!process.env.ANDROID_HOME && !process.env.ANDROID_SDK_ROOT) {
  const guess = join(process.env.HOME || '', 'Library/Android/sdk')
  if (existsSync(guess)) process.env.ANDROID_HOME = guess
}

if (!process.env.JAVA_HOME) {
  const brew21 = '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home'
  if (existsSync(join(brew21, 'bin/java'))) process.env.JAVA_HOME = brew21
}
if (process.env.JAVA_HOME) {
  process.env.PATH = `${join(process.env.JAVA_HOME, 'bin')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH || ''}`
  console.log('JAVA_HOME', process.env.JAVA_HOME)
}

const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'
// clean avoids stale fat APKs left from older embeds (wasm / nested apk).
run(gradlew, ['clean', 'assembleDebug'], android)

const built = join(android, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
if (!existsSync(built)) {
  console.error('APK not found at', built)
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
copyFileSync(built, apkOut)
mkdirSync(join(dist, 'downloads'), { recursive: true })
copyFileSync(built, join(dist, 'downloads', 'video-chat.apk'))

const mb = (readFileSync(apkOut).byteLength / (1024 * 1024)).toFixed(1)
console.log(`\nAPK ready: ${apkOut} (${mb} MB)`)
console.log('MediaPipe wasm is loaded from the server — keep the server running on the same Wi‑Fi.')
console.log('Download URL: /downloads/video-chat.apk')
