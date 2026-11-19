import { useCallback, useMemo } from 'react';
import BarChart from '../components/BarChart.jsx';
import Gantt from '../components/Gantt.jsx';
import ParamControls from '../components/ParamControls.jsx';
import ScenarioPicker from '../components/ScenarioPicker.jsx';
import { Empty, ErrorNote, Loading, PageHead, Panel, PriorityTag, Stat } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useRequest } from '../lib/hooks.js';
import { formatMetric } from '../lib/metrics.js';
import { toBody } from '../lib/workload.js';
import { useWorkload } from '../store.jsx';

export default function Aging() {
  const { workload, setWorkload } = useWorkload();
  const fn = useCallback((w) => api.agingDemo(toBody(w)), []);
  const { data, loading, error, run } = useRequest(fn);
  const rows = useMemo(() => (data ? [...data.patients].sort((a, b) => b.ready_wait_without - a.ready_wait_without) : []), [data]);
  const doctors = useMemo(() => Array.from({ length: workload.doctors }, (_, i) => `D${i + 1}`), [workload.doctors]);

  return (
    <div className="stack">
      <PageHead title="Starvation and aging lab">
        The same workload under preemptive priority, first without aging and then with aging. A patient is starved when its time in the READY queue goes over the threshold.
      </PageHead>
      <Panel title="Workload">
        <ScenarioPicker suggest="emergency-surge" />
        <div style={{ marginTop: 12 }}>
          <ParamControls workload={workload} onChange={setWorkload} showPolicy={false}
            only={['doctors', 'aging_interval', 'aging_step', 'starvation_threshold']} />
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          With aging, every {workload.params.aging_interval} minutes of waiting raises a patient&apos;s priority by {workload.params.aging_step} level{workload.params.aging_step > 1 ? 's' : ''}, up to P1.
        </p>
        <button className="btn btn-primary" type="button" disabled={loading || !workload.patients.length} onClick={() => run(workload)}>
          {loading ? 'Running both…' : 'Run without and with aging'}</button>
      </Panel>
      <ErrorNote error={error} onRetry={() => run(workload)} />
      {loading && !data && <Loading height={260} label="Running aging demo" />}
      {!data && !loading && <Empty title="No results yet">Load the Emergency surge scenario to see routine patients starve behind a stream of critical arrivals, then run the lab.</Empty>}
      {data && (
        <>
          <div className="stats">
            <Stat label="Starved without aging" value={data.summary.starved_without} />
            <Stat label="Starved with aging" value={data.summary.starved_with} />
            <Stat label="Longest wait without" value={`${data.summary.max_wait_without} min`} />
            <Stat label="Longest wait with" value={`${data.summary.max_wait_with} min`} />
            <Stat label="Average wait without" value={`${formatMetric('avg_waiting', data.without.metrics.avg_waiting)} min`} />
            <Stat label="Average wait with" value={`${formatMetric('avg_waiting', data.with.metrics.avg_waiting)} min`} />
          </div>
          <div className={`note ${data.summary.rescued.length ? 'note-ok' : ''}`} role="status">
            <strong>{data.summary.rescued.length ? `Aging rescued ${data.summary.rescued.join(', ')}` : 'No patient changed starvation status'}</strong>
            {data.summary.rescued.length
              ? 'These patients waited past the threshold without aging and were served in time with it.'
              : 'Try a lower threshold, a shorter aging interval or the Emergency surge scenario.'}
          </div>
          <Panel title="Time in READY per patient">
            <BarChart title={`Grey = without aging, yellow = with aging. Dashed red line = starvation threshold (${data.threshold} min)`}
              data={rows.map((r) => ({ id: r.id, label: `${r.id} (P${r.priority})`, value: r.ready_wait_without, alt: r.ready_wait_with }))}
              altKey="with aging" threshold={data.threshold} format={(v) => `${v} min`} />
          </Panel>
          <Panel title="Starvation flags">
            <div className="scroll-x">
              <table>
                <thead><tr><th scope="col">Patient</th><th scope="col">Priority</th><th scope="col">READY wait without</th><th scope="col">Starved?</th>
                  <th scope="col">READY wait with</th><th scope="col">Starved?</th><th scope="col">Priority at the end</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <th scope="row">{r.id}</th><td><PriorityTag p={r.priority} /></td>
                      <td>{r.ready_wait_without} min</td>
                      <td>{r.starved_without ? <span className="tag tag-bad">Starved</span> : <span className="tag tag-good">OK</span>}</td>
                      <td>{r.ready_wait_with} min</td>
                      <td>{r.starved_with ? <span className="tag tag-bad">Starved</span> : <span className="tag tag-good">OK</span>}</td>
                      <td>{r.final_priority < r.priority ? <PriorityTag p={r.final_priority} aged={r.priority} /> : <PriorityTag p={r.priority} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <div className="grid grid-2">
            <Panel title="Without aging"><Gantt segments={data.without.gantt} rows={doctors} label="Schedule without aging" /></Panel>
            <Panel title="With aging"><Gantt segments={data.with.gantt} rows={doctors} label="Schedule with aging" /></Panel>
          </div>
          <Panel title={`Aging and starvation events (${data.with.aging_events.length})`}>
            <div className="steps-wrap">
              <table className="steps-table">
                <thead><tr><th scope="col">Min</th><th scope="col">Event</th><th scope="col">Detail</th></tr></thead>
                <tbody>{data.with.aging_events.map((e, i) => <tr key={i}><td>{e.t}</td><td>{e.type === 'AGING' ? 'Aging' : 'Starvation'}</td><td>{e.reason}</td></tr>)}</tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
