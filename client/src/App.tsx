import { useRef, useState } from 'react';
import { getJSON, postJSON, uploadFile } from './api';
import { AiStatus, useHealth } from './components/AiStatus';
import { Explanation } from './components/Explanation';
import { ReportInput } from './components/ReportInput';
import { ResultsTable } from './components/ResultsTable';
import type { Comparison, ParseOutput, View } from './types';

const prettyDate = (d?: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;

export default function App() {
  const health = useHealth();
  const [text, setText] = useState('');
  const [previousText, setPreviousText] = useState('');
  const [comparing, setComparing] = useState(false);
  const [sex, setSex] = useState('');
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const resultsRef = useRef<HTMLDivElement>(null);

  const show = (v: View) => {
    setView(v);
    if (!sex && v.patient.sex) setSex(v.patient.sex);
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  async function check(current = text, previous = comparing ? previousText : '', sexValue = sex) {
    setBusy(true);
    setError('');
    try {
      if (previous.trim()) {
        const c = await postJSON<Comparison>('/api/compare', { current, previous, sex: sexValue || undefined });
        show({ ...c.current, results: c.results, previousDate: c.previous.reportDate, comparison: c.summary });
      } else {
        const res = await postJSON<{ parsed: ParseOutput }>('/api/parse', { text: current, sex: sexValue || undefined });
        if (res.parsed.results.length === 0) {
          setError("Couldn't find any lab values. Check that the text includes test names and results.");
          setView(null);
        } else show(res.parsed);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File, which: 'current' | 'previous') {
    setBusy(true);
    setError('');
    try {
      const res = await uploadFile<{ text: string; parsed: ParseOutput }>('/api/upload', file);
      if (which === 'previous') {
        setPreviousText(res.text);
        if (text.trim()) await check(text, res.text);
      } else {
        setText(res.text);
        if (comparing && previousText.trim()) await check(res.text, previousText);
        else if (res.parsed.results.length === 0) setError('The file was read, but no lab values were recognised.');
        else show(res.parsed);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function loadSample(withPrevious: boolean) {
    const sample = await getJSON<{ text: string; previous: string }>('/api/sample');
    setText(sample.text);
    setSex('');
    setComparing(withPrevious);
    setPreviousText(withPrevious ? sample.previous : '');
    await check(sample.text, withPrevious ? sample.previous : '', '');
  }

  const s = view?.summary;

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>🧪 Lab Report Explainer</h1>
          <p>Upload a blood test report to see which values are out of range — and what they mean, in plain words.</p>
        </div>
        <div className="row no-print">
          <button className="ghost" onClick={() => loadSample(false)} disabled={busy}>
            Try a sample report
          </button>
          <button className="ghost" onClick={() => loadSample(true)} disabled={busy}>
            Sample comparison
          </button>
          <AiStatus health={health} />
        </div>
      </header>

      <div className="disclaimer">
        <strong>For understanding only — not medical advice.</strong> Reference ranges vary between labs. Always discuss your results with a
        qualified doctor. In an emergency, contact a doctor or hospital immediately.
      </div>

      <div className="panel no-print">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Your report{comparing ? 's' : ''}</h2>
          <div className="row">
            <select value={sex} onChange={(e) => setSex(e.target.value)} aria-label="Sex for reference ranges">
              <option value="">Sex: auto-detect</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
            <button className={`ghost ${comparing ? 'active' : ''}`} onClick={() => setComparing((v) => !v)}>
              {comparing ? '✕ Single report' : '⇄ Compare with earlier report'}
            </button>
          </div>
        </div>
        <div className={comparing ? 'grid2' : ''}>
          <ReportInput
            label={comparing ? 'Latest report' : undefined}
            value={text}
            onChange={setText}
            onFile={(f) => onFile(f, 'current')}
            busy={busy}
            placeholder="…or paste the text of your report here"
          />
          {comparing && (
            <ReportInput
              label="Earlier report"
              value={previousText}
              onChange={setPreviousText}
              onFile={(f) => onFile(f, 'previous')}
              busy={busy}
              placeholder="Paste or upload an older report to see what changed"
            />
          )}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={() => check()} disabled={busy || !text.trim() || (comparing && !previousText.trim())}>
            {busy && <span className="spinner" />}
            {comparing ? 'Compare reports' : 'Check my results'}
          </button>
          <span className="small muted">Reading and flagging values happens on your machine without AI.</span>
        </div>
        {error && (
          <div className="error" style={{ marginTop: 10 }}>
            {error}
          </div>
        )}
      </div>

      {view && s && (
        <div ref={resultsRef} className="stack" style={{ marginTop: 20 }}>
          <div className={`summary-cards ${view.comparison ? 'with-trend' : ''}`}>
            <div className="sc">
              <div className="sc-n">{s.total}</div>
              <div className="sc-l">tests found</div>
            </div>
            <div className="sc normal">
              <div className="sc-n">{s.normal}</div>
              <div className="sc-l">in range</div>
            </div>
            <div className="sc high">
              <div className="sc-n">{s.high}</div>
              <div className="sc-l">high</div>
            </div>
            <div className="sc low">
              <div className="sc-n">{s.low}</div>
              <div className="sc-l">low</div>
            </div>
            {view.comparison && (
              <>
                <div className="sc normal">
                  <div className="sc-n">↑ {view.comparison.improved}</div>
                  <div className="sc-l">improved</div>
                </div>
                <div className="sc high">
                  <div className="sc-n">↓ {view.comparison.worsened}</div>
                  <div className="sc-l">got worse</div>
                </div>
              </>
            )}
            <div className="sc meta">
              <div className="sc-l">
                {view.patient.age ? `${view.patient.age} yrs` : 'Age not found'} · {view.patient.sex ?? 'sex not found'}
                {view.reportDate && <div>Report: {prettyDate(view.reportDate)}</div>}
                {view.previousDate && <div>Compared with: {prettyDate(view.previousDate)}</div>}
              </div>
              <button className="ghost small no-print" onClick={() => window.print()}>
                Print / save PDF
              </button>
            </div>
          </div>
          <Explanation view={view} aiReady={Boolean(health?.ok)} />
          <ResultsTable view={view} />
        </div>
      )}
    </div>
  );
}
