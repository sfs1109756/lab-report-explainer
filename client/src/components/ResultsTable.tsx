import { Fragment, useState } from 'react';
import type { ParseOutput } from '../types';
import { formatRange, RangeBar } from './RangeBar';

export function ResultsTable({ parsed }: { parsed: ParseOutput }) {
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const rows = parsed.results.filter((r) => !onlyFlagged || r.status !== 'normal');
  const categories = [...new Set(rows.map((r) => r.category))];

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>Your results</h2>
        <label className="row small no-print" style={{ gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} style={{ width: 'auto' }} />
          Only show values outside range
        </label>
      </div>

      {rows.length === 0 && <p className="muted">Everything is within range. 🎉</p>}

      <div className="scroll-x">
        <table className="data results">
          <tbody>
            {categories.map((cat) => (
              <Fragment key={cat}>
                <tr className="cat-row">
                  <th colSpan={5}>{cat}</th>
                </tr>
                {rows
                  .filter((r) => r.category === cat)
                  .map((r) => (
                    <Fragment key={r.key}>
                      <tr className={`res ${r.status}`} onClick={() => setOpen(open === r.key ? null : r.key)}>
                        <td className="name">
                          {r.name}
                          {r.about && <span className="more no-print">{open === r.key ? '−' : '+'}</span>}
                        </td>
                        <td className="value">
                          {r.value} <span className="unit">{r.unit}</span>
                        </td>
                        <td className="bar">
                          <RangeBar r={r} />
                        </td>
                        <td className="range small">
                          {formatRange(r)}
                          {r.rangeSource === 'typical' && <span className="typical" title="No range was printed on the report, so a typical adult range was used.">typical</span>}
                        </td>
                        <td>
                          <span className={`badge ${r.status}`}>{r.status === 'normal' ? 'Normal' : r.status === 'low' ? 'Low' : 'High'}</span>
                        </td>
                      </tr>
                      {open === r.key && (
                        <tr className="detail">
                          <td colSpan={5}>
                            {r.about && <p><strong>What it measures:</strong> {r.about}</p>}
                            {r.meaning && <p><strong>What a {r.status} value can mean:</strong> {r.meaning}</p>}
                            <p className="small muted">From your report: “{r.line}”</p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
