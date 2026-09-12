/**
 * The day, assembled.
 *
 * Order matters here. Training fuel is placed first, because its timing is
 * fixed by the session and its quantity is set by the gut, not by preference.
 * Only then do the three main meals divide up what is left. Doing it the other
 * way round — three meals first, fuel bolted on — is how people end up eating
 * an extra six hundred calories a day and wondering why the scale is moving.
 */

import type { Settings } from '../db';
import { Targets } from './targets';
import { Profile } from './energy';
import { Resolution, ResolvedSession, countable } from './resolve';
import { FuelPlan, sessionFuel, timeForSlot } from './fuel';
import { MealTemplate, ScaledMeal, scaleMeal, MEAL_BY_KEY } from './meals';
import { PrefSet, availableMeals } from './prefs';
import { food, macrosFor } from './foods';

export type EntryKind = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'pre' | 'during' | 'post';

export type PlanEntry = {
  seq: number;
  at: string;              // 'HH:MM'
  kind: EntryKind;
  title: string;
  mealKey: string | null;
  sessionRef: string | null;
  items: { name: string; display: string; foodKey: string; grams: number }[];
  kcal: number;
  p: number;
  c: number;
  f: number;
  fibre: number;
  cost: number;
  note: string | null;
};

export type DayPlan = {
  day: string;
  entries: PlanEntry[];
  fuel: FuelPlan[];
  totals: { kcal: number; p: number; c: number; f: number; fibre: number; cost: number };
  /** How close the assembled day came to the target. */
  gap: { kcal: number; p: number; c: number };
  notes: string[];
};

/* ------------------------------------------------------------------ timing */

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function toHHMM(mins: number): string {
  const t = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/* ---------------------------------------------------------------- rotation */

/**
 * Breakfast stays put; lunch and dinner move every two to three days.
 * Deterministic from the week number, so a week is stable and the next one is
 * different without anyone choosing anything.
 */
function pickRotation<T>(pool: T[], count: number, seed: number): T[] {
  if (!pool.length) return [];
  // Rotate the pool by the week, then take the first `count`. Distinct by
  // construction — an earlier version used a stride that could land on the same
  // index three times, and served the same lunch seven days running.
  const start = ((seed % pool.length) + pool.length) % pool.length;
  const out: T[] = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) out.push(pool[(start + i) % pool.length]);
  return out;
}

/* -------------------------------------------------- small food assemblies */

type Assembled = { items: PlanEntry['items']; kcal: number; p: number; c: number; f: number; fibre: number; cost: number };

function assemble(parts: { key: string; grams: number }[]): Assembled {
  const items: PlanEntry['items'] = [];
  let kcal = 0, p = 0, c = 0, f = 0, fibre = 0, cost = 0;
  for (const part of parts) {
    if (part.grams <= 0) continue;
    const fd = food(part.key);
    const g = Math.round(part.grams / 5) * 5;
    const m = macrosFor(fd, g);
    items.push({ name: fd.name, display: `${g} g`, foodKey: part.key, grams: g });
    kcal += m.kcal; p += m.p; c += m.c; f += m.f; fibre += m.fibre; cost += m.cost;
  }
  return { items, kcal, p, c, f, fibre, cost };
}

/** Carbohydrate for during a session, from things that are cheap and travel. */
function assembleDuringFuel(carbG: number, disc: string, prefs: PrefSet): Assembled {
  const can = (k: string) => !prefs.blocked.has(k);
  const parts: { key: string; grams: number }[] = [];
  let left = carbG;

  // The homemade bottle does the bulk of it on the bike: sugar is 100% carb and
  // costs about a penny for 20 g.
  if (disc === 'BK' && can('sugar') && left > 30) {
    const sugarG = Math.min(left * 0.6, 160);
    parts.push({ key: 'sugar', grams: sugarG });
    left -= sugarG;
  }
  if (can('bananas') && left > 20) {
    const n = Math.min(2, Math.floor(left / 21));
    if (n > 0) { parts.push({ key: 'bananas', grams: n * 120 }); left -= n * 21; }
  }
  if (can('malt_loaf') && left > 15) {
    const g = Math.min(left / 0.62, 130);
    parts.push({ key: 'malt_loaf', grams: g });
    left -= g * 0.62;
  }
  if (can('sultanas') && left > 10) {
    const g = Math.min(left / 0.69, 80);
    parts.push({ key: 'sultanas', grams: g });
    left -= g * 0.69;
  }
  if (left > 5 && can('sugar')) parts.push({ key: 'sugar', grams: left });
  return assemble(parts);
}

/** Fast, low-residue carbohydrate before a session. */
function assemblePreFuel(carbG: number, prefs: PrefSet): Assembled {
  const can = (k: string) => !prefs.blocked.has(k);
  const parts: { key: string; grams: number }[] = [];
  let left = carbG;
  if (can('bananas') && left >= 20) { parts.push({ key: 'bananas', grams: 120 }); left -= 21; }
  if (can('bread_white') && left >= 20) {
    const slices = Math.min(4, Math.round(left / 18));
    if (slices > 0) { parts.push({ key: 'bread_white', grams: slices * 40 }); left -= slices * 18; }
  }
  if (can('honey') && left > 5) { const g = Math.min(left / 0.79, 40); parts.push({ key: 'honey', grams: g }); left -= g * 0.79; }
  if (left > 5 && can('jam')) parts.push({ key: 'jam', grams: left / 0.64 });
  return assemble(parts);
}

/** Recovery, when it does not land on a main meal. */
function assembleRecovery(carbG: number, proteinG: number, prefs: PrefSet): Assembled {
  const can = (k: string) => !prefs.blocked.has(k);
  const parts: { key: string; grams: number }[] = [];
  let c = carbG, p = proteinG;

  if (can('milk_whole')) {
    const ml = Math.min(700, Math.max(300, (p / 3.4) * 100));
    parts.push({ key: 'milk_whole', grams: ml });
    p -= (ml / 100) * 3.4;
    c -= (ml / 100) * 4.7;
  }
  if (c > 20 && can('cornflakes')) {
    const g = Math.min(150, c / 0.84);
    parts.push({ key: 'cornflakes', grams: g });
    c -= g * 0.84; p -= g * 0.07;
  }
  if (c > 15 && can('bananas')) { parts.push({ key: 'bananas', grams: 120 }); c -= 21; }
  if (c > 15 && can('honey')) parts.push({ key: 'honey', grams: Math.min(50, c / 0.79) });
  if (p > 8 && can('yoghurt_greek')) parts.push({ key: 'yoghurt_greek', grams: Math.min(300, (p / 4.5) * 100) });
  return assemble(parts);
}

/** Carbohydrate that is easy to eat when there is a lot of it to get through. */
function assembleTopUpCarbs(carbG: number, prefs: PrefSet, lowResidue: boolean): Assembled {
  const parts: { key: string; grams: number }[] = [];
  let left = carbG;

  // Take only what is still needed at each step. An earlier version added whole
  // units regardless and routinely overshot the day by a couple of hundred
  // calories, which is exactly the sort of drift this whole engine exists to
  // avoid.
  const take = (key: string, carbPer100: number, maxG: number) => {
    if (prefs.blocked.has(key) || left < 8) return;
    const g = Math.min((left / carbPer100) * 100, maxG);
    if (g < 10) return;
    parts.push({ key, grams: g });
    left -= (g * carbPer100) / 100;
  };

  take('bread_white', 45, 160);
  take('jam', 64, 50);
  if (!lowResidue) take('sultanas', 69, 60);
  take('rice_pudding', 15, 400);
  take('bananas', 21, 240);
  take('honey', 79, 40);

  return assemble(parts);
}

/** Rough fibre load of a template, for choosing between them on a long day. */
function fibreOf(t: MealTemplate): number {
  return t.components.reduce((a, c) => {
    try { return a + (food(c.food).fibre * c.grams) / 100; } catch { return a; }
  }, 0);
}

/* ----------------------------------------------------------------- builder */

export type BuildInputs = {
  day: string;
  settings: Settings;
  profile: Profile;
  targets: Targets;
  resolution: Resolution;
  prefs: PrefSet;
  carbPerHour: number;
  week: number;
};

export function buildDayPlan(i: BuildInputs): DayPlan {
  const { settings: s, profile: p, targets: T, resolution, prefs } = i;
  const notes: string[] = [];
  const times = { am: s.am_time ?? '06:30', pm: s.pm_time ?? '17:30', eve: s.eve_time ?? '19:00' };
  const wake = s.wake_time ?? '06:00';
  const bed = s.bed_time ?? '22:30';

  /* 1. Fuel plans, one per session that needs one. */
  const sessions = countable(resolution).filter((x) => x.disc !== 'ST' || x.minutes >= 60);
  // Two sessions in the same slot are a brick, not a pair of clones — the second
  // starts when the first finishes. Without this, a four-hour ride and the run
  // off it both claimed 06:30 and the fuelling around them made no sense.
  const withTimes: { s: typeof sessions[number]; start: string }[] = [];
  {
    const bySlot = new Map<string, typeof sessions>();
    for (const x of sessions) {
      const list = bySlot.get(x.slot) ?? [];
      list.push(x);
      bySlot.set(x.slot, list);
    }
    for (const [slot, list] of bySlot) {
      let cursor = toMin(timeForSlot(slot, times));
      for (const x of list) {
        withTimes.push({ s: x, start: toHHMM(cursor) });
        cursor += x.minutes + 10;
      }
    }
    withTimes.sort((a, b) => toMin(a.start) - toMin(b.start));
  }

  const fuel: FuelPlan[] = withTimes.map((x, idx) => {
    const next = withTimes[idx + 1];
    const anotherSoon = !!next && toMin(next.start) - (toMin(x.start) + x.s.minutes) <= 8 * 60;
    return sessionFuel(x.s, p, x.start, i.carbPerHour, {
      anotherSessionWithin8h: anotherSoon,
      wakeTime: wake,
      phase: T.phase,
    });
  });

  /* 2. Fixed entries — everything whose size the session decides. */
  const fixed: PlanEntry[] = [];
  let seq = 0;

  const mainMealTimes = { breakfast: toMin(wake) + 30, lunch: toMin('12:30'), dinner: toMin('19:00') };

  const firstAm = withTimes.find((x) => toMin(x.start) < toMin('09:00'));
  if (firstAm) {
    // Breakfast becomes the recovery meal after an early session.
    mainMealTimes.breakfast = toMin(firstAm.start) + firstAm.s.minutes + 25;
    notes.push(
      `Training starts at ${firstAm.start}, so breakfast has moved to ${toHHMM(mainMealTimes.breakfast)} and doubles as the recovery meal. Eat the small thing before, the big thing after — not both.`,
    );
  }
  const lastSession = withTimes[withTimes.length - 1];
  if (lastSession) {
    const end = toMin(lastSession.start) + lastSession.s.minutes;
    if (end > toMin('17:30')) {
      mainMealTimes.dinner = Math.min(end + 40, toMin(bed) - 75);
      notes.push(`Dinner is at ${toHHMM(mainMealTimes.dinner)} — after the evening session, and far enough before ${bed} to sleep on it.`);
    }
  }

  for (const f of fuel) {
    // Before: a standalone snack only when it does not collide with a main meal.
    if (f.before) {
      const t = toMin(f.before.at);
      const collides = Object.values(mainMealTimes).some((mt) => Math.abs(mt - t) <= 45);
      if (!collides && f.before.carbG > 0) {
        const a = assemblePreFuel(f.before.carbG, prefs);
        fixed.push({
          seq: seq++, at: f.before.at, kind: 'pre', title: `Before ${f.title}`,
          mealKey: null, sessionRef: f.sessionKey, items: a.items,
          kcal: Math.round(a.kcal), p: Math.round(a.p), c: Math.round(a.c), f: Math.round(a.f),
          fibre: Math.round(a.fibre), cost: a.cost, note: f.before.what,
        });
      }
    }

    if (f.during) {
      const sess = withTimes.find((x) => x.s.key === f.sessionKey);
      const a = assembleDuringFuel(f.during.totalCarbG, sess?.s.disc ?? 'BK', prefs);
      fixed.push({
        seq: seq++, at: f.startTime, kind: 'during', title: `During ${f.title}`,
        mealKey: null, sessionRef: f.sessionKey, items: a.items,
        kcal: Math.round(a.kcal), p: Math.round(a.p), c: Math.round(a.c), f: Math.round(a.f),
        fibre: Math.round(a.fibre), cost: a.cost,
        note: `${f.during.carbPerHour} g/h · ${f.during.totalFluidMl} ml fluid · ${f.during.sodiumPerHour} mg sodium per hour. ${f.during.how}`,
      });
    }

    if (f.after && f.after.carbG > 0) {
      const sess = withTimes.find((x) => x.s.key === f.sessionKey);
      const end = sess ? toMin(f.startTime) + sess.s.minutes : toMin(f.startTime);
      const collides = Object.values(mainMealTimes).some((mt) => Math.abs(mt - (end + 25)) <= 50);
      if (!collides) {
        const a = assembleRecovery(f.after.carbG, f.after.proteinG, prefs);
        fixed.push({
          seq: seq++, at: toHHMM(end + 25), kind: 'post', title: `Recovery after ${f.title}`,
          mealKey: null, sessionRef: f.sessionKey, items: a.items,
          kcal: Math.round(a.kcal), p: Math.round(a.p), c: Math.round(a.c), f: Math.round(a.f),
          fibre: Math.round(a.fibre), cost: a.cost, note: f.after.what,
        });
      }
    }
  }

  const fixedTot = fixed.reduce(
    (a, e) => ({ kcal: a.kcal + e.kcal, p: a.p + e.p, c: a.c + e.c }),
    { kcal: 0, p: 0, c: 0 },
  );

  /* 3. What is left for the three meals. */
  const remain = {
    kcal: Math.max(400, T.kcal - fixedTot.kcal),
    p: Math.max(30, T.protein - fixedTot.p),
    c: Math.max(60, T.carb - fixedTot.c),
  };

  const pool = availableMeals(prefs);
  const breakfasts = pool.filter((m) => m.slots.includes('breakfast'));
  const lunches = pool.filter((m) => m.slots.includes('lunch'));
  const dinners = pool.filter((m) => m.slots.includes('dinner'));

  const dow = (new Date(i.day + 'T12:00:00Z').getUTCDay() + 6) % 7;   // 0 = Monday
  const lowResidue = T.lowResidue;
  const enduranceH = countable(resolution)
    .filter((x) => x.disc === 'SW' || x.disc === 'BK' || x.disc === 'RN' || x.disc === 'BR')
    .reduce((a, x) => a + x.minutes, 0) / 60;

  const pickBreakfast = (): MealTemplate | null => {
    if (!breakfasts.length) return null;
    if (firstAm) {
      // A fast, low-residue breakfast on an early-start day.
      return breakfasts.find((m) => m.tags.includes('fast') || m.lowResidue) ?? breakfasts[0];
    }
    if (lowResidue) return breakfasts.find((m) => m.lowResidue) ?? breakfasts[0];
    // Otherwise the same one all week — consistency was asked for, and it is right.
    return breakfasts.find((m) => m.tags.includes('consistent')) ?? breakfasts[0];
  };

  const breakfastPick = pickBreakfast();
  // On the biggest days, prefer the templates built on rice and pasta. They carry
  // far more carbohydrate per gram than potatoes and beans and leave far less in
  // the gut for tomorrow's long session.
  const bulkFirst = (pool: MealTemplate[]): MealTemplate[] => {
    if (!(enduranceH >= 3.5 || lowResidue) || pool.length <= 3) return pool;
    const ranked = [...pool].sort((a, b) => {
      if (a.lowResidue !== b.lowResidue) return Number(b.lowResidue) - Number(a.lowResidue);
      return fibreOf(a) - fibreOf(b);
    });
    // Keep the gentler half and rotate within it, so the fibre comes down
    // without the week collapsing to one meal.
    return ranked.slice(0, Math.max(3, Math.ceil(ranked.length / 2)));
  };

  const lunchRot = pickRotation(bulkFirst(lunches), 3, i.week);
  const dinnerRot = pickRotation(bulkFirst(dinners), 3, i.week + 1);
  let lunchPick = lunchRot.length ? lunchRot[Math.floor(dow / 3) % lunchRot.length] : null;
  let dinnerPick = dinnerRot.length ? dinnerRot[Math.floor(dow / 2) % dinnerRot.length] : null;

  // Several templates sit in both the lunch and the dinner pool, which on some
  // days produced a jacket potato for lunch and the same jacket potato for
  // dinner. Nobody wants that, and it also stacks the fibre.
  const used = new Set<string>([breakfastPick?.key ?? '']);
  if (lunchPick) used.add(lunchPick.key);
  if (dinnerPick && used.has(dinnerPick.key)) {
    dinnerPick = dinners.find((m) => !used.has(m.key)) ?? dinnerPick;
  }
  if (dinnerPick) used.add(dinnerPick.key);
  if (lunchPick && lunchPick.key === dinnerPick?.key) {
    lunchPick = lunches.find((m) => m.key !== dinnerPick?.key && m.key !== breakfastPick?.key) ?? lunchPick;
  }

  // Shares. Dinner carries the most because it is the one meal there is time to cook.
  const share = { breakfast: 0.28, lunch: 0.31, dinner: 0.41 };
  const mains: { kind: EntryKind; at: number; t: MealTemplate | null; w: number }[] = [
    { kind: 'breakfast', at: mainMealTimes.breakfast, t: breakfastPick, w: share.breakfast },
    { kind: 'lunch', at: mainMealTimes.lunch, t: lunchPick, w: share.lunch },
    { kind: 'dinner', at: mainMealTimes.dinner, t: dinnerPick, w: share.dinner },
  ];

  const entries: PlanEntry[] = [...fixed];
  for (const m of mains) {
    if (!m.t) continue;
    const scaled: ScaledMeal = scaleMeal(m.t, {
      kcal: remain.kcal * m.w,
      p: remain.p * m.w,
      c: remain.c * m.w,
    });
    entries.push({
      seq: seq++, at: toHHMM(m.at), kind: m.kind, title: scaled.name,
      mealKey: scaled.key, sessionRef: null,
      items: scaled.items.map((it) => ({ name: it.name, display: it.display, foodKey: it.foodKey, grams: it.grams })),
      kcal: scaled.kcal, p: scaled.p, c: scaled.c, f: scaled.f, fibre: scaled.fibre,
      cost: scaled.cost, note: scaled.method,
    });
  }

  /* 4. Close the gap. On the biggest days the three meals hit their portion
        ceilings before they reach the target — 250 g of dry pasta is already a
        very large plate — so the shortfall goes into an extra carbohydrate
        block rather than into a bigger dinner nobody can finish. */
  let tot = entries.reduce(
    (a, e) => ({ kcal: a.kcal + e.kcal, p: a.p + e.p, c: a.c + e.c, f: a.f + e.f, fibre: a.fibre + e.fibre, cost: a.cost + e.cost }),
    { kcal: 0, p: 0, c: 0, f: 0, fibre: 0, cost: 0 },
  );

  const carbShort = T.carb - tot.c;
  // Only take what the calorie budget has room for — being 200 kcal over to be
  // 40 g of carbohydrate closer is a bad trade — and never more than about 120 g
  // in one sitting, because that is the point at which a "snack" becomes a meal
  // nobody will actually eat.
  const kcalRoom = Math.max(0, T.kcal + 120 - tot.kcal) / 4;
  let carbTake = Math.min(carbShort, kcalRoom);
  // Keep an hour clear of every main meal, or a "snack" lands twenty minutes
  // after lunch and reads like a mistake.
  const mealMins = Object.values(mainMealTimes);
  const clear = (t: number): number => {
    let out = t;
    for (let pass = 0; pass < 6; pass++) {
      const clash = mealMins.find((m) => Math.abs(m - out) < 60);
      if (clash === undefined) break;
      out = clash + 75;
    }
    return Math.min(out, toMin(bed) - 45);
  };
  const topUpTimes = [
    clear(Math.max(toMin('10:30'), mainMealTimes.breakfast + 150)),
    clear(Math.max(toMin('15:30'), mainMealTimes.lunch + 180)),
    clear(Math.max(toMin('21:00'), mainMealTimes.dinner + 100)),
  ];
  let topUps = 0;
  while (carbTake > 30 && topUps < 3) {
    const slice = Math.min(carbTake, 120);
    const a = assembleTopUpCarbs(slice, prefs, T.lowResidue);
    if (!a.items.length) break;
    entries.push({
      seq: seq++, at: toHHMM(topUpTimes[topUps]), kind: 'snack',
      title: topUps === 0 ? 'Extra carbohydrate' : `Extra carbohydrate (${topUps + 1})`,
      mealKey: null, sessionRef: null, items: a.items,
      kcal: Math.round(a.kcal), p: Math.round(a.p), c: Math.round(a.c), f: Math.round(a.f),
      fibre: Math.round(a.fibre), cost: a.cost,
      note: topUps === 0
        ? `Today asks for ${T.carb} g of carbohydrate and three meals will not carry it without becoming unpleasant. This is fuel, not a treat.`
        : 'The rest of it, later, so none of it lands in one sitting.',
    });
    carbTake -= a.c;
    topUps++;
  }
  if (topUps) {
    tot = entries.reduce(
      (a2, e) => ({ kcal: a2.kcal + e.kcal, p: a2.p + e.p, c: a2.c + e.c, f: a2.f + e.f, fibre: a2.fibre + e.fibre, cost: a2.cost + e.cost }),
      { kcal: 0, p: 0, c: 0, f: 0, fibre: 0, cost: 0 },
    );
  }

  if (T.kcal - tot.kcal > 250) {
    const snackPool = pool.filter((m) => m.slots.includes('snack'));
    const snack = snackPool.length ? snackPool[(i.week + dow) % snackPool.length] : null;
    if (snack) {
      const scaled = scaleMeal(snack, {
        kcal: T.kcal - tot.kcal,
        p: Math.max(0, T.protein - tot.p),
        c: Math.max(0, T.carb - tot.c),
      });
      entries.push({
        seq: seq++, at: toHHMM(Math.min(mainMealTimes.dinner - 180, toMin('16:00'))), kind: 'snack',
        title: scaled.name, mealKey: scaled.key, sessionRef: null,
        items: scaled.items.map((it) => ({ name: it.name, display: it.display, foodKey: it.foodKey, grams: it.grams })),
        kcal: scaled.kcal, p: scaled.p, c: scaled.c, f: scaled.f, fibre: scaled.fibre,
        cost: scaled.cost, note: scaled.method,
      });
      tot = entries.reduce(
        (a, e) => ({ kcal: a.kcal + e.kcal, p: a.p + e.p, c: a.c + e.c, f: a.f + e.f, fibre: a.fibre + e.fibre, cost: a.cost + e.cost }),
        { kcal: 0, p: 0, c: 0, f: 0, fibre: 0, cost: 0 },
      );
    }
  }

  entries.sort((a, b) => toMin(a.at) - toMin(b.at));
  entries.forEach((e, n) => { e.seq = n; });

  if (T.fibre - tot.fibre > 8 && !T.lowResidue) {
    notes.push(`Fibre lands about ${Math.round(T.fibre - tot.fibre)} g short of ${T.fibre} g. An apple and a second portion of veg with dinner covers it.`);
  } else if (tot.fibre > T.fibre * 1.7) {
    notes.push(
      `Fibre comes out at ${Math.round(tot.fibre)} g against a ${T.fibre} g target — that is a lot of volume for a big day, and on a long ride the day after it will be felt. Swap some of the potato or wholemeal for white rice or white bread, which is what the low-residue days do anyway.`,
    );
  }

  return {
    day: i.day,
    entries,
    fuel,
    totals: {
      kcal: Math.round(tot.kcal), p: Math.round(tot.p), c: Math.round(tot.c),
      f: Math.round(tot.f), fibre: Math.round(tot.fibre), cost: Math.round(tot.cost * 100) / 100,
    },
    gap: {
      kcal: Math.round(tot.kcal - T.kcal),
      p: Math.round(tot.p - T.protein),
      c: Math.round(tot.c - T.carb),
    },
    notes,
  };
}

export { MEAL_BY_KEY };
export type { ResolvedSession };
