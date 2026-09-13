import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { weekNutrition } from '@/lib/nutrition/server';
import { savedShoppingList } from '@/lib/db';
import { labelFor, addDays } from '@/lib/plan';
import { saveActualSpendAction } from '../../actions';
import Nav from '../../_components/Nav';
import FuelTabs from '../_FuelTabs';

export const dynamic = 'force-dynamic';

export default async function Shopping({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; saved?: string }>;
}) {
  if (!(await currentUser())) redirect('/login');
  const params = await searchParams;

  const w = await weekNutrition(params.w);
  const saved = await savedShoppingList(w.weekStart);
  const S = w.shopping;
  const H = w.houseShopping;
  const till = H.reduce((a, h) => a + h.total, 0);
  const eaten = H.reduce((a, h) => a + h.ongoing, 0);
  const budget = 60;

  return (
    <>
      <div className="wrap">
        <header className="mast">
          <div>
            <h1>Shopping</h1>
            <div className="xs">
              Aldi · {labelFor(w.weekStart)} – {labelFor(addDays(w.weekStart, 6))} · two kitchens,
              two trolleys
            </div>
          </div>
          <div className="right">
            <div><div className="lab">At the till</div><div className="v">£{till.toFixed(2)}</div></div>
            <div><div className="lab">Eaten this week</div><div className="v">£{eaten.toFixed(2)}</div></div>
          </div>
        </header>

        <FuelTabs active="/fuel/shopping" />

        {params.saved && <p className="ok small" style={{ marginBottom: 12 }}>Saved.</p>}

        <div className="note neutral">
          <b>Two lists, because there are two kitchens.</b> Nothing here assumes food travels between them: each
          list buys what that house has to cook and eat while you are in it, staples included. That is why rice
          and oil appear on both — one bag in each house, not one bag carried back and forth.
          <br /><br />
          <b>Till £{till.toFixed(2)}, eaten £{eaten.toFixed(2)}.</b> The two differ because a 1 kg bag of rice
          costs 52p and lasts a month. The till figure is what you hand over this week; the eaten figure is what
          this week&rsquo;s food actually consumed, and it is the one to compare against the £{budget} budget —
          {eaten <= budget
            ? ` this week is inside it.`
            : ` this week is £${(eaten - budget).toFixed(2)} over, which at this training volume is honest rather than wasteful: ${Math.round(w.totals.kcal / 7).toLocaleString()} kcal a day has to come from somewhere.`}
        </div>


        {/* -------------------------------------------------- one list per house */}
        {H.map((h) => (
          <div className="card" key={h.house} style={{ padding: 0 }}>
            <div style={{ padding: '16px 16px 0' }}>
              <h2>{h.houseName}</h2>
              <p className="desc">
                Shop for this on or before {h.shopLabel} — it is the cook day for this stay. {h.lines.length} lines,
                £{h.total.toFixed(2)} at the till, £{h.ongoing.toFixed(2)} of it eaten this week.
              </p>
            </div>
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 12 }}>Buy</th>
                    <th>Aldi product</th>
                    <th>Need</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {h.lines.map((l) => (
                    <tr key={l.foodKey}>
                      <td className="k num" style={{ paddingLeft: 12, whiteSpace: 'nowrap' }}>
                        {l.packs} ×
                      </td>
                      <td>
                        <b style={{ fontWeight: 600 }}>{l.aldi}</b>
                        <div className="xs">{l.packNoun} · for {l.forWhat.join(', ')}</div>
                        {l.leftoverNote && <div className="why">{l.leftoverNote}</div>}
                      </td>
                      <td className="num muted">
                        {l.neededG >= 1000 ? `${(l.neededG / 1000).toFixed(1)} kg` : `${l.neededG} g`}
                      </td>
                      <td className="num">£{l.cost.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ paddingLeft: 12 }} className="k">Total</td>
                    <td className="muted small">Trolley, before offers</td>
                    <td />
                    <td className="num k">£{h.total.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}

        <details className="card">
          <summary className="lab" style={{ cursor: 'pointer' }}>
            The combined list, if you are doing one shop for both
          </summary>
          <div style={{ marginTop: 12 }} />

        <div style={{ padding: 0 }}>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th style={{ paddingLeft: 12 }}>Buy</th>
                  <th>Aldi product</th>
                  <th>Need</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {S.items.map((it) => (
                  <tr key={it.foodKey}>
                    <td className="k num" style={{ paddingLeft: 12, whiteSpace: 'nowrap' }}>
                      {it.packs} ×
                    </td>
                    <td>
                      <b style={{ fontWeight: 600 }}>{it.aldi}</b>
                      {!it.verified && <span className="chip plain" style={{ marginLeft: 6 }}>est. price</span>}
                      <div className="xs">For: {it.usedIn.join(', ')}</div>
                      {it.leftoverNote && <div className="why">{it.leftoverNote}</div>}
                    </td>
                    <td className="num muted">{it.neededG >= 1000 ? `${(it.neededG / 1000).toFixed(1)} kg` : `${it.neededG} g`}</td>
                    <td className="num">£{it.cost.toFixed(2)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ paddingLeft: 12 }} className="k">Total</td>
                  <td className="muted small">Trolley, before offers</td>
                  <td />
                  <td className="num k">£{S.total.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        </details>

        {S.savings.length > 0 && (
          <div className="card">
            <h2>Cheaper, same job</h2>
            <p className="desc">
              Only swaps that keep the nutrition and the meal intact. Tell the Food page you are happy with one and it
              goes into the plan.
            </p>
            <div className="scroll">
              <table>
                <thead><tr><th>Swap</th><th>Saves</th></tr></thead>
                <tbody>
                  {S.savings.map((sv, i) => (
                    <tr key={i}>
                      <td className="k">{sv.from} → {sv.to}<div className="xs" style={{ fontWeight: 400 }}>{sv.why}</div></td>
                      <td className="num">£{sv.saves.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <form action={saveActualSpendAction} className="card">
          <h2>What it actually cost</h2>
          <p className="desc">
            Worth logging once or twice. If the estimate is consistently out, the prices need correcting rather than
            the plan.
          </p>
          <input type="hidden" name="week_start" value={w.weekStart} />
          <label className="f">
            <span className="lab">Till total (£)</span>
            <input type="number" step="any" name="actual_gbp" defaultValue={saved?.actual_gbp ?? ''} inputMode="decimal" />
          </label>
          <button type="submit">Save</button>
          {saved?.actual_gbp != null && (
            <p className="xs" style={{ marginTop: 10, marginBottom: 0 }}>
              Estimated £{S.total.toFixed(2)}, actual £{Number(saved.actual_gbp).toFixed(2)} —{' '}
              {Math.abs(Number(saved.actual_gbp) - S.total) < 4
                ? 'close enough to trust.'
                : 'far enough out to be worth correcting a few prices on the Prices page.'}
            </p>
          )}
        </form>
      </div>
      <Nav active="/fuel" />
    </>
  );
}
