import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { getSettings, sql, sessionsBetween, recentReadiness } from '@/lib/db';
import { weekFor, weekPlan, weekTotals, weekStart, addDays } from '@/lib/plan';
import { buildUpdate } from '@/lib/coach';
import { saveWeeklyReviewAction, saveAdaptationAction } from '../actions';
import Nav from '../_components/Nav';

export const dynamic = 'force-dynamic';

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  if (!(await currentUser())) redirect('/login');
  const p = await searchParams;
  const s = await getSettings();

  const today = new Date().toISOString().slice(0, 10);
  const week = Math.min(45, Math.max(1, weekFor(s.start_date, today)));
  const from = weekStart(s.start_date, week);
  const to = addDays(from, 6);

  const [sessions, readiness, adaptations] = await Promise.all([
    sessionsBetween(from, to),
    recentReadiness(to, 7),
    sql<{ day: string; week: number; trigger: string; decision: string; reasoning: string; outcome: string }[]>`
      select day, week, trigger, decision, reasoning, outcome
      from adaptations order by day desc limit 12`,
  ]);

  const plannedMinutes = weekTotals(weekPlan(week, s)).total;
  const weekReadiness = readiness.filter((r) => r.day >= from && r.day <= to);
  const u = buildUpdate(s, today, sessions, weekReadiness, plannedMinutes);

  return (
    <>
      <div className="wrap">
        <header className="mast">
          <div>
            <h1>Week {week} review</h1>
            <div className="xs">{u.blockName}</div>
          </div>
        </header>

        {p.saved && <p className="ok small">Saved.</p>}

        <div className="card">
          <h2>Coaching update</h2>
          <p className="desc">Generated from what you actually logged this week.</p>

          <div className="lab" style={{ marginTop: 12 }}>What happened</div>
          {u.whatHappened.map((t, i) => <p key={i} className="small">{t}</p>)}

          <div className="lab" style={{ marginTop: 12 }}>What it means</div>
          {u.whatItMeans.map((t, i) => <p key={i} className="small">{t}</p>)}

          <div className="lab" style={{ marginTop: 12 }}>What changes</div>
          {u.whatChanges.map((t, i) => <p key={i} className="small">{t}</p>)}

          <div className="lab" style={{ marginTop: 12 }}>Where this leaves the target</div>
          <div className="scroll">
            <table>
              <tbody>
                <tr><td className="k">Sub-10 trajectory</td><td><b>{u.trajectory.toUpperCase()}</b></td></tr>
                <tr><td className="k">Primary limiter</td><td>{u.primaryLimiter}</td></tr>
                <tr><td className="k">Projected finish</td><td>{u.projectedTotal}</td></tr>
              </tbody>
            </table>
          </div>

          {u.watch && (
            <p className="small" style={{ marginTop: 12 }}>
              <b>One thing to watch:</b> {u.watch}
            </p>
          )}
        </div>

        <div className="card">
          <h2>Your side of it</h2>
          <p className="desc">Five minutes on a Sunday evening. The engine has the numbers; this is the part it cannot see.</p>
          <form action={saveWeeklyReviewAction}>
            <input type="hidden" name="week" value={week} />
            <input type="hidden" name="day" value={today} />
            <label className="f"><span className="lab">What was missed, and why?</span>
              <textarea name="missed" id="missed" /></label>
            <label className="f"><span className="lab">How did the key sessions compare with expectation?</span>
              <textarea name="key_sessions" id="key_sessions" /></label>
            <label className="f"><span className="lab">How was recovery? Anything the numbers did not capture?</span>
              <textarea name="recovery" id="recovery" /></label>
            <label className="f"><span className="lab">Biggest limiter right now — and has it changed?</span>
              <input type="text" name="limiter" id="limiter" defaultValue={u.primaryLimiter} /></label>
            <label className="f"><span className="lab">One line: what was this week actually like?</span>
              <input type="text" name="one_line" id="one_line" /></label>
            <button className="wide" type="submit">Save review</button>
          </form>
        </div>

        <div className="card">
          <h2>Adaptation history</h2>
          <p className="desc">
            Every time the plan changes, write down why. This is what separates a system that
            adapts from one that just changes its mind — and it is how you argue with a decision
            rather than only receive it.
          </p>
          <form action={saveAdaptationAction}>
            <input type="hidden" name="day" value={today} />
            <input type="hidden" name="week" value={week} />
            <label className="f"><span className="lab">What prompted the change</span>
              <input type="text" name="trigger" id="trigger" /></label>
            <label className="f"><span className="lab">Decision taken</span>
              <input type="text" name="decision" id="decision" /></label>
            <label className="f"><span className="lab">Reasoning</span>
              <textarea name="reasoning" id="reasoning" /></label>
            <label className="f"><span className="lab">Reviewed later — did it work?</span>
              <input type="text" name="outcome" id="outcome" /></label>
            <button type="submit">Add entry</button>
          </form>

          {adaptations.length > 0 && (
            <div className="scroll" style={{ marginTop: 16 }}>
              <table>
                <thead><tr><th>Wk</th><th>Trigger</th><th>Decision</th><th>Worked?</th></tr></thead>
                <tbody>
                  {adaptations.map((a, i) => (
                    <tr key={i}>
                      <td>{a.week ?? '—'}</td>
                      <td className="muted small">{a.trigger}</td>
                      <td className="k small">{a.decision}</td>
                      <td className="muted small">{a.outcome ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <Nav active="/reference" />
    </>
  );
}
