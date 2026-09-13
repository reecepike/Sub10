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
  nutritionForDay, nutritionForWeek, prefsFrom, housesFrom, houseFor, houseName,
  DayNutrition, WeekNutrition,
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

/** The Monday of the week a day belongs to. */
function mondayOf(day: string): string {
  const dow = (new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7;
  return addDays(day, -dow);
}

export type DayContext = DayNutrition & {
  /** The week this day sits in — where its energy allocation came from. */
  week: WeekNutrition;
};

/**
 * One day, in the context of its week.
 *
 * A day's calorie target is not a property of the day. It is the day's share of
 * the week, after the week has been smoothed, and the batches it eats from were
 * cooked on a different day in a different house. So the week is built first,
 * and then this day is rebuilt on top of it with the things only the day knows:
 * what has actually been eaten so far, and this morning's readiness.
 */
export async function dayNutrition(day?: string): Promise<DayContext> {
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
  const planWeek = weekFor(s.start_date, d);
  const tomorrow = addDays(d, 1);
  const spanning = [
    ...weekPlan(Math.max(1, Math.min(45, planWeek)), s),
    ...weekPlan(Math.max(1, Math.min(45, planWeek + 1)), s),
  ];
  const tomorrowLongestMin = (spanning.find((x) => x.date === tomorrow)?.sessions ?? [])
    .reduce((m, x) => (x.disc !== 'ST' && x.minutes > m ? x.minutes : m), 0);

  // The surrounding week decides this day's share of the week's energy, and
  // holds the batches this day eats from.
  const week = await weekNutrition(mondayOf(d));
  const allocation = week.allocation.days.find((x) => x.day === d);

  const out = nutritionForDay({
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
    allocation,
  });

  // Point the day's meals at their containers, exactly as the week view does.
  const houses = housesFrom(s);
  for (const e of out.plan.entries) {
    const ref = week.kitchen.portionFor[`${d}|${e.seq}`];
    e.house = houseName(houseFor(d, e.at, houses), houses);
    e.portion = ref
      ? {
        batchId: ref.batchId, label: ref.label, index: ref.index, of: ref.of,
        cookedG: ref.cookedG, reheat: ref.reheat, house: houseName(ref.house, houses),
      }
      : null;
  }

  return { ...out, week };
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

/**
 * Cache the generated week, and record anything the failsafe refused.
 *
 * The caching is so the prep page, the shopping page and the daily plan cannot
 * disagree with each other about which container Thursday's dinner is in.
 *
 * The audit log is for a different reason. A blocking audit that happens once
 * is a mistyped session; one that happens every Tuesday is a bug, and the only
 * way to tell those apart is to write them down at the time. Findings are
 * upserted per day and code, so re-rendering a page does not fill the table.
 */
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

  await sql`
    insert into kitchen_plans (week_start, batches, portions, segments, generated_at)
    values (
      ${w.weekStart},
      ${sql.json(w.kitchen.batches as never)},
      ${sql.json(w.kitchen.portionFor as never)},
      ${sql.json(w.kitchen.segments as never)},
      now())
    on conflict (week_start) do update set
      batches = excluded.batches, portions = excluded.portions,
      segments = excluded.segments, generated_at = now()`;

  for (const h of w.houseShopping) {
    await sql`
      insert into house_shopping (week_start, house, lines, total_gbp, ongoing_gbp, generated_at)
      values (${w.weekStart}, ${h.house}, ${sql.json(h.lines as never)}, ${h.total}, ${h.ongoing}, now())
      on conflict (week_start, house) do update set
        lines = excluded.lines, total_gbp = excluded.total_gbp,
        ongoing_gbp = excluded.ongoing_gbp, generated_at = now()`;
  }

  // Only failures are recorded. Warnings are surfaced on the page and are
  // usually the athlete's business rather than the engine's.
  const rows: { day: string; scope: string; code: string; severity: string; title: string; detail: string; displayed: number | null }[] = [];
  for (const f of w.audit.findings) {
    if (f.severity !== 'fail') continue;
    rows.push({ day: w.weekStart, scope: 'week', code: f.code, severity: f.severity, title: f.title, detail: f.detail, displayed: null });
  }
  for (const d of w.days) {
    for (const f of d.audit.findings) {
      if (f.severity !== 'fail') continue;
      rows.push({ day: d.day, scope: 'day', code: f.code, severity: f.severity, title: f.title, detail: f.detail, displayed: d.targets.kcal });
    }
  }
  for (const r of rows) {
    await sql`
      insert into audit_log (day, scope, code, severity, title, detail, displayed)
      select ${r.day}, ${r.scope}, ${r.code}, ${r.severity}, ${r.title}, ${r.detail}, ${r.displayed}
      where not exists (
        select 1 from audit_log
        where day = ${r.day} and scope = ${r.scope} and code = ${r.code}
          and created_at > now() - interval '1 day')`;
  }
}
