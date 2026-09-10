import type { PlannedSession } from './plan';
import type { Verdict } from './readiness';

/**
 * Session-level adaptation: what happens on the day, when the plan and the
 * athlete disagree. The readiness always wins — a session completed at the
 * wrong time in the wrong state does not bank fitness, it banks fatigue and
 * calls it progress.
 */

export type AdaptedSession = PlannedSession & {
  changed: boolean;
  because?: string;
  originalMinutes?: number;
};

export type Adaptation = {
  headline: string;
  rationale: string;
  sessions: AdaptedSession[];
  severity: 'normal' | 'modified' | 'stop';
};

export function adapt(planned: PlannedSession[], v: Verdict | null): Adaptation {
  // No check-in yet — we do not guess.
  if (!v) {
    return {
      headline: 'Check in first',
      rationale:
        'Sixty seconds of readiness data before you decide anything. Without it the plan is just a calendar, and a calendar cannot tell whether today is the day to do this.',
      sessions: planned.map((s) => ({ ...s, changed: false })),
      severity: 'normal',
    };
  }

  // Hard override — the score is irrelevant.
  if (v.override) {
    return {
      headline: 'Do not train as planned',
      rationale: v.override,
      severity: 'stop',
      sessions: planned.map((s) => ({
        ...s,
        changed: true,
        because: 'Held back by a readiness override.',
        originalMinutes: s.minutes,
        minutes: 0,
        detail: 'Cancelled today. Re-check tomorrow morning.',
      })),
    };
  }

  if (v.band === 'red') {
    const twoReds = v.consecutiveRed >= 1;
    return {
      headline: twoReds ? 'Red again — take the week down' : 'Red. Recover today.',
      rationale: twoReds
        ? 'Two red days in a row. This is no longer a bad night, it is a pattern — take an unplanned recovery week and work out why. Start with fuelling and sleep, not with training load.'
        : 'Your body is not in a state where today\'s stimulus produces adaptation. Training through this buys fatigue at full price and fitness at none.',
      severity: 'stop',
      sessions: planned.map((s) => {
        if (s.disc === 'OT') return { ...s, changed: false };
        const keep = s.disc === 'SW' && !s.keyIntensity;
        return {
          ...s,
          changed: true,
          originalMinutes: s.minutes,
          minutes: keep ? Math.round(s.minutes * 0.5) : 0,
          because: keep
            ? 'Kept as easy technique only — the water is the one place you can move without cost.'
            : 'Cancelled. Z1 or nothing today.',
          detail: keep ? 'Easy technique. No clock, no sets, no effort.' : 'Rest.',
        };
      }),
    };
  }

  if (v.band === 'amber') {
    const second = v.consecutiveAmber >= 1;
    return {
      headline: second ? 'Second amber — swap the quality out' : 'Amber. Trim it back.',
      rationale: second
        ? 'Two ambers running. Replace the quality session with aerobic work of the same duration — you keep the hours, you lose the cost, and you stop the drift before it becomes a red.'
        : 'Cut the volume by about a fifth and keep a lid on the intensity. If today carries a key intensity session and there is no green day to move it to within 72 hours, shorten it but keep the intensity — the stimulus matters more than the tonnage.',
      severity: 'modified',
      sessions: planned.map((s) => {
        if (s.disc === 'OT' || s.disc === 'ST') return { ...s, changed: false };
        if (second && s.keyIntensity) {
          return {
            ...s,
            changed: true,
            originalMinutes: s.minutes,
            because: 'Second amber day — quality replaced with aerobic work of the same length.',
            title: s.title + ' → aerobic',
            detail: 'Steady Z2 for the same duration. No intervals today.',
          };
        }
        const trimmed = Math.max(15, Math.round((s.minutes * 0.8) / 5) * 5);
        return {
          ...s,
          changed: trimmed !== s.minutes,
          originalMinutes: s.minutes,
          minutes: trimmed,
          because: 'Volume trimmed ~20% on an amber day.',
        };
      }),
    };
  }

  // Green
  return {
    headline: 'Green. Train as planned.',
    rationale:
      v.reasons.length === 1 && v.reasons[0].startsWith('Everything')
        ? 'Nothing in the data is asking for a change. Go and do the session that is written.'
        : 'Good to go. Nothing here is enough to change the prescription.',
    severity: 'normal',
    sessions: planned.map((s) => ({ ...s, changed: false })),
  };
}

/**
 * Missed-session logic. The brief was specific: do not cram a missed session
 * into the next available day. Ask what stimulus was lost and whether it is
 * worth more than the cost of recovering it.
 */
export function missedGuidance(missedKey: boolean, missedCount: number, weekShare: number): string {
  if (weekShare > 0.3) {
    return 'More than 30% of this week is gone. Do not build on a foundation that was not laid — the next week repeats at about 90% rather than progressing.';
  }
  if (!missedKey) {
    return 'A supporting session. Its value was frequency, and frequency cannot be recovered retrospectively — let it go and carry on. That is very often the right answer and it is not a failure.';
  }
  if (missedCount >= 1) {
    return 'You have already recovered one session this week. Recovering a second means the week that caused the misses just got harder. Let this one go.';
  }
  return 'A key session. It can be recovered within 72 hours, but only by displacing something of lower value — never by adding it on top, and never next to another key intensity session.';
}
