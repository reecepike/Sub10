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
import { allocateWeek, allocateStandalone, DayNeed, DayAllocation, WeekAllocation } from './allocate';
import { auditDay, auditWeek, Audit, AuditSession } from './audit';
import { buildKitchen, buildHouseShopping, Kitchen, HouseShopping } from './recipes';
import { HouseConfig, DEFAULT_HOUSES, houseFor, houseName, HOUSE_RULES } from './houses';
import { fatFreeMass } from './energy';

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
export * from './allocate';
export * from './audit';
export * from './houses';
export * from './units';
export * from './recipes';

/** The two-house configuration, read from settings. */
export function housesFrom(s: Settings): HouseConfig {
  return {
    satHandover: s.sat_handover ?? DEFAULT_HOUSES.satHandover,
    tueHandover: s.tue_handover ?? DEFAULT_HOUSES.tueHandover,
    dadName: s.dad_label ?? DEFAULT_HOUSES.dadName,
    mumName: s.mum_label ?? DEFAULT_HOUSES.mumName,
  };
}

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
  /**
   * What the weekly allocator decided for this day. Omitted when a single day
   * is being rendered on its own, in which case the day is capped and floored
   * in isolation and says so.
   */
  allocation?: DayAllocation;
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
  /** How this day's energy was allocated, and what moved. */
  allocation: DayAllocation;
  /**
   * The failsafe. When `audit.blocking` is true the pages must show the audit
   * and NOT the number — a figure this system cannot justify is a figure it has
   * no business printing.
   */
  audit: Audit;
  /** Which kitchen the day is fed from, and when it changes hands. */
  house: { morning: string; evening: string; changesToday: boolean };
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

  const adjustKcal = Number(s.kcal_adjust) || 0;
  const counted = resolution.sessions.filter((x) => x.counts && x.minutes > 0);

  // Energy is allocated across the week, not within the day. If the week has
  // already been solved, use its answer; if this day is being rendered on its
  // own, apply the same ceiling and floor in isolation and say so.
  const allocation = i.allocation ?? allocateStandalone({
    day: i.day,
    baseline: energy.baseline,
    exercise: energy.exercise,
    adjust: adjustKcal,
    minutes: counted.reduce((a, x) => a + x.minutes, 0),
    ffm: fatFreeMass(profile),
    kg: profile.weightKg,
  });

  const targets = dailyTargets({
    day: i.day,
    profile,
    energy,
    resolution,
    phase,
    adjustKcal,
    tomorrowLongestMin: i.tomorrowLongestMin,
    guttyLately,
    allocatedKcal: allocation.allocated,
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

  /* The failsafe runs on the finished numbers, not on the inputs — the whole
     point is to catch a chain that went wrong somewhere it was not being
     watched. Nothing downstream should print `targets.kcal` without checking
     `audit.blocking` first. */
  // `energy.parts` is produced by mapping over exactly this list, in order, so
  // the two line up by position. Matching by key would be prettier and would
  // also silently drop a session if a key ever went missing, which is the
  // failure this audit exists to catch.
  const perSession: AuditSession[] = counted.map((x, n) => ({
    key: x.key,
    title: x.title ?? x.disc,
    disc: x.disc,
    minutes: x.minutes,
    kcal: energy.parts[n]?.kcal ?? 0,
    source: x.source,
  }));

  const houses = housesFrom(s);
  const audit = auditDay({
    day: i.day,
    kg: profile.weightKg,
    ffm: fatFreeMass(profile),
    baseline: energy.baseline,
    exercise: energy.exercise,
    adjust: adjustKcal,
    allocationDelta: targets.allocationDelta,
    eaBump: targets.eaBumpKcal,
    rounding: targets.kcal - (energy.baseline + energy.exercise + adjustKcal + targets.allocationDelta + targets.eaBumpKcal),
    displayed: targets.kcal,
    carbG: targets.carb,
    proteinG: targets.protein,
    fatG: targets.fat,
    sessions: perSession,
    upstream: [...resolution.warnings, ...energy.warnings],
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
    allocation,
    audit,
    house: {
      morning: houseName(houseFor(i.day, '08:00', houses), houses),
      evening: houseName(houseFor(i.day, '20:00', houses), houses),
      changesToday: houseFor(i.day, '08:00', houses) !== houseFor(i.day, '20:00', houses),
    },
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
  /** How the week's energy was spread across its seven days. */
  allocation: WeekAllocation;
  /** The week-level failsafe: conservation, and day-to-day proportionality. */
  audit: Audit;
  /** Recipes, batches, portions and containers, split by house. */
  kitchen: Kitchen;
  /** One shopping list per kitchen, in whole buyable packs. */
  houseShopping: HouseShopping[];
  houseRules: string[];
};

/**
 * A week, in two passes.
 *
 * The first pass works out what each day's training actually cost. Nothing is
 * decided yet — no targets, no meals, no shopping — because a day's target is
 * not a property of that day. It is a property of the week the day sits in.
 *
 * The allocator then spreads the week's energy across its seven days, subject
 * to what a day can absorb and what a day must not fall below.
 *
 * Only then does the second pass build the targets, the meals, the batches and
 * the two shopping lists, each day now knowing what it has been given rather
 * than only what it earned.
 */
export function nutritionForWeek(i: WeekInputs): WeekNutrition {
  const s = i.settings;
  const dayList = Array.from({ length: 7 }, (_, n) => addDays(i.weekStart, n));
  const adjustKcal = Number(s.kcal_adjust) || 0;

  // Tomorrow's load has to be known before today's targets.
  const week = weekFor(s.start_date, i.weekStart);
  const planDays = weekPlan(Math.max(1, Math.min(45, week)), s);
  const nextDay = weekPlan(Math.max(1, Math.min(45, week + 1)), s);
  const longestOn = (iso: string): number => {
    const d = [...planDays, ...nextDay].find((x) => x.date === iso);
    if (!d) return 0;
    return d.sessions.reduce((m, x) => (x.disc !== 'ST' && x.minutes > m ? x.minutes : m), 0);
  };

  const inputsFor = (day: string, allocation?: DayAllocation): DayInputs => ({
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
    allocation,
  });

  /* ---- pass one: what did each day cost? ------------------------------- */

  const profile = profileFrom(s, i.currentWeightKg);
  const ffm = fatFreeMass(profile);
  const needs: DayNeed[] = dayList.map((day) => {
    const probe = nutritionForDay(inputsFor(day));
    const minutes = probe.resolution.sessions
      .filter((x) => x.counts && x.minutes > 0)
      .reduce((a, x) => a + x.minutes, 0);
    return {
      day,
      baseline: probe.energy.baseline,
      exercise: probe.energy.exercise,
      adjust: adjustKcal,
      minutes,
      ffm,
      kg: profile.weightKg,
    };
  });

  /* ---- the allocation ------------------------------------------------- */

  const allocation = allocateWeek(needs);

  /* ---- pass two: build the week against the allocation ----------------- */

  const out = dayList.map((day, n) => nutritionForDay(inputsFor(day, allocation.days[n])));
  const plans = out.map((d) => d.plan);

  /* ---- the kitchen: recipes, batches, portions, two houses ------------- */

  const houses = housesFrom(s);
  const kitchen = buildKitchen(i.weekStart, plans, houses);

  // The daily plan now points at a container rather than repeating a recipe.
  for (const p of plans) {
    for (const e of p.entries) {
      const ref = kitchen.portionFor[`${p.day}|${e.seq}`];
      e.house = houseName(houseFor(p.day, e.at, houses), houses);
      e.portion = ref
        ? {
          batchId: ref.batchId, label: ref.label, index: ref.index, of: ref.of,
          cookedG: ref.cookedG, reheat: ref.reheat, house: houseName(ref.house, houses),
        }
        : null;
    }
  }

  const houseShopping = buildHouseShopping(kitchen, houses);
  const shopping = buildShoppingList(i.weekStart, plans, Number(s.budget_gbp) || 60, i.carryOver ?? {});
  const prep = buildPrepPlan(i.weekStart, plans);

  const audit = auditWeek({
    days: out.map((d, n) => ({
      day: d.day,
      kcal: d.targets.kcal,
      exercise: d.energy.exercise,
      minutes: needs[n].minutes,
    })),
    weeklyRaw: allocation.weeklyRaw,
    weeklyAllocated: out.reduce((a, d) => a + d.targets.kcal, 0),
  });

  return {
    weekStart: i.weekStart,
    days: out,
    plans,
    shopping,
    prep,
    totals: {
      kcal: out.reduce((a, d) => a + d.targets.kcal, 0),
      cost: houseShopping.reduce((a, h) => a + h.ongoing, 0) || shopping.total,
      trainingHours: Math.round((needs.reduce((a, n) => a + n.minutes, 0) / 60) * 10) / 10,
    },
    carryOver: carryForward(shopping),
    allocation,
    audit,
    kitchen,
    houseShopping,
    houseRules: HOUSE_RULES,
  };
}

/* ----------------------------------------------------------- the race plan */

export function raceFuelPlan(s: Settings): RacePlan {
  return racePlan(profileFrom(s), Number(s.carb_tolerance) || 60);
}
