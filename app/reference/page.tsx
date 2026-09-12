import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentUser } from '@/lib/auth';
import { getSettings } from '@/lib/db';
import { zones, BLOCKS, DELOADS, GATES, weekFor } from '@/lib/plan';
import { raceFuelPlan } from '@/lib/nutrition';
import { EVIDENCE } from '@/lib/nutrition/evidence';
import Nav from '../_components/Nav';

export const dynamic = 'force-dynamic';

export default async function Reference() {
  if (!(await currentUser())) redirect('/login');
  const s = await getSettings();
  const race = raceFuelPlan(s);
  const Z = zones(s);
  const week = Math.max(1, weekFor(s.start_date, new Date().toISOString().slice(0, 10)));

  return (
    <>
      <div className="wrap wide">
        <header className="mast"><h1>Reference</h1></header>

        <div className="row" style={{ marginBottom: 18 }}>
          <Link className="btn ghost" href="/review">Weekly review</Link>
          <Link className="btn ghost" href="/settings">Settings</Link>
        </div>

        <div className="card">
          <h2>The race</h2>
          <p className="desc">IRONMAN Leeds — one of the harder full-distance courses in Europe.</p>
          <div className="scroll">
            <table>
              <tbody>
                <tr><td className="k">Swim</td><td>Two 1.9 km laps of Waterloo Lake, Roundhay Park. Still, flat, no current. Roughly 300 m of running to T1.</td></tr>
                <tr><td className="k">Bike</td><td>180 km with <b>2,419 m of climbing</b> — a run-out to Shadwell then three loops. Black Hill Road on every lap.</td></tr>
                <tr><td className="k">Run</td><td>Four 10 km laps, 415 m of gain, undulating throughout. Measures closer to 43 km than 42.2.</td></tr>
                <tr><td className="k">2025 field</td><td>Median finish 13:19. Fastest 10% finished in 11:22 — sub-10 would be top 2–3%.</td></tr>
              </tbody>
            </table>
          </div>
          <p className="xs" style={{ marginTop: 10 }}>
            The 2027 date is not published. 25 July is a planning anchor set to the earliest
            plausible date. 2025 ran on 27 July, 2026 on 16 August.
          </p>
        </div>

        <div className="card">
          <h2>Your zones</h2>
          <p className="desc">
            {Z.ftp || Z.fiveK || Z.css
              ? 'Set from your tested numbers. Re-test and these move.'
              : 'No tests recorded yet — train by the description and by RPE, which is more accurate than zones built on a guess.'}
          </p>
          <div className="scroll">
            <table>
              <thead><tr><th>Bike</th><th>Power</th><th>Run</th><th>Pace</th></tr></thead>
              <tbody>
                <tr><td className="k">Z2 endurance</td><td>{Z.z2}</td><td className="k">Easy</td><td>{Z.easyRun}</td></tr>
                <tr><td className="k">Z3 tempo</td><td>{Z.z3}</td><td className="k">Steady</td><td>{Z.steadyRun}</td></tr>
                <tr><td className="k">Sweet spot</td><td>{Z.ss}</td><td className="k">Marathon</td><td>{Z.marathonRun}</td></tr>
                <tr><td className="k">Z4 threshold</td><td>{Z.z4}</td><td className="k">Threshold</td><td>{Z.thrRun}</td></tr>
                <tr><td className="k">Z5 VO₂</td><td>{Z.z5}</td><td className="k">Swim CSS</td><td>{Z.cssPace}</td></tr>
                <tr><td className="k">Ironman race power</td><td><b>{Z.imPower}</b></td><td className="k">Swim race pace</td><td>{Z.racePaceSwim}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h2>The 45 weeks</h2>
          <div className="scroll">
            <table>
              <thead><tr><th>Block</th><th>Weeks</th><th>Focus</th></tr></thead>
              <tbody>
                {BLOCKS.map((b) => (
                  <tr key={b.n} style={week >= b.from && week <= b.to ? { background: 'var(--rust-soft)' } : undefined}>
                    <td className="k">{b.n} — {b.name}</td>
                    <td>{b.from}–{b.to}</td>
                    <td className="muted small">{b.focus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="xs" style={{ marginTop: 10 }}>
            Recovery weeks: {[...DELOADS].join(', ')}. Three weeks of progressive load, one at
            about 62%.
          </p>
        </div>

        <div className="card">
          <h2>The three gates</h2>
          <p className="desc">
            Rather than re-litigating the target every week, it gets decided at three fixed points.
          </p>
          {Object.entries(GATES).map(([w, g]) => (
            <div key={w} style={{ borderLeft: '2px solid var(--ink)', paddingLeft: 12, marginBottom: 14 }}>
              <b>{g.title} · Week {w}</b>
              <p className="small muted" style={{ margin: '3px 0 0' }}>{g.test}</p>
            </div>
          ))}
          <p className="xs">
            They run both ways. Arrive at Gate 1 with an FTP above 275 W and a 5 km under 19:30
            and the build comes forward, the model gets recalculated toward 9:45, and Bolton
            becomes a performance objective rather than a benchmark.
          </p>
        </div>

        <div className="card">
          <h2>Fuelling</h2>
          <div className="scroll">
            <table>
              <thead><tr><th>Duration</th><th>Carbs</th><th>Fluid &amp; sodium</th></tr></thead>
              <tbody>
                <tr><td className="k">Under 60 min</td><td>None needed</td><td>Water to thirst</td></tr>
                <tr><td className="k">60–90 min</td><td>30–40 g/h</td><td>500 ml/h</td></tr>
                <tr><td className="k">90 min – 3 h</td><td>60 g/h</td><td>500–750 ml/h · 500 mg sodium</td></tr>
                <tr><td className="k">Over 3 h</td><td><b>80–100 g/h</b></td><td>750 ml/h · 700 mg sodium</td></tr>
                <tr><td className="k">Recovery</td><td>1.0–1.2 g/kg + 25–30 g protein</td><td>150% of fluid lost</td></tr>
              </tbody>
            </table>
          </div>
          <p className="xs" style={{ marginTop: 10 }}>
            At 68 kg and around 10% body fat there is nothing to lose — the route to 4.4 W/kg runs
            entirely through the numerator. <b>Never run a deficit in Build or Peak.</b> Below
            66 kg, eat more and flag it.
          </p>
        </div>

        <div className="card">
          <h2>When to stop</h2>
          <p className="desc">This is not a medical tool and does not try to be one.</p>
          <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
            <li><b>Any systemic symptom</b> — fever, chest involvement, body aches, swollen glands — stop training completely. Do not train through a viral illness.</li>
            <li><b>Pain that changes how you move</b> — gait, stroke or pedal action — that discipline stops for the day.</li>
            <li><b>Three consecutive days</b> of the same complaint — stop the aggravating activity and get it assessed. Do not wait and see.</li>
            <li><b>Sharp, localised bone pain</b>, especially shin, foot or hip — stop running and seek medical assessment. Do not run again until cleared.</li>
            <li><b>Chest pain, unusual breathlessness, palpitations or fainting</b> — stop and seek medical attention.</li>
          </ul>
          <p className="xs" style={{ marginTop: 10 }}>
            When in doubt the answer is always to stop and ask someone qualified. A stress
            fracture in March ends this project; there is no adaptation that recovers from it.
          </p>
        </div>

        {/* =================== race-day fuelling =================== */}
        <div className="card">
          <h2>Race-day fuelling</h2>
          <p className="desc">
            Built from the carbohydrate rate you have actually rehearsed, not from a magazine number. Nothing on this
            page should be new to you by July — every line of it gets practised on a long ride first.
          </p>

          <h3 style={{ marginTop: 14 }}>The day before</h3>
          <ul className="small" style={{ paddingLeft: 18 }}>
            {race.dayBefore.map((x, i) => <li key={i} style={{ marginBottom: 5 }}>{x}</li>)}
          </ul>

          <h3 style={{ marginTop: 14 }}>Race morning</h3>
          <ul className="small" style={{ paddingLeft: 18 }}>
            {race.preRace.map((x, i) => <li key={i} style={{ marginBottom: 5 }}>{x}</li>)}
          </ul>

          <div className="scroll" style={{ marginTop: 14 }}>
            <table>
              <thead><tr><th>Leg</th><th>Carbs/h</th><th>Fluid/h</th><th>Sodium/h</th></tr></thead>
              <tbody>
                <tr><td className="k">Swim</td><td colSpan={3} className="muted small">{race.swim}</td></tr>
                <tr>
                  <td className="k">Bike</td>
                  <td className="num">{race.bike.carbPerHour} g</td>
                  <td className="num">{race.bike.fluidPerHour} ml</td>
                  <td className="num">{race.bike.sodiumPerHour} mg</td>
                </tr>
                <tr>
                  <td className="k">Run</td>
                  <td className="num">{race.run.carbPerHour} g</td>
                  <td className="num">{race.run.fluidPerHour} ml</td>
                  <td className="num">{race.run.sodiumPerHour} mg</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="small" style={{ marginTop: 10 }}>{race.bike.detail}</p>
          <p className="small" style={{ marginBottom: 0 }}>{race.run.detail}</p>
        </div>

        {/* ===================== the evidence ====================== */}
        <div className="card">
          <h2>What the nutrition engine believes, and why</h2>
          <p className="desc">
            Every rule it applies, with the basis behind it and the date it was last looked at. A recommendation you
            cannot interrogate is an instruction, and this plan is long enough that some of these will need revisiting.
          </p>
          <div className="scroll">
            <table>
              <thead><tr><th>It assumes</th><th>Because</th><th>Strength</th></tr></thead>
              <tbody>
                {EVIDENCE.map((e) => (
                  <tr key={e.key}>
                    <td className="k">{e.statement}</td>
                    <td className="small muted">{e.basis}</td>
                    <td className="xs">{e.strength}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="xs" style={{ marginTop: 10, marginBottom: 0 }}>
            One study does not move any of these. A systematic review or a change of consensus position does, and when
            it happens the old line stays visible with what replaced it — so you can see what changed rather than
            waking up to different numbers.
          </p>
        </div>

        <div className="card">
          <h2>Elsewhere</h2>
          <p className="row" style={{ marginBottom: 0 }}>
            <Link className="btn ghost" href="/progress">Progress &amp; tests</Link>
            <Link className="btn ghost" href="/fuel/week">Nutrition week</Link>
            <Link className="btn ghost" href="/checkin">Daily check-in</Link>
            <Link className="btn ghost" href="/settings">Settings</Link>
          </p>
        </div>

      </div>
      <Nav active="/reference" />
    </>
  );
}
