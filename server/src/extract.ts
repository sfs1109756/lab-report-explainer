import { extractText, getDocumentProxy } from 'unpdf';

/** Pulls plain text out of an uploaded PDF, TXT or MD file. */
export async function extractFileText(buffer: Buffer, filename: string, mimetype: string): Promise<string> {
  const lower = filename.toLowerCase();
  if (mimetype === 'application/pdf' || lower.endsWith('.pdf')) {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return tidy(text);
  }
  if (mimetype.startsWith('text/') || /\.(txt|md|markdown)$/.test(lower)) {
    return tidy(buffer.toString('utf8'));
  }
  throw new Error('Unsupported file type. Upload a PDF, TXT or MD file.');
}

function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
