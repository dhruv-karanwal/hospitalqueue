import { useCallback, useEffect, useState } from 'react';
import Gantt, { GanttLegend } from '../components/Gantt.jsx';
import Matrix from '../components/Matrix.jsx';
import ParamControls from '../components/ParamControls.jsx';
import ScenarioPicker from '../components/ScenarioPicker.jsx';
import { ErrorNote, Loading, NumberField, PageHead, Panel, SelectField, Stat } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useRequest } from '../lib/hooks.js';
import { toBody } from '../lib/workload.js';
import { useWorkload } from '../store.jsx';

const setCell = (m, r, c, v) => m.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row));

function IOSection() {
  const { workload, setWorkload } = useWorkload();
  const fn = useCallback((w) => api.ioSimulate(toBody(w, { policy: w.policy, save_run: false })), []);
  const { data, loading, error, run } = useRequest(fn);
  const ioCount = workload.patients.reduce((n, p) => n + (p.io_requests?.length || 0), 0);
  return (
    <section className="stack" aria-labelledby="io-h">
      <h2 id="io-h">I/O devices and interrupts</h2>
      <Panel title="Workload">
        <ScenarioPicker suggest="lab-heavy-day" />
        <div style={{ marginTop: 12 }}><ParamControls workload={workload} onChange={setWorkload} only={['doctors', 'quantum', 'devices']} /></div>
        <p className="muted" style={{ marginTop: 8 }}>The current workload has {ioCount} I/O request{ioCount === 1 ? '' : 's'}. Add them in the Simulator as device@at:duration.</p>
        <button className="btn btn-primary" type="button" disabled={loading || !workload.patients.length} onClick={() => run(workload)}>
          {loading ? 'Simulating…' : 'Simulate I/O'}</button>
      </Panel>
      <ErrorNote error={error} />
      {loading && !data && <Loading height={200} label="Simulating I/O" />}
      {data && (
        <>
          <div className="stats">
            <Stat label="Interrupts" value={data.metrics.interrupts} />
            {data.devices.map((d) => <Stat key={d.name} label={`${d.name} (${d.units} unit${d.units > 1 ? 's' : ''})`} value={`${d.requests} requests`} sub={`${d.busy} busy min, longest queue ${d.max_queue}`} />)}
            <Stat label="Doctor utilization" value={`${(data.metrics.utilization * 100).toFixed(1)}%`} />
          </div>
          <Panel title="Doctors and devices">
            <Gantt segments={data.gantt} deviceSegments={data.device_gantt} rows={Array.from({ length: workload.doctors }, (_, i) => `D${i + 1}`)} label="Doctor and device timeline" />
            <GanttLegend showDevices />
          </Panel>
          <Panel title={`Device queue and interrupt log (${data.events.length})`}>
            {data.events.length === 0 ? <p className="muted">No I/O in this workload. Load the Lab-heavy day scenario.</p> : (
              <div className="steps-wrap">
                <table className="steps-table">
                  <thead><tr><th scope="col">Min</th><th scope="col">Event</th><th scope="col">Patient</th><th scope="col">Detail</th></tr></thead>
                  <tbody>{data.events.map((e, i) => (
                    <tr key={i}><td>{e.t}</td><td>{{ IO_REQUEST: 'Request (BLOCKED)', IO_START: 'Device starts', INTERRUPT: 'Interrupt (READY)' }[e.type]}</td><td>{e.patient}</td><td>{e.reason}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </section>
  );
}

function BankerSection() {
  const [st, setSt] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [reqProc, setReqProc] = useState('1');
  const [reqVec, setReqVec] = useState([1, 0, 2]);
  const [dl, setDl] = useState(null);
  const safety = useRequest(useCallback((body) => api.safetyCheck(body), []));
  const dead = useRequest(useCallback((body) => api.deadlockCheck(body), []));

  const reset = useCallback(() => {
    api.scenario('ambulance-dispatch').then((sc) => {
      const b = sc.banker;
      setSt({ resources: b.resources, processes: b.processes, available: b.available, max: b.max, allocation: b.allocation, samples: b.sample_requests });
      setDl(b.deadlock_example);
      safety.setData(null);
      dead.setData(null);
    }).catch(setLoadErr);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(reset, [reset]);

  if (loadErr) return <ErrorNote error={loadErr} onRetry={reset} />;
  if (!st) return <Loading height={240} label="Loading Banker's example" />;
  const body = { resources: st.resources, processes: st.processes, available: st.available, max: st.max, allocation: st.allocation };
  const need = st.max.map((row, i) => row.map((v, j) => v - st.allocation[i][j]));
  const res = safety.data;
  const seqNames = res?.state.sequence.map((i) => st.processes[i]);
  return (
    <section className="stack" aria-labelledby="bank-h">
      <h2 id="bank-h">Banker&apos;s algorithm: beds, ambulances, lab devices</h2>
      <p className="muted">Each unit declares the most it might ever need (Max). A request is granted only if, afterwards, some order still lets every unit finish: a safe sequence.</p>
      <Panel title="Current state" actions={<button className="btn btn-sm" type="button" onClick={reset}>Reset to example</button>}>
        <div className="grid grid-2">
          <Matrix caption="Allocation (held now)" rows={st.processes} cols={st.resources} values={st.allocation}
            onChange={(r, c, v) => setSt({ ...st, allocation: setCell(st.allocation, r, c, v) })} />
          <Matrix caption="Max (declared need)" rows={st.processes} cols={st.resources} values={st.max}
            onChange={(r, c, v) => setSt({ ...st, max: setCell(st.max, r, c, v) })} />
          <Matrix caption="Need = Max - Allocation" rows={st.processes} cols={st.resources} values={need}
            highlightRows={need.map((row, i) => (row.some((x) => x < 0) ? i : -1)).filter((i) => i >= 0)} />
          <Matrix caption="Available" rows={['Free']} cols={st.resources} values={[st.available]}
            onChange={(_, c, v) => setSt({ ...st, available: st.available.map((x, j) => (j === c ? v : x)) })} />
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" type="button" disabled={safety.loading} onClick={() => safety.run(body)}>Check safety</button>
        </div>
      </Panel>
      <Panel title="Request resources">
        <div className="row">
          <SelectField label="Requesting unit" value={reqProc} onChange={setReqProc} options={st.processes.map((p, i) => ({ value: String(i), label: p }))} />
          {st.resources.map((r, j) => (
            <NumberField key={r} label={r.replace('_', ' ')} min={0} max={1000} value={reqVec[j] ?? 0}
              onChange={(v) => setReqVec(st.resources.map((_, k) => (k === j ? v : reqVec[k] ?? 0)))} />
          ))}
          <button className="btn btn-primary" type="button" disabled={safety.loading}
            onClick={() => safety.run({ ...body, request: { process: Number(reqProc), vector: reqVec } })}>Check request</button>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>Textbook tries: {st.samples.map((s) => `${st.processes[s.process]} asks (${s.request.join(', ')}) gives ${s.expect}`).join('; ')}.</p>
      </Panel>
      <ErrorNote error={safety.error} />
      {res && (
        <Panel title="Result">
          {res.request && (
            <div className={`note ${res.request.granted ? 'note-ok' : 'note-error'}`} role="status" style={{ marginBottom: 12 }}>
              <strong>{res.request.granted ? 'Request granted' : 'Request not granted'}</strong>{res.request.reason}
              {res.request.granted && <div style={{ marginTop: 8 }}>
                <button className="btn btn-sm" type="button" onClick={() => { setSt({ ...st, available: res.request.available, allocation: res.request.allocation }); safety.setData(null); }}>
                  Apply the allocation</button></div>}
            </div>
          )}
          <div className={`note ${res.state.safe ? 'note-ok' : 'note-error'}`} role="status">
            <strong>Current state is {res.state.safe ? 'SAFE' : 'UNSAFE'}</strong>
            {res.state.safe ? `Safe sequence: ${seqNames.join(', ')}` : `No order lets ${res.state.unfinished.map((i) => st.processes[i]).join(', ')} finish.`}
          </div>
          {res.state.steps.length > 0 && (
            <table style={{ marginTop: 12 }}>
              <caption className="sr-only">Safety algorithm steps</caption>
              <thead><tr><th scope="col">Step</th><th scope="col">Unit finishes</th><th scope="col">Its need</th><th scope="col">Work before</th><th scope="col">Work after it releases</th></tr></thead>
              <tbody>{res.state.steps.map((s, i) => (
                <tr key={i}><td>{i + 1}</td><td>{st.processes[s.process]}</td><td>({s.need.join(', ')})</td><td>({s.work_before.join(', ')})</td><td>({s.work_after.join(', ')})</td></tr>
              ))}</tbody>
            </table>
          )}
        </Panel>
      )}
      {dl && (
        <Panel title="Deadlock detection">
          <p className="muted">Detection uses what each unit is waiting for right now (Request), not its declared maximum. Edit the request matrix and check.</p>
          <div className="grid grid-2">
            <Matrix caption="Allocation" rows={st.processes} cols={st.resources} values={dl.allocation}
              onChange={(r, c, v) => setDl({ ...dl, allocation: setCell(dl.allocation, r, c, v) })} />
            <Matrix caption="Request (waiting for)" rows={st.processes} cols={st.resources} values={dl.request}
              highlightRows={dead.data?.processes || []} onChange={(r, c, v) => setDl({ ...dl, request: setCell(dl.request, r, c, v) })} />
            <Matrix caption="Available" rows={['Free']} cols={st.resources} values={[dl.available]}
              onChange={(_, c, v) => setDl({ ...dl, available: dl.available.map((x, j) => (j === c ? v : x)) })} />
          </div>
          <button className="btn btn-primary" style={{ marginTop: 12 }} type="button" onClick={() => dead.run(dl)}>Detect deadlock</button>
          <div style={{ marginTop: 12 }}><ErrorNote error={dead.error} /></div>
          {dead.data && (
            <div className={`note ${dead.data.deadlocked ? 'note-error' : 'note-ok'}`} role="status">
              <strong>{dead.data.deadlocked ? 'Deadlock detected' : 'No deadlock'}</strong>
              {dead.data.deadlocked ? `Stuck (highlighted): ${dead.data.processes.map((i) => st.processes[i]).join(', ')}.`
                : `Everyone can finish in the order ${dead.data.completion_order.map((i) => st.processes[i]).join(', ')}.`}
            </div>
          )}
        </Panel>
      )}
    </section>
  );
}

export default function Resources() {
  return (
    <div className="stack">
      <PageHead title="I/O and resources">
        Lab, X-ray and pharmacy are I/O devices: a patient sent there is BLOCKED and returns to READY on a completion interrupt.
        Beds, ambulances and lab devices are limited resources protected by the Banker&apos;s algorithm.
      </PageHead>
      <IOSection />
      <BankerSection />
    </div>
  );
}
