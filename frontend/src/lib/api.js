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
    throw new ApiError('Cannot reach the MediQueue API. Is the backend running?', 0, String(err));
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const detail = data && data.detail;
    const msg = typeof detail === 'string' ? detail : `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, detail);
  }
  return data;
}

export const fetchHealth = (fetchImpl = fetch) => request('health', { fetchImpl });
