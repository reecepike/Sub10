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

  /* --- added by the nutrition engine -------------------------------- */
  height_cm: number;
  age_years: number;
  sex: 'male' | 'female';
  body_fat_pct: number | null;
  /** 25 m. Explicit, so nothing in the app can assume otherwise again. */
  pool_length_m: number;
  budget_gbp: number;
  /** Multiplier on resting metabolism for a day with NO training in it. */
  neat_pal: number;
  /** Standing calorie adjustment from the weekly weight trend. */
  kcal_adjust: number;
  sleep_mode: 'subjective' | 'objective';
  /** Grams of carbohydrate an hour the gut currently handles. */
  carb_tolerance: number;
  meals_per_day: number;
  wake_time: string;
  bed_time: string;
  am_time: string;
  pm_time: string;
  eve_time: string;

  /* --- added by the two-house / no-pre-work rebuild ------------------ */
  /**
   * False by default, and deliberately so. He cannot train before work on a
   * normal weekday; a plan that schedules a 06:30 threshold run on a Tuesday is
   * not ambitious, it is fiction, and every session it invents makes the whole
   * plan easier to ignore. Set it true only if that genuinely changes.
   */
  allow_pre_work: boolean;
  /** Workdays, as day-of-week numbers with Monday = 1. */
  work_days: string;
  work_start: string;
  work_end: string;
  /** Saturday handover to Dad's, and Tuesday handover to Mum's. */
  sat_handover: string;
  tue_handover: string;
  dad_label: string;
  mum_label: string;
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
  return {
    ...s,
    race_date: dstr(s.race_date),
    start_date: dstr(s.start_date),
    weight_kg: Number(s.weight_kg),
    height_cm: Number(s.height_cm ?? 177),
    age_years: Number(s.age_years ?? 18),
    body_fat_pct: s.body_fat_pct == null ? null : Number(s.body_fat_pct),
    pool_length_m: Number(s.pool_length_m ?? 25),
    budget_gbp: Number(s.budget_gbp ?? 60),
    neat_pal: Number(s.neat_pal ?? 1.40),
    kcal_adjust: Number(s.kcal_adjust ?? 0),
    carb_tolerance: Number(s.carb_tolerance ?? 45),
    meals_per_day: Number(s.meals_per_day ?? 3),
    allow_pre_work: s.allow_pre_work === true,
    work_days: s.work_days ?? '1,2,3,4,5',
    work_start: s.work_start ?? '08:30',
    work_end: s.work_end ?? '17:00',
    sat_handover: s.sat_handover ?? '16:00',
    tue_handover: s.tue_handover ?? '18:00',
    dad_label: s.dad_label ?? "Dad's",
    mum_label: s.mum_label ?? "Mum's",
  };
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

/* ==================================================================
   NUTRITION ACCESSORS
   These read the same tables the training engine writes to wherever
   they can; nothing about a session is stored twice.
   ================================================================== */

export type OtherActivityRow = {
  id: number;
  day: string;
  activity: string;
  duration_min: number;
  rpe: number | null;
  factor: number;
  next_day: string | null;
};

export type CheckIn = {
  day: string;
  weight_kg: number | null;
  energy: string | null;
  hunger: string | null;
  body: string | null;
  session_feel: string | null;
  bowel: string | null;
  digestion: string | null;
  sleep_note: string | null;
  sleep_h: number | null;
  training_done: string | null;
  note: string | null;
};

export type FoodPrefRow = {
  id: number;
  food_key: string | null;
  raw: string;
  stance: string;
  note: string | null;
};

export type MealPrefRow = { meal_key: string; stance: string; note: string | null };
export type RestrictionRow = { id: number; name: string; kind: string; severity: string };
export type ToleranceRowDb = {
  id: number; day: string; session_ref: string | null;
  duration_min: number | null; carbs_per_h: number; gi_ok: boolean; note: string | null;
};
export type IntakeRow = {
  id: number; day: string; raw: string; slot: string | null;
  kcal: number; protein_g: number; carb_g: number; fat_g: number; fibre_g: number;
};
export type NutritionChange = {
  id: number; day: string; what: string; why: string; delta_kcal: number | null; automatic: boolean;
};

export async function otherOn(day: string): Promise<OtherActivityRow[]> {
  const rows = await sql<OtherActivityRow[]>`select * from other_activity where day = ${day} order by id`;
  return rows.map((r) => ({ ...r, day: dstr(r.day), factor: Number(r.factor) }));
}

export async function otherBetween(from: string, to: string): Promise<OtherActivityRow[]> {
  const rows = await sql<OtherActivityRow[]>`
    select * from other_activity where day >= ${from} and day <= ${to} order by day, id`;
  return rows.map((r) => ({ ...r, day: dstr(r.day), factor: Number(r.factor) }));
}

export async function getCheckIn(day: string): Promise<CheckIn | null> {
  const rows = await sql<CheckIn[]>`select * from checkins where day = ${day}`;
  return rows[0] ? { ...rows[0], day: dstr(rows[0].day), weight_kg: rows[0].weight_kg == null ? null : Number(rows[0].weight_kg), sleep_h: rows[0].sleep_h == null ? null : Number(rows[0].sleep_h) } : null;
}

export async function recentCheckIns(day: string, n = 30): Promise<CheckIn[]> {
  const rows = await sql<CheckIn[]>`select * from checkins where day <= ${day} order by day desc limit ${n}`;
  return rows.map((r) => ({ ...r, day: dstr(r.day), weight_kg: r.weight_kg == null ? null : Number(r.weight_kg), sleep_h: r.sleep_h == null ? null : Number(r.sleep_h) }));
}

/**
 * Every weigh-in available, oldest first, from BOTH the readiness check-in and
 * the nutrition check-in. They are two forms onto one fact, and the trend
 * engine should not care which one was used on a given morning.
 */
export async function weightSeries(limitDays = 120): Promise<{ day: string; weight: number }[]> {
  const rows = await sql<{ day: string; w: string }[]>`
    select day, max(w)::numeric as w from (
      select day, weight_kg as w from readiness where weight_kg is not null
      union all
      select day, weight_kg as w from checkins  where weight_kg is not null
    ) both_sources
    group by day
    order by day desc
    limit ${limitDays}`;
  return rows
    .map((r) => ({ day: dstr(r.day), weight: Number(r.w) }))
    .filter((r) => Number.isFinite(r.weight))
    .reverse();
}

export async function foodPrefs(): Promise<FoodPrefRow[]> {
  return sql<FoodPrefRow[]>`select id, food_key, raw, stance, note from food_prefs order by created_at desc`;
}

export async function mealPrefs(): Promise<MealPrefRow[]> {
  return sql<MealPrefRow[]>`select meal_key, stance, note from meal_prefs`;
}

export async function restrictions(): Promise<RestrictionRow[]> {
  return sql<RestrictionRow[]>`select id, name, kind, severity from restrictions order by id`;
}

export async function toleranceHistory(n = 20): Promise<ToleranceRowDb[]> {
  const rows = await sql<ToleranceRowDb[]>`select * from fuel_tolerance order by day desc limit ${n}`;
  return rows.map((r) => ({ ...r, day: dstr(r.day) }));
}

export async function intakeOn(day: string): Promise<IntakeRow[]> {
  const rows = await sql<IntakeRow[]>`select * from intake_log where day = ${day} order by id`;
  return rows.map((r) => ({ ...r, day: dstr(r.day) }));
}

export async function nutritionChanges(n = 15): Promise<NutritionChange[]> {
  const rows = await sql<NutritionChange[]>`select * from nutrition_changes order by created_at desc limit ${n}`;
  return rows.map((r) => ({ ...r, day: dstr(r.day) }));
}

export async function savedShoppingList(weekStart: string) {
  const rows = await sql<{ week_start: string; items: unknown; total_gbp: string; actual_gbp: string | null }[]>`
    select * from shopping_lists where week_start = ${weekStart}`;
  return rows[0] ?? null;
}
