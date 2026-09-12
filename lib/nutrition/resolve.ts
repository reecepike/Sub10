/**
 * Planned versus actual — the double-counting guard.
 *
 * A day's training exists in up to three places: the generated plan, the
 * adapted plan (after the readiness engine has had its say), and whatever was
 * actually logged. Feeding all three into the calorie model is the single
 * easiest way to make this whole system wrong, and it fails silently: the
 * numbers still look plausible, they are just six hundred calories too high.
 *
 * So every consumer goes through `resolveDay`, which returns ONE list, with
 * each entry carrying where it came from. A logged session replaces the planned
 * one it corresponds to. It never adds to it.
 */

import type { AdaptedSession } from '../adapt';
import type { SessionRow } from '../db';
import type { Disc, SessionInput } from './energy';

export type Source = 'logged' | 'logged-matched' | 'planned' | 'extra' | 'missed';

export type ResolvedSession = SessionInput & {
  key: string;
  source: Source;
  slot: string;
  /** Counts toward the day's energy. Missed sessions do not. */
  counts: boolean;
  /** Minutes the plan asked for, when they differ from what happened. */
  plannedMinutes?: number;
};

export type OtherRow = {
  id: number;
  day: string;
  activity: string;
  duration_min: number;
  rpe: number | null;
};

export type Resolution = {
  sessions: ResolvedSession[];
  warnings: string[];
  /** True when the day has been logged at all — changes how confident we are. */
  hasActual: boolean;
  plannedMinutes: number;
  actualMinutes: number;
};

function discOf(v: string): Disc {
  return (['SW', 'BK', 'RN', 'ST', 'OT', 'BR'].includes(v) ? v : 'OT') as Disc;
}

/**
 * @param planned  the adapted plan for the day (readiness already applied)
 * @param logged   sessions the athlete actually recorded
 * @param other    badminton and similar, recorded through the other-activity form
 * @param isPast   true when the day is finished, so an unlogged session is missed
 *                 rather than still to come
 */
export function resolveDay(
  planned: AdaptedSession[],
  logged: SessionRow[],
  other: OtherRow[],
  isPast: boolean,
  lthr: { run: number | null; bike: number | null } = { run: null, bike: null },
): Resolution {
  const warnings: string[] = [];
  const out: ResolvedSession[] = [];

  const unmatched = planned.filter((p) => p.minutes > 0);
  const claimed = new Set<string>();

  const lthrFor = (d: Disc) => (d === 'RN' ? lthr.run : d === 'BK' || d === 'BR' ? lthr.bike : null);

  /**
   * A logged session inherits everything the plan already knew about it — that
   * it was the key intensity session, what the prescription said — and only
   * overrides what was actually measured. Without this, logging a session threw
   * away the plan's knowledge of what kind of session it was, and the estimate
   * silently changed for the worse.
   */
  const fromLogged = (l: SessionRow, source: Source, from?: AdaptedSession): ResolvedSession => {
    const d = discOf(l.discipline);
    return {
      key: from ? from.key : `log-${l.id}`,
      source,
      counts: l.completed !== false,
      slot: from?.slot ?? 'LOG',
      disc: d,
      minutes: l.duration_min ?? 0,
      title: l.title ?? from?.title ?? null,
      detail: l.notes ?? from?.detail ?? null,
      avgPower: l.avg_power,
      np: l.np,
      avgHr: l.avg_hr,
      lthr: lthrFor(d),
      distance: l.distance == null ? null : Number(l.distance),
      avgPaceSec: l.avg_pace_sec,
      rpe: l.rpe,
      keySession: from?.keySession,
      keyIntensity: from?.keyIntensity,
      plannedMinutes: from?.minutes,
    };
  };

  /* 1. Exact matches on the plan key. The strongest signal there is. */
  for (const l of logged) {
    if (!l.plan_key) continue;
    if (claimed.has(l.plan_key)) {
      warnings.push(
        `Two logged sessions are both recorded against "${planned.find((p) => p.key === l.plan_key)?.title ?? l.plan_key}". Only one is counted — delete the duplicate on the Log page, or today's calories are being built from a session you did once.`,
      );
      continue;
    }
    const idx = unmatched.findIndex((p) => p.key === l.plan_key);
    if (idx === -1) continue;
    claimed.add(l.plan_key);
    const p = unmatched[idx];
    out.push(fromLogged(l, 'logged', p));
    unmatched.splice(idx, 1);
  }

  /* 2. Soft matches: a logged session with no key, but obviously the planned
        one — same discipline, same day. Without this step, logging a session
        from the Log page instead of the Today page would double the day. */
  const loose = logged.filter((l) => !l.plan_key || !claimed.has(l.plan_key));
  for (const l of loose) {
    if (l.plan_key && claimed.has(l.plan_key)) continue;
    const d = discOf(l.discipline);
    const idx = unmatched.findIndex((p) => p.disc === d || (d === 'BR' && p.disc === 'BK'));
    if (idx === -1) {
      out.push(fromLogged(l, 'extra'));
      continue;
    }
    const p = unmatched[idx];
    out.push(fromLogged(l, 'logged-matched', p));
    unmatched.splice(idx, 1);
  }

  /* 3. Other activity — badminton. The plan already schedules it, so a logged
        badminton session replaces the planned one rather than stacking on it. */
  for (const o of other) {
    const idx = unmatched.findIndex((p) => p.disc === 'OT');
    const base: ResolvedSession = {
      key: `oth-${o.id}`,
      source: idx === -1 ? 'extra' : 'logged-matched',
      counts: true,
      slot: 'EVE',
      disc: 'OT',
      minutes: o.duration_min,
      title: o.activity,
      detail: null,
      rpe: o.rpe,
      lthr: null,
    };
    if (idx !== -1) {
      base.key = unmatched[idx].key;
      base.plannedMinutes = unmatched[idx].minutes;
      unmatched.splice(idx, 1);
    }
    out.push(base);
  }

  /* 4. Whatever the plan still wants and nobody logged. */
  for (const p of unmatched) {
    out.push({
      key: p.key,
      source: isPast ? 'missed' : 'planned',
      counts: !isPast,
      slot: p.slot,
      disc: discOf(p.disc),
      minutes: p.minutes,
      title: p.title,
      detail: p.detail,
      lthr: lthrFor(discOf(p.disc)),
      keyIntensity: p.keyIntensity,
      keySession: p.keySession,
    });
  }

  /* 5. Sanity checks worth surfacing rather than silently absorbing. */
  const counted = out.filter((s) => s.counts);
  const actualMinutes = counted
    .filter((s) => s.source === 'logged' || s.source === 'logged-matched' || s.source === 'extra')
    .reduce((a, s) => a + s.minutes, 0);
  const plannedMinutes = planned.reduce((a, s) => a + s.minutes, 0);

  if (actualMinutes > plannedMinutes * 2 && plannedMinutes > 0) {
    warnings.push(
      `Logged ${Math.round(actualMinutes / 60 * 10) / 10} h against a plan of ${Math.round(plannedMinutes / 60 * 10) / 10} h. That is a big extra day — check nothing has been logged twice before trusting today's calorie target.`,
    );
  }
  const byDisc = new Map<string, number>();
  for (const s of counted) byDisc.set(s.disc, (byDisc.get(s.disc) ?? 0) + 1);
  for (const [d, n] of byDisc) {
    if (n >= 3 && d !== 'OT') {
      warnings.push(`Three or more ${d} sessions counted today. Possible, but unusual — worth a look at the Log page.`);
    }
  }

  out.sort((a, b) => {
    const rank = (x: ResolvedSession) => (x.slot === 'AM' ? 0 : x.slot === 'PM' ? 1 : x.slot === 'EVE' ? 2 : 3);
    return rank(a) - rank(b);
  });

  return {
    sessions: out,
    warnings,
    hasActual: logged.length > 0 || other.length > 0,
    plannedMinutes,
    actualMinutes,
  };
}

/** What actually feeds the energy model. */
export function countable(r: Resolution): ResolvedSession[] {
  return r.sessions.filter((s) => s.counts && s.minutes > 0);
}

/** Total training minutes that count today. */
export function countedMinutes(r: Resolution): number {
  return countable(r).reduce((a, s) => a + s.minutes, 0);
}

/** Endurance-only minutes — strength and badminton do not drive carbohydrate need the same way. */
export function enduranceMinutes(r: Resolution): number {
  return countable(r)
    .filter((s) => s.disc === 'SW' || s.disc === 'BK' || s.disc === 'RN' || s.disc === 'BR')
    .reduce((a, s) => a + s.minutes, 0);
}

/** The longest single endurance session of the day, which is what fuelling hangs off. */
export function longestSession(r: Resolution): ResolvedSession | null {
  const e = countable(r).filter((s) => s.disc !== 'ST');
  return e.length ? e.reduce((m, s) => (s.minutes > m.minutes ? s : m)) : null;
}
