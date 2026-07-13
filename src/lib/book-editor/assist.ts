import type { ChatMessage } from "@/lib/book-generator/llm";

export type EditorAiAction =
  | "rewrite"
  | "expand"
  | "shorten"
  | "continue"
  | "fix_grammar"
  | "regenerate_section";

type BookContext = {
  title: string;
  genre: string | null;
  description: string | null;
  styleBlock: string;
  chapterTitle: string;
  chapterSummary: string | null;
  sectionTitle: string;
  sectionNumber: number;
  synopsis: string;
  priorContext: string;
};

const ACTION_INSTRUCTIONS: Record<EditorAiAction, string> = {
  rewrite:
    "Rewrite the selected passage to improve clarity, flow, and prose quality. Keep the same meaning and approximate length.",
  expand:
    "Expand the selected passage with richer detail, sensory description, and depth. Roughly double the length.",
  shorten:
    "Condense the selected passage while preserving essential meaning. Cut redundancy.",
  continue:
    "Continue writing naturally from where the text ends. Add the next 2–4 paragraphs that fit the story.",
  fix_grammar:
    "Fix grammar, punctuation, and awkward phrasing in the selected passage. Preserve voice and meaning.",
  regenerate_section:
    "Rewrite the entire section from scratch with fresh prose while honoring the section purpose and book context.",
};

export function buildEditorAssistMessages(
  action: EditorAiAction,
  ctx: BookContext,
  sectionContent: string,
  selection?: string
): ChatMessage[] {
  const instruction = ACTION_INSTRUCTIONS[action];
  const hasSelection = Boolean(selection?.trim());

  const userParts = [
    `Book: "${ctx.title}" (${ctx.genre ?? "general"})`,
    `Synopsis: ${ctx.synopsis}`,
    `Chapter: ${ctx.chapterTitle}${ctx.chapterSummary ? ` — ${ctx.chapterSummary}` : ""}`,
    `Section ${ctx.sectionNumber}: ${ctx.sectionTitle}`,
    ctx.priorContext ? `Earlier context:\n${ctx.priorContext}` : "",
    `Current section text:\n${sectionContent}`,
  ];

  if (hasSelection) {
    userParts.push(`Selected passage to work on:\n${selection}`);
  }

  userParts.push(`Task: ${instruction}`);
  userParts.push(
    "Output only the replacement or new prose. No headings, labels, or commentary."
  );

  return [
    {
      role: "system",
      content: `You are a professional book editor and co-author helping refine "${ctx.title}".

Writing requirements:
${ctx.styleBlock}`,
    },
    {
      role: "user",
      content: userParts.filter(Boolean).join("\n\n"),
    },
  ];
}

export function applyAssistResult(
  action: EditorAiAction,
  sectionContent: string,
  aiOutput: string,
  selectionStart?: number,
  selectionEnd?: number
): string {
  const output = aiOutput.trim();
  if (!output) return sectionContent;

  if (action === "continue") {
    const separator = sectionContent.endsWith("\n") ? "\n" : "\n\n";
    return sectionContent + separator + output;
  }

  if (action === "regenerate_section") {
    return output;
  }

  if (
    selectionStart !== undefined &&
    selectionEnd !== undefined &&
    selectionStart !== selectionEnd
  ) {
    return (
      sectionContent.slice(0, selectionStart) +
      output +
      sectionContent.slice(selectionEnd)
    );
  }

  return output;
}
