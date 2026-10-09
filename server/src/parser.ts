import { TESTS, type Range, type Sex, type TestDef } from './catalog.js';

/**
 * Rule-based lab report parser. No AI involved.
 *
 * For each line it:
 *  1. finds a known test name (earliest, then longest alias match),
 *  2. strips the name, dates, times and unit exponents (10^3/µL, 1st hr…),
 *  3. reads the printed reference range (a–b, <x, >x, "up to x"),
 *  4. takes the first remaining number as the result,
 *  5. compares it with the printed range, else the catalog's typical range.
 * Lines with an unknown test name but a printed range are kept as "Other".
 */

export type Status = 'low' | 'normal' | 'high';

export interface ParsedResult {
  key: string;
  name: string;
  category: string;
  value: number;
  unit: string;
  range: Range;
  rangeSource: 'report' | 'typical';
  status: Status;
  /** How far outside the range, as % of the limit (0 when normal). */
  deviationPct: number;
  about: string;
  meaning?: string;
  line: string;
}

export interface ParseOutput {
  patient: { sex: Sex | null; age: number | null };
  results: ParsedResult[];
  summary: { total: number; low: number; high: number; normal: number };
  unparsedLines: number;
}

const NUM = String.raw`\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?`;
const round3 = (v: number) => Math.round(v * 1000) / 1000;
const toNum = (s: string) => Number(s.replace(/,/g, ''));

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Alias words may be separated by spaces, hyphens, commas, colons or brackets in real reports. */
function aliasRegex(alias: string): RegExp {
  const tokens = alias.split(/[\s\-,:()]+/).filter(Boolean).map(escapeRegex);
  return new RegExp(`(?<![a-z0-9])${tokens.join('[\\s\\-,:()]*')}(?![a-z0-9])`, 'i');
}

const MATCHERS = TESTS.flatMap((test) => test.aliases.map((alias) => ({ test, re: aliasRegex(alias) })));

function findTest(line: string): { test: TestDef; start: number; end: number } | null {
  let best: { test: TestDef; start: number; end: number } | null = null;
  for (const { test, re } of MATCHERS) {
    const m = re.exec(line);
    if (!m) continue;
    const start = m.index;
    const end = start + m[0].length;
    if (!best || start < best.start || (start === best.start && end - start > best.end - best.start)) {
      best = { test, start, end };
    }
  }
  return best;
}

const NOISE = [
  /\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/g, // dates
  /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?\b/gi, // times
  /(?:x|×)?\s*10\s*\^\s*\d+/gi, // 10^3, x10^9
  /(?:x|×)\s*10[³⁶⁹²]?/gi,
  /10[³⁶⁹]/g,
  /\b1st\s*h(?:ou)?r\b/gi, // ESR "mm/1st hr"
  /\b(?:24|2)\s*h(?:ou)?rs?\b/gi,
];

interface RangeHit {
  range: Range;
  index: number;
  length: number;
}

function findRanges(text: string): RangeHit[] {
  const hits: RangeHit[] = [];
  const add = (re: RegExp, make: (m: RegExpExecArray) => Range) => {
    for (const m of text.matchAll(re)) hits.push({ range: make(m as RegExpExecArray), index: m.index ?? 0, length: m[0].length });
  };
  add(new RegExp(`(${NUM})\\s*(?:-|–|—|to)\\s*(${NUM})`, 'gi'), (m) => ({ low: toNum(m[1]), high: toNum(m[2]) }));
  add(new RegExp(`(?:<=?|≤|less than|up\\s*to|upto|below)\\s*(${NUM})`, 'gi'), (m) => ({ high: toNum(m[1]) }));
  add(new RegExp(`(?:>=?|≥|more than|greater than|above)\\s*(${NUM})`, 'gi'), (m) => ({ low: toNum(m[1]) }));
  // Drop hits that sit inside an earlier, longer hit.
  return hits
    .sort((a, b) => a.index - b.index || b.length - a.length)
    .filter((h, i, arr) => !arr.slice(0, i).some((o) => h.index >= o.index && h.index < o.index + o.length));
}

function pickRange(test: TestDef, sex: Sex | null): Range {
  const r = test.range;
  if (!('male' in r)) return r;
  if (sex) return r[sex];
  // Sex unknown: use the widest range so we only flag values outside both.
  const lows = [r.male.low, r.female.low].filter((v): v is number => v !== undefined);
  const highs = [r.male.high, r.female.high].filter((v): v is number => v !== undefined);
  return { low: lows.length ? Math.min(...lows) : undefined, high: highs.length ? Math.max(...highs) : undefined };
}

function cleanRange(r: Range): Range {
  return {
    ...(r.low !== undefined && Number.isFinite(r.low) ? { low: r.low } : {}),
    ...(r.high !== undefined && Number.isFinite(r.high) ? { high: r.high } : {}),
  };
}

function classify(value: number, range: Range): { status: Status; deviationPct: number } {
  if (range.low !== undefined && value < range.low) {
    return { status: 'low', deviationPct: range.low ? Math.round(((range.low - value) / range.low) * 100) : 0 };
  }
  if (range.high !== undefined && value > range.high) {
    return { status: 'high', deviationPct: range.high ? Math.round(((value - range.high) / range.high) * 100) : 0 };
  }
  return { status: 'normal', deviationPct: 0 };
}

const SKIP_OTHER = /\b(date|age|sex|gender|id|no\.?|number|phone|mobile|ref|reg|sample|collected|received|reported|printed|time|page|barcode|lab|patient|dr\.?|doctor|uhid|bill|pin|years?|yrs)\b/i;

export function detectPatient(text: string): ParseOutput['patient'] {
  const sexMatch = text.match(/(?:sex|gender)\s*[:/\-]?\s*(male|female|m|f)\b/i) ?? text.match(/\b(male|female)\b/i);
  const s = sexMatch?.[1]?.toLowerCase();
  const ageMatch = text.match(/\bage\s*[:/\-]?\s*(\d{1,3})/i) ?? text.match(/(\d{1,3})\s*(?:y|yrs?|years?)\b/i);
  const age = ageMatch ? Number(ageMatch[1]) : null;
  return {
    sex: s === 'male' || s === 'm' ? 'male' : s === 'female' || s === 'f' ? 'female' : null,
    age: age && age > 0 && age < 120 ? age : null,
  };
}

export function parseReport(text: string, sexOverride?: Sex | null): ParseOutput {
  const detected = detectPatient(text);
  const patient = { ...detected, sex: sexOverride ?? detected.sex };
  const results: ParsedResult[] = [];
  const seen = new Set<string>();
  let unparsed = 0;

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 1);

  for (const line of lines) {
    if (!/\d/.test(line)) continue;
    const hit = findTest(line);

    let rest = hit ? `${line.slice(0, hit.start)} ${line.slice(hit.end)}` : line;
    for (const re of NOISE) rest = rest.replace(re, ' ');

    const ranges = findRanges(rest);
    let withoutRanges = rest;
    for (const r of [...ranges].sort((a, b) => b.index - a.index)) {
      withoutRanges = `${withoutRanges.slice(0, r.index)} ${withoutRanges.slice(r.index + r.length)}`;
    }
    const valueMatch = withoutRanges.match(new RegExp(`(?<![a-z])(${NUM})`, 'i'));

    if (!hit) {
      // Unknown test: keep it only if it looks like "Name value unit range".
      const name = line.match(/^([A-Za-z][A-Za-z .,'()/-]{1,40}?)\s*[:\-]?\s*\d/)?.[1]?.trim();
      if (!name || !valueMatch || ranges.length === 0 || SKIP_OTHER.test(name)) {
        unparsed++;
        continue;
      }
      const key = `other:${name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const value = toNum(valueMatch[1]);
      const range = cleanRange(ranges[0].range);
      results.push({
        key,
        name,
        category: 'Other',
        value,
        unit: '',
        range,
        rangeSource: 'report',
        ...classify(value, range),
        about: '',
        line,
      });
      continue;
    }

    const test = hit.test;
    if (seen.has(test.key) || !valueMatch) {
      if (!valueMatch) unparsed++;
      continue;
    }
    seen.add(test.key);

    const norm = test.normalize ?? ((v: number) => v);
    const value = Math.round(norm(toNum(valueMatch[1])) * 1000) / 1000;
    const printed = ranges[0]?.range;
    const range = cleanRange(
      printed
        ? { low: printed.low !== undefined ? round3(norm(printed.low)) : undefined, high: printed.high !== undefined ? round3(norm(printed.high)) : undefined }
        : pickRange(test, patient.sex),
    );
    const { status, deviationPct } = classify(value, range);

    results.push({
      key: test.key,
      name: test.name,
      category: test.category,
      value,
      unit: test.unit,
      range,
      rangeSource: printed ? 'report' : 'typical',
      status,
      deviationPct,
      about: test.about,
      meaning: status === 'low' ? test.low : status === 'high' ? test.high : undefined,
      line,
    });
  }

  return {
    patient,
    results,
    summary: {
      total: results.length,
      low: results.filter((r) => r.status === 'low').length,
      high: results.filter((r) => r.status === 'high').length,
      normal: results.filter((r) => r.status === 'normal').length,
    },
    unparsedLines: unparsed,
  };
}
