import { chat } from './llm.js';
import type { ParseOutput } from './parser.js';

export const LANGUAGES = {
  en: 'English',
  hi: 'Hindi (Devanagari script)',
  mr: 'Marathi (Devanagari script)',
  ur: 'Urdu',
  gu: 'Gujarati',
  ar: 'Arabic',
} as const;
export type Language = keyof typeof LANGUAGES;

const SYSTEM = `You explain blood test results to patients in plain, calm, friendly language.

Strict rules:
- You are NOT a doctor. Never diagnose, never say someone "has" a condition, never suggest medicines or doses.
- Use cautious wording: "can be associated with", "is often seen with", "worth discussing with your doctor".
- Only use the results given. Don't invent values or tests.
- Group related findings (e.g. several anaemia-related markers, several sugar markers) into one point instead of repeating.
- Mention normal results only briefly as reassurance.
- If a value is far outside its range (deviation 50% or more), say clearly it should be reviewed by a doctor soon.
- Keep it under 300 words. Short sentences. No jargon without a plain explanation.

Format exactly with these headings (translate the headings too if writing in another language):
Overview
<2-3 sentences>

Worth discussing with your doctor
- <one bullet per finding or group>

Looks fine
<one sentence>

Questions you could ask your doctor
- <2-4 questions>

General lifestyle notes
- <2-3 general, safe habits linked to the findings, e.g. diet, activity, sunlight; no medicines>`;

export async function explainResults(parsed: ParseOutput, language: Language = 'en'): Promise<string> {
  const lines = parsed.results.map(
    (r) =>
      `- ${r.name}: ${r.value} ${r.unit} (range ${r.range.low ?? '–'} to ${r.range.high ?? '–'}, ${r.rangeSource} range) → ${r.status.toUpperCase()}${
        r.status !== 'normal' ? `, ${r.deviationPct}% outside` : ''
      }`,
  );
  const who = [parsed.patient.age ? `${parsed.patient.age} years old` : null, parsed.patient.sex].filter(Boolean).join(', ');

  const text = await chat(
    [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `Write the explanation in ${LANGUAGES[language] ?? 'English'}.
Patient: ${who || 'not stated'}.
Results:
${lines.join('\n')}`,
      },
    ],
    { temperature: 0.3, maxTokens: 1200 },
  );
  return text.trim();
}

/** Answers a follow-up question about the same results. */
export async function answerQuestion(parsed: ParseOutput, question: string, language: Language = 'en'): Promise<string> {
  const lines = parsed.results.map((r) => `${r.name}: ${r.value} ${r.unit} [${r.range.low ?? '–'}–${r.range.high ?? '–'}] ${r.status}`);
  const text = await chat(
    [
      {
        role: 'system',
        content: `You help a patient understand their blood test results. Same rules as a careful health educator:
not a doctor, no diagnosis, no medicines or doses, cautious wording, only use the results given.
If the question needs a diagnosis, treatment decision or is urgent, say so and suggest seeing a doctor.
Answer in ${LANGUAGES[language] ?? 'English'} in under 150 words.`,
      },
      { role: 'user', content: `My results:\n${lines.join('\n')}\n\nMy question: ${question}` },
    ],
    { temperature: 0.3, maxTokens: 500 },
  );
  return text.trim();
}
