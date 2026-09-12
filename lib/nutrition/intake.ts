/**
 * "I only ate half my dinner."
 *
 * Deviations are normal and the plan should absorb them without ceremony. This
 * turns a sentence into a macro delta against today's plan, so the rest of the
 * day can be re-stated rather than the athlete being told off.
 */

import { food, macrosFor, FOODS } from './foods';
import type { PlanEntry } from './dayplan';
import { matchFood } from './prefs';

export type Delta = {
  kcal: number;
  p: number;
  c: number;
  f: number;
  fibre: number;
  /** What the engine understood, in plain words. */
  read: string;
  matched: boolean;
};

const FRACTIONS: [RegExp, number][] = [
  [/\b(all|the whole|every bit)\b/, 1],
  [/\bthree quarters|3\/4\b/, 0.75],
  [/\b(most of)\b/, 0.75],
  [/\b(two thirds)\b/, 0.67],
  [/\b(half|1\/2)\b/, 0.5],
  [/\b(a third|1\/3)\b/, 0.33],
  [/\b(a quarter|1\/4)\b/, 0.25],
  [/\b(none|nothing|barely any|hardly any)\b/, 0],
];

const NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  couple: 2, few: 3,
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9/\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const MEAL_WORDS: Record<string, PlanEntry['kind'][]> = {
  breakfast: ['breakfast'],
  lunch: ['lunch'],
  dinner: ['dinner'],
  tea: ['dinner'],
  snack: ['snack'],
  recovery: ['post'],
};

/** A sensible single portion, for "an extra banana". */
function unitGrams(key: string): number {
  switch (key) {
    case 'bananas': return 120;
    case 'eggs': return 63;
    case 'bread_white':
    case 'bread_wholemeal': return 40;
    case 'bagels': return 85;
    case 'wraps': return 56;
    case 'milk_whole':
    case 'milk_semi': return 300;
    case 'apples': return 130;
    case 'oranges': return 150;
    case 'yoghurt_greek':
    case 'yoghurt_natural': return 170;
    case 'skyr': return 150;
    case 'flapjack': return 40;
    case 'malt_loaf': return 45;
    case 'rice_pudding': return 400;
    case 'peanut_butter': return 20;
    case 'cheddar_grated': return 30;
    default: return 100;
  }
}

const UNIT_NAME: Record<string, string> = {
  bananas: 'banana', eggs: 'egg', bread_white: 'slice of bread',
  bread_wholemeal: 'slice of bread', bagels: 'bagel', wraps: 'wrap',
  milk_whole: 'glass of milk', milk_semi: 'glass of milk', apples: 'apple',
  oranges: 'orange', flapjack: 'oat bar', malt_loaf: 'slice of malt loaf',
};

/**
 * @param raw     what the athlete typed
 * @param entries today's planned entries, so "my dinner" means something
 */
export function readIntake(raw: string, entries: PlanEntry[]): Delta {
  const t = norm(raw);
  const zero: Delta = { kcal: 0, p: 0, c: 0, f: 0, fibre: 0, read: '', matched: false };

  /* --- did they skip or part-eat a planned meal? ------------------------ */
  const skipping = /\b(skip|skipped|missed|did not eat|didnt eat|didn t eat)\b/.test(t);
  const onlyAte = /\b(only|just)\b/.test(t) || /\bhalf my\b/.test(t);

  for (const [word, kinds] of Object.entries(MEAL_WORDS)) {
    if (!t.includes(word)) continue;
    const entry = entries.find((e) => kinds.includes(e.kind));
    if (!entry) continue;

    let ate = 1;
    if (skipping) ate = 0;
    else if (onlyAte) {
      ate = 0.5;
      for (const [re, v] of FRACTIONS) if (re.test(t)) { ate = v; break; }
    } else {
      let found = false;
      for (const [re, v] of FRACTIONS) if (re.test(t)) { ate = v; found = true; break; }
      if (!found) continue;      // mentions the meal but says nothing about how much
    }

    const k = ate - 1;           // negative: the shortfall against the plan
    return {
      kcal: Math.round(entry.kcal * k),
      p: Math.round(entry.p * k),
      c: Math.round(entry.c * k),
      f: Math.round(entry.f * k),
      fibre: Math.round(entry.fibre * k),
      read: ate === 0
        ? `${entry.title} skipped — ${Math.abs(Math.round(entry.kcal))} kcal and ${Math.abs(Math.round(entry.c))} g of carbohydrate that the rest of today has to carry.`
        : `${Math.round(ate * 100)}% of ${entry.title}.`,
      matched: true,
    };
  }

  /* --- an extra (or fewer) of something --------------------------------- */
  const negative = /\b(instead of|without|left|didn t have|didnt have|no )\b/.test(t) && !/\bextra\b/.test(t);
  const m = matchFood(t);
  if (m.foodKey) {
    let n = 1;
    const numWord = Object.keys(NUMBERS).find((w) => new RegExp(`\\b${w}\\b`).test(t));
    const digit = /\b(\d+)\b/.exec(t);
    if (digit) n = Number(digit[1]);
    else if (numWord) n = NUMBERS[numWord];

    // An explicit weight beats a count.
    const grams = /\b(\d+)\s*g\b/.exec(t);
    const g = grams ? Number(grams[1]) : n * unitGrams(m.foodKey);

    const f = food(m.foodKey);
    const mac = macrosFor(f, g * (negative ? -1 : 1));
    const unit = UNIT_NAME[m.foodKey];
    return {
      kcal: Math.round(mac.kcal), p: Math.round(mac.p), c: Math.round(mac.c),
      f: Math.round(mac.f), fibre: Math.round(mac.fibre),
      read: `${negative ? 'Minus' : 'Plus'} ${grams ? `${g} g of ${f.name.toLowerCase()}` : unit ? `${n} ${unit}${n === 1 ? '' : 's'}` : `${g} g of ${f.name.toLowerCase()}`}.`,
      matched: true,
    };
  }

  return { ...zero, read: 'I could not work out what that referred to — log it with the numbers below instead, or name a food from the list.' };
}

/** Everything the parser can currently recognise, for the help text. */
export const KNOWN_FOODS = FOODS.filter((f) => f.category !== 'store').map((f) => f.name);
