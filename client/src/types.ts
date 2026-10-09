export type Status = 'low' | 'normal' | 'high';

export interface ParsedResult {
  key: string;
  name: string;
  category: string;
  value: number;
  unit: string;
  range: { low?: number; high?: number };
  rangeSource: 'report' | 'typical';
  status: Status;
  deviationPct: number;
  about: string;
  meaning?: string;
  line: string;
  /** Present when comparing with an earlier report. */
  previous?: number | null;
  previousStatus?: Status | null;
  changePct?: number | null;
  trend?: 'improved' | 'worsened' | 'stable' | 'new';
}

export interface ParseOutput {
  patient: { sex: 'male' | 'female' | null; age: number | null };
  reportDate: string | null;
  results: ParsedResult[];
  summary: { total: number; low: number; high: number; normal: number };
  unparsedLines: number;
}

export interface Comparison {
  current: ParseOutput;
  previous: ParseOutput;
  results: ParsedResult[];
  summary: { improved: number; worsened: number; stable: number; new: number };
}

/** What the UI shows: one report, optionally enriched with the earlier report's values. */
export interface View extends ParseOutput {
  previousDate?: string | null;
  comparison?: Comparison['summary'];
}
