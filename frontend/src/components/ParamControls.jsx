import { NumberField, SelectField, Toggle } from './ui.jsx';
import { POLICIES } from '../lib/workload.js';

// Policy + parameter controls bound to a workload object.
export default function ParamControls({ workload, onChange, showPolicy = true, only }) {
  const p = workload.params;
  const setP = (k, v) => onChange({ ...workload, params: { ...p, [k]: v } });
  const setDev = (k, v) => onChange({ ...workload, params: { ...p, devices: { ...p.devices, [k]: v } } });
  const want = (k) => !only || only.includes(k);
  return (
    <div className="row">
      {showPolicy && (
        <SelectField label="Scheduling policy" value={workload.policy} onChange={(v) => onChange({ ...workload, policy: v })}
          options={POLICIES.map((x) => ({ value: x.id, label: x.label }))} />
      )}
      {want('doctors') && <NumberField label="Doctors" min={1} max={20} value={workload.doctors} onChange={(v) => onChange({ ...workload, doctors: v })} />}
      {want('quantum') && <NumberField label="RR quantum (min)" min={1} max={100} value={p.quantum} onChange={(v) => setP('quantum', v)} />}
      {want('context_switch_cost') && <NumberField label="Switch cost (min)" min={0} max={10} value={p.context_switch_cost} onChange={(v) => setP('context_switch_cost', v)} />}
      {want('aging_interval') && <NumberField label="Aging every (min)" min={1} max={1000} value={p.aging_interval} onChange={(v) => setP('aging_interval', v)} />}
      {want('aging_step') && <NumberField label="Aging step" min={1} max={4} value={p.aging_step} onChange={(v) => setP('aging_step', v)} />}
      {want('starvation_threshold') && <NumberField label="Starvation after (min)" min={1} max={100000} value={p.starvation_threshold} onChange={(v) => setP('starvation_threshold', v)} />}
      {want('queue_mode') && (
        <Toggle label="Queues" value={p.queue_mode} onChange={(v) => setP('queue_mode', v)}
          options={[{ value: 'global', label: 'One common queue' }, { value: 'per_doctor', label: 'Queue per doctor' }]} />
      )}
      {want('devices') && ['lab', 'xray', 'pharmacy'].map((d) => (
        <NumberField key={d} label={`${d === 'xray' ? 'X-ray' : d[0].toUpperCase() + d.slice(1)} units`} min={1} max={10}
          value={p.devices[d]} onChange={(v) => setDev(d, v)} />
      ))}
    </div>
  );
}
