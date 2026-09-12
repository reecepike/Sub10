import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { sql } from '@/lib/db';
import { FOODS, setPriceOverrides, allFoods, pricePer100Kcal, pricePerProtein, PRICE_CHECKED } from '@/lib/nutrition';
import { saveFoodAction } from '../../actions';
import Nav from '../../_components/Nav';
import FuelTabs from '../_FuelTabs';

export const dynamic = 'force-dynamic';

export default async function Foods({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  if (!(await currentUser())) redirect('/login');
  const params = await searchParams;

  const rows = await sql<{ key: string; pack_g: string; pack_price: string; verified: boolean; price_checked: string | null }[]>`
    select key, pack_g, pack_price, verified, price_checked from foods`;
  const map: Record<string, { packG: number; packPrice: number; verified: boolean }> = {};
  for (const r of rows) map[r.key] = { packG: Number(r.pack_g), packPrice: Number(r.pack_price), verified: r.verified };
  setPriceOverrides(map);

  const foods = allFoods();
  const unverified = foods.filter((f) => !f.verified).length;

  const byCategory = new Map<string, typeof foods>();
  for (const f of foods) {
    const list = byCategory.get(f.category) ?? [];
    list.push(f);
    byCategory.set(f.category, list);
  }

  return (
    <>
      <div className="wrap">
        <header className="mast">
          <div>
            <h1>Prices</h1>
            <div className="xs">{FOODS.length} products · {unverified} still estimates</div>
          </div>
        </header>

        <FuelTabs active="/fuel/foods" />

        {params.saved && <p className="ok small" style={{ marginBottom: 12 }}>Saved. Every total that uses it has changed.</p>}

        <div className="note">
          <b>This page is the one thing the app cannot work out for itself.</b> Prices marked as estimates are my best
          guess at the right region, not a checked listing — the ones marked confirmed were taken from Aldi&rsquo;s own
          listings in {PRICE_CHECKED.slice(0, 7)}. Correct one while you are standing in the aisle and every shopping
          total, cost-per-protein figure and cheaper-alternative suggestion updates with it.
        </div>

        <div className="note neutral">
          Macros are not editable, and deliberately so. A chicken breast is 24 g of protein per 100 g this year and next
          year; the price is what moves.
        </div>

        {[...byCategory.entries()].map(([cat, list]) => (
          <div className="card" key={cat}>
            <h2 style={{ textTransform: 'capitalize' }}>{cat}</h2>
            {list.map((f) => (
              <form action={saveFoodAction} key={f.key} className="row" style={{ alignItems: 'flex-end', marginBottom: 14 }}>
                <input type="hidden" name="key" value={f.key} />
                <input type="hidden" name="name" value={f.name} />
                <input type="hidden" name="aldi_product" value={f.aldi} />
                <input type="hidden" name="category" value={f.category} />
                <input type="hidden" name="roles" value={f.roles.join(',')} />
                <input type="hidden" name="kcal_100" value={f.kcal} />
                <input type="hidden" name="protein_100" value={f.p} />
                <input type="hidden" name="carb_100" value={f.c} />
                <input type="hidden" name="fat_100" value={f.f} />
                <input type="hidden" name="fibre_100" value={f.fibre} />
                <input type="hidden" name="sodium_100" value={f.sodium} />

                <span style={{ flex: '2 1 220px' }}>
                  <b style={{ fontSize: 14 }}>{f.name}</b>
                  {!f.verified && <span className="chip plain" style={{ marginLeft: 6 }}>estimate</span>}
                  {f.verified && <span className="chip green" style={{ marginLeft: 6 }}>confirmed</span>}
                  <div className="xs">{f.aldi}</div>
                  <div className="xs">
                    {f.kcal} kcal · {f.p} g protein per 100 g
                    {Number.isFinite(pricePer100Kcal(f)) && ` · £${pricePer100Kcal(f).toFixed(2)} per 1,000 kcal`}
                    {f.p > 0 && Number.isFinite(pricePerProtein(f)) && ` · £${pricePerProtein(f).toFixed(2)} per 10 g protein`}
                  </div>
                </span>
                <label className="f" style={{ flex: '0 1 100px', marginBottom: 0 }}>
                  <span className="lab">Pack g/ml</span>
                  <input type="number" step="any" name="pack_g" defaultValue={f.packG} inputMode="numeric" />
                </label>
                <label className="f" style={{ flex: '0 1 100px', marginBottom: 0 }}>
                  <span className="lab">Price £</span>
                  <input type="number" step="any" name="pack_price" defaultValue={f.packPrice} inputMode="decimal" />
                </label>
                <button className="ghost small" type="submit" style={{ flex: '0 0 auto' }}>Save</button>
              </form>
            ))}
          </div>
        ))}
      </div>
      <Nav active="/fuel" />
    </>
  );
}
