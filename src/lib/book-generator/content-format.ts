export type ManuscriptLayout = "literary" | "practical" | "academic" | "youth";

export type ContentFormatInput = {
  genre?: string | null;
  templateId?: string | null;
  description?: string | null;
  customInstructions?: string | null;
  includeExamples?: boolean | null;
};

export type ContentFormatProfile = {
  layout: ManuscriptLayout;
  structured: boolean;
  wantsTables: boolean;
  wantsFigures: boolean;
  wantsSubheadings: boolean;
  instructions: string;
};

const PRACTICAL_GENRES = new Set([
  "business",
  "technology",
  "education",
  "self-help",
  "self help",
  "health & wellness",
  "health",
  "non-fiction",
  "nonfiction",
]);

const ACADEMIC_GENRES = new Set([
  "history",
  "philosophy",
  "biography",
  "science",
]);

const YOUTH_GENRES = new Set(["children's", "childrens", "young adult"]);

const STRUCTURED_TEMPLATES = new Set([
  "business-guide",
  "self-help",
  "tech-handbook",
]);

const STRUCTURE_HINT =
  /\b(table|tables|chart|diagram|framework|checklist|workbook|handbook|textbook|illustrated|illustration|infographic|step[- ]by[- ]step|comparison|matrix|worksheet)\b/i;

const NARRATIVE_HINT =
  /\b(novel|short story|literary|pure narrative|no tables|prose only)\b/i;

function norm(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

export function resolveManuscriptLayout(
  input: ContentFormatInput
): ManuscriptLayout {
  const genre = norm(input.genre);
  if (YOUTH_GENRES.has(genre) || genre.includes("children")) return "youth";
  if (PRACTICAL_GENRES.has(genre) || STRUCTURED_TEMPLATES.has(norm(input.templateId))) {
    return "practical";
  }
  if (ACADEMIC_GENRES.has(genre)) return "academic";
  return "literary";
}

export function resolveContentFormat(
  input: ContentFormatInput
): ContentFormatProfile {
  const layout = resolveManuscriptLayout(input);
  const prompt = `${input.description ?? ""} ${input.customInstructions ?? ""}`;
  const wantsStructureFromPrompt = STRUCTURE_HINT.test(prompt);
  const narrativeOnly = NARRATIVE_HINT.test(prompt);

  const structured =
    !narrativeOnly &&
    (layout === "practical" ||
      layout === "academic" ||
      layout === "youth" ||
      Boolean(input.includeExamples) ||
      wantsStructureFromPrompt);

  const wantsTables =
    structured &&
    (layout === "practical" ||
      layout === "academic" ||
      wantsStructureFromPrompt);

  const wantsFigures =
    structured &&
    (layout === "practical" ||
      layout === "youth" ||
      layout === "academic" ||
      /\b(illustrat|diagram|figure|image|visual)\b/i.test(prompt));

  const wantsSubheadings = structured && layout !== "literary";

  const instructions = buildFormatInstructions({
    layout,
    structured,
    wantsTables,
    wantsFigures,
    wantsSubheadings,
  });

  return {
    layout,
    structured,
    wantsTables,
    wantsFigures,
    wantsSubheadings,
    instructions,
  };
}

export function sectionOutputHint(profile: ContentFormatProfile): string {
  if (!profile.structured) {
    return "Output only the section prose. Do not repeat the chapter or section title. No reasoning notes.";
  }
  return "Output only the section manuscript in the FORMAT RULES above. Do not repeat the chapter or section title. No reasoning or commentary.";
}

function buildFormatInstructions(profile: {
  layout: ManuscriptLayout;
  structured: boolean;
  wantsTables: boolean;
  wantsFigures: boolean;
  wantsSubheadings: boolean;
}): string {
  if (!profile.structured) {
    return [
      "FORMAT RULES:",
      "- Write continuous literary prose for this section.",
      "- Do not use markdown headings, tables, or figure markers.",
      "- Do not invent a chapter title or section title — those already exist.",
      "- Use paragraph breaks only. Dialogue is allowed.",
    ].join("\n");
  }

  const lines = [
    "FORMAT RULES (follow exactly):",
    "- Write the section as a structured manuscript, not a wall of prose.",
    "- Do not invent a chapter title or repeat the section title as an H1.",
    "- Use GitHub-flavored Markdown only. No HTML.",
  ];

  if (profile.wantsSubheadings) {
    lines.push(
      "- Use ## and ### headings for real subsections (2–6 per section when the topic needs them).",
      "- Heading style: Title Case, short, specific. Never number chapters yourself."
    );
  }

  if (profile.wantsTables) {
    lines.push(
      "- When comparing options, listing steps, or summarizing data, include at least one Markdown table.",
      "- Tables must be real GFM pipe tables with a header row and --- separator. Keep 2–6 columns.",
      "- Example:",
      "  | Concept | Why it matters | How to apply |",
      "  | --- | --- | --- |",
      "  | Focus | Readers stay oriented | One idea per heading |"
    );
  }

  if (profile.wantsFigures) {
    lines.push(
      "- When a diagram, scene, chart, or visual would help, insert a figure on its own line:",
      "  [FIGURE: detailed visual description of what the illustration should show]",
      "- Use figures for processes, maps, character/scene snapshots, or conceptual diagrams — not decorative filler.",
      "- 0–2 figures per section. Never fake an image URL."
    );
  }

  lines.push(
    "- Use bullet or numbered lists for procedures, takeaways, and checklists.",
    "- Use **bold** for key terms and *italics* for emphasis or inner thought.",
    "- Still write full paragraphs between structures. Do not turn the whole section into a list."
  );

  if (profile.layout === "youth") {
    lines.push(
      "- Keep language clear and inviting. Prefer short headings and simple figure descriptions."
    );
  }
  if (profile.layout === "academic") {
    lines.push(
      "- Prefer precise terminology and logical subsections. Do not invent citations or sources."
    );
  }

  return lines.join("\n");
}

export function layoutClassName(layout: ManuscriptLayout): string {
  switch (layout) {
    case "practical":
      return "font-sans tracking-[-0.01em]";
    case "academic":
      return "font-serif";
    case "youth":
      return "font-sans";
    default:
      return "font-serif";
  }
}
