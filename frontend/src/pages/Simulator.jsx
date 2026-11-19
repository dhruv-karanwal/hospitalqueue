import { useMemo, useRef, useState } from 'react';
import { go } from '../lib/nav.js';
import ParamControls from '../components/ParamControls.jsx';
import ScenarioPicker from '../components/ScenarioPicker.jsx';
import VirtualList from '../components/VirtualList.jsx';
import { ErrorNote, Field, PageHead, Panel, Stat } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { formatMetric } from '../lib/metrics.js';
import {
  PRIORITIES, blankPatient, exportWorkload, formatIO, parseIO, parseWorkload, patientErrors, policyLabel,
} from '../lib/workload.js';
import { useWorkload } from '../store.jsx';

const COLS = '72px minmax(90px,1fr) 76px 76px 150px minmax(130px,1.2fr) 70px 44px';

function IOCell({ value, onCommit, label }) {
  const [text, setText] = useState(formatIO(value));
  const [err, setErr] = useState(null);
  return (
    <input aria-label={label} value={text} placeholder="lab@2:3" aria-invalid={!!err} title={err || 'device@at:duration'}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const r = parseIO(text);
        setErr(r.ok ? null : r.error);
        if (r.ok) onCommit(r.value);
      }} />
  );
}

export default function Simulator() {
  const { workload, setWorkload, runSimulation, running, error, result } = useWorkload();
  const [importText, setImportText] = useState('');
  const [importErr, setImportErr] = useState([]);
  const [saveId, setSaveId] = useState('');
  const [saveMsg, setSaveMsg] = useState(null);
  const fileRef = useRef(null);
  const patients = workload.patients;

  const rowErrors = useMemo(() => {
    const seen = new Set();
    return patients.map((p) => {
      const e = patientErrors(p);
      if (seen.has(p.id)) e.push('Duplicate ID');
      seen.add(p.id);
      if (p.doctor_id && p.doctor_id > workload.doctors) e.push('Doctor does not exist');
      return e;
    });
  }, [patients, workload.doctors]);
  const problems = rowErrors.flatMap((e, i) => e.map((m) => `Row ${i + 1} (${patients[i].id}): ${m}`));

  const update = (i, patch) => setWorkload({ ...workload, patients: patients.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const remove = (i) => setWorkload({ ...workload, patients: patients.filter((_, j) => j !== i) });
  const add = () => setWorkload({ ...workload, patients: [...patients, blankPatient(patients, patients.at(-1)?.arrival_time ?? 0)] });

  const doImport = (text) => {
    const r = parseWorkload(text, workload);
    if (!r.ok) { setImportErr(r.errors); return; }
    setImportErr([]);
    setImportText('');
    setWorkload(r.workload);
  };
  const doExport = () => {
    const blob = new Blob([exportWorkload(workload)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mediqueue-workload.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const doSave = async () => {
    setSaveMsg(null);
    try {
      await api.saveScenario({ id: saveId, title: saveId, description: `${patients.length} patients`, doctors: workload.doctors,
        policy: workload.policy, params: workload.params, patients });
      setSaveMsg({ ok: true, text: `Saved as "${saveId}". It now appears in the scenario list.` });
    } catch (e) {
      setSaveMsg({ ok: false, text: e.message });
    }
  };

  const m = result?.metrics;
  return (
    <div className="stack">
      <PageHead title="Simulator">
        Build a workload of patients (processes), choose how many doctors (CPUs) and a scheduling policy, then run it.
      </PageHead>

      <Panel title="Start from a scenario">
        <ScenarioPicker />
      </Panel>

      <Panel title="Policy and parameters">
        <ParamControls workload={workload} onChange={setWorkload} />
        <p className="muted" style={{ marginTop: 12 }}>
          Quantum is used by Round Robin; aging settings by Priority with aging. Starvation is flagged when a patient waits in READY longer than the threshold.
        </p>
      </Panel>

      <Panel title={`Patients (${patients.length})`} actions={<>
        <button className="btn btn-sm" type="button" onClick={add}>Add patient</button>
        <button className="btn btn-sm" type="button" onClick={doExport}>Export JSON</button>
        <button className="btn btn-sm" type="button" onClick={() => fileRef.current?.click()}>Import file</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden aria-label="Import workload file"
          onChange={async (e) => { const f = e.target.files?.[0]; if (f) doImport(await f.text()); e.target.value = ''; }} />
      </>}>
        {patients.length === 0 ? (
          <div className="empty"><h3>No patients yet</h3><p>Add a patient, load a scenario or import a JSON file to begin.</p>
            <button className="btn btn-primary" type="button" onClick={add}>Add patient</button></div>
        ) : (
          <VirtualList items={patients.map((p, i) => ({ ...p, key: `${i}` }))} rowHeight={48} height={460} columns={COLS} label="Patient table"
            header={<><span>ID</span><span>Name</span><span>Arrives</span><span>Consult</span><span>Priority</span><span>I/O (device@at:min)</span><span>Doctor</span><span><span className="sr-only">Remove</span></span></>}
            renderRow={(p, i) => (
              <>
                <input aria-label={`Row ${i + 1} ID`} value={p.id} aria-invalid={rowErrors[i].some((e) => /ID/.test(e))}
                  onChange={(e) => update(i, { id: e.target.value })} style={{ width: '100%' }} />
                <input aria-label={`Row ${i + 1} name`} value={p.name} onChange={(e) => update(i, { name: e.target.value })} style={{ width: '100%' }} />
                <input aria-label={`Row ${i + 1} arrival minute`} type="number" min={0} value={p.arrival_time}
                  aria-invalid={rowErrors[i].some((e) => /Arrival/.test(e))}
                  onChange={(e) => update(i, { arrival_time: Number.parseInt(e.target.value, 10) })} />
                <input aria-label={`Row ${i + 1} consultation minutes`} type="number" min={1} value={p.burst_time}
                  aria-invalid={rowErrors[i].some((e) => /Consultation/.test(e))}
                  onChange={(e) => update(i, { burst_time: Number.parseInt(e.target.value, 10) })} />
                <select aria-label={`Row ${i + 1} priority`} value={p.priority} onChange={(e) => update(i, { priority: Number(e.target.value) })}>
                  {PRIORITIES.map((x) => <option key={x.level} value={x.level}>P{x.level} {x.name}</option>)}
                </select>
                <IOCell key={`${p.id}-${formatIO(p.io_requests)}`} value={p.io_requests} label={`Row ${i + 1} I/O requests`}
                  onCommit={(v) => update(i, { io_requests: v })} />
                <select aria-label={`Row ${i + 1} preferred doctor`} value={p.doctor_id || ''} disabled={workload.params.queue_mode !== 'per_doctor'}
                  onChange={(e) => update(i, { doctor_id: e.target.value ? Number(e.target.value) : undefined })}>
                  <option value="">Any</option>
                  {Array.from({ length: workload.doctors }, (_, d) => <option key={d} value={d + 1}>D{d + 1}</option>)}
                </select>
                <button className="btn btn-sm btn-ghost btn-danger" type="button" aria-label={`Remove ${p.id}`} onClick={() => remove(i)}>✕</button>
              </>
            )} />
        )}
        {problems.length > 0 && (
          <div className="note note-error" role="alert" style={{ marginTop: 12 }}>
            <strong>Fix these before running</strong>
            <ul>{problems.slice(0, 6).map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        )}
      </Panel>

      <Panel title="Run">
        <div className="row">
          <button className="btn btn-primary" type="button" disabled={running || problems.length > 0 || !patients.length}
            onClick={() => runSimulation()}>{running ? 'Running…' : `Run ${policyLabel(workload.policy)}`}</button>
          {result && <>
            <button className="btn" type="button" onClick={() => go('timeline')}>Open timeline</button>
            <button className="btn" type="button" onClick={() => go('trace')}>Open trace</button>
          </>}
        </div>
        <div style={{ marginTop: 12 }}><ErrorNote error={error} /></div>
        {m && (
          <div style={{ marginTop: 12 }}>
            <p className="muted" role="status">Last run: {result.policy_label}, {m.completed} patients, finished at minute {m.makespan}.</p>
            <div className="stats">
              <Stat label="Average wait" value={`${formatMetric('avg_waiting', m.avg_waiting)} min`} />
              <Stat label="Longest wait" value={`${m.max_wait} min`} />
              <Stat label="Average turnaround" value={`${formatMetric('avg_turnaround', m.avg_turnaround)} min`} />
              <Stat label="Average response" value={`${formatMetric('avg_response', m.avg_response)} min`} />
              <Stat label="Utilization" value={formatMetric('utilization', m.utilization)} />
              <Stat label="Context switches" value={m.context_switches} sub={`${m.preemptions} preemptions`} />
              <Stat label="Starved" value={m.starvation_count} sub={`threshold ${workload.params.starvation_threshold} min`} />
            </div>
          </div>
        )}
      </Panel>

      <div className="grid grid-2">
        <Panel title="Import JSON">
          <Field label="Paste a workload or an array of patients">
            {(id) => <textarea id={id} value={importText} onChange={(e) => setImportText(e.target.value)}
              placeholder='[{"id":"P1","arrival_time":0,"burst_time":5,"priority":2}]' />}
          </Field>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn" type="button" disabled={!importText.trim()} onClick={() => doImport(importText)}>Import</button>
          </div>
          {importErr.length > 0 && (
            <div className="note note-error" role="alert" style={{ marginTop: 8 }}>
              <strong>Import failed</strong><ul>{importErr.slice(0, 6).map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          )}
        </Panel>
        <Panel title="Save as a scenario">
          <Field label="Scenario ID" hint="3-40 lowercase letters, digits or hyphens. Stored in SQLite.">
            {(id) => <input id={id} value={saveId} onChange={(e) => setSaveId(e.target.value.toLowerCase())} placeholder="my-ward-test" />}
          </Field>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn" type="button" disabled={!/^[a-z0-9-]{3,40}$/.test(saveId) || problems.length > 0} onClick={doSave}>Save scenario</button>
          </div>
          {saveMsg && <div className={`note ${saveMsg.ok ? 'note-ok' : 'note-error'}`} role="status" style={{ marginTop: 8 }}>{saveMsg.text}</div>}
        </Panel>
      </div>
    </div>
  );
}
