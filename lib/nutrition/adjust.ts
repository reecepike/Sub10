/**
 * The weekly calorie adjustment.
 *
 * The rule that matters most here is restraint. Bodyweight moves a kilo in a
 * day for reasons that have nothing to do with energy balance — glycogen,
 * sodium, hydration, what is still in the gut, a hard session the day before.
 * A system that reacts to a single morning will chase noise forever and teach
 * the athlete to distrust it.
 *
 * So: the seven-day average is the unit of measurement, the three-week slope is
 * the tie-breaker, and changes are small, capped, and explained.
 */

import type { Phase } from './targets';

export type WeightPoint = { day: string; weight: number };

export type Feedback = {
  energy: string | null;       // low | normal | high
  hunger: string | null;       // low | normal | high
  sessionFeel: string | null;  // poor | normal | excellent
};

export type Adjustment = {
  deltaKcal: number;
  newAdjust: number;
  avg7: number | null;
  prevAvg7: number | null;
  pctPerWeek: number | null;
  slope21: number | null;      // kg per week over three weeks
  headline: string;
  reason: string;
  confident: boolean;
};

const MAX_STEP = 250;
const MAX_TOTAL = 700;

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Least-squares slope in kg per week. */
function slopePerWeek(points: WeightPoint[]): number | null {
  if (points.length < 6) return null;
  const t0 = new Date(points[0].day + 'T12:00:00Z').getTime();
  const xs = points.map((p) => (new Date(p.day + 'T12:00:00Z').getTime() - t0) / 86_400_000);
  const ys = points.map((p) => p.weight);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0);
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  return den === 0 ? null : (num / den) * 7;
}

/**
 * @param weights  every weigh-in available, oldest first
 * @param today    ISO day the review is being run for
 */
export function weeklyAdjustment(
  weights: WeightPoint[],
  today: string,
  currentAdjust: number,
  phase: Phase,
  feedback: Feedback,
): Adjustment {
  const cut = (days: number) => {
    const t = new Date(today + 'T12:00:00Z').getTime() - days * 86_400_000;
    return weights.filter((w) => new Date(w.day + 'T12:00:00Z').getTime() > t);
  };

  const last7 = cut(7);
  const prev7 = cut(14).filter((w) => !last7.includes(w));
  const last21 = cut(21);

  const avg7 = mean(last7.map((w) => w.weight));
  const prevAvg7 = mean(prev7.map((w) => w.weight));
  const slope21 = slopePerWeek(last21);

  const none = (headline: string, reason: string): Adjustment => ({
    deltaKcal: 0, newAdjust: currentAdjust, avg7, prevAvg7,
    pctPerWeek: avg7 && prevAvg7 ? ((avg7 - prevAvg7) / prevAvg7) * 100 : null,
    slope21, headline, reason, confident: false,
  });

  if (last7.length < 3) {
    return none(
      'Not enough weigh-ins',
      'Three mornings in the last week is the minimum before the trend means anything. Weigh yourself as you get up, after the loo, before anything else — it takes fifteen seconds and it is the input this whole engine runs on.',
    );
  }
  if (!avg7 || !prevAvg7 || prev7.length < 3) {
    return none(
      'Building the baseline',
      'The seven-day average exists but there is nothing to compare it to yet. One more week of weigh-ins and the calorie target starts adjusting itself.',
    );
  }

  const pctPerWeek = ((avg7 - prevAvg7) / prevAvg7) * 100;
  const kgPerWeek = avg7 - prevAvg7;

  // Extreme readings are almost always data or illness, not energy balance.
  if (Math.abs(pctPerWeek) > 2.5) {
    return none(
      'That change is too big to be food',
      `The seven-day average moved ${kgPerWeek > 0 ? '+' : ''}${kgPerWeek.toFixed(1)} kg in a week. A genuine energy-balance change of that size is not possible on this training load, so this is illness, dehydration, a scale problem, or a run of missed weigh-ins. Nothing has been changed. Check the numbers, and if you have been unwell, say so in the check-in.`,
    );
  }

  const lowEnergy = feedback.energy === 'low' || feedback.sessionFeel === 'poor';
  const highHunger = feedback.hunger === 'high';
  const lowHunger = feedback.hunger === 'low';

  let delta = 0;
  let headline = '';
  let reason = '';

  if (pctPerWeek <= -0.6) {
    delta = 250;
    headline = 'Losing weight too fast — eating more';
    reason = `Down ${Math.abs(kgPerWeek).toFixed(2)} kg a week on the seven-day average. On this training load that is under-fuelling, not leanness, and it costs the bike first. Calories up ${delta}.`;
  } else if (pctPerWeek <= -0.3) {
    delta = lowEnergy ? 250 : 150;
    headline = 'Drifting down — eating a bit more';
    reason = `Down ${Math.abs(kgPerWeek).toFixed(2)} kg a week.${lowEnergy ? ' Energy and session quality are down with it, which settles the question.' : ''} Calories up ${delta}.`;
  } else if (pctPerWeek < -0.1 && (lowEnergy || highHunger)) {
    delta = 150;
    headline = 'Small loss with the symptoms to match';
    reason = `Weight is easing down and you are ${lowEnergy ? 'flat' : 'hungry'}. That combination is worth 150 kcal before it becomes a pattern.`;
  } else if (pctPerWeek > 0.8) {
    delta = -250;
    headline = 'Gaining faster than is useful';
    reason = `Up ${kgPerWeek.toFixed(2)} kg a week. Some of that is glycogen and it is welcome, but not at this rate for this long — you have to carry every kilo up 2,400 m of climbing. Calories down ${Math.abs(delta)}.`;
  } else if (pctPerWeek > 0.4) {
    delta = -150;
    headline = 'Gaining a little quickly';
    reason = `Up ${kgPerWeek.toFixed(2)} kg a week. Trimming 150 kcal keeps the direction without the passenger weight.`;
  } else {
    if (lowEnergy && lowHunger) {
      headline = 'Stable, but you are flat';
      reason = 'Weight is holding and the trend does not ask for a change — but low energy with low appetite is usually accumulated fatigue rather than food. Look at sleep and at the last three weeks of load before adding calories.';
    } else if (lowEnergy) {
      delta = 100;
      headline = 'Stable weight, low energy — a small nudge up';
      reason = 'The trend says nothing is wrong, but you are flat and hungry enough for it to be worth 100 kcal. Small, reversible, and we look again next week.';
    } else {
      headline = 'Holding — no change';
      reason = `Seven-day average ${avg7.toFixed(1)} kg, ${kgPerWeek >= 0 ? '+' : ''}${kgPerWeek.toFixed(2)} kg on the week. That is noise, not a signal. Nothing changes.`;
    }
  }

  // The three-week slope is the tie-breaker. If it disagrees with the week,
  // the week is probably noise, so halve the response.
  let confident = true;
  if (delta !== 0 && slope21 != null && Math.sign(slope21) !== Math.sign(kgPerWeek) && Math.abs(slope21) > 0.05) {
    delta = Math.round(delta / 2 / 50) * 50;
    confident = false;
    reason += ` The three-week trend is going the other way (${slope21 > 0 ? '+' : ''}${slope21.toFixed(2)} kg/week), so the change is halved to ${delta} until the two agree.`;
  }

  // Never cut in a taper or race week. Being a kilo heavy has never lost an
  // Ironman; being under-fuelled has lost plenty.
  if (delta < 0 && (phase === 'taper' || phase === 'race')) {
    reason = `Weight is rising, but this is ${phase === 'race' ? 'race week' : 'the taper'} and calories do not come down here. Volume has dropped, glycogen is filling, and the scale is supposed to move up. Nothing changed.`;
    headline = 'Taper — no reduction';
    delta = 0;
  }

  delta = Math.max(-MAX_STEP, Math.min(MAX_STEP, delta));
  let newAdjust = currentAdjust + delta;
  if (Math.abs(newAdjust) > MAX_TOTAL) {
    newAdjust = Math.sign(newAdjust) * MAX_TOTAL;
    reason += ` Standing adjustment capped at ${MAX_TOTAL} kcal — beyond that the problem is the model of your training, not the size of your dinner, and it is worth re-checking your weight, height and session data in Settings.`;
  }

  return {
    deltaKcal: newAdjust - currentAdjust,
    newAdjust,
    avg7,
    prevAvg7,
    pctPerWeek,
    slope21,
    headline,
    reason,
    confident,
  };
}
