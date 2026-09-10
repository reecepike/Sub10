import type { Readiness } from './db';

/**
 * The readiness engine.
 *
 * Scores deviation from the athlete's OWN 14-day rolling baseline, not from
 * absolute values, and weights trend above any single day. A traffic light
 * built on absolutes would be easy and almost useless.
 */

export type Band = 'green' | 'amber' | 'red';

export type Verdict = {
  score: number;
  band: Band;
  reasons: string[];      // what actually moved the score
  override: string | null; // a hard stop that ignores the score entirely
  consecutiveAmber: number;
  consecutiveRed: number;
};

const WEIGHTS = {
  hrv: 25,
  rhr: 20,
  sleep: 20,
  fatigue: 20,
  stress: 10,
  weight: 5,
} as const;

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function series(history: Readiness[], pick: (r: Readiness) => number | null): number[] {
  return history
    .map(pick)
    .filter((v): v is number => v !== null && v !== undefined && Number.isFinite(Number(v)))
    .map(Number);
}

/**
 * @param today   today's check-in
 * @param history previous entries, newest first, NOT including today
 */
export function assess(today: Readiness, history: Readiness[]): Verdict {
  const base = history.slice(0, 14);
  const reasons: string[] = [];
  let penalty = 0;
  let availableWeight = 0;

  const use = (w: number) => { availableWeight += w; };

  // --- HRV: deviation in standard deviations
  const hrvs = series(base, (r) => r.hrv);
  if (today.hrv != null && hrvs.length >= 5) {
    use(WEIGHTS.hrv);
    const m = mean(hrvs), s = sd(hrvs) || 1;
    const z = (Number(today.hrv) - m) / s;
    if (z <= -2) { penalty += WEIGHTS.hrv; reasons.push(`HRV ${today.hrv} is more than 2 SD below your baseline of ${Math.round(m)}`); }
    else if (z <= -1) { penalty += WEIGHTS.hrv * 0.5; reasons.push(`HRV ${today.hrv} is below your baseline of ${Math.round(m)}`); }
  }

  // --- Resting HR
  const rhrs = series(base, (r) => r.rhr);
  if (today.rhr != null && rhrs.length >= 5) {
    use(WEIGHTS.rhr);
    const m = mean(rhrs);
    const d = Number(today.rhr) - m;
    if (d >= 5) { penalty += WEIGHTS.rhr; reasons.push(`Resting HR is ${d.toFixed(0)} bpm above your baseline of ${Math.round(m)}`); }
    else if (d >= 3) { penalty += WEIGHTS.rhr * 0.5; reasons.push(`Resting HR is drifting up (+${d.toFixed(0)} bpm)`); }
  }

  // --- Sleep debt over the trailing three nights, against 8 h
  const nights = [today.sleep_h, ...base.slice(0, 2).map((r) => r.sleep_h)]
    .filter((v): v is number => v != null)
    .map(Number);
  if (nights.length) {
    use(WEIGHTS.sleep);
    const debt = nights.reduce((acc, h) => acc + Math.max(0, 8 - h), 0);
    if (debt >= 3) { penalty += WEIGHTS.sleep; reasons.push(`${debt.toFixed(1)} h of sleep debt over the last ${nights.length} night${nights.length > 1 ? 's' : ''}`); }
    else if (debt >= 1.5) { penalty += WEIGHTS.sleep * 0.5; reasons.push(`${debt.toFixed(1)} h of sleep debt building`); }
  }

  // --- Fatigue + soreness against personal average
  const fat = series(base, (r) => (r.fatigue ?? 0) + (r.soreness ?? 0));
  if (today.fatigue != null && today.soreness != null) {
    use(WEIGHTS.fatigue);
    const now = today.fatigue + today.soreness;
    const m = fat.length >= 5 ? mean(fat) : 4;
    if (now >= m + 3) { penalty += WEIGHTS.fatigue; reasons.push('Fatigue and soreness are well above your normal'); }
    else if (now >= m + 1.5) { penalty += WEIGHTS.fatigue * 0.5; reasons.push('Fatigue and soreness are above your normal'); }
  }

  // --- Stress + motivation. Low motivation alone is not a red flag.
  if (today.stress != null && today.motivation != null) {
    use(WEIGHTS.stress);
    const strain = today.stress + (6 - today.motivation);
    if (strain >= 8) { penalty += WEIGHTS.stress; reasons.push('High stress with low motivation'); }
    else if (strain >= 6) { penalty += WEIGHTS.stress * 0.5; }
  }

  // --- Bodyweight: a sharp drop is usually fuelling or illness
  const ws = series(base.slice(0, 7), (r) => r.weight_kg);
  if (today.weight_kg != null && ws.length >= 4) {
    use(WEIGHTS.weight);
    const m = mean(ws);
    if ((m - Number(today.weight_kg)) / m > 0.015) {
      penalty += WEIGHTS.weight;
      reasons.push('Bodyweight has dropped more than 1.5% in a week — check fuelling');
    }
  }

  // Redistribute the weight of anything missing, so a day without HRV still scores.
  const total = availableWeight || 1;
  const score = Math.round(Math.max(0, Math.min(100, 100 - (penalty / total) * 100)));

  let band: Band = score >= 80 ? 'green' : score >= 60 ? 'amber' : 'red';

  // --- trend rules: three ambers outrank one green
  let consecutiveAmber = 0;
  let consecutiveRed = 0;
  for (const r of history) {
    if (r.band === 'amber') consecutiveAmber++;
    else break;
  }
  for (const r of history) {
    if (r.band === 'red') consecutiveRed++;
    else break;
  }
  if (band === 'amber' && consecutiveAmber >= 2) {
    band = 'red';
    reasons.push('Third amber day in a row — treating this as red. A slow drift is more dangerous than one bad number.');
  }

  // --- hard overrides, which ignore the score entirely
  let override: string | null = null;
  if (today.illness) {
    override = 'Illness reported. If there is any systemic symptom — fever, chest involvement, body aches, swollen glands — stop training completely and do not attempt to salvage the week. Above-the-neck only: easy Z1–Z2 at reduced volume, and no quality work until symptom-free for 24 hours.';
  } else if (today.pain && today.pain.trim()) {
    override = 'Pain reported. If it changes how you move — gait, stroke or pedal action — that discipline stops today. Three consecutive days in the same place means stop and get it assessed, not wait and see.';
  } else if (today.sleep_h != null && Number(today.sleep_h) < 5) {
    override = 'Under five hours of sleep. Any key session moves; it is not attempted today.';
  } else {
    const recentRhr = series(history.slice(0, 2), (r) => r.rhr);
    const baseRhr = series(base.slice(2), (r) => r.rhr);
    if (today.rhr != null && recentRhr.length >= 1 && baseRhr.length >= 5) {
      const m = mean(baseRhr);
      if (Number(today.rhr) - m >= 7 && recentRhr[0] - m >= 7) {
        override = 'Resting HR has been more than 7 bpm above baseline for two mornings. Full rest day, regardless of how you feel.';
      }
    }
  }

  if (!reasons.length) reasons.push('Everything is sitting at or above your normal.');

  return { score, band, reasons, override, consecutiveAmber, consecutiveRed };
}
