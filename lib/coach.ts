import type { Settings, SessionRow, Readiness } from './db';
import { project, hms, TARGET_TOTAL, REQUIRED, ms } from './project';
import { blockFor, weekFor, GATES, DELOADS } from './plan';

/**
 * The weekly coaching update. Every re-plan says what changed and why —
 * an unexplained change is an instruction; an explained one is coaching.
 */

export type CoachUpdate = {
  week: number;
  blockName: string;
  whatHappened: string[];
  whatItMeans: string[];
  whatChanges: string[];
  trajectory: 'ahead' | 'on track' | 'behind' | 'unknown';
  primaryLimiter: string;
  projectedTotal: string;
  watch: string | null;
};

export function capabilityFrom(s: Settings) {
  return {
    cssSec: s.css_sec ?? 140,
    ftp: s.ftp ?? 210,
    weightKg: Number(s.weight_kg) || 68,
    fiveKSec: s.five_k_sec ?? 1380,
    aeroBars: s.aero_bars,
    transitionsRehearsed: s.transitions_rehearsed,
  };
}

/** Minutes required to close per week, to be on the sub-10 line. */
export function requiredRate(s: Settings, today: string): number {
  const week = Math.max(1, weekFor(s.start_date, today));
  const weeksLeft = Math.max(1, 45 - week);
  const p = project(capabilityFrom(s));
  return p.gapSec / 60 / weeksLeft;
}

export function buildUpdate(
  s: Settings,
  today: string,
  weekSessions: SessionRow[],
  weekReadiness: Readiness[],
  plannedMinutes: number,
): CoachUpdate {
  const week = Math.max(1, weekFor(s.start_date, today));
  const block = blockFor(week);
  const p = project(capabilityFrom(s));

  const doneMinutes = weekSessions.reduce((a, r) => a + (r.duration_min ?? 0), 0);
  const completion = plannedMinutes ? Math.round((doneMinutes / plannedMinutes) * 100) : 0;
  const greens = weekReadiness.filter((r) => r.band === 'green').length;
  const ambers = weekReadiness.filter((r) => r.band === 'amber').length;
  const reds = weekReadiness.filter((r) => r.band === 'red').length;

  const whatHappened = [
    `Planned ${(plannedMinutes / 60).toFixed(1)} h of structured training, completed ${(doneMinutes / 60).toFixed(1)} h — ${completion}%.`,
    weekReadiness.length
      ? `Readiness: ${greens} green, ${ambers} amber, ${reds} red across ${weekReadiness.length} check-in${weekReadiness.length === 1 ? '' : 's'}.`
      : 'No readiness check-ins logged this week — the engine is planning blind.',
  ];

  const whatItMeans: string[] = [];
  const whatChanges: string[] = [];
  let watch: string | null = null;

  if (completion >= 95 && reds === 0 && greens >= weekReadiness.length * 0.8) {
    whatItMeans.push('Full completion with the readiness data staying green. That is the pattern that earns a faster progression.');
    whatChanges.push('Volume steps up. If the next test also improves, the block can be brought forward by up to a week.');
  } else if (completion < 70) {
    whatItMeans.push('Under 70% completion. Whatever the reason, the week that was planned is not the week that happened.');
    whatChanges.push('Next week does not progress — it repeats at about 90%. Building on a foundation that was not laid is how injuries happen.');
  } else if (ambers + reds >= weekReadiness.length * 0.4 && weekReadiness.length >= 4) {
    whatItMeans.push('Readiness was amber or red on 40% or more of days. That is a fatigue signal, not a bad night.');
    whatChanges.push('Volume comes down to about 75% and the intensity stays. Fitness is lost far more slowly from reduced volume than from reduced intensity.');
  } else {
    whatItMeans.push('A normal week — nothing in the data is asking for a structural change.');
    whatChanges.push('Progression continues as planned.');
  }

  // Discipline-specific reads
  const byDisc = (d: string) => weekSessions.filter((r) => r.discipline === d);
  if (byDisc('SW').length < 2 && block.n >= 1) {
    whatItMeans.push('Swim frequency dropped below two sessions. Feel goes faster than fitness in the water, and rebuilding it costs more than was saved.');
    whatChanges.push('Swim frequency restored to at least two — that is a floor, not a target.');
  }
  const niggles = weekSessions.filter((r) => r.niggle && r.niggle.trim()).map((r) => r.niggle!.trim());
  if (niggles.length >= 3) {
    watch = `You have logged a niggle on ${niggles.length} sessions this week. Three consecutive running days with the same complaint stops the running — cross-train it on the bike, which costs this project almost nothing.`;
  } else if (ambers >= 2 && !watch) {
    watch = 'Two amber days this week. If the same pattern lands on the same weekdays again, look at what precedes them — that is usually where the answer is.';
  }

  if (GATES[week]) {
    whatChanges.push(`${GATES[week].title} falls this week. ${GATES[week].test}`);
  }
  if (DELOADS.has(week + 1)) {
    whatChanges.push('Next week is a recovery week at around 62%. Take it properly — it is where the adaptation actually lands.');
  }

  const rate = requiredRate(s, today);
  const trajectory: CoachUpdate['trajectory'] =
    !s.ftp || !s.css_sec || !s.five_k_sec ? 'unknown'
      : rate <= 3.5 ? 'ahead'
      : rate <= 4.5 ? 'on track'
      : 'behind';

  return {
    week,
    blockName: `Block ${block.n} — ${block.name}`,
    whatHappened,
    whatItMeans,
    whatChanges,
    trajectory,
    primaryLimiter: p.limiter[0]?.weighted > 0 ? p.limiter[0].name : 'None',
    projectedTotal: hms(p.total),
    watch,
  };
}

/** A one-line status for the top of the Today page. */
export function statusLine(s: Settings): string {
  const p = project(capabilityFrom(s));
  if (!s.ftp || !s.css_sec || !s.five_k_sec) {
    return 'Baseline tests not complete yet — finish Block 0 and the projection becomes real.';
  }
  if (p.gapSec <= 0) return 'The measured numbers now support sub-10. Confirm it in a full race-pace brick before believing it.';
  const mins = Math.round(p.gapSec / 60);
  return `${hms(p.total)} projected — ${mins} minutes still to find, and the bike holds ${Math.round((p.limiter[0].gapSec / p.gapSec) * 100)}% of it.`;
}

export { hms, ms, project, TARGET_TOTAL, REQUIRED };
