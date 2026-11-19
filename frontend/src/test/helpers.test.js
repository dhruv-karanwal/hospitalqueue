import { describe, it, expect, vi } from 'vitest';
import { describeDetail } from '../lib/api.js';
import {
  defaultWorkload, parseWorkload, exportWorkload, nextPatientId, patientErrors, toBody, fromScenario, priorityName,
} from '../lib/workload.js';
import { bestByMetric, formatMetric, METRICS } from '../lib/metrics.js';
import { clipToTime, groupRows, niceTicks, timeBounds, decisionsAt, eventTimes } from '../lib/gantt.js';
import { filterTrace, tracePatients } from '../lib/trace.js';
import { visibleRange } from '../lib/virtual.js';
import { debounce } from '../lib/hooks.js';

describe('describeDetail', () => {
  it('flattens FastAPI validation errors', () => {
    expect(describeDetail([{ loc: ['body', 'doctors'], msg: 'too small' }])).toBe('doctors: too small');
    expect(describeDetail('plain')).toBe('plain');
    expect(describeDetail(undefined)).toBe(null);
  });
});

describe('workload', () => {
  it('round-trips through export and import', () => {
    const w = defaultWorkload();
    const r = parseWorkload(exportWorkload(w));
    expect(r.ok).toBe(true);
    expect(r.workload.patients).toEqual(w.patients);
    expect(r.workload.policy).toBe(w.policy);
  });
  it('accepts a bare array and normalises numbers', () => {
    const r = parseWorkload('[{"id":"A","arrival_time":"2","burst_time":3}]');
    expect(r.ok).toBe(true);
    expect(r.workload.patients[0]).toMatchObject({ id: 'A', arrival_time: 2, burst_time: 3, priority: 3 });
  });
  it('rejects bad JSON, duplicates and out-of-range values', () => {
    expect(parseWorkload('{nope').ok).toBe(false);
    expect(parseWorkload('{"x":1}').errors[0]).toMatch(/patients/);
    const dup = parseWorkload('[{"id":"A","arrival_time":0,"burst_time":2},{"id":"A","arrival_time":0,"burst_time":2}]');
    expect(dup.errors.join()).toMatch(/duplicate/);
    const bad = parseWorkload('[{"id":"A","arrival_time":0,"burst_time":0,"priority":7}]');
    expect(bad.errors.length).toBe(2);
  });
  it('validates I/O requests', () => {
    expect(patientErrors({ id: 'A', arrival_time: 0, burst_time: 3, priority: 1, io_requests: [{ at: 3, device: 'lab', duration: 1 }] }))
      .toHaveLength(1);
    expect(patientErrors({ id: 'A', arrival_time: 0, burst_time: 3, priority: 1, io_requests: [{ at: 1, device: 'mri', duration: 1 }] }))
      .toHaveLength(1);
  });
  it('picks unused ids', () => {
    expect(nextPatientId([{ id: 'P1' }, { id: 'P3' }])).toBe('P4');
    expect(nextPatientId([{ id: 'P2' }])).toBe('P3');
  });
  it('builds request bodies and loads scenarios', () => {
    const b = toBody(defaultWorkload(), { policy: 'RR' });
    expect(b).toMatchObject({ doctors: 2, policy: 'RR' });
    const w = fromScenario({ doctors: 1, policy: 'FCFS', params: { quantum: 3 }, patients: [{ id: 'A', arrival_time: 0, burst_time: 2, priority: 1 }] });
    expect(w.params.quantum).toBe(3);
    expect(w.params.devices.lab).toBe(1);
    expect(priorityName(1)).toBe('Resuscitation');
  });
});

describe('metrics', () => {
  const results = [
    { policy: 'FCFS', metrics: { ...Object.fromEntries(METRICS.map((m) => [m.key, 5])), utilization: 0.5 } },
    { policy: 'SJF', metrics: { ...Object.fromEntries(METRICS.map((m) => [m.key, 5])), avg_waiting: 3, utilization: 0.9 } },
  ];
  it('finds best per metric including ties', () => {
    const b = bestByMetric(results);
    expect(b.avg_waiting).toEqual(['SJF']);
    expect(b.utilization).toEqual(['SJF']);
    expect(b.max_wait).toEqual(['FCFS', 'SJF']);
  });
  it('formats values', () => {
    expect(formatMetric('utilization', 0.4567)).toBe('45.7%');
    expect(formatMetric('avg_waiting', 6.5)).toBe('6.50');
    expect(formatMetric('max_wait', 4)).toBe('4');
    expect(formatMetric('x', null)).toBe('–');
  });
});

describe('gantt helpers', () => {
  const segs = [
    { doctor: 'D1', patient: 'A', start: 0, end: 4 },
    { doctor: 'D2', patient: 'B', start: 2, end: 9 },
  ];
  it('computes bounds and rows', () => {
    expect(timeBounds(segs)).toEqual({ start: 0, end: 9 });
    expect(timeBounds([])).toEqual({ start: 0, end: 0 });
    expect(groupRows(segs, 'doctor', ['D1', 'D2', 'D3']).map((r) => [r.id, r.segs.length])).toEqual([['D1', 1], ['D2', 1], ['D3', 0]]);
  });
  it('clips to playhead', () => {
    const c = clipToTime(segs, 3);
    expect(c).toHaveLength(2);
    expect(c[1]).toMatchObject({ end: 3, partial: true });
    expect(clipToTime(segs, 0)).toHaveLength(0);
  });
  it('makes nice ticks', () => {
    expect(niceTicks(0, 30, 6)).toEqual([0, 5, 10, 15, 20, 25, 30]);
    expect(niceTicks(0, 3, 10)).toEqual([0, 1, 2, 3]);
  });
  it('finds decisions at a time', () => {
    const tr = [{ t: 0, type: 'ARRIVAL' }, { t: 0, type: 'DISPATCH' }, { t: 2, type: 'IO_START' }, { t: 2, type: 'PREEMPT' }];
    expect(decisionsAt(tr, 2).map((e) => e.type)).toEqual(['PREEMPT']);
    expect(eventTimes(tr)).toEqual([0, 2]);
  });
});

describe('trace filter', () => {
  const ev = [
    { t: 0, type: 'ARRIVAL', actor: 'reception', patient: 'P10', reason: 'P10 arrives' },
    { t: 1, type: 'DISPATCH', actor: 'scheduler', patient: 'P2', reason: 'SJF picks P2' },
  ];
  it('filters by patient, type and text', () => {
    expect(filterTrace(ev, { patient: 'P2' })).toHaveLength(1);
    expect(filterTrace(ev, { type: 'ARRIVAL' })[0].patient).toBe('P10');
    expect(filterTrace(ev, { q: 'sjf' })).toHaveLength(1);
    expect(filterTrace(ev, { q: 'RECEPTION' })).toHaveLength(1);
    expect(tracePatients(ev)).toEqual(['P2', 'P10']);
  });
});

describe('virtual list window', () => {
  it('renders only the visible slice plus overscan', () => {
    expect(visibleRange(0, 400, 40, 1000, 2)).toEqual({ start: 0, end: 12, offset: 0, total: 40000 });
    expect(visibleRange(4000, 400, 40, 1000, 2)).toEqual({ start: 98, end: 112, offset: 3920, total: 40000 });
    expect(visibleRange(0, 400, 40, 0)).toEqual({ start: 0, end: 0, offset: 0, total: 0 });
  });
});

describe('debounce', () => {
  it('calls once after the quiet period', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d(1); d(2); d(3);
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledWith(3);
    vi.useRealTimers();
  });
});

import { formatIO, parseIO } from '../lib/workload.js';
describe('I/O notation', () => {
  it('parses and formats', () => {
    const r = parseIO('xray@4:2, lab@2:3');
    expect(r.ok).toBe(true);
    expect(r.value).toEqual([{ device: 'lab', at: 2, duration: 3 }, { device: 'xray', at: 4, duration: 2 }]);
    expect(formatIO(r.value)).toBe('lab@2:3, xray@4:2');
    expect(parseIO('').value).toEqual([]);
    expect(parseIO('mri@1:2').ok).toBe(false);
    expect(parseIO('lab 2 3').ok).toBe(false);
  });
});
