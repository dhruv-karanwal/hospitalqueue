import { describe, it, expect, vi } from 'vitest';
import { apiUrl, fetchHealth, ApiError } from '../lib/api.js';

describe('apiUrl', () => {
  it('prefixes /api and normalises slashes', () => {
    expect(apiUrl('health')).toBe('/api/health');
    expect(apiUrl('/health')).toBe('/api/health');
  });
});

describe('fetchHealth', () => {
  it('returns parsed JSON on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ status: 'ok', app: 'MediQueue OS', version: '0.1.0' }),
    });
    const h = await fetchHealth(fetchMock);
    expect(fetchMock).toHaveBeenCalledWith('/api/health', expect.any(Object));
    expect(h.status).toBe('ok');
  });

  it('throws ApiError with status on failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, status: 500, json: async () => ({ detail: 'boom' }),
    });
    await expect(fetchHealth(fetchMock)).rejects.toMatchObject({ name: 'ApiError', status: 500, message: 'boom' });
  });

  it('wraps network errors', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchHealth(fetchMock)).rejects.toBeInstanceOf(ApiError);
  });
});
