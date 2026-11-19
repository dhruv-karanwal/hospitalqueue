import { PageHead, Panel } from '../components/ui.jsx';
import { CONCEPTS } from '../lib/concepts.js';

export default function Concepts() {
  return (
    <div className="stack">
      <PageHead title="Concepts and viva">
        Each operating-system concept, how the hospital models it, where to see it in the app, the code that implements it, and three practice questions.
      </PageHead>
      <nav aria-label="Concepts on this page" className="panel-flat">
        <div className="row-tight">{CONCEPTS.map((c) => <a key={c.id} href={`#/concepts`} onClick={(e) => { e.preventDefault(); document.getElementById(`c-${c.id}`)?.scrollIntoView(); }}>{c.title}</a>)}</div>
      </nav>
      {CONCEPTS.map((c) => (
        <Panel key={c.id} title={null} className="concept">
          <h2 id={`c-${c.id}`} tabIndex={-1}>{c.title}</h2>
          <p>{c.summary}</p>
          <p><strong>See it in:</strong> {c.where.map((w, i) => <span key={w.page}>{i > 0 && ', '}<a href={`#/${w.page}`}>{w.label}</a></span>)}</p>
          <p><strong>Code:</strong> {c.code.map((f, i) => <span key={f}>{i > 0 && ', '}<code>{f}</code></span>)}</p>
          {c.qa.map(([q, a]) => (
            <details className="qa" key={q}><summary>{q}</summary><p>{a}</p></details>
          ))}
        </Panel>
      ))}
    </div>
  );
}
