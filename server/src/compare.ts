import type { ParsedResult, ParseOutput } from './parser.js';

/**
 * Compares two parsed reports test by test.
 * "trend" says whether the change is good for you, not just up or down:
 *   improved  – moved into range, or closer to it
 *   worsened  – moved out of range, or further from it
 *   stable    – stayed in range, or barely changed
 */
export type Trend = 'improved' | 'worsened' | 'stable' | 'new';

export interface ComparedResult extends ParsedResult {
  previous: number | null;
  previousStatus: ParsedResult['status'] | null;
  changePct: number | null;
  trend: Trend;
}

export interface Comparison {
  current: ParseOutput;
  previous: ParseOutput;
  results: ComparedResult[];
  summary: { improved: number; worsened: number; stable: number; new: number };
}

/** Distance outside the range as a fraction of the nearest limit (0 when in range). */
function outside(value: number, r: ParsedResult['range']): number {
  if (r.low !== undefined && value < r.low) return (r.low - value) / Math.max(Math.abs(r.low), 1e-9);
  if (r.high !== undefined && value > r.high) return (value - r.high) / Math.max(Math.abs(r.high), 1e-9);
  return 0;
}

export function compareReports(current: ParseOutput, previous: ParseOutput): Comparison {
  const prevByKey = new Map(previous.results.map((r) => [r.key, r]));
  const results: ComparedResult[] = current.results.map((r) => {
    const p = prevByKey.get(r.key);
    if (!p) return { ...r, previous: null, previousStatus: null, changePct: null, trend: 'new' };
    const changePct = p.value === 0 ? null : Math.round(((r.value - p.value) / Math.abs(p.value)) * 1000) / 10;
    // Use the current report's range for both values so the comparison is like for like.
    const before = outside(p.value, r.range);
    const after = outside(r.value, r.range);
    let trend: Trend;
    if (before === 0 && after === 0)
      trend = 'stable'; // moving around inside the range is fine
    else if (after < before - 0.005) trend = 'improved';
    else if (after > before + 0.005) trend = 'worsened';
    else trend = 'stable';
    return { ...r, previous: p.value, previousStatus: p.status, changePct, trend };
  });
  const count = (t: Trend) => results.filter((r) => r.trend === t).length;
  return {
    current,
    previous,
    results,
    summary: { improved: count('improved'), worsened: count('worsened'), stable: count('stable'), new: count('new') },
  };
}
