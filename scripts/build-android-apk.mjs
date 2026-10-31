#!/usr/bin/env node
/**
 * Builds a Capacitor Android APK → client/public/downloads/video-chat.apk
 *
 * Default = true native shell: UI is embedded in the APK (no Chrome, no address bar).
 * Backend URL is baked via VITE_SERVER_URL.
 *
 *   CAP_SERVER_URL=https://your-host yarn apk
 *   CAP_SERVER_URL=http://192.168.0.29:4000 yarn apk
 *
 * Optional CAP_REMOTE_UI=1 keeps the old mode (WebView loads the website URL).
 *
 * Needs JDK 17 + Android SDK (ANDROID_HOME).
 */
import { spawnSync } from 'child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const client = join(root, 'client')
const android = join(client, 'android')
const configPath = join(client, 'capacitor.config.json')
const outDir = join(client, 'public', 'downloads')
const apkOut = join(outDir, 'video-chat.apk')

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
  console.error('  CAP_SERVER_URL=https://example.onrender.com yarn apk')
  console.error('  CAP_SERVER_URL=http://192.168.0.29:4000 yarn apk')
  process.exit(1)
}

if (remoteUi) {
  // Old mode: WebView literally opens the website (still no Chrome chrome, but confusing).
  config.server = {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http://'),
    androidScheme: 'https'
  }
  console.log('CAP_REMOTE_UI=1 — WebView will load', serverUrl)
} else {
  // Native shell: embed dist locally. JS talks to CAP_SERVER_URL via VITE_SERVER_URL.
  // Use http scheme when API is http — https://localhost + http API = mixed-content blank UI.
  const cleartext = serverUrl.startsWith('http://')
  config.server = {
    androidScheme: cleartext ? 'http' : 'https',
    cleartext,
    hostname: 'localhost',
    allowNavigation: [
      serverUrl.replace(/^https?:\/\//, '').split('/')[0]
    ]
  }
  console.log('Embedded Capacitor shell. API →', serverUrl, `(scheme ${config.server.androidScheme})`)
}

writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)

run('yarn', ['build'], client, {
  ...process.env,
  VITE_SERVER_URL: serverUrl
})

if (!existsSync(android)) {
  run('npx', ['cap', 'add', 'android'], client)
} else {
  run('npx', ['cap', 'sync', 'android'], client)
}

if (!process.env.ANDROID_HOME && !process.env.ANDROID_SDK_ROOT) {
  const guess = join(process.env.HOME || '', 'Library/Android/sdk')
  if (existsSync(guess)) process.env.ANDROID_HOME = guess
}

// Capacitor 7 needs JDK 21.
if (!process.env.JAVA_HOME) {
  const jdk21 = join(process.env.HOME || '', '../opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home')
  const brew21 = '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home'
  if (existsSync(join(brew21, 'bin/java'))) process.env.JAVA_HOME = brew21
  else if (existsSync(join(jdk21, 'bin/java'))) process.env.JAVA_HOME = jdk21
}
if (process.env.JAVA_HOME) {
  process.env.PATH = `${join(process.env.JAVA_HOME, 'bin')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH || ''}`
  console.log('JAVA_HOME', process.env.JAVA_HOME)
}

const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'
run(gradlew, ['assembleDebug'], android)

const built = join(android, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
if (!existsSync(built)) {
  console.error('APK not found at', built)
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
copyFileSync(built, apkOut)
const distDownloads = join(client, 'dist', 'downloads')
mkdirSync(distDownloads, { recursive: true })
copyFileSync(built, join(distDownloads, 'video-chat.apk'))
console.log('\nAPK ready:', apkOut)
console.log('Install the APK, then open the Video Chat app icon — not a Chrome tab.')
console.log('Download URL: /downloads/video-chat.apk')
