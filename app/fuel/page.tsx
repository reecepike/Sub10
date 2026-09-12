import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { dayNutrition } from '@/lib/nutrition/server';
import { getSettings, getCheckIn, intakeOn } from '@/lib/db';
import { labelFor, toIso } from '@/lib/plan';
import { poolNote } from '@/lib/pool';
import { logIntakeAction, deleteIntakeAction, logToleranceAction } from '../actions';
import Nav from '../_components/Nav';
import FuelTabs from './_FuelTabs';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack',
  pre: 'Before training', during: 'During training', post: 'Recovery',
};

export default async function FuelToday({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; logged?: string; unmatched?: string }>;
}) {
  if (!(await currentUser())) redirect('/login');
  const params = await searchParams;
  const day = params.day ?? toIso(new Date());

  const [n, s, checkIn, intake] = await Promise.all([
    dayNutrition(day), getSettings(), getCheckIn(day), intakeOn(day),
  ]);
  const T = n.targets;

  const longSession = n.resolution.sessions.find((x) => x.counts && x.minutes >= 90 && x.disc !== 'ST');

  return (
    <>
      <div className="wrap">
        <header className="mast">
          <div>
            <h1>Fuel — {labelFor(day)}</h1>
            <div className="xs">
              {T.band} · {n.phase} phase
            </div>
          </div>
          <div className="right">
            <div><div className="lab">kcal</div><div className="v">{T.kcal.toLocaleString()}</div></div>
            <div><div className="lab">Carbs</div><div className="v">{T.carb}g</div></div>
          </div>
        </header>

        <FuelTabs active="/fuel" />

        {params.logged && <p className="ok small" style={{ marginBottom: 12 }}>Logged. Today&rsquo;s remaining numbers are below.</p>}
        {params.unmatched && <p className="err" style={{ marginBottom: 12 }}>I could not tell what that referred to — try naming the meal (&ldquo;half my dinner&rdquo;) or a food (&ldquo;an extra banana&rdquo;).</p>}

        {!checkIn && (
          <div className="note">
            <b>No check-in today.</b> Weight, energy and hunger are what let the calorie target move on its own.{' '}
            <Link href={`/checkin?day=${day}`} style={{ textDecoration: 'underline' }}>Thirty seconds, here</Link>.
          </div>
        )}

        {n.warnings.map((w, i) => (
          <div key={i} className="note"><b>Worth checking.</b> {w}</div>
        ))}

        {/* ------------------------------------------------------- targets */}
        <div className="card">
          <h2>Today&rsquo;s targets</h2>
          <p className="desc">{T.band}. Energy from {n.energy.confidence === 'measured' ? 'measured training data' : n.energy.confidence === 'estimated' ? 'part-measured training data' : 'session durations — no power, pace or heart rate logged yet'}.</p>
          <div className="scroll">
            <table>
              <thead><tr><th>Target</th><th>Amount</th><th>Per kg</th></tr></thead>
              <tbody>
                <tr><td className="k">Energy</td><td className="num">{T.kcal.toLocaleString()} kcal</td><td className="muted">—</td></tr>
                <tr><td className="k">Carbohydrate</td><td className="num">{T.carb} g</td><td className="muted">{T.carbPerKg} g/kg</td></tr>
                <tr><td className="k">Protein</td><td className="num">{T.protein} g</td><td className="muted">{T.proteinPerKg} g/kg</td></tr>
                <tr><td className="k">Fat</td><td className="num">{T.fat} g</td><td className="muted">—</td></tr>
                <tr><td className="k">Fibre</td><td className="num">{T.fibre} g</td><td className="muted">{T.lowResidue ? 'low residue today' : ''}</td></tr>
                <tr><td className="k">Fluid</td><td className="num">{(T.fluidMl / 1000).toFixed(1)} L</td><td className="muted">—</td></tr>
                <tr><td className="k">Sodium</td><td className="num">{T.sodiumMg.toLocaleString()} mg</td><td className="muted">—</td></tr>
              </tbody>
            </table>
          </div>

          <details style={{ marginTop: 14 }}>
            <summary className="lab" style={{ cursor: 'pointer' }}>Why these numbers</summary>
            <ul className="small" style={{ margin: '10px 0 0', paddingLeft: 18 }}>
              {T.rationale.map((r, i) => <li key={i} style={{ marginBottom: 6 }}>{r}</li>)}
              {n.energy.parts.map((p, i) => (
                <li key={`e${i}`} style={{ marginBottom: 6 }}>
                  <b>{p.label}</b> — {p.kcal} kcal. {p.basis}.
                </li>
              ))}
            </ul>
          </details>

          {T.eaWarning && <div className="note" style={{ marginTop: 12, marginBottom: 0 }}>{T.eaWarning}</div>}
        </div>

        {/* ------------------------------------------------------ remaining */}
        {n.remaining && (
          <div className={`verdict ${n.remaining.kcal < -300 ? 'amber' : 'green'}`}>
            <h2>Left to eat today</h2>
            <p>
              {n.remaining.kcal > 0
                ? `${n.remaining.kcal} kcal, ${n.remaining.c} g of carbohydrate and ${n.remaining.p} g of protein still to go.`
                : `You are ${Math.abs(n.remaining.kcal)} kcal past today's target. Not a problem on its own — the weekly trend is what matters, and one day never decides anything.`}
            </p>
          </div>
        )}

        {/* ---------------------------------------------------------- plan */}
        <h2 style={{ margin: '20px 0 8px' }}>The day</h2>
        {n.plan.entries.map((e) => (
          <div key={e.seq} className="sesh">
            <div className="sesh-h">
              <span className="slot">{e.at}</span>
              <span className={`disc d-${e.kind === 'during' || e.kind === 'pre' || e.kind === 'post' ? 'BK' : 'RN'}`}>
                {KIND_LABEL[e.kind]}
              </span>
              <b>{e.title}</b>
              <span className="mins num">{e.kcal} kcal</span>
            </div>
            <div className="sesh-b">
              <table style={{ marginBottom: 8 }}>
                <tbody>
                  {e.items.map((it, i) => (
                    <tr key={i}>
                      <td className="k" style={{ width: '60%' }}>{it.name}</td>
                      <td className="num">{it.display}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="xs">{e.c} g carbs · {e.p} g protein · {e.f} g fat · £{e.cost.toFixed(2)}</div>
              {e.note && <div className="why">{e.note}</div>}
            </div>
          </div>
        ))}

        <div className="card">
          <h2>Day total</h2>
          <p className="desc" style={{ marginBottom: 0 }}>
            {n.plan.totals.kcal.toLocaleString()} kcal · {n.plan.totals.c} g carbs · {n.plan.totals.p} g protein ·{' '}
            {n.plan.totals.f} g fat · {n.plan.totals.fibre} g fibre · £{n.plan.totals.cost.toFixed(2)}
            {Math.abs(n.plan.gap.kcal) > 150 && (
              <>
                {' '}— {n.plan.gap.kcal > 0 ? 'over' : 'under'} the target by {Math.abs(n.plan.gap.kcal)} kcal, which is
                what happens when the meals hit sensible portion ceilings. Eat to appetite around it.
              </>
            )}
          </p>
          {n.plan.notes.map((x, i) => <div key={i} className="note neutral" style={{ marginTop: 12, marginBottom: 0 }}>{x}</div>)}
        </div>

        {/* ----------------------------------------------------- fuelling */}
        {n.plan.fuel.length > 0 && (
          <>
            <h2 style={{ margin: '20px 0 8px' }}>Around training</h2>
            <div className="note neutral">
              <b>Gut training: {n.carb.gPerHour} g of carbohydrate an hour</b> (ceiling for this phase, {n.carb.ceiling} g/h).{' '}
              {n.carb.why}
            </div>
            {n.plan.fuel.map((f) => (
              <div key={f.sessionKey} className="card">
                <h2>{f.title}</h2>
                <p className="desc">{f.startTime} · {f.minutes} min</p>
                {f.before && (
                  <p className="small"><b>{f.before.at} — before.</b> {f.before.what} ({f.before.carbG} g carbs, {f.before.fluidMl} ml)</p>
                )}
                {f.during && (
                  <p className="small">
                    <b>During.</b> {f.during.carbPerHour} g/h — {f.during.totalCarbG} g in total.{' '}
                    {f.during.fluidMlPerHour} ml/h fluid, {f.during.sodiumPerHour} mg/h sodium. {f.during.how}
                    <br />
                    <span className="muted">Carry: {f.during.carry}</span>
                  </p>
                )}
                {f.after && (
                  <p className="small"><b>After — within {f.after.within}.</b> {f.after.what}</p>
                )}
                {f.notes.map((x, i) => <div key={i} className="why">{x}</div>)}
                {f.minutes >= 60 && n.resolution.sessions.find((x) => x.key === f.sessionKey)?.disc === 'SW' && (
                  <p className="xs" style={{ marginBottom: 0 }}>{poolNote(s.pool_length_m)}</p>
                )}
              </div>
            ))}
          </>
        )}

        {/* -------------------------------------------- how the fuelling went */}
        {longSession && (
          <form action={logToleranceAction} className="card">
            <h2>How did the fuelling go?</h2>
            <p className="desc">
              Two clean long sessions at the current rate and the target steps up. One bad one and it steps down for a
              fortnight. This is the only input that moves it.
            </p>
            <input type="hidden" name="day" value={day} />
            <input type="hidden" name="session_ref" value={longSession.key} />
            <input type="hidden" name="duration_min" value={longSession.minutes} />
            <div className="grid2">
              <label className="f">
                <span className="lab">Carbs per hour you actually took</span>
                <input type="number" name="carbs_per_h" defaultValue={n.carb.gPerHour} inputMode="numeric" />
              </label>
              <label className="f" style={{ display: 'flex', gap: 10, alignItems: 'center', paddingTop: 18 }}>
                <input type="checkbox" name="gi_problem" style={{ width: 'auto' }} />
                <span className="small">Stomach was unhappy</span>
              </label>
            </div>
            <label className="f"><span className="lab">Note</span><input type="text" name="note" /></label>
            <button type="submit">Log it</button>
          </form>
        )}

        {/* --------------------------------------------------------- intake */}
        <form action={logIntakeAction} className="card">
          <h2>Ate something different?</h2>
          <p className="desc">
            Tell it in your own words — &ldquo;only ate half my dinner&rdquo;, &ldquo;an extra banana&rdquo;,
            &ldquo;skipped lunch&rdquo;. It adjusts the rest of the day. Nothing here is a telling-off.
          </p>
          <input type="hidden" name="day" value={day} />
          <label className="f">
            <span className="lab">What happened</span>
            <input type="text" name="raw" placeholder="I only ate half my dinner" />
          </label>
          <details>
            <summary className="lab" style={{ cursor: 'pointer' }}>Or enter the numbers</summary>
            <div className="grid3" style={{ marginTop: 10 }}>
              <label className="f"><span className="lab">kcal</span><input type="number" name="kcal" inputMode="numeric" /></label>
              <label className="f"><span className="lab">Carbs g</span><input type="number" name="carb_g" inputMode="numeric" /></label>
              <label className="f"><span className="lab">Protein g</span><input type="number" name="protein_g" inputMode="numeric" /></label>
            </div>
          </details>
          <button className="wide" type="submit">Adjust today</button>
        </form>

        {intake.length > 0 && (
          <div className="card">
            <h2>Logged today</h2>
            {intake.map((r) => (
              <div key={r.id} className="sesh">
                <div className="sesh-h">
                  <b style={{ fontWeight: 500 }}>{r.raw}</b>
                  <span className="mins num">{r.kcal > 0 ? '+' : ''}{r.kcal} kcal</span>
                </div>
                <div className="sesh-b">
                  <form action={deleteIntakeAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="ghost small" type="submit">Remove</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="xs" style={{ marginTop: 18 }}>
          {n.phaseIntent}
        </p>
      </div>
      <Nav active="/fuel" />
    </>
  );
}
