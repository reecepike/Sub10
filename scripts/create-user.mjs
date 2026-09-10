#!/usr/bin/env node
/**
 * Creates (or resets) the login.
 *   node --env-file=.env.local scripts/create-user.mjs isaac@example.com somepassword
 */
import { randomBytes, scryptSync } from 'node:crypto';
import postgres from 'postgres';
import { requireUrl } from './connection.mjs';

const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error('\nUsage: node --env-file=.env.local scripts/create-user.mjs <email> <password>\n');
  process.exit(1);
}
if (password.length < 8) {
  console.error('\nUse a password of at least 8 characters.\n');
  process.exit(1);
}
const salt = randomBytes(16).toString('hex');
const hash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;

const { url, ssl } = requireUrl();
const sql = postgres(url, { ssl, max: 1 });

try {
  await sql`
    insert into users (email, password_hash) values (${email.toLowerCase()}, ${hash})
    on conflict (email) do update set password_hash = excluded.password_hash`;
  console.log(`Login ready for ${email}.`);
} catch (err) {
  console.error('Failed:', err.message);
  console.error('Have you run db:init yet?');
  process.exitCode = 1;
} finally {
  await sql.end();
}
