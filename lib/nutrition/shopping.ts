/**
 * The shopping list.
 *
 * Built from the week that was actually generated, not from a template. The
 * part that matters is packs: Aldi sells chicken in kilos, and a plan that
 * needs 650 g either wastes 350 g or finds it a job. This file finds it a job,
 * and reports honestly when it cannot.
 */

import { FOODS, Food, food, allFoods, pricePer100Kcal, pricePerProtein } from './foods';
import type { DayPlan } from './dayplan';

export type ShopItem = {
  foodKey: string;
  name: string;
  aldi: string;
  neededG: number;
  packG: number;
  packs: number;
  packPrice: number;
  cost: number;
  leftoverG: number;
  leftoverNote: string | null;
  verified: boolean;
  usedIn: string[];
};

export type Saving = {
  from: string;
  to: string;
  saves: number;
  why: string;
};

export type ShoppingList = {
  weekStart: string;
  items: ShopItem[];
  total: number;
  /** What a normal week costs once the cupboard is stocked. */
  ongoing: number;
  budget: number;
  overBy: number;
  savings: Saving[];
  wasteG: number;
  wasteValue: number;
  notes: string[];
  unverifiedCount: number;
};

/** Grams that carry over rather than being wasted. */
function leftoverAdvice(f: Food, leftoverG: number, weekNeed: number): string | null {
  if (leftoverG < f.packG * 0.12) return null;
  if (!f.perishable) {
    return `${Math.round(leftoverG)} g left in the pack — it keeps, so it comes off next week's list.`;
  }
  if (f.freezable) {
    return `${Math.round(leftoverG)} g spare. Freeze it on the day you open the pack, in portions, and it becomes next week's food rather than next week's bin.`;
  }
  if (leftoverG > weekNeed * 0.4) {
    return `${Math.round(leftoverG)} g spare and it does not keep. Use it up midweek — an extra portion at dinner is cheaper than throwing it away.`;
  }
  return `${Math.round(leftoverG)} g spare. Eat it within the week.`;
}

export function buildShoppingList(
  weekStart: string,
  days: DayPlan[],
  budget: number,
  carryOver: Record<string, number> = {},
): ShoppingList {
  const needed = new Map<string, { g: number; usedIn: Set<string> }>();

  for (const d of days) {
    for (const e of d.entries) {
      for (const it of e.items) {
        const cur = needed.get(it.foodKey) ?? { g: 0, usedIn: new Set<string>() };
        cur.g += it.grams;
        cur.usedIn.add(e.title);
        needed.set(it.foodKey, cur);
      }
    }
  }

  const items: ShopItem[] = [];
  let wasteG = 0;
  let wasteValue = 0;
  let unverifiedCount = 0;

  for (const [key, { g, usedIn }] of needed) {
    let f: Food;
    try { f = food(key); } catch { continue; }

    // Anything left in the cupboard from last week comes off the list first.
    const have = carryOver[key] ?? 0;
    const toBuy = Math.max(0, g - have);
    if (toBuy <= 0) continue;

    const packs = Math.ceil(toBuy / f.packG);
    const cost = Math.round(packs * f.packPrice * 100) / 100;
    const leftoverG = packs * f.packG - toBuy;

    if (f.perishable && !f.freezable) {
      wasteG += leftoverG;
      wasteValue += (leftoverG / f.packG) * f.packPrice;
    }
    if (!f.verified) unverifiedCount++;

    items.push({
      foodKey: key,
      name: f.name,
      aldi: f.aldi,
      neededG: Math.round(g),
      packG: f.packG,
      packs,
      packPrice: f.packPrice,
      cost,
      leftoverG: Math.round(leftoverG),
      leftoverNote: leftoverAdvice(f, leftoverG, g),
      verified: f.verified,
      usedIn: [...usedIn].slice(0, 4),
    });
  }

  items.sort((a, b) => b.cost - a.cost);
  const total = Math.round(items.reduce((a, i) => a + i.cost, 0) * 100) / 100;

  // A litre of oil is not a weekly cost. For anything that keeps, charge the
  // week only for what the week actually uses, so the ongoing figure is the one
  // to judge the budget against.
  const ongoing = Math.round(
    items.reduce((a, i) => {
      const f = food(i.foodKey);
      if (f.perishable) return a + i.cost;
      const used = Math.min(1, i.neededG / (i.packs * f.packG));
      return a + i.cost * used;
    }, 0) * 100,
  ) / 100;

  const overBy = Math.round((ongoing - budget) * 100) / 100;

  /* ---------------------------------------------------- cheaper equivalents
     Deliberately strict. A suggestion has to be something you could actually
     swap without changing the meal: same category, covering every role the
     original played, at a materially lower price for the same nutrition.
     A looser rule produces things like "replace the cheese on your jacket
     potato with fat-free yoghurt", which is true on a spreadsheet and absurd
     on a plate. */
  const savings: Saving[] = [];
  for (const it of items) {
    const f = food(it.foodKey);
    if (f.category === 'store') continue;
    const roles = new Set(f.roles);

    for (const alt of allFoods()) {
      if (alt.key === f.key || alt.category !== f.category) continue;
      if (![...roles].every((r) => alt.roles.includes(r))) continue;

      // Energy density has to be in the same league, or the "swap" changes the
      // meal rather than the price — oven chips and porridge oats are both
      // carbohydrate staples and nobody has ever swapped one for the other.
      const density = Math.max(alt.kcal, 1) / Math.max(f.kcal, 1);
      if (density < 0.67 || density > 1.5) continue;

      // Price for the same nutritional delivery, not for the same weight.
      const byProtein = f.p >= 8;
      const ratio = byProtein
        ? pricePerProtein(alt) / Math.max(pricePerProtein(f), 0.0001)
        : pricePer100Kcal(alt) / Math.max(pricePer100Kcal(f), 0.0001);
      if (ratio > 0.78) continue;                       // must be ≥22% cheaper

      const equivG = byProtein ? (it.neededG * f.p) / alt.p : (it.neededG * f.kcal) / alt.kcal;
      const altCost = Math.ceil(equivG / alt.packG) * alt.packPrice;
      const saves = Math.round((it.cost - altCost) * 100) / 100;
      if (saves < 0.5) continue;

      savings.push({
        from: f.name, to: alt.name, saves,
        why: `${alt.name} delivers the same ${byProtein ? 'protein' : 'energy'} for about £${saves.toFixed(2)} less across the week, and does the same job in the same meals.`,
      });
      break;                                            // one suggestion per item
    }
  }
  savings.sort((a, b) => b.saves - a.saves);

  /* ------------------------------------------------------------------ notes */
  const notes: string[] = [];
  if (Math.abs(total - ongoing) > 2) {
    notes.push(
      `This shop is £${total.toFixed(2)}, but £${(total - ongoing).toFixed(2)} of it is store-cupboard stock — oil, sugar, rice, pasta — that lasts well beyond this week. The ongoing weekly cost is about £${ongoing.toFixed(2)}.`,
    );
  }
  if (overBy > 0) {
    notes.push(
      `£${ongoing.toFixed(2)} a week against a £${budget.toFixed(0)} preference — over by £${overBy.toFixed(2)}. That is allowed: the budget is a preference and under-fuelling is not. ` +
      (savings.length
        ? `If you want it lower, the swaps below save about £${savings.slice(0, 3).reduce((a, s) => a + s.saves, 0).toFixed(2)} without touching the nutrition.`
        : 'There is nothing obvious left to cut without taking food out of a training day.'),
    );
  } else {
    notes.push(`£${ongoing.toFixed(2)} a week against a £${budget.toFixed(0)} preference — £${Math.abs(overBy).toFixed(2)} under.`);
  }
  if (wasteValue > 1) {
    notes.push(
      `About £${wasteValue.toFixed(2)} of this is pack surplus on things that do not freeze. Look at the leftover notes — most of it can be eaten rather than binned.`,
    );
  }
  if (unverifiedCount) {
    notes.push(
      `${unverifiedCount} of these prices are estimates rather than checked listings. Correct any that are wrong on the Foods page and the total fixes itself — everything here is arithmetic on those numbers.`,
    );
  }

  return {
    weekStart, items, total, ongoing, budget, overBy, savings: savings.slice(0, 5),
    wasteG: Math.round(wasteG), wasteValue: Math.round(wasteValue * 100) / 100,
    notes, unverifiedCount,
  };
}

/** What is left in the cupboard at the end of the week, to carry into the next. */
export function carryForward(list: ShoppingList): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of list.items) {
    const f = FOODS.find((x) => x.key === it.foodKey);
    if (!f || it.leftoverG <= 0) continue;
    if (!f.perishable || f.freezable) out[it.foodKey] = it.leftoverG;
  }
  return out;
}
