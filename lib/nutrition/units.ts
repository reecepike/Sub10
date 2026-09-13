/**
 * Real-world packaging, and the raw-to-cooked conversion.
 *
 * Two things break a meal plan the moment it meets an actual kitchen.
 *
 * The first is fractional packaging. "100 g of tuna" is not a thing you can do:
 * the Aldi tin is 145 g gross and drains to about 102 g, and nobody weighs out
 * two thirds of a tin and puts the rest back. Same for an egg, a wrap, a bagel,
 * a slice of bread, a tin of beans. These have to be counted, not weighed, and
 * the plan has to be built around the whole unit and then rebalanced — which is
 * what the flexible carbohydrate in `absorb.ts` is for.
 *
 * The second is raw versus cooked. 100 g of dry rice is 270 g on the plate.
 * 100 g of raw chicken is 72 g cooked. A plan that says "180 g chicken" without
 * saying which one it means is out by 40%, every single time, in whichever
 * direction the reader guesses. Every quantity in this system therefore carries
 * its state, and anywhere the two differ the plan prints both.
 */

import { Food, food } from './foods';

/* ---------------------------------------------------------------- packaging */

export type PackSpec = {
  /** Usable grams in one indivisible kitchen unit — one tin, one egg, one wrap. */
  unitG?: number;
  /** Singular noun for that unit. */
  unit?: string;
  /** Plural, when it is not just +s. */
  plural?: string;
  /**
   * Usable grams from one pack as bought, after draining, peeling or trimming.
   * Defaults to the pack weight. A 145 g tin of tuna gives 102 g of tuna.
   */
  usablePerPack?: number;
  /** True when the unit cannot sensibly be split — a tin, an egg, a wrap. */
  wholeOnly: boolean;
  /** How the pack is described on a shopping list. */
  packNoun?: string;
  note?: string;
};

/**
 * Only the foods where this actually matters. A bag of rice is a bag of rice:
 * you take what you need and the rest stays in the bag.
 */
export const PACKS: Record<string, PackSpec> = {
  /* Tins. The pack weight includes the liquid; the drained weight is the food. */
  tuna: {
    unitG: 102, unit: 'tin', usablePerPack: 102, wholeOnly: true, packNoun: 'tin (145 g)',
    note: 'The tin is 145 g gross and drains to about 102 g. Use the whole tin — half a tin of tuna in the fridge is a tin of tuna in the bin.',
  },
  mackerel: { unitG: 110, unit: 'tin', usablePerPack: 110, wholeOnly: true, packNoun: 'tin (125 g)', note: '125 g tin, about 110 g once the sauce is counted in.' },
  chickpeas: { unitG: 240, unit: 'tin', usablePerPack: 240, wholeOnly: true, packNoun: 'tin (400 g)', note: '400 g tin, 240 g drained.' },
  kidney_beans: { unitG: 240, unit: 'tin', usablePerPack: 240, wholeOnly: true, packNoun: 'tin (400 g)', note: '400 g tin, 240 g drained.' },
  baked_beans: { unitG: 420, unit: 'tin', usablePerPack: 420, wholeOnly: true, packNoun: 'tin (420 g)' },
  tomatoes_tinned: { unitG: 400, unit: 'tin', usablePerPack: 400, wholeOnly: true, packNoun: 'tin (400 g)' },
  rice_pudding: { unitG: 400, unit: 'tin', usablePerPack: 400, wholeOnly: true, packNoun: 'tin (400 g)' },
  passata: { unitG: 500, unit: 'carton', usablePerPack: 500, wholeOnly: false, packNoun: 'carton (500 g)', note: 'Opened passata keeps three days in the fridge, so a part carton is fine if the rest gets used this week.' },

  /* Counted things. */
  eggs: { unitG: 53, unit: 'egg', usablePerPack: 318, wholeOnly: true, packNoun: 'box of 6', note: 'A medium egg is about 63 g in the shell, 53 g of actual egg.' },
  bananas: { unitG: 120, unit: 'banana', usablePerPack: 600, wholeOnly: true, packNoun: 'bunch of 5', note: 'About 120 g peeled.' },
  apples: { unitG: 130, unit: 'apple', usablePerPack: 780, wholeOnly: true, packNoun: 'bag of 6' },
  oranges: { unitG: 150, unit: 'orange', usablePerPack: 600, wholeOnly: true, packNoun: 'bag of 4' },
  wraps: { unitG: 56, unit: 'wrap', usablePerPack: 448, wholeOnly: true, packNoun: 'pack of 8' },
  bagels: { unitG: 85, unit: 'bagel', usablePerPack: 425, wholeOnly: true, packNoun: 'pack of 5' },
  bread_white: { unitG: 40, unit: 'slice', usablePerPack: 800, wholeOnly: true, packNoun: '800 g loaf (20 slices)' },
  bread_wholemeal: { unitG: 40, unit: 'slice', usablePerPack: 800, wholeOnly: true, packNoun: '800 g loaf (20 slices)' },
  flapjack: { unitG: 40, unit: 'bar', usablePerPack: 240, wholeOnly: true, packNoun: 'pack of 6' },
  fish_fingers: { unitG: 28, unit: 'fish finger', usablePerPack: 250, wholeOnly: true, packNoun: 'box of 9' },
  stock_cubes: { unitG: 10, unit: 'cube', usablePerPack: 100, wholeOnly: true, packNoun: 'pack of 10' },
  garlic: { unitG: 5, unit: 'clove', usablePerPack: 150, wholeOnly: true, packNoun: 'pack of 3 bulbs' },
  peppers: { unitG: 160, unit: 'pepper', usablePerPack: 480, wholeOnly: true, packNoun: 'pack of 3' },
  onions: { unitG: 110, unit: 'onion', usablePerPack: 1000, wholeOnly: true, packNoun: '1 kg bag', note: 'A medium onion is about 110 g peeled.' },

  /* Things sold whole but used in part — the pack is bought entire, the food is not. */
  potatoes: { usablePerPack: 2250, wholeOnly: false, packNoun: '2.5 kg bag', note: 'Weights are the potato as it comes; about 10% is lost to peeling if you peel, which for jackets and traybakes you do not.' },
  gammon: { usablePerPack: 1000, wholeOnly: false, packNoun: 'joint (~1 kg)', note: 'Cooked whole on prep day and sliced through the week — the joint is one unit, the slices are not.' },
  chicken_frozen: { usablePerPack: 1000, wholeOnly: false, packNoun: '1 kg bag' },
  chicken_fresh: { usablePerPack: 1000, wholeOnly: false, packNoun: '1 kg pack' },
  chicken_thigh: { usablePerPack: 1000, wholeOnly: false, packNoun: '1 kg pack' },
  salmon_frozen: { unitG: 125, unit: 'fillet', usablePerPack: 500, wholeOnly: true, packNoun: 'pack of 4 fillets' },
  mince_5: { usablePerPack: 500, wholeOnly: false, packNoun: '500 g pack' },
  mince_20: { usablePerPack: 500, wholeOnly: false, packNoun: '500 g pack' },
  bacon: { unitG: 30, unit: 'rasher', usablePerPack: 300, wholeOnly: true, packNoun: 'pack of 10 rashers' },
  milk_whole: { usablePerPack: 2270, wholeOnly: false, packNoun: '4 pints (2.27 L)' },
  milk_semi: { usablePerPack: 3410, wholeOnly: false, packNoun: '6 pints (3.41 L)' },

  /* Sold by volume. The catalogue stores millilitres in the grams field, which
     is fine for the maths and wrong on a shopping list, so the noun is set. */
  oil_veg: { usablePerPack: 1000, wholeOnly: false, packNoun: '1 L bottle' },
  oil_olive: { usablePerPack: 1000, wholeOnly: false, packNoun: '1 L bottle' },
  soy_sauce: { usablePerPack: 150, wholeOnly: false, packNoun: '150 ml bottle' },
  squash: { usablePerPack: 1500, wholeOnly: false, packNoun: '1.5 L bottle' },
  passata_ml: { usablePerPack: 500, wholeOnly: false, packNoun: 'carton (500 g)' },
  herbs: { usablePerPack: 30, wholeOnly: false, packNoun: 'jar' },
  salt: { usablePerPack: 750, wholeOnly: false, packNoun: '750 g tub' },
  honey: { usablePerPack: 340, wholeOnly: false, packNoun: '340 g jar' },
  jam: { usablePerPack: 454, wholeOnly: false, packNoun: '454 g jar' },
  peanut_butter: { usablePerPack: 340, wholeOnly: false, packNoun: '340 g jar' },
  sugar: { usablePerPack: 1000, wholeOnly: false, packNoun: '1 kg bag' },
  oats: { usablePerPack: 1000, wholeOnly: false, packNoun: '1 kg bag' },
  rice_white: { usablePerPack: 1000, wholeOnly: false, packNoun: '1 kg bag' },
  rice_basmati: { usablePerPack: 1000, wholeOnly: false, packNoun: '1 kg bag' },
  pasta: { usablePerPack: 500, wholeOnly: false, packNoun: '500 g bag' },
  spaghetti: { usablePerPack: 500, wholeOnly: false, packNoun: '500 g bag' },
  couscous: { usablePerPack: 500, wholeOnly: false, packNoun: '500 g bag' },
  lentils: { usablePerPack: 500, wholeOnly: false, packNoun: '500 g bag' },
  chips_frozen: { usablePerPack: 1500, wholeOnly: false, packNoun: '1.5 kg bag' },
  peas_frozen: { usablePerPack: 1000, wholeOnly: false, packNoun: '1 kg bag' },
  mixed_veg_frozen: { usablePerPack: 1000, wholeOnly: false, packNoun: '1 kg bag' },
  broccoli_frozen: { usablePerPack: 900, wholeOnly: false, packNoun: '900 g bag' },
  sweetcorn_frozen: { usablePerPack: 1000, wholeOnly: false, packNoun: '1 kg bag' },
  berries_frozen: { usablePerPack: 1000, wholeOnly: false, packNoun: '1 kg bag' },
  sultanas: { usablePerPack: 500, wholeOnly: false, packNoun: '500 g bag' },
  carrots: { usablePerPack: 1000, wholeOnly: false, packNoun: '1 kg bag' },
  cheddar_grated: { usablePerPack: 500, wholeOnly: false, packNoun: '500 g pack' },
  butter: { usablePerPack: 250, wholeOnly: false, packNoun: '250 g block' },
  yoghurt_natural: { usablePerPack: 500, wholeOnly: false, packNoun: '500 g pot' },
  yoghurt_greek: { usablePerPack: 1000, wholeOnly: false, packNoun: '1 kg pot' },
  skyr: { usablePerPack: 450, wholeOnly: false, packNoun: '450 g pot' },
  cottage_cheese: { usablePerPack: 300, wholeOnly: false, packNoun: '300 g pot' },
  spinach: { usablePerPack: 260, wholeOnly: false, packNoun: '260 g bag' },
  green_beans: { usablePerPack: 220, wholeOnly: false, packNoun: '220 g pack' },
  flour_sr: { usablePerPack: 1500, wholeOnly: false, packNoun: '1.5 kg bag' },
  cornflakes: { usablePerPack: 500, wholeOnly: false, packNoun: '500 g box' },
};

export function packSpec(key: string): PackSpec {
  return PACKS[key] ?? { wholeOnly: false };
}

/** Usable grams from one pack as bought. */
export function usablePerPack(f: Food): number {
  return packSpec(f.key).usablePerPack ?? f.packG;
}

/**
 * Round a quantity to something a person can actually serve.
 *
 * Whole-unit foods go to the nearest whole unit, never below one. Everything
 * else rounds to 5 g, which is the finest a kitchen scale is worth trusting.
 */
export function toUsable(key: string, grams: number): { grams: number; units: number | null; display: string } {
  const spec = packSpec(key);
  const f = food(key);
  if (spec.wholeOnly && spec.unitG) {
    const n = Math.max(grams > 0 ? 1 : 0, Math.round(grams / spec.unitG));
    const g = n * spec.unitG;
    const noun = n === 1 ? spec.unit! : (spec.plural ?? `${spec.unit}s`);
    return { grams: g, units: n, display: `${n} ${noun} (${Math.round(g)} g)` };
  }
  const g = Math.max(0, Math.round(grams / 5) * 5);
  void f;
  return { grams: g, units: null, display: `${g} g` };
}

/** Whole packs to buy for a given usable quantity. */
export function packsNeeded(f: Food, usableGrams: number): { packs: number; packNoun: string; boughtG: number } {
  const per = usablePerPack(f);
  const packs = per > 0 ? Math.ceil(usableGrams / per - 1e-9) : 0;
  return {
    packs: Math.max(0, packs),
    packNoun: packSpec(f.key).packNoun ?? `${f.packG >= 1000 ? `${f.packG / 1000} kg` : `${f.packG} g`} pack`,
    boughtG: Math.max(0, packs) * f.packG,
  };
}

/* ------------------------------------------------------------ raw vs cooked */

export type Yield = {
  /** cooked weight ÷ raw weight */
  factor: number;
  /** What the raw state is called on a plan: 'dry', 'raw', 'frozen'. */
  rawWord: string;
  note?: string;
};

/**
 * Cooked yields, from standard food-composition conversions.
 *
 * Dry grains and pasta gain water; meat loses it. The macro figures in
 * `foods.ts` are per 100 g of the food in the state the pack describes — dry
 * for rice and pasta, raw for meat — so the maths is always done on the raw
 * weight and the cooked weight is printed alongside it so the container makes
 * sense when it comes out of the fridge.
 */
export const YIELDS: Record<string, Yield> = {
  rice_white: { factor: 2.7, rawWord: 'dry', note: '100 g dry rice is about 270 g cooked.' },
  rice_basmati: { factor: 2.8, rawWord: 'dry' },
  pasta: { factor: 2.4, rawWord: 'dry', note: '100 g dry pasta is about 240 g cooked.' },
  spaghetti: { factor: 2.4, rawWord: 'dry' },
  couscous: { factor: 2.8, rawWord: 'dry' },
  lentils: { factor: 2.4, rawWord: 'dry' },

  chicken_frozen: { factor: 0.72, rawWord: 'raw', note: '1 kg of raw chicken breast cooks down to about 720 g.' },
  chicken_fresh: { factor: 0.72, rawWord: 'raw' },
  chicken_thigh: { factor: 0.75, rawWord: 'raw' },
  mince_5: { factor: 0.72, rawWord: 'raw', note: 'Lean mince loses about 28% — mostly water, some fat.' },
  mince_20: { factor: 0.65, rawWord: 'raw' },
  pork_mince: { factor: 0.70, rawWord: 'raw' },
  gammon: { factor: 0.78, rawWord: 'raw' },
  bacon: { factor: 0.55, rawWord: 'raw' },
  salmon_frozen: { factor: 0.80, rawWord: 'frozen' },

  potatoes: { factor: 0.95, rawWord: 'raw' },
  sweet_potato: { factor: 0.92, rawWord: 'raw' },
  chips_frozen: { factor: 0.80, rawWord: 'frozen' },
  broccoli_frozen: { factor: 0.95, rawWord: 'frozen' },
  mixed_veg_frozen: { factor: 0.95, rawWord: 'frozen' },
  peas_frozen: { factor: 1.0, rawWord: 'frozen' },
  sweetcorn_frozen: { factor: 1.0, rawWord: 'frozen' },
  carrots: { factor: 0.92, rawWord: 'raw' },
  onions: { factor: 0.60, rawWord: 'raw', note: 'Onions cook down a long way. 110 g raw is about 65 g in the pan.' },
  green_beans: { factor: 0.95, rawWord: 'raw' },
  spinach: { factor: 0.30, rawWord: 'raw', note: 'Spinach collapses to about a third. A 260 g bag is two spoonfuls cooked.' },
  eggs: { factor: 0.90, rawWord: 'raw' },
};

export function yieldFor(key: string): Yield | null {
  return YIELDS[key] ?? null;
}

/** Cooked grams from raw grams. */
export function cookedG(key: string, rawGrams: number): number {
  const y = yieldFor(key);
  return Math.round(rawGrams * (y ? y.factor : 1));
}

/** Raw grams needed for a wanted cooked weight. */
export function rawG(key: string, cookedGrams: number): number {
  const y = yieldFor(key);
  return Math.round(cookedGrams / (y ? y.factor : 1));
}

/**
 * The one-line description that never lets the reader guess.
 *
 * "500 g dry rice (1,350 g cooked)" for the things that change, plain grams for
 * the things that do not.
 */
export function describeQty(key: string, rawGrams: number, opts: { units?: boolean } = {}): string {
  const spec = packSpec(key);
  const y = yieldFor(key);
  const g = Math.round(rawGrams);
  let head: string;
  if (opts.units !== false && spec.wholeOnly && spec.unitG) {
    const n = Math.max(1, Math.round(g / spec.unitG));
    const noun = n === 1 ? spec.unit! : (spec.plural ?? `${spec.unit}s`);
    head = `${n} ${noun} (${fmt(g)} g${y && y.factor !== 1 ? ` ${y.rawWord}` : ''})`;
  } else {
    head = `${fmt(g)} g${y && y.factor !== 1 ? ` ${y.rawWord}` : ''}`;
  }
  if (!y || Math.abs(y.factor - 1) < 0.03) return head;
  return `${head} → ${fmt(cookedG(key, g))} g cooked`;
}

export function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-GB');
}

/** "1 portion", "5 portions". Small, but a plan that says "1 portions" looks unfinished. */
export function plural(n: number, one: string, many?: string): string {
  return `${n.toLocaleString('en-GB')} ${n === 1 ? one : (many ?? `${one}s`)}`;
}

/* ------------------------------------------------------------- shelf life */

/**
 * How long a pack realistically lasts, in weeks.
 *
 * This is a different question from `perishable`, which only says whether a
 * thing lives in the fridge. A 2.5 kg bag of potatoes is perishable and keeps
 * for a month; a 500 g pack of mince is perishable and has to be cooked or
 * frozen in three days. Getting these confused produced a shopping list that
 * told him 2.25 kg of potatoes would go in the bin, which is both wrong and the
 * kind of wrong that makes someone stop trusting the rest of the page.
 */
const KEEPS_WEEKS: Record<string, number> = {
  // fridge, but keeps a long time
  potatoes: 4, sweet_potato: 3, onions: 6, carrots: 3, garlic: 8,
  cheddar_grated: 3, butter: 6, eggs: 3,
  // fridge, about a fortnight
  yoghurt_natural: 2, yoghurt_greek: 2, skyr: 2, cottage_cheese: 1.5,
  // days
  milk_whole: 0.8, milk_semi: 0.8, spinach: 0.7, green_beans: 1, peppers: 1.5,
  mushrooms: 0.7, bananas: 0.7, apples: 2, oranges: 2,
  // freeze it or cook it
  chicken_fresh: 0.4, chicken_thigh: 0.4, mince_5: 0.4, mince_20: 0.4,
  pork_mince: 0.4, gammon: 0.6, bacon: 1,
  // bread keeps a few days, or goes in the freezer
  bread_white: 0.7, bread_wholemeal: 0.7, bagels: 0.7, wraps: 1.5, malt_loaf: 1.5,
};

export function keepsWeeks(f: Food): number {
  const override = KEEPS_WEEKS[f.key];
  if (override != null) return override;
  return f.perishable ? 1 : 8;
}

/** What to actually do with what is left in the pack. */
export function leftoverAdvice(f: Food, leftoverG: number): string | null {
  if (leftoverG < 40) return null;
  const w = keepsWeeks(f);
  const g = fmt(leftoverG);
  if (w >= 2) return `${g} g left in the pack — it keeps, so it comes off next week's list.`;
  if (w >= 1) return `${g} g left — it will keep the week out, so plan to use it rather than buying more.`;
  if (f.freezable) return `${g} g left, and it does not keep. Freeze it on the day you buy it: portion it first, because a frozen 500 g block is one meal whether you want it to be or not.`;
  return `${g} g left, and it neither keeps nor freezes. Either build it into another meal this week or buy the smaller pack and accept the higher unit price.`;
}
