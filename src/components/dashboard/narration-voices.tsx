"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_TTS_MODEL,
  ELEVENLABS_TTS_MODELS,
  ELEVENLABS_VOICES,
  type ElevenLabsVoice,
} from "@/lib/elevenlabs-voices";

type TtsModel = { id: string; name: string; description: string };

export type NarrationCatalogue = {
  voices: ElevenLabsVoice[];
  models: TtsModel[];
  defaultVoiceId: string;
  defaultModelId: string;
  /** True once the account's own voice list has loaded. */
  live: boolean;
};

const FALLBACK: NarrationCatalogue = {
  voices: ELEVENLABS_VOICES,
  models: [...ELEVENLABS_TTS_MODELS],
  defaultVoiceId: ELEVENLABS_VOICES[0].id,
  defaultModelId: DEFAULT_TTS_MODEL,
  live: false,
};

/**
 * Voices and TTS models on the ElevenLabs account. Starts with the built-in
 * list so pickers never render empty, then swaps in the live catalogue.
 */
export function useNarrationCatalogue(enabled = true): NarrationCatalogue {
  const [catalogue, setCatalogue] = useState<NarrationCatalogue>(FALLBACK);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch("/api/audio/voices")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Partial<NarrationCatalogue> | null) => {
        if (cancelled || !data?.voices?.length) return;
        setCatalogue({
          voices: data.voices,
          models: data.models?.length ? data.models : FALLBACK.models,
          defaultVoiceId: data.defaultVoiceId ?? data.voices[0].id,
          defaultModelId: data.defaultModelId ?? DEFAULT_TTS_MODEL,
          live: Boolean(data.live),
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return catalogue;
}

/** One line about a voice: gender, accent/style, age, use case. */
export function voiceSummary(voice: ElevenLabsVoice): string {
  return [voice.gender !== "neutral" ? voice.gender : null, voice.accent ?? voice.style, voice.age, voice.useCase]
    .filter(Boolean)
    .map((part) => String(part).replace(/_/g, " "))
    .join(" · ");
}

/** Plays ElevenLabs' sample clip for a voice; one preview at a time. */
export function VoicePreviewButton({
  voice,
  className,
}: {
  voice: ElevenLabsVoice;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    return () => audioRef.current?.pause();
  }, []);

  if (!voice.previewUrl) return null;

  function toggle(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (playing) {
      audioRef.current?.pause();
      return;
    }
    // Stop any other preview, then play this one from the start.
    window.dispatchEvent(new CustomEvent("voice-preview:play"));
    const audio = new Audio(voice.previewUrl);
    audio.addEventListener("ended", () => setPlaying(false));
    audio.addEventListener("pause", () => setPlaying(false));
    window.addEventListener("voice-preview:play", () => audio.pause(), { once: true });
    audioRef.current = audio;
    void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`${playing ? "Stop" : "Play"} ${voice.name} sample`}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#e6ebf1] text-[#635bff] transition-colors hover:border-[#c9c5ff] hover:bg-[#f8f7ff]",
        className
      )}
    >
      {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
    </button>
  );
}
