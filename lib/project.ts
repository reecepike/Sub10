/**
 * The sub-10 projection model.
 *
 * Calibrated so that the September 2026 baseline (CSS 2:20, FTP 210, 68 kg,
 * 5 km 23:00, no aero bars, transitions unrehearsed) projects 12:53, and the
 * target configuration (CSS 1:39, FTP 300, aero bars, rehearsed) lands on
 * 9:55:00. Those two anchors are what make every number on the site agree
 * with the coaching document.
 */

const RHO = 1.225;
const G = 9.81;
const CRR = 0.005;
const DRIVETRAIN = 0.97;
const HILL_PENALTY = 1.10;   // IRONMAN Leeds: 2,419 m over 180 km
const VI = 1.06;             // variability index on a lapped, hilly course
const BIKE_KG = 10;          // bike + kit
const BIKE_M = 180_000;

/** Target splits, in seconds. Sums to exactly 9:55:00. */
export const TARGET = {
  swim: 3900,   // 1:05:00
  t1: 330,      // 5:30, includes the 300 m run from the swim exit
  bike: 19500,  // 5:25:00
  t2: 210,      // 3:30
  run: 11760,   // 3:16:00
} as const;

export const TARGET_TOTAL =
  TARGET.swim + TARGET.t1 + TARGET.bike + TARGET.t2 + TARGET.run; // 35700

export const SUB10 = 36000;

export type Capability = {
  cssSec: number;      // seconds per 100 m
  ftp: number;         // watts
  weightKg: number;
  fiveKSec: number;    // seconds
  aeroBars: boolean;
  transitionsRehearsed: boolean;
};

export type Projection = {
  swim: number;
  bike: number;
  run: number;
  trans: number;
  total: number;
  gapSec: number;              // positive = still to find
  ftpPerKg: number;
  requiredFtp: number;
  limiter: LimiterRow[];
};

export type LimiterRow = {
  name: 'Bike' | 'Run' | 'Swim' | 'Transitions';
  gapSec: number;
  elasticity: number;
  weighted: number;
};

/**
 * Sustainable intensity factor rises with training state. An untrained
 * cyclist cannot hold 0.72 of threshold for five and a half hours, and a
 * model that assumes they can flatters a beginner by nearly an hour.
 */
function intensityFactor(ftp: number): number {
  const progress = Math.max(0, Math.min(1, (ftp - 180) / 120));
  return 0.578 + 0.142 * progress;
}

export function bikeSeconds(ftp: number, weightKg: number, aeroBars: boolean): number {
  const cda = aeroBars ? 0.30 : 0.33;
  const mass = weightKg + BIKE_KG;
  const avgPower = (ftp * intensityFactor(ftp)) / VI;

  // Solve for the time that requires exactly avgPower.
  let lo = 2.5, hi = 14;
  for (let i = 0; i < 70; i++) {
    const t = (lo + hi) / 2;
    const v = BIKE_M / (t * 3600);
    const p = ((0.5 * RHO * cda * v ** 3 + CRR * mass * G * v) / DRIVETRAIN) * HILL_PENALTY;
    if (p > avgPower) lo = t; else hi = t;
  }
  return ((lo + hi) / 2) * 3600;
}

export function swimSeconds(cssSec: number): number {
  // 38 lengths of 100 m. CSS + 4 s/100 m covers open-water and fatigue, net of the wetsuit.
  return 38 * (cssSec + 4);
}

export function runSeconds(fiveKSec: number, bikeSec: number): number {
  const standaloneMarathon = fiveKSec * Math.pow(42.195 / 5, 1.06);
  // The Ironman penalty grows with how long the bike took, because that is what happens.
  const penalty = 1.135 + 0.03 * (bikeSec / 3600 - 5.4167);
  return standaloneMarathon * Math.max(1.09, Math.min(1.30, penalty));
}

/** What FTP does a 5:25 bike need at this weight and position? */
export function requiredFtp(weightKg: number, aeroBars: boolean): number {
  let lo = 150, hi = 500;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (bikeSeconds(mid, weightKg, aeroBars) > TARGET.bike) lo = mid; else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

const ELASTICITY = { Bike: 1.4, Swim: 1.1, Run: 0.8, Transitions: 0.3 } as const;

export function project(c: Capability): Projection {
  const bike = bikeSeconds(c.ftp, c.weightKg, c.aeroBars);
  const swim = swimSeconds(c.cssSec);
  const run = runSeconds(c.fiveKSec, bike);
  const trans = c.transitionsRehearsed ? TARGET.t1 + TARGET.t2 : TARGET.t1 + TARGET.t2 + 180;
  const total = swim + bike + run + trans;

  const rows: LimiterRow[] = [
    { name: 'Bike', gapSec: bike - TARGET.bike, elasticity: ELASTICITY.Bike, weighted: 0 },
    { name: 'Run', gapSec: run - TARGET.run, elasticity: ELASTICITY.Run, weighted: 0 },
    { name: 'Swim', gapSec: swim - TARGET.swim, elasticity: ELASTICITY.Swim, weighted: 0 },
    {
      name: 'Transitions',
      gapSec: trans - (TARGET.t1 + TARGET.t2),
      elasticity: ELASTICITY.Transitions,
      weighted: 0,
    },
  ];
  // Absolute minutes, weighted by elasticity — NOT proportional gap. A
  // proportional measure ranks the swim first, because 26 minutes is a large
  // share of a 65-minute leg; but 26 minutes is 26 minutes wherever it sits.
  for (const r of rows) r.weighted = Math.max(0, r.gapSec / 60) * r.elasticity;
  rows.sort((a, b) => b.weighted - a.weighted);

  return {
    swim, bike, run, trans, total,
    gapSec: total - TARGET_TOTAL,
    ftpPerKg: c.ftp / c.weightKg,
    requiredFtp: requiredFtp(c.weightKg, c.aeroBars),
    limiter: rows,
  };
}

/** The capability required for each leg, for display alongside the current one. */
export const REQUIRED = {
  cssSec: 99,        // 1:39 / 100 m
  fiveKSec: 1080,    // 18:00
  ftpPerKg: 4.41,
  marathonEquiv: 10358, // ~2:53 standalone
} as const;

/* ------------------------------------------------------------ formatting */

export function hms(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`;
}

export function ms(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function parseClock(v: string, fallback: number): number {
  const t = String(v ?? '').trim();
  if (!t) return fallback;
  if (t.includes(':')) {
    const parts = t.split(':').map(Number);
    if (parts.some(Number.isNaN)) return fallback;
    return parts.length === 3
      ? parts[0] * 3600 + parts[1] * 60 + parts[2]
      : parts[0] * 60 + parts[1];
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : fallback;
}
