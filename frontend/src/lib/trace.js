export const TYPE_LABELS = {
  ARRIVAL: 'Arrival', DISPATCH: 'Dispatch', PREEMPT: 'Preemption', QUANTUM_EXPIRED: 'Quantum expired',
  CONTEXT_SWITCH: 'Context switch', IO_REQUEST: 'I/O request', IO_START: 'I/O start', INTERRUPT: 'Interrupt',
  COMPLETE: 'Completed', AGING: 'Aging', STARVATION: 'Starvation',
};

export function filterTrace(events, { patient = '', type = '', q = '' } = {}) {
  const needle = q.trim().toLowerCase();
  return events.filter((e) =>
    (!patient || e.patient === patient)
    && (!type || e.type === type)
    && (!needle || e.reason.toLowerCase().includes(needle) || e.actor.toLowerCase().includes(needle)));
}

export function tracePatients(events) {
  return [...new Set(events.map((e) => e.patient).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function traceTypes(events) {
  return [...new Set(events.map((e) => e.type))];
}
