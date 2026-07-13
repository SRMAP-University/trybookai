import { db } from "@/lib/db";

type BookOutline = {
  title: string;
  synopsis: string;
  chapters: {
    number: number;
    title: string;
    summary: string;
    sections: { number: number; title: string; summary: string }[];
  }[];
};

function formatList(value: unknown): string {
  if (!value) return "";
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
      .join(", ");
  }
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function buildStyleBlock(book: {
  pov: string;
  tense: string;
  language: string;
  tone: string | null;
  audience: string | null;
  includeDialogue: boolean;
  includeExamples: boolean;
  style: string | null;
  customInstructions: string | null;
  characters: unknown;
  themes: unknown;
  forbiddenTopics: string | null;
}): string {
  const parts = [
    `Point of view: ${book.pov}`,
    `Tense: ${book.tense}`,
    `Language: ${book.language}`,
    `Tone: ${book.tone ?? "professional"}`,
    `Audience: ${book.audience ?? "general readers"}`,
    book.includeDialogue
      ? "Include natural dialogue where appropriate."
      : "Minimize or avoid dialogue.",
    book.includeExamples
      ? "Include concrete examples, frameworks, or case studies."
      : "Focus on narrative or exposition without instructional examples.",
  ];

  if (book.style) parts.push(`Style guide: ${book.style}`);
  if (book.customInstructions)
    parts.push(`Custom instructions: ${book.customInstructions}`);
  if (book.characters)
    parts.push(`Characters / cast: ${formatList(book.characters)}`);
  if (book.themes) parts.push(`Themes: ${formatList(book.themes)}`);
  if (book.forbiddenTopics)
    parts.push(`Avoid these topics: ${book.forbiddenTopics}`);

  return parts.join("\n");
}

export async function loadSectionEditorContext(sectionId: string, userId: string) {
  const section = await db.section.findFirst({
    where: {
      id: sectionId,
      chapter: { book: { userId } },
    },
    include: {
      chapter: {
        include: {
          book: true,
          sections: { orderBy: { number: "asc" } },
        },
      },
    },
  });

  if (!section) return null;

  const { chapter } = section;
  const { book } = chapter;

  const priorSections = chapter.sections
    .filter((s) => s.number < section.number && s.content)
    .map((s) => `### ${s.title}\n${s.content}`)
    .join("\n\n");

  const priorChapters = await db.chapter.findMany({
    where: {
      bookId: book.id,
      number: { lt: chapter.number },
      status: "COMPLETED",
    },
    select: { title: true, summary: true },
    orderBy: { number: "asc" },
  });

  const priorContext = [
    priorChapters.map((c) => `Chapter "${c.title}": ${c.summary}`).join("\n"),
    priorSections,
  ]
    .filter(Boolean)
    .join("\n\n");

  const outline = book.outline as unknown as BookOutline | null;

  return {
    book,
    chapter,
    section,
    styleBlock: buildStyleBlock(book),
    synopsis: outline?.synopsis ?? book.description ?? "",
    priorContext,
  };
}
