import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const dir = join(dirname(fileURLToPath(import.meta.url)), '../certs')
const keyPath = join(dir, 'key.pem')
const certPath = join(dir, 'cert.pem')

export function ensureTls() {
  mkdirSync(dir, { recursive: true })
  if (!existsSync(keyPath) || !existsSync(certPath)) {
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048',
      '-keyout', keyPath,
      '-out', certPath,
      '-days', '3650',
      '-nodes',
      '-subj', '/CN=family-chat/O=FamilyChat/C=RU'
    ], { stdio: 'ignore' })
  }
  return {
    key: readFileSync(keyPath),
    cert: readFileSync(certPath)
  }
}
