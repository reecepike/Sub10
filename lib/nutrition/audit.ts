/**
 * The audit, and the failsafe.
 *
 * Every number this system prints is the end of a chain of arithmetic, and the
 * failure mode of arithmetic chains is that they stay plausible while going
 * wrong. A day that should say 3,100 kcal and says 3,400 looks exactly like a
 * day that should say 3,400. Nobody catches it. The scale moves for three
 * months and the athlete concludes he is doing something else wrong.
 *
 * So nothing goes on screen unattended. Before a target is displayed it has to
 * survive four questions:
 *
 *   1. Is it possible?          — bounds, in kcal per kg of bodyweight
 *   2. Is it proportionate?     — did a small change in training produce a
 *                                 large change in food?
 *   3. Is anything counted twice? — session identity, planned versus logged
 *   4. Does it reconcile?       — do the parts still add up to the whole, and
 *                                 can the whole be explained in one sentence?
 *
 * A failure on any of these is `blocking`. A blocking audit means the page
 * shows the audit instead of the number. That is the point: a plan that admits
 * it cannot justify a figure is worth far more than one that prints it anyway.
 */

import { ABSORB_CEILING_PER_KG, IMPLAUSIBLE_PER_KG, EA_FLOOR, STEP_GAIN, STEP_FLOOR_PP } from './allocate';

export type Severity = 'fail' | 'warn' | 'info';

export type Finding = {
  code: string;
  severity: Severity;
  title: string;
  detail: string;
  /** What to do about it, in plain terms. */
  action?: string;
};

export type Audit = {
  ok: boolean;
  /** True when the number must not be displayed. */
  blocking: boolean;
  findings: Finding[];
  /** The one sentence that has to exist for the number to be valid. */
  explanation: string | null;
  /** The reconciliation, component by component. */
  reconciliation: { label: string; kcal: number }[];
};

export type AuditSession = {
  key: string;
  title: string;
  disc: string;
  minutes: number;
  kcal: number;
  source: string;
};

export type DayAuditInput = {
  day: string;
  kg: number;
  ffm: number;
  baseline: number;
  exercise: number;
  adjust: number;
  allocationDelta: number;
  /** kcal added to clear the energy-availability floor. */
  eaBump?: number;
  /** The rounding remainder from displaying to the nearest ten. */
  rounding?: number;
  /** What is actually being shown. */
  displayed: number;
  carbG: number;
  proteinG: number;
  fatG: number;
  sessions: AuditSession[];
  /** Warnings already raised by the resolver — duplicate logs and so on. */
  upstream: string[];
};

const KCAL_PER_MIN_MIN = 1.5;   // even a gentle swim costs more than this
const KCAL_PER_MIN_MAX = 22;    // and nothing sustainable costs more than that

export function auditDay(i: DayAuditInput): Audit {
  const f: Finding[] = [];
  const perKg = i.displayed / Math.max(1, i.kg);

  /* ------------------------------------------------- 1. is it possible? */

  if (perKg > IMPLAUSIBLE_PER_KG) {
    f.push({
      code: 'BOUND_HIGH',
      severity: 'fail',
      title: `${Math.round(i.displayed).toLocaleString('en-GB')} kcal is not a real number`,
      detail: `That is ${perKg.toFixed(0)} kcal per kg of bodyweight. The highest defensible day for an athlete of ${i.kg} kg is about ${Math.round(IMPLAUSIBLE_PER_KG * i.kg).toLocaleString('en-GB')} kcal, and that is a Tour de France mountain stage. Something upstream of this figure is wrong.`,
      action: 'The calculation audit below shows every component. Check the session list first — a session logged twice is the usual cause.',
    });
  } else if (perKg > ABSORB_CEILING_PER_KG + 3) {
    f.push({
      code: 'BOUND_CEILING',
      severity: 'warn',
      title: 'Above what one day absorbs well',
      detail: `${Math.round(i.displayed).toLocaleString('en-GB')} kcal is ${perKg.toFixed(0)} kcal/kg. It is achievable but it is a genuinely hard day of eating, and the allocation could not move any more of it to the days either side without breaking their own ceilings.`,
    });
  }
  if (i.displayed < i.baseline * 0.8) {
    f.push({
      code: 'BOUND_LOW',
      severity: 'fail',
      title: 'Below resting requirement',
      detail: `${Math.round(i.displayed).toLocaleString('en-GB')} kcal is under 80% of the ${Math.round(i.baseline).toLocaleString('en-GB')} kcal it takes to get through a day with no training at all.`,
      action: 'Check the standing adjustment on the Settings page — a large negative number there is the likely cause.',
    });
  }
  const ea = (i.displayed - i.exercise) / Math.max(1, i.ffm);
  if (ea < EA_FLOOR - 0.5) {
    f.push({
      code: 'EA_FLOOR',
      severity: 'fail',
      title: 'Energy availability below the floor',
      detail: `After training takes its ${Math.round(i.exercise).toLocaleString('en-GB')} kcal, this day leaves ${ea.toFixed(0)} kcal per kg of fat-free mass for everything else. The floor is ${EA_FLOOR}. Below it, the cost lands on hormones, bone and immunity rather than on the scale, and it does so quietly.`,
      action: 'This should have been corrected automatically. If you are seeing it, the correction has been overridden somewhere.',
    });
  }

  /* -------------------------------------------- 2. session-level sanity */

  const seen = new Map<string, AuditSession>();
  for (const s of i.sessions) {
    if (seen.has(s.key)) {
      f.push({
        code: 'DUP_ID',
        severity: 'fail',
        title: `"${s.title}" is counted twice`,
        detail: `Two entries share the identifier ${s.key}. Each session must be counted exactly once; this one has contributed ${Math.round(s.kcal * 2).toLocaleString('en-GB')} kcal where it should have contributed ${Math.round(s.kcal).toLocaleString('en-GB')}.`,
        action: 'Open the Log page for this day and delete the duplicate.',
      });
    }
    seen.set(s.key, s);
  }

  // Near-identical pairs that carry different identifiers — the shape a double
  // log takes when it is entered twice by hand rather than submitted twice.
  for (let a = 0; a < i.sessions.length; a++) {
    for (let b = a + 1; b < i.sessions.length; b++) {
      const x = i.sessions[a], y = i.sessions[b];
      if (x.key === y.key) continue;
      if (x.disc !== y.disc) continue;
      if (x.minutes === 0 || Math.abs(x.minutes - y.minutes) > Math.max(3, x.minutes * 0.05)) continue;
      if ((x.title ?? '') !== (y.title ?? '')) continue;
      f.push({
        code: 'DUP_LIKELY',
        severity: 'warn',
        title: `Two identical ${x.disc} sessions of ${x.minutes} minutes`,
        detail: `Both are called "${x.title}". That is possible — a double day happens — but it is much more often the same session entered twice, and it is worth ${Math.round(x.kcal).toLocaleString('en-GB')} kcal.`,
        action: 'If it was one session, delete one of them on the Log page.',
      });
    }
  }

  for (const s of i.sessions) {
    if (s.minutes <= 0) continue;
    const perMin = s.kcal / s.minutes;
    if (perMin > KCAL_PER_MIN_MAX || perMin < KCAL_PER_MIN_MIN) {
      f.push({
        code: 'UNIT_RATE',
        severity: perMin > KCAL_PER_MIN_MAX * 1.5 ? 'fail' : 'warn',
        title: `"${s.title}" costs ${perMin.toFixed(1)} kcal a minute`,
        detail: `${Math.round(s.kcal).toLocaleString('en-GB')} kcal over ${s.minutes} minutes. A plausible range is ${KCAL_PER_MIN_MIN}–${KCAL_PER_MIN_MAX} kcal a minute. A figure outside it usually means a power meter reading in the wrong unit, a duration entered in hours instead of minutes, or a distance in the wrong one.`,
        action: 'Check the duration and any power or distance figure on the Log page.',
      });
    }
    if (s.minutes > 600) {
      f.push({
        code: 'UNIT_DURATION',
        severity: 'fail',
        title: `"${s.title}" is recorded as ${(s.minutes / 60).toFixed(1)} hours`,
        detail: 'Over ten hours in one session. Almost always hours typed into a minutes field, or the other way round.',
        action: 'Correct the duration on the Log page.',
      });
    }
  }

  /* -------------------------------------------------- 3. macro plausibility */

  const cPerKg = i.carbG / Math.max(1, i.kg);
  const pPerKg = i.proteinG / Math.max(1, i.kg);
  if (cPerKg > 14) {
    f.push({
      code: 'MACRO_CARB',
      severity: 'fail',
      title: `${i.carbG} g of carbohydrate is ${cPerKg.toFixed(1)} g/kg`,
      detail: 'The top of the periodisation range is 12 g/kg, and that is a full race-loading day. Above 14 g/kg the figure is not coming from the bands, it is coming from an error.',
    });
  }
  if (pPerKg > 3.0) {
    f.push({
      code: 'MACRO_PROTEIN',
      severity: 'warn',
      title: `${i.proteinG} g of protein is ${pPerKg.toFixed(1)} g/kg`,
      detail: 'Above about 2.2 g/kg there is no further benefit, and the calories are better spent on carbohydrate. Protein is not the flexible variable here — carbohydrate is.',
    });
  }
  if (pPerKg < 1.2 && i.displayed > i.baseline) {
    f.push({
      code: 'MACRO_PROTEIN_LOW',
      severity: 'warn',
      title: `Only ${pPerKg.toFixed(1)} g/kg of protein on a training day`,
      detail: 'The floor for an endurance athlete in a build is 1.6 g/kg. Below 1.2 the adaptation is being left on the table.',
    });
  }
  const macroKcal = i.proteinG * 4 + i.carbG * 4 + i.fatG * 9;
  if (Math.abs(macroKcal - i.displayed) > Math.max(120, i.displayed * 0.06)) {
    f.push({
      code: 'MACRO_SUM',
      severity: 'fail',
      title: 'The macros do not add up to the calories',
      detail: `${i.proteinG} g protein + ${i.carbG} g carbohydrate + ${i.fatG} g fat is ${Math.round(macroKcal).toLocaleString('en-GB')} kcal, against a displayed target of ${Math.round(i.displayed).toLocaleString('en-GB')} kcal. These have to agree.`,
    });
  }

  /* ---------------------------------------------------- 4. reconciliation */

  const reconciliation = [
    { label: `Resting metabolism × non-exercise activity`, kcal: Math.round(i.baseline) },
    { label: `Training, net of resting cost (${i.sessions.length} session${i.sessions.length === 1 ? '' : 's'})`, kcal: Math.round(i.exercise) },
    ...(i.adjust ? [{ label: 'Standing adjustment from the weight trend', kcal: Math.round(i.adjust) }] : []),
    ...(i.allocationDelta ? [{ label: i.allocationDelta > 0 ? 'Carried in from adjacent days' : 'Moved to adjacent days', kcal: Math.round(i.allocationDelta) }] : []),
    ...(i.eaBump ? [{ label: 'Raised to the energy-availability floor', kcal: Math.round(i.eaBump) }] : []),
    ...(i.rounding ? [{ label: 'Rounded to the nearest ten', kcal: Math.round(i.rounding) }] : []),
  ];
  const sum = reconciliation.reduce((a, r) => a + r.kcal, 0);
  if (Math.abs(sum - i.displayed) > Math.max(15, i.displayed * 0.01)) {
    f.push({
      code: 'RECONCILE',
      severity: 'fail',
      title: 'The components do not sum to the displayed number',
      detail: `The parts come to ${sum.toLocaleString('en-GB')} kcal; the figure on screen is ${Math.round(i.displayed).toLocaleString('en-GB')} kcal. A ${Math.abs(sum - i.displayed).toLocaleString('en-GB')} kcal difference has no source.`,
    });
  }

  const sessionSum = i.sessions.reduce((a, s) => a + s.kcal, 0);
  if (i.sessions.length && Math.abs(sessionSum - i.exercise) > Math.max(20, i.exercise * 0.02)) {
    f.push({
      code: 'SESSION_SUM',
      severity: 'fail',
      title: 'Session costs do not sum to the training total',
      detail: `The individual sessions come to ${Math.round(sessionSum).toLocaleString('en-GB')} kcal but the day is using ${Math.round(i.exercise).toLocaleString('en-GB')} kcal of training energy. Either a session is being counted that is not listed, or one is listed that is not being counted.`,
    });
  }

  for (const w of i.upstream) {
    f.push({ code: 'UPSTREAM', severity: 'warn', title: 'From the training log', detail: w });
  }

  /* ---------------------------------------------- the required explanation */

  const blocking = f.some((x) => x.severity === 'fail');
  const explanation = blocking
    ? null
    : buildExplanation(i);

  if (!blocking && !explanation) {
    f.push({
      code: 'NO_EXPLANATION',
      severity: 'fail',
      title: 'This number cannot be explained',
      detail: 'A target that cannot be stated in one sentence — this much to live on, this much for training, this much moved — is not a target, it is an output. It is being withheld.',
    });
  }

  return {
    ok: !f.some((x) => x.severity === 'fail' || x.severity === 'warn'),
    blocking: f.some((x) => x.severity === 'fail'),
    findings: f,
    explanation,
    reconciliation,
  };
}

function buildExplanation(i: DayAuditInput): string | null {
  if (!Number.isFinite(i.displayed) || i.displayed <= 0) return null;
  // Round to the nearest ten, as every other figure on the page is, so the
  // explanation cannot appear to disagree with the number it is explaining.
  const n = (x: number) => (Math.round(x / 10) * 10).toLocaleString('en-GB');
  const hrs = i.sessions.reduce((a, s) => a + s.minutes, 0) / 60;
  const parts: string[] = [
    `${n(i.baseline)} kcal to be a person today`,
  ];
  if (i.exercise > 0) parts.push(`${n(i.exercise)} kcal for ${hrs.toFixed(1)} h of training`);
  if (i.adjust) parts.push(`${i.adjust > 0 ? 'plus' : 'minus'} ${n(Math.abs(i.adjust))} kcal from the weight trend`);
  if (i.allocationDelta > 14) parts.push(`plus ${n(i.allocationDelta)} kcal carried in from the days either side`);
  if (i.allocationDelta < -14) parts.push(`less ${n(Math.abs(i.allocationDelta))} kcal moved to the days either side, because one day cannot absorb it all`);
  return `${n(i.displayed)} kcal: ${parts.join(', ')}.`;
}

/* ----------------------------------------------------- the week-level check */

export type WeekAuditInput = {
  days: { day: string; kcal: number; exercise: number; minutes: number }[];
  weeklyRaw: number;
  weeklyAllocated: number;
};

export function auditWeek(i: WeekAuditInput): Audit {
  const f: Finding[] = [];

  // Conservation. Smoothing moves energy; it never creates or destroys it.
  const drift = Math.abs(i.weeklyAllocated - i.weeklyRaw);
  if (drift > Math.max(70, i.weeklyRaw * 0.005)) {
    f.push({
      code: 'WEEK_CONSERVE',
      severity: 'fail',
      title: 'The week does not conserve energy',
      detail: `The week's requirement is ${i.weeklyRaw.toLocaleString('en-GB')} kcal but the seven daily targets sum to ${i.weeklyAllocated.toLocaleString('en-GB')} kcal — a difference of ${drift.toLocaleString('en-GB')} kcal with no cause. Smoothing may move calories between days. It may not invent them.`,
    });
  }

  // Proportionality, day to day. This is the check the whole rebuild exists for.
  for (let n = 1; n < i.days.length; n++) {
    const a = i.days[n - 1], b = i.days[n];
    const base = (a.kcal + b.kcal) / 2;
    if (base <= 0) continue;
    const kcalPp = (Math.abs(b.kcal - a.kcal) / base) * 100;
    const lBase = Math.max(120, (a.exercise + b.exercise) / 2);
    const loadPp = (Math.abs(b.exercise - a.exercise) / lBase) * 100;
    const allowed = loadPp * STEP_GAIN + STEP_FLOOR_PP;
    if (kcalPp > allowed + 3) {
      f.push({
        code: 'PROPORTION',
        severity: 'fail',
        title: `${label(b.day)} steps ${kcalPp.toFixed(0)}% from ${label(a.day)} on a ${loadPp.toFixed(0)}% change in training`,
        detail: `${a.kcal.toLocaleString('en-GB')} kcal to ${b.kcal.toLocaleString('en-GB')} kcal. Training went from ${Math.round(a.exercise).toLocaleString('en-GB')} to ${Math.round(b.exercise).toLocaleString('en-GB')} kcal. A change in food should track a change in work; a step this much larger than the load that caused it means the allocation is being driven by something other than the training.`,
      });
    }
  }

  return {
    ok: !f.length,
    blocking: f.some((x) => x.severity === 'fail'),
    findings: f,
    explanation: f.length
      ? null
      : `The week needs ${i.weeklyRaw.toLocaleString('en-GB')} kcal, the seven days offer ${i.weeklyAllocated.toLocaleString('en-GB')} kcal, and no day steps further from its neighbour than the training between them justifies.`,
    reconciliation: [
      { label: "The week's requirement", kcal: i.weeklyRaw },
      { label: 'Allocated across seven days', kcal: i.weeklyAllocated },
    ],
  };
}

function label(iso: string): string {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
}
