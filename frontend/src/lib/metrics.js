// Metric catalogue used by Compare, Aging Lab and Multi-doctor pages.
export const METRICS = [
  { key: 'avg_waiting', label: 'Average wait', unit: 'min', better: 'lower' },
  { key: 'max_wait', label: 'Longest wait', unit: 'min', better: 'lower' },
  { key: 'avg_turnaround', label: 'Average turnaround', unit: 'min', better: 'lower' },
  { key: 'avg_response', label: 'Average response', unit: 'min', better: 'lower' },
  { key: 'utilization', label: 'Doctor utilization', unit: '%', better: 'higher' },
  { key: 'throughput', label: 'Throughput', unit: 'patients/min', better: 'higher' },
  { key: 'context_switches', label: 'Context switches', unit: '', better: 'lower' },
  { key: 'starvation_count', label: 'Starved patients', unit: '', better: 'lower' },
  { key: 'fairness_ratio', label: 'Fairness (max / avg wait)', unit: '', better: 'lower' },
];

export function formatMetric(key, v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  if (key === 'utilization') return `${(v * 100).toFixed(1)}%`;
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(key === 'throughput' ? 3 : 2);
}

// Mirror of the backend's best_per_metric: every policy tied for best.
export function bestByMetric(results) {
  const out = {};
  for (const m of METRICS) {
    const vals = results.map((r) => r.metrics[m.key]);
    if (!vals.length) continue;
    const target = m.better === 'lower' ? Math.min(...vals) : Math.max(...vals);
    out[m.key] = results.filter((r) => r.metrics[m.key] === target).map((r) => r.policy);
  }
  return out;
}
