/**
 * "I don't like Greek yoghurt."
 *
 * The useful move is not to find a similar food — it is to work out what job
 * that food was doing and find the cheapest thing that does the same job. Greek
 * yoghurt in this plan is protein, calcium and a bit of carbohydrate in a form
 * that needs no cooking. Milk does all four for less money. Cottage cheese does
 * three. Chicken does one of them, which is why swapping yoghurt for chicken
 * would be a bad answer even though both are "protein".
 *
 * Two standing rules, because they were asked for explicitly and because they
 * are right: never replace something with a more expensive food when a cheaper
 * one does the same job, and never let tinned beans take over the diet.
 */

import { FOODS, Food, Role, food, allFoods, swapClass, pricePer100Kcal, pricePerProtein, pricePer100 } from './foods';
import { MEALS, MealTemplate } from './meals';

export type Stance = 'like' | 'dislike' | 'never' | 'gi_problem';

export type FoodPref = { foodKey: string | null; raw: string; stance: Stance; note?: string | null };
export type MealPref = { mealKey: string; stance: 'like' | 'dislike' };
export type Restriction = { name: string; kind: string; severity: string };

/* --------------------------------------------------------------- matching */

const SYNONYMS: Record<string, string> = {
  'greek yoghurt': 'yoghurt_greek', 'greek yogurt': 'yoghurt_greek',
  'yoghurt': 'yoghurt_natural', 'yogurt': 'yoghurt_natural', 'skyr': 'skyr',
  'milk': 'milk_whole', 'whole milk': 'milk_whole', 'semi skimmed': 'milk_semi',
  'cheese': 'cheddar_grated', 'cheddar': 'cheddar_grated', 'cottage cheese': 'cottage_cheese',
  'chicken': 'chicken_frozen', 'chicken breast': 'chicken_frozen', 'chicken thighs': 'chicken_thigh',
  'mince': 'mince_5', 'beef': 'mince_5', 'beef mince': 'mince_5', 'pork': 'pork_mince',
  'gammon': 'gammon', 'ham': 'gammon', 'bacon': 'bacon',
  'eggs': 'eggs', 'egg': 'eggs',
  'tuna': 'tuna', 'salmon': 'salmon_frozen', 'mackerel': 'mackerel', 'fish fingers': 'fish_fingers',
  'lentils': 'lentils', 'chickpeas': 'chickpeas', 'beans': 'baked_beans',
  'baked beans': 'baked_beans', 'kidney beans': 'kidney_beans',
  'oats': 'oats', 'porridge': 'oats', 'cereal': 'cornflakes', 'cornflakes': 'cornflakes',
  'rice': 'rice_white', 'basmati': 'rice_basmati', 'pasta': 'pasta', 'spaghetti': 'spaghetti',
  'bread': 'bread_white', 'toast': 'bread_white', 'slice of bread': 'bread_white',
  'wholemeal': 'bread_wholemeal', 'bagels': 'bagels', 'wraps': 'wraps',
  'potatoes': 'potatoes', 'sweet potato': 'sweet_potato', 'chips': 'chips_frozen',
  'couscous': 'couscous', 'peanut butter': 'peanut_butter', 'butter': 'butter',
  'olive oil': 'oil_olive', 'oil': 'oil_veg',
  'peas': 'peas_frozen', 'mixed veg': 'mixed_veg_frozen', 'broccoli': 'broccoli_frozen',
  'sweetcorn': 'sweetcorn_frozen', 'carrots': 'carrots', 'onions': 'onions',
  'mushrooms': 'mushrooms', 'peppers': 'peppers', 'spinach': 'spinach', 'green beans': 'green_beans',
  'bananas': 'bananas', 'banana': 'bananas', 'apples': 'apples', 'oranges': 'oranges',
  'berries': 'berries_frozen', 'sultanas': 'sultanas', 'raisins': 'sultanas',
  'honey': 'honey', 'jam': 'jam', 'sugar': 'sugar', 'malt loaf': 'malt_loaf',
  'flapjack': 'flapjack', 'oat bars': 'flapjack', 'rice pudding': 'rice_pudding',
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Find the food (or meal) a free-text phrase is talking about. */
export function matchFood(raw: string): { foodKey: string | null; mealKey: string | null } {
  const t = norm(raw);

  // Meals first. "Chicken curry makes me bloated" is about the curry, not about
  // chicken — and swapping the chicken out of every meal in the week because of
  // one dish they did not get on with would be a bad answer.
  let bestMeal: { key: string; hits: number } | null = null;
  for (const m of MEALS) {
    const words = norm(m.name).split(' ').filter((w) => w.length > 4);
    const hits = words.filter((w) => t.includes(w)).length;
    if (hits >= 2 && (!bestMeal || hits > bestMeal.hits)) bestMeal = { key: m.key, hits };
  }
  if (bestMeal) return { foodKey: null, mealKey: bestMeal.key };

  // Longest synonym first, so 'greek yoghurt' beats 'yoghurt'.
  const keys = Object.keys(SYNONYMS).sort((a, b) => b.length - a.length);
  for (const k of keys) if (t.includes(k)) return { foodKey: SYNONYMS[k], mealKey: null };

  for (const f of FOODS) {
    if (t.includes(norm(f.name))) return { foodKey: f.key, mealKey: null };
  }
  return { foodKey: null, mealKey: null };
}

/** Did they say they liked it, hated it, or that it upset them? */
export function readStance(raw: string): Stance {
  const t = norm(raw);
  if (/\b(sick|bloat|cramp|upset|gut|stomach|toilet|runs)\b/.test(t)) return 'gi_problem';
  if (/\b(never|cant stand|can t stand|hate|refuse|not eating|wont eat|won t eat)\b/.test(t)) return 'never';
  if (/\b(love|like|enjoy|favourite|favorite|more of)\b/.test(t) && !/\b(dont|don t|not)\b/.test(t)) return 'like';
  return 'dislike';
}

/* ------------------------------------------------------------ restrictions */

const ALLERGEN_FOODS: Record<string, string[]> = {
  peanut: ['peanut_butter'],
  nut: ['peanut_butter'],
  dairy: ['milk_whole', 'milk_semi', 'yoghurt_natural', 'yoghurt_greek', 'skyr', 'cheddar_grated', 'cottage_cheese', 'butter', 'rice_pudding'],
  lactose: ['milk_whole', 'milk_semi', 'yoghurt_natural', 'yoghurt_greek', 'cheddar_grated', 'cottage_cheese', 'rice_pudding'],
  milk: ['milk_whole', 'milk_semi', 'yoghurt_natural', 'yoghurt_greek', 'skyr', 'cheddar_grated', 'cottage_cheese', 'butter', 'rice_pudding'],
  gluten: ['pasta', 'spaghetti', 'bread_white', 'bread_wholemeal', 'bagels', 'wraps', 'couscous', 'flour_sr', 'cornflakes', 'malt_loaf', 'flapjack', 'oats'],
  wheat: ['pasta', 'spaghetti', 'bread_white', 'bread_wholemeal', 'bagels', 'wraps', 'couscous', 'flour_sr', 'malt_loaf'],
  egg: ['eggs'],
  fish: ['tuna', 'salmon_frozen', 'mackerel', 'fish_fingers'],
  shellfish: [],
  soy: ['soy_sauce'],
  soya: ['soy_sauce'],
};

export function blockedByRestrictions(rs: Restriction[]): Set<string> {
  const out = new Set<string>();
  for (const r of rs) {
    const t = norm(r.name);
    for (const [k, foods] of Object.entries(ALLERGEN_FOODS)) {
      if (t.includes(k)) foods.forEach((f) => out.add(f));
    }
    // Also block anything whose name contains what they typed.
    for (const f of FOODS) if (norm(f.name).includes(t) && t.length > 3) out.add(f.key);
  }
  return out;
}

/* ------------------------------------------------------------ substitution */

/** Foods we deliberately do not lean on as replacements. */
const DEPRIORITISE = new Set(['baked_beans', 'kidney_beans', 'chickpeas']);

export type Substitution = {
  from: string;
  to: string;
  fromName: string;
  toName: string;
  why: string;
  costDelta: number;   // £ per 100 g, negative is cheaper
};

/**
 * The cheapest food that does the same nutritional job.
 *
 * Scoring is role overlap first — a replacement has to actually cover what was
 * lost — then cost, then convenience. Price is a tie-breaker, never the
 * objective; a cheaper food that does a different job is not a substitute.
 */
export function substituteFor(
  fromKey: string,
  blocked: Set<string>,
  opts: { avoidBeans?: boolean } = {},
): Substitution | null {
  let from: Food;
  try { from = food(fromKey); } catch { return null; }

  const wanted = new Set<Role>(from.roles);
  const candidates = allFoods().filter(
    (f) => f.key !== from.key && !blocked.has(f.key) && f.category !== 'store',
  );

  const cls = swapClass(from);

  let best: { f: Food; score: number } | null = null;
  for (const f of candidates) {
    const overlap = f.roles.filter((r) => wanted.has(r)).length;
    if (overlap === 0) continue;
    // Must cover the primary role — the first one listed — and be the same kind
    // of thing on the plate.
    if (!f.roles.includes(from.roles[0])) continue;
    if (swapClass(f) !== cls) continue;

    const coverage = overlap / wanted.size;               // 0–1
    const relevantCost = wanted.has('protein-dairy') || from.p >= 10
      ? pricePerProtein(f)
      : pricePer100Kcal(f);
    const costScore = 1 / (1 + relevantCost);              // cheaper is higher
    let score = coverage * 3 + costScore;
    if (opts.avoidBeans !== false && DEPRIORITISE.has(f.key)) score -= 1.5;
    if (!f.perishable) score += 0.1;                       // keeps, less waste

    if (!best || score > best.score) best = { f, score };
  }

  if (!best) return null;

  const costDelta = Math.round((pricePer100(best.f) - pricePer100(from)) * 100) / 100;
  const sharedRoles = best.f.roles.filter((r) => wanted.has(r));
  return {
    from: from.key,
    to: best.f.key,
    fromName: from.name,
    toName: best.f.name,
    why:
      `${from.name} was doing ${describeRoles(sharedRoles)} in this plan. ${best.f.name} does the same for ` +
      `${costDelta <= 0 ? `£${Math.abs(costDelta).toFixed(2)} less` : `£${costDelta.toFixed(2)} more`} per 100 g.`,
    costDelta,
  };
}

function describeRoles(roles: Role[]): string {
  const names: Partial<Record<Role, string>> = {
    'protein-lean': 'lean protein', 'protein-red': 'red-meat protein and iron',
    'protein-fish': 'fish protein', 'protein-dairy': 'dairy protein',
    'protein-plant': 'plant protein', 'carb-staple': 'the main carbohydrate',
    'carb-breakfast': 'breakfast carbohydrate', 'carb-fast': 'fast carbohydrate',
    'carb-bread': 'bread carbohydrate', 'fat-added': 'cooking fat',
    'fat-whole': 'whole-food fat', veg: 'vegetables', fruit: 'fruit',
    calcium: 'calcium', iron: 'iron', fibre: 'fibre',
    'fuel-sport': 'training fuel', flavour: 'flavour', store: 'store cupboard',
  };
  const list = roles.map((r) => names[r] ?? r);
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/* ---------------------------------------------------- applying it to meals */

export type PrefSet = {
  blocked: Set<string>;          // never use — allergies and hard refusals
  disliked: Set<string>;         // avoid where possible
  liked: Set<string>;
  dislikedMeals: Set<string>;
  substitutions: Map<string, Substitution>;
};

export function buildPrefs(
  foodPrefs: FoodPref[],
  mealPrefs: MealPref[],
  restrictions: Restriction[],
): PrefSet {
  const blocked = blockedByRestrictions(restrictions);
  const disliked = new Set<string>();
  const liked = new Set<string>();

  for (const p of foodPrefs) {
    if (!p.foodKey) continue;
    if (p.stance === 'never' || p.stance === 'gi_problem') blocked.add(p.foodKey);
    else if (p.stance === 'dislike') disliked.add(p.foodKey);
    else if (p.stance === 'like') liked.add(p.foodKey);
  }

  const substitutions = new Map<string, Substitution>();
  for (const key of [...blocked, ...disliked]) {
    const sub = substituteFor(key, blocked);
    if (sub) substitutions.set(key, sub);
  }

  return {
    blocked,
    disliked,
    liked,
    dislikedMeals: new Set(mealPrefs.filter((m) => m.stance === 'dislike').map((m) => m.mealKey)),
    substitutions,
  };
}

/**
 * Rewrite a template so it contains nothing the athlete will not eat.
 *
 * The name gets rewritten too. "Porridge with peanut butter" that no longer
 * contains peanut butter is a confusing meal at best, and with an allergy on
 * file it is an alarming one.
 */
export function applyPrefs(t: MealTemplate, prefs: PrefSet): MealTemplate | null {
  if (prefs.dislikedMeals.has(t.key)) return null;

  const swaps: { from: Food; to: Food }[] = [];
  const dropped: Food[] = [];

  const components = t.components.map((c) => {
    if (!prefs.blocked.has(c.food) && !prefs.disliked.has(c.food)) return c;
    const sub = prefs.substitutions.get(c.food);
    if (!sub) {
      // Nothing sensible to put in its place. If it was the fat or a garnish,
      // the meal survives without it and the solver makes up the calories
      // elsewhere; if it was the protein or the carbohydrate, it does not.
      if (c.role === 'fat' || c.role === 'fixed') {
        dropped.push(food(c.food));
        return null;
      }
      return undefined;
    }
    const from = food(c.food);
    const to = food(sub.to);
    swaps.push({ from, to });
    // Keep the nutritional size of the portion, not the gram weight — 150 g of
    // chicken is not 150 g of milk.
    const scale = from.kcal > 0 && to.kcal > 0 ? from.kcal / to.kcal : 1;
    return { ...c, food: sub.to, grams: Math.round(c.grams * scale), unitG: undefined, unit: undefined };
  });

  if (components.some((c) => c === undefined)) return null;   // could not be rescued
  const kept = components.filter((c): c is NonNullable<typeof c> => c != null);
  if (!kept.length) return null;

  let name = t.name;
  for (const { from, to } of swaps) {
    const plain = plainName(from);
    const re = new RegExp(escape(plain), 'i');
    name = re.test(name) ? name.replace(re, plainName(to).toLowerCase())
      : `${name} — ${plainName(to).toLowerCase()} instead of ${plain.toLowerCase()}`;
  }
  for (const d of dropped) name = stripFromName(name, plainName(d));

  return { ...t, name, components: kept };
}

function plainName(f: Food): string {
  return f.name.replace(/\s*\(.*\)/, '').replace(/,.*$/, '').trim();
}

function escape(v: string): string {
  return v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Take a dropped ingredient out of the meal's name and tidy what is left. */
function stripFromName(name: string, plain: string): string {
  return name
    .replace(new RegExp(escape(plain), 'i'), '')
    .replace(/\s*,\s*,/g, ',')
    .replace(/\bwith\s*,\s*/i, 'with ')
    .replace(/\bwith\s+and\b/i, 'with')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/[\s,]+$/, '')
    .trim();
}

/** Every meal the athlete will actually eat, after preferences and allergies. */
export function availableMeals(prefs: PrefSet): MealTemplate[] {
  return MEALS.map((m) => applyPrefs(m, prefs)).filter((m): m is MealTemplate => m !== null);
}
