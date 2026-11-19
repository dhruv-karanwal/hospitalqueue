import { useCallback } from 'react';
import Gantt, { GanttLegend } from '../components/Gantt.jsx';
import ParamControls from '../components/ParamControls.jsx';
import ScenarioPicker from '../components/ScenarioPicker.jsx';
import { Empty, ErrorNote, Loading, PageHead, Panel } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useRequest } from '../lib/hooks.js';
import { METRICS, formatMetric } from '../lib/metrics.js';
import { toBody } from '../lib/workload.js';
import { useWorkload } from '../store.jsx';

const KEYS = ['avg_waiting', 'max_wait', 'avg_turnaround', 'utilization', 'fairness_ratio'];
const MODES = [{ id: 'global', label: 'One common queue' }, { id: 'per_doctor', label: 'Queue per doctor' }];

export default function MultiDoctor() {
  const { workload, setWorkload } = useWorkload();
  const fn = useCallback((w) => api.multiDoctor({ ...toBody(w), doctors: Math.max(2, w.doctors), policy: w.policy }), []);
  const { data, loading, error, run } = useRequest(fn);
  const rows = Array.from({ length: Math.max(2, workload.doctors) }, (_, i) => `D${i + 1}`);

  return (
    <div className="stack">
      <PageHead title="Multi-doctor scheduling">
        Several doctors work in parallel. With one common queue, any free doctor takes the next patient. With a queue per doctor, patients join the shortest line when they arrive and stay in it.
      </PageHead>
      <Panel title="Workload">
        <ScenarioPicker suggest="govt-multi-counter" />
        <div style={{ marginTop: 12 }}>
          <ParamControls workload={workload} onChange={setWorkload} only={['doctors', 'quantum']} />
        </div>
        <button className="btn btn-primary" style={{ marginTop: 12 }} type="button" disabled={loading || !workload.patients.length} onClick={() => run(workload)}>
          {loading ? 'Comparing…' : 'Compare queue layouts'}</button>
        {workload.doctors < 2 && <p className="muted">This comparison needs at least 2 doctors, so it will use 2.</p>}
      </Panel>
      <ErrorNote error={error} onRetry={() => run(workload)} />
      {loading && !data && <Loading height={260} label="Comparing queue layouts" />}
      {!data && !loading && <Empty title="No comparison yet">Load the Multi-counter government service scenario and compare the two layouts.</Empty>}
      {data && (
        <>
          <div className="note" role="status"><strong>{data.verdict}</strong>
            Load imbalance (difference in busy minutes between the busiest and idlest doctor): {data.global.load_imbalance} min with one queue, {data.per_doctor.load_imbalance} min with separate queues.</div>
          <Panel title="Metrics">
            <table>
              <thead><tr><th scope="col">Metric</th>{MODES.map((m) => <th scope="col" key={m.id}>{m.label}</th>)}</tr></thead>
              <tbody>
                {KEYS.map((k) => {
                  const meta = METRICS.find((m) => m.key === k);
                  const a = data.global.metrics[k];
                  const b = data.per_doctor.metrics[k];
                  const bestA = meta.better === 'lower' ? a <= b : a >= b;
                  const bestB = meta.better === 'lower' ? b <= a : b >= a;
                  return (
                    <tr key={k}><th scope="row">{meta.label} <span className="muted">({meta.better} is better)</span></th>
                      <td className={bestA ? 'best' : ''}>{formatMetric(k, a)}{bestA && ' ★'}</td>
                      <td className={bestB ? 'best' : ''}>{formatMetric(k, b)}{bestB && ' ★'}</td></tr>
                  );
                })}
                <tr><th scope="row">Busy minutes per doctor</th>
                  {MODES.map((m) => <td key={m.id}>{data[m.id].doctors.map((d) => `${d.id} ${d.busy}`).join(', ')}</td>)}</tr>
              </tbody>
            </table>
          </Panel>
          {MODES.map((m) => (
            <Panel key={m.id} title={m.label}>
              <Gantt segments={data[m.id].gantt} rows={rows} label={`Schedule with ${m.label.toLowerCase()}`} />
            </Panel>
          ))}
          <GanttLegend />
        </>
      )}
    </div>
  );
}
