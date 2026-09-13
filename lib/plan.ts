import type { Settings } from './db';
import { ms } from './project';
import { poolLength, withLengths } from './pool';

/**
 * The 45-week plan generator.
 *
 * The roadmap states intent; this turns it into dated, numbered sessions.
 * Prescriptions use the athlete's real tested numbers wherever they exist and
 * fall back to descriptive targets where they do not — which is more accurate
 * than zones derived from a guess.
 */

export type Slot = 'AM' | 'PM' | 'EVE' | 'ALL';
export type Disc = 'SW' | 'BK' | 'RN' | 'ST' | 'OT';

export type PlannedSession = {
  key: string;
  slot: Slot;
  disc: Disc;
  title: string;
  detail: string;
  minutes: number;
  keySession: boolean;      // carries the block's primary stimulus
  keyIntensity: boolean;    // the two that must never sit on consecutive days
};

export type PlannedDay = {
  date: string;             // ISO
  dow: number;              // 1 = Monday
  label: string;            // "Mon 14 Sep"
  sessions: PlannedSession[];
  note?: string;
};

export type Block = {
  n: number;
  name: string;
  from: number;
  to: number;
  tpl: TemplateKey;
  focus: string;
};

type TemplateKey = 'found' | 'base1' | 'base2' | 'build1' | 'build2' | 'bolton' | 'peak' | 'taper';

export const BLOCKS: Block[] = [
  { n: 0, name: 'Foundation & Assessment', from: 1, to: 4, tpl: 'found',
    focus: 'Measure everything. Establish the habit before the load.' },
  { n: 1, name: 'Base 1 — Aerobic & Technique', from: 5, to: 12, tpl: 'base1',
    focus: 'Aerobic development at Z2 with the swim rebuilt from the stroke up.' },
  { n: 2, name: 'Base 2 — Volume & Bike Bias', from: 13, to: 20, tpl: 'base2',
    focus: 'The largest aerobic block. The bike takes roughly half the hours.' },
  { n: 3, name: 'Build 1 — Threshold', from: 21, to: 28, tpl: 'build1',
    focus: 'Intensity arrives properly. Bricks become weekly.' },
  { n: 4, name: 'Build 2 — Race Specific', from: 29, to: 36, tpl: 'build2',
    focus: 'Everything becomes Leeds-shaped. Repeated climbing under fatigue.' },
  { n: 5, name: 'Sharpen & 70.3 Bolton', from: 37, to: 38, tpl: 'bolton',
    focus: 'A genuine taper into a genuine race. Bolton is the dress rehearsal.' },
  { n: 6, name: 'IM Specific & Peak', from: 39, to: 43, tpl: 'peak',
    focus: 'The biggest weeks. A 5 h ride at race power, then run off it.' },
  { n: 7, name: 'Taper & Race', from: 44, to: 45, tpl: 'taper',
    focus: 'Volume falls, intensity is retained but shortened. Nothing new.' },
];

/** Recovery weeks. Week 15 is Christmas; week 39 absorbs Bolton. */
export const DELOADS = new Set([4, 8, 12, 15, 20, 24, 28, 32, 36, 39]);

export const GATES: Record<number, { n: number; title: string; test: string }> = {
  20: { n: 1, title: 'Gate 1 — Base complete',
        test: 'FTP ≥ 250 W · 5 km ≤ 20:30 · CSS ≤ 1:45 · a 4 h ride completed comfortably. This is where sub-10 is quietly won or lost.' },
  38: { n: 2, title: 'Gate 2 — IRONMAN 70.3 Bolton',
        test: 'Under 4:45, with a bike split under 2:35 and a half-marathon under 1:28 off it.' },
  42: { n: 3, title: 'Gate 3 — Peak confirmation',
        test: '5 h at 215 W normalised, then 45 min at 4:45/km or better, with normal next-day recovery.' },
};

export function blockFor(week: number): Block {
  return BLOCKS.find((b) => week >= b.from && week <= b.to) ?? BLOCKS[BLOCKS.length - 1];
}

/* ------------------------------------------------------------------ dates */

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Coerce anything date-shaped to 'YYYY-MM-DD'. Dates reach these helpers from
 * the database, from URL params and from the browser, and exactly one of those
 * hands back a Date object. Rather than trusting every caller, the helpers
 * defend their own boundary — a calendar day is a string here, always.
 */
export function toIso(v: unknown): string {
  if (v instanceof Date) {
    return Number.isNaN(v.getTime())
      ? isoDate(new Date())
      : `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  const s = String(v ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : isoDate(new Date());
}

export function addDays(iso: string | Date, n: number): string {
  const d = new Date(toIso(iso) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + (Number.isFinite(n) ? n : 0));
  return isoDate(d);
}

/** Programme week number for a date. 1 on the start week; 0 or less before it. */
export function weekFor(startDate: string | Date, day: string | Date): number {
  const a = new Date(toIso(startDate) + 'T12:00:00Z').getTime();
  const b = new Date(toIso(day) + 'T12:00:00Z').getTime();
  return Math.floor((b - a) / (7 * 86400_000)) + 1;
}

export function weekStart(startDate: string | Date, week: number): string {
  return addDays(startDate, (week - 1) * 7);
}

export function labelFor(iso: string | Date): string {
  const d = new Date(toIso(iso) + 'T12:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/* ------------------------------------------------------------------ zones */

export type Zones = ReturnType<typeof zones>;

export function zones(s: Settings) {
  const ftp = s.ftp ?? null;
  const css = s.css_sec ?? null;
  const fiveK = s.five_k_sec ?? null;

  const w = (lo: number, hi: number) =>
    ftp ? `${Math.round(ftp * lo)}–${Math.round(ftp * hi)} W` : `${Math.round(lo * 100)}–${Math.round(hi * 100)}% FTP`;

  // Threshold pace ≈ 5 km pace + 15 s/km at this training age.
  const thrPerKm = fiveK ? fiveK / 5 + 15 : null;
  const pace = (offset: number) =>
    thrPerKm ? `${ms(thrPerKm + offset)}/km` : offset >= 40 ? 'easy Z2' : offset > 0 ? 'steady' : 'threshold';

  const swim = (offset: number) =>
    css ? `${ms(css + offset)}/100 m` : offset > 4 ? 'easy' : offset > 0 ? 'CSS + a touch' : 'CSS pace';

  return {
    ftp, css, fiveK,
    z2: w(0.56, 0.75),
    z3: w(0.76, 0.90),
    ss: w(0.88, 0.93),
    z4: w(0.91, 1.05),
    z5: w(1.06, 1.20),
    imPower: ftp ? `${Math.round(ftp * 0.72)} W` : 'Ironman race power (~72% FTP)',
    easyRun: pace(50),
    steadyRun: pace(22),
    thrRun: pace(0),
    marathonRun: pace(30),
    cssPace: swim(0),
    cssEasy: swim(9),
    racePaceSwim: swim(5),
  };
}

/* -------------------------------------------------------------- templates */

type Spec = [dow: number, slot: Slot, disc: Disc, title: string, detail: string, minutes: number, key?: 'K' | 'KI'];

function foundation(week: number, Z: Zones): Spec[] {
  if (week === 1) return [
    [1, 'PM', 'ST', 'Strength A — technique first', 'Squat, bench, single-leg RDL, pull-up, Pallof, calf raise. 3×8 at RPE 6. Record every load — this is your baseline.', 50],
    [2, 'AM', 'RN', 'Easy aerobic + strides', 'Conversational throughout. Finish with 6×20 s strides on grass.', 40],
    [3, 'AM', 'SW', 'TEST — swim baseline', '600 m warm-up with drills, then 400 m time trial, 10 min easy, 200 m time trial. Film 50 m from the side if you can. This sets your CSS.', 55, 'K'],
    [4, 'PM', 'BK', 'Learn the bike', 'Easy spin. Hold 85–95 rpm. No power targets — get comfortable and note anything that rubs, aches or does not fit.', 60],
    [5, 'PM', 'RN', 'TEST — 5 km time trial', '15 min warm-up with strides, then 5 km hard on a flat measured route you will use every time. 10 min cool-down. Record splits, average HR, max HR.', 45, 'K'],
    [6, 'AM', 'BK', 'Z2 endurance + fuelling practice', 'Rolling terrain, conversational. Take 60 g of carbohydrate per hour from minute 30 and note what your gut makes of it.', 105, 'K'],
    [7, 'AM', 'SW', 'Technique only', 'Catch-up drill, single-arm, 6-kick switch, sculling. Ignore the clock entirely.', 45],
  ];
  if (week === 2) return [
    [1, 'PM', 'BK', 'Recovery spin', 'Z1, high cadence. Skip it entirely if Sunday badminton was heavy.', 35],
    [2, 'AM', 'RN', 'Easy aerobic + strides', `${Z.easyRun}. 6×20 s strides to finish.`, 45],
    [2, 'PM', 'ST', 'Strength A + TEST', 'Bench press 5RM after a thorough warm-up, then the rest of the session at RPE 6.', 50],
    [3, 'AM', 'SW', 'Drill ladder', '8×50 form focus. First structured set — hold the shape, not the pace.', 50],
    [4, 'PM', 'BK', 'TEST — FTP', '20 min warm-up including 3×1 min openers, 5 min all-out, 10 min easy, then 20 min maximal evenly paced. FTP = 95% of the 20 min average. Do not fade in the last five minutes or it does not count.', 75, 'K'],
    [5, 'PM', 'RN', 'Steady aerobic', `Flat route, relaxed. ${Z.easyRun}.`, 50],
    [6, 'AM', 'BK', 'Z2 endurance', 'Fuelling at 60 g/h. Same route as last week if you can — it becomes a reference.', 135, 'K'],
    [6, 'AM', 'RN', 'First brick', 'Easy transition run straight off the bike. Note how the legs feel in the first ten minutes.', 15],
    [7, 'AM', 'SW', 'TEST — continuous distance', 'How far can you swim unbroken in 30 minutes at a steady effort? Then 10 min technique.', 50, 'K'],
  ];
  if (week === 3) return [
    [1, 'PM', 'ST', 'Strength B', 'Trap-bar deadlift, overhead press, split squat, row, side plank, Copenhagen. 3×8 at RPE 6–7.', 45],
    [2, 'AM', 'RN', 'Aerobic with structure', `4×3 min at ${Z.steadyRun} inside an easy run. First taste of structure.`, 50],
    [3, 'AM', 'SW', 'CSS introduction', `8×100 at ${Z.cssEasy}, 20 s rest.`, 50],
    [4, 'PM', 'BK', 'Sweet spot introduction', `3×8 min at ${Z.ss}, 4 min easy between.`, 75, 'KI'],
    [5, 'AM', 'RN', 'Shake-out', 'Easy Z1–Z2 before travelling.', 30],
    [6, 'ALL', 'OT', 'BASI Level 1 — Day 1', 'Log it as other activity: hours on snow, RPE, and how the legs felt after. No structured training today.', 0],
    [7, 'ALL', 'OT', 'BASI Level 1 — Day 2', 'As yesterday. Prioritise sleep and food over everything else.', 0],
  ];
  return [
    [1, 'PM', 'OT', 'Recovery and review', 'Mobility 15 min. Transfer all six baseline numbers into Settings — that is what makes every prescription from here specific to you.', 20],
    [2, 'AM', 'RN', 'Easy aerobic + strides', `${Z.easyRun}. 6×20 s strides.`, 50],
    [3, 'AM', 'SW', 'Technique + CSS', `Drills, then 4×100 at ${Z.cssPace}. Compare the feel to week 1.`, 55],
    [4, 'PM', 'BK', 'Sweet spot', `4×8 min at ${Z.ss}, 4 min easy. First progression.`, 80, 'KI'],
    [5, 'PM', 'ST', 'Strength B + spin', 'Strength B, then 20 min easy on the bike.', 60],
    [6, 'ALL', 'OT', 'BASI Level 1 — Day 3', 'Log hours, RPE and leg soreness.', 0],
    [7, 'ALL', 'OT', 'BASI Level 1 — Day 4', 'Block 0 ends. Base 1 starts on Monday.', 0],
  ];
}

function base1(Z: Zones): Spec[] {
  return [
    [1, 'PM', 'SW', 'Technique & drills', 'Drill ladder, then 8×50 with one thing to think about. Frequency beats intensity in the water for months yet.', 50],
    [1, 'PM', 'RN', 'Recovery jog', 'Z1 only, nothing faster. It keeps run frequency at three without adding stress.', 30],
    [2, 'AM', 'RN', 'Aerobic with strides', `${Z.easyRun}, then 6×20 s strides. No threshold running in this block, however good the 5 km looks.`, 50, 'KI'],
    [2, 'PM', 'ST', 'Strength A', 'Full body, bench as the anchor lift.', 40],
    [3, 'AM', 'SW', 'CSS set', `8–10×100 at ${Z.cssPace}, 20 s rest.`, 45],
    [3, 'PM', 'BK', 'Z2 endurance', `${Z.z2}, cadence 90–95.`, 60],
    [4, 'AM', 'BK', 'Sweet spot', `3×10 min at ${Z.ss}, 5 min easy between.`, 70, 'KI'],
    [4, 'PM', 'ST', 'Strength B', 'Hinge and pull. Reduced volume.', 30],
    [5, 'PM', 'BK', 'Endurance with climbs', `${Z.z2} with 4×4 min at ${Z.z3} on rises. Finish by 17:30.`, 70],
    [6, 'AM', 'BK', 'Long ride', `Steady ${Z.z2}. Fuel 60 g carb/h from minute 30.`, 150, 'K'],
    [6, 'AM', 'RN', 'Transition run', 'Easy off the bike, controlled.', 15],
    [7, 'AM', 'RN', 'Long run', `${Z.easyRun} throughout, no quality. Finish by midday.`, 70, 'K'],
  ];
}

function base2(Z: Zones): Spec[] {
  return [
    [1, 'PM', 'SW', 'Technique & drills', '1,800 m — drill ladder, 8×50 form focus.', 50],
    [1, 'PM', 'RN', 'Recovery jog', 'Z1 only, nothing faster. Skip it if Sunday was heavy.', 30],
    [2, 'AM', 'RN', 'Threshold', `15 min warm-up, 4×6 min at ${Z.thrRun} with 2 min jog, 10 min cool-down.`, 65, 'KI'],
    [2, 'PM', 'ST', 'Strength A', 'Full body, bench as the anchor lift.', 40],
    [3, 'AM', 'SW', 'CSS set', `10×100 at ${Z.cssPace}, 15 s rest.`, 45],
    [3, 'PM', 'BK', 'Z2 endurance', `${Z.z2} on the trainer, cadence 90–95.`, 60],
    [4, 'AM', 'BK', 'Sweet spot', `3×12 min at ${Z.ss}, 5 min easy between.`, 75, 'KI'],
    [4, 'PM', 'ST', 'Strength B', 'Hinge and pull, reduced volume.', 30],
    [5, 'AM', 'SW', 'Aerobic', '2,000 m steady — continuous-distance focus.', 40],
    [5, 'PM', 'BK', 'Endurance with climbs', `${Z.z2} with 4×4 min at ${Z.z3} on rises. Finish by 17:30.`, 75],
    [6, 'AM', 'BK', 'Long ride', `${Z.z2} with 3×15 min at ${Z.z3}. Fuel 70 g carb/h. Record HR drift.`, 180, 'K'],
    [6, 'AM', 'RN', 'Transition run', 'Off the bike, Z2, controlled.', 20],
    [7, 'AM', 'RN', 'Long run', `${Z.easyRun} throughout, no quality. Finish by midday.`, 85, 'K'],
  ];
}

function build1(Z: Zones): Spec[] {
  return [
    [1, 'PM', 'SW', 'Technique + aerobic', '2,200 m. Keep the technical work going — it is still the slowest thing to change.', 55],
    [1, 'PM', 'RN', 'Recovery jog', 'Z1 only.', 30],
    [2, 'AM', 'RN', 'Threshold', `4×8 min at ${Z.thrRun}, 2 min jog.`, 70, 'KI'],
    [2, 'PM', 'ST', 'Strength — maintenance', 'Upper body priority. Heavy lower-body work comes out from here.', 35],
    [3, 'AM', 'SW', 'CSS', `6×200 at ${Z.cssPace}, 20 s rest.`, 50],
    [3, 'PM', 'BK', 'Z2 endurance', `${Z.z2}, cadence work.`, 70],
    [4, 'AM', 'BK', 'Threshold', `4×10 min at ${Z.z4}, 5 min easy between.`, 80, 'KI'],
    [5, 'PM', 'BK', 'Endurance with race-pace blocks', `${Z.z2} with 3×8 min at ${Z.imPower}. Finish by 17:30.`, 90],
    [6, 'AM', 'BK', 'Long ride', `Hilly route. ${Z.z2} with 3×20 min at ${Z.imPower} on the climbs.`, 240, 'K'],
    [6, 'AM', 'RN', 'Brick run', `30 min at ${Z.marathonRun} off the bike.`, 30, 'K'],
    [7, 'AM', 'RN', 'Long run', `${Z.easyRun}. Finish by midday.`, 95, 'K'],
  ];
}

function build2(Z: Zones): Spec[] {
  return [
    [1, 'PM', 'SW', 'Technique + aerobic', '2,400 m.', 55],
    [1, 'PM', 'RN', 'Recovery jog', 'Z1 only.', 30],
    [2, 'AM', 'RN', 'Threshold', `3×10 min at ${Z.thrRun}, 3 min jog.`, 75, 'KI'],
    [2, 'PM', 'ST', 'Strength — maintenance', 'Upper body priority, reduced sets.', 35],
    [3, 'AM', 'SW', 'CSS', `4×400 at ${Z.racePaceSwim}.`, 50],
    [3, 'PM', 'BK', 'Aero endurance', `${Z.z2} held in the aero position. Cadence work.`, 75],
    [4, 'AM', 'BK', 'Climb repeats', `6×5 min at ${Z.z4}–${Z.z5}. This is Black Hill Road in miniature — you climb it three times on race day.`, 85, 'KI'],
    [5, 'AM', 'SW', 'Open water', 'Sighting every 6–8 strokes without breaking rhythm. Wetsuit. 2,000 m.', 45],
    [5, 'PM', 'RN', 'Long aerobic with marathon pace', `3×10 min at ${Z.marathonRun} inside an easy run. Finish by 17:00.`, 90],
    [6, 'AM', 'BK', 'Long ride — three laps', `Three laps of a hilly route, race power on every climb. Full race nutrition at 80–90 g/h.`, 285, 'K'],
    [6, 'AM', 'RN', 'Brick run', `40 min at ${Z.marathonRun}. The session that actually predicts the race.`, 40, 'K'],
    [7, 'AM', 'RN', 'Long run', `${Z.easyRun} throughout. Finish by midday.`, 100, 'K'],
  ];
}

function bolton(week: number, Z: Zones): Spec[] {
  if (week === 37) return [
    [1, 'PM', 'SW', 'Technique', 'Easy, 1,800 m.', 45],
    [2, 'AM', 'RN', 'Sharpener', `2×8 min at ${Z.thrRun}. Short, not hard.`, 55, 'KI'],
    [3, 'AM', 'SW', 'Race pace', `1,500 m continuous at ${Z.racePaceSwim}.`, 45],
    [3, 'PM', 'BK', 'Z2 with openers', `${Z.z2} with 4×3 min at ${Z.imPower}.`, 70],
    [4, 'AM', 'BK', 'Race power', `3×15 min at ${Z.imPower}.`, 75, 'KI'],
    [5, 'AM', 'ST', 'Strength — the floor', 'One short maintenance session. Bench, row, press. Nothing heavy this close to a race.', 25],
    [5, 'PM', 'RN', 'Easy + strides', 'Relaxed, 6 strides.', 45],
    [6, 'AM', 'BK', 'Last long ride before Bolton', `${Z.z2} with 2×20 min at ${Z.imPower}. Full race kit and nutrition — this is the dress rehearsal for the dress rehearsal.`, 180, 'K'],
    [6, 'AM', 'RN', 'Brick', `20 min at ${Z.marathonRun}.`, 20],
    [7, 'AM', 'RN', 'Long run, shortened', `${Z.easyRun}.`, 70],
  ];
  return [
    [1, 'PM', 'SW', 'Easy technique', 'Feel the water, nothing more.', 30],
    [2, 'AM', 'BK', 'Openers', `45 min easy with 4×90 s at ${Z.imPower}. Openers, not a session.`, 45],
    [2, 'PM', 'RN', 'Shake-out', '20 min easy + 4 strides.', 20],
    [3, 'AM', 'SW', 'Wetsuit swim', '800 m easy in the wetsuit if you can get to open water.', 25],
    [4, 'AM', 'RN', 'Shake-out', '25 min very easy + 4 strides. Kit laid out tonight. Fix nothing new.', 25],
    [5, 'AM', 'BK', 'Legs and bike check', `30 min easy with 2×60 s at ${Z.imPower}.`, 30],
    [6, 'AM', 'SW', 'Pre-race', '15 min easy swim. Practise the start. Off your feet from midday.', 15],
    [7, 'ALL', 'OT', 'RACE — IRONMAN 70.3 Bolton', 'Gate 2. Under 4:45 keeps sub-10 live: bike under 2:35, half-marathon under 1:28 off it. Everything you test today is one fewer unknown at Leeds.', 0],
  ];
}

function peak(week: number, Z: Zones): Spec[] {
  if (week === 39) return [
    [1, 'PM', 'OT', 'Full rest', 'You raced yesterday. Nothing today.', 0],
    [2, 'PM', 'SW', 'Easy technique', 'Flush the legs.', 35],
    [3, 'AM', 'BK', 'Easy spin', 'Z1, high cadence.', 45],
    [4, 'AM', 'RN', 'Easy', `${Z.easyRun}. First run back.`, 35],
    [5, 'PM', 'BK', 'Z2 endurance', `${Z.z2}, relaxed.`, 75],
    [6, 'AM', 'BK', 'Moderate long ride', `${Z.z2} only. No intensity — this week absorbs Bolton.`, 150],
    [7, 'AM', 'RN', 'Long run, easy', `${Z.easyRun}.`, 80],
  ];
  return [
    [1, 'PM', 'SW', 'Easy technique', '1,500 m. Recovery only.', 35],
    [2, 'AM', 'RN', 'Threshold', `2×15 min at ${Z.thrRun}.`, 75, 'KI'],
    [2, 'PM', 'SW', 'Aerobic', `3,000 m continuous, last 1,000 at ${Z.racePaceSwim}.`, 55],
    [3, 'AM', 'BK', 'Aero endurance', `${Z.z2} in full aero position.`, 105],
    [3, 'PM', 'ST', 'Strength — the floor', 'Bench, row, press, single-leg stability. One session a week keeps the physique and the connective tissue.', 30],
    [4, 'AM', 'BK', 'Race power on climbs', `3×25 min at ${Z.imPower}.`, 110, 'KI'],
    [4, 'PM', 'RN', 'Easy + strides', `${Z.easyRun}.`, 45],
    [5, 'AM', 'SW', 'Open water — full rehearsal', '3,800 m continuous in the wetsuit. Needs a half-day or a lake that opens at 06:00 — sort this out in advance, it will not fit around a normal Friday.', 75],
    [6, 'AM', 'BK', 'THE session', `Race power throughout, full race nutrition at 90 g/h. This is the one that decides the race plan.`, 300, 'K'],
    [6, 'AM', 'RN', 'Brick', `45 min at ${Z.marathonRun}. If this goes well the plan is confirmed. If it does not, the bike target comes down.`, 45, 'K'],
    [7, 'AM', 'RN', 'Long run', `${Z.easyRun} with the final 20 min at ${Z.steadyRun}.`, 125, 'K'],
  ];
}

function taper(week: number, Z: Zones): Spec[] {
  if (week === 44) return [
    [1, 'PM', 'SW', 'Easy technique', '1,500 m.', 35],
    [2, 'AM', 'RN', 'Short threshold', `3×5 min at ${Z.thrRun}. Sharp and short — intensity is retained, volume is not.`, 50, 'KI'],
    [4, 'AM', 'BK', 'Race power', `3×10 min at ${Z.imPower}.`, 70, 'KI'],
    [3, 'AM', 'SW', 'Race pace', `2,000 m with 4×200 at ${Z.racePaceSwim}.`, 45],
    [3, 'PM', 'RN', 'Easy + strides', `${Z.easyRun}.`, 40],
    [5, 'PM', 'BK', 'Z2', `${Z.z2}, relaxed.`, 75],
    [6, 'AM', 'BK', 'Last moderate ride', `${Z.z2} with 3×10 min at ${Z.imPower}.`, 150, 'K'],
    [6, 'AM', 'RN', 'Short brick', `20 min at ${Z.marathonRun}.`, 20],
    [7, 'AM', 'RN', 'Last long-ish run', `${Z.easyRun}. Badminton stops from this week — lateral loading two weeks out is a risk with no upside.`, 80],
  ];
  return [
    [1, 'AM', 'SW', 'Easy technique', '1,200 m. Feel the water, nothing more.', 30],
    [2, 'AM', 'BK', 'Openers', `45 min easy with 4×90 s at ${Z.imPower}. Openers, not a session.`, 45],
    [2, 'PM', 'RN', 'Shake-out', '20 min easy + 4 strides.', 20],
    [3, 'AM', 'SW', 'Wetsuit swim', '800 m easy in the wetsuit if possible. Kit check: lay everything out, charge everything, fix nothing new.', 25],
    [4, 'AM', 'RN', 'Shake-out', '25 min very easy + 4 strides. Start carbohydrate loading — 8–10 g/kg/day.', 25],
    [5, 'AM', 'BK', 'Legs and bike check', `30 min easy with 2×60 s at ${Z.imPower}. Travel to Leeds. Registration.`, 30],
    [6, 'AM', 'SW', 'Pre-race', '15 min easy in Waterloo Lake if it is open. Practise the start, then off your feet from midday. Bed by 21:00.', 15],
    [7, 'ALL', 'OT', 'RACE DAY — IRONMAN LEEDS', 'You cannot win this on the first lap of the bike, but you can absolutely lose it there. Ride lap one five watts under target and fuel from minute 20.', 0],
  ];
}

/* ------------------------------------------------------------- generation */

/** Scale within the 3:1 loading cycle. */
function weekScale(week: number, block: Block): number {
  if (DELOADS.has(week)) return 0.62;
  if (block.tpl === 'bolton' || block.tpl === 'taper') return 1;
  // Position inside the current build run: 0.92 → 1.00 → 1.08
  let pos = 0;
  for (let w = week - 1; w >= block.from; w--) {
    if (DELOADS.has(w)) break;
    pos++;
  }
  // Week 43 is the last big week before the taper — it steps down, it does not peak.
  if (week === 43) return 0.90;
  return [0.92, 1.0, 1.08][Math.min(pos, 2)];
}

function template(week: number, Z: Zones): Spec[] {
  const b = blockFor(week);
  switch (b.tpl) {
    case 'found': return foundation(week, Z);
    case 'base1': return base1(Z);
    case 'base2': return base2(Z);
    case 'build1': return build1(Z);
    case 'build2': return build2(Z);
    case 'bolton': return bolton(week, Z);
    case 'peak': return peak(week, Z);
    case 'taper': return taper(week, Z);
  }
}

/** Badminton policy by block — a recommendation the plan shows, not a rule it enforces. */
function badminton(week: number, s: Settings): { fri: boolean; sun: boolean; note: string } {
  const b = blockFor(week);
  if (b.n >= 7) return { fri: false, sun: false, note: 'Both sessions stop from Week 44 — lateral loading this close to the race is risk with no fitness benefit.' };
  if (b.n >= 4) return { fri: false, sun: s.badminton_sun, note: 'Sunday only from here. Six extra hours of high-intensity intermittent load is the most likely single cause of an injury or a stalled bike block.' };
  if (b.n === 3) return { fri: s.badminton_fri, sun: s.badminton_sun, note: 'Friday is now conditional — drop it in any week where Saturday carries a key session and readiness is not green.' };
  return { fri: s.badminton_fri, sun: s.badminton_sun, note: 'Both sessions are affordable at this volume, and they are good for you. Log them honestly — they count at 0.7× endurance load.' };
}

/**
 * The no-pre-work rule.
 *
 * The templates were written with morning sessions on weekdays, because that is
 * how coaching plans are always written — it assumes an athlete whose day job
 * will wait. His will not. He cannot train before work on a normal workday, and
 * a plan that keeps putting a 06:30 threshold run on a Tuesday is not being
 * ambitious on his behalf; it is manufacturing a session he will miss, and
 * every missed session makes the next one easier to miss.
 *
 * So on workdays the morning slot is closed. Sessions move to after work, and
 * where two end up stacked the second goes to the evening rather than being
 * bolted onto the back of the first — with the exception of Friday, where the
 * evening already belongs to badminton.
 *
 * Weekends are untouched: Saturday and Sunday mornings are when the long work
 * actually happens, and that is the whole point of them.
 */
function afterWork(sessions: PlannedSession[], dow: number, s: Settings): PlannedSession[] {
  if (s.allow_pre_work) return sessions;
  const workDays = (s.work_days ?? '1,2,3,4,5').split(',').map((x) => Number(x.trim()));
  if (!workDays.includes(dow)) return sessions;

  const morning = sessions.filter((x) => x.slot === 'AM' && x.minutes > 0);
  if (!morning.length) return sessions;

  const eveningTaken = sessions.some((x) => x.slot === 'EVE');
  const pmAlready = sessions.filter((x) => x.slot === 'PM' && x.minutes > 0).length;

  let movedToEvening = 0;
  const out = sessions.map((x) => {
    if (x.slot !== 'AM' || x.minutes === 0) return x;
    // The first displaced session goes straight after work. A second one only
    // goes to the evening if the evening is free — otherwise it sits behind the
    // first, which is what a real Tuesday looks like anyway.
    const idx = morning.indexOf(x);
    const toEvening = !eveningTaken && (pmAlready > 0 || idx > 0) && movedToEvening === 0;
    if (toEvening) movedToEvening++;
    return {
      ...x,
      slot: (toEvening ? 'EVE' : 'PM') as Slot,
      detail: `${x.detail} · Moved out of the morning — you cannot train before work, so this is an after-work session.`,
    };
  });

  return out;
}

export function weekPlan(week: number, s: Settings): PlannedDay[] {
  const Z = zones(s);
  const block = blockFor(week);
  const scale = weekScale(week, block);
  const specs = template(week, Z);
  const bad = badminton(week, s);
  const monday = weekStart(s.start_date, week);
  const poolM = poolLength(s);

  const days: PlannedDay[] = [];
  for (let dow = 1; dow <= 7; dow++) {
    const date = addDays(monday, dow - 1);
    const sessions: PlannedSession[] = specs
      .filter((sp) => sp[0] === dow)
      .map((sp, i) => {
        const [, slot, disc, title, detail, minutes, key] = sp;
        const scaled = minutes ? Math.max(15, Math.round((minutes * scale) / 5) * 5) : 0;
        return {
          key: `w${week}-d${dow}-${i}`,
          slot, disc, title,
          // Swim prescriptions are written in metres; show the length count too,
          // because lengths are what you actually count in the water.
          detail: disc === 'SW' ? withLengths(detail, poolM) : detail,
          minutes: scaled,
          keySession: key === 'K' || key === 'KI',
          keyIntensity: key === 'KI',
        };
      });

    if (dow === 5 && bad.fri) {
      sessions.push({
        key: `w${week}-d5-bad`, slot: 'EVE', disc: 'OT',
        title: 'Badminton', detail: '19:00–22:00. Log it — it counts as 2.1 equivalent training hours.',
        minutes: 180, keySession: false, keyIntensity: false,
      });
    }
    if (dow === 7 && bad.sun) {
      sessions.push({
        key: `w${week}-d7-bad`, slot: 'EVE', disc: 'OT',
        title: 'Badminton', detail: '19:00–22:00. Tomorrow is a recovery day for exactly this reason.',
        minutes: 180, keySession: false, keyIntensity: false,
      });
    }

    days.push({ date, dow, label: labelFor(date), sessions: afterWork(sessions, dow, s) });
  }

  if (DELOADS.has(week)) {
    days[0].note = 'Recovery week — around 62% of normal volume. Intensity is kept, tonnage is not. Do not "top it up" because you feel good.';
  }
  const gate = GATES[week];
  if (gate) days[0].note = `${gate.title}. ${gate.test}`;

  return days;
}

/** Structured minutes by discipline for a week (badminton excluded). */
export function weekTotals(days: PlannedDay[]) {
  const t = { SW: 0, BK: 0, RN: 0, ST: 0, total: 0 };
  for (const d of days) for (const s of d.sessions) {
    if (s.disc === 'OT') continue;
    t[s.disc] += s.minutes;
    t.total += s.minutes;
  }
  return t;
}

/** Equivalent training hours, including other activity. */
export function eth(days: PlannedDay[]): number {
  let e = 0;
  for (const d of days) for (const s of d.sessions) {
    const h = s.minutes / 60;
    if (s.disc === 'OT') e += h * 0.7;
    else if (s.disc === 'ST') e += h * 0.8;
    else if (s.keyIntensity) e += h * 1.5;
    else if (h > 3) e += h * 1.2;
    else e += h;
  }
  return e;
}
