import { useEffect, useState } from 'react';
import { fetchHealth } from './lib/api.js';

// Milestone 1 shell. Pages are added (lazy-loaded) from milestone 10.
export default function App() {
  const [state, setState] = useState({ loading: true, health: null, error: null });

  useEffect(() => {
    let alive = true;
    fetchHealth()
      .then((health) => alive && setState({ loading: false, health, error: null }))
      .catch((error) => alive && setState({ loading: false, health: null, error }));
    return () => { alive = false; };
  }, []);

  return (
    <main className="shell">
      <h1>MediQueue OS</h1>
      <p className="muted">Hospital queue scheduling simulator. Teaching tool, not a clinical system.</p>
      <section aria-live="polite" className="card" data-testid="health">
        {state.loading && <p>Checking backend…</p>}
        {state.health && <p><strong>Backend: {state.health.status}</strong> (v{state.health.version})</p>}
        {state.error && <p role="alert"><strong>Backend unavailable:</strong> {state.error.message}</p>}
      </section>
    </main>
  );
}
