import { auth } from "@/lib/auth";
import {
  applyAssistResult,
  buildEditorAssistMessages,
  type EditorAiAction,
} from "@/lib/book-editor/assist";
import { loadSectionEditorContext } from "@/lib/book-editor/context";
import { DEFAULT_AI_MODEL } from "@/lib/ai-models";
import { streamChatCompletion } from "@/lib/book-generator/llm";
import { z } from "zod";

const assistSchema = z.object({
  action: z.enum([
    "rewrite",
    "expand",
    "shorten",
    "continue",
    "fix_grammar",
    "regenerate_section",
  ]),
  sectionId: z.string(),
  content: z.string().max(200_000),
  selection: z.string().max(50_000).optional(),
  selectionStart: z.number().int().min(0).optional(),
  selectionEnd: z.number().int().min(0).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = assistSchema.safeParse(body);

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const {
    action,
    sectionId,
    content,
    selection,
    selectionStart,
    selectionEnd,
  } = parsed.data;

  if (
    action !== "continue" &&
    action !== "regenerate_section" &&
    !selection?.trim()
  ) {
    return new Response(
      JSON.stringify({ error: "Select text in the editor first." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const ctx = await loadSectionEditorContext(sectionId, session.user.id);
  if (!ctx || ctx.book.id !== id) {
    return new Response(JSON.stringify({ error: "Section not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const messages = buildEditorAssistMessages(
    action as EditorAiAction,
    {
      title: ctx.book.title,
      genre: ctx.book.genre,
      description: ctx.book.description,
      styleBlock: ctx.styleBlock,
      chapterTitle: ctx.chapter.title,
      chapterSummary: ctx.chapter.summary,
      sectionTitle: ctx.section.title,
      sectionNumber: ctx.section.number,
      synopsis: ctx.synopsis,
      priorContext: ctx.priorContext,
    },
    content,
    selection
  );

  const encoder = new TextEncoder();
  let fullOutput = "";

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        send("phase", { message: "AI is writing…" });

        fullOutput = await streamChatCompletion({
          model: ctx.book.model || DEFAULT_AI_MODEL,
          temperature: ctx.book.creativity ?? 0.7,
          max_tokens: action === "regenerate_section" ? 8192 : 4096,
          messages,
          onToken: (token) => {
            send("token", { text: token });
          },
        });

        const merged = applyAssistResult(
          action as EditorAiAction,
          content,
          fullOutput,
          selectionStart,
          selectionEnd
        );

        send("done", { content: merged });
        controller.close();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "AI assist failed";
        send("error", { message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
