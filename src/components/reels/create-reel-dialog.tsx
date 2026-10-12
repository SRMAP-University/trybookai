"use client";

import { useMemo, useState } from "react";
import { Clapperboard, Film, Headphones, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UpgradeLink } from "@/components/dashboard/upgrade-button";
import {
  MusicLevelPicker,
  useNarrationCatalogue,
  voiceSummary,
  VoicePreviewButton,
} from "@/components/dashboard/narration-voices";
import { readJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  DEFAULT_VOICE_SETTINGS,
  VOICE_SETTING_PRESETS,
} from "@/lib/elevenlabs-voices";
import type { MusicLevel } from "@/lib/audio-generator/score-types";
import {
  DEFAULT_REEL_STYLE,
  REEL_STYLES,
  TRAILER_TARGET_WORDS,
  estimateReelSeconds,
  formatReelSeconds,
  type ReelAllowance,
  type ReelFormat,
  type ReelView,
} from "@/lib/reel-generator/types";

export type ReelChapterOption = {
  id: string;
  number: number;
  title: string;
  written: boolean;
};

const NARRATION_PRESET = VOICE_SETTING_PRESETS.find((p) => p.id === "narration")?.settings;

export function CreateReelDialog({
  open,
  onOpenChange,
  bookId,
  bookTitle,
  chapters,
  allowance,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookId: string;
  bookTitle: string;
  chapters: ReelChapterOption[];
  allowance: ReelAllowance | null;
  onCreated: (reel: ReelView) => void;
}) {
  const written = useMemo(() => chapters.filter((c) => c.written), [chapters]);
  const [format, setFormat] = useState<ReelFormat>("SHORTS");
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [style, setStyle] = useState(DEFAULT_REEL_STYLE);
  const [pickedVoiceId, setVoiceId] = useState("");
  const [music, setMusic] = useState<MusicLevel>("subtle");
  const [busy, setBusy] = useState(false);
  const catalogue = useNarrationCatalogue(open);

  const voiceId = pickedVoiceId || catalogue.defaultVoiceId;
  const voice = catalogue.voices.find((v) => v.id === voiceId) ?? catalogue.voices[0];

  // Free plans start with one chapter so the first reel fits the allowance.
  const selected =
    picked ?? new Set((allowance?.isFree ? written.slice(0, 1) : written).map((c) => c.id));
  const episodeCount = format === "TRAILER" ? 1 : selected.size;
  const wordsEach = format === "TRAILER" ? TRAILER_TARGET_WORDS : (allowance?.shortWords ?? 190);
  const estimate = episodeCount * estimateReelSeconds(wordsEach);
  const remaining = allowance?.remainingSeconds ?? 0;
  const overBudget = allowance != null && estimate > remaining + 10;
  const canSubmit =
    !busy && format !== "AUDIOBOOK" && episodeCount > 0 && !overBudget && written.length > 0;

  function toggleChapter(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  }

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch("/api/reels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId,
          format,
          chapterIds: format === "SHORTS" ? [...selected] : undefined,
          stylePreset: style,
          voiceId: voice?.id,
          voiceName: voice?.name,
          voiceSettings: {
            ...DEFAULT_VOICE_SETTINGS,
            ...NARRATION_PRESET,
            modelId: catalogue.defaultModelId,
            backgroundMusic: music,
          },
        }),
      });
      const result = await readJson<{ reel: ReelView }>(res);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Making your reel. Shots appear as they're drawn.");
      onCreated(result.data.reel);
      onOpenChange(false);
    } catch {
      toast.error("Couldn't start the reel. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  const formats: {
    id: ReelFormat;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    locked?: string;
  }[] = [
    {
      id: "SHORTS",
      label: "Chapter shorts",
      description: "One 60–90 second video per chapter",
      icon: Clapperboard,
    },
    {
      id: "TRAILER",
      label: "Book trailer",
      description: "The whole story in about a minute",
      icon: Film,
    },
    {
      id: "AUDIOBOOK",
      label: "Visual audiobook",
      description: "Pictures for your full audiobook",
      icon: Headphones,
      locked: allowance?.canUseVisualAudiobook ? "Coming soon" : "Premium",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[min(92dvh,820px)] flex-col gap-0 overflow-hidden border-[#e6ebf1] bg-white p-0 sm:max-w-[640px]"
      >
        <div className="border-b border-[#e6ebf1] bg-[#f6f9fc] px-5 pb-4 pt-6 sm:px-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#635bff]">
            Story Reels
          </p>
          <DialogTitle className="mt-1.5 text-[20px] font-semibold tracking-[-0.03em] text-[#0a2540]">
            Turn your book into vertical videos
          </DialogTitle>
          <DialogDescription className="mt-1.5 text-[13px] leading-relaxed text-[#697386]">
            A narrator reads, a new illustration appears for every scene, and captions follow the
            voice. Made from <span className="font-medium text-[#0a2540]">{bookTitle}</span>.
          </DialogDescription>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
          <section>
            <Label className="text-[13px] text-[#0a2540]">Format</Label>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {formats.map((option) => {
                const Icon = option.icon;
                const disabled = Boolean(option.locked);
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => setFormat(option.id)}
                    aria-pressed={format === option.id}
                    className={cn(
                      "flex flex-col items-start rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed",
                      format === option.id
                        ? "border-[#635bff] shadow-[0_0_0_3px_#ebe9ff]"
                        : "border-[#e6ebf1] hover:border-[#c9c5ff]",
                      disabled && "opacity-70 hover:border-[#e6ebf1]"
                    )}
                  >
                    <span className="flex w-full items-center justify-between">
                      <Icon className="h-4 w-4 text-[#635bff]" />
                      {option.locked && (
                        <span className="rounded-full bg-[#ebe9ff] px-2 py-0.5 text-[10px] font-semibold text-[#635bff]">
                          {option.locked}
                        </span>
                      )}
                    </span>
                    <span className="mt-2 text-[13px] font-semibold text-[#0a2540]">
                      {option.label}
                    </span>
                    <span className="mt-0.5 text-[12px] leading-snug text-[#697386]">
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
            {!allowance?.canUseVisualAudiobook && (
              <p className="mt-2 text-[12px] text-[#697386]">
                Visual audiobook is part of Premium. <UpgradeLink className="font-medium text-[#635bff]">See plans</UpgradeLink>
              </p>
            )}
          </section>

          {format === "SHORTS" && (
            <section>
              <div className="flex items-center justify-between">
                <Label className="text-[13px] text-[#0a2540]">Chapters</Label>
                {written.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setPicked(
                        selected.size === written.length
                          ? new Set()
                          : new Set(written.map((c) => c.id))
                      )
                    }
                    className="text-[12px] font-medium text-[#635bff]"
                  >
                    {selected.size === written.length ? "Clear" : "Select all"}
                  </button>
                )}
              </div>
              <div className="mt-2 max-h-[180px] space-y-1 overflow-y-auto rounded-xl border border-[#e6ebf1] p-2">
                {chapters.map((chapter) => (
                  <label
                    key={chapter.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] hover:bg-[#f6f9fc]",
                      !chapter.written && "cursor-not-allowed opacity-50"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(chapter.id)}
                      disabled={!chapter.written}
                      onChange={() => toggleChapter(chapter.id)}
                      className="h-4 w-4 accent-[#635bff]"
                    />
                    <span className="w-6 shrink-0 tabular-nums text-[#697386]">{chapter.number}</span>
                    <span className="min-w-0 flex-1 truncate text-[#0a2540]">{chapter.title}</span>
                  </label>
                ))}
              </div>
            </section>
          )}

          <section>
            <Label className="text-[13px] text-[#0a2540]">Art style</Label>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {REEL_STYLES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setStyle(option.id)}
                  aria-pressed={style === option.id}
                  className="flex flex-col items-center gap-1.5 text-[11.5px] font-medium text-[#425466]"
                >
                  <span
                    className={cn(
                      "block aspect-[9/13] w-full rounded-lg ring-offset-2 transition-shadow",
                      style === option.id ? "ring-2 ring-[#635bff]" : "ring-1 ring-[#e6ebf1]"
                    )}
                    style={{ background: option.swatch }}
                  />
                  <span className={cn(style === option.id && "text-[#0a2540]")}>{option.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <Label className="text-[13px] text-[#0a2540]">Narrator</Label>
              <Select value={voiceId} onValueChange={(v) => v && setVoiceId(v)}>
                <SelectTrigger className="mt-2 h-10 w-full border-[#e6ebf1]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {catalogue.voices.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                      {voiceSummary(v) ? ` · ${voiceSummary(v)}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {voice && (
                <div className="mt-1.5 flex items-center gap-2">
                  <VoicePreviewButton voice={voice} />
                  <p className="text-[12px] text-[#697386]">{voice.description}</p>
                </div>
              )}
            </div>
            <MusicLevelPicker value={music} onChange={setMusic} />
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e6ebf1] bg-[#fafbfc] px-5 py-3.5 sm:px-6">
          <div className="text-[12px] leading-snug text-[#697386]">
            {allowance ? (
              <>
                Uses about{" "}
                <span className={cn("font-semibold", overBudget ? "text-[#df1b41]" : "text-[#0a2540]")}>
                  {formatReelSeconds(estimate)}
                </span>{" "}
                of {formatReelSeconds(remaining)} left this month
                {overBudget && (
                  <>
                    {" · "}
                    <UpgradeLink className="font-medium text-[#635bff]">Get more</UpgradeLink>
                  </>
                )}
              </>
            ) : (
              "Checking your reel minutes…"
            )}
          </div>
          <Button
            className="h-9 bg-[#635bff] text-[13px] hover:bg-[#5851e5]"
            disabled={!canSubmit}
            onClick={submit}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {format === "TRAILER"
              ? "Make trailer"
              : `Make ${episodeCount} ${episodeCount === 1 ? "short" : "shorts"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
