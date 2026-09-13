import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { weekNutrition } from '@/lib/nutrition/server';
import { labelFor } from '@/lib/plan';
import { plural } from '@/lib/nutrition';
import Nav from '../../_components/Nav';
import FuelTabs from '../_FuelTabs';

export const dynamic = 'force-dynamic';

/**
 * The kitchen.
 *
 * Two houses, three cooks a week, and every portion accounted for from the pan
 * to the container to the day it gets eaten. The organising idea is that the
 * reader never does arithmetic: every quantity on this page is the quantity for
 * that batch, raw and cooked are both stated wherever they differ, and each
 * container is told which day it belongs to before it goes in the fridge.
 */
export default async function Prep({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  if (!(await currentUser())) redirect('/login');
  const params = await searchParams;
  const w = await weekNutrition(params.w);
  const K = w.kitchen;

  const totalMin = K.prepSessions.reduce((a, p) => a + p.totalMin, 0);
  const totalPortions = K.batches.reduce((a, b) => a + b.portions, 0);

  return (
    <>
      <div className="wrap">
        <header className="mast">
          <div>
            <h1>The kitchen</h1>
            <div className="xs">
              Week of {labelFor(w.weekStart)} · {plural(K.batches.length, 'batch', 'batches')} ·{' '}
              {plural(totalPortions, 'portion')} · {totalMin} min of cooking across two houses
            </div>
          </div>
        </header>

        <FuelTabs active="/fuel/prep" />

        {/* ------------------------------------------------------ the cycle */}
        <div className="card">
          <h2>Where you are, and when</h2>
          <p className="desc">
            Food does not move between houses. Everything below is built around that one fact.
          </p>
          {K.segments.map((s, i) => (
            <div className="sesh" key={i}>
              <div className="sesh-h">
                <span className="slot">{s.prepLabel} cook</span>
                <b>{s.name}</b>
                <span className="mins num" style={{ fontSize: 13 }}>
                  {labelFor(s.fromDay)} {s.fromAt} → {labelFor(s.toDay)} {s.toAt}
                </span>
              </div>
              <div className="sesh-b">
                <p className="small" style={{ margin: 0 }}>{s.description}</p>
              </div>
            </div>
          ))}
          <ul className="small" style={{ margin: '12px 0 0', paddingLeft: 18 }}>
            {w.houseRules.map((r, i) => <li key={i} style={{ marginBottom: 6 }}>{r}</li>)}
          </ul>
        </div>

        {K.warnings.map((x, i) => <div key={i} className="note">{x}</div>)}

        {/* --------------------------------------------------- the cook days */}
        {K.prepSessions.map((p) => {
          const mine = K.batches.filter((b) => p.batchIds.includes(b.id));
          return (
            <div className="card" key={`${p.day}-${p.house}`}>
              <h2>{p.title}</h2>
              <p className="desc">
                {p.label} · about {p.totalMin} minutes with things overlapping ·{' '}
                {plural(mine.reduce((a, b) => a + b.portions, 0), 'portion')} out the other end
              </p>

              <div className="note neutral">
                <b>Order of play.</b>
                <ol className="small" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                  {p.order.map((o, i) => <li key={i} style={{ marginBottom: 4 }}>{o}</li>)}
                </ol>
              </div>

              {mine.map((b) => (
                <div className="sesh" key={b.id}>
                  <div className="sesh-h">
                    <span className="slot">{plural(b.portions, 'portion')}</span>
                    <b>{b.name}</b>
                    <span className="mins num">{b.prepMin} min</span>
                  </div>
                  <div className="sesh-b">
                    <div className="scroll" style={{ marginBottom: 10 }}>
                      <table>
                        <thead>
                          <tr><th>Buy / weigh out</th><th>For the whole batch</th><th>Packs</th></tr>
                        </thead>
                        <tbody>
                          {b.ingredients.map((ing, i) => (
                            <tr key={i}>
                              <td className="k">{ing.name}</td>
                              <td className="num">{ing.display}</td>
                              <td className="xs">{ing.packs} × {ing.packNoun}</td>
                            </tr>
                          ))}
                          <tr>
                            <td className="k"><b>Finished dish</b></td>
                            <td className="num">
                              <b>{b.totalCookedG.toLocaleString()} g cooked</b>
                            </td>
                            <td className="xs">{b.portionCookedG.toLocaleString()} g a portion</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <p className="lab" style={{ marginBottom: 6 }}>Method</p>
                    <ol className="small" style={{ margin: '0 0 12px', paddingLeft: 18 }}>
                      {b.steps.map((st, i) => <li key={i} style={{ marginBottom: 5 }}>{st}</li>)}
                    </ol>

                    <p className="lab" style={{ marginBottom: 6 }}>Containers</p>
                    <div className="scroll" style={{ marginBottom: 10 }}>
                      <table>
                        <thead><tr><th>Label it</th><th>Goes in</th><th>For</th></tr></thead>
                        <tbody>
                          {b.containers.map((c) => (
                            <tr key={c.index}>
                              <td className="k">{c.label}</td>
                              <td className={c.store === 'freezer' ? 'num' : 'num muted'}>
                                {c.store === 'freezer' ? 'Freezer, tonight' : 'Fridge'}
                              </td>
                              <td className="xs">{c.forLabel}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <p className="small" style={{ marginBottom: 6 }}><b>Reheating.</b> {b.reheat}</p>
                    <div className="xs">
                      {b.kcalPerPortion.toLocaleString()} kcal · {b.cPerPortion} g carbs · {b.pPerPortion} g protein ·{' '}
                      {b.fPerPortion} g fat a portion · £{(b.cost / b.portions).toFixed(2)} each
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })}

        {/* -------------------------------------------------- freezer moves */}
        {K.moves.length > 0 && (
          <div className="card">
            <h2>Freezer to fridge</h2>
            <p className="desc">
              Set these as phone reminders once and never think about it again. A portion that is still frozen at
              seven o&rsquo;clock is a takeaway.
            </p>
            <div className="scroll">
              <table>
                <thead><tr><th>Evening</th><th>Do this</th></tr></thead>
                <tbody>
                  {K.moves.map((m, i) => (
                    <tr key={i}><td className="k mono xs">{m.label}</td><td className="small">{m.what}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------- cooked fresh */}
        <div className="card">
          <h2>Cooked fresh on the day</h2>
          <p className="desc">
            Everything the batches do not cover — breakfasts, snacks, fuel, and the twenty-minute dinners.
          </p>
          <div className="scroll">
            <table>
              <thead><tr><th>Day</th><th>Kitchen</th><th>What</th></tr></thead>
              <tbody>
                {K.fresh
                  .filter((f) => f.kind === 'breakfast' || f.kind === 'lunch' || f.kind === 'dinner')
                  .map((f, i) => (
                    <tr key={i}>
                      <td className="k">{labelFor(f.day)}</td>
                      <td className="xs">{f.house === 'dad' ? "Dad's" : "Mum's"}</td>
                      <td className="small">{f.title}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h2>Food safety, briefly</h2>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            {w.prep.rules.map((r, i) => <li key={i} style={{ marginBottom: 6 }}>{r}</li>)}
          </ul>
        </div>
      </div>
      <Nav active="/fuel" />
    </>
  );
}
