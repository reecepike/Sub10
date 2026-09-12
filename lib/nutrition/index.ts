/**
 * The orchestrator.
 *
 * One entry point for a day, one for a week. Both start from the training plan
 * — never from a separate nutrition calendar — so there is no second copy of
 * the training data to keep in step, and a change made on the Log page shows up
 * in the food plan on the next request.
 */

import type { Settings, SessionRow, Readiness, OtherActivityRow, CheckIn, ToleranceRowDb, FoodPrefRow, MealPrefRow, RestrictionRow, IntakeRow } from '../db';
import { weekPlan, weekFor, toIso, addDays } from '../plan';
import { adapt } from '../adapt';
import { assess } from '../readiness';
import { Profile, dayEnergy } from './energy';
import { resolveDay, Resolution } from './resolve';
import { dailyTargets, phaseFor, Targets, Phase, PHASE_INTENT } from './targets';
import { carbPerHourTarget, CarbTarget, racePlan, RacePlan } from './fuel';
import { buildPrefs, PrefSet, FoodPref, MealPref } from './prefs';
import { buildDayPlan, DayPlan } from './dayplan';
import { buildShoppingList, ShoppingList, carryForward } from './shopping';
import { buildPrepPlan, PrepPlan } from './prep';

export * from './energy';
export * from './resolve';
export * from './targets';
export * from './fuel';
export * from './foods';
export * from './meals';
export * from './prefs';
export * from './dayplan';
export * from './shopping';
export * from './prep';
export * from './adjust';
export * from './intake';
export * from './evidence';

export function profileFrom(s: Settings, currentWeightKg?: number | null): Profile {
  return {
    weightKg: Number(currentWeightKg ?? s.weight_kg) || 68,
    heightCm: Number(s.height_cm) || 177,
    ageYears: Number(s.age_years) || 18,
    sex: s.sex === 'female' ? 'female' : 'male',
    bodyFatPct: s.body_fat_pct == null ? null : Number(s.body_fat_pct),
    neatPal: Number(s.neat_pal) || 1.40,
  };
}

export function prefsFrom(
  fp: FoodPrefRow[],
  mp: MealPrefRow[],
  rs: RestrictionRow[],
): PrefSet {
  return buildPrefs(
    fp.map((r): FoodPref => ({ foodKey: r.food_key, raw: r.raw, stance: r.stance as FoodPref['stance'], note: r.note })),
    mp.map((r): MealPref => ({ mealKey: r.meal_key, stance: r.stance as MealPref['stance'] })),
    rs.map((r) => ({ name: r.name, kind: r.kind, severity: r.severity })),
  );
}

/* --------------------------------------------------------------- one day */

export type DayInputs = {
  day: string;
  settings: Settings;
  /** Training already adapted by the readiness engine for this day. */
  sessionsLogged: SessionRow[];
  other: OtherActivityRow[];
  readiness: Readiness | null;
  readinessHistory: Readiness[];
  checkIn: CheckIn | null;
  recentCheckIns: CheckIn[];
  tolerance: ToleranceRowDb[];
  prefs: PrefSet;
  intake: IntakeRow[];
  /** Tomorrow's planned load, for carb loading and fibre. */
  tomorrowLongestMin: number;
  currentWeightKg: number | null;
};

export type DayNutrition = {
  day: string;
  phase: Phase;
  phaseIntent: string;
  profile: Profile;
  resolution: Resolution;
  energy: ReturnType<typeof dayEnergy>;
  targets: Targets;
  carb: CarbTarget;
  plan: DayPlan;
  /** Target minus what has actually been eaten so far. */
  remaining: { kcal: number; p: number; c: number; f: number } | null;
  eatenSoFar: { kcal: number; p: number; c: number; f: number };
  warnings: string[];
};

export function nutritionForDay(i: DayInputs): DayNutrition {
  const s = i.settings;
  const today = toIso(new Date());
  const week = weekFor(s.start_date, i.day);
  const started = week >= 1 && week <= 45;

  const days = weekPlan(started ? week : 1, s);
  const planned = days.find((d) => d.date === i.day)?.sessions ?? [];
  const verdict = i.readiness ? assess(i.readiness, i.readinessHistory.filter((r) => r.day !== i.day)) : null;
  const adapted = adapt(started ? planned : [], verdict);

  const resolution = resolveDay(
    adapted.sessions,
    i.sessionsLogged,
    i.other,
    i.day < today,
    { run: s.lthr_run, bike: s.lthr_bike },
  );

  const profile = profileFrom(s, i.currentWeightKg);
  const energy = dayEnergy(
    resolution.sessions.filter((x) => x.counts && x.minutes > 0),
    profile,
    resolution.warnings,
  );

  const phase = phaseFor(s, i.day);

  const guttyLately = i.recentCheckIns
    .slice(0, 4)
    .some((c) => c.digestion === 'bloated' || c.digestion === 'cramping' || c.bowel === 'loose');

  const targets = dailyTargets({
    day: i.day,
    profile,
    energy,
    resolution,
    phase,
    adjustKcal: Number(s.kcal_adjust) || 0,
    tomorrowLongestMin: i.tomorrowLongestMin,
    guttyLately,
  });

  const carb = carbPerHourTarget(
    Number(s.carb_tolerance) || 45,
    phase,
    i.tolerance.map((t) => ({ day: t.day, duration_min: t.duration_min, carbs_per_h: t.carbs_per_h, gi_ok: t.gi_ok })),
    i.day,
  );

  const plan = buildDayPlan({
    day: i.day,
    settings: s,
    profile,
    targets,
    resolution,
    prefs: i.prefs,
    carbPerHour: carb.gPerHour,
    week: Math.max(1, week),
  });

  const eaten = i.intake.reduce(
    (a, r) => ({ kcal: a.kcal + r.kcal, p: a.p + r.protein_g, c: a.c + r.carb_g, f: a.f + r.fat_g }),
    { kcal: 0, p: 0, c: 0, f: 0 },
  );

  return {
    day: i.day,
    phase,
    phaseIntent: PHASE_INTENT[phase],
    profile,
    resolution,
    energy,
    targets,
    carb,
    plan,
    eatenSoFar: eaten,
    remaining: i.intake.length
      ? {
        kcal: targets.kcal - eaten.kcal,
        p: targets.protein - eaten.p,
        c: targets.carb - eaten.c,
        f: targets.fat - eaten.f,
      }
      : null,
    warnings: [...resolution.warnings, ...energy.warnings],
  };
}

/* -------------------------------------------------------------- one week */

export type WeekInputs = {
  weekStart: string;         // Monday
  settings: Settings;
  sessionsLogged: SessionRow[];
  other: OtherActivityRow[];
  readiness: Readiness[];
  checkIns: CheckIn[];
  tolerance: ToleranceRowDb[];
  prefs: PrefSet;
  currentWeightKg: number | null;
  carryOver?: Record<string, number>;
};

export type WeekNutrition = {
  weekStart: string;
  days: DayNutrition[];
  plans: DayPlan[];
  shopping: ShoppingList;
  prep: PrepPlan;
  totals: { kcal: number; cost: number; trainingHours: number };
  carryOver: Record<string, number>;
};

export function nutritionForWeek(i: WeekInputs): WeekNutrition {
  const s = i.settings;
  const out: DayNutrition[] = [];

  const dayList = Array.from({ length: 7 }, (_, n) => addDays(i.weekStart, n));

  // Tomorrow's load has to be known before today's targets, so walk backwards.
  const week = weekFor(s.start_date, i.weekStart);
  const planDays = weekPlan(Math.max(1, Math.min(45, week)), s);
  const nextDay = weekPlan(Math.max(1, Math.min(45, week + 1)), s);
  const longestOn = (iso: string): number => {
    const d = [...planDays, ...nextDay].find((x) => x.date === iso);
    if (!d) return 0;
    return d.sessions.reduce((m, x) => (x.disc !== 'ST' && x.minutes > m ? x.minutes : m), 0);
  };

  for (const day of dayList) {
    out.push(
      nutritionForDay({
        day,
        settings: s,
        sessionsLogged: i.sessionsLogged.filter((x) => x.day === day),
        other: i.other.filter((x) => x.day === day),
        readiness: i.readiness.find((r) => r.day === day) ?? null,
        readinessHistory: i.readiness.filter((r) => r.day < day),
        checkIn: i.checkIns.find((c) => c.day === day) ?? null,
        recentCheckIns: i.checkIns.filter((c) => c.day <= day),
        tolerance: i.tolerance,
        prefs: i.prefs,
        intake: [],
        tomorrowLongestMin: longestOn(addDays(day, 1)),
        currentWeightKg: i.currentWeightKg,
      }),
    );
  }

  const plans = out.map((d) => d.plan);
  const shopping = buildShoppingList(i.weekStart, plans, Number(s.budget_gbp) || 60, i.carryOver ?? {});
  const prep = buildPrepPlan(i.weekStart, plans);

  return {
    weekStart: i.weekStart,
    days: out,
    plans,
    shopping,
    prep,
    totals: {
      kcal: out.reduce((a, d) => a + d.targets.kcal, 0),
      cost: shopping.total,
      trainingHours: Math.round((out.reduce((a, d) => a + d.resolution.sessions.filter((x) => x.counts).reduce((b, x) => b + x.minutes, 0), 0) / 60) * 10) / 10,
    },
    carryOver: carryForward(shopping),
  };
}

/* ----------------------------------------------------------- the race plan */

export function raceFuelPlan(s: Settings): RacePlan {
  return racePlan(profileFrom(s), Number(s.carb_tolerance) || 60);
}
