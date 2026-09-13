/**
 * Tests A–K.
 *
 * The brief is explicit that these have to pass before a plan is presented, and
 * it is right to insist. Every one of them corresponds to a way this engine has
 * actually been wrong at some point, or to a way it would have been wrong if
 * nobody had looked.
 *
 *   A  no day's target is implausible
 *   B  the week conserves energy through smoothing
 *   C  calorie steps are proportionate to training steps
 *   D  every session is counted exactly once
 *   E  the day reconciles: baseline + training + adjustment + allocation
 *   F  every batch states total quantities and portion count; nothing is
 *      multiplied by the reader
 *   G  raw and cooked weights are both stated wherever they differ
 *   H  every shopping line is a whole buyable pack, and covers what is needed
 *   I  every meal occurrence resolves to the house it is eaten from
 *   J  no weekday session is scheduled before work
 *   K  dislikes are respected, and no day is dominated by tinned beans
 *
 * Run with:  npm run test:engine
 */

import { weekPlan, weekStart, labelFor } from '@/lib/plan';
import {
  nutritionForWeek, nutritionForDay, buildPrefs, profileFrom, restingMetabolicRate,
  houseFor, housesFrom, packSpec, yieldFor, cookedG, packsNeeded, food, plural, MEAL_BY_KEY,
  ABSORB_CEILING_PER_KG, IMPLAUSIBLE_PER_KG, STEP_GAIN, STEP_FLOOR_PP,
} from '@/lib/nutrition';
import type { Settings } from '@/lib/db';

const S: Settings = {
  id: 1, athlete_name: 'A', race_date: '2027-07-25', start_date: '2026-09-14',
  weight_kg: 68, ftp: 240, css_sec: 115, five_k_sec: 1260, lthr_run: 176, lthr_bike: 168,
  bench_5rm: 70, aero_bars: true, transitions_rehearsed: false,
  badminton_fri: true, badminton_sun: true, updated_at: '',
  height_cm: 177, age_years: 18, sex: 'male', body_fat_pct: 10, pool_length_m: 25,
  budget_gbp: 60, neat_pal: 1.40, kcal_adjust: 0, sleep_mode: 'subjective',
  carb_tolerance: 45, meals_per_day: 3,
  wake_time: '06:00', bed_time: '22:30', am_time: '06:30', pm_time: '17:30', eve_time: '19:00',
  allow_pre_work: false, work_days: '1,2,3,4,5', work_start: '08:30', work_end: '17:00',
  sat_handover: '16:00', tue_handover: '18:00', dad_label: "Dad's", mum_label: "Mum's",
};

/* ------------------------------------------------------------ the harness */

type Result = { id: string; name: string; pass: boolean; detail: string[] };
const results: Result[] = [];
let currentFails: string[] = [];

function check(cond: boolean, message: string): void {
  if (!cond) currentFails.push(message);
}

function test(id: string, name: string, body: () => void): void {
  currentFails = [];
  try { body(); } catch (e) { currentFails.push(`threw: ${(e as Error).message}`); }
  results.push({ id, name, pass: currentFails.length === 0, detail: currentFails.slice(0, 8) });
}

const prefs = buildPrefs(
  [{ foodKey: 'mushrooms', raw: 'mushrooms', stance: 'dislike', note: null }],
  [], [],
);

/** The weeks the engine is exercised over: light, mid-build, and the two monsters. */
const WEEKS = [1, 6, 14, 22, 30, 38, 41, 42, 44];

const weeks = WEEKS.map((wk) => ({
  wk,
  start: weekStart(S.start_date, wk),
  n: nutritionForWeek({
    weekStart: weekStart(S.start_date, wk),
    settings: S,
    sessionsLogged: [], other: [], readiness: [], checkIns: [], tolerance: [],
    prefs, currentWeightKg: 68,
  }),
}));

/* -------------------------------------------------------------- the tests */

test('A', 'No day asks for an implausible number of calories', () => {
  for (const { wk, n } of weeks) {
    for (const d of n.days) {
      const perKg = d.targets.kcal / 68;
      check(
        perKg <= IMPLAUSIBLE_PER_KG,
        `week ${wk} ${labelFor(d.day)}: ${d.targets.kcal} kcal is ${perKg.toFixed(0)} kcal/kg, over the ${IMPLAUSIBLE_PER_KG} hard bound`,
      );
      // The comfort ceiling may only be breached where the energy-availability
      // floor demands it, and only then when the engine has said so explicitly.
      check(
        perKg <= ABSORB_CEILING_PER_KG + 1 || d.allocation.eaOverride,
        `week ${wk} ${labelFor(d.day)}: ${d.targets.kcal} kcal is ${perKg.toFixed(0)} kcal/kg, above the ${ABSORB_CEILING_PER_KG} absorbable ceiling with no energy-availability justification`,
      );
      if (d.allocation.eaOverride) {
        check(
          n.allocation.notes.some((x) => x.includes('two limits disagree')),
          `week ${wk} ${labelFor(d.day)}: ceiling was overridden without explanation`,
        );
      }
      check(
        !d.audit.blocking,
        `week ${wk} ${labelFor(d.day)} fails its own audit: ${d.audit.findings.filter((f) => f.severity === 'fail').map((f) => f.code).join(', ')}`,
      );
    }
  }
});

test('B', 'The week conserves energy through smoothing', () => {
  for (const { wk, n } of weeks) {
    const summed = n.days.reduce((a, d) => a + d.targets.kcal, 0);
    const drift = Math.abs(summed - n.allocation.weeklyRaw);
    check(
      drift <= Math.max(80, n.allocation.weeklyRaw * 0.006),
      `week ${wk}: requirement ${n.allocation.weeklyRaw}, seven targets sum to ${summed} — ${drift} kcal unaccounted`,
    );
    check(!n.audit.blocking, `week ${wk} fails the week audit: ${n.audit.findings.map((f) => f.code).join(', ')}`);
  }
});

test('C', 'Calorie steps are proportionate to training steps', () => {
  for (const { wk, n } of weeks) {
    for (let i = 1; i < n.days.length; i++) {
      const a = n.days[i - 1], b = n.days[i];
      const base = (a.targets.kcal + b.targets.kcal) / 2;
      const kcalPp = (Math.abs(b.targets.kcal - a.targets.kcal) / base) * 100;
      const lBase = Math.max(120, (a.energy.exercise + b.energy.exercise) / 2);
      const loadPp = (Math.abs(b.energy.exercise - a.energy.exercise) / lBase) * 100;
      const allowed = loadPp * STEP_GAIN + STEP_FLOOR_PP;
      check(
        kcalPp <= allowed + 3,
        `week ${wk} ${labelFor(a.day)}→${labelFor(b.day)}: food moved ${kcalPp.toFixed(0)}% on a ${loadPp.toFixed(0)}% change in training (allowed ${allowed.toFixed(0)}%)`,
      );
    }
  }
});

test('D', 'Every session is counted exactly once', () => {
  for (const { wk, n } of weeks) {
    for (const d of n.days) {
      const counted = d.resolution.sessions.filter((x) => x.counts && x.minutes > 0);
      const keys = counted.map((x) => x.key);
      check(
        new Set(keys).size === keys.length,
        `week ${wk} ${labelFor(d.day)}: duplicate session keys — ${keys.join(', ')}`,
      );
      const dup = d.audit.findings.find((f) => f.code === 'DUP_ID');
      check(!dup, `week ${wk} ${labelFor(d.day)}: ${dup?.title ?? ''}`);
    }
  }

  // And the case that actually caused this rule: the same session recorded on
  // the Today page and again on the Log page.
  const day = weekStart(S.start_date, 22);
  const planned = weekPlan(22, S).find((d) => d.date === day)!;
  const first = planned.sessions[0];
  if (first) {
    const withDouble = nutritionForDay({
      day,
      settings: S,
      sessionsLogged: [
        { id: 1, day, discipline: first.disc, plan_key: first.key, title: first.title, duration_min: first.minutes, distance: null, rpe: 5, avg_hr: null, avg_power: null, np: null, cadence: null, avg_pace_sec: null, stroke_count: null, hr_drift: null, carbs_per_h: null, niggle: null, notes: null, completed: true, created_at: '' },
        { id: 2, day, discipline: first.disc, plan_key: first.key, title: first.title, duration_min: first.minutes, distance: null, rpe: 5, avg_hr: null, avg_power: null, np: null, cadence: null, avg_pace_sec: null, stroke_count: null, hr_drift: null, carbs_per_h: null, niggle: null, notes: null, completed: true, created_at: '' },
      ],
      other: [], readiness: null, readinessHistory: [], checkIn: null, recentCheckIns: [],
      tolerance: [], prefs, intake: [], tomorrowLongestMin: 0, currentWeightKg: 68,
    });
    const counted = withDouble.resolution.sessions.filter((x) => x.counts && x.minutes > 0);
    check(
      counted.filter((x) => x.key === first.key).length === 1,
      'a session logged twice against the same plan key was counted twice',
    );
    check(
      withDouble.warnings.some((w) => /recorded against|logged twice|Only one is counted/i.test(w)),
      'a session logged twice produced no warning',
    );
  }
});

test('E', 'Every day reconciles, and can be explained in one sentence', () => {
  for (const { wk, n } of weeks) {
    for (const d of n.days) {
      const parts =
        d.energy.baseline + d.energy.exercise + d.targets.adjustKcal +
        d.targets.allocationDelta + d.targets.eaBumpKcal;
      check(
        Math.abs(parts - d.targets.kcal) <= 12,
        `week ${wk} ${labelFor(d.day)}: parts sum to ${Math.round(parts)}, target says ${d.targets.kcal}`,
      );
      check(
        !!d.audit.explanation,
        `week ${wk} ${labelFor(d.day)}: no one-sentence explanation available`,
      );
      // Training energy must equal the sum of the individual sessions — no
      // orphan calories, and none counted outside the list.
      const sessionSum = d.energy.parts.reduce((a, p) => a + p.kcal, 0);
      check(
        Math.abs(sessionSum - d.energy.exercise) <= Math.max(5, d.energy.exercise * 0.01),
        `week ${wk} ${labelFor(d.day)}: sessions sum to ${Math.round(sessionSum)} but training energy is ${d.energy.exercise}`,
      );
    }
  }
});

test('F', 'Batches state real totals and portion counts, and nothing is multiplied', () => {
  let seen = 0;
  for (const { wk, n } of weeks) {
    for (const b of n.kitchen.batches) {
      seen++;
      check(b.portions >= 1, `week ${wk} ${b.name}: ${b.portions} portions`);
      check(b.ingredients.length > 0, `week ${wk} ${b.name}: no ingredients`);
      check(b.totalRawG > 0 && b.totalCookedG > 0, `week ${wk} ${b.name}: zero weight`);
      check(
        b.portionCookedG > 80 && b.portionCookedG < 1600,
        `week ${wk} ${b.name}: ${b.portionCookedG} g a portion is not a portion`,
      );
      check(
        b.containers.length === b.portions,
        `week ${wk} ${b.name}: ${b.portions} portions but ${b.containers.length} containers`,
      );
      check(
        b.steps.length >= 3,
        `week ${wk} ${b.name}: ${b.steps.length} steps is not a method`,
      );
      // The reader must never be asked to scale anything themselves.
      const blob = b.steps.join(' ');
      check(
        !/\b(?:multiply|double|triple|scale)\s+(?:the|each|this|it|by|every|up)\b|×\s*\d+\s*(?:portions?|servings?|the)/i.test(blob),
        `week ${wk} ${b.name}: the method asks the reader to multiply something`,
      );
      // Every portion must be assigned a day and a storage decision, and the
      // storage decision must obey the food-safety window the page states —
      // two days for cooked leftovers, one for anything containing rice.
      const t = MEAL_BY_KEY.get(b.recipeKey)!;
      const hasRice = t.components.some((c) => c.food.startsWith('rice_') && c.food !== 'rice_pudding');
      const window = hasRice ? Math.min(1, t.fridgeDays) : t.fridgeDays;
      for (const c of b.containers) {
        check(!!c.forDay, `week ${wk} ${b.name}: a container has no day`);
        check(c.store === 'fridge' || c.store === 'freezer', `week ${wk} ${b.name}: container not stored`);
        if (c.store !== 'fridge') continue;
        const gap = Math.round(
          (new Date(c.forDay + 'T12:00:00Z').getTime() - new Date(b.prepDay + 'T12:00:00Z').getTime()) / 86_400_000,
        );
        check(
          gap <= window,
          `week ${wk} ${b.name}: portion ${c.index} sits in the fridge ${plural(gap, 'day')} against a ${plural(window, 'day')} window`,
        );
      }
    }
  }
  check(seen > 0, 'no batches were produced at all');
});

test('G', 'Raw and cooked weights are both stated wherever they differ', () => {
  for (const { wk, n } of weeks) {
    for (const b of n.kitchen.batches) {
      for (const ing of b.ingredients) {
        const y = yieldFor(ing.foodKey);
        if (!y || Math.abs(y.factor - 1) < 0.03) continue;
        check(
          /cooked/.test(ing.display),
          `week ${wk} ${b.name}: "${ing.name}" shows "${ing.display}" without a cooked weight`,
        );
        check(
          ing.cookedG === cookedG(ing.foodKey, ing.rawG),
          `week ${wk} ${b.name}: "${ing.name}" cooked weight does not follow from the raw weight`,
        );
      }
    }
  }
});

test('H', 'Shopping is in whole buyable packs, and covers what the batches need', () => {
  for (const { wk, n } of weeks) {
    check(n.houseShopping.length === 2, `week ${wk}: ${n.houseShopping.length} shopping lists, expected one per house`);
    for (const list of n.houseShopping) {
      check(list.lines.length > 0, `week ${wk} ${list.houseName}: empty list`);
      for (const l of list.lines) {
        check(Number.isInteger(l.packs) && l.packs >= 1, `week ${wk} ${list.houseName}: ${l.name} × ${l.packs}`);
        check(
          l.boughtG + 1 >= l.neededG,
          `week ${wk} ${list.houseName}: ${l.name} buys ${l.boughtG} g but ${l.neededG} g is needed`,
        );
        check(!!l.packNoun, `week ${wk} ${list.houseName}: ${l.name} has no pack description`);
        check(l.cost > 0, `week ${wk} ${list.houseName}: ${l.name} costs nothing`);
      }
    }
    // Whole-unit foods must never appear at a fractional unit anywhere in a plan.
    for (const p of n.plans) {
      for (const e of p.entries) {
        for (const it of e.items) {
          const spec = packSpec(it.foodKey);
          if (!spec.wholeOnly || !spec.unitG) continue;
          const units = it.grams / spec.unitG;
          check(
            Math.abs(units - Math.round(units)) < 0.02,
            `week ${wk} ${labelFor(p.day)}: "${it.name}" at ${it.grams} g is ${units.toFixed(2)} ${spec.unit}s`,
          );
        }
      }
    }
  }
});

test('I', 'Every meal resolves to the kitchen it is eaten from', () => {
  const cfg = housesFrom(S);
  for (const { wk, n } of weeks) {
    for (const p of n.plans) {
      for (const e of p.entries) {
        check(!!e.house, `week ${wk} ${labelFor(p.day)} ${e.at} "${e.title}": no house`);
        if (e.portion) {
          check(
            e.portion.house === e.house,
            `week ${wk} ${labelFor(p.day)} ${e.at}: portion comes from ${e.portion.house} but the meal is eaten from ${e.house}`,
          );
          check(e.portion.index >= 1 && e.portion.index <= e.portion.of, `week ${wk}: portion ${e.portion.index} of ${e.portion.of}`);
        }
      }
    }
    // The handover rules themselves.
    const mon = n.weekStart;
    const d = (k: number) => new Date(new Date(mon + 'T12:00:00Z').getTime() + k * 86_400_000).toISOString().slice(0, 10);
    check(houseFor(d(0), '08:00', cfg) === 'dad', `week ${wk}: Monday morning is not at Dad's`);
    check(houseFor(d(1), '08:00', cfg) === 'dad', `week ${wk}: Tuesday's packed lunch does not come from Dad's`);
    check(houseFor(d(1), '20:00', cfg) === 'mum', `week ${wk}: Tuesday dinner is not at Mum's`);
    check(houseFor(d(3), '12:00', cfg) === 'mum', `week ${wk}: Thursday is not at Mum's`);
    check(houseFor(d(5), '12:00', cfg) === 'mum', `week ${wk}: Saturday lunch is not from Mum's`);
    check(houseFor(d(5), '19:00', cfg) === 'dad', `week ${wk}: Saturday dinner is not at Dad's`);
    check(houseFor(d(6), '12:00', cfg) === 'dad', `week ${wk}: Sunday is not at Dad's`);

    // And a batch must never be cooked at one house for a day spent at the other.
    for (const b of n.kitchen.batches) {
      for (const c of b.containers) {
        const eatenAt = n.plans
          .find((p) => p.day === c.forDay)?.entries
          .find((e) => e.portion?.batchId === b.id && e.portion.index === c.index);
        if (!eatenAt) continue;
        check(
          eatenAt.house === b.houseName,
          `week ${wk}: "${b.name}" is cooked at ${b.houseName} but ${c.forLabel}'s portion is eaten at ${eatenAt.house}`,
        );
      }
    }
  }
});

test('J', 'No weekday session is scheduled before work', () => {
  for (let wk = 1; wk <= 45; wk++) {
    for (const d of weekPlan(wk, S)) {
      if (d.dow > 5) continue;
      for (const s of d.sessions) {
        check(
          s.slot !== 'AM' || s.minutes === 0,
          `week ${wk} ${labelFor(d.date)}: "${s.title}" is still in the morning slot`,
        );
      }
    }
  }
  // And the override still works, because it is a default and not a law.
  const opted: Settings = { ...S, allow_pre_work: true };
  const anyMorning = Array.from({ length: 10 }, (_, i) => weekPlan(i + 4, opted))
    .flat().filter((d) => d.dow <= 5)
    .some((d) => d.sessions.some((s) => s.slot === 'AM' && s.minutes > 0));
  check(anyMorning, 'allow_pre_work = true no longer restores morning sessions');
});

test('K', 'Dislikes are respected, and no day is dominated by tinned beans', () => {
  const BEANS = ['baked_beans', 'kidney_beans', 'chickpeas'];
  for (const { wk, n } of weeks) {
    for (const p of n.plans) {
      for (const e of p.entries) {
        for (const it of e.items) {
          check(
            it.foodKey !== 'mushrooms',
            `week ${wk} ${labelFor(p.day)}: "${e.title}" contains mushrooms`,
          );
        }
      }
      const dayP = p.entries.reduce((a, e) => a + e.p, 0);
      let beanP = 0;
      for (const e of p.entries) {
        for (const it of e.items) {
          if (!BEANS.includes(it.foodKey)) continue;
          beanP += (food(it.foodKey).p * it.grams) / 100;
        }
      }
      check(
        dayP === 0 || beanP / dayP <= 0.4,
        `week ${wk} ${labelFor(p.day)}: ${Math.round((beanP / dayP) * 100)}% of the day's protein comes from tinned beans`,
      );
      const beanMeals = p.entries.filter((e) => e.items.some((it) => BEANS.includes(it.foodKey))).length;
      check(
        beanMeals <= 2,
        `week ${wk} ${labelFor(p.day)}: ${beanMeals} meals built on tinned beans`,
      );
    }
  }
});

/* ------------------------------------------------------------------ report */

const rmr = restingMetabolicRate(profileFrom(S)).kcal;
console.log(`\nEngine tests · RMR ${rmr} kcal · baseline ${Math.round(rmr * 1.4)} kcal · ${weeks.length} weeks exercised\n`);

for (const r of results) {
  console.log(`${r.pass ? ' PASS ' : ' FAIL '} ${r.id}  ${r.name}`);
  for (const d of r.detail) console.log(`        ${d}`);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed.`);

/* A short profile of the weeks, so the numbers are visible and not just asserted. */
console.log('\nWeek profiles');
for (const { wk, n } of weeks) {
  const ks = n.days.map((d) => d.targets.kcal);
  const raws = n.allocation.days.map((d) => d.raw);
  console.log(
    `  wk ${String(wk).padStart(2)}  ${String(n.totals.trainingHours).padStart(4)} h  ` +
    `raw ${Math.min(...raws)}–${Math.max(...raws)}  →  offered ${Math.min(...ks)}–${Math.max(...ks)}  ` +
    `spread ${(Math.max(...ks) / Math.min(...ks)).toFixed(2)}×  moved ${n.allocation.moved} kcal  ` +
    `till £${n.houseShopping.reduce((a, h) => a + h.total, 0).toFixed(2)} / ` +
    `eaten £${n.houseShopping.reduce((a, h) => a + h.ongoing, 0).toFixed(2)} ` +
    `(${n.houseShopping.map((h) => `${h.houseName} £${h.ongoing.toFixed(2)}`).join(', ')})`,
  );
}

void packsNeeded;
process.exit(failed.length ? 1 : 0);
