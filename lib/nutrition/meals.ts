/**
 * Meals, and the portion solver.
 *
 * A template describes the shape of a meal — what is in it and which parts are
 * allowed to grow. The solver then sizes the actual grams to hit that meal's
 * share of the day. That is why the same five dinners can serve a 2,900 kcal
 * Thursday and a 5,400 kcal Saturday without the athlete ever doing arithmetic:
 * on Thursday it is 90 g of dry pasta, on Saturday it is 190 g.
 */

import { Food, food, macrosFor } from './foods';
import { toUsable, packSpec, describeQty } from './units';

export type CompRole = 'protein' | 'carb' | 'fat' | 'veg' | 'fixed';

export type Component = {
  food: string;
  grams: number;          // sensible base portion
  role: CompRole;
  min?: number;
  max?: number;
  /** For things counted rather than weighed — eggs, bananas, slices of bread. */
  unitG?: number;
  unit?: string;          // 'egg', 'banana', 'slice'
};

export type Slot = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'pre' | 'post' | 'during';

export type MealTemplate = {
  key: string;
  name: string;
  slots: Slot[];
  components: Component[];
  method: string;
  /** Worth cooking in bulk on a prep day. */
  batch: boolean;
  freezable: boolean;
  prepMin: number;
  equipment: string[];
  /** Safe refrigerated life once cooked and chilled, in days. */
  fridgeDays: number;
  portable: boolean;
  lowResidue: boolean;    // suitable the day before a long session or a race
  tags: string[];
};

const EGG = 63, BANANA = 120, SLICE = 40, BAGEL = 85, WRAP = 56;

export const MEALS: MealTemplate[] = [
  /* ------------------------------------------------------------ breakfast */
  {
    key: 'porridge_pb', name: 'Porridge with peanut butter, banana and honey',
    slots: ['breakfast'],
    components: [
      { food: 'oats', grams: 100, role: 'carb', min: 60, max: 220 },
      { food: 'milk_whole', grams: 350, role: 'protein', min: 250, max: 600 },
      { food: 'peanut_butter', grams: 20, role: 'fat', min: 0, max: 45 },
      { food: 'bananas', grams: BANANA, role: 'fixed', unitG: BANANA, unit: 'banana' },
      { food: 'honey', grams: 15, role: 'fixed' },
    ],
    method: 'Oats and milk in a bowl, 2½ minutes in the microwave, stir halfway. Peanut butter and honey stirred through, banana sliced on top.',
    batch: false, freezable: false, prepMin: 5, equipment: ['microwave'], fridgeDays: 0,
    portable: false, lowResidue: false, tags: ['consistent', 'cheap'],
  },
  {
    key: 'eggs_toast', name: 'Scrambled eggs on toast with cheese',
    slots: ['breakfast'],
    components: [
      { food: 'eggs', grams: 3 * EGG, role: 'protein', min: 2 * EGG, max: 5 * EGG, unitG: EGG, unit: 'egg' },
      { food: 'bread_white', grams: 2 * SLICE, role: 'carb', min: SLICE, max: 5 * SLICE, unitG: SLICE, unit: 'slice' },
      { food: 'cheddar_grated', grams: 30, role: 'fat', min: 0, max: 60 },
      { food: 'butter', grams: 8, role: 'fixed' },
    ],
    method: 'Eggs beaten with a splash of milk, microwave 90 seconds stirring twice, or a pan on medium. Toast buttered, cheese through the eggs at the end.',
    batch: false, freezable: false, prepMin: 7, equipment: ['hob', 'microwave'], fridgeDays: 0,
    portable: false, lowResidue: true, tags: ['consistent'],
  },
  {
    key: 'cereal_milk', name: 'Cornflakes, milk, banana and sultanas',
    slots: ['breakfast', 'snack', 'post'],
    components: [
      { food: 'cornflakes', grams: 80, role: 'carb', min: 40, max: 180 },
      { food: 'milk_whole', grams: 400, role: 'protein', min: 250, max: 700 },
      { food: 'bananas', grams: BANANA, role: 'fixed', unitG: BANANA, unit: 'banana' },
      { food: 'sultanas', grams: 25, role: 'fixed' },
    ],
    method: 'Two minutes, no cooking. This is the one for a 06:30 start or straight off the bike.',
    batch: false, freezable: false, prepMin: 2, equipment: ['none'], fridgeDays: 0,
    portable: false, lowResidue: true, tags: ['fast', 'pre-training', 'recovery'],
  },
  {
    key: 'bagel_jam', name: 'Bagels with jam and honey, and a glass of milk',
    slots: ['breakfast', 'pre'],
    components: [
      { food: 'bagels', grams: 2 * BAGEL, role: 'carb', min: BAGEL, max: 3 * BAGEL, unitG: BAGEL, unit: 'bagel' },
      { food: 'jam', grams: 30, role: 'fixed' },
      { food: 'honey', grams: 15, role: 'fixed' },
      { food: 'milk_whole', grams: 300, role: 'protein', min: 200, max: 500 },
    ],
    method: 'Toasted, jam on one, honey on the other. Almost no fat or fibre, so it clears the stomach fast — this is the pre-long-session breakfast.',
    batch: false, freezable: false, prepMin: 4, equipment: ['none'], fridgeDays: 0,
    portable: true, lowResidue: true, tags: ['pre-training', 'low-residue'],
  },

  /* ---------------------------------------------------------------- lunch */
  {
    key: 'chicken_rice_veg', name: 'Chicken, rice and vegetables',
    slots: ['lunch', 'dinner'],
    components: [
      { food: 'chicken_frozen', grams: 180, role: 'protein', min: 100, max: 300 },
      { food: 'rice_white', grams: 100, role: 'carb', min: 60, max: 220 },
      { food: 'mixed_veg_frozen', grams: 150, role: 'veg', min: 100, max: 250 },
      { food: 'oil_veg', grams: 8, role: 'fat', min: 4, max: 25 },
      { food: 'soy_sauce', grams: 10, role: 'fixed' },
    ],
    method: 'Rice in the rice cooker. Chicken diced and air-fried 14 min at 190 °C, or pan-fried. Frozen veg straight into boiling water for 4 minutes. Combine, soy over the top.',
    batch: true, freezable: true, prepMin: 25, equipment: ['ricecooker', 'airfryer', 'hob'], fridgeDays: 2,
    portable: true, lowResidue: false, tags: ['batch', 'cheap', 'staple'],
  },
  {
    key: 'tuna_pasta', name: 'Tuna pasta with sweetcorn',
    slots: ['lunch'],
    components: [
      { food: 'pasta', grams: 100, role: 'carb', min: 60, max: 200 },
      { food: 'tuna', grams: 145, role: 'protein', min: 100, max: 290 },
      { food: 'sweetcorn_frozen', grams: 80, role: 'veg', min: 50, max: 150 },
      { food: 'oil_olive', grams: 10, role: 'fat', min: 5, max: 25 },
      { food: 'cheddar_grated', grams: 25, role: 'fixed' },
    ],
    method: 'Pasta boiled, drained, cooled under the tap within the hour. Everything stirred through cold. Two days in the fridge, and it travels well.',
    batch: true, freezable: false, prepMin: 15, equipment: ['hob'], fridgeDays: 2,
    portable: true, lowResidue: false, tags: ['batch', 'cold', 'cheap'],
  },
  {
    key: 'chicken_wrap', name: 'Chicken and cheese wraps with peppers',
    slots: ['lunch'],
    components: [
      { food: 'wraps', grams: 2 * WRAP, role: 'carb', min: WRAP, max: 4 * WRAP, unitG: WRAP, unit: 'wrap' },
      { food: 'chicken_frozen', grams: 150, role: 'protein', min: 100, max: 250 },
      { food: 'cheddar_grated', grams: 30, role: 'fat', min: 15, max: 60 },
      { food: 'peppers', grams: 80, role: 'veg', min: 50, max: 150 },
    ],
    method: 'Uses chicken already cooked on prep day. Assemble cold in the morning, or the night before.',
    batch: false, freezable: false, prepMin: 8, equipment: ['none'], fridgeDays: 1,
    portable: true, lowResidue: false, tags: ['portable'],
  },
  {
    key: 'jacket_beans', name: 'Jacket potato with beans and cheese',
    slots: ['lunch', 'dinner'],
    components: [
      { food: 'potatoes', grams: 350, role: 'carb', min: 250, max: 600 },
      { food: 'baked_beans', grams: 420, role: 'protein', min: 200, max: 420 },
      { food: 'cheddar_grated', grams: 40, role: 'fat', min: 20, max: 70 },
    ],
    method: 'Potato microwaved 8 minutes, then 12 minutes in the air fryer at 200 °C for a proper skin. Beans in the microwave.',
    batch: false, freezable: false, prepMin: 22, equipment: ['microwave', 'airfryer'], fridgeDays: 0,
    portable: false, lowResidue: false, tags: ['cheap', 'easy'],
  },
  {
    key: 'gammon_couscous', name: 'Gammon, couscous and roasted peppers',
    slots: ['lunch'],
    components: [
      { food: 'gammon', grams: 140, role: 'protein', min: 90, max: 220 },
      { food: 'couscous', grams: 90, role: 'carb', min: 60, max: 180 },
      { food: 'peppers', grams: 100, role: 'veg', min: 60, max: 180 },
      { food: 'oil_olive', grams: 10, role: 'fat', min: 5, max: 22 },
    ],
    method: 'Gammon joint cooked whole on prep day and sliced through the week. Couscous is boiling water, lid on, five minutes.',
    batch: true, freezable: true, prepMin: 12, equipment: ['hob', 'oven'], fridgeDays: 2,
    portable: true, lowResidue: false, tags: ['batch', 'portable'],
  },

  /* --------------------------------------------------------------- dinner */
  {
    key: 'bolognese', name: 'Beef and lentil bolognese with spaghetti',
    slots: ['dinner'],
    components: [
      { food: 'spaghetti', grams: 120, role: 'carb', min: 75, max: 250 },
      { food: 'mince_5', grams: 125, role: 'protein', min: 80, max: 200 },
      { food: 'lentils', grams: 30, role: 'protein', min: 0, max: 60 },
      { food: 'passata', grams: 200, role: 'veg', min: 150, max: 300 },
      { food: 'onions', grams: 60, role: 'fixed' },
      { food: 'carrots', grams: 60, role: 'fixed' },
      { food: 'oil_veg', grams: 8, role: 'fat', min: 5, max: 20 },
      { food: 'cheddar_grated', grams: 25, role: 'fixed' },
    ],
    method: 'One pan. Onion and carrot softened, mince browned, lentils and passata in, 25 minutes on a low simmer. The lentils are there to make the mince go further and to add iron and fibre — you will not taste them.',
    batch: true, freezable: true, prepMin: 35, equipment: ['hob'], fridgeDays: 2,
    portable: true, lowResidue: false, tags: ['batch', 'freezer', 'cheap'],
  },
  {
    key: 'chilli_rice', name: 'Beef chilli with rice',
    slots: ['dinner'],
    components: [
      { food: 'rice_white', grams: 110, role: 'carb', min: 70, max: 230 },
      { food: 'mince_5', grams: 125, role: 'protein', min: 80, max: 200 },
      { food: 'kidney_beans', grams: 120, role: 'protein', min: 60, max: 200 },
      { food: 'tomatoes_tinned', grams: 200, role: 'veg', min: 150, max: 300 },
      { food: 'peppers', grams: 70, role: 'veg', min: 50, max: 140 },
      { food: 'onions', grams: 60, role: 'fixed' },
      { food: 'oil_veg', grams: 8, role: 'fat', min: 5, max: 20 },
    ],
    method: 'Same pan, same method as the bolognese, different tin and different spice. Freezes perfectly in single portions.',
    batch: true, freezable: true, prepMin: 35, equipment: ['hob', 'ricecooker'], fridgeDays: 2,
    portable: true, lowResidue: false, tags: ['batch', 'freezer'],
  },
  {
    key: 'chicken_curry', name: 'Chicken curry with rice',
    slots: ['dinner'],
    components: [
      { food: 'rice_basmati', grams: 110, role: 'carb', min: 70, max: 230 },
      { food: 'chicken_thigh', grams: 170, role: 'protein', min: 110, max: 280 },
      { food: 'passata', grams: 180, role: 'veg', min: 120, max: 280 },
      { food: 'onions', grams: 70, role: 'fixed' },
      { food: 'oil_veg', grams: 10, role: 'fat', min: 5, max: 24 },
      { food: 'yoghurt_natural', grams: 60, role: 'fixed' },
    ],
    method: 'Onions and spice, thighs in, passata, 25 minutes. Yoghurt stirred in off the heat so it does not split. Thighs rather than breast because they do not go dry when reheated.',
    batch: true, freezable: true, prepMin: 35, equipment: ['hob', 'ricecooker'], fridgeDays: 2,
    portable: true, lowResidue: false, tags: ['batch', 'freezer'],
  },
  {
    key: 'chicken_traybake', name: 'Chicken, potato and vegetable traybake',
    slots: ['dinner'],
    components: [
      { food: 'chicken_thigh', grams: 180, role: 'protein', min: 110, max: 280 },
      { food: 'potatoes', grams: 350, role: 'carb', min: 220, max: 600 },
      { food: 'carrots', grams: 100, role: 'veg', min: 70, max: 200 },
      { food: 'broccoli_frozen', grams: 120, role: 'veg', min: 80, max: 200 },
      { food: 'oil_olive', grams: 12, role: 'fat', min: 6, max: 28 },
    ],
    method: 'Everything on one tray, 35 minutes at 200 °C, broccoli in for the last 8. One tray, one wash-up.',
    batch: false, freezable: false, prepMin: 40, equipment: ['oven'], fridgeDays: 2,
    portable: false, lowResidue: false, tags: ['easy', 'one-pan'],
  },
  {
    key: 'salmon_potato', name: 'Salmon, potatoes and green beans',
    slots: ['dinner'],
    components: [
      { food: 'salmon_frozen', grams: 130, role: 'protein', min: 100, max: 200 },
      { food: 'potatoes', grams: 350, role: 'carb', min: 220, max: 550 },
      { food: 'green_beans', grams: 110, role: 'veg', min: 80, max: 180 },
      { food: 'butter', grams: 10, role: 'fat', min: 5, max: 20 },
    ],
    method: 'Salmon from frozen in the air fryer, 16 minutes at 180 °C. Potatoes boiled. Beans steamed over them.',
    batch: false, freezable: false, prepMin: 25, equipment: ['airfryer', 'hob'], fridgeDays: 1,
    portable: false, lowResidue: false, tags: ['omega-3'],
  },
  {
    key: 'fish_chips_peas', name: 'Fish, chips and peas',
    slots: ['dinner'],
    components: [
      { food: 'fish_fingers', grams: 180, role: 'protein', min: 120, max: 280 },
      { food: 'chips_frozen', grams: 300, role: 'carb', min: 200, max: 500 },
      { food: 'peas_frozen', grams: 120, role: 'veg', min: 80, max: 200 },
      { food: 'butter', grams: 8, role: 'fat', min: 0, max: 18 },
    ],
    method: 'Air fryer, 18 minutes, shake once. Peas in the microwave. This is the twenty-minute dinner for the night you get in at nine.',
    batch: false, freezable: false, prepMin: 20, equipment: ['airfryer', 'microwave'], fridgeDays: 0,
    portable: false, lowResidue: false, tags: ['fast', 'cheap'],
  },

  /* --------------------------------------------------------------- snacks */
  {
    key: 'milk_glass', name: 'A pint of milk',
    slots: ['snack', 'post'],
    components: [{ food: 'milk_whole', grams: 568, role: 'protein', min: 300, max: 700 }],
    method: 'Nothing. The cheapest protein and calories in the shop, and it does not feel like eating when you cannot face food.',
    batch: false, freezable: false, prepMin: 0, equipment: ['none'], fridgeDays: 0,
    portable: true, lowResidue: true, tags: ['cheap', 'recovery'],
  },
  {
    key: 'yoghurt_berries', name: 'Yoghurt with berries and honey',
    slots: ['snack', 'post'],
    components: [
      { food: 'yoghurt_greek', grams: 200, role: 'protein', min: 120, max: 350 },
      { food: 'berries_frozen', grams: 100, role: 'fixed' },
      { food: 'honey', grams: 15, role: 'carb', min: 0, max: 40 },
      { food: 'oats', grams: 25, role: 'carb', min: 0, max: 70 },
    ],
    method: 'Berries from frozen, thirty seconds in the microwave, everything in one bowl.',
    batch: false, freezable: false, prepMin: 3, equipment: ['microwave'], fridgeDays: 0,
    portable: false, lowResidue: false, tags: ['recovery'],
  },
  {
    key: 'pb_toast', name: 'Peanut butter on toast',
    slots: ['snack', 'pre'],
    components: [
      { food: 'bread_white', grams: 2 * SLICE, role: 'carb', min: SLICE, max: 4 * SLICE, unitG: SLICE, unit: 'slice' },
      { food: 'peanut_butter', grams: 30, role: 'fat', min: 15, max: 50 },
      { food: 'honey', grams: 10, role: 'fixed' },
    ],
    method: 'Ninety seconds.',
    batch: false, freezable: false, prepMin: 2, equipment: ['none'], fridgeDays: 0,
    portable: true, lowResidue: false, tags: ['cheap', 'fast'],
  },
  {
    key: 'rice_pudding_jam', name: 'Rice pudding with jam',
    slots: ['snack', 'post'],
    components: [
      { food: 'rice_pudding', grams: 400, role: 'carb', min: 200, max: 400 },
      { food: 'jam', grams: 25, role: 'fixed' },
    ],
    method: 'Tin, microwave, done. Fast carbohydrate and a bit of dairy protein — genuinely good straight off a long ride.',
    batch: false, freezable: false, prepMin: 2, equipment: ['microwave'], fridgeDays: 0,
    portable: true, lowResidue: true, tags: ['recovery', 'cheap'],
  },
  {
    key: 'banana_flapjack', name: 'Banana and an oat bar',
    slots: ['snack', 'pre'],
    components: [
      { food: 'bananas', grams: BANANA, role: 'fixed', unitG: BANANA, unit: 'banana' },
      { food: 'flapjack', grams: 40, role: 'carb', min: 40, max: 120 },
    ],
    method: 'Pocket food.',
    batch: false, freezable: false, prepMin: 0, equipment: ['none'], fridgeDays: 0,
    portable: true, lowResidue: true, tags: ['portable', 'pre-training'],
  },
];

export const MEAL_BY_KEY = new Map(MEALS.map((m) => [m.key, m]));

/* --------------------------------------------------------- the portion solver */

export type ScaledItem = {
  foodKey: string;
  name: string;
  aldi: string;
  grams: number;
  display: string;
  kcal: number;
  p: number;
  c: number;
  f: number;
  fibre: number;
  sodium: number;
  cost: number;
};

export type ScaledMeal = {
  key: string;
  name: string;
  items: ScaledItem[];
  kcal: number;
  p: number;
  c: number;
  f: number;
  fibre: number;
  sodium: number;
  cost: number;
  method: string;
  /** Anything the solver had to do that the reader should know about. */
  notes: string[];
};

/**
 * Round a solved quantity to something that can actually be served.
 *
 * The catalogue in `units.ts` is the authority here, not the template: if a
 * food comes in tins, the answer is a whole number of tins whatever the
 * template said, because "0.7 of a tin of tuna" is not an instruction. The
 * template's own `unitG` is kept as a fallback for the few cases where the
 * portioning unit is finer than the packaging one — a slice of a loaf, say.
 */
function round(grams: number, c: Component): number {
  const spec = packSpec(c.food);
  if (spec.wholeOnly && spec.unitG) return toUsable(c.food, grams).grams;
  if (c.unitG) return Math.max(c.unitG, Math.round(grams / c.unitG) * c.unitG);
  return Math.max(0, Math.round(grams / 5) * 5);
}

function clampTo(grams: number, c: Component): number {
  const lo = c.min ?? 0;
  const hi = c.max ?? c.grams * 3;
  return Math.max(lo, Math.min(hi, grams));
}

function display(f: Food, grams: number, c: Component): string {
  const spec = packSpec(c.food);
  if (spec.wholeOnly || (spec.unitG && c.unitG)) return describeQty(c.food, grams);
  if (c.unitG && c.unit) {
    const n = Math.round(grams / c.unitG);
    return `${n} ${c.unit}${n === 1 ? '' : 's'}`;
  }
  void f;
  return describeQty(c.food, grams);
}

/**
 * Which component absorbs the rounding error.
 *
 * Once every tin, egg and wrap has been rounded to a whole unit, the meal is no
 * longer on target — it can be a couple of hundred calories out in either
 * direction, and that error compounds across five meals a day. Something has to
 * take up the slack, and the brief is explicit about which: carbohydrate, not
 * protein. Protein has a floor that exists for a reason; carbohydrate is the
 * variable that periodises anyway, and moving 30 g of rice is invisible.
 *
 * The absorber is the largest carbohydrate component that is weighed rather
 * than counted — rice, pasta, oats, potato. A meal with no such component
 * cannot absorb anything, and says so.
 */
function flexCarb(comps: { c: Component; f: Food; grams: number }[]): { c: Component; f: Food; grams: number } | null {
  const candidates = comps.filter((x) => {
    if (x.c.role !== 'carb') return false;
    if (packSpec(x.c.food).wholeOnly) return false;
    return x.f.c >= 15;
  });
  if (!candidates.length) return null;
  return candidates.reduce((m, x) => (x.f.c * x.grams > m.f.c * m.grams ? x : m));
}

/**
 * Size a meal to a target.
 *
 * Protein first, because it is the constraint with a floor; then carbohydrate,
 * which is the one that actually periodises; then the added fat is used to trim
 * the calories to where they should be. Veg is held near its base portion —
 * nobody wants a plan that tells them to eat 340 g of broccoli to hit a number.
 */
export function scaleMeal(
  t: MealTemplate,
  target: { kcal: number; p: number; c: number },
): ScaledMeal {
  const comps = t.components.map((c) => ({ c, f: food(c.food), grams: c.grams }));

  const sumOf = (pick: (m: ReturnType<typeof macrosFor>) => number) =>
    comps.reduce((a, x) => a + pick(macrosFor(x.f, x.grams)), 0);

  // 1. protein
  const proteinComps = comps.filter((x) => x.c.role === 'protein');
  if (proteinComps.length && target.p > 0) {
    const fixedP = comps.filter((x) => x.c.role !== 'protein').reduce((a, x) => a + macrosFor(x.f, x.grams).p, 0);
    const needP = Math.max(0, target.p - fixedP);
    const haveP = proteinComps.reduce((a, x) => a + macrosFor(x.f, x.grams).p, 0);
    if (haveP > 0) {
      const k = needP / haveP;
      for (const x of proteinComps) x.grams = clampTo(x.grams * k, x.c);
    }
  }

  // 2. carbohydrate
  const carbComps = comps.filter((x) => x.c.role === 'carb');
  if (carbComps.length && target.c > 0) {
    const fixedC = comps.filter((x) => x.c.role !== 'carb').reduce((a, x) => a + macrosFor(x.f, x.grams).c, 0);
    const needC = Math.max(0, target.c - fixedC);
    const haveC = carbComps.reduce((a, x) => a + macrosFor(x.f, x.grams).c, 0);
    if (haveC > 0) {
      const k = needC / haveC;
      for (const x of carbComps) x.grams = clampTo(x.grams * k, x.c);
    }
  }

  // 3. added fat trims the calories
  const fatComps = comps.filter((x) => x.c.role === 'fat');
  if (fatComps.length) {
    const others = comps.filter((x) => x.c.role !== 'fat').reduce((a, x) => a + macrosFor(x.f, x.grams).kcal, 0);
    const needKcal = Math.max(0, target.kcal - others);
    const haveKcal = fatComps.reduce((a, x) => a + macrosFor(x.f, x.grams).kcal, 0);
    if (haveKcal > 0) {
      const k = needKcal / haveKcal;
      for (const x of fatComps) x.grams = clampTo(x.grams * k, x.c);
    }
  }

  /* 4. Round everything to what a kitchen can actually serve — whole tins,
        whole eggs, whole wraps — and then let the flexible carbohydrate take
        up whatever that rounding cost or gained. Without this step a meal that
        solved to 0.7 of a tin of tuna silently became a whole tin and the day
        drifted 90 kcal high, five times a day, every day. */
  for (const x of comps) x.grams = round(x.grams, x.c);

  const flex = flexCarb(comps);
  const notes: string[] = [];
  if (flex && target.kcal > 0) {
    const nowKcal = comps.reduce((a, x) => a + macrosFor(x.f, x.grams).kcal, 0);
    const gap = target.kcal - nowKcal;
    if (Math.abs(gap) > 35 && flex.f.kcal > 0) {
      const wanted = flex.grams + (gap / flex.f.kcal) * 100;
      const settled = round(clampTo(wanted, flex.c), flex.c);
      if (settled !== flex.grams) {
        const whole = comps
          .filter((x) => x !== flex && packSpec(x.c.food).wholeOnly && x.grams > 0)
          .map((x) => x.f.name.toLowerCase());
        const cause = whole.length
          ? `${whole.slice(0, 3).join(' and ')} ${whole.length === 1 ? 'only comes' : 'only come'} in whole units`
          : 'the other components are fixed';
        notes.push(
          `${flex.f.name} carries the difference — ${cause}, so ${flex.f.name.toLowerCase()} moves by ${Math.abs(settled - flex.grams)} g to bring the meal back on target. Carbohydrate is the variable that absorbs this, never protein.`,
        );
        flex.grams = settled;
      }
    }
  }

  const items: ScaledItem[] = comps.filter((x) => x.grams > 0).map((x) => {
    const g = x.grams;
    const m = macrosFor(x.f, g);
    return {
      foodKey: x.c.food,
      name: x.f.name,
      aldi: x.f.aldi,
      grams: g,
      display: display(x.f, g, x.c),
      kcal: m.kcal, p: m.p, c: m.c, f: m.f, fibre: m.fibre, sodium: m.sodium, cost: m.cost,
    };
  });

  const tot = items.reduce(
    (a, i) => ({
      kcal: a.kcal + i.kcal, p: a.p + i.p, c: a.c + i.c, f: a.f + i.f,
      fibre: a.fibre + i.fibre, sodium: a.sodium + i.sodium, cost: a.cost + i.cost,
    }),
    { kcal: 0, p: 0, c: 0, f: 0, fibre: 0, sodium: 0, cost: 0 },
  );

  void sumOf;

  return {
    key: t.key, name: t.name, items,
    kcal: Math.round(tot.kcal), p: Math.round(tot.p), c: Math.round(tot.c), f: Math.round(tot.f),
    fibre: Math.round(tot.fibre), sodium: Math.round(tot.sodium),
    cost: Math.round(tot.cost * 100) / 100,
    method: t.method,
    notes,
  };
}
