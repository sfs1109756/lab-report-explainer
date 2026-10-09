import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { SAMPLE_PREVIOUS_REPORT, SAMPLE_REPORT } from './sample.js';

/** End-to-end API tests with a fake Ollama that records the prompt it was sent. */
let api = '';
let lastPrompt = '';
const servers: http.Server[] = [];
const listen = (s: http.Server) => new Promise<string>((r) => s.listen(0, () => r(`http://127.0.0.1:${(s.address() as AddressInfo).port}`)));

const fakeOllama = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = JSON.parse(raw || '{}');
    lastPrompt = body.messages?.map((m: { content: string }) => m.content).join('\n') ?? '';
    for (const w of ['Overview\n', 'Mostly ', 'fine.']) res.write(`${JSON.stringify({ message: { content: w } })}\n`);
    res.end(`${JSON.stringify({ done: true })}\n`);
  });
});

before(async () => {
  process.env.OLLAMA_URL = await listen(fakeOllama);
  process.env.LLM_PROVIDER = 'ollama';
  const { default: app } = await import('./app.js');
  const server = http.createServer(app);
  api = await listen(server);
  servers.push(fakeOllama, server);
});
after(() => servers.forEach((s) => s.close()));

const post = (p: string, body: unknown) => fetch(`${api}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('parse flags values and finds the report date', async () => {
  const { parsed } = await (await post('/api/parse', { text: SAMPLE_REPORT })).json();
  assert.equal(parsed.summary.total, 41);
  assert.equal(parsed.reportDate, '2026-10-09');
});

test('compare reports improvements and worsening', async () => {
  const c = await (await post('/api/compare', { current: SAMPLE_REPORT, previous: SAMPLE_PREVIOUS_REPORT })).json();
  assert.equal(c.previous.reportDate, '2026-04-08');
  const byKey = Object.fromEntries(c.results.map((r: { key: string }) => [r.key, r]));
  assert.equal(byKey.hba1c.previous, 6.4);
  assert.equal(byKey.hba1c.trend, 'improved');
  assert.equal(byKey.tsh.trend, 'worsened'); // 4.1 (in range) → 5.9 (high)
  assert.equal(byKey.sodium.trend, 'stable');
  assert.deepEqual(c.summary, { improved: 10, worsened: 3, stable: 28, new: 0 });
});

test('compare needs two readable reports', async () => {
  const res = await post('/api/compare', { current: SAMPLE_REPORT, previous: 'nothing useful here' });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /earlier report/);
});

test('explanation streams and includes earlier values in the prompt', async () => {
  const c = await (await post('/api/compare', { current: SAMPLE_REPORT, previous: SAMPLE_PREVIOUS_REPORT })).json();
  const view = { ...c.current, results: c.results, previousDate: c.previous.reportDate };
  const res = await post('/api/explain', { parsed: view, language: 'hi' });
  const events = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(events.at(-1).text, 'Overview\nMostly fine.');
  assert.match(lastPrompt, /Hindi/);
  assert.match(lastPrompt, /HbA1c: 6\.1 % .*previously 6\.4 on 2026-04-08 \(improved\)/);
  assert.doesNotMatch(lastPrompt, /Rahul/, 'the raw report (with the patient name) must not be sent to the model');
});

test('upload extracts and parses a text report', async () => {
  const form = new FormData();
  form.append('file', new Blob([SAMPLE_REPORT], { type: 'text/plain' }), 'report.txt');
  const data = await (await fetch(`${api}/api/upload`, { method: 'POST', body: form })).json();
  assert.equal(data.parsed.results.length, 41);
});

test('explain without AI returns 503 before streaming', async () => {
  process.env.LLM_PROVIDER = 'none';
  const { parsed } = await (await post('/api/parse', { text: SAMPLE_REPORT })).json();
  const res = await post('/api/explain', { parsed });
  assert.equal(res.status, 503);
  process.env.LLM_PROVIDER = 'ollama';
});
