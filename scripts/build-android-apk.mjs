#!/usr/bin/env node
/**
 * Builds a debug APK → client/public/downloads/video-chat.apk
 *
 *   CAP_SERVER_URL=https://your-host node scripts/build-android-apk.mjs
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

function run(cmd, args, cwd) {
  console.log(`$ ${cmd} ${args.join(' ')}`)
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32'
  })
  if (res.status !== 0) process.exit(res.status || 1)
}

const serverUrl = String(process.env.CAP_SERVER_URL || '').replace(/\/$/, '')
const config = JSON.parse(readFileSync(configPath, 'utf8'))
if (serverUrl) {
  config.server = {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http://'),
    androidScheme: 'https'
  }
  console.log('WebView will load', serverUrl)
} else {
  config.server = { androidScheme: 'https', cleartext: false }
  console.warn('No CAP_SERVER_URL — APK embeds local dist (rebuild to update UI).')
}
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)

run('yarn', ['build'], client)

if (!existsSync(android)) {
  run('npx', ['cap', 'add', 'android'], client)
} else {
  run('npx', ['cap', 'sync', 'android'], client)
}

if (!process.env.ANDROID_HOME && !process.env.ANDROID_SDK_ROOT) {
  const guess = join(process.env.HOME || '', 'Library/Android/sdk')
  if (existsSync(guess)) process.env.ANDROID_HOME = guess
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
// Also into dist so a just-built server can serve it without another vite build.
const distDownloads = join(client, 'dist', 'downloads')
mkdirSync(distDownloads, { recursive: true })
copyFileSync(built, join(distDownloads, 'video-chat.apk'))
console.log('\nAPK ready:', apkOut)
console.log('Download URL: /downloads/video-chat.apk')
