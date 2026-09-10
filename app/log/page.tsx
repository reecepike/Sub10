import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentUser } from '@/lib/auth';
import { saveSessionAction, saveOtherAction } from '../actions';
import Nav from '../_components/Nav';

export const dynamic = 'force-dynamic';

const DISCS = [
  { k: 'SW', n: 'Swim' }, { k: 'BK', n: 'Bike' }, { k: 'RN', n: 'Run' },
  { k: 'BR', n: 'Brick' }, { k: 'ST', n: 'Strength' }, { k: 'OT', n: 'Other' },
];

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string; key?: string; t?: string; m?: string; day?: string }>;
}) {
  if (!(await currentUser())) redirect('/login');
  const p = await searchParams;
  const day = p.day ?? new Date().toISOString().slice(0, 10);
  const disc = p.d;

  if (!disc) {
    return (
      <>
        <div className="wrap">
          <header className="mast"><h1>Log a session</h1></header>
          <p className="muted small">What did you do?</p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {DISCS.map((d) => (
              <Link key={d.k} className="btn ghost" style={{ minWidth: 100, marginBottom: 10 }}
                    href={`/log?d=${d.k}&day=${day}`}>
                {d.n}
              </Link>
            ))}
          </div>
          <p className="xs" style={{ marginTop: 16 }}>
            Only fill in what that session actually gives you. The one field that is never
            optional is <b>RPE</b> — score it within ten minutes of finishing, because recalled
            the next day it drifts to the middle and loses its value.
          </p>
        </div>
        <Nav active="/log" />
      </>
    );
  }

  if (disc === 'OT') {
    return (
      <>
        <div className="wrap">
          <header className="mast"><h1>Other activity</h1></header>
          <p className="muted small">
            Badminton, skiing, gym work outside the plan, a heavy day at work. Without this the
            load model is wrong by about a quarter.
          </p>
          <form action={saveOtherAction} className="card">
            <input type="hidden" name="day" value={day} />
            <label className="f"><span className="lab">Activity</span>
              <input type="text" name="activity" id="activity" defaultValue={p.t ?? 'Badminton'} /></label>
            <div className="grid3">
              <label className="f"><span className="lab">Minutes</span>
                <input type="number" name="duration_min" id="duration_min" inputMode="numeric" defaultValue={p.m ?? 180} /></label>
              <label className="f"><span className="lab">RPE 1–10</span>
                <input type="number" name="rpe" id="rpe_ot" min={1} max={10} inputMode="numeric" /></label>
              <label className="f"><span className="lab">Load factor</span>
                <select name="factor" id="factor" defaultValue="0.7">
                  <option value="0.7">Badminton · 0.7</option>
                  <option value="0.5">Skiing · 0.5</option>
                  <option value="0.8">Gym · 0.8</option>
                  <option value="0.3">Manual work · 0.3</option>
                </select></label>
            </div>
            <label className="f"><span className="lab">Effect on tomorrow — be specific</span>
              <textarea name="next_day" id="next_day"
                placeholder="Quads heavy, legs fine, slept badly after…" /></label>
            <p className="xs">
              This box builds the most useful dataset in the whole system: how <i>you</i> respond
              to badminton and skiing, rather than what the textbook assumes.
            </p>
            <button className="wide" type="submit">Save</button>
          </form>
        </div>
        <Nav active="/log" />
      </>
    );
  }

  const isSwim = disc === 'SW';
  const isBike = disc === 'BK';
  const isRun = disc === 'RN';
  const isBrick = disc === 'BR';
  const isStr = disc === 'ST';

  return (
    <>
      <div className="wrap">
        <header className="mast">
          <h1>{DISCS.find((d) => d.k === disc)?.n ?? 'Session'}</h1>
        </header>

        <form action={saveSessionAction} className="card">
          <input type="hidden" name="discipline" value={disc} />
          {p.key && <input type="hidden" name="plan_key" value={p.key} />}

          <div className="grid2">
            <label className="f"><span className="lab">Date</span>
              <input type="date" name="day" id="day" defaultValue={day} /></label>
            <label className="f"><span className="lab">Minutes</span>
              <input type="number" name="duration_min" id="duration_min" inputMode="numeric" defaultValue={p.m} required /></label>
          </div>

          <label className="f"><span className="lab">Session</span>
            <input type="text" name="title" id="title" defaultValue={p.t}
                   placeholder="What it was" /></label>

          {(isBike || isRun || isBrick) && (
            <div className="grid3">
              <label className="f"><span className="lab">Distance (km)</span>
                <input type="number" step="0.01" name="distance" id="distance" inputMode="decimal" /></label>
              <label className="f"><span className="lab">Avg HR</span>
                <input type="number" name="avg_hr" id="avg_hr" inputMode="numeric" /></label>
              <label className="f"><span className="lab">Cadence</span>
                <input type="number" name="cadence" id="cadence" inputMode="numeric" /></label>
            </div>
          )}

          {(isBike || isBrick) && (
            <>
              <div className="grid3">
                <label className="f"><span className="lab">Avg power (W)</span>
                  <input type="number" name="avg_power" id="avg_power" inputMode="numeric" /></label>
                <label className="f"><span className="lab">Normalised power</span>
                  <input type="number" name="np" id="np" inputMode="numeric" /></label>
                <label className="f"><span className="lab">HR drift %</span>
                  <input type="number" step="0.1" name="hr_drift" id="hr_drift" inputMode="decimal" /></label>
              </div>
              <p className="xs" style={{ marginTop: -4 }}>
                <b>Record HR drift on every ride over two hours.</b> Average HR in the second half
                versus the first at matched power. Under 5% is good aerobic durability; over 8%
                means volume should rise before intensity does. It is the best predictor in this
                system — better than FTP.
              </p>
            </>
          )}

          {(isRun || isBrick) && (
            <label className="f"><span className="lab">Average pace (mm:ss per km)</span>
              <input type="text" name="avg_pace" id="avg_pace" placeholder="5:12" inputMode="numeric" /></label>
          )}

          {isSwim && (
            <>
              <div className="grid3">
                <label className="f"><span className="lab">Distance (m)</span>
                  <input type="number" name="distance" id="distance_sw" inputMode="numeric" /></label>
                <label className="f"><span className="lab">Pace /100 m</span>
                  <input type="text" name="avg_pace" id="avg_pace_sw" placeholder="1:52" inputMode="numeric" /></label>
                <label className="f"><span className="lab">Strokes / length</span>
                  <input type="number" name="stroke_count" id="stroke_count" inputMode="numeric" /></label>
              </div>
              <p className="xs" style={{ marginTop: -4 }}>
                <b>Stroke count is the most valuable number on this form.</b> Falling stroke count
                at the same pace is efficiency improving — it shows up here weeks before CSS moves.
              </p>
            </>
          )}

          {(isBike || isBrick) && (
            <label className="f"><span className="lab">Carbs per hour</span>
              <input type="number" name="carbs_per_h" id="carbs_per_h" inputMode="numeric"
                     placeholder="60" /></label>
          )}

          <label className="f"><span className="lab">RPE 1–10 — not optional</span>
            <input type="number" name="rpe" id="rpe" min={1} max={10} inputMode="numeric" required /></label>

          {!isStr && (
            <label className="f"><span className="lab">Any niggle, ache or asymmetry — be specific about where</span>
              <input type="text" name="niggle" id="niggle"
                     placeholder="Leave blank if there is nothing" /></label>
          )}

          <label className="f"><span className="lab">Notes</span>
            <textarea name="notes" id="notes"
              placeholder={isBrick ? 'How did the legs feel in the first ten minutes?' : 'How it went'} /></label>

          <label className="f" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="checkbox" name="abandoned" id="abandoned" style={{ width: 18, height: 18 }} />
            <span className="small">I stopped this one early</span>
          </label>
          <p className="xs" style={{ marginTop: -8 }}>
            Log what you did, not what you meant to do. An abandoned session honestly recorded is
            useful; a completed one that was not is a problem stored up for three weeks&rsquo; time.
          </p>

          <button className="wide" type="submit">Save session</button>
        </form>

        <Link className="btn ghost wide" href="/log">← Different discipline</Link>
      </div>
      <Nav active="/log" />
    </>
  );
}
