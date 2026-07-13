/** Genre marker for books created from Audio Studio (text / PDF → audio). */
export const AUDIO_STUDIO_GENRE = "Audio Studio";

export const AUDIO_STUDIO_MIN_WORDS = 40;
export const AUDIO_STUDIO_MAX_CHARS = 400_000;
export const AUDIO_STUDIO_MAX_PDF_BYTES = 12 * 1024 * 1024;
/** Target words per narrated chapter when auto-splitting. */
const TARGET_WORDS_PER_CHAPTER = 1_200;

export type StudioChapter = {
  title: string;
  content: string;
};

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Split pasted / extracted manuscript text into chapters for TTS.
 * Prefers explicit chapter headings; otherwise chunks by word count.
 */
export function splitTextIntoChapters(raw: string): StudioChapter[] {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const headingSplit = text.split(
    /(?=^(?:#{1,3}\s+.+|Chapter\s+\d+[.:)\s-]*|CHAPTER\s+\d+[.:)\s-]*)\s*)/m
  );

  if (headingSplit.length > 1) {
    const chapters: StudioChapter[] = [];
    for (const chunk of headingSplit) {
      const trimmed = chunk.trim();
      if (!trimmed || countWords(trimmed) < 8) continue;

      const firstLine = trimmed.split("\n")[0]?.trim() ?? "Part";
      const headingMatch = firstLine.match(
        /^(?:#{1,3}\s+)?(?:Chapter\s+\d+[.:)\s-]*)?(.*)$/i
      );
      let title =
        (headingMatch?.[1] ?? firstLine).replace(/^#+\s*/, "").trim() ||
        firstLine;
      title = title.slice(0, 120) || `Part ${chapters.length + 1}`;

      const body = trimmed.includes("\n")
        ? trimmed.slice(trimmed.indexOf("\n") + 1).trim()
        : trimmed;
      const content = body || trimmed;
      if (countWords(content) < 8) continue;
      chapters.push({ title, content });
    }
    if (chapters.length > 0) return chapters;
  }

  return chunkByWords(text, TARGET_WORDS_PER_CHAPTER);
}

function chunkByWords(text: string, targetWords: number): StudioChapter[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chapters: StudioChapter[] = [];
  let buffer: string[] = [];
  let words = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    const content = buffer.join("\n\n").trim();
    if (!content) return;
    chapters.push({
      title: `Part ${chapters.length + 1}`,
      content,
    });
    buffer = [];
    words = 0;
  };

  for (const para of paragraphs) {
    const w = countWords(para);
    if (words > 0 && words + w > targetWords) {
      flush();
    }
    buffer.push(para);
    words += w;
  }
  flush();

  if (chapters.length === 0 && text.trim()) {
    return [{ title: "Part 1", content: text.trim() }];
  }
  return chapters;
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return (result.text ?? "").replace(/\r\n/g, "\n").trim();
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}
