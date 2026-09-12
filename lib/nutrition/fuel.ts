/**
 * Training fuelling — before, during and after.
 *
 * Two principles run through this file.
 *
 * First, the gut is trainable and has to be trained. Ninety grams of
 * carbohydrate an hour is a learned skill, not a purchase, and an athlete who
 * tries it for the first time on race day will spend the marathon finding that
 * out. So the target rises on a ladder, gated by whether the last attempts
 * actually went down without trouble.
 *
 * Second, everything eaten around training is part of the day, not an extra.
 * The carbohydrate taken on the bike counts toward the daily carbohydrate
 * target — it does not sit alongside it. Systems that treat in-session fuel as
 * separate are the reason people end Ironman builds heavier than they started.
 */

import type { Phase } from './targets';
import type { Profile } from './energy';
import type { ResolvedSession } from './resolve';

/* ------------------------------------------------------- the carbohydrate ladder */

/** Ceiling for grams of carbohydrate per hour, by phase. */
const PHASE_CEILING: Record<Phase, number> = {
  base: 60,
  build: 75,
  'long-endurance': 90,
  'race-specific': 90,
  taper: 90,
  race: 90,
  recovery: 60,
};

export const LADDER = [30, 45, 60, 75, 90];

export type ToleranceRow = {
  day: string;
  duration_min: number | null;
  carbs_per_h: number;
  gi_ok: boolean;
};

export type CarbTarget = {
  gPerHour: number;
  ceiling: number;
  changed: 'up' | 'down' | 'hold';
  why: string;
};

/**
 * Where the gut is today.
 *
 * Progresses a rung when the last two qualifying sessions (90 minutes or more)
 * were completed at the current target without trouble. Drops a rung — and
 * holds for a fortnight — the moment one is not. It does not chase the ceiling.
 */
export function carbPerHourTarget(
  current: number,
  phase: Phase,
  history: ToleranceRow[],
  today: string,
): CarbTarget {
  const ceiling = PHASE_CEILING[phase];
  const qualifying = history
    .filter((h) => (h.duration_min ?? 0) >= 90)
    .sort((a, b) => b.day.localeCompare(a.day));

  const cur = Math.min(Math.max(current || 45, 30), ceiling);

  // A recent problem outranks everything.
  const recentBad = qualifying.find((h) => !h.gi_ok);
  if (recentBad) {
    const daysSince = Math.round(
      (new Date(today + 'T12:00:00Z').getTime() - new Date(recentBad.day + 'T12:00:00Z').getTime()) / 86_400_000,
    );
    if (daysSince <= 14) {
      const idx = Math.max(0, LADDER.findIndex((x) => x >= cur) - 1);
      const dropped = Math.min(LADDER[idx], ceiling);
      return {
        gPerHour: dropped,
        ceiling,
        changed: dropped < cur ? 'down' : 'hold',
        why: `Gut trouble logged on ${recentBad.day} at ${recentBad.carbs_per_h} g/h. Back a rung to ${dropped} g/h and hold there for a fortnight — pushing through a gut that has said no is how a race gets lost in the first hour of the run.`,
      };
    }
  }

  const clean = qualifying.filter((h) => h.gi_ok && h.carbs_per_h >= cur - 2).slice(0, 2);
  if (clean.length >= 2 && cur < ceiling) {
    const next = Math.min(ceiling, LADDER.find((x) => x > cur) ?? ceiling);
    return {
      gPerHour: next,
      ceiling,
      changed: 'up',
      why: `Two long sessions at ${cur} g/h with no trouble, so the target steps up to ${next} g/h. Take it on the next long ride first — the bike tolerates far more than the run does.`,
    };
  }

  if (cur >= ceiling) {
    return {
      gPerHour: ceiling,
      ceiling,
      changed: 'hold',
      why: `At the ceiling for this phase (${ceiling} g/h). Hold it, practise it, and let the next phase raise it.`,
    };
  }

  return {
    gPerHour: cur,
    ceiling,
    changed: 'hold',
    why: `Holding at ${cur} g/h. Two clean long sessions at this rate and it goes up — log the grams and whether your stomach was happy after every session over ninety minutes.`,
  };
}

/* ----------------------------------------------------------- per-session fuel */

export type FuelPlan = {
  sessionKey: string;
  title: string;
  startTime: string;
  minutes: number;
  before: { at: string; what: string; carbG: number; fluidMl: number } | null;
  during: {
    carbPerHour: number;
    totalCarbG: number;
    fluidMlPerHour: number;
    totalFluidMl: number;
    sodiumPerHour: number;
    how: string;
    carry: string;
  } | null;
  after: { within: string; what: string; carbG: number; proteinG: number; fluidMl: number } | null;
  notes: string[];
};

function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const t = ((h * 60 + m + mins) % 1440 + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export function timeForSlot(slot: string, times: { am: string; pm: string; eve: string }): string {
  if (slot === 'AM') return times.am;
  if (slot === 'PM') return times.pm;
  if (slot === 'EVE') return times.eve;
  return times.pm;
}

/**
 * What to eat around one session.
 *
 * `carbPerH` comes from the ladder above and is already phase-capped; this
 * function decides whether the session is long enough to need it, and what the
 * practical form should be.
 */
export function sessionFuel(
  s: ResolvedSession,
  p: Profile,
  startTime: string,
  carbPerH: number,
  opts: { anotherSessionWithin8h: boolean; wakeTime: string; phase: Phase },
): FuelPlan {
  const kg = p.weightKg;
  const mins = s.minutes;
  const hours = mins / 60;
  const notes: string[] = [];
  const hard = !!s.keyIntensity || (s.rpe ?? 0) >= 8;
  const earlyStart = startTime < '08:00';

  /* ------------------------------------------------------------------ before */
  let before: FuelPlan['before'] = null;
  if (mins >= 45 || hard) {
    if (earlyStart) {
      // Nothing is gained by forcing a full breakfast into a 06:30 start, and
      // plenty is lost. Small and fast before; the real meal goes after.
      const carbG = mins >= 120 || hard ? 60 : 30;
      before = {
        at: addMinutes(startTime, -35),
        what:
          carbG >= 60
            ? 'Two slices of toast with honey and a banana, 400 ml of water. Small, fast, mostly carbohydrate — the proper breakfast is the recovery meal afterwards.'
            : 'A banana and 300 ml of water, or half a bagel with jam. Enough to top up liver glycogen overnight, not enough to sit in your stomach.',
        carbG,
        fluidMl: 400,
      };
      notes.push('Early start: the main breakfast has been moved to after the session, where it doubles as recovery. That is deliberate — do not eat both.');
    } else if (mins >= 150 || hard) {
      const carbG = Math.round(1.75 * kg);
      before = {
        at: addMinutes(startTime, -165),
        what: `A proper meal about 2½–3 hours out: ${carbG} g of carbohydrate, low fat, low fibre. Rice or pasta with a lean protein, not a fry-up. Then 30 g more (a banana or a gel) 15 minutes before you start.`,
        carbG: carbG + 30,
        fluidMl: 600,
      };
    } else {
      const carbG = Math.round(1.0 * kg);
      before = {
        at: addMinutes(startTime, -100),
        what: `About ${carbG} g of carbohydrate 1½–2 hours out — porridge, toast and jam, or rice left over from batch night. Keep the fat and fibre low.`,
        carbG,
        fluidMl: 500,
      };
    }
  }

  /* ------------------------------------------------------------------ during */
  let during: FuelPlan['during'] = null;
  if (mins >= 60) {
    let perHour: number;
    if (mins < 90) perHour = Math.min(30, carbPerH);
    else if (mins < 150) perHour = Math.min(60, carbPerH);
    else perHour = carbPerH;

    // The run tolerates less than the bike does, always.
    if (s.disc === 'RN' && perHour > 60) {
      perHour = 60;
      notes.push('Capped at 60 g/h because this is a run. The bike will take 90; the run almost never does, and finding out otherwise mid-marathon is not a plan.');
    }

    const fluidPerHour = hard || s.disc === 'RN' ? 700 : 600;
    const sodiumPerHour = mins >= 90 ? (hard ? 700 : 500) : 300;
    const totalCarb = Math.round((perHour * mins) / 60);

    during = {
      carbPerHour: perHour,
      totalCarbG: totalCarb,
      fluidMlPerHour: fluidPerHour,
      totalFluidMl: Math.round((fluidPerHour * mins) / 60),
      sodiumPerHour,
      how: fuelForm(s.disc, perHour, mins),
      carry: carryList(s.disc, totalCarb, Math.round((fluidPerHour * mins) / 60)),
    };
  } else if (mins >= 30) {
    notes.push('Under an hour — water is all this session needs. Carbohydrate now is habit, not fuelling.');
  }

  /* ------------------------------------------------------------------- after */
  let after: FuelPlan['after'] = null;
  const needsFastRecovery = mins >= 90 || hard || opts.anotherSessionWithin8h;
  if (needsFastRecovery) {
    const carbG = Math.round((opts.anotherSessionWithin8h ? 1.2 : 1.0) * kg);
    const proteinG = Math.round(0.3 * kg);
    after = {
      within: opts.anotherSessionWithin8h ? '30 minutes' : '60 minutes',
      what: opts.anotherSessionWithin8h
        ? `You train again inside eight hours, so this one matters: ${carbG} g of carbohydrate and ${proteinG} g of protein within half an hour. 500 ml of milk plus a large bowl of cereal, or rice and chicken out of the fridge, gets you most of the way.`
        : `${carbG} g of carbohydrate and ${proteinG} g of protein within the hour. This is usually just the next meal, moved.`,
      carbG,
      proteinG,
      fluidMl: Math.round(hours * 500 + 500),
    };
  } else if (mins >= 45) {
    after = {
      within: '2 hours',
      what: `The next meal covers it. No special recovery drink needed — that is a marketing category, not a physiological one, on a session this size.`,
      carbG: 0,
      proteinG: Math.round(0.3 * kg),
      fluidMl: 500,
    };
  }

  if (mins >= 150 && opts.phase !== 'base') {
    notes.push('A session this long is a fuelling rehearsal. Use exactly what you intend to use on race day, and log the grams and how your stomach was afterwards — that is what moves the ladder.');
  }

  return {
    sessionKey: s.key,
    title: s.title || s.disc,
    startTime,
    minutes: mins,
    before,
    during,
    after,
    notes,
  };
}

function fuelForm(disc: string, perHour: number, mins: number): string {
  if (disc === 'SW') return 'Nothing in the water for anything under ninety minutes. For a long open-water set, drink at the wall or at the turnaround.';
  if (disc === 'BK') {
    if (perHour <= 45) return `${perHour} g/h — one 750 ml bottle made up with 60 g of sugar and a pinch of salt covers most of it, plus a banana in the back pocket.`;
    if (perHour <= 75) return `${perHour} g/h — two bottles at 60 g each, and a flapjack or malt loaf on top. Drink to a schedule, not to thirst: every 15 minutes, whether you fancy it or not.`;
    return `${perHour} g/h — this needs a plan. Two 750 ml bottles at 80 g each plus solid food every 45 minutes. Split it across the hour rather than taking it in two hits.`;
  }
  if (disc === 'RN') {
    if (mins < 90) return `${perHour} g/h — a gel or 300 ml of drink at the halfway point.`;
    return `${perHour} g/h — a gel or equivalent every 20–25 minutes with water. Solid food runs far worse than it rides.`;
  }
  return `${perHour} g/h of easy carbohydrate with fluid.`;
}

function carryList(disc: string, carbG: number, fluidMl: number): string {
  const bottles = Math.ceil(fluidMl / 750);
  if (disc === 'BK') {
    return `${bottles} × 750 ml bottle${bottles === 1 ? '' : 's'} and ${carbG} g of carbohydrate in total. Homemade mix: 60 g of table sugar in 750 ml with a quarter-teaspoon of salt is ~60 g of carbohydrate for about 5p, and works as well as anything you can buy.`;
  }
  if (disc === 'RN') {
    return `${carbG} g of carbohydrate. On anything over 90 minutes, carry a soft flask rather than relying on water fountains.`;
  }
  return `${carbG} g of carbohydrate, ${fluidMl} ml of fluid.`;
}

/* -------------------------------------------------------------- the race plan */

export type RacePlan = {
  swim: string;
  bike: { carbPerHour: number; fluidPerHour: number; sodiumPerHour: number; detail: string };
  run: { carbPerHour: number; fluidPerHour: number; sodiumPerHour: number; detail: string };
  preRace: string[];
  dayBefore: string[];
};

export function racePlan(p: Profile, tolerance: number): RacePlan {
  const bikeCarb = Math.min(100, Math.max(60, tolerance));
  const runCarb = Math.min(70, Math.max(45, tolerance - 15));
  return {
    dayBefore: [
      `${Math.round(9 * p.weightKg)} g of carbohydrate across the day — about ${(9).toFixed(0)} g per kilo. Rice, pasta, bread, jam, juice, sports drink. Low fibre, low fat, nothing you have not eaten before.`,
      'Salt your food more than usual and keep sipping. You are topping up sodium as well as glycogen.',
      'Last proper meal early evening. A carbohydrate snack before bed is fine and helps you sleep.',
      'Weigh yourself in the morning — being up a kilo or two is glycogen and water, and it is exactly what you want.',
    ],
    preRace: [
      `3 hours before the start: ${Math.round(2 * p.weightKg)} g of carbohydrate — porridge made with water, honey, a banana, and a bottle of sports drink. This is the meal you have already rehearsed on every long ride.`,
      '60 minutes before: 500 ml of sports drink, sipped, then stop drinking.',
      '10 minutes before: one gel with a mouthful of water.',
    ],
    swim: 'Nothing. You cannot fuel a 3.8 km swim and you do not need to. Drink at the last moment before the start and take the first bottle in T1.',
    bike: {
      carbPerHour: bikeCarb,
      fluidPerHour: 750,
      sodiumPerHour: 700,
      detail: `${bikeCarb} g/h for five and a half hours is ${Math.round((bikeCarb * 5.5))} g of carbohydrate on the bike alone. Start eating in the first fifteen minutes — the hour you skip early is the hour you pay for on the run. Set an alarm on the head unit if you have to.`,
    },
    run: {
      carbPerHour: runCarb,
      fluidPerHour: 600,
      sodiumPerHour: 600,
      detail: `${runCarb} g/h, taken little and often at the aid stations. Expect appetite to disappear around 25 km; keep taking it anyway. Coke from halfway is legitimate and works.`,
    },
  };
}
