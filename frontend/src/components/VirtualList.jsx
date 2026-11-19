import { useState, useRef, useCallback } from 'react';
import { visibleRange } from '../lib/virtual.js';

// Renders only the rows in view. Fixed row height keeps layout stable (no shift).
export default function VirtualList({ items, rowHeight = 40, height = 420, columns, header, renderRow, label }) {
  const [scrollTop, setScrollTop] = useState(0);
  const ref = useRef(null);
  const onScroll = useCallback((e) => setScrollTop(e.currentTarget.scrollTop), []);
  const { start, end, offset, total } = visibleRange(scrollTop, height, rowHeight, items.length);
  return (
    <div className="vlist" style={{ height: Math.min(height, items.length * rowHeight + 36) || 80 }} onScroll={onScroll} ref={ref}
      role="table" aria-label={label} aria-rowcount={items.length + 1} tabIndex={0}>
      <div className="vhead" role="row" style={{ gridTemplateColumns: columns }}>{header}</div>
      <div style={{ height: total, position: 'relative' }}>
        <div style={{ transform: `translateY(${offset}px)` }}>
          {items.slice(start, end).map((item, i) => (
            <div key={item.key ?? start + i} className="vrow" role="row" aria-rowindex={start + i + 2}
              style={{ gridTemplateColumns: columns, height: rowHeight }}>
              {renderRow(item, start + i)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
