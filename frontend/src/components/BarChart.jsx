import { memo } from 'react';

// Horizontal bar chart. Best bars are teal AND marked "best" in text, so colour is not the only cue.
function BarChart({ title, data, format = (v) => v, best = [], threshold, altKey }) {
  const max = Math.max(1e-9, ...data.flatMap((d) => [d.value, d.alt ?? 0]), threshold ?? 0);
  return (
    <figure style={{ margin: 0 }}>
      <figcaption style={{ fontWeight: 700, marginBottom: 8 }}>{title}</figcaption>
      <div className="bars" role="list">
        {data.map((d) => {
          const isBest = best.includes(d.id);
          return (
            <div key={d.id} role="listitem">
              <div className="bar-row">
                <span className="cell-ellipsis" title={d.label}>{d.label}</span>
                <span className="bar-track" aria-hidden="true">
                  <span className={`bar-fill${isBest ? ' best' : ''}`} style={{ width: `${(d.value / max) * 100}%`, display: 'block' }} />
                  {threshold !== undefined && <span className="threshold" style={{ left: `${(threshold / max) * 100}%` }} />}
                </span>
                <span className="bar-value">{format(d.value)}{isBest ? ' ★' : ''}<span className="sr-only">{isBest ? ' (best)' : ''}</span></span>
              </div>
              {altKey && d.alt !== undefined && (
                <div className="bar-row">
                  <span className="muted cell-ellipsis">{altKey}</span>
                  <span className="bar-track" aria-hidden="true">
                    <span className="bar-fill alt" style={{ width: `${(d.alt / max) * 100}%`, display: 'block' }} />
                    {threshold !== undefined && <span className="threshold" style={{ left: `${(threshold / max) * 100}%` }} />}
                  </span>
                  <span className="bar-value">{format(d.alt)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </figure>
  );
}

export default memo(BarChart);
