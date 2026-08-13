import { db } from "@/lib/db";
import {
  asStringArray,
  buildAssembledUserPrompt,
  clipToBudget,
  extractEntityHints,
  formatList,
  type AssembledContext,
  type BookOutlineLike,
} from "@/lib/book-context/types";

/**
 * Assemble hierarchical context for writing a section.
 * Budgets: CORE / CURRENT / RETRIEVED / IMMEDIATE — not the whole manuscript.
 */
export async function assembleSectionContext(
  bookId: string,
  sectionId: string
): Promise<AssembledContext & { systemStyle: string }> {
  const section = await db.section.findFirstOrThrow({
    where: { id: sectionId, chapter: { bookId } },
    include: {
      state: true,
      chapter: {
        include: {
          state: true,
          book: {
            include: {
              bible: {
                include: {
                  characters: true,
                  locations: true,
                  factions: true,
                  objects: true,
                },
              },
              storyState: true,
            },
          },
          sections: {
            orderBy: { number: "asc" },
            include: { state: true },
          },
        },
      },
    },
  });

  const { chapter } = section;
  const { book } = chapter;
  const bible = book.bible;
  const outline = book.outline as BookOutlineLike | null;
  const sectionsPerChapter =
    book.sectionsPerChapter || chapter.sections.length || 4;

  const styleParts = [
    `Point of view: ${book.pov}`,
    `Tense: ${book.tense}`,
    `Language: ${book.language}`,
    `Tone: ${book.tone ?? "professional"}`,
    `Audience: ${book.audience ?? "general readers"}`,
    book.includeDialogue
      ? "Include natural dialogue where appropriate."
      : "Minimize or avoid dialogue.",
    book.includeExamples
      ? "Include concrete examples where useful."
      : "Prefer narrative/exposition over instructional examples.",
    book.style ? `Style guide: ${book.style}` : null,
    book.customInstructions
      ? `Custom instructions: ${book.customInstructions}`
      : null,
    bible?.styleNotes ? `Bible style notes: ${bible.styleNotes}` : null,
    bible?.worldRules ? `World rules: ${bible.worldRules}` : null,
    bible?.themes ? `Themes: ${formatList(bible.themes)}` : null,
    book.forbiddenTopics ? `Avoid: ${book.forbiddenTopics}` : null,
  ].filter(Boolean);

  const systemStyle = styleParts.join("\n");
  const core = [
    `Book: "${book.title}" (${book.genre ?? "general"})`,
    `Synopsis: ${outline?.synopsis ?? book.description ?? ""}`,
    systemStyle,
  ].join("\n");

  const priorChapters = await db.chapter.findMany({
    where: { bookId, number: { lt: chapter.number } },
    orderBy: { number: "asc" },
    select: {
      number: true,
      title: true,
      summary: true,
      state: true,
    },
  });

  const chapterSummaries = priorChapters
    .map((c) => {
      const s = c.state?.summary ?? c.summary ?? "";
      return `Ch ${c.number} "${c.title}": ${s}`;
    })
    .join("\n");

  const chState = chapter.state;
  const prevSection = chapter.sections
    .filter((s) => s.number < section.number && (s.content || s.state?.summary))
    .sort((a, b) => b.number - a.number)[0];

  const current = [
    book.storyState?.plotPhase
      ? `Plot phase: ${book.storyState.plotPhase}`
      : null,
    book.storyState?.openThreads
      ? `Open book threads: ${formatList(book.storyState.openThreads)}`
      : null,
    book.storyState?.bookSummary
      ? `Book state: ${clipToBudget(book.storyState.bookSummary, 400)}`
      : null,
    `Current chapter ${chapter.number}: "${chapter.title}"`,
    chapter.summary ? `Chapter summary: ${chapter.summary}` : null,
    chState?.summary ? `Chapter state: ${chState.summary}` : null,
    chState?.location ? `Location: ${chState.location}` : null,
    chState?.charactersPresent
      ? `Characters present: ${formatList(chState.charactersPresent)}`
      : null,
    chState?.events ? `Chapter events: ${formatList(chState.events)}` : null,
    chState?.openThreads
      ? `Chapter open threads: ${formatList(chState.openThreads)}`
      : null,
    section.state?.objective
      ? `Scene objective: ${section.state.objective}`
      : `Scene: ${section.title}`,
    chapterSummaries
      ? `Prior chapters:\n${clipToBudget(chapterSummaries, 800)}`
      : null,
    prevSection?.state?.summary
      ? `Previous scene summary: ${prevSection.state.summary}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const hints = extractEntityHints(
    section.title,
    chapter.title,
    chapter.summary,
    chState?.location,
    formatList(chState?.charactersPresent),
    formatList(section.state?.charactersPresent),
    prevSection?.state?.summary
  );

  const hintLower = hints.map((h) => h.toLowerCase());
  const matchedChars = (bible?.characters ?? []).filter((c) =>
    hintLower.some(
      (h) =>
        c.name.toLowerCase().includes(h) ||
        h.includes(c.name.toLowerCase()) ||
        asStringArray(c.aliases).some((a) => a.toLowerCase().includes(h))
    )
  );
  const matchedLocs = (bible?.locations ?? []).filter((l) =>
    hintLower.some(
      (h) => l.name.toLowerCase().includes(h) || h.includes(l.name.toLowerCase())
    )
  );
  const chars =
    matchedChars.length > 0
      ? matchedChars.slice(0, 8)
      : (bible?.characters ?? []).slice(0, 5);

  const facts =
    hints.length > 0
      ? await db.canonFact.findMany({
          where: {
            bookId,
            status: "CANON",
            OR: hints.flatMap((h) => [
              { subject: { contains: h, mode: "insensitive" as const } },
              { object: { contains: h, mode: "insensitive" as const } },
            ]),
          },
          orderBy: { updatedAt: "desc" },
          take: 24,
        })
      : await db.canonFact.findMany({
          where: { bookId, status: "CANON" },
          orderBy: { updatedAt: "desc" },
          take: 12,
        });

  const retrieved = [
    chars.length
      ? `Characters:\n${chars
          .map(
            (c) =>
              `- ${c.name}${c.profile ? `: ${clipToBudget(c.profile, 80)}` : ""}`
          )
          .join("\n")}`
      : null,
    matchedLocs.length
      ? `Locations:\n${matchedLocs
          .map(
            (l) =>
              `- ${l.name}${l.description ? `: ${clipToBudget(l.description, 60)}` : ""}`
          )
          .join("\n")}`
      : null,
    (bible?.factions ?? []).length
      ? `Factions: ${(bible?.factions ?? [])
          .slice(0, 6)
          .map((f) => f.name)
          .join(", ")}`
      : null,
    facts.length
      ? `Canon facts:\n${facts
          .map((f) => `- ${f.subject} ${f.predicate} ${f.object}`)
          .join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const immediate = prevSection?.content
    ? clipToBudget(prevSection.content, 1800)
    : "(none)";

  const assembled = buildAssembledUserPrompt({
    core,
    current,
    retrieved,
    immediate,
    sectionTitle: section.title,
    sectionNumber: section.number,
    sectionsPerChapter,
  });

  return { ...assembled, systemStyle };
}
