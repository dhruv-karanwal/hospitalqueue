import { memo, useMemo } from 'react';
import { clipToTime, groupRows, niceTicks, timeBounds } from '../lib/gantt.js';

const MARK = { preempted: '⚡', quantum: '↻', io: '⧗' };
const CUT_TEXT = { preempted: 'preempted', quantum: 'quantum expired', io: 'sent for I/O', completed: 'completed' };

// The ward board: one lane per doctor (and optionally per device unit).
function Gantt({ segments, rows, deviceSegments = [], playhead, label = 'Schedule' }) {
  const all = useMemo(() => segments.concat(deviceSegments), [segments, deviceSegments]);
  const { end } = useMemo(() => timeBounds(all), [all]);
  const span = Math.max(end, playhead ?? 0, 1);
  const pxPer = Math.max(6, Math.min(36, Math.floor(900 / span)));
  const width = span * pxPer;
  const ticks = useMemo(() => niceTicks(0, span, Math.max(4, Math.floor(width / 70))), [span, width]);
  const shown = useMemo(() => (playhead === undefined ? segments : clipToTime(segments, playhead)), [segments, playhead]);
  const shownDev = useMemo(() => (playhead === undefined ? deviceSegments : clipToTime(deviceSegments, playhead)), [deviceSegments, playhead]);
  const lanes = useMemo(() => groupRows(shown, 'doctor', rows), [shown, rows]);
  const devLanes = useMemo(() => {
    const keyed = shownDev.map((s) => ({ ...s, lane: `${s.device} ${s.unit}` }));
    const order = [...new Set(deviceSegments.map((s) => `${s.device} ${s.unit}`))].sort();
    return groupRows(keyed, 'lane', order);
  }, [shownDev, deviceSegments]);

  if (!segments.length && !deviceSegments.length) return null;
  const lane = (row, device) => (
    <div className="board-row" key={row.id}>
      <div className="board-label">{row.id}</div>
      <div className="board-lane" role="list" aria-label={`${row.id} timeline`} style={{ width }}>
        {row.segs.map((s, i) => {
          const w = (s.end - s.start) * pxPer;
          const sw = s.kind === 'switch';
          const desc = device
            ? `${s.patient} at ${s.device}, minutes ${s.start} to ${s.end}`
            : sw ? `context switch to ${s.patient}, minutes ${s.start} to ${s.end}`
              : `${s.patient} priority ${s.priority}, minutes ${s.start} to ${s.end}${s.end_reason && !s.partial ? `, ${CUT_TEXT[s.end_reason] || s.end_reason}` : ''}`;
          // The mark glyph needs its own room; on narrow blocks the dark right edge alone shows the cut.
          const mark = !s.partial && !device && MARK[s.end_reason] && w >= 44 ? MARK[s.end_reason] : null;
          return (
            <div key={i} role="listitem" aria-label={desc} title={desc}
              className={`seg-block${sw ? ' switch' : ''}${device ? ' device' : ''}${s.end_reason && !s.partial ? ` cut-${s.end_reason}` : ''}${mark ? ' has-mark' : ''}`}
              data-p={device || sw ? undefined : s.priority}
              style={{ left: s.start * pxPer, width: Math.max(2, w - 1) }}>
              {w >= 24 ? s.patient : ''}
              {mark && <span className="mark" aria-hidden="true">{mark}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
  return (
    <div className="board" role="figure" aria-label={label}>
      <div className="board-scroll">
        <div className="board-grid" style={{ minWidth: width + 90 }}>
          {lanes.map((r) => lane(r, false))}
          {devLanes.map((r) => lane(r, true))}
          <div className="board-axis" aria-hidden="true">
            <span />
            <div className="ticks">
              {ticks.map((t) => <span key={t} className="tick" style={{ left: t * pxPer }}>{t}</span>)}
            </div>
          </div>
          {playhead !== undefined && <div className="playhead" style={{ left: 72 + playhead * pxPer }} aria-hidden="true" />}
        </div>
      </div>
    </div>
  );
}

export function GanttLegend({ showDevices }) {
  return (
    <div className="legend" aria-label="Legend">
      {[1, 2, 3, 4, 5].map((p) => <span key={p} className="tag tag-prio" data-p={p}>P{p}</span>)}
      <span>Colour and label = triage priority</span>
      <span><span className="swatch-switch" /> context switch</span>
      <span>⚡ preempted</span><span>↻ quantum expired</span><span>⧗ sent for I/O</span><span>dark right edge = cut short</span>
      {showDevices && <span>dashed = device in use</span>}
    </div>
  );
}

export default memo(Gantt);
