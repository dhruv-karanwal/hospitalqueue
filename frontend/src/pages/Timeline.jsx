import { useEffect, useMemo, useState } from 'react';
import { go } from '../lib/nav.js';
import Gantt, { GanttLegend } from '../components/Gantt.jsx';
import { Empty, ErrorNote, PageHead, Panel, SelectField } from '../components/ui.jsx';
import { decisionsAt, eventTimes, timeBounds } from '../lib/gantt.js';
import { TYPE_LABELS } from '../lib/trace.js';
import { useWorkload } from '../store.jsx';

export default function Timeline() {
  const { result, runSimulation, running, error, workload } = useWorkload();
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState('300');
  const end = useMemo(() => (result ? timeBounds(result.gantt.concat(result.device_gantt)).end : 0), [result]);
  const times = useMemo(() => (result ? eventTimes(result.trace) : []), [result]);

  useEffect(() => { setT(end); setPlaying(false); }, [result, end]);
  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => setT((x) => {
      if (x >= end) { setPlaying(false); return end; }
      return x + 1;
    }), Number(speed));
    return () => clearInterval(id);
  }, [playing, end, speed]);

  const now = useMemo(() => (result ? decisionsAt(result.trace, Math.min(t, end)) : []), [result, t, end]);
  const recent = useMemo(() => {
    if (!result) return [];
    return result.trace.filter((e) => e.t < t && ['DISPATCH', 'PREEMPT', 'QUANTUM_EXPIRED', 'INTERRUPT', 'AGING'].includes(e.type)).slice(-5).reverse();
  }, [result, t]);

  if (!result) {
    return (
      <div className="stack">
        <PageHead title="Timeline" />
        <Empty title="Nothing to show yet" action={
          <button className="btn btn-primary" type="button" disabled={running} onClick={() => runSimulation()}>
            {running ? 'Running…' : `Run the current workload (${workload.patients.length} patients)`}</button>}>
          Run a simulation to see each doctor&apos;s schedule as a Gantt chart, then replay it minute by minute.
        </Empty>
        <ErrorNote error={error} />
      </div>
    );
  }

  const prevT = [...times].reverse().find((x) => x < t) ?? 0;
  const nextT = times.find((x) => x > t) ?? end;
  return (
    <div className="stack">
      <PageHead title="Timeline">
        {result.policy_label}, {result.doctors.length} doctor{result.doctors.length > 1 ? 's' : ''}, {result.queue_mode === 'global' ? 'one common queue' : 'a queue per doctor'}.
        Replay the schedule and read why each decision was made.
      </PageHead>
      <Panel title="Playback">
        <div className="row">
          <button className="btn btn-primary" type="button" onClick={() => { if (t >= end) setT(0); setPlaying((p) => !p); }}>
            {playing ? 'Pause' : t >= end ? 'Replay' : 'Play'}</button>
          <button className="btn" type="button" onClick={() => { setPlaying(false); setT(Math.max(0, t - 1)); }} disabled={t <= 0}>Back 1 min</button>
          <button className="btn" type="button" onClick={() => { setPlaying(false); setT(Math.min(end, t + 1)); }} disabled={t >= end}>Step 1 min</button>
          <button className="btn" type="button" onClick={() => { setPlaying(false); setT(prevT); }}>Previous event</button>
          <button className="btn" type="button" onClick={() => { setPlaying(false); setT(nextT); }}>Next event</button>
          <button className="btn" type="button" onClick={() => { setPlaying(false); setT(0); }}>Reset</button>
          <SelectField label="Speed" value={speed} onChange={setSpeed}
            options={[{ value: '600', label: 'Slow' }, { value: '300', label: 'Normal' }, { value: '80', label: 'Fast' }]} />
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="scrub">Minute {t} of {end}</label>
          <input id="scrub" type="range" min={0} max={end} value={t} onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }} />
        </div>
      </Panel>
      <Panel title="Ward board">
        <Gantt segments={result.gantt} deviceSegments={result.device_gantt} rows={result.doctors.map((d) => d.id)} playhead={t}
          label={`Gantt chart for ${result.policy_label}`} />
        <GanttLegend showDevices={result.device_gantt.length > 0} />
      </Panel>
      <div className="grid grid-2">
        <Panel title={`What happened at minute ${t}`}>
          <div aria-live="polite">
            {now.length === 0 ? <p className="muted">No scheduling decision at this minute. Use Next event to jump to the next one.</p>
              : now.map((e, i) => (
                <div className="decision" data-type={e.type} key={i}>
                  <strong>{TYPE_LABELS[e.type] || e.type}</strong>
                  <div>{e.reason}</div>
                </div>
              ))}
          </div>
        </Panel>
        <Panel title="Earlier decisions">
          {recent.length === 0 ? <p className="muted">None yet.</p> : recent.map((e, i) => (
            <div className="decision" data-type={e.type} key={i}>
              <strong>Minute {e.t}: {TYPE_LABELS[e.type]}</strong>
              <div>{e.reason}</div>
            </div>
          ))}
          <button className="btn btn-sm" type="button" onClick={() => go('trace')}>Open the full trace</button>
        </Panel>
      </div>
    </div>
  );
}
