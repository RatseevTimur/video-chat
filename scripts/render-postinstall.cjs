const { spawnSync } = require('child_process')
const path = require('path')

// Render's default Node service runs `yarn install` in the repo root and
// never calls `yarn build`. Build the client and install the server here.
if (process.env.RENDER !== 'true') process.exit(0)

const root = path.join(__dirname, '..')

function run(args, env) {
  const result = spawnSync('yarn', args, { cwd: root, stdio: 'inherit', env })
  if (result.error) {
    console.error(result.error)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const devEnv = { ...process.env, NODE_ENV: 'development' }
delete devEnv.YARN_PRODUCTION
delete devEnv.NPM_CONFIG_PRODUCTION

console.log('==> Installing and building the client')
run(['--cwd', 'client', 'install', '--frozen-lockfile', '--production=false'], devEnv)
run(['--cwd', 'client', 'build'], { ...process.env, NODE_ENV: 'production' })

console.log('==> Installing the server')
run(['--cwd', 'server', 'install', '--frozen-lockfile', '--production=true'], {
  ...process.env,
  NODE_ENV: 'production'
})
