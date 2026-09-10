#!/usr/bin/env node
/**
 * Creates every table and the single settings row.
 * Run once after setting DATABASE_URL:   npm run db:init
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const here = dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  console.error('\nDATABASE_URL is not set.');
  console.error('Copy .env.example to .env.local, fill it in, then run:');
  console.error('  node --env-file=.env.local scripts/init-db.mjs\n');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, {
  ssl: process.env.DATABASE_URL.includes('sslmode=disable') ? false : 'require',
  max: 1,
});

const schema = readFileSync(join(here, '..', 'lib', 'schema.sql'), 'utf8');

try {
  await sql.unsafe(schema);
  console.log('Database ready.');
  console.log('Now create the login:  node --env-file=.env.local scripts/create-user.mjs <email> <password>');
} catch (err) {
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
