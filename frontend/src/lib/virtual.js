// Fixed-row-height windowing: which rows to render for a given scroll position.
export function visibleRange(scrollTop, viewport, rowHeight, count, overscan = 6) {
  if (count <= 0) return { start: 0, end: 0, offset: 0, total: 0 };
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const last = Math.min(count, Math.ceil((scrollTop + viewport) / rowHeight) + overscan);
  return { start: first, end: last, offset: first * rowHeight, total: count * rowHeight };
}
