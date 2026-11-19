// Thin fetch wrapper. All backend calls go through here so errors are uniform.
export class ApiError extends Error {
  constructor(message, status = 0, detail = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

export function apiUrl(path) {
  return '/api/' + String(path).replace(/^\/+/, '');
}

// FastAPI 422 bodies carry a list of {loc, msg}; turn them into one readable sentence.
export function describeDetail(detail) {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .slice(0, 3)
      .map((d) => {
        const loc = (d.loc || []).filter((x) => x !== 'body').join('.');
        return loc ? `${loc}: ${d.msg}` : d.msg;
      })
      .join('; ');
  }
  return null;
}

export async function request(path, { method = 'GET', body, fetchImpl = fetch } = {}) {
  const init = { method, headers: { Accept: 'application/json' } };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetchImpl(apiUrl(path), init);
  } catch (err) {
    throw new ApiError('Cannot reach the MediQueue API. Start it with "make backend".', 0, String(err));
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const msg = describeDetail(data && data.detail) || `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, data && data.detail);
  }
  return data;
}

const post = (path, body) => request(path, { method: 'POST', body });

export const fetchHealth = (fetchImpl = fetch) => request('health', { fetchImpl });
export const api = {
  simulate: (body) => post('simulate', body),
  compare: (body) => post('compare', body),
  agingDemo: (body) => post('aging-demo', body),
  multiDoctor: (body) => post('multi-doctor/compare', body),
  ioSimulate: (body) => post('io/simulate', body),
  safetyCheck: (body) => post('resources/safety-check', body),
  deadlockCheck: (body) => post('resources/deadlock-check', body),
  raceDemo: (body) => post('sync/race-demo', body),
  producerConsumer: (body) => post('producer-consumer', body),
  scenarios: () => request('scenarios'),
  scenario: (id) => request(`scenarios/${encodeURIComponent(id)}`),
  saveScenario: (body) => post('scenarios', body),
  deleteScenario: (id) => request(`scenarios/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  runs: () => request('runs?limit=10'),
  sessionCreate: (body) => post('session', body),
  sessionAdd: (id, patients) => post(`session/${id}/patients`, { patients }),
  sessionStep: (id, ticks = 1) => post(`session/${id}/step`, { ticks }),
  sessionState: (id) => request(`session/${id}/state`),
  sessionTrace: (id, { patient, limit = 500 } = {}) =>
    request(`session/${id}/trace?limit=${limit}${patient ? `&patient=${encodeURIComponent(patient)}` : ''}`),
};
