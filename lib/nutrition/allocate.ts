/**
 * Weekly energy allocation.
 *
 * The old model asked one question a day: what did today cost, and what should
 * today therefore be? That is arithmetically correct and practically useless at
 * the edges, because a human being is not a daily ledger. On a six-hour
 * Saturday the honest answer is 5,400 kcal, and the honest answer to "can you
 * eat 5,400 kcal in a day, on top of four hours in the aero position" is no —
 * appetite is suppressed for hours after a long ride, and the gut has already
 * done a day's work absorbing the fuel that went in during it.
 *
 * The physiology says the same thing: glycogen loading works on a 24–48 hour
 * horizon, not a same-day one. The way the calories actually get in is that the
 * day before is bigger and the day after is bigger, and the monster day itself
 * is large but finishable.
 *
 * So the unit of allocation here is the WEEK. The week's requirement is
 * computed from the week's training, and it is conserved — nothing is invented
 * and nothing is quietly dropped. What changes is only which day each calorie
 * is offered on, subject to:
 *
 *   1. a ceiling on what one day can absorb,
 *   2. a floor no day may fall below (energy availability, and simple hunger),
 *   3. a limit on how sharply the target may step between adjacent days
 *      relative to how sharply the training actually stepped.
 *
 * Rule 3 is the one the brief cares most about, and it is worth being precise:
 * a 25% change in training load may not produce a 150% change in calories. It
 * cannot, in this architecture, because energy is baseline plus training and
 * the baseline does not move — but the check is enforced anyway, because an
 * architecture that merely happens to be right is not the same as one that
 * refuses to be wrong.
 */

import { EA_FLOOR } from './energy';

export type DayNeed = {
  day: string;
  /** RMR × non-exercise PAL. Does not move with training. */
  baseline: number;
  /** Net cost of training, already de-double-counted. */
  exercise: number;
  /** Standing adjustment from the weight trend. */
  adjust: number;
  /** Total minutes of training that count. */
  minutes: number;
  /** Fat-free mass, for the energy-availability floor. */
  ffm: number;
  /** Bodyweight, for the absorbable ceiling. */
  kg: number;
};

export type DayAllocation = {
  day: string;
  /** What the day's own training and body said it needed. */
  raw: number;
  /** What the day is actually asked to eat. */
  allocated: number;
  /** allocated − raw. Positive means calories were carried in from elsewhere. */
  delta: number;
  /** Where a positive delta came from, or where a negative one went. */
  movedWith: string[];
  /** Why this day's number is what it is, in one sentence. */
  reason: string;
  /** The ceiling that applied, for the audit. */
  ceiling: number;
  floor: number;
  /**
   * True when the energy-availability floor for this day is higher than what
   * one day can comfortably absorb, and the floor has been allowed to win.
   *
   * These two limits are not the same kind of thing. The ceiling is a comfort
   * limit — a statement about appetite and gut capacity, and about plans people
   * actually follow. The floor is a safety limit: below it the cost lands on
   * hormones, bone and immune function, quietly, over months. On a six-hour day
   * they genuinely conflict, because the training alone has eaten most of the
   * intake before anything is left over to live on. When that happens the floor
   * wins and the app says so out loud, rather than printing a comfortable
   * number and letting the athlete find out the hard way.
   */
  eaOverride: boolean;
};

export type WeekAllocation = {
  days: DayAllocation[];
  weeklyRaw: number;
  weeklyAllocated: number;
  /** Sum of |delta| ÷ 2 — how much energy the smoothing actually moved. */
  moved: number;
  notes: string[];
  /** True when the week could not be balanced inside the ceilings. */
  residual: number;
};

/**
 * Kilocalories per kilogram of bodyweight that one day can realistically be
 * asked to absorb.
 *
 * 68 kg × 65 ≈ 4,400 kcal. That is a genuinely big day of eating — about
 * 1,100 g of food dry-weight equivalent — and it is roughly where the
 * literature on very-high-intake days sits before compliance collapses. Above
 * it, the plan stops being a plan and starts being a wish.
 */
export const ABSORB_CEILING_PER_KG = 65;

/**
 * The hard upper bound. Anything above this is not a big day, it is a bug, and
 * the audit blocks on it rather than printing it.
 */
export const IMPLAUSIBLE_PER_KG = 85;

/**
 * Energy availability floor, kcal per kg of fat-free mass. Not negotiable, and
 * re-exported from `energy.ts` rather than redeclared here — two copies of a
 * safety limit is one copy too many.
 */
export { EA_FLOOR };

/**
 * How much sharper the calorie step may be than the training step.
 *
 * If training goes up 30% between two days, calories may go up at most
 * 30% × 1.6 + 8 points ≈ 56%. The additive term exists so that two near-equal
 * days are not pinned to each other by a divide-by-nearly-zero.
 */
export const STEP_GAIN = 1.6;
export const STEP_FLOOR_PP = 8;

function round10(n: number): number {
  return Math.round(n / 10) * 10;
}

export function allocateWeek(needs: DayNeed[]): WeekAllocation {
  const notes: string[] = [];
  if (!needs.length) {
    return { days: [], weeklyRaw: 0, weeklyAllocated: 0, moved: 0, notes, residual: 0 };
  }

  const raw = needs.map((n) => n.baseline + n.exercise + n.adjust);
  const ceiling = needs.map((n) => Math.max(n.baseline + 400, n.kg * ABSORB_CEILING_PER_KG));
  const eaNeed = needs.map((n) => EA_FLOOR * n.ffm + n.exercise);
  const floor = needs.map((n, i) => Math.max(eaNeed[i], n.baseline * 0.92));
  // Where the safety floor is above the comfort ceiling, the floor wins.
  const eaOverride = needs.map((_, i) => eaNeed[i] > ceiling[i] + 1);

  const weeklyRaw = raw.reduce((a, b) => a + b, 0);
  const alloc = [...raw];
  const movedWith: string[][] = needs.map(() => []);

  /* ------------------------------------------------- 1. ceiling and carry */

  const label = (i: number) => new Date(needs[i].day + 'T12:00:00Z')
    .toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });

  /** Try to give `amount` to day `i`; returns what was actually taken. */
  const give = (i: number, amount: number): number => {
    if (i < 0 || i >= alloc.length || amount <= 0) return 0;
    const room = Math.max(0, ceiling[i] - alloc[i]);
    const take = Math.min(room, amount);
    alloc[i] += take;
    return take;
  };

  for (let pass = 0; pass < 3; pass++) {
    let movedThisPass = 0;
    for (let i = 0; i < alloc.length; i++) {
      const over = alloc[i] - ceiling[i];
      if (over <= 1) continue;
      // The day before takes the larger share. Filling the tank in advance is
      // what actually works; eating it back afterwards is second best.
      let left = over;
      const before = give(i - 1, left * 0.6);
      left -= before;
      const after = give(i + 1, left);
      left -= after;
      const placed = over - left;
      alloc[i] -= placed;
      movedThisPass += placed;
      if (before > 0 && pass === 0) {
        movedWith[i].push(`${round10(before)} kcal moved back to ${label(i - 1)}`);
        movedWith[i - 1]?.push(`${round10(before)} kcal carried in from ${label(i)}`);
      }
      if (after > 0 && pass === 0) {
        movedWith[i].push(`${round10(after)} kcal moved on to ${label(i + 1)}`);
        movedWith[i + 1]?.push(`${round10(after)} kcal carried in from ${label(i)}`);
      }
    }
    if (movedThisPass < 5) break;
  }

  // Anything still over the ceiling after three passes spreads across whatever
  // headroom the rest of the week has, proportionally.
  let residual = 0;
  for (let i = 0; i < alloc.length; i++) {
    const over = alloc[i] - ceiling[i];
    if (over <= 1) continue;
    const headroom = alloc.map((a, j) => (j === i ? 0 : Math.max(0, ceiling[j] - a)));
    const totalRoom = headroom.reduce((a, b) => a + b, 0);
    if (totalRoom <= 0) { residual += over; continue; }
    const place = Math.min(over, totalRoom);
    for (let j = 0; j < alloc.length; j++) {
      if (!headroom[j]) continue;
      alloc[j] += (headroom[j] / totalRoom) * place;
    }
    alloc[i] -= place;
    residual += over - place;
    movedWith[i].push(`${round10(place)} kcal spread across the rest of the week — one day could not carry it`);
  }

  if (residual > 20) {
    notes.push(
      `The week asks for about ${round10(residual)} kcal more than seven days can comfortably absorb. That is a signal about the training block, not about the food: if it persists for more than a week, the volume is ahead of what the body can be fed for.`,
    );
  }

  /* -------------------------------------------------------- 2. floors */

  for (let i = 0; i < alloc.length; i++) {
    if (alloc[i] >= floor[i]) continue;
    const short = floor[i] - alloc[i];
    // Take it from the day with the most slack above its own floor.
    let remaining = short;
    const order = alloc
      .map((a, j) => ({ j, slack: a - floor[j] }))
      .filter((x) => x.j !== i && x.slack > 0)
      .sort((a, b) => b.slack - a.slack);
    for (const o of order) {
      if (remaining <= 0) break;
      const take = Math.min(o.slack, remaining);
      alloc[o.j] -= take;
      remaining -= take;
    }
    alloc[i] = floor[i] - remaining;
    movedWith[i].push(`raised to the energy-availability floor`);
  }

  /* ------------------------------------------- 3. proportionality limiter */

  const loadOf = (i: number) => needs[i].exercise;
  for (let pass = 0; pass < 4; pass++) {
    let fixed = 0;
    for (let i = 1; i < alloc.length; i++) {
      const a = alloc[i - 1], b = alloc[i];
      const base = (a + b) / 2;
      if (base <= 0) continue;
      const kcalStepPp = (Math.abs(b - a) / base) * 100;
      const lA = loadOf(i - 1), lB = loadOf(i);
      const lBase = Math.max(120, (lA + lB) / 2);
      const loadStepPp = (Math.abs(lB - lA) / lBase) * 100;
      const allowed = loadStepPp * STEP_GAIN + STEP_FLOOR_PP;
      if (kcalStepPp <= allowed + 0.5) continue;

      // Pull the two together until the step is inside the allowance, without
      // changing their sum — the week's energy is conserved.
      const target = (allowed / 100) * base;
      const excess = Math.abs(b - a) - target;
      const shift = excess / 2;
      const hi = b > a ? i : i - 1;
      const lo = b > a ? i - 1 : i;
      // Respect the floors and ceilings that already applied.
      const canTake = Math.max(0, alloc[hi] - floor[hi]);
      const canGive = Math.max(0, ceiling[lo] - alloc[lo]);
      const s = Math.min(shift, canTake, canGive);
      if (s < 1) continue;
      alloc[hi] -= s;
      alloc[lo] += s;
      fixed += s;
    }
    if (fixed < 5) break;
  }

  /* ------------------------------------------------------ 4. round and close */

  const rounded = alloc.map(round10);
  const drift = round10(weeklyRaw) - rounded.reduce((a, b) => a + b, 0);
  if (drift !== 0) {
    // Put the rounding remainder on the biggest day, where 10 kcal is noise.
    let big = 0;
    for (let i = 1; i < rounded.length; i++) if (rounded[i] > rounded[big]) big = i;
    rounded[big] += drift;
  }

  const days: DayAllocation[] = needs.map((n, i) => {
    const delta = rounded[i] - round10(raw[i]);
    const hrs = (n.minutes / 60).toFixed(1);
    let reason: string;
    if (Math.abs(delta) < 15) {
      reason = `${round10(n.baseline)} kcal to live on plus ${Math.round(n.exercise)} kcal for ${hrs} h of training${n.adjust ? `, ${n.adjust > 0 ? 'plus' : 'minus'} ${Math.abs(n.adjust)} kcal from the weight trend` : ''}.`;
    } else if (delta > 0) {
      reason = `${round10(n.baseline)} kcal to live on plus ${Math.round(n.exercise)} kcal for ${hrs} h of training, plus ${Math.abs(delta)} kcal carried in from a neighbouring day that could not be eaten on the day it was earned.`;
    } else {
      reason = `${round10(n.baseline)} kcal to live on plus ${Math.round(n.exercise)} kcal for ${hrs} h of training, less ${Math.abs(delta)} kcal moved to the days either side — ${Math.round(raw[i])} kcal is more than one day absorbs well.`;
    }
    return {
      day: n.day,
      raw: round10(raw[i]),
      allocated: rounded[i],
      delta,
      movedWith: movedWith[i],
      reason,
      ceiling: round10(ceiling[i]),
      floor: round10(floor[i]),
      eaOverride: eaOverride[i],
    };
  });

  for (let i = 0; i < needs.length; i++) {
    if (!eaOverride[i]) continue;
    notes.push(
      `${label(i)} is the day where the two limits disagree. ${Math.round(needs[i].exercise).toLocaleString('en-GB')} kcal of training leaves so little of a normal day's intake behind that meeting the energy-availability floor (${round10(eaNeed[i]).toLocaleString('en-GB')} kcal) means eating more than one day comfortably absorbs (${round10(ceiling[i]).toLocaleString('en-GB')} kcal). The floor wins: it is a health limit, not a comfort one. Practically that means fuelling hard during the session itself — most of that gap closes on the bike, not at the table — and not letting the evening meal be the whole plan.`,
    );
  }

  const moved = days.reduce((a, d) => a + Math.abs(d.delta), 0) / 2;
  if (moved > 100) {
    notes.push(
      `${Math.round(moved)} kcal has been moved between days this week. Nothing has been added or removed — the week still totals ${round10(weeklyRaw).toLocaleString('en-GB')} kcal. What has changed is which day it is offered on, so the biggest day is finishable and the days either side of it do the loading and the refilling.`,
    );
  }

  return {
    days,
    weeklyRaw: round10(weeklyRaw),
    weeklyAllocated: rounded.reduce((a, b) => a + b, 0),
    moved: Math.round(moved),
    notes,
    residual: Math.round(residual),
  };
}

/**
 * Allocation for a single day when the surrounding week is not available.
 *
 * The day pages can be reached directly, and loading six more days of training
 * to render one is a real cost. This applies the same ceiling and floor to one
 * day in isolation and says so, so nothing silently disagrees with the week
 * view — it simply cannot smooth, because there is nothing to smooth against.
 */
export function allocateStandalone(need: DayNeed): DayAllocation {
  const rawKcal = need.baseline + need.exercise + need.adjust;
  const ceil = Math.max(need.baseline + 400, need.kg * ABSORB_CEILING_PER_KG);
  const flr = Math.max(EA_FLOOR * need.ffm + need.exercise, need.baseline * 0.92);
  const allocated = round10(Math.min(ceil, Math.max(flr, rawKcal)));
  const delta = allocated - round10(rawKcal);
  return {
    day: need.day,
    raw: round10(rawKcal),
    allocated,
    delta,
    movedWith: delta < 0 ? ['capped at what one day absorbs — open the week view to see where it went'] : [],
    reason: delta < 0
      ? `${round10(need.baseline)} kcal to live on plus ${Math.round(need.exercise)} kcal of training comes to ${round10(rawKcal)} kcal, which is more than a day absorbs. Capped at ${allocated} kcal; the rest belongs on the days either side.`
      : `${round10(need.baseline)} kcal to live on plus ${Math.round(need.exercise)} kcal for ${(need.minutes / 60).toFixed(1)} h of training.`,
    ceiling: round10(ceil),
    floor: round10(flr),
    eaOverride: EA_FLOOR * need.ffm + need.exercise > ceil + 1,
  };
}
