import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { weekNutrition } from '@/lib/nutrition/server';
import { labelFor } from '@/lib/plan';
import Nav from '../../_components/Nav';
import FuelTabs from '../_FuelTabs';

export const dynamic = 'force-dynamic';

export default async function Prep({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  if (!(await currentUser())) redirect('/login');
  const params = await searchParams;
  const w = await weekNutrition(params.w);
  const P = w.prep;

  return (
    <>
      <div className="wrap">
        <header className="mast">
          <div>
            <h1>Meal prep</h1>
            <div className="xs">
              Week of {labelFor(w.weekStart)} · {P.days.reduce((a, d) => a + d.totalMin, 0)} min of cooking, total
            </div>
          </div>
        </header>

        <FuelTabs active="/fuel/prep" />

        <div className="note">
          <b>The rule that shapes all of this:</b> cook a lot, refrigerate two days of it, freeze the rest the same
          evening. Seven days of cooked food in the fridge is not meal prep, it is a bet.
        </div>

        {P.days.map((d) => (
          <div className="card" key={d.day}>
            <h2>{d.title}</h2>
            <p className="desc">{labelFor(d.day)} · about {d.totalMin} minutes with things overlapping</p>

            <div className="note neutral">
              <b>Order of play.</b>
              <ol className="small" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {d.order.map((o, i) => <li key={i} style={{ marginBottom: 4 }}>{o}</li>)}
              </ol>
            </div>

            {d.batches.map((b) => (
              <div className="sesh" key={b.mealKey}>
                <div className="sesh-h">
                  <span className="slot">{b.portions} portions</span>
                  <b>{b.meal}</b>
                  <span className="mins num">{b.prepMin} min</span>
                </div>
                <div className="sesh-b">
                  <div className="scroll" style={{ marginBottom: 10 }}>
                    <table>
                      <thead><tr><th>Cook this much</th><th>Amount</th></tr></thead>
                      <tbody>
                        {b.quantities.map((q, i) => (
                          <tr key={i}><td className="k">{q.name}</td><td className="num">{q.display}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="small" style={{ marginBottom: 6 }}><b>Method.</b> {b.method}</p>
                  <p className="small" style={{ marginBottom: 6 }}><b>Storage.</b> {b.storage}</p>
                  <p className="small" style={{ marginBottom: 6 }}><b>Reheating.</b> {b.reheat}</p>
                  <div className="xs">Covers: {b.servesDays.join(', ')}</div>
                </div>
              </div>
            ))}
          </div>
        ))}

        {P.moves.length > 0 && (
          <div className="card">
            <h2>Freezer to fridge</h2>
            <p className="desc">Set these as phone reminders once and never think about it again.</p>
            <div className="scroll">
              <table>
                <thead><tr><th>Evening</th><th>Do this</th></tr></thead>
                <tbody>
                  {P.moves.map((m, i) => (
                    <tr key={i}><td className="k mono xs">{labelFor(m.on)}</td><td>{m.what}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {P.freshDays.length > 0 && (
          <div className="card">
            <h2>Cooked fresh on the day</h2>
            <p className="desc">Everything the batch does not cover — mostly the twenty-minute dinners.</p>
            <div className="scroll">
              <table>
                <thead><tr><th>Day</th><th>What</th></tr></thead>
                <tbody>
                  {P.freshDays.map((f) => (
                    <tr key={f.day}><td className="k">{f.label}</td><td className="small">{f.what.join(', ')}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="card">
          <h2>Food safety, briefly</h2>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            {P.rules.map((r, i) => <li key={i} style={{ marginBottom: 6 }}>{r}</li>)}
          </ul>
        </div>
      </div>
      <Nav active="/fuel" />
    </>
  );
}
