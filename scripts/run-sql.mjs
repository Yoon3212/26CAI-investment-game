#!/usr/bin/env node
// Runs one or more .sql files against SUPABASE_DB_URL over a single connection,
// in the order given. Used in place of `psql -v ON_ERROR_STOP=1 -f a -f b` on
// machines without a psql client installed. NOTICE messages (including
// plpgsql RAISE NOTICE) are printed as they arrive; any error aborts and
// exits non-zero, matching ON_ERROR_STOP=1 semantics.

import { readFileSync } from 'node:fs'
import pg from 'pg'

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('usage: node scripts/run-sql.mjs <file.sql> [file2.sql ...]')
  process.exit(1)
}

if (!process.env.PGHOST || !process.env.PGUSER || !process.env.PGPASSWORD) {
  console.error('PGHOST / PGUSER / PGPASSWORD are not set (see .env.example / README)')
  process.exit(1)
}

// No connectionString: pg.Client() reads PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE
// directly, which avoids URL-encoding pitfalls with special characters in passwords.
const client = new pg.Client()
client.on('notice', (msg) => console.log(`NOTICE: ${msg.message}`))

try {
  await client.connect()
  for (const file of files) {
    const sql = readFileSync(file, 'utf8')
    console.log(`-- running ${file}`)
    await client.query(sql)
  }
  console.log('OK')
} catch (err) {
  console.error(`ERROR: ${err.message}`)
  process.exitCode = 1
} finally {
  await client.end()
}
