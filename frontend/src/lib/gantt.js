// Pure helpers for laying out Gantt charts and replaying scheduling decisions.
export function timeBounds(segments) {
  if (!segments || !segments.length) return { start: 0, end: 0 };
  let start = Infinity;
  let end = 0;
  for (const s of segments) {
    if (s.start < start) start = s.start;
    if (s.end > end) end = s.end;
  }
  return { start: Math.min(0, start), end };
}

export function groupRows(segments, key, order = []) {
  const rows = new Map(order.map((k) => [k, []]));
  for (const s of segments) {
    const k = s[key];
    if (!rows.has(k)) rows.set(k, []);
    rows.get(k).push(s);
  }
  return [...rows.entries()].map(([id, segs]) => ({ id, segs }));
}

// Clip segments to the playhead so the chart "draws itself" during playback.
export function clipToTime(segments, t) {
  const out = [];
  for (const s of segments) {
    if (s.start >= t) continue;
    out.push(s.end <= t ? s : { ...s, end: t, partial: true });
  }
  return out;
}

export function niceTicks(start, end, target = 10) {
  const span = Math.max(1, end - start);
  const raw = span / target;
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000, 2000, 5000];
  const step = steps.find((s) => s >= raw) ?? Math.ceil(raw);
  const ticks = [];
  for (let v = Math.ceil(start / step) * step; v <= end; v += step) ticks.push(v);
  return ticks;
}

export const DECISION_TYPES = new Set([
  'DISPATCH', 'PREEMPT', 'QUANTUM_EXPIRED', 'CONTEXT_SWITCH', 'INTERRUPT', 'IO_REQUEST', 'AGING', 'STARVATION', 'COMPLETE', 'ARRIVAL',
]);

// Events that happened exactly at minute t (what the scheduler did "now").
export function decisionsAt(trace, t) {
  return trace.filter((e) => e.t === t && DECISION_TYPES.has(e.type));
}

// Latest minute <= t at which something happened (for "previous decision" stepping).
export function eventTimes(trace) {
  return [...new Set(trace.map((e) => e.t))].sort((a, b) => a - b);
}
