import { useMemo, useState } from 'react';
import VirtualList from '../components/VirtualList.jsx';
import { Empty, Field, PageHead, Panel, SelectField } from '../components/ui.jsx';
import { useDebounced } from '../lib/hooks.js';
import { go } from '../lib/nav.js';
import { TYPE_LABELS, filterTrace, tracePatients, traceTypes } from '../lib/trace.js';
import { useWorkload } from '../store.jsx';

const COLS = '56px 130px 92px 72px minmax(240px, 1fr)';

export default function Trace() {
  const { result } = useWorkload();
  const [patient, setPatient] = useState('');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 200);
  const events = result?.trace || [];
  const patients = useMemo(() => tracePatients(events), [events]);
  const types = useMemo(() => traceTypes(events), [events]);
  const rows = useMemo(() => filterTrace(events, { patient, type, q: dq }), [events, patient, type, dq]);

  if (!result) {
    return (
      <div className="stack">
        <PageHead title="Trace" />
        <Empty title="No trace yet" action={<button className="btn btn-primary" type="button" onClick={() => go('simulator')}>Go to the simulator</button>}>
          Run a simulation first. Every arrival, dispatch, preemption, interrupt and aging step will be listed here.
        </Empty>
      </div>
    );
  }
  return (
    <div className="stack">
      <PageHead title="Trace">
        Every event from the last run ({result.policy_label}): time, who acted, and why.
      </PageHead>
      <Panel title="Filter">
        <div className="row">
          <SelectField label="Patient" value={patient} onChange={setPatient} options={[{ value: '', label: 'All patients' }, ...patients.map((p) => ({ value: p, label: p }))]} />
          <SelectField label="Event type" value={type} onChange={setType} options={[{ value: '', label: 'All types' }, ...types.map((t) => ({ value: t, label: TYPE_LABELS[t] || t }))]} />
          <Field label="Search reasons">{(id) => <input id={id} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. preempted" />}</Field>
          {(patient || type || q) && <button className="btn" type="button" onClick={() => { setPatient(''); setType(''); setQ(''); }}>Clear filters</button>}
        </div>
        <p className="muted" role="status" style={{ marginTop: 8 }}>Showing {rows.length} of {events.length} events.</p>
      </Panel>
      {rows.length === 0 ? <Empty title="No matching events">Try a different patient, type or search term.</Empty> : (
        <VirtualList items={rows} rowHeight={44} height={560} columns={COLS} label="Execution trace"
          header={<><span>Min</span><span>Event</span><span>Actor</span><span>Patient</span><span>Reason</span></>}
          renderRow={(e) => (
            <>
              <span>{e.t}</span>
              <span>{TYPE_LABELS[e.type] || e.type}</span>
              <span>{e.actor}</span>
              <span>{e.patient ? <button className="btn btn-sm btn-ghost" type="button" onClick={() => setPatient(e.patient)} aria-label={`Show only ${e.patient}`}>{e.patient}</button> : '–'}</span>
              <span className="cell-ellipsis" title={e.reason}>{e.from && e.to ? `${e.from} to ${e.to}: ` : ''}{e.reason}</span>
            </>
          )} />
      )}
    </div>
  );
}
