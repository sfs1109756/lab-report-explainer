import './env.js';
import multer from 'multer';
import type { Sex } from './catalog.js';
import { TESTS } from './catalog.js';
import { answerQuestion, explainResults, LANGUAGES, type Language } from './explain.js';
import { extractFileText } from './extract.js';
import { HttpError, asyncRoute, clip, createApp, finishApp } from './http.js';
import { parseReport, type ParseOutput } from './parser.js';
import { SAMPLE_REPORT } from './sample.js';

const app = createApp();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const sexOf = (v: unknown): Sex | null => (v === 'male' || v === 'female' ? v : null);
const langOf = (v: unknown): Language => (typeof v === 'string' && v in LANGUAGES ? (v as Language) : 'en');

app.get('/api/sample', (_req, res) => res.json({ text: SAMPLE_REPORT }));
app.get('/api/tests', (_req, res) =>
  res.json({ count: TESTS.length, tests: TESTS.map((t) => ({ key: t.key, name: t.name, category: t.category, unit: t.unit })) }),
);
app.get('/api/languages', (_req, res) => res.json({ languages: LANGUAGES }));

/** Upload a PDF/TXT report → extracted text + parsed results (no AI). */
app.post(
  '/api/upload',
  upload.single('file'),
  asyncRoute(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'No file uploaded.');
    let text: string;
    try {
      text = await extractFileText(req.file.buffer, req.file.originalname, req.file.mimetype);
    } catch (err) {
      throw new HttpError(400, (err as Error).message);
    }
    if (!text.trim()) throw new HttpError(400, 'No text found in this file. Scanned image PDFs need OCR first — try pasting the text instead.');
    res.json({ text, parsed: parseReport(text, sexOf(req.body?.sex)) });
  }),
);

/** Parse pasted text (no AI). */
app.post('/api/parse', (req, res) => {
  const text = clip(req.body?.text, 60_000);
  if (!text) throw new HttpError(400, 'Paste the report text first.');
  res.json({ parsed: parseReport(text, sexOf(req.body?.sex)) });
});

/** Plain-language summary of parsed results (AI). */
app.post(
  '/api/explain',
  asyncRoute(async (req, res) => {
    const parsed = req.body?.parsed as ParseOutput | undefined;
    if (!parsed?.results?.length) throw new HttpError(400, 'No results to explain. Parse a report first.');
    res.json({ explanation: await explainResults(parsed, langOf(req.body?.language)) });
  }),
);

/** Follow-up question about the results (AI). */
app.post(
  '/api/ask',
  asyncRoute(async (req, res) => {
    const parsed = req.body?.parsed as ParseOutput | undefined;
    const question = clip(req.body?.question, 500);
    if (!parsed?.results?.length) throw new HttpError(400, 'Parse a report first.');
    if (!question) throw new HttpError(400, 'Type a question.');
    res.json({ answer: await answerQuestion(parsed, question, langOf(req.body?.language)) });
  }),
);

finishApp(app);

const port = Number(process.env.PORT ?? 3004);
app.listen(port, () => console.log(`Lab Report Explainer API on http://localhost:${port}`));
