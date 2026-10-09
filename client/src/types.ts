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
}

export interface ParseOutput {
  patient: { sex: 'male' | 'female' | null; age: number | null };
  results: ParsedResult[];
  summary: { total: number; low: number; high: number; normal: number };
  unparsedLines: number;
}
