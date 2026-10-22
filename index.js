const { spawn } = require('child_process')
const path = require('path')

const child = spawn(process.execPath, ['index.js'], {
  cwd: path.join(__dirname, 'server'),
  stdio: 'inherit',
  env: process.env
})

child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})

function stop(signal) {
  if (!child.killed) child.kill(signal)
}

process.on('SIGTERM', () => stop('SIGTERM'))
process.on('SIGINT', () => stop('SIGINT'))

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code == null ? 1 : code)
})
