import { useEffect, useId, useState } from 'react';
import { api } from '../lib/api.js';
import { fromScenario } from '../lib/workload.js';
import { useWorkload } from '../store.jsx';

// Loads a preset (or saved) scenario into the shared workload.
export default function ScenarioPicker({ onLoaded, suggest }) {
  const { setWorkload } = useWorkload();
  const [list, setList] = useState([]);
  const [sel, setSel] = useState(suggest || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [loaded, setLoaded] = useState(null);
  const id = useId();

  useEffect(() => {
    api.scenarios().then(setList).catch(setErr);
  }, []);

  const load = async () => {
    if (!sel) return;
    setBusy(true);
    setErr(null);
    try {
      const sc = await api.scenario(sel);
      const w = fromScenario(sc);
      setWorkload(w);
      setLoaded(sc);
      onLoaded?.(w, sc);
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="row">
        <div className="field">
          <label htmlFor={id}>Scenario</label>
          <select id={id} value={sel} onChange={(e) => setSel(e.target.value)}>
            <option value="">Choose a scenario…</option>
            {list.map((s) => <option key={s.id} value={s.id}>{s.title}{s.source === 'saved' ? ' (saved)' : ''}</option>)}
          </select>
        </div>
        <button className="btn" type="button" onClick={load} disabled={!sel || busy}>{busy ? 'Loading…' : 'Load scenario'}</button>
      </div>
      {err && <p role="alert" className="muted" style={{ color: 'var(--danger)' }}>{err.message}</p>}
      {loaded && (
        <div className="note" style={{ marginTop: 12 }} role="status">
          <strong>{loaded.title} loaded: {loaded.patients.length} patients, {loaded.doctors} doctor{loaded.doctors > 1 ? 's' : ''}</strong>
          {loaded.explanation}
        </div>
      )}
    </div>
  );
}
