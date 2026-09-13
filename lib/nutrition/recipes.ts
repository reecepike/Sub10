/**
 * Recipes, batches and portions — three different things.
 *
 * Most meal planners conflate them, and that is why they are unusable in a real
 * kitchen. A RECIPE is the idea: chicken, rice and vegetables. A BATCH is the
 * thing you actually cook: 1.4 kg of raw chicken and 620 g of dry rice, in one
 * pan, on Sunday, at Dad's, yielding five portions. A PORTION is what comes out
 * of a container on Thursday: 480 g of it, cold from the fridge, reheated.
 *
 * The daily plan should never re-list the ingredients of something already
 * cooked. On Thursday the instruction is "Portion 3 of the Wednesday chicken
 * curry batch — 470 g, microwave four minutes". Listing 170 g of chicken thigh
 * and 110 g of basmati rice on a Thursday, when the chicken was cooked on
 * Wednesday and is sitting in a box, is how a plan gets abandoned in week two.
 *
 * And the user never multiplies anything. Every number printed on a batch is
 * the number for that batch. There is no "×4" anywhere in this system.
 */

import type { DayPlan, PlanEntry } from './dayplan';
import { MEAL_BY_KEY, MealTemplate } from './meals';
import { food, Food } from './foods';
import {
  describeQty, cookedG, packsNeeded, toUsable, yieldFor, packSpec, fmt, plural,
  keepsWeeks, leftoverAdvice,
} from './units';
import { House, HouseConfig, DEFAULT_HOUSES, houseFor, weekSegments, HouseSegment } from './houses';
import { labelFor, addDays } from '../plan';

/* ------------------------------------------------------------------ types */

export type BatchIngredient = {
  foodKey: string;
  name: string;
  aldi: string;
  /** Total for the whole batch, in the state the recipe uses it. */
  rawG: number;
  cookedG: number;
  /** 'Chicken breast — 1,400 g raw → 1,010 g cooked'. */
  display: string;
  units: number | null;
  packs: number;
  packNoun: string;
  cost: number;
};

export type Container = {
  index: number;
  label: string;
  cookedG: number;
  store: 'fridge' | 'freezer';
  /** The day this portion is eaten. */
  forDay: string;
  forLabel: string;
  useBy: string;
  /** When to move it down from the freezer, if it is frozen. */
  moveOn: string | null;
};

export type Batch = {
  id: string;
  recipeKey: string;
  name: string;
  house: House;
  houseName: string;
  prepDay: string;
  prepLabel: string;
  segmentLabel: string;
  portions: number;
  ingredients: BatchIngredient[];
  totalRawG: number;
  totalCookedG: number;
  portionCookedG: number;
  containers: Container[];
  steps: string[];
  equipment: string[];
  prepMin: number;
  reheat: string;
  storage: string;
  cost: number;
  kcalPerPortion: number;
  pPerPortion: number;
  cPerPortion: number;
  fPerPortion: number;
};

export type PortionRef = {
  batchId: string;
  batchName: string;
  index: number;
  of: number;
  cookedG: number;
  /** 'Portion 2 of 5 — Chicken, rice and vegetables (Sunday batch, Dad's)' */
  label: string;
  reheat: string;
  house: House;
};

export type FreshItem = {
  day: string;
  at: string;
  kind: string;
  house: House;
  title: string;
  items: { foodKey: string; grams: number; display: string }[];
};

export type Kitchen = {
  weekStart: string;
  segments: HouseSegment[];
  batches: Batch[];
  /** Keyed `${day}|${seq}` — what the daily plan should print instead of ingredients. */
  portionFor: Record<string, PortionRef>;
  fresh: FreshItem[];
  moves: { on: string; label: string; what: string }[];
  prepSessions: { day: string; label: string; house: House; houseName: string; title: string; totalMin: number; batchIds: string[]; order: string[] }[];
  warnings: string[];
};

/* --------------------------------------------------- batch step generation */

/**
 * Turn a template's prose method into numbered, batch-sized steps.
 *
 * The template method is written for one portion and in one paragraph. At batch
 * scale the quantities are what matters and the order is what gets forgotten,
 * so the same instructions come back out as a numbered list with the real
 * numbers substituted in and the portioning step — the one people skip —
 * spelled out at the end.
 */
function batchSteps(t: MealTemplate, b: Omit<Batch, 'steps'>): string[] {
  const steps: string[] = [];

  const list = b.ingredients.map((x) => `${x.name} ${x.display}`).join(', ');
  steps.push(`Get it all out first: ${list}. These are the totals for the whole batch — nothing here needs multiplying.`);

  // Anything with a cooked yield gets its own line, because that is the number
  // that decides whether the pan is big enough.
  const grains = b.ingredients.filter((x) => ['rice_white', 'rice_basmati', 'pasta', 'spaghetti', 'couscous', 'lentils'].includes(x.foodKey));
  for (const g of grains) {
    steps.push(`${g.name}: ${fmt(g.rawG)} g dry. That comes out at about ${fmt(g.cookedG)} g cooked, so use a pan or cooker that takes it comfortably — it roughly triples.`);
  }

  for (const sentence of t.method.split(/(?<=\.)\s+/).map((s) => s.trim()).filter(Boolean)) {
    steps.push(sentence);
  }

  steps.push(
    b.portions === 1
      ? `That is one portion, about ${fmt(b.portionCookedG)} g. Straight into a container.`
      : `Weigh the whole finished dish, then divide it into ${plural(b.portions, 'container')} of about ${fmt(b.portionCookedG)} g each. Weigh the portions rather than eyeballing them — the calorie targets here assume they are even, and by eye the first two are always bigger.`,
  );

  const fridge = b.containers.filter((c) => c.store === 'fridge').length;
  const freezer = b.containers.filter((c) => c.store === 'freezer').length;
  const window = fridgeWindowFor(t);
  const why = hasCookedRice(t)
    ? 'Cooked rice gets 24 hours in the fridge and not an hour more — Bacillus cereus survives cooking and multiplies at fridge-door temperature, and it is the single most common way batch cooking makes someone ill'
    : `cooked food gets ${plural(window, 'day')} in the fridge`;
  if (freezer > 0) {
    steps.push(
      `Lids off until they stop steaming — no more than an hour — then ${plural(fridge, 'container')} into the fridge and ${freezer} into the freezer tonight. Not tomorrow: ${why}, so anything for later goes in cold and goes in today.`,
    );
  } else {
    steps.push(
      `Lids off until they stop steaming — no more than an hour — then ${plural(fridge, 'container')} into the fridge, where ${why}.`,
    );
  }
  steps.push(
    b.portions === 1
      ? `Label it: "${t.name.split(',')[0]}", the date, and the day it is for.`
      : `Label each one: "${t.name.split(',')[0]}", the date, and the day it is for. In February you will not remember which box is which.`,
  );

  return steps;
}

/* ------------------------------------------------------------- the builder */

type Occurrence = {
  day: string;
  at: string;
  seq: number;
  kind: string;
  mealKey: string;
  entry: PlanEntry;
  house: House;
};

export function buildKitchen(
  weekStart: string,
  plans: DayPlan[],
  cfg: HouseConfig = DEFAULT_HOUSES,
): Kitchen {
  const segments = weekSegments(weekStart, cfg);
  const warnings: string[] = [];

  /* 1. Every meal occurrence, tagged with the kitchen it comes out of. */
  const occurrences: Occurrence[] = [];
  const fresh: FreshItem[] = [];

  for (const d of plans) {
    for (const e of d.entries) {
      const house = houseFor(d.day, e.at, cfg);
      const t = e.mealKey ? MEAL_BY_KEY.get(e.mealKey) : null;
      if (t && t.batch) {
        occurrences.push({ day: d.day, at: e.at, seq: e.seq, kind: e.kind, mealKey: e.mealKey!, entry: e, house });
      } else {
        fresh.push({
          day: d.day, at: e.at, kind: e.kind, house, title: e.title,
          items: e.items.map((it) => ({ foodKey: it.foodKey, grams: it.grams, display: it.display })),
        });
      }
    }
  }

  /* 2. Which prep session covers each occurrence. */
  const sessionFor = (o: Occurrence): HouseSegment => {
    for (const s of segments) {
      const c = s.covers.find((x) => x.day === o.day);
      if (!c) continue;
      const t = mins(o.at);
      if (t >= mins(c.from) && t <= mins(c.to)) return s;
    }
    return segments.find((s) => s.house === o.house) ?? segments[0];
  };

  const groups = new Map<string, { seg: HouseSegment; mealKey: string; occ: Occurrence[] }>();
  for (const o of occurrences) {
    const seg = sessionFor(o);
    const id = `${seg.house}-${seg.prepDay}-${o.mealKey}`;
    const g = groups.get(id) ?? { seg, mealKey: o.mealKey, occ: [] };
    g.occ.push(o);
    groups.set(id, g);
  }

  /* 3. One batch per group. */
  const batches: Batch[] = [];
  const portionFor: Record<string, PortionRef> = {};
  const moves: Kitchen['moves'] = [];

  for (const [id, g] of groups) {
    const t = MEAL_BY_KEY.get(g.mealKey);
    if (!t) continue;
    const occ = [...g.occ].sort((a, b) => (a.day + a.at).localeCompare(b.day + b.at));

    // Ingredient totals. Sum the solved per-portion grams — the portion solver
    // has already sized each day's serving to that day's target, so a batch
    // that feeds a Tuesday and a Saturday is not an average, it is the actual
    // sum of what those two days need.
    const totals = new Map<string, number>();
    for (const o of occ) {
      for (const it of o.entry.items) totals.set(it.foodKey, (totals.get(it.foodKey) ?? 0) + it.grams);
    }

    const ingredients: BatchIngredient[] = [];
    let totalRawG = 0, totalCookedG = 0, cost = 0;
    for (const [key, grams] of totals) {
      let f: Food;
      try { f = food(key); } catch { continue; }
      const usable = toUsable(key, grams);
      const ck = cookedG(key, usable.grams);
      const pk = packsNeeded(f, usable.grams);
      const c = (f.packPrice / f.packG) * usable.grams;
      ingredients.push({
        foodKey: key,
        name: f.name,
        aldi: f.aldi,
        rawG: usable.grams,
        cookedG: ck,
        display: describeQty(key, usable.grams),
        units: usable.units,
        packs: pk.packs,
        packNoun: pk.packNoun,
        cost: c,
      });
      totalRawG += usable.grams;
      totalCookedG += ck;
      cost += c;
    }
    ingredients.sort((a, b) => b.rawG - a.rawG);

    const portions = occ.length;
    const portionCookedG = Math.round(totalCookedG / Math.max(1, portions));

    // Fridge for anything inside the window, freezer for the rest — decided on
    // prep day, not discovered on day three.
    const window = fridgeWindowFor(t);
    const containers: Container[] = occ.map((o, n) => {
      const gap = dayGap(g.seg.prepDay, o.day);
      const inFridge = gap <= window;
      const useBy = addDays(g.seg.prepDay, Math.max(1, window));
      return {
        index: n + 1,
        label: `${shortName(t.name)} — ${n + 1} of ${portions}`,
        cookedG: portionCookedG,
        store: inFridge ? 'fridge' : 'freezer',
        forDay: o.day,
        forLabel: labelFor(o.day),
        useBy: inFridge ? useBy : 'frozen on the day it is cooked',
        moveOn: inFridge ? null : addDays(o.day, -1),
      };
    });

    if (!t.freezable && containers.some((c) => c.store === 'freezer')) {
      warnings.push(
        `${t.name} is served on ${containers.filter((c) => c.store === 'freezer').map((c) => c.forLabel).join(' and ')}, which is outside its ${plural(window, 'day')} fridge window, and it does not freeze well. Cook those portions fresh on the day rather than stretching the window.`,
      );
    }

    for (const c of containers) {
      if (c.moveOn) {
        moves.push({
          on: c.moveOn,
          label: labelFor(c.moveOn),
          what: `Move "${c.label}" from the freezer to the fridge tonight — it is ${c.forLabel}'s ${occ.find((o) => o.day === c.forDay)?.kind ?? 'meal'}, at ${g.seg.name}.`,
        });
      }
    }

    const perPortion = (pick: (e: PlanEntry) => number) =>
      Math.round(occ.reduce((a, o) => a + pick(o.entry), 0) / Math.max(1, portions));

    const partial: Omit<Batch, 'steps'> = {
      id,
      recipeKey: g.mealKey,
      name: t.name,
      house: g.seg.house,
      houseName: g.seg.name,
      prepDay: g.seg.prepDay,
      prepLabel: g.seg.prepLabel,
      segmentLabel: `${g.seg.name} · ${labelFor(g.seg.fromDay)} → ${labelFor(g.seg.toDay)}`,
      portions,
      ingredients,
      totalRawG: Math.round(totalRawG),
      totalCookedG: Math.round(totalCookedG),
      portionCookedG,
      containers,
      equipment: t.equipment,
      prepMin: t.prepMin + Math.max(0, (portions - 1) * 4),
      reheat: reheatFor(t),
      storage: containers.some((c) => c.store === 'freezer')
        ? `${plural(containers.filter((c) => c.store === 'fridge').length, 'portion')} in the fridge, ${containers.filter((c) => c.store === 'freezer').length} straight into the freezer the same evening.`
        : `All ${plural(portions, 'portion')} in the fridge, eaten within ${plural(window, 'day')}.`,
      cost: Math.round(cost * 100) / 100,
      kcalPerPortion: perPortion((e) => e.kcal),
      pPerPortion: perPortion((e) => e.p),
      cPerPortion: perPortion((e) => e.c),
      fPerPortion: perPortion((e) => e.f),
    };

    const batch: Batch = { ...partial, steps: batchSteps(t, partial) };
    batches.push(batch);

    occ.forEach((o, n) => {
      portionFor[`${o.day}|${o.seq}`] = {
        batchId: id,
        batchName: t.name,
        index: n + 1,
        of: portions,
        cookedG: portionCookedG,
        label: portions === 1
          ? `The single portion of ${t.name} from the ${g.seg.prepLabel} cook at ${g.seg.name}`
          : `Portion ${n + 1} of ${portions} — ${t.name}, ${g.seg.prepLabel} batch at ${g.seg.name}`,
        reheat: containers[n].store === 'freezer'
          ? `Out of the freezer the night before, then ${reheatFor(t).toLowerCase()}`
          : reheatFor(t),
        house: g.seg.house,
      };
    });
  }

  batches.sort((a, b) => (a.prepDay + a.name).localeCompare(b.prepDay + b.name));
  moves.sort((a, b) => a.on.localeCompare(b.on));

  /* 4. Prep sessions, one per stay that has anything to cook. */
  const prepSessions: Kitchen['prepSessions'] = [];
  for (const seg of segments) {
    const mine = batches.filter((b) => b.prepDay === seg.prepDay && b.house === seg.house);
    if (!mine.length) continue;
    const existing = prepSessions.find((p) => p.day === seg.prepDay && p.house === seg.house);
    if (existing) continue;
    prepSessions.push({
      day: seg.prepDay,
      label: labelFor(seg.prepDay),
      house: seg.house,
      houseName: seg.name,
      title: `${seg.prepLabel} at ${seg.name}`,
      totalMin: Math.round(mine.reduce((a, b) => a + b.prepMin, 0) * 0.72),
      batchIds: mine.map((b) => b.id),
      order: cookOrder(mine),
    });
  }
  prepSessions.sort((a, b) => a.day.localeCompare(b.day));

  return { weekStart, segments, batches, portionFor, fresh, moves, prepSessions, warnings };
}

/* ----------------------------------------------------------------- helpers */

function mins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function dayGap(from: string, to: string): number {
  return Math.round(
    (new Date(to + 'T12:00:00Z').getTime() - new Date(from + 'T12:00:00Z').getTime()) / 86_400_000,
  );
}

function shortName(name: string): string {
  return name.split(/ with | and |, /)[0];
}

/** Does the finished dish contain cooked rice? */
function hasCookedRice(t: MealTemplate): boolean {
  return t.components.some((c) => c.food.startsWith('rice_') && c.food !== 'rice_pudding');
}

/**
 * How many days a batch may sit in the fridge.
 *
 * The general rule is two days for cooked leftovers. Rice is the exception and
 * it is not a small one: Bacillus cereus spores survive cooking and germinate
 * at fridge-door temperatures, which is why UK guidance is 24 hours for cooked
 * rice rather than 48.
 *
 * The page already said this in its food-safety notes. The generator was
 * ignoring it and putting Friday's rice portion in the fridge on Wednesday — a
 * plan that contradicts its own stated rule is worse than one with no rule,
 * because it teaches the reader to skim the rules.
 */
function fridgeWindowFor(t: MealTemplate): number {
  return hasCookedRice(t) ? Math.min(1, t.fridgeDays) : t.fridgeDays;
}

function reheatFor(t: MealTemplate): string {
  const hasRice = t.components.some((c) => c.food.startsWith('rice'));
  if (hasRice) {
    return 'Microwave 4 minutes, stir at 2, until it is steaming right through. Rice is the strict one — lukewarm reheated rice is what actually makes people ill.';
  }
  if (t.tags.includes('cold')) return 'Eaten cold, straight out of the box. No reheating.';
  return 'Microwave 3–4 minutes, stirring once, until steaming throughout — above 75 °C. Once reheated it is eaten or binned; it does not go back.';
}

function cookOrder(bs: Batch[]): string[] {
  const out: string[] = [];
  const eq = (k: string) => bs.some((b) => b.equipment.includes(k));
  if (eq('oven')) out.push('Oven on first. It takes ten minutes to come up to temperature and everything else is waiting on it.');
  if (eq('ricecooker')) out.push('Rice next — it looks after itself, and it is the thing that has to be cooled fastest afterwards, so it needs the head start.');
  if (eq('hob')) out.push('Then the pan meals, back to back in the same pan. Bolognese and chilli are the same method with a different tin, so do them in a row and wash up once.');
  if (eq('airfryer')) out.push('Air fryer last, while everything else is cooling.');
  out.push('Portion as each thing comes off the heat, lids off until they stop steaming, then lids on and into the fridge or freezer. Do not leave the pan on the hob to deal with later — that is the hour that matters.');
  return out;
}

/* -------------------------------------------------- shopping, split by house */

export type HouseShoppingLine = {
  foodKey: string;
  name: string;
  aldi: string;
  neededG: number;
  packs: number;
  packNoun: string;
  boughtG: number;
  /** What the whole packs cost at the till this week. */
  cost: number;
  /**
   * The share of that cost this week actually consumes.
   *
   * A 1 kg bag of rice costs 52p and lasts a month. Charging the whole 52p to
   * one week and then showing nothing for the next three makes the weekly total
   * jump around for no reason. Perishables are charged in full — they are
   * bought and eaten inside the week; store-cupboard items are charged at what
   * gets used.
   */
  ongoingCost: number;
  /** What it is for, so nothing looks arbitrary on the list. */
  forWhat: string[];
  category: string;
  leftoverG: number;
  /** True when the leftover keeps and will be used in a later week. */
  keeps: boolean;
  /** What to do with the leftover, when there is enough of it to matter. */
  leftoverNote: string | null;
};

export type HouseShopping = {
  house: House;
  houseName: string;
  shopOn: string;
  shopLabel: string;
  lines: HouseShoppingLine[];
  /** The till total if every pack on the list is bought this week. */
  total: number;
  /** What the week actually eats, with store-cupboard packs amortised. */
  ongoing: number;
  byCategory: { category: string; lines: HouseShoppingLine[]; total: number }[];
};

export function buildHouseShopping(k: Kitchen, cfg: HouseConfig = DEFAULT_HOUSES): HouseShopping[] {
  const acc = new Map<House, Map<string, { g: number; why: Set<string> }>>();
  const bump = (h: House, key: string, g: number, why: string) => {
    const m = acc.get(h) ?? new Map();
    const e = m.get(key) ?? { g: 0, why: new Set<string>() };
    e.g += g;
    e.why.add(why);
    m.set(key, e);
    acc.set(h, m);
  };

  for (const b of k.batches) {
    for (const ing of b.ingredients) bump(b.house, ing.foodKey, ing.rawG, `${b.name} (${plural(b.portions, 'portion')})`);
  }
  for (const fr of k.fresh) {
    for (const it of fr.items) bump(fr.house, it.foodKey, it.grams, fr.title);
  }

  const out: HouseShopping[] = [];
  for (const h of ['dad', 'mum'] as House[]) {
    const m = acc.get(h);
    if (!m) continue;
    const seg = k.segments.find((s) => s.house === h)!;
    const shopOn = addDays(seg.prepDay, 0);
    const lines: HouseShoppingLine[] = [];
    for (const [key, e] of m) {
      let f: Food;
      try { f = food(key); } catch { continue; }
      const pk = packsNeeded(f, e.g);
      if (pk.packs <= 0) continue;
      // "Keeps" is about shelf life, not about which shelf. A bag of potatoes
      // is perishable and lasts a month; a pack of mince is perishable and
      // lasts three days.
      const weeks = keepsWeeks(f);
      const keeps = weeks >= 2;
      const used = (f.packPrice / f.packG) * e.g;
      lines.push({
        foodKey: key,
        name: f.name,
        aldi: f.aldi,
        neededG: Math.round(e.g),
        packs: pk.packs,
        packNoun: pk.packNoun,
        boughtG: pk.boughtG,
        cost: Math.round(pk.packs * f.packPrice * 100) / 100,
        ongoingCost: Math.round((keeps ? used : pk.packs * f.packPrice) * 100) / 100,
        forWhat: [...e.why].slice(0, 4),
        category: f.category,
        leftoverG: Math.max(0, Math.round(pk.boughtG - e.g)),
        keeps,
        leftoverNote: leftoverAdvice(f, Math.max(0, pk.boughtG - e.g)),
      });
    }
    lines.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

    const cats = [...new Set(lines.map((l) => l.category))].map((category) => {
      const ls = lines.filter((l) => l.category === category);
      return { category, lines: ls, total: Math.round(ls.reduce((a, l) => a + l.cost, 0) * 100) / 100 };
    });

    out.push({
      house: h,
      houseName: seg.name,
      shopOn,
      shopLabel: labelFor(shopOn),
      lines,
      total: Math.round(lines.reduce((a, l) => a + l.cost, 0) * 100) / 100,
      ongoing: Math.round(lines.reduce((a, l) => a + l.ongoingCost, 0) * 100) / 100,
      byCategory: cats,
    });
  }
  void cfg;
  void packSpec;
  void yieldFor;
  return out;
}
