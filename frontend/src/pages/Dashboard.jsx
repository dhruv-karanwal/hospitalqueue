import { useCallback, useEffect, useRef, useState } from 'react';
import Gantt, { GanttLegend } from '../components/Gantt.jsx';
import VirtualList from '../components/VirtualList.jsx';
import { Empty, ErrorNote, NumberField, PageHead, Panel, PriorityTag, SelectField, Stat, StateTag } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { formatMetric } from '../lib/metrics.js';
import { PRIORITIES, policyLabel, toBody } from '../lib/workload.js';
import { TYPE_LABELS } from '../lib/trace.js';
import { useWorkload } from '../store.jsx';

const TABLE_COLS = '70px 110px 70px 80px 80px 90px 70px';

export default function Dashboard() {
  const { workload } = useWorkload();
  const [sid, setSid] = useState(null);
  const [snap, setSnap] = useState(null);
  const [events, setEvents] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(null);
  const [withPatients, setWithPatients] = useState('yes');
  const [walk, setWalk] = useState({ priority: 1, burst: 3 });
  const busy = useRef(false);
  const counter = useRef(1);

  const refresh = useCallback(async (id, s) => {
    setSnap(s);
    const tr = await api.sessionTrace(id, { limit: 8 });
    setEvents(tr.events.slice().reverse());
  }, []);

  const start = async () => {
    setError(null);
    setPlaying(false);
    try {
      const body = toBody(workload);
      const res = await api.sessionCreate({ patients: withPatients === 'yes' ? body.patients.slice(0, 300) : [],
        doctors: workload.doctors, policy: workload.policy, params: workload.params });
      setSid(res.id);
      counter.current = 1;
      await refresh(res.id, res.state);
    } catch (e) { setError(e); }
  };

  const step = useCallback(async (ticks = 1) => {
    if (!sid || busy.current) return;
    busy.current = true;
    try {
      const s = await api.sessionStep(sid, ticks);
      await refresh(sid, s);
    } catch (e) { setError(e); setPlaying(false); } finally { busy.current = false; }
  }, [sid, refresh]);

  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => step(1), 700);
    return () => clearInterval(id);
  }, [playing, step]);

  const addWalkIn = async () => {
    if (!sid) return;
    let id = `W${counter.current}`;
    const used = new Set(snap.process_table.map((p) => p.id));
    while (used.has(id)) { counter.current += 1; id = `W${counter.current}`; }
    counter.current += 1;
    try {
      const s = await api.sessionAdd(sid, [{ id, name: `Walk-in ${id}`, arrival_time: snap.clock, burst_time: walk.burst, priority: walk.priority }]);
      await refresh(sid, s);
    } catch (e) { setError(e); }
  };

  const m = snap?.metrics;
  const running = snap?.doctors.filter((d) => d.patient) || [];
  const waiting = snap?.process_table.filter((p) => p.state === 'READY').length ?? 0;
  const prioOf = (pid) => snap?.process_table.find((p) => p.id === pid)?.eff_priority;

  return (
    <div className="stack">
      <PageHead title="Dashboard">
        A live ward. Start a session, step the clock minute by minute or press play, and add walk-in patients at any time.
      </PageHead>
      <Panel title="Live session">
        <div className="row">
          <SelectField label="Start with" value={withPatients} onChange={setWithPatients}
            options={[{ value: 'yes', label: `Current workload (${workload.patients.length} patients)` }, { value: 'no', label: 'An empty ward' }]} />
          <button className="btn btn-primary" type="button" onClick={start}>{sid ? 'Restart session' : 'Start session'}</button>
          <button className="btn" type="button" disabled={!sid} onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</button>
          <button className="btn" type="button" disabled={!sid || playing} onClick={() => step(1)}>Step 1 min</button>
          <button className="btn" type="button" disabled={!sid || playing} onClick={() => step(5)}>Step 5 min</button>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>{policyLabel(workload.policy)} with {workload.doctors} doctor{workload.doctors > 1 ? 's' : ''}. Change these in the Simulator, then restart.</p>
      </Panel>
      <ErrorNote error={error} />
      {!snap ? (
        <Empty title="No live session">Start a session to watch the queue, the doctors and the clock change as time passes.</Empty>
      ) : (
        <>
          <div className="grid grid-3">
            <div className="panel">
              <div className="stat-label">Clock</div>
              <div className="clock" aria-live="polite"><span className="clock-value">{snap.clock}</span><span className="clock-unit">min</span></div>
              <div className="stat-sub">{snap.finished ? 'All patients done' : `${waiting} waiting, ${running.length} with a doctor`}</div>
            </div>
            <Stat label="Completed" value={`${m.completed} of ${m.total}`} sub={`${m.preemptions} preemptions, ${m.context_switches} switches`} />
            <Stat label="Average wait (completed)" value={`${formatMetric('avg_waiting', m.avg_waiting)} min`} sub={`longest ${m.max_wait} min`} />
          </div>
          <Panel title="Add a walk-in patient">
            <div className="row">
              <SelectField label="Priority" value={String(walk.priority)} onChange={(v) => setWalk({ ...walk, priority: Number(v) })}
                options={PRIORITIES.map((p) => ({ value: String(p.level), label: `P${p.level} ${p.name}` }))} />
              <NumberField label="Consultation (min)" min={1} max={200} value={walk.burst} onChange={(burst) => setWalk({ ...walk, burst })} />
              <button className="btn btn-primary" type="button" onClick={addWalkIn}>Add walk-in at minute {snap.clock}</button>
            </div>
          </Panel>
          <div className="grid grid-3">
            {snap.doctors.map((d) => (
              <div key={d.id} className="doctor" data-status={d.status}>
                <h3>{d.id}</h3>
                {d.patient ? (
                  <p style={{ margin: 0 }}>{d.status === 'switching' ? 'Switching to ' : 'Seeing '}<strong>{d.patient}</strong> <PriorityTag p={d.priority} /><br />
                    <span className="muted">{d.remaining} min left{snap.policy === 'RR' ? `, ${d.quantum_used} min into quantum` : ''}</span></p>
                ) : <p className="muted" style={{ margin: 0 }}>Idle</p>}
              </div>
            ))}
          </div>
          <div className="grid grid-2">
            <Panel title="Ready queues (next first)">
              {snap.queues.map((q) => (
                <div key={q.name} style={{ marginBottom: 8 }}>
                  <div className="stat-label">{q.name} ({q.patients.length})</div>
                  <div className="queue" role="list" aria-label={`${q.name} queue`}>
                    {q.patients.length === 0 ? <span className="muted">Empty</span> : q.patients.map((pid) => (
                      <span key={pid} className="token" role="listitem"><span className="dot" data-p={prioOf(pid)} aria-hidden="true" />{pid} <span className="muted">P{prioOf(pid)}</span></span>
                    ))}
                  </div>
                </div>
              ))}
            </Panel>
            <Panel title="Devices">
              {snap.devices.map((d) => (
                <p key={d.name} style={{ marginBottom: 6 }}><strong>{d.name}</strong>: {d.in_service.length ? `serving ${d.in_service.join(', ')}` : 'free'}
                  {d.queue.length ? `; queue ${d.queue.join(', ')}` : ''} <span className="muted">({d.free} of {d.units} free)</span></p>
              ))}
            </Panel>
          </div>
          <Panel title="Latest events">
            {events.length === 0 ? <p className="muted">Nothing yet. Step the clock.</p> : events.map((e, i) => (
              <div className="decision" data-type={e.type} key={`${e.t}-${i}`}><strong>Minute {e.t}: {TYPE_LABELS[e.type]}</strong> {e.reason}</div>
            ))}
          </Panel>
          {snap.gantt.length > 0 && (
            <Panel title="Schedule so far">
              <Gantt segments={snap.gantt} rows={snap.doctors.map((d) => d.id)} playhead={snap.clock} label="Live schedule" />
              <GanttLegend />
            </Panel>
          )}
          <Panel title={`Process table (${snap.process_table.length})`}>
            {snap.process_table.length === 0 ? <p className="muted">No patients yet. Add a walk-in.</p> : (
              <VirtualList items={snap.process_table.map((p) => ({ ...p, key: p.id }))} rowHeight={40} height={360} columns={TABLE_COLS} label="Process table"
                header={<><span>ID</span><span>State</span><span>Priority</span><span>Arrived</span><span>Left</span><span>In READY</span><span>Doctor</span></>}
                renderRow={(p) => (<><span>{p.id}</span><span><StateTag s={p.state} /></span>
                  <span><PriorityTag p={p.eff_priority} /></span><span>{p.arrival}</span><span>{p.remaining} min</span><span>{p.ready_wait} min</span><span>{p.doctor || '–'}</span></>)} />
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
