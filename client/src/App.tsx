import { useRef, useState } from 'react';
import { getJSON, postJSON, uploadFile } from './api';
import { AiStatus, useHealth } from './components/AiStatus';
import { Explanation } from './components/Explanation';
import { ResultsTable } from './components/ResultsTable';
import type { ParseOutput } from './types';

export default function App() {
  const health = useHealth();
  const [text, setText] = useState('');
  const [sex, setSex] = useState('');
  const [parsed, setParsed] = useState<ParseOutput | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const resultsRef = useRef<HTMLDivElement>(null);

  const show = (p: ParseOutput) => {
    setParsed(p);
    if (!sex && p.patient.sex) setSex(p.patient.sex);
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  async function parse(input = text, sexValue = sex) {
    setBusy(true);
    setError('');
    try {
      const res = await postJSON<{ parsed: ParseOutput }>('/api/parse', { text: input, sex: sexValue || undefined });
      if (res.parsed.results.length === 0) {
        setError("Couldn't find any lab values. Check that the text includes test names and results.");
        setParsed(null);
      } else show(res.parsed);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file?: File) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const res = await uploadFile<{ text: string; parsed: ParseOutput }>('/api/upload', file);
      setText(res.text);
      if (res.parsed.results.length === 0) setError("The file was read, but no lab values were recognised.");
      else show(res.parsed);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function loadSample() {
    const { text: sample } = await getJSON<{ text: string }>('/api/sample');
    setText(sample);
    setSex('');
    await parse(sample, '');
  }

  const s = parsed?.summary;

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>🧪 Lab Report Explainer</h1>
          <p>Upload a blood test report to see which values are out of range — and what they mean, in plain words.</p>
        </div>
        <div className="row no-print">
          <button className="ghost" onClick={loadSample} disabled={busy}>Try a sample report</button>
          <AiStatus health={health} />
        </div>
      </header>

      <div className="disclaimer">
        <strong>For understanding only — not medical advice.</strong> Reference ranges vary between labs. Always discuss your results with
        a qualified doctor. In an emergency, contact a doctor or hospital immediately.
      </div>

      <div className="panel no-print">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Your report</h2>
          <div className="row">
            <select value={sex} onChange={(e) => setSex(e.target.value)} aria-label="Sex for reference ranges">
              <option value="">Sex: auto-detect</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
            <label className="file">
              {busy ? <span className="spinner" /> : '⇪'} Upload PDF
              <input type="file" accept=".pdf,.txt,application/pdf,text/plain" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          </div>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="…or paste the text of your report here" />
        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={() => parse()} disabled={busy || !text.trim()}>
            {busy && <span className="spinner" />}Check my results
          </button>
          <span className="small muted">Reading and flagging values happens on your machine without AI.</span>
        </div>
        {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      {parsed && s && (
        <div ref={resultsRef} className="stack" style={{ marginTop: 20 }}>
          <div className="summary-cards">
            <div className="sc"><div className="sc-n">{s.total}</div><div className="sc-l">tests found</div></div>
            <div className="sc normal"><div className="sc-n">{s.normal}</div><div className="sc-l">in range</div></div>
            <div className="sc high"><div className="sc-n">{s.high}</div><div className="sc-l">high</div></div>
            <div className="sc low"><div className="sc-n">{s.low}</div><div className="sc-l">low</div></div>
            <div className="sc meta">
              <div className="sc-l">
                {parsed.patient.age ? `${parsed.patient.age} yrs` : 'Age not found'} ·{' '}
                {parsed.patient.sex ?? 'sex not found'}
              </div>
              <button className="ghost small no-print" onClick={() => window.print()}>Print / save PDF</button>
            </div>
          </div>
          <Explanation parsed={parsed} aiReady={Boolean(health?.ok)} />
          <ResultsTable parsed={parsed} />
        </div>
      )}
    </div>
  );
}
