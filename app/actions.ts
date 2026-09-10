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
