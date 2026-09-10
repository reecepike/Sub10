import postgres from 'postgres';

type Sql = ReturnType<typeof postgres>;

declare global {
  // eslint-disable-next-line no-var
  var __sql: Sql | undefined;
}

/**
 * The connection is created lazily, on first query — never at import time.
 *
 * `next build` imports every route module to read its config, and a build
 * machine has no reason to hold database credentials. Connecting (or throwing)
 * at import time turns a missing environment variable into a failed build
 * rather than a clear runtime error, which is a much worse way to find out.
 */
/**
 * Hosted Postgres providers hand you a libpq-style URL with query parameters
 * that postgres.js does not recognise — and it forwards anything unknown to the
 * server as a startup parameter, which Postgres then rejects outright. Neon
 * appends `channel_binding`, Supabase's pooler appends `pgbouncer`. Pasting
 * either string in unmodified fails with "unrecognized configuration
 * parameter". So: read the TLS mode, strip the client-side parameters, hand the
 * driver a clean URL.
 */
function parseConnection(raw: string): { url: string; ssl: 'require' | false } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    // Not a URL we can parse — pass it through and let the driver complain.
    return { url: raw, ssl: raw.includes('sslmode=disable') ? false : 'require' };
  }

  const sslmode = u.searchParams.get('sslmode');
  for (const key of ['sslmode', 'channel_binding', 'pgbouncer', 'connect_timeout', 'target_session_attrs']) {
    u.searchParams.delete(key);
  }

  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1';
  const ssl: 'require' | false =
    sslmode === 'disable' ? false : sslmode ? 'require' : local ? false : 'require';

  return { url: u.toString(), ssl };
}

function connect(): Sql {
  if (global.__sql) return global.__sql;

  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error(
      'DATABASE_URL is not set. On Vercel: Project → Settings → Environment Variables, ' +
        'ticked for Production, Preview and Development. ' +
        'Locally: copy .env.example to .env.local and fill it in.',
    );
  }

  const { url, ssl } = parseConnection(raw);

  const client = postgres(url, {
    ssl,
    max: 3,
    idle_timeout: 20,
  });

  global.__sql = client;
  return client;
}

/**
 * Behaves exactly like the postgres.js client — `sql`select …`` and
 * `sql.unsafe(…)` both work — but nothing connects until the first call.
 */
export const sql = new Proxy((() => {}) as unknown as Sql, {
  apply(_target, _thisArg, args: unknown[]) {
    return (connect() as unknown as (...a: unknown[]) => unknown)(...args);
  },
  get(_target, prop: string | symbol) {
    const client = connect() as unknown as Record<string | symbol, unknown>;
    const value = client[prop];
    return typeof value === 'function'
      ? (value as (...a: unknown[]) => unknown).bind(client)
      : value;
  },
}) as Sql;

/* ------------------------------------------------------------------ types */

export type Settings = {
  id: number;
  athlete_name: string;
  race_date: string;      // ISO date of the A race
  start_date: string;     // ISO date of programme week 1, Monday
  weight_kg: number;
  ftp: number | null;
  css_sec: number | null;         // seconds per 100 m
  five_k_sec: number | null;      // seconds
  lthr_run: number | null;
  lthr_bike: number | null;
  bench_5rm: number | null;
  aero_bars: boolean;
  transitions_rehearsed: boolean;
  badminton_fri: boolean;
  badminton_sun: boolean;
  updated_at: string;
};

export type Readiness = {
  day: string;
  sleep_h: number | null;
  sleep_q: number | null;
  rhr: number | null;
  hrv: number | null;
  weight_kg: number | null;
  fatigue: number | null;
  soreness: number | null;
  stress: number | null;
  motivation: number | null;
  illness: boolean;
  pain: string | null;
  notes: string | null;
  score: number | null;
  band: 'green' | 'amber' | 'red' | null;
};

export type SessionRow = {
  id: number;
  day: string;
  discipline: 'SW' | 'BK' | 'RN' | 'ST' | 'OT' | 'BR';
  plan_key: string | null;
  title: string | null;
  duration_min: number | null;
  distance: number | null;
  rpe: number | null;
  avg_hr: number | null;
  avg_power: number | null;
  np: number | null;
  cadence: number | null;
  avg_pace_sec: number | null;
  stroke_count: number | null;
  hr_drift: number | null;
  carbs_per_h: number | null;
  niggle: string | null;
  notes: string | null;
  completed: boolean;
  created_at: string;
};

/* ------------------------------------------------------------- accessors */

/**
 * Every date in this app is a calendar day, never an instant. The driver hands
 * DATE columns back as Date objects, which reintroduces a timezone the data has
 * not got — and that is how you end up prescribing Tuesday's session on Monday.
 * Normalise to 'YYYY-MM-DD' on the way out, once, here.
 */
function dstr(v: unknown): string {
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  return String(v ?? '').slice(0, 10);
}

export async function getSettings(): Promise<Settings> {
  const rows = await sql<Settings[]>`select * from settings where id = 1`;
  if (!rows[0]) throw new Error('Settings row missing. Run the setup script: scripts/init-db.mjs');
  const s = rows[0];
  return { ...s, race_date: dstr(s.race_date), start_date: dstr(s.start_date) };
}

export async function getReadiness(day: string): Promise<Readiness | null> {
  const rows = await sql<Readiness[]>`select * from readiness where day = ${day}`;
  return rows[0] ? { ...rows[0], day: dstr(rows[0].day) } : null;
}

/** Most recent N readiness rows on or before `day`, newest first. */
export async function recentReadiness(day: string, n = 21): Promise<Readiness[]> {
  const rows = await sql<Readiness[]>`
    select * from readiness where day <= ${day} order by day desc limit ${n}`;
  return rows.map((r) => ({ ...r, day: dstr(r.day) }));
}

export async function sessionsBetween(from: string, to: string): Promise<SessionRow[]> {
  const rows = await sql<SessionRow[]>`
    select * from sessions where day >= ${from} and day <= ${to} order by day asc, id asc`;
  return rows.map((r) => ({ ...r, day: dstr(r.day) }));
}

export async function sessionsOn(day: string): Promise<SessionRow[]> {
  const rows = await sql<SessionRow[]>`select * from sessions where day = ${day} order by id asc`;
  return rows.map((r) => ({ ...r, day: dstr(r.day) }));
}
