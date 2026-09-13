/**
 * Two kitchens.
 *
 * The athlete lives between two houses on a fixed weekly cycle. Food does not
 * teleport: a batch cooked at Dad's on Sunday cannot be eaten at Mum's on
 * Thursday, and a shopping list that assumes one fridge will send him to the
 * wrong one twice a week. So every meal occurrence in the plan carries the
 * house it is eaten from, every batch is cooked in one named kitchen for a
 * named set of days, and the shopping list splits in two.
 *
 * The cycle, from the brief:
 *   Dad's   — Saturday ~16:00 through to Tuesday after work.  Main cook: Sunday.
 *   Mum's   — Tuesday after work through to Saturday ~16:00.  Main cook: Wednesday.
 *
 * The rule that makes the edges work is simple and worth stating plainly: a
 * meal belongs to the house you were standing in when you picked it up, not the
 * place you happen to eat it. Tuesday's packed lunch is eaten at work but it
 * came out of Dad's fridge that morning, so it is Dad's. Tuesday's dinner is
 * Mum's. Saturday is the same handover in reverse.
 */

export type House = 'dad' | 'mum';

export type HouseConfig = {
  /** When Saturday's handover to Dad's happens, 'HH:MM'. */
  satHandover: string;
  /** When Tuesday's handover to Mum's happens, 'HH:MM'. */
  tueHandover: string;
  dadName: string;
  mumName: string;
};

export const DEFAULT_HOUSES: HouseConfig = {
  satHandover: '16:00',
  tueHandover: '18:00',
  dadName: "Dad's",
  mumName: "Mum's",
};

export function houseName(h: House, c: HouseConfig = DEFAULT_HOUSES): string {
  return h === 'dad' ? c.dadName : c.mumName;
}

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Monday = 1 … Sunday = 7. */
export function dowOf(iso: string): number {
  const d = new Date(iso + 'T12:00:00Z').getUTCDay();
  return d === 0 ? 7 : d;
}

/**
 * Which kitchen a meal at this time on this day comes out of.
 *
 * `at` is the clock time of the meal, 'HH:MM'. Omit it and the answer is for
 * the morning of that day, which is the right default because the morning is
 * when food gets packed.
 */
export function houseFor(dayIso: string, at: string = '08:00', c: HouseConfig = DEFAULT_HOUSES): House {
  const dow = dowOf(dayIso);
  const t = toMin(at);
  switch (dow) {
    case 6:  return t >= toMin(c.satHandover) ? 'dad' : 'mum';   // Saturday
    case 7:  return 'dad';                                        // Sunday
    case 1:  return 'dad';                                        // Monday
    case 2:  return t >= toMin(c.tueHandover) ? 'mum' : 'dad';   // Tuesday
    default: return 'mum';                                        // Wed / Thu / Fri
  }
}

export type HouseSegment = {
  house: House;
  name: string;
  /** ISO day the stay starts. */
  fromDay: string;
  fromAt: string;
  toDay: string;
  toAt: string;
  /** The day the cooking happens for this stay. */
  prepDay: string;
  prepLabel: string;
  /** Every day this stay touches, with the meal kinds it covers. */
  covers: { day: string; from: string; to: string }[];
  description: string;
};

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The two stays that a Monday-start week contains.
 *
 * The week is cut at the handovers, not at midnight, so the segments line up
 * with where the food actually is.
 */
export function weekSegments(weekStartMonday: string, c: HouseConfig = DEFAULT_HOUSES): HouseSegment[] {
  const mon = weekStartMonday;
  const tue = addDays(mon, 1);
  const wed = addDays(mon, 2);
  const sat = addDays(mon, 5);
  const sun = addDays(mon, 6);
  const prevSun = addDays(mon, -1);

  // Stay 1: the tail of the stay that began last Saturday — Mon, plus Tue up to
  // the handover. Cooked for on the Sunday before this week started.
  const first: HouseSegment = {
    house: 'dad',
    name: c.dadName,
    fromDay: mon, fromAt: '00:00',
    toDay: tue, toAt: c.tueHandover,
    prepDay: prevSun,
    prepLabel: 'Sunday (before this week)',
    covers: [
      { day: mon, from: '00:00', to: '23:59' },
      { day: tue, from: '00:00', to: c.tueHandover },
    ],
    description: `At ${c.dadName} until Tuesday ${c.tueHandover}. Monday's meals and Tuesday's breakfast and packed lunch all come out of this fridge — Tuesday's lunch gets packed on Tuesday morning, before you leave.`,
  };

  // Stay 2: Mum's, Tuesday evening to Saturday afternoon. Cooked Wednesday.
  const second: HouseSegment = {
    house: 'mum',
    name: c.mumName,
    fromDay: tue, fromAt: c.tueHandover,
    toDay: sat, toAt: c.satHandover,
    prepDay: wed,
    prepLabel: 'Wednesday',
    covers: [
      { day: tue, from: c.tueHandover, to: '23:59' },
      { day: addDays(mon, 2), from: '00:00', to: '23:59' },
      { day: addDays(mon, 3), from: '00:00', to: '23:59' },
      { day: addDays(mon, 4), from: '00:00', to: '23:59' },
      { day: sat, from: '00:00', to: c.satHandover },
    ],
    description: `At ${c.mumName} from Tuesday ${c.tueHandover} to Saturday ${c.satHandover}. Tuesday's dinner is the first meal here, Saturday's lunch is the last. Wednesday is the cook — it has to carry Thursday and Friday, and cooked food only keeps two days, so Friday's portions go in the freezer on Wednesday evening.`,
  };

  // Stay 3: back to Dad's, Saturday teatime through Sunday and into next week.
  const third: HouseSegment = {
    house: 'dad',
    name: c.dadName,
    fromDay: sat, fromAt: c.satHandover,
    toDay: sun, toAt: '23:59',
    prepDay: sun,
    prepLabel: 'Sunday',
    covers: [
      { day: sat, from: c.satHandover, to: '23:59' },
      { day: sun, from: '00:00', to: '23:59' },
    ],
    description: `Back at ${c.dadName} from Saturday ${c.satHandover}. Saturday's dinner is cooked here — after the long ride, so it needs to be something that is ready in twenty minutes, not something that needs an hour. Sunday is the main cook of the fortnightly cycle and it has to carry Monday and Tuesday as well as Sunday itself.`,
  };

  return [first, second, third];
}

/** The stay that a given moment falls inside. */
export function segmentFor(segments: HouseSegment[], dayIso: string, at: string): HouseSegment | null {
  for (const s of segments) {
    const c = s.covers.find((x) => x.day === dayIso);
    if (!c) continue;
    const t = toMin(at);
    if (t >= toMin(c.from) && t <= toMin(c.to)) return s;
  }
  // Fall back on the day-level answer rather than returning nothing.
  const h = houseFor(dayIso, at);
  return segments.find((s) => s.house === h) ?? null;
}

/**
 * What each house has to feed him, as a count of meal occurrences.
 * Used to size batches and to sanity-check that neither kitchen has been
 * asked to produce food for days he is not there.
 */
export function loadByHouse(
  occurrences: { day: string; at: string }[],
  c: HouseConfig = DEFAULT_HOUSES,
): Record<House, number> {
  const out: Record<House, number> = { dad: 0, mum: 0 };
  for (const o of occurrences) out[houseFor(o.day, o.at, c)] += 1;
  return out;
}

export const HOUSE_RULES = [
  'Food does not move between houses. Anything cooked at one is eaten there, or taken as that morning\'s packed lunch and eaten at work the same day.',
  'A meal belongs to the house you woke up in, not the one you eat in. Tuesday\'s lunch is packed at Dad\'s; Tuesday\'s dinner is cooked at Mum\'s.',
  'Each kitchen has its own shopping list and its own store cupboard. Staples get bought for both — one bag of rice in each house, not one bag carried back and forth.',
  'The Wednesday cook at Mum\'s has to reach Saturday lunchtime. Cooked food keeps two days in the fridge, so Friday and Saturday portions are frozen on Wednesday evening and moved down the night before.',
  'The Sunday cook at Dad\'s has to reach Tuesday lunchtime — three days — so Tuesday\'s portions are frozen Sunday evening and moved to the fridge on Monday night.',
];
