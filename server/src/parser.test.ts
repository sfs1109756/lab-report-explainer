import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseReport } from './parser.js';
import { SAMPLE_REPORT } from './sample.js';

const byKey = (text: string, sex?: 'male' | 'female') =>
  Object.fromEntries(parseReport(text, sex).results.map((r) => [r.key, r]));

test('parses the full sample report', () => {
  const out = parseReport(SAMPLE_REPORT);
  assert.deepEqual(out.patient, { sex: 'male', age: 42 });
  assert.equal(out.summary.total, 41);
  const r = Object.fromEntries(out.results.map((x) => [x.key, x]));
  assert.equal(r.hemoglobin.status, 'low');
  assert.equal(r.tsh.status, 'high');
  assert.equal(r.vitamin_d.value, 14.2);
  assert.equal(r.cholesterol.range.high, 200); // "Desirable <200, Borderline 200-239" → first range wins
  assert.equal(r.cholesterol.status, 'high');
  assert.equal(r.hdl.status, 'low'); // ">40"
  assert.equal(r.platelets.value, 245); // 2.45 lakhs → 245 ×10³/µL
  assert.equal(r.wbc.value, 7.85); // 7,850 /cumm → 7.85 ×10³/µL
  assert.equal(r.esr.value, 18); // the "1st hr" in the unit is not read as the value
});

test('uses sex-specific typical ranges when none are printed', () => {
  assert.equal(byKey('Hb : 12.5 g/dl', 'female').hemoglobin.status, 'normal');
  assert.equal(byKey('Hb : 12.5 g/dl', 'male').hemoglobin.status, 'low');
  assert.equal(byKey('Hb : 12.5 g/dl', 'male').hemoglobin.rangeSource, 'typical');
});

test('handles alternative layouts and Indian number formats', () => {
  const r = byKey(`Cholesterol, HDL 55 mg/dl
Platelets 1,50,000 /cumm 1,50,000-4,10,000
Free T3 3.1 pg/mL 2.0 - 4.4
Bilirubin (Direct) 0.5 mg/dL 0 - 0.3`);
  assert.equal(r.hdl.value, 55);
  assert.equal(r.platelets.value, 150);
  assert.equal(r.platelets.status, 'normal');
  assert.equal(r.ft3.status, 'normal');
  assert.equal(r.bilirubin_direct.status, 'high');
});

test('keeps unknown tests that have a printed range, ignores header lines', () => {
  const out = parseReport(`Date: 12/09/2026  Lab No 4455
Homocysteine 18.5 umol/L 5 - 15`);
  assert.equal(out.results.length, 1);
  assert.equal(out.results[0].category, 'Other');
  assert.equal(out.results[0].status, 'high');
});

test('reads lipid ratios, eGFR and Thyrocare-style lines with a method column', () => {
  const r = byKey(`TC/ HDL CHOLESTEROL RATIO   CALCULATED  5.8  Ratio  3 - 5
LDL / HDL RATIO   CALCULATED  3.2  Ratio  1.5-3.5
NON-HDL CHOLESTEROL  CALCULATED  170  mg/dL  < 160
eGFR  CALCULATED  84  mL/min/1.73m2  > 90
ESTIMATED AVERAGE GLUCOSE (eAG)  CALCULATED  134  mg/dL  90 - 120`);
  assert.equal(r.chol_hdl_ratio.status, 'high');
  assert.equal(r.ldl_hdl_ratio.status, 'normal');
  assert.equal(r.non_hdl.value, 170);
  assert.equal(r.egfr.status, 'low');
  assert.equal(r.eag.value, 134);
});

test('detects report dates in common formats', async () => {
  const { detectReportDate } = await import('./parser.js');
  assert.equal(detectReportDate('Reported : 09-10-2026 02:40 PM'), '2026-10-09');
  assert.equal(detectReportDate('Sample collected on 3 Mar 2026'), '2026-03-03');
  assert.equal(detectReportDate('Report Date: 2026-01-15'), '2026-01-15');
  assert.equal(detectReportDate('No dates here'), null);
});
