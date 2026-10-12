import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  DEFAULT_TTS_MODEL,
  isElevenLabsConfigured,
  listTtsModels,
  listVoices,
  pickNarrationVoice,
  resolveTtsModel,
} from "@/lib/elevenlabs";
import { ELEVENLABS_TTS_MODELS, ELEVENLABS_VOICES } from "@/lib/elevenlabs-voices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Narration voices and TTS models available on the ElevenLabs account. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isElevenLabsConfigured()) {
    return NextResponse.json({
      configured: false,
      live: false,
      voices: ELEVENLABS_VOICES,
      models: ELEVENLABS_TTS_MODELS,
      defaultVoiceId: ELEVENLABS_VOICES[0].id,
      defaultModelId: DEFAULT_TTS_MODEL,
    });
  }

  const [{ voices, live }, models, defaultModelId] = await Promise.all([
    listVoices(),
    listTtsModels(),
    resolveTtsModel(DEFAULT_TTS_MODEL),
  ]);

  return NextResponse.json(
    {
      configured: true,
      live,
      voices,
      models,
      defaultVoiceId: pickNarrationVoice(voices).id,
      defaultModelId,
    },
    { headers: { "Cache-Control": "private, max-age=600" } }
  );
}
