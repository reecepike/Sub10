import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentUser } from '@/lib/auth';
import { getSettings, sessionsBetween } from '@/lib/db';
import { weekPlan, weekFor, blockFor, weekTotals, eth, GATES, DELOADS, addDays, weekStart } from '@/lib/plan';
import Nav from '../_components/Nav';

export const dynamic = 'force-dynamic';

const DISC_NAME: Record<string, string> = { SW: 'Swim', BK: 'Bike', RN: 'Run', ST: 'Strength', OT: 'Other' };

export default async function WeekPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  if (!(await currentUser())) redirect('/login');
  const params = await searchParams;
  const s = await getSettings();

  const todayIso = new Date().toISOString().slice(0, 10);
  const current = Math.min(45, Math.max(1, weekFor(s.start_date, todayIso)));
  const week = Math.min(45, Math.max(1, Number(params.w) || current));

  const block = blockFor(week);
  const days = weekPlan(week, s);
  const totals = weekTotals(days);
  const load = eth(days);
  const gate = GATES[week];

  const from = weekStart(s.start_date, week);
  const to = addDays(from, 6);
  const logged = await sessionsBetween(from, to);
  const loggedKeys = new Set(logged.map((l) => l.plan_key).filter(Boolean));
  const doneMin = logged.reduce((a, r) => a + (r.duration_min ?? 0), 0);

  const pct = (n: number) => (totals.total ? Math.round((n / totals.total) * 100) : 0);

  return (
    <>
      <div className="wrap wide">
        <header className="mast">
          <div>
            <h1>Week {week}</h1>
            <div className="xs">Block {block.n} — {block.name}</div>
          </div>
          <div className="right">
            <div>
              <div className="lab">Planned</div>
              <div className="v">{(totals.total / 60).toFixed(1)} h</div>
            </div>
            <div>
              <div className="lab">Logged</div>
              <div className="v">{(doneMin / 60).toFixed(1)} h</div>
            </div>
          </div>
        </header>

        <div className="row" style={{ marginBottom: 16 }}>
          {week > 1 && <Link className="btn ghost" href={`/week?w=${week - 1}`}>← Week {week - 1}</Link>}
          {week !== current && <Link className="btn ghost" href="/week">This week</Link>}
          {week < 45 && <Link className="btn ghost" href={`/week?w=${week + 1}`}>Week {week + 1} →</Link>}
        </div>

        {gate && <div className="note"><b>{gate.title}</b> — {gate.test}</div>}
        {DELOADS.has(week) && !gate && (
          <div className="note neutral">
            <b>Recovery week</b> — about 62% of normal volume, intensity retained.
            {week === 15 && ' Christmas falls here, which is why the deload is scheduled where it is.'}
            {week === 39 && ' This week absorbs Bolton.'}
          </div>
        )}

        <div className="kpis">
          <div className="kpi acc"><div className="lab">Equivalent load</div>
            <div className="v acc">{load.toFixed(1)} ETH</div>
            <div className="n">Structured training plus badminton at 0.7×</div></div>
          <div className="kpi"><div className="lab">Swim</div><div className="v">{pct(totals.SW)}%</div>
            <div className="n">{(totals.SW / 60).toFixed(1)} h</div></div>
          <div className="kpi"><div className="lab">Bike</div><div className="v">{pct(totals.BK)}%</div>
            <div className="n">{(totals.BK / 60).toFixed(1)} h</div></div>
          <div className="kpi"><div className="lab">Run</div><div className="v">{pct(totals.RN)}%</div>
            <div className="n">{(totals.RN / 60).toFixed(1)} h</div></div>
          <div className="kpi"><div className="lab">Strength</div><div className="v">{pct(totals.ST)}%</div>
            <div className="n">{(totals.ST / 60).toFixed(1)} h</div></div>
        </div>

        {days.map((d) => (
          <div className="card" key={d.date} style={{ padding: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: 10,
              padding: '10px 14px', borderBottom: '1px solid var(--rule-2)',
              background: d.date === todayIso ? 'var(--rust-soft)' : 'var(--surface-2)',
            }}>
              <b style={{ fontFamily: 'Archivo, sans-serif' }}>{d.label}</b>
              {d.date === todayIso && <span className="chip key">Today</span>}
              <span className="xs" style={{ marginLeft: 'auto' }}>
                {d.sessions.filter((x) => x.disc !== 'OT').reduce((a, x) => a + x.minutes, 0)} min
              </span>
            </div>
            {d.note && <div className="xs" style={{ padding: '8px 14px', background: 'var(--rust-soft)' }}>{d.note}</div>}
            {d.sessions.length === 0 ? (
              <div className="sesh-b muted">Rest. Take it — it is a session.</div>
            ) : (
              d.sessions.map((x) => (
                <div key={x.key} style={{ padding: '10px 14px', borderBottom: '1px solid var(--rule-2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className="slot mono xs">{x.slot}</span>
                    <span className={`disc d-${x.disc}`}>{DISC_NAME[x.disc]}</span>
                    <b style={{ fontSize: 14 }}>{x.title}</b>
                    {x.keySession && <span className="chip key">Key</span>}
                    {loggedKeys.has(x.key) && <span className="chip plain">Logged</span>}
                    <span className="num" style={{ marginLeft: 'auto', fontWeight: 700 }}>
                      {x.minutes ? `${x.minutes} min` : '—'}
                    </span>
                  </div>
                  <div className="small muted" style={{ marginTop: 4 }}>{x.detail}</div>
                </div>
              ))
            )}
          </div>
        ))}

        <p className="xs">
          Durations scale with the loading cycle, and every prescription uses your tested numbers
          where they exist. Update them in Settings and this whole page changes.
        </p>
      </div>
      <Nav active="/week" />
    </>
  );
}
