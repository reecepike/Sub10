import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentUser } from '@/lib/auth';
import { getSettings, sql } from '@/lib/db';
import { project, hms, ms, TARGET, TARGET_TOTAL, REQUIRED } from '@/lib/project';
import { capabilityFrom, requiredRate } from '@/lib/coach';
import { saveTestAction } from '../actions';
import { weekFor } from '@/lib/plan';
import Nav from '../_components/Nav';

export const dynamic = 'force-dynamic';

export default async function Progress() {
  if (!(await currentUser())) redirect('/login');
  const s = await getSettings();
  const today = new Date().toISOString().slice(0, 10);
  const week = Math.max(1, weekFor(s.start_date, today));
  const p = project(capabilityFrom(s));
  const rate = requiredRate(s, today);

  const tests = await sql<{ kind: string; day: string; value: number }[]>`
    select kind, day, value from tests order by day desc limit 40`;

  const baselineDone = s.ftp && s.css_sec && s.five_k_sec;
  const maxSec = Math.max(p.total, TARGET_TOTAL) * 1.04;
  const seg = (v: number) => `${(v / maxSec) * 100}%`;

  const legs = [
    { n: 'Swim', cur: p.swim, req: TARGET.swim, c: 'var(--swim)',
      now: s.css_sec ? `CSS ${ms(s.css_sec)}/100 m` : 'CSS not tested',
      need: `CSS ${ms(REQUIRED.cssSec)}/100 m` },
    { n: 'Bike', cur: p.bike, req: TARGET.bike, c: 'var(--bike)',
      now: s.ftp ? `${s.ftp} W · ${p.ftpPerKg.toFixed(2)} W/kg` : 'FTP not tested',
      need: `${p.requiredFtp} W · ${REQUIRED.ftpPerKg} W/kg` },
    { n: 'Run', cur: p.run, req: TARGET.run, c: 'var(--run)',
      now: s.five_k_sec ? `5 km ${ms(s.five_k_sec)}` : '5 km not tested',
      need: `5 km ${ms(REQUIRED.fiveKSec)}` },
    { n: 'Transitions', cur: p.trans, req: TARGET.t1 + TARGET.t2, c: 'var(--other)',
      now: s.transitions_rehearsed ? 'Rehearsed' : 'Not yet rehearsed', need: '9:00' },
  ];

  const topWeighted = Math.max(0.001, p.limiter[0]?.weighted ?? 0);

  return (
    <>
      <div className="wrap wide">
        <header className="mast">
          <div>
            <h1>Sub-10 tracker</h1>
            <div className="xs">Week {week} of 45 · target 9:55:00, five minutes inside sub-10</div>
          </div>
        </header>

        {!baselineDone && (
          <div className="note">
            <b>Baselines are still estimates.</b> Until the Block 0 tests are in, this page is
            modelling a guess. Enter each result as you do it — Settings, or the test form below.
          </div>
        )}

        <div className="kpis">
          <div className="kpi"><div className="lab">Target</div><div className="v">9:55:00</div>
            <div className="n">Five minutes inside sub-10, and the run course measures long — so the buffer is already committed</div></div>
          <div className="kpi acc"><div className="lab">Projected today</div>
            <div className="v acc">{hms(p.total)}</div>
            <div className="n">If the race were in six weeks</div></div>
          <div className="kpi"><div className="lab">Gap</div>
            <div className="v">{p.gapSec <= 0 ? 'None' : `${Math.round(p.gapSec / 60)} min`}</div>
            <div className="n">{p.gapSec <= 0 ? 'The numbers support sub-10 — confirm it in a brick' : `${rate.toFixed(1)} min per week from here`}</div></div>
          <div className="kpi"><div className="lab">Primary limiter</div>
            <div className="v">{p.limiter[0]?.weighted > 0 ? p.limiter[0].name : '—'}</div>
            <div className="n">Where the hours should go</div></div>
        </div>

        <div className="card">
          <h2>Where the time goes</h2>
          <p className="desc">
            Both bars on one scale. The distance between them is the distance to sub-10.
          </p>
          <div className="lab" style={{ marginBottom: 4 }}>Target — 9:55:00</div>
          <div style={{ display: 'flex', height: 26, marginBottom: 12 }}>
            <div style={{ width: seg(TARGET.swim), background: 'var(--swim)' }} />
            <div style={{ width: seg(TARGET.t1), background: 'var(--other)' }} />
            <div style={{ width: seg(TARGET.bike), background: 'var(--bike)' }} />
            <div style={{ width: seg(TARGET.t2), background: 'var(--other)' }} />
            <div style={{ width: seg(TARGET.run), background: 'var(--run)' }} />
          </div>
          <div className="lab" style={{ marginBottom: 4 }}>Projected — {hms(p.total)}</div>
          <div style={{ display: 'flex', height: 26, opacity: 0.55 }}>
            <div style={{ width: seg(p.swim), background: 'var(--swim)' }} />
            <div style={{ width: seg(p.trans / 2), background: 'var(--other)' }} />
            <div style={{ width: seg(p.bike), background: 'var(--bike)' }} />
            <div style={{ width: seg(p.trans / 2), background: 'var(--other)' }} />
            <div style={{ width: seg(p.run), background: 'var(--run)' }} />
          </div>
          <div className="xs" style={{ marginTop: 10, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span><b style={{ color: 'var(--swim)' }}>■</b> Swim 3.8 km</span>
            <span><b style={{ color: 'var(--bike)' }}>■</b> Bike 180 km · 2,419 m</span>
            <span><b style={{ color: 'var(--run)' }}>■</b> Run 42.2 km</span>
            <span><b style={{ color: 'var(--other)' }}>■</b> Transitions</span>
          </div>
        </div>

        <div className="card">
          <h2>Discipline by discipline</h2>
          <div className="scroll">
            <table>
              <thead><tr><th>Leg</th><th>Required</th><th>Projected</th><th>Gap</th><th>Now</th><th>Needs</th></tr></thead>
              <tbody>
                {legs.map((l) => (
                  <tr key={l.n}>
                    <td className="k" style={{ color: l.c }}>{l.n}</td>
                    <td>{hms(l.req)}</td>
                    <td><b>{hms(l.cur)}</b></td>
                    <td>{l.cur - l.req <= 0 ? '—' : `+${Math.round((l.cur - l.req) / 60)} min`}</td>
                    <td className="muted">{l.now}</td>
                    <td className="muted">{l.need}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h2>Where the training hours should go</h2>
          <p className="desc">
            Minutes to be found × elasticity — how far a marginal training hour moves that
            discipline at this training age. Bike 1.4, swim 1.1, run 0.8, transitions 0.3.
          </p>
          {p.limiter.map((l, i) => (
            <div className={`bar-row${i === 0 && l.weighted > 0 ? ' top' : ''}`} key={l.name}>
              <span className="nm">{l.name}</span>
              <span className="bar-track">
                <i style={{ width: `${Math.max(0, (l.weighted / topWeighted) * 100)}%` }} />
              </span>
              <span className="vv">
                {l.gapSec <= 0 ? '—' : `+${Math.round(l.gapSec / 60)}m × ${l.elasticity}`}
              </span>
            </div>
          ))}
        </div>

        <div className="card">
          <h2>Record a test result</h2>
          <p className="desc">
            Every result here immediately changes the prescriptions on the Week page. That is the
            whole point of testing — not the number, the decision it feeds.
          </p>
          <TestForm />
        </div>

        {tests.length > 0 && (
          <div className="card">
            <h2>Test history</h2>
            <div className="scroll">
              <table>
                <thead><tr><th>Date</th><th>Test</th><th>Result</th></tr></thead>
                <tbody>
                  {tests.map((t, i) => (
                    <tr key={i}>
                      <td>{t.day}</td>
                      <td className="k">{TEST_LABEL[t.kind] ?? t.kind}</td>
                      <td>{t.kind === 'css' || t.kind === 'five_k' ? ms(Number(t.value)) : Number(t.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="xs">
          The bike model solves for time from a physical power model at your weight, with a 10%
          penalty for the Leeds profile; sustainable intensity rises with FTP, because an
          untrained cyclist cannot hold race intensity for five and a half hours. Run comes from a
          Riegel projection off 5 km with an Ironman penalty that grows with how long the bike
          took. <Link href="/settings" style={{ textDecoration: 'underline' }}>Settings</Link>.
        </p>
      </div>
      <Nav active="/progress" />
    </>
  );
}

const TEST_LABEL: Record<string, string> = {
  ftp: 'FTP (W)', css: 'CSS /100 m', five_k: '5 km', bench: 'Bench 5RM (kg)',
  thirty_min: '30 min swim (m)', drift: 'HR drift (%)',
};

function TestForm() {
  return (
    <form action={saveTestAction}>
      <div className="grid2">
        <label className="f"><span className="lab">Test</span>
          <select name="kind" id="kind" defaultValue="ftp">
            <option value="ftp">FTP — watts</option>
            <option value="css">CSS — mm:ss per 100 m</option>
            <option value="five_k">5 km — mm:ss</option>
            <option value="bench">Bench 5RM — kg</option>
            <option value="thirty_min">30 min swim — metres</option>
            <option value="drift">HR drift — %</option>
          </select></label>
        <label className="f"><span className="lab">Date</span>
          <input type="date" name="day" id="test_day" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
      </div>
      <label className="f"><span className="lab">Result</span>
        <input type="text" name="value" id="value" placeholder="e.g. 248 or 20:34" required /></label>
      <label className="f"><span className="lab">Conditions</span>
        <input type="text" name="note" id="note" placeholder="Same route, 12°C, light headwind" /></label>
      <button type="submit">Save result</button>
    </form>
  );
}
