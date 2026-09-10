import postgres from 'postgres';

declare global {
  // eslint-disable-next-line no-var
  var __sql: ReturnType<typeof postgres> | undefined;
}

if (!process.env.DATABASE_URL) {
  // Fail loudly at import time rather than with a confusing error deep in a query.
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
}

export const sql =
  global.__sql ??
  postgres(process.env.DATABASE_URL, {
    ssl: process.env.DATABASE_URL.includes('sslmode=disable') ? false : 'require',
    max: 3,
    idle_timeout: 20,
  });

if (process.env.NODE_ENV !== 'production') global.__sql = sql;

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
  if (!rows[0]) throw new Error('Settings row missing. Run: npm run db:init');
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
