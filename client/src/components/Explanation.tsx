import { useState, type FormEvent, type ReactNode } from 'react';
import { postJSON } from '../api';
import type { ParseOutput } from '../types';

const LANGS: Record<string, string> = {
  en: 'English',
  hi: 'हिन्दी',
  mr: 'मराठी',
  ur: 'اردو',
  gu: 'ગુજરાતી',
  ar: 'العربية',
};

/** Renders the model's light markdown: headings (plain lines), bullets and **bold**. */
function renderText(text: string): ReactNode {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) blocks.push(<ul key={blocks.length}>{bullets.map((b, i) => <li key={i}>{inline(b)}</li>)}</ul>);
    bullets = [];
  };
  const inline = (s: string) => s.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)/);
    if (bullet) {
      bullets.push(bullet[1]);
      continue;
    }
    flush();
    const heading = line.replace(/^#+\s*/, '').replace(/^\*\*(.*)\*\*$/, '$1').replace(/:$/, '');
    if (line.length < 60 && !/[.!?]$/.test(line)) blocks.push(<h3 key={blocks.length}>{heading}</h3>);
    else blocks.push(<p key={blocks.length}>{inline(line)}</p>);
  }
  flush();
  return blocks;
}

export function Explanation({ parsed, aiReady }: { parsed: ParseOutput; aiReady: boolean }) {
  const [language, setLanguage] = useState('en');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');
  const [qa, setQa] = useState<{ q: string; a: string }[]>([]);
  const [asking, setAsking] = useState(false);
  const rtl = language === 'ur' || language === 'ar';

  async function explain() {
    setBusy(true);
    setError('');
    try {
      const res = await postJSON<{ explanation: string }>('/api/explain', { parsed, language });
      setText(res.explanation);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function ask(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    setAsking(true);
    setError('');
    try {
      const res = await postJSON<{ answer: string }>('/api/ask', { parsed, question: q, language });
      setQa((list) => [...list, { q, a: res.answer }]);
      setQuestion('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="panel explain">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>💬 Plain-language summary</h2>
        <div className="row no-print">
          <select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Language">
            {Object.entries(LANGS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button onClick={explain} disabled={busy || !aiReady}>
            {busy && <span className="spinner" />}
            {text ? 'Rewrite' : 'Explain my results'}
          </button>
        </div>
      </div>
      {!aiReady && <p className="small muted">The summary needs an AI model (local Ollama by default). The flags above work without it.</p>}
      {busy && <p className="small muted">Writing your summary… local models can take 20–60 seconds.</p>}
      {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
      {text && (
        <div className="ai-text" dir={rtl ? 'rtl' : 'ltr'}>
          {renderText(text)}
        </div>
      )}

      {text && (
        <div className="followup no-print">
          {qa.map((item, i) => (
            <div key={i} className="qa" dir={rtl ? 'rtl' : 'ltr'}>
              <div className="qa-q">{item.q}</div>
              <div className="qa-a">{renderText(item.a)}</div>
            </div>
          ))}
          <form onSubmit={ask} className="row" style={{ flexWrap: 'nowrap' }}>
            <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a follow-up, e.g. What foods help with low vitamin D?" disabled={asking} />
            <button disabled={asking || !question.trim()}>{asking ? <span className="spinner" /> : 'Ask'}</button>
          </form>
        </div>
      )}
    </div>
  );
}
