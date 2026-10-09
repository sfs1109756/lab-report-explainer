import { Fragment, useState } from 'react';
import type { ParsedResult, View } from '../types';
import { formatRange, RangeBar } from './RangeBar';

const TREND: Record<string, { icon: string; label: string }> = {
  improved: { icon: '↑', label: 'Improved' },
  worsened: { icon: '↓', label: 'Worse' },
  stable: { icon: '→', label: 'Stable' },
  new: { icon: '•', label: 'New' },
};

function Change({ r }: { r: ParsedResult }) {
  if (r.trend === undefined) return null;
  if (r.previous == null) return <span className="trend new small">new test</span>;
  if (r.changePct === 0) return <span className="trend stable small">same</span>;
  const t = TREND[r.trend];
  return (
    <span
      className={`trend ${r.trend}`}
      title={`${t.label}: was ${r.previous}${r.changePct != null ? ` (${r.changePct > 0 ? '+' : ''}${r.changePct}%)` : ''}`}
    >
      <span className="was">{r.previous}</span> {t.icon}
    </span>
  );
}

type Filter = 'all' | 'flagged' | 'changed';

export function ResultsTable({ view }: { view: View }) {
  const comparing = Boolean(view.comparison);
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(null);

  const rows = view.results.filter((r) =>
    filter === 'flagged' ? r.status !== 'normal' : filter === 'changed' ? r.trend === 'improved' || r.trend === 'worsened' : true,
  );
  const categories = [...new Set(rows.map((r) => r.category))];

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>Your results</h2>
        <div className="seg-filter no-print" role="group" aria-label="Filter results">
          {(['all', 'flagged', ...(comparing ? ['changed'] : [])] as Filter[]).map((f) => (
            <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'flagged' ? 'Out of range' : 'Changed'}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 && (
        <p className="muted">{filter === 'changed' ? 'Nothing changed meaningfully.' : 'Everything is within range. 🎉'}</p>
      )}

      <div className="scroll-x">
        <table className="data results">
          <tbody>
            {categories.map((cat) => (
              <Fragment key={cat}>
                <tr className="cat-row">
                  <th colSpan={comparing ? 6 : 5}>{cat}</th>
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
                        {comparing && (
                          <td className="change">
                            <Change r={r} />
                          </td>
                        )}
                        <td className="bar">
                          <RangeBar r={r} />
                        </td>
                        <td className="range small">
                          {formatRange(r)}
                          {r.rangeSource === 'typical' && (
                            <span className="typical" title="No range was printed on the report, so a typical adult range was used.">
                              typical
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${r.status}`}>
                            {r.status === 'normal' ? 'Normal' : r.status === 'low' ? 'Low' : 'High'}
                          </span>
                        </td>
                      </tr>
                      {open === r.key && (
                        <tr className="detail">
                          <td colSpan={comparing ? 6 : 5}>
                            {r.previous != null && (
                              <p>
                                <strong>Since {view.previousDate ?? 'the earlier report'}:</strong> {r.previous} → {r.value} {r.unit}
                                {r.changePct != null && ` (${r.changePct > 0 ? '+' : ''}${r.changePct}%)`} —{' '}
                                {TREND[r.trend ?? 'stable'].label.toLowerCase()}.
                              </p>
                            )}
                            {r.about && (
                              <p>
                                <strong>What it measures:</strong> {r.about}
                              </p>
                            )}
                            {r.meaning && (
                              <p>
                                <strong>What a {r.status} value can mean:</strong> {r.meaning}
                              </p>
                            )}
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
