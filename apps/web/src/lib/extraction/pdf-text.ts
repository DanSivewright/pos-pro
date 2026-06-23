import { extractText, getDocumentProxy } from "unpdf";

// Extracts the full text of a PDF held in memory. Raw bytes are never
// persisted — they live only for the duration of this call (ADR-0003).
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}
