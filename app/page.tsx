import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { getSettings, getReadiness, recentReadiness, sessionsOn } from '@/lib/db';
import { assess } from '@/lib/readiness';
import { adapt } from '@/lib/adapt';
import { weekPlan, weekFor, blockFor, GATES, DELOADS, labelFor } from '@/lib/plan';
import { statusLine } from '@/lib/coach';
import { dayNutrition } from '@/lib/nutrition/server';
import Nav from './_components/Nav';
import ReadinessForm from './_components/ReadinessForm';

export const dynamic = 'force-dynamic';

const DISC_NAME: Record<string, string> = {
  SW: 'Swim', BK: 'Bike', RN: 'Run', ST: 'Strength', OT: 'Other',
};

export default async function Today({
  searchParams,
}: {
  searchParams: Promise<{ logged?: string; day?: string; edit?: string }>;
}) {
  if (!(await currentUser())) redirect('/login');
  const params = await searchParams;

  const s = await getSettings();
  const day = params.day ?? new Date().toISOString().slice(0, 10);

  const [readiness, history, logged] = await Promise.all([
    getReadiness(day),
    recentReadiness(day, 22),
    sessionsOn(day),
  ]);

  const week = weekFor(s.start_date, day);
  const started = week >= 1 && week <= 45;
  const block = blockFor(Math.min(45, Math.max(1, week)));

  const verdict = readiness
    ? assess(readiness, history.filter((r) => r.day !== day))
    : null;

  const days = started ? weekPlan(week, s) : weekPlan(1, s);
  const dow = ((new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7) + 1;
  const todayPlan = days.find((d) => d.date === day) ?? days[dow - 1];
  const planned = started ? todayPlan?.sessions ?? [] : [];

  const a = adapt(planned, verdict);
  const raceDate = new Date(s.race_date + 'T12:00:00Z');
  const daysToRace = Math.max(0, Math.ceil((raceDate.getTime() - Date.now()) / 86_400_000));
  const gate = GATES[week];

  const loggedKeys = new Set(logged.map((l) => l.plan_key).filter(Boolean));

  // The nutrition engine reads the same plan and the same log this page does,
  // so what it says here can never disagree with the sessions listed below.
  const fuel = await dayNutrition(day);
  const nextFuel = fuel.plan.entries.find((e) => e.kind === 'during') ?? null;

  return (
    <>
      <div className="wrap">
        <header className="mast">
          <div>
            <h1>{labelFor(day)}</h1>
            <div className="xs">
              {started
                ? `Week ${week} of 45 · Block ${block.n} — ${block.name}`
                : week < 1
                  ? `Programme starts ${labelFor(s.start_date)}`
                  : 'Programme complete'}
            </div>
          </div>
          <div className="right">
            <div>
              <div className="lab">To go</div>
              <div className="v">{daysToRace}d</div>
            </div>
          </div>
        </header>

        {params.logged && <p className="ok small" style={{ marginBottom: 12 }}>Session logged.</p>}

        {(!readiness || params.edit) ? (
          <div className="card">
            <h2>{readiness ? 'Edit today\u2019s check-in' : 'Morning check-in'}</h2>
            <p className="desc">
              Sixty seconds. Answer the scores fast and the same careless way every day — a
              consistent gut answer is worth far more than a considered one, because only the
              trend matters.
            </p>
            <ReadinessForm day={day} lastWeight={Number(s.weight_kg)} />
          </div>
        ) : (
          <>
            <div className={`verdict ${verdict!.band}`}>
              <h2>
                {a.headline}{' '}
                <span className={`chip ${verdict!.band}`} style={{ verticalAlign: 'middle' }}>
                  {verdict!.band} · {verdict!.score}
                </span>
              </h2>
              <p>{a.rationale}</p>
              {verdict!.reasons.length > 0 && (
                <ul className="small muted" style={{ margin: '10px 0 0', paddingLeft: 18 }}>
                  {verdict!.reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              )}
            </div>

            {gate && (
              <div className="note">
                <b>{gate.title}</b> — {gate.test}
              </div>
            )}
            {DELOADS.has(week) && !gate && (
              <div className="note neutral">
                <b>Recovery week.</b> Around 62% of normal volume. Intensity is kept, tonnage is
                not — and this is where the adaptation actually lands. Do not top it up because
                you feel good.
              </div>
            )}

            <h2 style={{ marginBottom: 8 }}>Today</h2>

            {!started && week < 1 && (
              <div className="card">
                <p>
                  <b>Training starts {labelFor(s.start_date)}.</b> Until then the check-in is the
                  only thing that matters — every morning you log now builds the baseline the
                  readiness engine scores against, and it needs about a fortnight of data before
                  it can tell a bad night from a real problem.
                </p>
                <p className="small muted" style={{ marginBottom: 0 }}>
                  Worth sorting before week 1: a smart trainer (the single highest-return purchase
                  in this whole plan — the bike is the limiter and without power it is guesswork),
                  a heart-rate strap, pool access that works at 05:45, and running shoes with life
                  in them. Then check your details in Settings.
                </p>
              </div>
            )}

            {started && a.sessions.length === 0 && (
              <div className="card"><p style={{ margin: 0 }} className="muted">
                Nothing scheduled. Rest is a session — take it.
              </p></div>
            )}

            {a.sessions.map((sess) => {
              const done = loggedKeys.has(sess.key);
              const cancelled = sess.minutes === 0 && sess.disc !== 'OT';
              return (
                <div key={sess.key} className={`sesh${done ? ' done' : ''}${cancelled ? ' cancelled' : ''}`}>
                  <div className="sesh-h">
                    <span className="slot">{sess.slot}</span>
                    <span className={`disc d-${sess.disc}`}>{DISC_NAME[sess.disc]}</span>
                    <b>{sess.title}</b>
                    {sess.keySession && !cancelled && <span className="chip key">Key</span>}
                    {done && <span className="chip plain">Logged</span>}
                    <span className="mins num">
                      {sess.originalMinutes && sess.originalMinutes !== sess.minutes && (
                        <s>{sess.originalMinutes}</s>
                      )}
                      {cancelled ? '—' : `${sess.minutes} min`}
                    </span>
                  </div>
                  <div className="sesh-b">
                    {sess.detail}
                    {sess.because && <div className="why">↳ {sess.because}</div>}
                    {!done && !cancelled && sess.disc !== 'OT' && (
                      <div style={{ marginTop: 12 }}>
                        <Link
                          className="btn ghost small"
                          href={`/log?d=${sess.disc}&key=${encodeURIComponent(sess.key)}&t=${encodeURIComponent(sess.title)}&m=${sess.minutes}&day=${day}`}
                        >
                          Log this
                        </Link>
                      </div>
                    )}
                    {!done && sess.disc === 'OT' && sess.minutes > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <Link className="btn ghost small" href={`/log?d=OT&t=${encodeURIComponent(sess.title)}&m=${sess.minutes}&day=${day}`}>
                          Log this
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {logged.length > 0 && (
              <>
                <h2 style={{ margin: '20px 0 8px' }}>Logged today</h2>
                <div className="card" style={{ padding: 0 }}>
                  <div className="scroll">
                    <table>
                      <thead>
                        <tr><th style={{ paddingLeft: 12 }}>Session</th><th>Dur</th><th>RPE</th><th>Notes</th></tr>
                      </thead>
                      <tbody>
                        {logged.map((l) => (
                          <tr key={l.id}>
                            <td className="k" style={{ paddingLeft: 12 }}>
                              {DISC_NAME[l.discipline] ?? l.discipline} — {l.title ?? '—'}
                            </td>
                            <td>{l.duration_min ?? '—'}</td>
                            <td>{l.rpe ?? '—'}</td>
                            <td className="muted small">{l.notes ?? l.niggle ?? ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* ------------------------------------------------------ fuel */}
            <h2 style={{ margin: '20px 0 8px' }}>Fuel today</h2>
            <div className="fuelstrip">
              <div className="b acc">
                <div className="v acc">{fuel.targets.kcal.toLocaleString()}</div>
                <div className="n">kcal</div>
              </div>
              <div className="b">
                <div className="v">{fuel.targets.carb} g</div>
                <div className="n">carbs · {fuel.targets.carbPerKg} g/kg</div>
              </div>
              <div className="b">
                <div className="v">{fuel.targets.protein} g</div>
                <div className="n">protein</div>
              </div>
              <div className="b">
                <div className="v">{(fuel.targets.fluidMl / 1000).toFixed(1)} L</div>
                <div className="n">fluid</div>
              </div>
            </div>

            {nextFuel && (
              <div className="note">
                <b>On the bike or on the run today.</b> {nextFuel.note}
              </div>
            )}

            <div className="card">
              {fuel.plan.entries
                .filter((e) => e.kind === 'breakfast' || e.kind === 'lunch' || e.kind === 'dinner')
                .map((e) => (
                  <div key={e.seq} style={{ display: 'flex', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--rule-2)' }}>
                    <span className="mono xs" style={{ width: 46, flexShrink: 0, paddingTop: 2 }}>{e.at}</span>
                    <span style={{ flex: 1 }}>
                      <b style={{ fontSize: 14 }}>{e.title}</b>
                      <div className="xs">{e.items.map((it) => `${it.name} ${it.display}`).join(' · ')}</div>
                    </span>
                    <span className="num xs" style={{ flexShrink: 0 }}>{e.kcal}</span>
                  </div>
                ))}
              <p style={{ margin: '12px 0 0' }}>
                <Link className="btn ghost small" href="/fuel">The whole day, and the training fuel</Link>
              </p>
            </div>

            <p className="xs" style={{ marginTop: 18 }}>{statusLine(s)}</p>
            <p className="xs">
              <Link href={`/?day=${day}&edit=1`} style={{ textDecoration: 'underline' }}>
                Change today&rsquo;s check-in
              </Link>{' '}
              if you got a number wrong — it overwrites, it does not add a second one.
            </p>
          </>
        )}
      </div>
      <Nav active="/" />
    </>
  );
}
