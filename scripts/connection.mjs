/**
 * Shared connection-string handling for the setup scripts.
 *
 * Hosted providers hand you a libpq-style URL carrying query parameters that
 * postgres.js does not recognise — and it forwards anything unknown to the
 * server as a startup parameter, which Postgres rejects. Neon appends
 * `channel_binding`, Supabase's pooler appends `pgbouncer`. Pasting either
 * string in unmodified fails with `unrecognized configuration parameter`.
 */
export function parseConnection(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return { url: raw, ssl: raw.includes('sslmode=disable') ? false : 'require' };
  }

  const sslmode = u.searchParams.get('sslmode');
  for (const key of ['sslmode', 'channel_binding', 'pgbouncer', 'connect_timeout', 'target_session_attrs']) {
    u.searchParams.delete(key);
  }

  const local = ['localhost', '127.0.0.1', '::1'].includes(u.hostname);
  const ssl = sslmode === 'disable' ? false : sslmode ? 'require' : local ? false : 'require';

  return { url: u.toString(), ssl };
}

export function requireUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.error('\nDATABASE_URL is not set.\n');
    console.error('Copy .env.example to .env.local, paste your Neon connection string in, then run:');
    console.error('  node --env-file=.env.local scripts/init-db.mjs\n');
    process.exit(1);
  }
  return parseConnection(raw);
}
