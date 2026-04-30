import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql')

const { Client } = pg

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required to apply the schema.')
  process.exit(1)
}

function normalizeConnectionString(connectionString) {
  return connectionString.replace(/^postgresql:\/\//i, 'postgres://')
}

function getDatabaseName(connectionString) {
  const url = new URL(normalizeConnectionString(connectionString))
  const databaseName = url.pathname.replace(/^\//, '')

  if (!databaseName) {
    throw new Error('DATABASE_URL must include a database name.')
  }

  return databaseName
}

function getMaintenanceConnectionString(connectionString) {
  const url = new URL(normalizeConnectionString(connectionString))
  url.pathname = '/postgres'
  return url.toString()
}

async function ensureDatabaseExists(maintenanceConnectionString, databaseName) {
  const client = new Client({ connectionString: maintenanceConnectionString })

  try {
    await client.connect()

    const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName])

    if (result.rowCount === 0) {
      await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`)
    }
  } finally {
    await client.end().catch(() => {})
  }
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`
}

async function applySchema(databaseConnectionString) {
  const client = new Client({ connectionString: databaseConnectionString })
  const schemaSql = await readFile(schemaPath, 'utf8')

  try {
    await client.connect()
    await client.query(schemaSql)
  } finally {
    await client.end().catch(() => {})
  }
}

async function main() {
  const databaseName = getDatabaseName(process.env.DATABASE_URL)
  const maintenanceUrl = getMaintenanceConnectionString(process.env.DATABASE_URL)

  await ensureDatabaseExists(maintenanceUrl, databaseName)
  await applySchema(process.env.DATABASE_URL)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
