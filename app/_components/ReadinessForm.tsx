import { saveReadinessAction } from '../actions';

function Scale({
  name, label, hint, low, high, defaultValue,
}: {
  name: string; label: string; hint?: string; low: string; high: string; defaultValue?: number;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="lab" style={{ marginBottom: 5 }}>
        {label} {hint && <span style={{ textTransform: 'none', letterSpacing: 0 }}>· {hint}</span>}
      </div>
      <div className="scale5">
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} style={{ flex: 1, position: 'relative' }}>
            <input
              type="radio" name={name} id={`${name}-${n}`} value={n}
              defaultChecked={defaultValue === n}
            />
            <label htmlFor={`${name}-${n}`}>{n}</label>
          </span>
        ))}
      </div>
      <div className="xs" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span>{low}</span><span>{high}</span>
      </div>
    </div>
  );
}

export default function ReadinessForm({ day, lastWeight }: { day: string; lastWeight: number }) {
  return (
    <form action={saveReadinessAction}>
      <input type="hidden" name="day" value={day} />

      <div className="grid3">
        <label className="f">
          <span className="lab">Sleep (h)</span>
          <input type="number" step="0.25" name="sleep_h" id="sleep_h" inputMode="decimal" />
        </label>
        <label className="f">
          <span className="lab">Resting HR</span>
          <input type="number" name="rhr" id="rhr" inputMode="numeric" />
        </label>
        <label className="f">
          <span className="lab">HRV</span>
          <input type="number" name="hrv" id="hrv" inputMode="numeric" />
        </label>
        <label className="f">
          <span className="lab">Weight (kg)</span>
          <input type="number" step="0.1" name="weight_kg" id="weight_kg" inputMode="decimal"
                 placeholder={String(lastWeight)} />
        </label>
      </div>
      <p className="xs" style={{ marginTop: -4, marginBottom: 16 }}>
        Leave anything you do not have blank. A blank is honest data and the engine handles it;
        a guess is not.
      </p>

      <Scale name="sleep_q" label="Sleep quality" low="1 · terrible" high="5 · excellent" />
      <Scale name="fatigue" label="Fatigue" low="1 · fresh" high="5 · wrecked" />
      <Scale name="soreness" label="Soreness" low="1 · none" high="5 · very sore" />
      <Scale name="stress" label="Stress" low="1 · calm" high="5 · fried" />
      <Scale name="motivation" label="Motivation" low="1 · none" high="5 · raring" />

      <label className="f" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input type="checkbox" name="illness" id="illness" style={{ width: 18, height: 18 }} />
        <span className="small">Any illness symptoms today</span>
      </label>

      <label className="f">
        <span className="lab">Pain or niggle — be specific about where</span>
        <input type="text" name="pain" id="pain" placeholder="e.g. left shin, sharp, worse running downhill" />
      </label>

      <label className="f">
        <span className="lab">Anything else</span>
        <textarea name="notes" id="notes" placeholder="Late finish at work, big session yesterday, feeling flat…" />
      </label>

      <button className="wide" type="submit">Save and see today&rsquo;s plan</button>
    </form>
  );
}
