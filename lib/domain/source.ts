import { decodeHTML } from "entities";

export function canonicalText(html: string): string {
  // Only documented formatting is normalized. Unexpected markup needs review.
  const withoutNotes = html.replace(
    /<sup\b[^>]*>([\s\S]*?)<\/sup>/gi,
    (_, note: string) => ` [footnote ${note.replace(/<[^>]*>/g, "")}]`,
  );
  const plain = withoutNotes
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div)>/gi, "\n")
    .replace(/<\/?(?:i|b|em|strong|span|p|div)\b[^>]*>/gi, "");
  if (/<[^>]+>/.test(plain)) throw new Error("SOURCE_UNSUPPORTED_MARKUP");
  const text = decodeHTML(plain).trim();
  if (!text) throw new Error("SOURCE_EMPTY_TEXT");
  return text;
}

export function parseReference(input: string) {
  const match = /^(\d{1,3}):(\d{1,3})$/.exec(input);
  if (!match) return null;
  const chapter = Number(match[1]),
    verse = Number(match[2]);
  return chapter >= 1 && chapter <= 114 && verse >= 1 && verse <= 286
    ? { chapter, verse }
    : null;
}
