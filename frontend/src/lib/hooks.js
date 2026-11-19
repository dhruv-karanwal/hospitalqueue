import { useCallback, useEffect, useRef, useState } from 'react';

export function useDebounced(value, ms = 200) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

// Run an async function, tracking loading / error / data; ignores stale responses.
export function useRequest(fn) {
  const [state, setState] = useState({ loading: false, error: null, data: null });
  const seq = useRef(0);
  const run = useCallback(async (...args) => {
    const my = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn(...args);
      if (my === seq.current) setState({ loading: false, error: null, data });
      return data;
    } catch (error) {
      if (my === seq.current) setState((s) => ({ ...s, loading: false, error }));
      return null;
    }
  }, [fn]);
  return { ...state, run, setData: (data) => setState((s) => ({ ...s, data })) };
}

export function readStore(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStore(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export function debounce(fn, ms) {
  let id;
  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), ms);
  };
}
