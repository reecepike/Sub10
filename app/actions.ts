'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { sql, getSettings, getReadiness, recentReadiness } from '@/lib/db';
import { login as doLogin, logout as doLogout, currentUser } from '@/lib/auth';
import { assess } from '@/lib/readiness';
import { parseClock } from '@/lib/project';

/* ------------------------------------------------------------- helpers */

function str(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}
function num(fd: FormData, k: string): number | null {
  const s = str(fd, k);
  if (s === null) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function int(fd: FormData, k: string): number | null {
  const n = num(fd, k);
  return n === null ? null : Math.round(n);
}
function bool(fd: FormData, k: string): boolean {
  return fd.get(k) === 'on' || fd.get(k) === 'true';
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function requireUser() {
  const id = await currentUser();
  if (!id) redirect('/login');
  return id;
}

/* --------------------------------------------------------------- auth */

export async function loginAction(_prev: unknown, fd: FormData): Promise<{ error?: string }> {
  const email = str(fd, 'email');
  const password = str(fd, 'password');
  if (!email || !password) return { error: 'Email and password, please.' };
  const ok = await doLogin(email, password);
  if (!ok) return { error: 'That email and password do not match an account.' };
  redirect('/');
}

export async function logoutAction() {
  await doLogout();
  redirect('/login');
}

/* ---------------------------------------------------------- readiness */

export async function saveReadinessAction(fd: FormData) {
  await requireUser();
  const day = str(fd, 'day') ?? today();

  const entry = {
    day,
    sleep_h: num(fd, 'sleep_h'),
    sleep_q: int(fd, 'sleep_q'),
    rhr: int(fd, 'rhr'),
    hrv: int(fd, 'hrv'),
    weight_kg: num(fd, 'weight_kg'),
    fatigue: int(fd, 'fatigue'),
    soreness: int(fd, 'soreness'),
    stress: int(fd, 'stress'),
    motivation: int(fd, 'motivation'),
    illness: bool(fd, 'illness'),
    pain: str(fd, 'pain'),
    notes: str(fd, 'notes'),
  };

  const history = (await recentReadiness(day, 22)).filter((r) => r.day !== day);
  const v = assess({ ...entry, score: null, band: null } as never, history);

  await sql`
    insert into readiness (day, sleep_h, sleep_q, rhr, hrv, weight_kg, fatigue, soreness,
                           stress, motivation, illness, pain, notes, score, band)
    values (${day}, ${entry.sleep_h}, ${entry.sleep_q}, ${entry.rhr}, ${entry.hrv},
            ${entry.weight_kg}, ${entry.fatigue}, ${entry.soreness}, ${entry.stress},
            ${entry.motivation}, ${entry.illness}, ${entry.pain}, ${entry.notes},
            ${v.score}, ${v.band})
    on conflict (day) do update set
      sleep_h = excluded.sleep_h, sleep_q = excluded.sleep_q, rhr = excluded.rhr,
      hrv = excluded.hrv, weight_kg = excluded.weight_kg, fatigue = excluded.fatigue,
      soreness = excluded.soreness, stress = excluded.stress, motivation = excluded.motivation,
      illness = excluded.illness, pain = excluded.pain, notes = excluded.notes,
      score = excluded.score, band = excluded.band`;

  // Keep the working bodyweight current — the nutrition rules run off it.
  if (entry.weight_kg) {
    const recent = await sql<{ w: number }[]>`
      select avg(weight_kg)::numeric(6,2) as w from readiness
      where weight_kg is not null and day > ${day}::date - interval '7 days'`;
    if (recent[0]?.w) {
      await sql`update settings set weight_kg = ${recent[0].w}, updated_at = now() where id = 1`;
    }
  }

  revalidatePath('/');
  revalidatePath('/progress');
  redirect('/');
}

/* ----------------------------------------------------------- sessions */

export async function saveSessionAction(fd: FormData) {
  await requireUser();
  const day = str(fd, 'day') ?? today();
  const discipline = str(fd, 'discipline') ?? 'RN';

  const paceRaw = str(fd, 'avg_pace');
  const avgPace = paceRaw ? Math.round(parseClock(paceRaw, 0)) || null : null;

  await sql`
    insert into sessions (day, discipline, plan_key, title, duration_min, distance, rpe,
                          avg_hr, avg_power, np, cadence, avg_pace_sec, stroke_count,
                          hr_drift, carbs_per_h, niggle, notes, completed)
    values (${day}, ${discipline}, ${str(fd, 'plan_key')}, ${str(fd, 'title')},
            ${int(fd, 'duration_min')}, ${num(fd, 'distance')}, ${int(fd, 'rpe')},
            ${int(fd, 'avg_hr')}, ${int(fd, 'avg_power')}, ${int(fd, 'np')},
            ${int(fd, 'cadence')}, ${avgPace}, ${int(fd, 'stroke_count')},
            ${num(fd, 'hr_drift')}, ${int(fd, 'carbs_per_h')},
            ${str(fd, 'niggle')}, ${str(fd, 'notes')}, ${!bool(fd, 'abandoned')})`;

  revalidatePath('/');
  revalidatePath('/week');
  revalidatePath('/progress');
  redirect('/?logged=1');
}

export async function deleteSessionAction(fd: FormData) {
  await requireUser();
  const id = int(fd, 'id');
  if (id) await sql`delete from sessions where id = ${id}`;
  revalidatePath('/');
  revalidatePath('/week');
}

export async function saveOtherAction(fd: FormData) {
  await requireUser();
  await sql`
    insert into other_activity (day, activity, duration_min, rpe, factor, next_day)
    values (${str(fd, 'day') ?? today()}, ${str(fd, 'activity') ?? 'Badminton'},
            ${int(fd, 'duration_min') ?? 0}, ${int(fd, 'rpe')},
            ${num(fd, 'factor') ?? 0.7}, ${str(fd, 'next_day')})`;
  revalidatePath('/');
  redirect('/?logged=1');
}

/* -------------------------------------------------------------- tests */

export async function saveTestAction(fd: FormData) {
  await requireUser();
  const kind = str(fd, 'kind');
  const day = str(fd, 'day') ?? today();
  if (!kind) redirect('/settings');

  let value: number | null = null;
  if (kind === 'css' || kind === 'five_k') value = parseClock(str(fd, 'value') ?? '', 0) || null;
  else value = num(fd, 'value');
  if (value === null) redirect('/settings');

  await sql`insert into tests (day, kind, value, note)
            values (${day}, ${kind}, ${value}, ${str(fd, 'note')})`;

  // A test result is the whole point — push it straight into the working settings.
  if (kind === 'ftp') await sql`update settings set ftp = ${Math.round(value)}, updated_at = now() where id = 1`;
  if (kind === 'css') await sql`update settings set css_sec = ${Math.round(value)}, updated_at = now() where id = 1`;
  if (kind === 'five_k') await sql`update settings set five_k_sec = ${Math.round(value)}, updated_at = now() where id = 1`;
  if (kind === 'bench') await sql`update settings set bench_5rm = ${Math.round(value)}, updated_at = now() where id = 1`;

  revalidatePath('/');
  revalidatePath('/progress');
  revalidatePath('/settings');
  redirect('/progress');
}

/* ----------------------------------------------------------- settings */

export async function saveSettingsAction(fd: FormData) {
  await requireUser();
  const s = await getSettings();

  await sql`
    update settings set
      athlete_name          = ${str(fd, 'athlete_name') ?? s.athlete_name},
      race_date             = ${str(fd, 'race_date') ?? s.race_date},
      start_date            = ${str(fd, 'start_date') ?? s.start_date},
      weight_kg             = ${num(fd, 'weight_kg') ?? s.weight_kg},
      ftp                   = ${int(fd, 'ftp')},
      css_sec               = ${str(fd, 'css_sec') ? Math.round(parseClock(str(fd, 'css_sec')!, 0)) : null},
      five_k_sec            = ${str(fd, 'five_k_sec') ? Math.round(parseClock(str(fd, 'five_k_sec')!, 0)) : null},
      lthr_run              = ${int(fd, 'lthr_run')},
      lthr_bike             = ${int(fd, 'lthr_bike')},
      bench_5rm             = ${int(fd, 'bench_5rm')},
      aero_bars             = ${bool(fd, 'aero_bars')},
      transitions_rehearsed = ${bool(fd, 'transitions_rehearsed')},
      badminton_fri         = ${bool(fd, 'badminton_fri')},
      badminton_sun         = ${bool(fd, 'badminton_sun')},
      updated_at            = now()
    where id = 1`;

  revalidatePath('/');
  revalidatePath('/week');
  revalidatePath('/progress');
  redirect('/settings?saved=1');
}

/* ------------------------------------------------------------ reviews */

export async function saveWeeklyReviewAction(fd: FormData) {
  await requireUser();
  const week = int(fd, 'week') ?? 1;
  await sql`
    insert into weekly_reviews (week, day, planned_eth, actual_eth, missed, key_sessions,
                                recovery, limiter, one_line)
    values (${week}, ${str(fd, 'day') ?? today()}, ${num(fd, 'planned_eth')},
            ${num(fd, 'actual_eth')}, ${str(fd, 'missed')}, ${str(fd, 'key_sessions')},
            ${str(fd, 'recovery')}, ${str(fd, 'limiter')}, ${str(fd, 'one_line')})
    on conflict (week) do update set
      missed = excluded.missed, key_sessions = excluded.key_sessions,
      recovery = excluded.recovery, limiter = excluded.limiter,
      one_line = excluded.one_line, planned_eth = excluded.planned_eth,
      actual_eth = excluded.actual_eth`;
  revalidatePath('/review');
  redirect('/review?saved=1');
}

export async function saveMonthlyReviewAction(fd: FormData) {
  await requireUser();
  await sql`
    insert into monthly_reviews (day, strongest, weakest, limiter, injury_risk,
                                 sustainable, projection, trajectory, changes)
    values (${str(fd, 'day') ?? today()}, ${str(fd, 'strongest')}, ${str(fd, 'weakest')},
            ${str(fd, 'limiter')}, ${str(fd, 'injury_risk')}, ${str(fd, 'sustainable')},
            ${str(fd, 'projection')}, ${str(fd, 'trajectory')}, ${str(fd, 'changes')})`;
  revalidatePath('/review');
  redirect('/review?saved=1');
}

export async function saveAdaptationAction(fd: FormData) {
  await requireUser();
  await sql`
    insert into adaptations (day, week, trigger, decision, reasoning, outcome, automatic)
    values (${str(fd, 'day') ?? today()}, ${int(fd, 'week')}, ${str(fd, 'trigger')},
            ${str(fd, 'decision')}, ${str(fd, 'reasoning')}, ${str(fd, 'outcome')}, false)`;
  revalidatePath('/review');
  redirect('/review?saved=1');
}

/* ==================================================================
   NUTRITION
   ================================================================== */

/** The simple daily check-in. Weight lands here and in the trend engine. */
export async function saveCheckInAction(fd: FormData) {
  await requireUser();
  const day = str(fd, 'day') ?? today();
  await sql`
    insert into checkins (day, weight_kg, energy, hunger, body, session_feel,
                          bowel, digestion, sleep_note, sleep_h, training_done, note)
    values (${day}, ${num(fd, 'weight_kg')}, ${str(fd, 'energy')}, ${str(fd, 'hunger')},
            ${str(fd, 'body')}, ${str(fd, 'session_feel')}, ${str(fd, 'bowel')},
            ${str(fd, 'digestion')}, ${str(fd, 'sleep_note')}, ${num(fd, 'sleep_h')},
            ${str(fd, 'training_done')}, ${str(fd, 'note')})
    on conflict (day) do update set
      weight_kg = excluded.weight_kg, energy = excluded.energy, hunger = excluded.hunger,
      body = excluded.body, session_feel = excluded.session_feel, bowel = excluded.bowel,
      digestion = excluded.digestion, sleep_note = excluded.sleep_note,
      sleep_h = excluded.sleep_h, training_done = excluded.training_done, note = excluded.note`;

  revalidatePath('/fuel');
  revalidatePath('/checkin');
  redirect('/fuel');
}

/** "I don't like Greek yoghurt." — parsed, stored, and acted on. */
export async function addPrefAction(fd: FormData) {
  await requireUser();
  const raw = str(fd, 'raw');
  if (!raw) redirect('/fuel/prefs');

  const { matchFood, readStance } = await import('@/lib/nutrition');
  const m = matchFood(raw);
  const stance = str(fd, 'stance') ?? readStance(raw);

  if (m.mealKey) {
    await sql`
      insert into meal_prefs (meal_key, stance, note) values (${m.mealKey}, ${stance === 'like' ? 'like' : 'dislike'}, ${raw})
      on conflict (meal_key) do update set stance = excluded.stance, note = excluded.note`;
  } else {
    await sql`insert into food_prefs (food_key, raw, stance, note)
              values (${m.foodKey}, ${raw}, ${stance}, ${str(fd, 'note')})`;
  }

  revalidatePath('/fuel');
  revalidatePath('/fuel/prefs');
  revalidatePath('/fuel/week');
  redirect(m.foodKey || m.mealKey ? '/fuel/prefs?ok=1' : '/fuel/prefs?unmatched=1');
}

export async function deletePrefAction(fd: FormData) {
  await requireUser();
  const id = int(fd, 'id');
  const mealKey = str(fd, 'meal_key');
  if (id) await sql`delete from food_prefs where id = ${id}`;
  if (mealKey) await sql`delete from meal_prefs where meal_key = ${mealKey}`;
  revalidatePath('/fuel/prefs');
  revalidatePath('/fuel');
}

export async function addRestrictionAction(fd: FormData) {
  await requireUser();
  const name = str(fd, 'name');
  if (!name) redirect('/fuel/prefs');
  await sql`insert into restrictions (name, kind, severity)
            values (${name}, ${str(fd, 'kind') ?? 'allergy'}, ${str(fd, 'severity') ?? 'strict'})`;
  revalidatePath('/fuel');
  revalidatePath('/fuel/prefs');
  redirect('/fuel/prefs?ok=1');
}

export async function deleteRestrictionAction(fd: FormData) {
  await requireUser();
  const id = int(fd, 'id');
  if (id) await sql`delete from restrictions where id = ${id}`;
  revalidatePath('/fuel/prefs');
  revalidatePath('/fuel');
}

/** "I only ate half my dinner." */
export async function logIntakeAction(fd: FormData) {
  await requireUser();
  const day = str(fd, 'day') ?? today();
  const raw = str(fd, 'raw');

  const manualKcal = int(fd, 'kcal');
  if (manualKcal !== null) {
    await sql`insert into intake_log (day, raw, slot, kcal, protein_g, carb_g, fat_g, fibre_g)
              values (${day}, ${raw ?? 'manual entry'}, ${str(fd, 'slot')}, ${manualKcal},
                      ${int(fd, 'protein_g') ?? 0}, ${int(fd, 'carb_g') ?? 0},
                      ${int(fd, 'fat_g') ?? 0}, ${int(fd, 'fibre_g') ?? 0})`;
    revalidatePath('/fuel');
    redirect('/fuel?logged=1');
  }

  if (!raw) redirect('/fuel');

  // Parse against today's plan, which is rebuilt here rather than stored, so it
  // is always the current plan rather than whatever was generated last week.
  const { readIntake } = await import('@/lib/nutrition');
  const { dayNutrition } = await import('@/lib/nutrition/server');
  const n = await dayNutrition(day);
  const d = readIntake(raw, n.plan.entries);

  await sql`insert into intake_log (day, raw, slot, kcal, protein_g, carb_g, fat_g, fibre_g)
            values (${day}, ${`${raw} — ${d.read}`}, ${str(fd, 'slot')}, ${d.kcal},
                    ${d.p}, ${d.c}, ${d.f}, ${d.fibre})`;

  revalidatePath('/fuel');
  redirect(d.matched ? '/fuel?logged=1' : '/fuel?unmatched=1');
}

export async function deleteIntakeAction(fd: FormData) {
  await requireUser();
  const id = int(fd, 'id');
  if (id) await sql`delete from intake_log where id = ${id}`;
  revalidatePath('/fuel');
}

/** Log how a long session's fuelling actually went — this moves the gut ladder. */
export async function logToleranceAction(fd: FormData) {
  await requireUser();
  const carbs = int(fd, 'carbs_per_h');
  if (carbs === null) redirect('/fuel');
  await sql`insert into fuel_tolerance (day, session_ref, duration_min, carbs_per_h, gi_ok, note)
            values (${str(fd, 'day') ?? today()}, ${str(fd, 'session_ref')},
                    ${int(fd, 'duration_min')}, ${carbs}, ${!bool(fd, 'gi_problem')}, ${str(fd, 'note')})`;
  revalidatePath('/fuel');
  redirect('/fuel?logged=1');
}

/** Run the weekly weight review and apply the result. */
export async function runWeeklyReviewAction(fd: FormData) {
  await requireUser();
  const day = str(fd, 'day') ?? today();
  const { weeklyAdjustment, phaseFor } = await import('@/lib/nutrition');
  const { getSettings: gs, weightSeries: ws, recentCheckIns: rc } = await import('@/lib/db');

  const s = await gs();
  const weights = await ws(60);
  const checks = await rc(day, 7);
  const latest = checks[0] ?? null;

  const a = weeklyAdjustment(weights, day, Number(s.kcal_adjust) || 0, phaseFor(s, day), {
    energy: latest?.energy ?? null,
    hunger: latest?.hunger ?? null,
    sessionFeel: latest?.session_feel ?? null,
  });

  if (a.deltaKcal !== 0) {
    await sql`update settings set kcal_adjust = ${a.newAdjust}, updated_at = now() where id = 1`;
  }
  // The new working bodyweight is the seven-day average, not this morning's number.
  if (a.avg7) {
    await sql`update settings set weight_kg = ${Math.round(a.avg7 * 10) / 10}, updated_at = now() where id = 1`;
  }
  await sql`insert into nutrition_changes (day, what, why, delta_kcal, automatic)
            values (${day}, ${a.headline}, ${a.reason}, ${a.deltaKcal}, true)`;

  revalidatePath('/fuel');
  revalidatePath('/fuel/week');
  redirect('/fuel/week?reviewed=1');
}

/** Correct a price, or any other food fact. */
export async function saveFoodAction(fd: FormData) {
  await requireUser();
  const key = str(fd, 'key');
  if (!key) redirect('/fuel/foods');
  const price = num(fd, 'pack_price');
  const packG = num(fd, 'pack_g');
  await sql`
    insert into foods (key, name, aldi_product, category, roles, pack_g, pack_price,
                       kcal_100, protein_100, carb_100, fat_100, fibre_100, sodium_100,
                       perishable, freezable, verified, price_checked)
    values (${key}, ${str(fd, 'name') ?? key}, ${str(fd, 'aldi_product')}, ${str(fd, 'category') ?? 'store'},
            ${str(fd, 'roles') ?? ''}, ${packG ?? 100}, ${price ?? 0},
            ${num(fd, 'kcal_100') ?? 0}, ${num(fd, 'protein_100') ?? 0}, ${num(fd, 'carb_100') ?? 0},
            ${num(fd, 'fat_100') ?? 0}, ${num(fd, 'fibre_100') ?? 0}, ${num(fd, 'sodium_100') ?? 0},
            true, false, true, ${today()})
    on conflict (key) do update set
      pack_price = coalesce(${price}, foods.pack_price),
      pack_g = coalesce(${packG}, foods.pack_g),
      verified = true,
      price_checked = ${today()}`;
  revalidatePath('/fuel/foods');
  revalidatePath('/fuel/shopping');
  redirect('/fuel/foods?saved=1');
}

/** Profile and preferences that drive the nutrition engine. */
export async function saveNutritionSettingsAction(fd: FormData) {
  await requireUser();
  await sql`
    update settings set
      height_cm      = coalesce(${num(fd, 'height_cm')}, height_cm),
      age_years      = coalesce(${int(fd, 'age_years')}, age_years),
      sex            = coalesce(${str(fd, 'sex')}, sex),
      body_fat_pct   = ${num(fd, 'body_fat_pct')},
      pool_length_m  = coalesce(${int(fd, 'pool_length_m')}, pool_length_m),
      budget_gbp     = coalesce(${num(fd, 'budget_gbp')}, budget_gbp),
      neat_pal       = coalesce(${num(fd, 'neat_pal')}, neat_pal),
      kcal_adjust    = coalesce(${int(fd, 'kcal_adjust')}, kcal_adjust),
      sleep_mode     = coalesce(${str(fd, 'sleep_mode')}, sleep_mode),
      carb_tolerance = coalesce(${int(fd, 'carb_tolerance')}, carb_tolerance),
      wake_time      = coalesce(${str(fd, 'wake_time')}, wake_time),
      bed_time       = coalesce(${str(fd, 'bed_time')}, bed_time),
      am_time        = coalesce(${str(fd, 'am_time')}, am_time),
      pm_time        = coalesce(${str(fd, 'pm_time')}, pm_time),
      eve_time       = coalesce(${str(fd, 'eve_time')}, eve_time),
      updated_at     = now()
    where id = 1`;
  revalidatePath('/fuel');
  revalidatePath('/fuel/week');
  revalidatePath('/settings');
  redirect('/settings?saved=1');
}

/** Record what the shop actually cost, so the estimate can be judged. */
export async function saveActualSpendAction(fd: FormData) {
  await requireUser();
  const week = str(fd, 'week_start');
  const actual = num(fd, 'actual_gbp');
  if (!week || actual === null) redirect('/fuel/shopping');
  await sql`
    insert into shopping_lists (week_start, actual_gbp) values (${week}, ${actual})
    on conflict (week_start) do update set actual_gbp = excluded.actual_gbp`;
  revalidatePath('/fuel/shopping');
  redirect('/fuel/shopping?saved=1');
}
