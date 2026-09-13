import type { Audit } from '@/lib/nutrition';

/**
 * What gets shown instead of a number the engine cannot defend.
 *
 * The instruction was explicit: do not hide the figure, do not round it, do not
 * cap it in the display. So this does none of those things. When the audit
 * fails, the number is withheld entirely and replaced by the arithmetic that
 * produced it, line by line, with the specific check that failed and what to do
 * about it. A plan that says "I cannot justify this, here is why" is worth more
 * than one that prints 6,500 kcal in a nice font.
 *
 * When the audit only warns, the number stands and the warnings sit beneath it.
 */
export function Failsafe({ audit, what }: { audit: Audit; what: string }) {
  const fails = audit.findings.filter((f) => f.severity === 'fail');
  const warns = audit.findings.filter((f) => f.severity === 'warn');

  if (!fails.length && !warns.length) return null;

  return (
    <>
      {fails.length > 0 && (
        <div className="verdict red" style={{ marginBottom: 14 }}>
          <h2>{what} is being withheld</h2>
          <p>
            {fails.length === 1 ? 'A check has failed' : `${fails.length} checks have failed`} on the arithmetic behind
            this number, so it is not being shown. Displaying a figure this system cannot account for is worse than
            showing nothing — you would plan a week around it and never know. Everything needed to find the fault is
            below.
          </p>
        </div>
      )}

      {fails.map((f, i) => (
        <div key={`f${i}`} className="note" style={{ marginBottom: 10 }}>
          <b>{f.title}</b>
          <div style={{ marginTop: 4 }}>{f.detail}</div>
          {f.action && <div style={{ marginTop: 6 }}><i>{f.action}</i></div>}
          <div className="xs" style={{ marginTop: 6 }}>check {f.code}</div>
        </div>
      ))}

      {warns.map((f, i) => (
        <div key={`w${i}`} className="note neutral" style={{ marginBottom: 10 }}>
          <b>{f.title}</b>
          <div style={{ marginTop: 4 }}>{f.detail}</div>
          {f.action && <div style={{ marginTop: 6 }}><i>{f.action}</i></div>}
        </div>
      ))}

      {fails.length > 0 && (
        <div className="card">
          <h2>The calculation, in full</h2>
          <p className="desc">
            Every component that went into the figure. One of these is wrong; comparing them against the training log
            is the fastest way to find out which.
          </p>
          <div className="scroll">
            <table>
              <thead><tr><th>Component</th><th>kcal</th></tr></thead>
              <tbody>
                {audit.reconciliation.map((r, i) => (
                  <tr key={i}><td className="k">{r.label}</td><td className="num">{r.kcal.toLocaleString()}</td></tr>
                ))}
                <tr>
                  <td className="k"><b>Sum of the parts</b></td>
                  <td className="num"><b>{audit.reconciliation.reduce((a, r) => a + r.kcal, 0).toLocaleString()}</b></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

/** The one sentence the number has to be able to justify itself with. */
export function Explanation({ audit }: { audit: Audit }) {
  if (!audit.explanation) return null;
  return <p className="xs" style={{ margin: '2px 0 12px' }}>{audit.explanation}</p>;
}

export default Failsafe;
