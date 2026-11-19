// Workload model shared by every page: patients + doctors + policy + params.
export const PRIORITIES = [
  { level: 1, name: 'Resuscitation' },
  { level: 2, name: 'Emergent' },
  { level: 3, name: 'Urgent' },
  { level: 4, name: 'Less urgent' },
  { level: 5, name: 'Non-urgent' },
];
export const priorityName = (lvl) => PRIORITIES.find((p) => p.level === lvl)?.name ?? 'Unknown';

export const POLICIES = [
  { id: 'FCFS', short: 'FCFS', label: 'First-come, first-served' },
  { id: 'SJF', short: 'SJF', label: 'Shortest job first' },
  { id: 'SRTF', short: 'SRTF', label: 'Shortest remaining time first' },
  { id: 'PRIORITY_NP', short: 'Priority', label: 'Priority, non-preemptive' },
  { id: 'PRIORITY_P', short: 'Priority (P)', label: 'Priority, preemptive' },
  { id: 'RR', short: 'RR', label: 'Round robin' },
  { id: 'PRIORITY_AGING', short: 'Aging', label: 'Priority with aging' },
];
export const policyLabel = (id) => POLICIES.find((p) => p.id === id)?.label ?? id;
export const policyShort = (id) => POLICIES.find((p) => p.id === id)?.short ?? id;

export const DEVICES = ['lab', 'xray', 'pharmacy'];
export const DEFAULT_PARAMS = {
  quantum: 2, context_switch_cost: 0, aging_interval: 5, aging_step: 1,
  starvation_threshold: 30, queue_mode: 'global', devices: { lab: 1, xray: 1, pharmacy: 1 },
};

export function defaultWorkload() {
  return {
    doctors: 2,
    policy: 'PRIORITY_P',
    params: { ...DEFAULT_PARAMS, devices: { ...DEFAULT_PARAMS.devices } },
    patients: [
      { id: 'P1', name: 'Asha', arrival_time: 0, burst_time: 8, priority: 4, io_requests: [] },
      { id: 'P2', name: 'Ravi', arrival_time: 1, burst_time: 4, priority: 3, io_requests: [{ at: 2, device: 'lab', duration: 3 }] },
      { id: 'P3', name: 'Meera', arrival_time: 2, burst_time: 9, priority: 5, io_requests: [] },
      { id: 'P4', name: 'Kabir', arrival_time: 3, burst_time: 3, priority: 1, io_requests: [] },
      { id: 'P5', name: 'Sara', arrival_time: 5, burst_time: 5, priority: 2, io_requests: [] },
      { id: 'P6', name: 'Dev', arrival_time: 6, burst_time: 2, priority: 4, io_requests: [] },
    ],
  };
}

const ID_RE = /^[A-Za-z0-9_-]{1,20}$/;
const int = (v) => (typeof v === 'number' && Number.isInteger(v) ? v : Number.parseInt(v, 10));

export function nextPatientId(patients) {
  let n = patients.length + 1;
  const used = new Set(patients.map((p) => p.id));
  while (used.has(`P${n}`)) n += 1;
  return `P${n}`;
}

export function blankPatient(patients, clock = 0) {
  return { id: nextPatientId(patients), name: '', arrival_time: clock, burst_time: 4, priority: 3, io_requests: [] };
}

// Returns a list of human-readable problems with one patient (empty = valid).
export function patientErrors(p) {
  const errs = [];
  if (!ID_RE.test(String(p.id ?? ''))) errs.push('ID must be 1-20 letters, digits, - or _');
  const a = int(p.arrival_time);
  const b = int(p.burst_time);
  const pr = int(p.priority);
  if (!Number.isInteger(a) || a < 0) errs.push('Arrival must be a whole number of minutes, 0 or more');
  if (!Number.isInteger(b) || b < 1 || b > 1000) errs.push('Consultation must be 1-1000 minutes');
  if (!Number.isInteger(pr) || pr < 1 || pr > 5) errs.push('Priority must be 1-5');
  for (const r of p.io_requests || []) {
    if (!DEVICES.includes(r.device)) errs.push(`Unknown device "${r.device}"`);
    if (!(int(r.at) >= 1 && int(r.at) < b)) errs.push('I/O must start after minute 1 and before the consultation ends');
    if (!(int(r.duration) >= 1)) errs.push('I/O duration must be at least 1');
  }
  return errs;
}

export function normalizePatient(p) {
  return {
    id: String(p.id),
    name: String(p.name ?? '').slice(0, 60),
    arrival_time: int(p.arrival_time ?? p.arrival),
    burst_time: int(p.burst_time ?? p.burst),
    priority: int(p.priority ?? 3),
    io_requests: (p.io_requests || []).map((r) => ({ at: int(r.at), device: r.device, duration: int(r.duration) })),
    ...(p.doctor_id ? { doctor_id: int(p.doctor_id) } : {}),
  };
}

// Parse imported JSON: either a full workload object or a bare array of patients.
export function parseWorkload(text, base = defaultWorkload()) {
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, errors: ['The file is not valid JSON.'] }; }
  const raw = Array.isArray(data) ? data : data?.patients;
  if (!Array.isArray(raw)) return { ok: false, errors: ['Expected a "patients" array.'] };
  const patients = raw.map(normalizePatient);
  const errors = [];
  const seen = new Set();
  patients.forEach((p, i) => {
    patientErrors(p).forEach((e) => errors.push(`Row ${i + 1} (${p.id}): ${e}`));
    if (seen.has(p.id)) errors.push(`Row ${i + 1}: duplicate ID ${p.id}`);
    seen.add(p.id);
  });
  if (patients.length > 1000) errors.push('At most 1000 patients.');
  if (errors.length) return { ok: false, errors };
  const w = Array.isArray(data) ? { ...base, patients } : {
    doctors: int(data.doctors ?? base.doctors),
    policy: POLICIES.some((x) => x.id === data.policy) ? data.policy : base.policy,
    params: { ...base.params, ...(data.params || {}) },
    patients,
  };
  return { ok: true, workload: w, errors: [] };
}

export function exportWorkload(w) {
  return JSON.stringify({ doctors: w.doctors, policy: w.policy, params: w.params, patients: w.patients }, null, 2);
}

export function fromScenario(sc) {
  return {
    doctors: sc.doctors,
    policy: sc.policy,
    params: { ...DEFAULT_PARAMS, ...sc.params, devices: { ...DEFAULT_PARAMS.devices, ...(sc.params?.devices || {}) } },
    patients: sc.patients.map(normalizePatient),
  };
}

// Request body for the workload endpoints.
export function toBody(w, extra = {}) {
  return { patients: w.patients.map(normalizePatient), doctors: w.doctors, params: w.params, ...extra };
}

// Compact I/O notation for the patient table: "lab@2:3, xray@4:2" = device@at:duration.
export function formatIO(reqs = []) {
  return reqs.map((r) => `${r.device}@${r.at}:${r.duration}`).join(', ');
}

export function parseIO(text) {
  const t = String(text || '').trim();
  if (!t) return { ok: true, value: [] };
  const out = [];
  for (const part of t.split(/[,;]/).map((s) => s.trim()).filter(Boolean)) {
    const m = /^([a-z]+)@(\d+):(\d+)$/i.exec(part);
    if (!m || !DEVICES.includes(m[1].toLowerCase())) return { ok: false, error: `Use device@at:duration, e.g. lab@2:3 (got "${part}")` };
    out.push({ device: m[1].toLowerCase(), at: Number(m[2]), duration: Number(m[3]) });
  }
  return { ok: true, value: out.sort((a, b) => a.at - b.at) };
}
