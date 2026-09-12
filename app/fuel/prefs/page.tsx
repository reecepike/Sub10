import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { foodPrefs, mealPrefs, restrictions } from '@/lib/db';
import { prefsFrom, MEALS, food, substituteFor } from '@/lib/nutrition';
import { addPrefAction, deletePrefAction, addRestrictionAction, deleteRestrictionAction } from '../../actions';
import Nav from '../../_components/Nav';
import FuelTabs from '../_FuelTabs';

export const dynamic = 'force-dynamic';

const STANCE_LABEL: Record<string, string> = {
  like: 'Like it', dislike: 'Rather not', never: 'Never again', gi_problem: 'Upsets me',
};

export default async function Prefs({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; unmatched?: string }>;
}) {
  if (!(await currentUser())) redirect('/login');
  const params = await searchParams;

  const [fp, mp, rs] = await Promise.all([foodPrefs(), mealPrefs(), restrictions()]);
  const prefs = prefsFrom(fp, mp, rs);

  const swaps = [...prefs.substitutions.values()];

  return (
    <>
      <div className="wrap">
        <header className="mast">
          <div>
            <h1>Food I like</h1>
            <div className="xs">{fp.length + mp.length} preferences · {rs.length} allergies or intolerances</div>
          </div>
        </header>

        <FuelTabs active="/fuel/prefs" />

        {params.ok && <p className="ok small" style={{ marginBottom: 12 }}>Saved. The plan has already changed.</p>}
        {params.unmatched && (
          <p className="err" style={{ marginBottom: 12 }}>
            Saved, but I could not match that to anything in the plan. Try naming the food on its own — &ldquo;Greek
            yoghurt&rdquo;, &ldquo;tuna&rdquo;, &ldquo;chicken curry&rdquo;.
          </p>
        )}

        <form action={addPrefAction} className="card">
          <h2>Tell it what you think</h2>
          <p className="desc">
            Say it however you like. It works out what the food was doing in the plan — protein, calcium, fast
            carbohydrate, whatever it was — and finds the cheapest thing that does the same job. You do not have to
            suggest a replacement.
          </p>
          <label className="f">
            <span className="lab">In your own words</span>
            <input type="text" name="raw" required placeholder="I don't like Greek yoghurt" />
          </label>
          <label className="f">
            <span className="lab">How strongly (leave on auto if you are not sure)</span>
            <select name="stance" defaultValue="">
              <option value="">Work it out from what I wrote</option>
              <option value="dislike">Rather not eat it</option>
              <option value="never">Never again</option>
              <option value="gi_problem">It upsets my stomach</option>
              <option value="like">I like it — more of this</option>
            </select>
          </label>
          <button className="wide" type="submit">Save</button>
        </form>

        {swaps.length > 0 && (
          <div className="card">
            <h2>What it swapped in</h2>
            <div className="scroll">
              <table>
                <thead><tr><th>Out</th><th>In</th><th>Cost</th></tr></thead>
                <tbody>
                  {swaps.map((s, i) => (
                    <tr key={i}>
                      <td className="k">{s.fromName}</td>
                      <td>{s.toName}<div className="xs">{s.why}</div></td>
                      <td className="num">{s.costDelta <= 0 ? '−' : '+'}£{Math.abs(s.costDelta).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="xs" style={{ marginTop: 10, marginBottom: 0 }}>
              Cost is per 100 g. Tinned beans are deliberately held back as a replacement — they are cheap, and a diet
              can drown in them.
            </p>
          </div>
        )}

        {fp.length > 0 && (
          <div className="card">
            <h2>Foods</h2>
            {fp.map((p) => {
              const sub = p.food_key ? substituteFor(p.food_key, prefs.blocked) : null;
              let name = p.food_key;
              try { name = p.food_key ? food(p.food_key).name : p.raw; } catch { /* unknown key */ }
              return (
                <div className="sesh" key={p.id}>
                  <div className="sesh-h">
                    <span className={`chip ${p.stance === 'like' ? 'green' : p.stance === 'never' ? 'red' : 'amber'}`}>
                      {STANCE_LABEL[p.stance] ?? p.stance}
                    </span>
                    <b>{name}</b>
                  </div>
                  <div className="sesh-b">
                    <div className="xs" style={{ marginBottom: 8 }}>&ldquo;{p.raw}&rdquo;</div>
                    {p.stance !== 'like' && sub && <div className="why">Now using {sub.toName} instead.</div>}
                    <form action={deletePrefAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <button className="ghost small" type="submit">Remove</button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {mp.length > 0 && (
          <div className="card">
            <h2>Meals</h2>
            {mp.map((m) => (
              <div className="sesh" key={m.meal_key}>
                <div className="sesh-h">
                  <span className={`chip ${m.stance === 'like' ? 'green' : 'amber'}`}>{STANCE_LABEL[m.stance]}</span>
                  <b>{MEALS.find((x) => x.key === m.meal_key)?.name ?? m.meal_key}</b>
                </div>
                <div className="sesh-b">
                  {m.note && <div className="xs" style={{ marginBottom: 8 }}>&ldquo;{m.note}&rdquo;</div>}
                  {m.stance === 'dislike' && <div className="why">Dropped from the rotation entirely.</div>}
                  <form action={deletePrefAction}>
                    <input type="hidden" name="meal_key" value={m.meal_key} />
                    <button className="ghost small" type="submit">Remove</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ------------------------------------------------- restrictions */}
        <form action={addRestrictionAction} className="card">
          <h2>Allergies and intolerances</h2>
          <p className="desc">
            These are absolute. Anything listed here is removed from every meal and every shopping list immediately,
            and it is never suggested as a replacement.
          </p>
          <div className="grid2">
            <label className="f">
              <span className="lab">What</span>
              <input type="text" name="name" required placeholder="peanuts" />
            </label>
            <label className="f">
              <span className="lab">Kind</span>
              <select name="kind" defaultValue="allergy">
                <option value="allergy">Allergy</option>
                <option value="intolerance">Intolerance</option>
                <option value="avoid">Just avoid it</option>
              </select>
            </label>
          </div>
          <button type="submit">Add</button>
        </form>

        {rs.length > 0 && (
          <div className="card">
            <h2>Currently excluded</h2>
            <div className="scroll">
              <table>
                <thead><tr><th>What</th><th>Kind</th><th /></tr></thead>
                <tbody>
                  {rs.map((r) => (
                    <tr key={r.id}>
                      <td className="k">{r.name}</td>
                      <td className="muted">{r.kind}</td>
                      <td>
                        <form action={deleteRestrictionAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <button className="ghost small" type="submit">Remove</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="xs" style={{ marginTop: 10, marginBottom: 0 }}>
              {prefs.blocked.size} individual products are currently excluded as a result.
            </p>
          </div>
        )}
      </div>
      <Nav active="/fuel" />
    </>
  );
}
