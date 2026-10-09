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
