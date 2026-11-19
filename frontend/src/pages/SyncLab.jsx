import { useCallback, useEffect, useState } from 'react';
import { ErrorNote, Loading, NumberField, PageHead, Panel, Stat, Toggle } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useRequest } from '../lib/hooks.js';

function usePlayer(length, ms = 350, startAtEnd = false) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => { setI(startAtEnd ? Math.max(0, length - 1) : 0); setPlaying(false); }, [length, startAtEnd]);
  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => setI((x) => { if (x >= length - 1) { setPlaying(false); return x; } return x + 1; }), ms);
    return () => clearInterval(id);
  }, [playing, length, ms]);
  return { i, setI, playing, setPlaying };
}

function PlayerControls({ p, length, label }) {
  return (
    <div className="row">
      <button className="btn btn-primary" type="button" onClick={() => { if (p.i >= length - 1) p.setI(0); p.setPlaying(!p.playing); }}>
        {p.playing ? 'Pause' : 'Play'}</button>
      <button className="btn" type="button" disabled={p.i <= 0} onClick={() => { p.setPlaying(false); p.setI(p.i - 1); }}>Back</button>
      <button className="btn" type="button" disabled={p.i >= length - 1} onClick={() => { p.setPlaying(false); p.setI(p.i + 1); }}>Step</button>
      <button className="btn" type="button" onClick={() => { p.setPlaying(false); p.setI(0); }}>Reset</button>
      <div className="field" style={{ flex: '1 1 200px' }}>
        <label htmlFor={`${label}-range`}>{label} {p.i + 1} of {length}</label>
        <input id={`${label}-range`} type="range" min={0} max={Math.max(0, length - 1)} value={p.i}
          onChange={(e) => { p.setPlaying(false); p.setI(Number(e.target.value)); }} />
      </div>
    </div>
  );
}

function RaceDemo() {
  const [cfg, setCfg] = useState({ workers: 2, tokens: 4, mode: 'none', phase: 'pickup' });
  const { data, loading, error, run } = useRequest(useCallback((c) => api.raceDemo(c), []));
  useEffect(() => { const id = setTimeout(() => run(cfg), 150); return () => clearTimeout(id); }, [cfg, run]);
  const steps = data?.steps || [];
  const p = usePlayer(steps.length, 300, true);
  const shown = steps.slice(0, p.i + 1);
  const pickup = cfg.phase === 'pickup';
  return (
    <section className="stack" aria-labelledby="race-h">
      <h2 id="race-h">Race condition: {pickup ? 'two counters, one "now serving" number' : 'two kiosks, one "next token" number'}</h2>
      <p className="muted">
        Each {pickup ? 'counter' : 'kiosk'} reads the shared number, uses it, then writes it back plus one. Instructions are interleaved one at a time,
        the worst case. Without a lock both read the same value.
      </p>
      <Panel title="Setup">
        <div className="row">
          <Toggle label="Lock" value={cfg.mode} onChange={(mode) => setCfg({ ...cfg, mode })}
            options={[{ value: 'none', label: 'Off (race)' }, { value: 'mutex', label: 'Mutex' }, { value: 'semaphore', label: 'Semaphore' }]} />
          <Toggle label="Demo" value={cfg.phase} onChange={(phase) => setCfg({ ...cfg, phase })}
            options={[{ value: 'pickup', label: 'Counter pickup' }, { value: 'issue', label: 'Token issue' }]} />
          <NumberField label={pickup ? 'Counters' : 'Kiosks'} min={2} max={4} value={cfg.workers} onChange={(workers) => setCfg({ ...cfg, workers })} />
          <NumberField label={pickup ? 'Tokens waiting' : 'Patients'} min={1} max={30} value={cfg.tokens} onChange={(tokens) => setCfg({ ...cfg, tokens })} />
        </div>
      </Panel>
      <ErrorNote error={error} />
      {loading && !data && <Loading height={160} label="Running race demo" />}
      {data && (
        <>
          <div className={`note ${data.correct ? 'note-ok' : 'note-error'}`} role="status">
            <strong>{data.correct ? `Correct: every ${pickup ? 'token served' : 'patient got a unique token'} exactly once`
              : `Race condition: ${data.duplicates.length} token${data.duplicates.length > 1 ? 's' : ''} ${pickup ? 'served twice or more' : 'issued to more than one patient'}`}</strong>
            {data.duplicates.slice(0, 4).map((d) => `Token ${d.token}: ${d.workers.join(' and ')}`).join('; ')}
            {pickup ? '' : ` Final counter ${data.final_counter} (should be ${cfg.tokens + 1}).`}
          </div>
          <Panel title="Interleaving, one instruction at a time">
            <PlayerControls p={p} length={steps.length} label="Instruction" />
            <div className="steps-wrap" style={{ marginTop: 12 }}>
              <table className="steps-table">
                <thead><tr><th scope="col">#</th><th scope="col">Who</th><th scope="col">Instruction</th><th scope="col">Local</th><th scope="col">Shared</th><th scope="col">Lock</th><th scope="col">What happened</th></tr></thead>
                <tbody>
                  {shown.map((s, k) => (
                    <tr key={s.step} className={`${/DUPLICATE/.test(s.note) ? 'dup' : ''}${k === shown.length - 1 && p.i < steps.length - 1 ? ' current' : ''}`}
                      aria-current={k === shown.length - 1 ? 'step' : undefined}>
                      <td>{s.step}</td><td>{s.worker}</td><td>{s.op}</td><td>{s.local}</td><td>{s.shared}</td><td>{s.lock}</td><td>{s.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </section>
  );
}

function ProducerConsumer() {
  const [cfg, setCfg] = useState({ capacity: 3, consumers: 2, service_time: 4, count: 12, interval: 1 });
  const { data, loading, error, run } = useRequest(useCallback((c) => api.producerConsumer(c), []));
  useEffect(() => { const id = setTimeout(() => run(cfg), 150); return () => clearTimeout(id); }, [cfg, run]);
  const frames = data?.frames || [];
  const p = usePlayer(frames.length, 450);
  const f = frames[p.i];
  const set = (k) => (v) => setCfg({ ...cfg, [k]: v });
  return (
    <section className="stack" aria-labelledby="pc-h">
      <h2 id="pc-h">Producer-consumer: the waiting area</h2>
      <p className="muted">Reception (producer) seats arriving patients in a waiting area with limited chairs (bounded buffer). Counters (consumers) call them.
        Semaphore <code>empty</code> counts free chairs and <code>full</code> counts seated patients.</p>
      <Panel title="Setup">
        <div className="row">
          <NumberField label="Chairs (capacity)" min={1} max={20} value={cfg.capacity} onChange={set('capacity')} />
          <NumberField label="Counters" min={1} max={6} value={cfg.consumers} onChange={set('consumers')} />
          <NumberField label="Service time (min)" min={1} max={30} value={cfg.service_time} onChange={set('service_time')} />
          <NumberField label="Arrivals" min={0} max={200} value={cfg.count} onChange={set('count')} />
          <NumberField label="Minutes between arrivals" min={0} max={60} value={cfg.interval} onChange={set('interval')} />
        </div>
      </Panel>
      <ErrorNote error={error} />
      {loading && !data && <Loading height={160} label="Running producer-consumer" />}
      {data && f && (
        <>
          <Panel title={`Minute ${f.t}`}>
            <PlayerControls p={p} length={frames.length} label="Minute" />
            <div className="grid grid-2" style={{ marginTop: 16 }} aria-live="polite">
              <div>
                <h3>Waiting area ({f.buffer.length} of {data.capacity} chairs taken)</h3>
                <div className="buffer" role="list" aria-label="Buffer slots">
                  {Array.from({ length: data.capacity }, (_, k) => (
                    <div key={k} role="listitem" className={`slot${f.buffer[k] ? ' full' : ''}`}>{f.buffer[k] || <span className="muted">empty</span>}</div>
                  ))}
                </div>
                <p style={{ marginTop: 12 }}><strong>Reception:</strong> {f.producer}
                  {f.producer.startsWith('blocked') && <span className="tag tag-bad" style={{ marginLeft: 8 }}>Producer blocked</span>}</p>
                <p><strong>At the door:</strong> {f.backlog.length ? f.backlog.join(', ') : 'nobody'}</p>
                <p className="num">empty = {f.empty}, full = {f.full}</p>
              </div>
              <div>
                <h3>Counters</h3>
                <ul style={{ paddingLeft: 18 }}>
                  {f.consumers.map((c) => (
                    <li key={c.id}><strong>{c.id}</strong>: {c.state}{c.patient ? ` ${c.patient}` : ''}
                      {c.state.startsWith('blocked') && <span className="tag tag-state" style={{ marginLeft: 8 }}>waiting on full</span>}</li>
                  ))}
                </ul>
              </div>
            </div>
          </Panel>
          <div className="stats">
            <Stat label="Seated (produced)" value={data.stats.produced} />
            <Stat label="Served (consumed)" value={data.stats.consumed} />
            <Stat label="Producer blocked" value={`${data.stats.producer_blocked_ticks} min`} />
            <Stat label="Counters idle-blocked" value={`${data.stats.consumer_blocked_ticks} min`} />
            <Stat label="Most chairs used" value={data.stats.max_occupancy} />
            <Stat label="Average wait at door" value={`${data.stats.avg_door_wait} min`} />
          </div>
        </>
      )}
    </section>
  );
}

export default function SyncLab() {
  return (
    <div className="stack">
      <PageHead title="Synchronization lab">
        Shared counters at a hospital front desk show why critical sections need a mutex or semaphore, and how a bounded buffer blocks producers and consumers.
      </PageHead>
      <RaceDemo />
      <ProducerConsumer />
    </div>
  );
}
