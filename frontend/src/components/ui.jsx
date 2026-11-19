import { useId } from 'react';
import { priorityName } from '../lib/workload.js';

export function PageHead({ title, children }) {
  return (
    <header className="page-head">
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </header>
  );
}

export function Panel({ title, children, actions, className = '' }) {
  return (
    <section className={`panel ${className}`} aria-label={typeof title === 'string' ? title : undefined}>
      {(title || actions) && (
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          {title && <h2 style={{ fontSize: 'var(--step-1)', margin: 0 }}>{title}</h2>}
          {actions && <div className="row-tight">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, hint, children, id }) {
  const auto = useId();
  const fid = id || auto;
  const child = typeof children === 'function' ? children(fid) : children;
  return (
    <div className="field">
      <label htmlFor={fid}>{label}</label>
      {child}
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function NumberField({ label, value, onChange, min = 0, max = 1000, hint, disabled }) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <input id={id} type="number" inputMode="numeric" min={min} max={max} value={value} disabled={disabled}
          onChange={(e) => {
            const v = Number.parseInt(e.target.value, 10);
            onChange(Number.isNaN(v) ? min : Math.max(min, Math.min(max, v)));
          }} />
      )}
    </Field>
  );
}

export function SelectField({ label, value, onChange, options, hint }) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </Field>
  );
}

export function Toggle({ label, value, options, onChange }) {
  return (
    <div className="field">
      <span className="label" id={`${label}-lbl`}>{label}</span>
      <div className="seg" role="group" aria-labelledby={`${label}-lbl`}>
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

export function PriorityTag({ p, aged }) {
  return (
    <span className="tag tag-prio" data-p={p} title={priorityName(p)}>
      P{p}<span className="sr-only"> {priorityName(p)}</span>{aged ? <span aria-label={`aged from P${aged}`}> (was P{aged})</span> : null}
    </span>
  );
}

export function StateTag({ s }) {
  return <span className="tag tag-state" data-s={s}>{s}</span>;
}

export function Stat({ label, value, sub }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function ErrorNote({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="note note-error" role="alert">
      <strong>That didn&apos;t work</strong>
      {error.message || String(error)}
      {onRetry && <div style={{ marginTop: 8 }}><button className="btn btn-sm" type="button" onClick={onRetry}>Try again</button></div>}
    </div>
  );
}

export function Loading({ height = 160, label = 'Loading' }) {
  return <div className="skeleton" style={{ height }} role="status" aria-label={label}><span className="sr-only">{label}…</span></div>;
}

export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
