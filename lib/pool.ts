/**
 * Pool length.
 *
 * The plan is written in metres, which is correct, but metres are not what you
 * count while you are swimming — lengths are. In a 25 m pool a 100 is four
 * lengths and three turns, and that changes both how a set feels and how long
 * it takes, because every turn is a small free rest that a 50 m pool does not
 * give you.
 *
 * So pool length is now an explicit setting rather than an assumption anywhere
 * in the codebase, it defaults to 25 m, and every prescribed swim distance is
 * rendered in lengths alongside the metres.
 */

export const DEFAULT_POOL_M = 25;

export function poolLength(s: { pool_length_m?: number | null } | null | undefined): number {
  const n = Number(s?.pool_length_m);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_POOL_M;
}

/** Lengths for a distance, or null when it does not divide cleanly. */
export function lengths(metres: number, poolM: number): number | null {
  if (!Number.isFinite(metres) || metres <= 0 || poolM <= 0) return null;
  const l = metres / poolM;
  return Number.isInteger(l) ? l : null;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * Rewrite a swim prescription so every distance also shows its length count.
 *
 *   '8×50 form focus'   → '8×50 m (2 lengths) form focus'
 *   '2,000 m steady'    → '2,000 m (80 lengths) steady'
 *
 * Deliberately conservative: it only annotates numbers it is confident are
 * distances, it never rewrites a number it cannot divide cleanly, and it leaves
 * anything already annotated alone.
 */
export function withLengths(detail: string, poolM: number): string {
  if (!detail) return detail;
  // Open water has no walls. Annotating a lake swim with a length count would be
  // worse than saying nothing.
  if (/open water|wetsuit|lake|sea\b/i.test(detail)) return detail;
  let out = detail;

  // Reps × distance — '8×50', '10×100', '4 x 400'
  out = out.replace(/(\d+)\s*[×x]\s*(\d{2,4})\b(?!\s*(?:m\b|W\b|%|s\b|:))/g, (m, reps: string, dist: string) => {
    const d = Number(dist);
    // Swim reps are multiples of 25 in any pool; anything else is not a distance.
    if (d % 25 !== 0 || d > 1600) return m;
    const l = lengths(d, poolM);
    return l ? `${reps}×${dist} m (${plural(l, 'length')})` : `${reps}×${dist} m`;
  });

  // Standalone distances — '1,800 m', '3,800 m continuous'. The lookbehind keeps
  // pace notation out of it: '1:52/100 m' is a speed, not a set.
  out = out.replace(/(?<![/\d])(\d{1,2},\d{3}|\d{3,4})\s*m\b(?!\s*\()/g, (m, raw: string) => {
    const d = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(d) || d < 100 || d % 25 !== 0) return m;
    const l = lengths(d, poolM);
    return l ? `${m} (${plural(l, 'length')})` : m;
  });

  return out;
}

/** A one-line reminder of what the pool means for a set, for the swim UI. */
export function poolNote(poolM: number): string {
  return poolM === 25
    ? 'Pool: 25 m. Every 100 is four lengths and three turns — push off strong but do not let the turns become the rest, because open water has none.'
    : `Pool: ${poolM} m.`;
}
