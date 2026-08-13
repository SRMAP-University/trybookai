import type { Sql } from "./db";
import {
  asStringArray,
  buildAssembledUserPrompt,
  clipToBudget,
  extractEntityHints,
  formatList,
} from "./context-utils";

type OutlineLike = { synopsis?: string };

export async function assembleSectionContext(
  sql: Sql,
  bookId: string,
  sectionId: string
) {
  const sections = await sql<
    {
      id: string;
      number: number;
      title: string;
      content: string | null;
      chapterId: string;
      chapterNumber: number;
      chapterTitle: string;
      chapterSummary: string | null;
      bookTitle: string;
      description: string | null;
      genre: string | null;
      outline: unknown;
      style: string | null;
      audience: string | null;
      tone: string | null;
      pov: string;
      tense: string;
      language: string;
      includeDialogue: boolean;
      includeExamples: boolean;
      customInstructions: string | null;
      forbiddenTopics: string | null;
      sectionsPerChapter: number;
    }[]
  >`
    SELECT
      s.id, s.number, s.title, s.content,
      c.id AS "chapterId", c.number AS "chapterNumber", c.title AS "chapterTitle",
      c.summary AS "chapterSummary",
      b.title AS "bookTitle", b.description, b.genre, b.outline, b.style,
      b.audience, b.tone, b.pov, b.tense, b.language,
      b."includeDialogue", b."includeExamples", b."customInstructions",
      b."forbiddenTopics", b."sectionsPerChapter"
    FROM "Section" s
    INNER JOIN "Chapter" c ON c.id = s."chapterId"
    INNER JOIN "Book" b ON b.id = c."bookId"
    WHERE s.id = ${sectionId} AND c."bookId" = ${bookId}
    LIMIT 1
  `;
  const section = sections[0];
  if (!section) throw new Error(`Section ${sectionId} not found`);

  const bibleRows = await sql<
    { id: string; styleNotes: string | null; worldRules: string | null; themes: unknown }[]
  >`
    SELECT id, "styleNotes", "worldRules", themes FROM "BookBible"
    WHERE "bookId" = ${bookId} LIMIT 1
  `;
  const bible = bibleRows[0];

  const storyRows = await sql<
    {
      plotPhase: string | null;
      openThreads: unknown;
      bookSummary: string | null;
    }[]
  >`
    SELECT "plotPhase", "openThreads", "bookSummary" FROM "StoryState"
    WHERE "bookId" = ${bookId} LIMIT 1
  `;
  const story = storyRows[0];

  const chStateRows = await sql<
    {
      summary: string | null;
      charactersPresent: unknown;
      location: string | null;
      events: unknown;
      openThreads: unknown;
    }[]
  >`
    SELECT summary, "charactersPresent", location, events, "openThreads"
    FROM "ChapterState" WHERE "chapterId" = ${section.chapterId} LIMIT 1
  `;
  const chState = chStateRows[0];

  const secStateRows = await sql<
    { summary: string | null; objective: string | null; charactersPresent: unknown }[]
  >`
    SELECT summary, objective, "charactersPresent"
    FROM "SectionState" WHERE "sectionId" = ${sectionId} LIMIT 1
  `;
  const secState = secStateRows[0];

  const priorSections = await sql<
    { number: number; title: string; content: string | null; summary: string | null }[]
  >`
    SELECT s.number, s.title, s.content, st.summary
    FROM "Section" s
    LEFT JOIN "SectionState" st ON st."sectionId" = s.id
    WHERE s."chapterId" = ${section.chapterId} AND s.number < ${section.number}
    ORDER BY s.number DESC
    LIMIT 1
  `;
  const prev = priorSections[0];

  const priorChapters = await sql<
    { number: number; title: string; summary: string | null; stateSummary: string | null }[]
  >`
    SELECT c.number, c.title, c.summary, st.summary AS "stateSummary"
    FROM "Chapter" c
    LEFT JOIN "ChapterState" st ON st."chapterId" = c.id
    WHERE c."bookId" = ${bookId} AND c.number < ${section.chapterNumber}
    ORDER BY c.number ASC
  `;

  const outline = section.outline as OutlineLike | null;
  const styleParts = [
    `Point of view: ${section.pov}`,
    `Tense: ${section.tense}`,
    `Language: ${section.language}`,
    `Tone: ${section.tone ?? "professional"}`,
    `Audience: ${section.audience ?? "general readers"}`,
    section.includeDialogue
      ? "Include natural dialogue where appropriate."
      : "Minimize or avoid dialogue.",
    section.includeExamples
      ? "Include concrete examples where useful."
      : "Prefer narrative/exposition over instructional examples.",
    section.style ? `Style guide: ${section.style}` : null,
    section.customInstructions
      ? `Custom instructions: ${section.customInstructions}`
      : null,
    bible?.styleNotes ? `Bible style notes: ${bible.styleNotes}` : null,
    bible?.worldRules ? `World rules: ${bible.worldRules}` : null,
    bible?.themes ? `Themes: ${formatList(bible.themes)}` : null,
    section.forbiddenTopics ? `Avoid: ${section.forbiddenTopics}` : null,
  ].filter(Boolean);

  const systemStyle = styleParts.join("\n");
  const core = [
    `Book: "${section.bookTitle}" (${section.genre ?? "general"})`,
    `Synopsis: ${outline?.synopsis ?? section.description ?? ""}`,
    systemStyle,
  ].join("\n");

  const chapterSummaries = priorChapters
    .map(
      (c) =>
        `Ch ${c.number} "${c.title}": ${c.stateSummary ?? c.summary ?? ""}`
    )
    .join("\n");

  const current = [
    story?.plotPhase ? `Plot phase: ${story.plotPhase}` : null,
    story?.openThreads
      ? `Open book threads: ${formatList(story.openThreads)}`
      : null,
    story?.bookSummary
      ? `Book state: ${clipToBudget(story.bookSummary, 400)}`
      : null,
    `Current chapter ${section.chapterNumber}: "${section.chapterTitle}"`,
    section.chapterSummary
      ? `Chapter summary: ${section.chapterSummary}`
      : null,
    chState?.summary ? `Chapter state: ${chState.summary}` : null,
    chState?.location ? `Location: ${chState.location}` : null,
    chState?.charactersPresent
      ? `Characters present: ${formatList(chState.charactersPresent)}`
      : null,
    chState?.events ? `Chapter events: ${formatList(chState.events)}` : null,
    chState?.openThreads
      ? `Chapter open threads: ${formatList(chState.openThreads)}`
      : null,
    secState?.objective
      ? `Scene objective: ${secState.objective}`
      : `Scene: ${section.title}`,
    chapterSummaries
      ? `Prior chapters:\n${clipToBudget(chapterSummaries, 800)}`
      : null,
    prev?.summary ? `Previous scene summary: ${prev.summary}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const hints = extractEntityHints(
    section.title,
    section.chapterTitle,
    section.chapterSummary,
    chState?.location,
    formatList(chState?.charactersPresent),
    formatList(secState?.charactersPresent),
    prev?.summary
  );

  let characters: { name: string; profile: string | null; aliases: unknown }[] =
    [];
  let locations: { name: string; description: string | null }[] = [];
  let factions: { name: string }[] = [];
  if (bible) {
    characters = await sql`
      SELECT name, profile, aliases FROM "BibleCharacter"
      WHERE "bibleId" = ${bible.id}
      ORDER BY "createdAt" ASC
      LIMIT 40
    `;
    locations = await sql`
      SELECT name, description FROM "BibleLocation"
      WHERE "bibleId" = ${bible.id}
      LIMIT 30
    `;
    factions = await sql`
      SELECT name FROM "BibleFaction" WHERE "bibleId" = ${bible.id} LIMIT 12
    `;
  }

  const hintLower = hints.map((h) => h.toLowerCase());
  const matchedChars = characters.filter((c) =>
    hintLower.some(
      (h) =>
        c.name.toLowerCase().includes(h) ||
        h.includes(c.name.toLowerCase()) ||
        asStringArray(c.aliases).some((a) => a.toLowerCase().includes(h))
    )
  );
  const chars =
    matchedChars.length > 0 ? matchedChars.slice(0, 8) : characters.slice(0, 5);
  const matchedLocs = locations.filter((l) =>
    hintLower.some(
      (h) => l.name.toLowerCase().includes(h) || h.includes(l.name.toLowerCase())
    )
  );

  const facts = await sql<{ subject: string; predicate: string; object: string }[]>`
    SELECT subject, predicate, object FROM "CanonFact"
    WHERE "bookId" = ${bookId} AND status = 'CANON'
    ORDER BY "updatedAt" DESC
    LIMIT 24
  `;
  const filteredFacts =
    hints.length > 0
      ? facts
          .filter((f) =>
            hintLower.some(
              (h) =>
                f.subject.toLowerCase().includes(h) ||
                f.object.toLowerCase().includes(h) ||
                h.includes(f.subject.toLowerCase())
            )
          )
          .slice(0, 24)
      : facts.slice(0, 12);

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
    factions.length
      ? `Factions: ${factions
          .slice(0, 6)
          .map((f) => f.name)
          .join(", ")}`
      : null,
    filteredFacts.length
      ? `Canon facts:\n${filteredFacts
          .map((f) => `- ${f.subject} ${f.predicate} ${f.object}`)
          .join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const immediate = prev?.content ? clipToBudget(prev.content, 1800) : "(none)";

  const assembled = buildAssembledUserPrompt({
    core,
    current,
    retrieved,
    immediate,
    sectionTitle: section.title,
    sectionNumber: section.number,
    sectionsPerChapter: section.sectionsPerChapter || 4,
  });

  return {
    ...assembled,
    systemStyle,
    chapterId: section.chapterId,
    factsBrief: filteredFacts
      .slice(0, 16)
      .map((f) => `${f.subject} ${f.predicate} ${f.object}`)
      .join("\n"),
  };
}
