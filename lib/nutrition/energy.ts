/**
 * Energy.
 *
 * There is exactly one place in this application that converts a training
 * session into calories, and this is it. Everything downstream — the daily
 * target, the weekly plan, the shopping list — reads from `dayEnergy`, which
 * reads from `sessionEnergy`. That is deliberate: the commonest way a system
 * like this goes wrong is by counting the same hour of exercise twice, once in
 * an "activity multiplier" and once in a session total, and then quietly
 * over-feeding by six hundred calories a day.
 *
 * The structure that prevents it:
 *
 *   total = RMR × non-exercise PAL  +  Σ NET exercise cost
 *
 * The PAL covers living — walking about, fidgeting, the thermic effect of food.
 * It is 1.35, a genuinely sedentary-life figure, NOT one of the 1.7–2.0
 * "very active" multipliers, because the training is added explicitly below it.
 * And the exercise term is NET of resting metabolism for those minutes, because
 * the PAL has already paid for the athlete existing during that hour.
 */

export type Sex = 'male' | 'female';

export type Profile = {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  sex: Sex;
  bodyFatPct: number | null;
  neatPal: number;
};

export type Confidence = 'measured' | 'estimated' | 'rough';

export type EnergyPart = {
  label: string;
  kcal: number;
  confidence: Confidence;
  basis: string;
};

/* ------------------------------------------------------- resting metabolism */

/**
 * Cunningham when body composition is known, Mifflin–St Jeor when it is not.
 *
 * Mifflin is the better general-population equation, but it under-reads lean
 * endurance athletes because it cannot see that a 68 kg body with 10% fat
 * carries more metabolically active tissue than a 68 kg body with 25%. When
 * fat-free mass is available, Cunningham uses it directly.
 */
export function restingMetabolicRate(p: Profile): { kcal: number; method: string } {
  if (p.bodyFatPct != null && p.bodyFatPct > 2 && p.bodyFatPct < 50) {
    const ffm = p.weightKg * (1 - p.bodyFatPct / 100);
    return { kcal: Math.round(500 + 22 * ffm), method: `Cunningham, from ${ffm.toFixed(1)} kg fat-free mass` };
  }
  const s = p.sex === 'female' ? -161 : 5;
  const kcal = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.ageYears + s;
  return { kcal: Math.round(kcal), method: 'Mifflin–St Jeor (no body-fat figure on file)' };
}

export function fatFreeMass(p: Profile): number {
  return p.bodyFatPct != null ? p.weightKg * (1 - p.bodyFatPct / 100) : p.weightKg * 0.88;
}

/* ------------------------------------------------------------------- METs */

export type Disc = 'SW' | 'BK' | 'RN' | 'ST' | 'OT' | 'BR';
export type Zone = 'z1' | 'z2' | 'z3' | 'z4' | 'z5';

/**
 * Compendium-of-physical-activity values, chosen for a trained 18-year-old
 * rather than for the general population — a fit athlete does more work per
 * minute at the same perceived effort.
 */
const MET: Record<Disc, Record<Zone, number>> = {
  SW: { z1: 5.3, z2: 7.0, z3: 8.3, z4: 10.0, z5: 11.5 },
  BK: { z1: 4.8, z2: 7.0, z3: 8.8, z4: 10.8, z5: 12.5 },
  RN: { z1: 7.0, z2: 9.0, z3: 10.5, z4: 12.3, z5: 14.0 },
  ST: { z1: 3.5, z2: 5.0, z3: 5.5, z4: 6.0, z5: 6.0 },
  OT: { z1: 4.0, z2: 5.5, z3: 6.5, z4: 7.5, z5: 8.0 },
  BR: { z1: 6.0, z2: 8.0, z3: 9.6, z4: 11.5, z5: 13.0 },
};

/** kcal per minute, net of resting metabolism, from a MET value. */
function netFromMet(met: number, weightKg: number): number {
  return ((met - 1) * 3.5 * weightKg) / 200;
}

/* -------------------------------------------------------- intensity inference */

export type SessionInput = {
  disc: Disc;
  minutes: number;
  title?: string | null;
  detail?: string | null;
  /** Watts — the only genuinely measured input for the bike. */
  avgPower?: number | null;
  np?: number | null;
  avgHr?: number | null;
  lthr?: number | null;
  /** km */
  distance?: number | null;
  /** seconds per km (run) or per 100 m (swim) */
  avgPaceSec?: number | null;
  rpe?: number | null;
  keyIntensity?: boolean;
  keySession?: boolean;
};

const HARD_WORDS = /interval|threshold|vo2|tempo|race pace|hill repeat|sharpen|time trial|\bftp\b|css set|over-under/i;
const EASY_WORDS = /easy|recovery|technique|drill|z1|flush|shake|mobility|pre-race/i;

const ORDER: Zone[] = ['z1', 'z2', 'z3', 'z4', 'z5'];
const lower = (a: Zone, b: Zone): Zone => (ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b);

/**
 * Best guess at the average zone a session sat in, when nothing was measured.
 *
 * Duration is the hard constraint and it outranks the session's name. A
 * four-hour ride described as "endurance with race-pace blocks" contains twenty
 * minutes of race pace and three hours and forty of Z2; reading the words and
 * calling the whole thing threshold produced an estimate nearly a thousand
 * calories too high, which is exactly the sort of error that quietly ruins a
 * plan like this one.
 */
export function inferZone(s: SessionInput): Zone {
  const mins = s.minutes || 0;
  const text = `${s.title ?? ''} ${s.detail ?? ''}`;

  let named: Zone;
  let fromRpe = false;

  if (s.rpe != null) {
    fromRpe = true;
    named = s.rpe <= 3 ? 'z1' : s.rpe <= 5 ? 'z2' : s.rpe <= 7 ? 'z3' : s.rpe <= 8 ? 'z4' : 'z5';
  } else if (EASY_WORDS.test(text)) {
    named = 'z1';
  } else if (s.keyIntensity || HARD_WORDS.test(text)) {
    named = 'z4';
  } else if (mins >= 150) {
    named = 'z2';
  } else {
    named = s.keySession ? 'z3' : 'z2';
  }

  // Reported effort is real data; a word in a title is not. A title describes the
  // hardest part of a session, not its average — "endurance with race-pace
  // blocks" is three and a half hours of Z2 and twenty minutes of race pace — so
  // keyword-derived intensity gets the stricter ceiling of the two.
  const ceiling: Zone = fromRpe
    ? (mins >= 210 ? 'z3' : mins >= 150 ? 'z3' : mins >= 90 ? 'z4' : 'z5')
    : (mins >= 150 ? 'z2' : mins >= 75 ? 'z3' : 'z4');

  return lower(named, ceiling);
}

function zoneFromHr(hr: number, lthr: number): Zone {
  const pct = hr / lthr;
  if (pct < 0.81) return 'z1';
  if (pct < 0.90) return 'z2';
  if (pct < 0.96) return 'z3';
  if (pct < 1.03) return 'z4';
  return 'z5';
}

/* ------------------------------------------------------------ the one function */

/**
 * Net energy cost of one session, in kcal, with an honest confidence flag.
 *
 * The estimator is tiered. It uses the best input available and says which one
 * it used, so a number built from a duration and a guess is never displayed as
 * though it were built from a power meter.
 */
export function sessionEnergy(s: SessionInput, p: Profile, rmrKcal: number): EnergyPart {
  const mins = Math.max(0, s.minutes || 0);
  const label = s.title || s.disc;
  if (!mins) return { label, kcal: 0, confidence: 'measured', basis: 'no duration' };

  const restPerMin = rmrKcal / 1440;

  // 1. Cycling with power. Work is measured, so this is as good as it gets.
  //    At ~24% gross efficiency, 1 kJ of work costs about 1 kcal, so the kJ
  //    figure is the gross cost; subtract rest to get the net.
  if ((s.disc === 'BK' || s.disc === 'BR') && (s.np || s.avgPower)) {
    const watts = Number(s.np || s.avgPower);
    const kJ = (watts * mins * 60) / 1000;
    const kcal = Math.max(0, Math.round(kJ - restPerMin * mins));
    return {
      label, kcal, confidence: 'measured',
      basis: `${Math.round(kJ)} kJ of work at ${watts} W, net of resting metabolism`,
    };
  }

  // 2. Running with distance. Net cost of running is close to 0.9 kcal per kg
  //    per km and barely depends on pace, which makes distance the strongest
  //    input the run has.
  if ((s.disc === 'RN') && s.distance && s.distance > 0.5) {
    const km = Number(s.distance);
    const kcal = Math.round(0.9 * p.weightKg * km);
    return {
      label, kcal, confidence: 'measured',
      basis: `${km.toFixed(1)} km at 0.9 kcal/kg/km`,
    };
  }

  // 3. Heart rate against a known threshold — a real intensity signal.
  if (s.avgHr && s.lthr) {
    const z = zoneFromHr(Number(s.avgHr), Number(s.lthr));
    const kcal = Math.round(netFromMet(MET[s.disc][z], p.weightKg) * mins);
    return {
      label, kcal, confidence: 'estimated',
      basis: `${mins} min at ${s.avgHr} bpm — ${z.toUpperCase()} against threshold ${s.lthr}`,
    };
  }

  // 4. Swim distance — pace matters more in the water than it does on land,
  //    but distance still beats a guess.
  if (s.disc === 'SW' && s.distance && s.distance > 0.2) {
    const metres = Number(s.distance) * 1000;
    // ~2.9 kcal per kg per km swum for a moderately efficient front-crawl swimmer.
    const kcal = Math.round(2.9 * p.weightKg * (metres / 1000));
    return {
      label, kcal, confidence: 'estimated',
      basis: `${Math.round(metres)} m swum at 2.9 kcal/kg/km`,
    };
  }

  // 5. Duration and an inferred zone. Honest, and flagged as rough.
  //
  // Intermittent sport gets a duty cycle. Three hours at a badminton club is
  // not three hours of badminton — it is games, waiting, talking and drinks,
  // and counting the whole booking at playing intensity would hand back an
  // extra three hundred calories a week for sitting on a bench.
  const z = inferZone(s);
  const duty = s.disc === 'OT' ? 0.75 : 1;
  const effective = mins * duty;
  const kcal = Math.round(netFromMet(MET[s.disc][z], p.weightKg) * effective);
  return {
    label, kcal, confidence: 'rough',
    basis: duty < 1
      ? `${mins} min booked, counted as ${Math.round(effective)} min of actual play at ${MET[s.disc][z]} METs`
      : `${mins} min estimated at ${z.toUpperCase()} (${MET[s.disc][z]} METs) — no power, pace or heart rate`,
  };
}

/* ------------------------------------------------------------- the day total */

export type DayEnergy = {
  rmr: number;
  rmrMethod: string;
  neat: number;          // RMR × (PAL − 1): the cost of living, excluding training
  baseline: number;      // RMR × PAL
  exercise: number;      // Σ net session cost
  total: number;
  parts: EnergyPart[];
  confidence: Confidence;
  /** Set when something looks like it has been counted twice. */
  warnings: string[];
};

export function dayEnergy(sessions: SessionInput[], p: Profile, warnings: string[] = []): DayEnergy {
  const { kcal: rmr, method } = restingMetabolicRate(p);
  const pal = Number.isFinite(p.neatPal) && p.neatPal > 1 ? p.neatPal : 1.40;
  const baseline = Math.round(rmr * pal);
  const parts = sessions.map((s) => sessionEnergy(s, p, rmr));
  const exercise = parts.reduce((a, x) => a + x.kcal, 0);

  // Confidence of the day is the weakest confidence that carries real weight.
  const heavy = parts.filter((x) => x.kcal >= exercise * 0.25);
  const rank: Record<Confidence, number> = { measured: 0, estimated: 1, rough: 2 };
  const confidence = heavy.length
    ? (heavy.reduce((worst, x) => (rank[x.confidence] > rank[worst] ? x.confidence : worst), 'measured' as Confidence))
    : 'measured';

  return {
    rmr, rmrMethod: method,
    neat: baseline - rmr,
    baseline,
    exercise,
    total: baseline + exercise,
    parts,
    confidence,
    warnings,
  };
}

/** Energy availability, kcal per kg of fat-free mass. The under-fuelling rail. */
export function energyAvailability(intakeKcal: number, exerciseKcal: number, p: Profile): number {
  const ffm = fatFreeMass(p);
  return ffm > 0 ? (intakeKcal - exerciseKcal) / ffm : 0;
}

/**
 * Energy availability thresholds, in kcal per kg of fat-free mass.
 *
 * Note what this number actually is in this model: intake minus training, over
 * fat-free mass — which on a day where intake matches expenditure comes out at
 * roughly RMR × PAL / FFM, and therefore sits near 42 for this athlete whatever
 * the training. That is why the advisory threshold is 38 rather than 45: above
 * 38 the number is telling you the model is behaving, and only a real calorie
 * restriction — a large standing adjustment, or a day of under-eating — pushes
 * it down far enough to mean anything.
 */
export const EA_FLOOR = 30;       // clinically low; the engine will not go here
export const EA_ADVISORY = 38;    // worth a note
export const EA_TARGET = 45;      // the textbook optimum
