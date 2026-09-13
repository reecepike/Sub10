/**
 * Batch preparation, within the rules.
 *
 * The temptation with meal prep is to cook seven days on a Sunday and put it
 * all in the fridge. That is not a time-saving, it is a food-poisoning risk:
 * UK guidance is to eat cooked leftovers within two days, and cooked rice
 * within one, because Bacillus cereus spores survive cooking and multiply at
 * fridge-door temperatures.
 *
 * So the plan is: cook a lot, refrigerate two days of it, freeze the rest on
 * the day it is cooked, and say exactly when to move each portion down. That
 * gets nearly all of the convenience and none of the risk.
 */

import type { DayPlan } from './dayplan';
import { MEAL_BY_KEY } from './meals';
import { addDays, labelFor } from '../plan';

export type PrepBatch = {
  meal: string;
  mealKey: string;
  portions: number;
  fridgePortions: number;
  freezerPortions: number;
  method: string;
  prepMin: number;
  equipment: string[];
  quantities: { name: string; grams: number; display: string }[];
  storage: string;
  reheat: string;
  servesDays: string[];
};

export type MoveInstruction = { on: string; what: string };

export type PrepDay = {
  day: string;
  label: string;
  title: string;
  totalMin: number;
  batches: PrepBatch[];
  order: string[];
};

export type PrepPlan = {
  weekStart: string;
  days: PrepDay[];
  moves: MoveInstruction[];
  freshDays: { day: string; label: string; what: string[] }[];
  rules: string[];
};

const RULES = [
  'Cool anything cooked within one hour — spread it out in a shallow container rather than leaving the pan on the hob. Getting it into the fridge fast is most of food safety.',
  'Cooked meals keep two days in the fridge. Anything for day three onwards goes in the freezer on the day it is cooked, not on day two when you notice.',
  'Cooked rice is the strict one: refrigerate within an hour and eat within 24 hours, or freeze it straight away. It is the single most common cause of a bad night from batch cooking.',
  'Reheat once, until it is steaming hot all the way through — above 75 °C. If you have reheated it, you eat it or bin it; it does not go back.',
  'Label every frozen portion with what it is and the date. In March you will not remember.',
];

/** How many days ahead a meal can be eaten from the fridge. */
function fridgeWindow(mealKey: string): number {
  return MEAL_BY_KEY.get(mealKey)?.fridgeDays ?? 0;
}

export function buildPrepPlan(weekStart: string, days: DayPlan[]): PrepPlan {
  // Which batchable meals appear, and on which days.
  const usage = new Map<string, string[]>();
  for (const d of days) {
    for (const e of d.entries) {
      if (!e.mealKey) continue;
      const t = MEAL_BY_KEY.get(e.mealKey);
      if (!t || !t.batch) continue;
      const list = usage.get(e.mealKey) ?? [];
      list.push(d.day);
      usage.set(e.mealKey, list);
    }
  }

  // Ingredient totals per meal across the week, so the batch has real quantities.
  const quantities = new Map<string, Map<string, number>>();
  for (const d of days) {
    for (const e of d.entries) {
      if (!e.mealKey || !usage.has(e.mealKey)) continue;
      const per = quantities.get(e.mealKey) ?? new Map<string, number>();
      for (const it of e.items) per.set(it.name, (per.get(it.name) ?? 0) + it.grams);
      quantities.set(e.mealKey, per);
    }
  }

  const sunday = weekStart;                // the plan's week starts Monday…
  const prepSunday = addDays(weekStart, -1); // …so the big cook is the Sunday before
  const prepWednesday = addDays(weekStart, 2);

  const sundayBatches: PrepBatch[] = [];
  const wednesdayBatches: PrepBatch[] = [];
  const moves: MoveInstruction[] = [];

  for (const [mealKey, servedOn] of usage) {
    const t = MEAL_BY_KEY.get(mealKey)!;
    const sorted = [...servedOn].sort();
    const window = fridgeWindow(mealKey);

    // Split the week: what Sunday can cover from the fridge, what has to freeze,
    // and what is better cooked fresh on Wednesday.
    const sundayServes = sorted.filter((d) => {
      const gap = Math.round((new Date(d + 'T12:00:00Z').getTime() - new Date(prepSunday + 'T12:00:00Z').getTime()) / 86_400_000);
      return gap <= window;
    });
    const laterServes = sorted.filter((d) => !sundayServes.includes(d));

    const wednesdayServes = t.freezable
      ? []
      : laterServes.filter((d) => {
        const gap = Math.round((new Date(d + 'T12:00:00Z').getTime() - new Date(prepWednesday + 'T12:00:00Z').getTime()) / 86_400_000);
        return gap >= 0 && gap <= window;
      });
    const frozenServes = laterServes.filter((d) => !wednesdayServes.includes(d));

    const perMeal = quantities.get(mealKey) ?? new Map<string, number>();
    const totalPortions = sorted.length;
    const qty = [...perMeal.entries()].map(([name, grams]) => ({
      name,
      grams: Math.round(grams),
      display: `${Math.round(grams)} g`,
    }));

    if (sundayServes.length + frozenServes.length > 0) {
      const n = sundayServes.length + frozenServes.length;
      sundayBatches.push({
        meal: t.name,
        mealKey,
        portions: n,
        fridgePortions: sundayServes.length,
        freezerPortions: frozenServes.length,
        method: t.method,
        prepMin: t.prepMin + Math.max(0, (n - 1) * 4),
        equipment: t.equipment,
        quantities: qty.map((q) => ({ ...q, grams: Math.round((q.grams * n) / totalPortions), display: `${Math.round((q.grams * n) / totalPortions)} g` })),
        storage: frozenServes.length
          ? `${sundayServes.length} portion${sundayServes.length === 1 ? '' : 's'} into the fridge, ${frozenServes.length} into the freezer the same evening. Do not leave the freezer ones "until tomorrow".`
          : `${sundayServes.length} portion${sundayServes.length === 1 ? '' : 's'} into the fridge, eaten within ${t.fridgeDays} days.`,
        reheat: mealKey.includes('rice') || t.components.some((c) => c.food.startsWith('rice'))
          ? 'Microwave 3–4 minutes, stirring once, until steaming right through. Rice especially — lukewarm rice is the one that makes people ill.'
          : 'Microwave 3–4 minutes, stirring once, or 10 minutes in a pan. Steaming hot throughout.',
        servesDays: [...sundayServes, ...frozenServes].map(labelFor),
      });

      for (const d of frozenServes) {
        moves.push({
          on: addDays(d, -1),
          what: `Move one portion of ${t.name} from the freezer to the fridge tonight, for ${labelFor(d)}.`,
        });
      }
    }

    if (wednesdayServes.length) {
      const n = wednesdayServes.length;
      wednesdayBatches.push({
        meal: t.name, mealKey, portions: n,
        fridgePortions: n, freezerPortions: 0,
        method: t.method,
        prepMin: t.prepMin,
        equipment: t.equipment,
        quantities: qty.map((q) => ({ ...q, grams: Math.round((q.grams * n) / totalPortions), display: `${Math.round((q.grams * n) / totalPortions)} g` })),
        storage: `${n} portion${n === 1 ? '' : 's'} into the fridge — this is the midweek top-up, so it is eaten within ${t.fridgeDays} days.`,
        reheat: 'Microwave 3–4 minutes, stirring once, until steaming right through.',
        servesDays: wednesdayServes.map(labelFor),
      });
    }
  }

  /* Everything cooked fresh, so the week does not look emptier than it is. */
  const batched = new Set(usage.keys());
  const freshDays = days.map((d) => ({
    day: d.day,
    label: labelFor(d.day),
    what: d.entries
      .filter((e) => e.mealKey && !batched.has(e.mealKey) && (e.kind === 'breakfast' || e.kind === 'lunch' || e.kind === 'dinner'))
      .map((e) => e.title),
  })).filter((x) => x.what.length);

  const order = (bs: PrepBatch[]): string[] => {
    const out: string[] = [];
    if (bs.some((b) => b.equipment.includes('oven'))) out.push('Oven on first — it takes ten minutes to get to temperature and everything else waits for it.');
    if (bs.some((b) => b.equipment.includes('ricecooker'))) out.push('Rice on next: it looks after itself, and rice is the thing that has to be cooled fastest afterwards.');
    if (bs.some((b) => b.equipment.includes('hob'))) out.push('Then the pan meals — bolognese and chilli use the same pan back to back, so do them in a row and wash up once.');
    if (bs.some((b) => b.equipment.includes('airfryer'))) out.push('Air fryer last, while the rest is cooling.');
    out.push('Portion into containers as each thing finishes, lids off until cool, then lids on and straight into the fridge or freezer.');
    return out;
  };

  const prepDays: PrepDay[] = [];
  if (sundayBatches.length) {
    prepDays.push({
      day: prepSunday, label: labelFor(prepSunday), title: 'Sunday — the main cook',
      totalMin: Math.round(sundayBatches.reduce((a, b) => a + b.prepMin, 0) * 0.7),
      batches: sundayBatches, order: order(sundayBatches),
    });
  }
  if (wednesdayBatches.length) {
    prepDays.push({
      day: prepWednesday, label: labelFor(prepWednesday), title: 'Wednesday — the top-up',
      totalMin: wednesdayBatches.reduce((a, b) => a + b.prepMin, 0),
      batches: wednesdayBatches, order: order(wednesdayBatches),
    });
  }

  moves.sort((a, b) => a.on.localeCompare(b.on));

  void sunday;

  return { weekStart, days: prepDays, moves, freshDays, rules: RULES };
}
