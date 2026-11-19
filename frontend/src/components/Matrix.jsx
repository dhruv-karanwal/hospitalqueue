// Editable (or read-only) integer matrix with row/column headers.
export default function Matrix({ caption, rows, cols, values, onChange, highlightRows = [] }) {
  return (
    <div className="scroll-x">
      <table className="matrix">
        <caption style={{ textAlign: 'left', fontWeight: 700, paddingBottom: 4 }}>{caption}</caption>
        <thead><tr><th scope="col"><span className="sr-only">Row</span></th>{cols.map((c) => <th scope="col" key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {values.map((row, r) => (
            <tr key={r} className={highlightRows.includes(r) ? 'dup' : ''}>
              <th scope="row">{rows[r]}</th>
              {row.map((v, c) => (
                <td key={c}>
                  {onChange ? (
                    <input type="number" min={0} max={1000} value={v} aria-label={`${caption}, ${rows[r]}, ${cols[c]}`}
                      onChange={(e) => onChange(r, c, Math.max(0, Number.parseInt(e.target.value, 10) || 0))} />
                  ) : <span className="num">{v}</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
