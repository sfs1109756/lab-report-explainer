import type { ParsedResult } from '../types';

/**
 * Visual position of the value relative to its reference range.
 * The normal band sits in the middle 50% of the bar; values outside are clamped to the ends.
 */
export function RangeBar({ r }: { r: ParsedResult }) {
  const { low, high } = r.range;
  let pct: number;
  if (low !== undefined && high !== undefined && high > low) {
    pct = 25 + ((r.value - low) / (high - low)) * 50;
  } else if (high !== undefined) {
    // Only an upper limit: normal band is 0–high.
    pct = (r.value / high) * 75;
  } else if (low !== undefined) {
    // Only a lower limit: normal band is low and above.
    pct = 25 + ((r.value - low) / Math.max(low, 1)) * 50;
  } else {
    return null;
  }
  pct = Math.max(2, Math.min(98, pct));
  const bandStart = low === undefined ? 0 : 25;
  const bandEnd = high === undefined ? 100 : 75;

  return (
    <div className="rangebar" aria-hidden>
      <div className="band" style={{ left: `${bandStart}%`, width: `${bandEnd - bandStart}%` }} />
      <div className={`marker ${r.status}`} style={{ left: `${pct}%` }} />
    </div>
  );
}

export function formatRange(r: ParsedResult): string {
  const { low, high } = r.range;
  if (low !== undefined && high !== undefined) return `${low} – ${high}`;
  if (high !== undefined) return `< ${high}`;
  if (low !== undefined) return `> ${low}`;
  return '—';
}
