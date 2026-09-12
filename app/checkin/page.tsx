import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { getSettings, getCheckIn, recentCheckIns, weightSeries } from '@/lib/db';
import { toIso, labelFor } from '@/lib/plan';
import { saveCheckInAction } from '../actions';
import Nav from '../_components/Nav';

export const dynamic = 'force-dynamic';

function Choice({
  name, label, options, value, help,
}: {
  name: string; label: string; options: string[]; value: string | null; help?: string;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="lab" style={{ marginBottom: 5 }}>{label}</div>
      <div className="scale5" style={{ gap: 6 }}>
        {options.map((o) => (
          <span key={o} style={{ flex: 1, position: 'relative' }}>
            <input type="radio" name={name} id={`${name}-${o}`} value={o} defaultChecked={value === o} />
            <label htmlFor={`${name}-${o}`} style={{ fontSize: 13, textTransform: 'capitalize' }}>{o}</label>
          </span>
        ))}
      </div>
      {help && <div className="xs" style={{ marginTop: 4 }}>{help}</div>}
    </div>
  );
}

export default async function CheckInPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  if (!(await currentUser())) redirect('/login');
  const params = await searchParams;
  const day = params.day ?? toIso(new Date());

  const [s, existing, recent, weights] = await Promise.all([
    getSettings(), getCheckIn(day), recentCheckIns(day, 10), weightSeries(30),
  ]);

  const last7 = weights.slice(-7);
  const avg7 = last7.length ? last7.reduce((a, w) => a + w.weight, 0) / last7.length : null;

  return (
    <>
      <div className="wrap" style={{ maxWidth: 560 }}>
        <header className="mast">
          <div>
            <h1>Check-in</h1>
            <div className="xs">{labelFor(day)} · thirty seconds</div>
          </div>
          {avg7 && (
            <div className="right">
              <div><div className="lab">7-day avg</div><div className="v">{avg7.toFixed(1)}</div></div>
            </div>
          )}
        </header>

        <div className="note neutral">
          Answer these the same careless way every day. A consistent gut answer is worth far more than a considered one,
          because only the trend is used — and a single morning never changes anything on its own.
        </div>

        <form action={saveCheckInAction} className="card">
          <input type="hidden" name="day" value={day} />

          <label className="f">
            <span className="lab">Morning weight (kg) — fasted, after the loo, before anything else</span>
            <input
              type="number" step="any" name="weight_kg" inputMode="decimal"
              defaultValue={existing?.weight_kg ?? ''} placeholder={String(s.weight_kg)}
            />
          </label>

          <Choice name="energy" label="Energy" options={['low', 'normal', 'high']} value={existing?.energy ?? null} />
          <Choice name="hunger" label="Hunger" options={['low', 'normal', 'high']} value={existing?.hunger ?? null}
            help="Genuinely useful. Persistent high hunger with a flat weight trend is the clearest signal there is that the calorie target is too low." />
          <Choice name="body" label="Legs and body" options={['good', 'normal', 'sore']} value={existing?.body ?? null} />
          <Choice name="session_feel" label="How training felt" options={['poor', 'normal', 'excellent']} value={existing?.session_feel ?? null} />
          <Choice name="training_done" label="Training completed" options={['all', 'most', 'some', 'none']} value={existing?.training_done ?? null} />
          <Choice name="bowel" label="Bowels" options={['none', 'normal', 'loose', 'hard']} value={existing?.bowel ?? null}
            help="Not a delicate question — it is the fastest read on fibre, hydration and whether the training fuel is agreeing with you." />
          <Choice name="digestion" label="Digestion" options={['fine', 'bloated', 'cramping']} value={existing?.digestion ?? null} />

          {s.sleep_mode === 'objective' ? (
            <label className="f">
              <span className="lab">Sleep (hours)</span>
              <input type="number" step="any" name="sleep_h" inputMode="decimal" defaultValue={existing?.sleep_h ?? ''} />
            </label>
          ) : (
            <Choice name="sleep_note" label="Sleep" options={['poor', 'average', 'good']} value={existing?.sleep_note ?? null}
              help="Subjective for now. When you have a watch or ring worth trusting, switch this to hours in Settings and the engine uses that instead." />
          )}

          <label className="f">
            <span className="lab">Anything else</span>
            <textarea name="note" defaultValue={existing?.note ?? ''} rows={2} />
          </label>

          <button className="wide" type="submit">{existing ? 'Update' : 'Save'}</button>
        </form>

        {recent.length > 1 && (
          <div className="card" style={{ padding: 0 }}>
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 12 }}>Day</th><th>Weight</th><th>Energy</th>
                    <th>Hunger</th><th>Bowels</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((c) => (
                    <tr key={c.day}>
                      <td className="k" style={{ paddingLeft: 12 }}>{labelFor(c.day)}</td>
                      <td className="num">{c.weight_kg ?? '—'}</td>
                      <td className="muted">{c.energy ?? '—'}</td>
                      <td className="muted">{c.hunger ?? '—'}</td>
                      <td className="muted">{c.bowel ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <Nav active="/fuel" />
    </>
  );
}
