import { spawnSync } from 'node:child_process'
import dotenv from 'dotenv'

dotenv.config()

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required to apply the schema.')
  process.exit(1)
}

const result = spawnSync('psql', [process.env.DATABASE_URL, '-f', 'db/schema.sql'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

process.exit(result.status ?? 1)
