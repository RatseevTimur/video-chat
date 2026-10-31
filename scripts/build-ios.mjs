#!/usr/bin/env node
/**
 * iOS shell (Capacitor + SPM, no CocoaPods).
 *
 *   CAP_SERVER_URL=http://192.168.0.29:4000 yarn ios          # sync + open Xcode
 *   CAP_SERVER_URL=http://192.168.0.29:4000 yarn ios --sim    # also build & run in Simulator
 *
 * Installing on a real iPhone requires signing in Xcode (free Apple ID works for 7-day builds).
 */
import { spawnSync } from 'child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const client = join(root, 'client')
const ios = join(client, 'ios')
const configPath = join(client, 'capacitor.config.json')
const appDist = join(client, 'dist-app')

function run(cmd, args, cwd, env = process.env) {
  console.log(`$ ${cmd} ${args.join(' ')}`)
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', env })
  if (res.status !== 0) process.exit(res.status || 1)
}

const serverUrl = String(process.env.CAP_SERVER_URL || '').replace(/\/$/, '')
if (!serverUrl) {
  console.error('Set CAP_SERVER_URL, e.g. CAP_SERVER_URL=http://192.168.0.29:4000 yarn ios')
  process.exit(1)
}

const config = JSON.parse(readFileSync(configPath, 'utf8'))
config.server = {
  ...(config.server || {}),
  iosScheme: 'capacitor',
  hostname: 'localhost',
  allowNavigation: [serverUrl.replace(/^https?:\/\//, '').split('/')[0]]
}
// App bundle bakes VITE_SERVER_URL → separate out dir, web `dist` stays origin-relative.
config.webDir = 'dist-app'
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)

rmSync(appDist, { recursive: true, force: true })
run('yarn', ['build', '--outDir', 'dist-app', '--emptyOutDir'], client, { ...process.env, VITE_SERVER_URL: serverUrl })
// Slim: wasm + apk are served by the server, not bundled into the app.
rmSync(join(appDist, 'mediapipe'), { recursive: true, force: true })
rmSync(join(appDist, 'models'), { recursive: true, force: true })
rmSync(join(appDist, 'downloads'), { recursive: true, force: true })

try {
  if (!existsSync(ios)) run('npx', ['cap', 'add', 'ios', '--packagemanager', 'SPM'], client)
  run('npx', ['cap', 'sync', 'ios'], client)
} finally {
  config.webDir = 'dist'
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
}

if (process.argv.includes('--sim')) {
  run('xcodebuild', [
    '-project', 'App.xcodeproj',
    '-scheme', 'App',
    '-destination', 'generic/platform=iOS Simulator',
    '-configuration', 'Debug',
    'build'
  ], join(ios, 'App'))
}

run('npx', ['cap', 'open', 'ios'], client)
