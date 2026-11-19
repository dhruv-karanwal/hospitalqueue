import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './lib/api.js';
import { defaultWorkload, toBody } from './lib/workload.js';
import { readStore, writeStore } from './lib/hooks.js';

const Ctx = createContext(null);
const KEY = 'mediqueue.workload.v1';

export function WorkloadProvider({ children }) {
  const [workload, setWorkload] = useState(() => readStore(KEY, null) || defaultWorkload());
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const id = setTimeout(() => writeStore(KEY, workload), 300);   // debounced persistence
    return () => clearTimeout(id);
  }, [workload]);

  const runSimulation = useCallback(async (w = workload) => {
    setRunning(true);
    setError(null);
    try {
      const r = await api.simulate(toBody(w, { policy: w.policy }));
      setResult({ ...r, workload: w });
      return r;
    } catch (e) {
      setError(e);
      return null;
    } finally {
      setRunning(false);
    }
  }, [workload]);

  const value = useMemo(() => ({ workload, setWorkload, result, setResult, runSimulation, running, error }),
    [workload, result, runSimulation, running, error]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useWorkload = () => useContext(Ctx);
