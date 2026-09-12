/**
 * Daily targets.
 *
 * Carbohydrate is the variable that actually periodises. Protein moves a
 * little, fat is mostly what is left over, and calories follow the training.
 * The one number that never gets negotiated away is energy availability — the
 * amount left over after training has taken its share. Under-fuelling is the
 * failure mode that ends Ironman builds, and it does it slowly enough that the
 * athlete usually blames something else.
 */

import { blockFor, weekFor } from '../plan';
import type { Settings } from '../db';
import {
  DayEnergy, Profile, energyAvailability, fatFreeMass, EA_FLOOR, EA_ADVISORY,
} from './energy';
import { Resolution, countable, enduranceMinutes, countedMinutes } from './resolve';

export type Phase = 'base' | 'build' | 'long-endurance' | 'race-specific' | 'taper' | 'race' | 'recovery';

export const PHASE_INTENT: Record<Phase, string> = {
  base: 'Build the habit and the energy availability. Consistency beats cleverness for the next few months.',
  build: 'Fuelling capacity goes up with the intensity. This is where the gut starts learning to take carbohydrate while you work.',
  'long-endurance': 'Practise the real thing. Every long session is a rehearsal for race fuelling, not just a ride with food in it.',
  'race-specific': 'Nothing new. Every long session now uses exactly what race day will use, at race-day rates.',
  taper: 'Volume falls, carbohydrate availability does not. You are topping the tank, not cutting.',
  race: 'Execute the plan you have already rehearsed. Race day is not the day to find out anything.',
  recovery: 'Eat properly and let the repair happen. Appetite lies for about four days after an Ironman.',
};

export function phaseFor(s: Settings, day: string): Phase {
  const week = weekFor(s.start_date, day);
  if (day > s.race_date) return 'recovery';
  const daysToRace = Math.ceil(
    (new Date(s.race_date + 'T12:00:00Z').getTime() - new Date(day + 'T12:00:00Z').getTime()) / 86_400_000,
  );
  if (daysToRace <= 1) return 'race';
  if (week < 1) return 'base';
  const b = blockFor(Math.min(45, Math.max(1, week)));
  switch (b.n) {
    case 0:
    case 1:
    case 2: return 'base';
    case 3: return 'build';
    case 4: return 'long-endurance';
    case 5: return 'race-specific';
    case 6: return 'race-specific';
    default: return 'taper';
  }
}

/* --------------------------------------------------------- carbohydrate bands */

/**
 * Grams per kilogram per day, from the day's endurance load.
 *
 * These follow the sports-nutrition consensus bands — roughly 3–5 g/kg on light
 * days through to 8–12 g/kg on very long days — rather than a single number,
 * because a single number is wrong on almost every day of an Ironman build.
 */
function carbBand(enduranceHours: number): { gPerKg: number; label: string } {
  if (enduranceHours < 0.5) return { gPerKg: 3.5, label: 'Rest or very light' };
  if (enduranceHours < 1.0) return { gPerKg: 5.0, label: 'Light' };
  if (enduranceHours < 1.75) return { gPerKg: 6.0, label: 'Moderate' };
  if (enduranceHours < 2.5) return { gPerKg: 7.5, label: 'Endurance' };
  if (enduranceHours < 3.5) return { gPerKg: 9.0, label: 'Long' };
  if (enduranceHours < 5.0) return { gPerKg: 10.5, label: 'Very long' };
  return { gPerKg: 12.0, label: 'Extreme' };
}

export type Targets = {
  day: string;
  phase: Phase;
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
  fibre: number;
  fluidMl: number;
  sodiumMg: number;
  carbPerKg: number;
  proteinPerKg: number;
  band: string;
  energyAvailability: number;
  eaWarning: string | null;
  lowResidue: boolean;
  rationale: string[];
  /** Calories that came from the weekly weight-trend adjustment. */
  adjustKcal: number;
};

export type TargetInputs = {
  day: string;
  profile: Profile;
  energy: DayEnergy;
  resolution: Resolution;
  phase: Phase;
  /** Standing adjustment from the weekly review, in kcal. */
  adjustKcal: number;
  /** Tomorrow's longest endurance session in minutes — drives carb loading and fibre. */
  tomorrowLongestMin: number;
  /** Recent digestion trouble, from the check-in. */
  guttyLately: boolean;
};

export function dailyTargets(i: TargetInputs): Targets {
  const { profile: p, energy, resolution, phase } = i;
  const kg = p.weightKg;
  const rationale: string[] = [];

  const eH = enduranceMinutes(resolution) / 60;
  const allH = countedMinutes(resolution) / 60;
  const hasStrength = countable(resolution).some((s) => s.disc === 'ST');
  const hasIntensity = countable(resolution).some(
    (s) => s.keyIntensity || (s.rpe ?? 0) >= 8 || /threshold|interval|vo2|race pace/i.test(`${s.title ?? ''}`),
  );

  /* ---------------------------------------------------------------- calories */
  let kcal = energy.total + i.adjustKcal;
  rationale.push(
    `${energy.baseline} kcal to live on (${energy.rmr} resting via ${energy.rmrMethod}, × ${p.neatPal.toFixed(2)} for a normal day off the bike) plus ${energy.exercise} kcal of training.`,
  );
  if (i.adjustKcal) {
    rationale.push(
      `${i.adjustKcal > 0 ? '+' : ''}${i.adjustKcal} kcal standing adjustment from the weight trend.`,
    );
  }

  /* ---------------------------------------------------------------- protein */
  let proteinPerKg = 1.6;
  if (hasStrength) proteinPerKg += 0.2;
  if (i.adjustKcal < -100) proteinPerKg += 0.2;      // protects lean mass in a deficit
  if (phase === 'recovery') proteinPerKg += 0.2;
  proteinPerKg = Math.min(2.2, proteinPerKg);
  let protein = Math.round(proteinPerKg * kg);

  /* ------------------------------------------------------------ carbohydrate */
  const band = carbBand(eH);
  let carbPerKg = band.gPerKg;
  if (hasIntensity && eH >= 0.75) carbPerKg += 0.5;
  if (i.tomorrowLongestMin >= 180) {
    carbPerKg += 1.0;
    rationale.push('Carbohydrate is up a gram per kilo because tomorrow carries a session of three hours or more — you fill the tank the day before, not on the morning.');
  }
  if (phase === 'taper') {
    carbPerKg = Math.max(carbPerKg, 6.5);
    rationale.push('Taper: volume falls but carbohydrate does not. The point of the taper is to arrive full.');
  }
  if (phase === 'race') {
    carbPerKg = Math.max(carbPerKg, 9.0);
    rationale.push('Race loading: 9–10 g/kg for the 36 hours before the start, low fibre, nothing unfamiliar.');
  }
  let carb = Math.round(carbPerKg * kg);

  /* -------------------------------------------------------------------- fat */
  const fatFloor = Math.round(0.8 * kg);
  let fat = Math.round((kcal - protein * 4 - carb * 4) / 9);

  if (fat < fatFloor) {
    // Not enough room. Take it from carbohydrate rather than dropping fat below
    // the floor — essential fatty acids and hormone function are not negotiable.
    const deficitKcal = (fatFloor - fat) * 9;
    const carbCut = Math.round(deficitKcal / 4);
    carb = Math.max(Math.round(3 * kg), carb - carbCut);
    fat = fatFloor;
    rationale.push(
      `Carbohydrate trimmed to keep fat at its ${fatFloor} g floor. If that happens often the calorie target is too low for the training, not the macros too generous.`,
    );
  } else if (fat * 9 > kcal * 0.35) {
    const cap = Math.round((kcal * 0.35) / 9);
    const spare = (fat - cap) * 9;
    fat = cap;
    carb += Math.round(spare / 4);
    rationale.push('Fat capped at 35% of calories and the difference moved to carbohydrate — that is where the training benefit is.');
  }

  carbPerKg = carb / kg;
  proteinPerKg = protein / kg;

  /* ------------------------------------------------------------------ fibre */
  const lowResidue = phase === 'race' || i.tomorrowLongestMin >= 240 || i.guttyLately;
  let fibre = lowResidue ? 20 : 30;
  if (lowResidue) {
    rationale.push(
      phase === 'race'
        ? 'Fibre down to 20 g — low residue before a race so nothing is still in transit at the start.'
        : i.guttyLately
          ? 'Fibre down to 20 g for a few days while digestion settles.'
          : 'Fibre down to 20 g because tomorrow is a four-hour-plus day.',
    );
  }

  /* ------------------------------------------------------------------ fluid */
  const fluidMl = Math.round(35 * kg + allH * (hasIntensity ? 700 : 600));

  /* ----------------------------------------------------------------- sodium */
  const sodiumMg = Math.round(2000 + Math.max(0, allH - 1) * 500);

  /* ----------------------------------------------- the under-fuelling rail */
  let ea = energyAvailability(kcal, energy.exercise, p);
  let eaWarning: string | null = null;
  if (ea < EA_FLOOR) {
    const need = Math.ceil(EA_FLOOR * fatFreeMass(p) + energy.exercise);
    const add = need - kcal;
    kcal = need;
    carb += Math.round(add / 4);
    ea = energyAvailability(kcal, energy.exercise, p);
    eaWarning =
      `Calories were raised by ${add} kcal. Below this the day leaves under ${EA_FLOOR} kcal per kg of fat-free mass for everything that is not training, which is the level where hormones, bone and immunity start paying for the sport. This floor is not adjustable.`;
    rationale.push(eaWarning);
  } else if (ea < EA_ADVISORY) {
    eaWarning =
      `Energy availability is ${Math.round(ea)} kcal/kg of fat-free mass. Not dangerous, but it is the low end — if the next weigh-in trend is down as well, the calorie target goes up rather than the training coming down.`;
  }

  return {
    day: i.day,
    phase,
    kcal: Math.round(kcal / 10) * 10,     // practical accuracy, not fake precision
    protein,
    carb,
    fat,
    fibre,
    fluidMl,
    sodiumMg,
    carbPerKg: Math.round(carbPerKg * 10) / 10,
    proteinPerKg: Math.round(proteinPerKg * 10) / 10,
    band: `${band.label} day — ${eH.toFixed(1)} h endurance, ${allH.toFixed(1)} h total`,
    energyAvailability: Math.round(ea),
    eaWarning,
    lowResidue,
    rationale,
    adjustKcal: i.adjustKcal,
  };
}
