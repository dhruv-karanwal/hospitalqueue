import { useCallback, useMemo } from 'react';
import BarChart from '../components/BarChart.jsx';
import ParamControls from '../components/ParamControls.jsx';
import ScenarioPicker from '../components/ScenarioPicker.jsx';
import { Empty, ErrorNote, Loading, PageHead, Panel } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useRequest } from '../lib/hooks.js';
import { METRICS, formatMetric } from '../lib/metrics.js';
import { policyShort, toBody } from '../lib/workload.js';
import { useWorkload } from '../store.jsx';

const CHARTS = ['avg_waiting', 'max_wait', 'utilization', 'context_switches'];

export default function Compare() {
  const { workload, setWorkload } = useWorkload();
  const fn = useCallback((w) => api.compare(toBody(w)), []);
  const { data, loading, error, run } = useRequest(fn);
  const charts = useMemo(() => {
    if (!data) return [];
    return CHARTS.map((k) => {
      const meta = METRICS.find((m) => m.key === k);
      return { meta, data: data.results.map((r) => ({ id: r.policy, label: policyShort(r.policy), value: r.metrics[k] })) };
    });
  }, [data]);

  return (
    <div className="stack">
      <PageHead title="Compare policies">
        Runs the same workload under all seven policies. The best value in each column is highlighted and starred.
      </PageHead>
      <Panel title="Workload">
        <ScenarioPicker suggest="convoy-effect" />
        <div style={{ marginTop: 12 }}>
          <ParamControls workload={workload} onChange={setWorkload} showPolicy={false}
            only={['doctors', 'quantum', 'context_switch_cost', 'aging_interval', 'aging_step', 'starvation_threshold', 'queue_mode']} />
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" type="button" disabled={loading || !workload.patients.length} onClick={() => run(workload)}>
            {loading ? 'Comparing…' : `Compare all policies on ${workload.patients.length} patients`}</button>
        </div>
      </Panel>
      <ErrorNote error={error} onRetry={() => run(workload)} />
      {loading && !data && <Loading height={300} label="Comparing policies" />}
      {!data && !loading && <Empty title="No comparison yet">Choose a scenario (try Convoy effect) or use your own workload, then compare.</Empty>}
      {data && (
        <>
          <Panel title="Side by side">
            <div className="scroll-x">
              <table>
                <caption className="sr-only">Metrics per policy. Best values are marked.</caption>
                <thead>
                  <tr><th scope="col">Policy</th>{METRICS.map((m) => <th scope="col" key={m.key}>{m.label}<br /><span className="muted">{m.better} is better</span></th>)}</tr>
                </thead>
                <tbody>
                  {data.results.map((r) => (
                    <tr key={r.policy}>
                      <th scope="row">{r.label}</th>
                      {METRICS.map((m) => {
                        const best = data.best[m.key]?.includes(r.policy);
                        return <td key={m.key} className={best ? 'best' : ''}>{formatMetric(m.key, r.metrics[m.key])}{best && <> ★<span className="sr-only"> best</span></>}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <div className="grid grid-2">
            {charts.map((c) => (
              <Panel key={c.meta.key}>
                <BarChart title={`${c.meta.label}${c.meta.unit && c.meta.unit !== '%' ? ` (${c.meta.unit})` : ''}, ${c.meta.better} is better`}
                  data={c.data} best={data.best[c.meta.key]} format={(v) => formatMetric(c.meta.key, v)} />
              </Panel>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
