import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { weekNutrition, persistWeek } from '@/lib/nutrition/server';
import { getSettings, weightSeries, recentCheckIns, nutritionChanges } from '@/lib/db';
import { weeklyAdjustment, phaseFor } from '@/lib/nutrition';
import { labelFor, toIso, addDays } from '@/lib/plan';
import { runWeeklyReviewAction } from '../../actions';
import Nav from '../../_components/Nav';
import FuelTabs from '../_FuelTabs';

export const dynamic = 'force-dynamic';

export default async function FuelWeek({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; reviewed?: string }>;
}) {
  if (!(await currentUser())) redirect('/login');
  const params = await searchParams;

  const w = await weekNutrition(params.w);
  await persistWeek(w);

  const today = toIso(new Date());
  const [s, weights, checks, changes] = await Promise.all([
    getSettings(), weightSeries(60), recentCheckIns(today, 7), nutritionChanges(8),
  ]);
  const latest = checks[0] ?? null;
  const review = weeklyAdjustment(weights, today, Number(s.kcal_adjust) || 0, phaseFor(s, today), {
    energy: latest?.energy ?? null,
    hunger: latest?.hunger ?? null,
    sessionFeel: latest?.session_feel ?? null,
  });

  return (
    <>
      <div className="wrap wide">
        <header className="mast">
          <div>
            <h1>The week</h1>
            <div className="xs">
              {labelFor(w.weekStart)} – {labelFor(addDays(w.weekStart, 6))} · {w.totals.trainingHours} h training ·{' '}
              {w.days[0].phase} phase
            </div>
          </div>
          <div className="right">
            <div><div className="lab">Food</div><div className="v">£{w.shopping.ongoing.toFixed(0)}</div></div>
          </div>
        </header>

        <FuelTabs active="/fuel/week" />

        {params.reviewed && <p className="ok small" style={{ marginBottom: 12 }}>Review applied.</p>}

        {/* --------------------------------------------------- the review */}
        <div className={`verdict ${review.deltaKcal > 0 ? 'amber' : review.deltaKcal < 0 ? 'amber' : 'green'}`}>
          <h2>{review.headline}</h2>
          <p>{review.reason}</p>
          {review.avg7 != null && (
            <p className="xs" style={{ marginTop: 8 }}>
              Seven-day average {review.avg7.toFixed(1)} kg
              {review.prevAvg7 != null && ` against ${review.prevAvg7.toFixed(1)} kg the week before`}
              {review.slope21 != null && ` · three-week trend ${review.slope21 > 0 ? '+' : ''}${review.slope21.toFixed(2)} kg/week`}
              {' · standing adjustment '}{Number(s.kcal_adjust) >= 0 ? '+' : ''}{Number(s.kcal_adjust)} kcal
            </p>
          )}
          {review.deltaKcal !== 0 && (
            <form action={runWeeklyReviewAction} style={{ marginTop: 12 }}>
              <input type="hidden" name="day" value={today} />
              <button type="submit">Apply {review.deltaKcal > 0 ? '+' : ''}{review.deltaKcal} kcal</button>
            </form>
          )}
        </div>

        {/* ---------------------------------------------------- the seven days */}
        <div className="card">
          <h2>Seven days</h2>
          <p className="desc">
            Every number here comes from the training plan on the Week page. Change a session there, or log something
            different, and these move on their own.
          </p>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Day</th><th>Training</th><th>kcal</th><th>Carbs</th><th>g/kg</th>
                  <th>Protein</th><th>Fat</th><th>Fuel/h</th>
                </tr>
              </thead>
              <tbody>
                {w.days.map((d) => {
                  const mins = d.resolution.sessions.filter((x) => x.counts).reduce((a, x) => a + x.minutes, 0);
                  return (
                    <tr key={d.day} style={d.day === today ? { background: 'var(--rust-soft)' } : undefined}>
                      <td className="k">
                        <Link href={`/fuel?day=${d.day}`} style={{ textDecoration: 'none' }}>{labelFor(d.day)}</Link>
                      </td>
                      <td className="muted">{(mins / 60).toFixed(1)} h</td>
                      <td className="num">{d.targets.kcal.toLocaleString()}</td>
                      <td className="num">{d.targets.carb} g</td>
                      <td className="muted">{d.targets.carbPerKg}</td>
                      <td className="num">{d.targets.protein} g</td>
                      <td className="num">{d.targets.fat} g</td>
                      <td className="muted">{d.plan.fuel.some((f) => f.during) ? `${d.carb.gPerHour} g` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="xs" style={{ marginTop: 10, marginBottom: 0 }}>
            Weekly total {w.totals.kcal.toLocaleString()} kcal across {w.totals.trainingHours} h of training.
          </p>
        </div>

        {/* --------------------------------------------------- meals by day */}
        {w.plans.map((p, i) => (
          <div className="card" key={p.day}>
            <h2>{labelFor(p.day)}</h2>
            <p className="desc">
              {w.days[i].targets.band} · {p.totals.kcal.toLocaleString()} kcal · £{p.totals.cost.toFixed(2)}
            </p>
            <div className="scroll">
              <table>
                <thead><tr><th>Time</th><th>Meal</th><th>kcal</th><th>Carbs</th></tr></thead>
                <tbody>
                  {p.entries.map((e) => (
                    <tr key={e.seq}>
                      <td className="mono xs">{e.at}</td>
                      <td className="k">
                        {e.title}
                        <div className="xs" style={{ fontWeight: 400 }}>
                          {e.items.map((it) => `${it.name} ${it.display}`).join(' · ')}
                        </div>
                      </td>
                      <td className="num">{e.kcal}</td>
                      <td className="num">{e.c} g</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {changes.length > 0 && (
          <div className="card">
            <h2>What the engine has changed</h2>
            <p className="desc">Every automatic change, and why. Nothing moves silently.</p>
            {changes.map((c) => (
              <div key={c.id} className="sesh">
                <div className="sesh-h">
                  <span className="slot">{labelFor(c.day)}</span>
                  <b>{c.what}</b>
                  {c.delta_kcal ? <span className="mins num">{c.delta_kcal > 0 ? '+' : ''}{c.delta_kcal} kcal</span> : null}
                </div>
                <div className="sesh-b small">{c.why}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Nav active="/fuel" />
    </>
  );
}
