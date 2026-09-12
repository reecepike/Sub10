/**
 * Server-side loading.
 *
 * The pages should not each know which eight tables a nutrition plan needs.
 * These two functions do the loading; everything above them is presentation.
 */

import 'server-only';
import {
  sql, getSettings, getReadiness, recentReadiness, sessionsOn, sessionsBetween,
  otherOn, otherBetween, getCheckIn, recentCheckIns, weightSeries,
  foodPrefs, mealPrefs, restrictions, toleranceHistory, intakeOn,
} from '../db';
import { toIso, addDays, weekFor, weekPlan } from '../plan';
import { setPriceOverrides } from './foods';
import {
  nutritionForDay, nutritionForWeek, prefsFrom, DayNutrition, WeekNutrition,
} from './index';

/** Price corrections the athlete has made, applied for this request. */
async function loadPrices(): Promise<void> {
  const rows = await sql<{ key: string; pack_g: string; pack_price: string; verified: boolean }[]>`
    select key, pack_g, pack_price, verified from foods`;
  const map: Record<string, { packG: number; packPrice: number; verified: boolean }> = {};
  for (const r of rows) {
    map[r.key] = { packG: Number(r.pack_g), packPrice: Number(r.pack_price), verified: r.verified };
  }
  setPriceOverrides(map);
}

/** The working bodyweight: the seven-day average, never a single morning. */
async function workingWeight(day: string): Promise<number | null> {
  const series = await weightSeries(60);
  const from = addDays(day, -7);
  const recent = series.filter((w) => w.day > from && w.day <= day);
  if (!recent.length) return null;
  return Math.round((recent.reduce((a, w) => a + w.weight, 0) / recent.length) * 10) / 10;
}

export async function dayNutrition(day?: string): Promise<DayNutrition> {
  const d = day ?? toIso(new Date());
  await loadPrices();

  const s = await getSettings();
  const [logged, other, readiness, history, checkIn, checks, tol, fp, mp, rs, intake, weight] =
    await Promise.all([
      sessionsOn(d), otherOn(d), getReadiness(d), recentReadiness(d, 22),
      getCheckIn(d), recentCheckIns(d, 10), toleranceHistory(20),
      foodPrefs(), mealPrefs(), restrictions(), intakeOn(d), workingWeight(d),
    ]);

  // Tomorrow's longest session, which decides today's carb loading and fibre.
  const week = weekFor(s.start_date, d);
  const tomorrow = addDays(d, 1);
  const spanning = [
    ...weekPlan(Math.max(1, Math.min(45, week)), s),
    ...weekPlan(Math.max(1, Math.min(45, week + 1)), s),
  ];
  const tomorrowLongestMin = (spanning.find((x) => x.date === tomorrow)?.sessions ?? [])
    .reduce((m, x) => (x.disc !== 'ST' && x.minutes > m ? x.minutes : m), 0);

  return nutritionForDay({
    day: d,
    settings: s,
    sessionsLogged: logged,
    other,
    readiness,
    readinessHistory: history,
    checkIn,
    recentCheckIns: checks,
    tolerance: tol,
    prefs: prefsFrom(fp, mp, rs),
    intake,
    tomorrowLongestMin,
    currentWeightKg: weight,
  });
}

export async function weekNutrition(weekStartIso?: string): Promise<WeekNutrition> {
  await loadPrices();
  const s = await getSettings();
  const today = toIso(new Date());
  const dow = ((new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7);
  const start = weekStartIso ?? addDays(today, -dow);
  const end = addDays(start, 6);

  const [logged, other, readiness, checks, tol, fp, mp, rs, weight] = await Promise.all([
    sessionsBetween(start, end),
    otherBetween(start, end),
    recentReadiness(end, 40),
    recentCheckIns(end, 40),
    toleranceHistory(20),
    foodPrefs(), mealPrefs(), restrictions(),
    workingWeight(today),
  ]);

  // Last week's leftovers come off this week's list.
  const prevRows = await sql<{ items: unknown }[]>`
    select items from shopping_lists where week_start = ${addDays(start, -7)}`;
  const carryOver = (prevRows[0]?.items as { carryOver?: Record<string, number> } | undefined)?.carryOver ?? {};

  return nutritionForWeek({
    weekStart: start,
    settings: s,
    sessionsLogged: logged,
    other,
    readiness,
    checkIns: checks,
    tolerance: tol,
    prefs: prefsFrom(fp, mp, rs),
    currentWeightKg: weight,
    carryOver,
  });
}

/** Cache the generated week so the shopping and prep pages agree with each other. */
export async function persistWeek(w: WeekNutrition): Promise<void> {
  await sql`
    insert into shopping_lists (week_start, items, total_gbp, generated_at)
    values (${w.weekStart}, ${sql.json({ items: w.shopping.items, carryOver: w.carryOver } as never)}, ${w.shopping.total}, now())
    on conflict (week_start) do update set
      items = excluded.items, total_gbp = excluded.total_gbp, generated_at = now()`;
  await sql`
    insert into prep_plans (week_start, batches, generated_at)
    values (${w.weekStart}, ${sql.json(w.prep.days as never)}, now())
    on conflict (week_start) do update set batches = excluded.batches, generated_at = now()`;
}
