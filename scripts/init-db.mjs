#!/usr/bin/env node
/**
 * Creates every table and the single settings row.
 * Run once after setting DATABASE_URL:   npm run db:init
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { requireUrl } from './connection.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const { url, ssl } = requireUrl();

// `create table if not exists` emits a NOTICE per existing table on a re-run.
// That is expected, not a problem — keep the output for anything else.
const sql = postgres(url, {
  ssl,
  max: 1,
  onnotice: (n) => { if (n.code !== '42P07') console.warn(n.message); },
});

const schema = readFileSync(join(here, '..', 'lib', 'schema.sql'), 'utf8');

try {
  await sql.unsafe(schema);
  console.log('Database ready — tables created.');
  console.log('Now create the login:');
  console.log('  node --env-file=.env.local scripts/create-user.mjs <email> <password>');
} catch (err) {
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
