import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { DEFAULT_AI_MODEL } from "@/lib/ai-models";
import { createChatCompletion } from "@/lib/book-generator/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  field: z.enum([
    "description",
    "customInstructions",
    "characters",
    "themes",
    "style",
  ]),
  text: z.string().max(8000).optional().default(""),
  title: z.string().max(200).optional(),
  genre: z.string().max(80).optional(),
  tone: z.string().max(80).optional(),
  audience: z.string().max(120).optional(),
});

const FIELD_PROMPTS: Record<
  z.infer<typeof schema>["field"],
  { task: string; emptyHint: string }
> = {
  description: {
    task: `Enhance this book premise into a clear, vivid 2–4 paragraph description a generative writing model can follow.
Cover premise, stakes, tone, setting, and what makes the book distinctive.
Keep the author's intent. Do not invent a full outline or chapter list.`,
    emptyHint:
      "Invent a compelling original book premise based on the title/genre/tone if provided.",
  },
  customInstructions: {
    task: `Rewrite these custom writing instructions so they are specific, actionable, and useful for an AI book generator.
Use short bullet-like sentences or a tight paragraph. Keep constraints clear.`,
    emptyHint:
      "Suggest useful custom instructions for this book (structure, pacing, voice, chapter endings).",
  },
  characters: {
    task: `Enhance the character notes into a clean one-character-per-line list.
Format each line as: Name — short role / trait summary (1 sentence).`,
    emptyHint:
      "Propose 3–6 interesting characters that fit the premise/genre.",
  },
  themes: {
    task: `Turn the themes into a concise comma-separated list of 4–8 strong thematic keywords.`,
    emptyHint: "Suggest themes that fit the premise/genre.",
  },
  style: {
    task: `Enhance this style guide into a practical writing brief (voice, sentence rhythm, vocabulary, dos/don'ts).
Keep it under ~180 words.`,
    emptyHint:
      "Draft a practical style guide that fits the genre and tone.",
  },
};

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { field, text, title, genre, tone, audience } = parsed.data;
  const trimmed = text.trim();
  if (trimmed.length < 3 && !title?.trim() && !genre?.trim()) {
    return NextResponse.json(
      {
        error:
          "Add a short draft (or at least a title/genre) before enhancing.",
      },
      { status: 400 }
    );
  }

  const prompt = FIELD_PROMPTS[field];
  const contextLines = [
    title?.trim() ? `Title: ${title.trim()}` : "",
    genre?.trim() ? `Genre: ${genre.trim()}` : "",
    tone?.trim() ? `Tone: ${tone.trim()}` : "",
    audience?.trim() ? `Audience: ${audience.trim()}` : "",
  ].filter(Boolean);

  try {
    const enhanced = await createChatCompletion({
      model: DEFAULT_AI_MODEL,
      temperature: 0.75,
      max_tokens: 1200,
      messages: [
        {
          role: "system",
          content: `You are BookAI's prompt enhancer. Improve author inputs for high-quality book generation.
Output only the enhanced text — no markdown fences, titles, or commentary.`,
        },
        {
          role: "user",
          content: [
            ...contextLines,
            `Field: ${field}`,
            `Task: ${prompt.task}`,
            trimmed
              ? `Current draft:\n${trimmed}`
              : `Current draft: (empty)\n${prompt.emptyHint}`,
            "Return only the enhanced field text.",
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
    });

    const cleaned = enhanced
      .trim()
      .replace(/^```[\w]*\n?/, "")
      .replace(/\n?```$/, "")
      .trim();

    if (!cleaned) {
      return NextResponse.json(
        { error: "Enhancer returned empty text. Try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({ text: cleaned, field });
  } catch (error) {
    console.error("[enhance-prompt]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to enhance prompt",
      },
      { status: 500 }
    );
  }
}
