"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Clapperboard,
  Headphones,
  Loader2,
  Mic2,
  Music2,
} from "lucide-react";
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
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DEFAULT_VOICE_SETTINGS,
  ELEVENLABS_TTS_MODELS,
  ELEVENLABS_VOICES,
  VOICE_SETTING_PRESETS,
  type VoiceSettingsConfig,
} from "@/lib/elevenlabs-voices";
import { DEFAULT_VOICE_ID } from "@/lib/elevenlabs";

export type AudioDerivativeType = "AUDIOBOOK" | "PODCAST" | "MUSIC";

export type AudioGenerationOptions = {
  voiceId?: string;
  voiceName?: string;
  voiceSettings?: VoiceSettingsConfig;
};

type DerivativeOption = {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  audioType?: AudioDerivativeType;
  available: boolean;
};

const OPTIONS: DerivativeOption[] = [
  {
    id: "audiobook",
    label: "Audiobook",
    description: "Narrate every chapter with ElevenLabs",
    icon: Headphones,
    tone: "from-[#0e6245] to-[#0a4d37]",
    audioType: "AUDIOBOOK",
    available: true,
  },
  {
    id: "podcast",
    label: "Podcast",
    description: "Episode scripts voiced from your book",
    icon: Mic2,
    tone: "from-[#635bff] to-[#4b44d4]",
    audioType: "PODCAST",
    available: true,
  },
  {
    id: "music",
    label: "Theme music",
    description: "A cinematic intro track for the story",
    icon: Music2,
    tone: "from-[#9a6700] to-[#7a5200]",
    audioType: "MUSIC",
    available: true,
  },
  {
    id: "movie",
    label: "Screenplay",
    description: "Scenes, shot list, and pacing notes",
    icon: Clapperboard,
    tone: "from-[#0a2540] to-[#1a3a5c]",
    available: false,
  },
];

function FormatVisual() {
  return (
    <div className="relative mx-auto h-[120px] w-full max-w-[280px]">
      <div className="absolute left-1/2 top-2 z-[1] h-[96px] w-[68px] -translate-x-[110%] -rotate-[-8deg] rounded-md bg-linear-to-br from-[#0a2540] to-[#1a3a5c] shadow-[0_12px_28px_rgba(10,37,64,0.28)]">
        <div className="absolute inset-y-3 left-1.5 w-px bg-white/20" />
        <div className="absolute bottom-3 left-3 right-2 space-y-1">
          <div className="h-1 w-8 rounded-full bg-white/35" />
          <div className="h-1 w-5 rounded-full bg-white/20" />
        </div>
      </div>

      <div className="absolute left-1/2 top-0 z-[2] h-[104px] w-[78px] -translate-x-1/2 rounded-md bg-linear-to-br from-[#635bff] to-[#4b44d4] shadow-[0_16px_32px_rgba(99,91,255,0.35)]">
        <div className="absolute inset-x-2 top-2 flex justify-between">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-1.5 w-1.5 rounded-[1px] bg-white/40" />
          ))}
        </div>
        <div className="absolute inset-x-3 top-6 bottom-6 rounded-sm bg-white/15" />
        <div className="absolute inset-x-2 bottom-2 flex justify-between">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-1.5 w-1.5 rounded-[1px] bg-white/40" />
          ))}
        </div>
      </div>

      <div className="absolute left-1/2 top-3 z-[3] flex h-[90px] w-[72px] translate-x-[28%] rotate-[9deg] items-end justify-center gap-1 rounded-md bg-linear-to-br from-[#0e6245] to-[#0a4d37] px-3 pb-4 shadow-[0_12px_28px_rgba(14,98,69,0.3)]">
        {[10, 18, 28, 16, 24, 12, 20].map((h, i) => (
          <span
            key={i}
            className="w-1 rounded-full bg-white/50"
            style={{ height: h }}
          />
        ))}
      </div>
    </div>
  );
}

function SliderField({
  label,
  hint,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <Label className="text-[13px] text-[#0a2540]">{label}</Label>
        <span className="text-[12px] tabular-nums text-[#697386]">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#e6ebf1] accent-[#635bff]"
      />
      <p className="mt-1 text-[11px] leading-relaxed text-[#697386]">{hint}</p>
    </div>
  );
}

type BookDerivativesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookTitle: string;
  onStartAudio: (
    type: AudioDerivativeType,
    regenerate?: boolean,
    options?: AudioGenerationOptions
  ) => Promise<void>;
  existingTypes?: AudioDerivativeType[];
};

export function BookDerivativesDialog({
  open,
  onOpenChange,
  bookTitle,
  onStartAudio,
  existingTypes = [],
}: BookDerivativesDialogProps) {
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"pick" | "customize">("pick");
  const [selected, setSelected] = useState<DerivativeOption | null>(null);
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE_ID);
  const [settings, setSettings] = useState<VoiceSettingsConfig>({
    ...DEFAULT_VOICE_SETTINGS,
  });
  const [activePreset, setActivePreset] = useState("narration");

  const selectedVoice = useMemo(
    () => ELEVENLABS_VOICES.find((v) => v.id === voiceId) ?? ELEVENLABS_VOICES[0],
    [voiceId]
  );

  function resetAndClose(nextOpen: boolean) {
    if (!nextOpen) {
      setStep("pick");
      setSelected(null);
      setBusy(false);
    }
    onOpenChange(nextOpen);
  }

  function patchSettings(patch: Partial<VoiceSettingsConfig>) {
    setActivePreset("custom");
    setSettings((prev) => ({ ...prev, ...patch }));
  }

  async function handleSelect(option: DerivativeOption) {
    if (!option.available || !option.audioType) {
      toast.success(`We'll email you when ${option.label.toLowerCase()} ships.`);
      resetAndClose(false);
      return;
    }

    if (option.audioType === "MUSIC") {
      setBusy(true);
      try {
        const regenerate = existingTypes.includes(option.audioType);
        await onStartAudio(option.audioType, regenerate);
        resetAndClose(false);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not start generation"
        );
      } finally {
        setBusy(false);
      }
      return;
    }

    setSelected(option);
    setActivePreset(option.audioType === "PODCAST" ? "podcast" : "narration");
    const preset = VOICE_SETTING_PRESETS.find(
      (p) =>
        p.id === (option.audioType === "PODCAST" ? "podcast" : "narration")
    );
    setSettings({
      ...DEFAULT_VOICE_SETTINGS,
      ...preset?.settings,
    });
    setStep("customize");
  }

  async function handleGenerate() {
    if (!selected?.audioType) return;
    const regenerate = existingTypes.includes(selected.audioType);
    setBusy(true);
    try {
      await onStartAudio(selected.audioType, regenerate, {
        voiceId: selectedVoice.id,
        voiceName: selectedVoice.name,
        voiceSettings: settings,
      });
      resetAndClose(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not start generation"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent
        showCloseButton
        className="gap-0 overflow-hidden border-[#e6ebf1] bg-white p-0 sm:max-w-[640px]"
      >
        {step === "pick" ? (
          <>
            <div className="relative overflow-hidden border-b border-[#e6ebf1] bg-[#f6f9fc] px-6 pb-5 pt-7">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.4]"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 1px 1px, #d8dee8 1px, transparent 0)",
                  backgroundSize: "18px 18px",
                }}
              />
              <div className="relative">
                <FormatVisual />
                <div className="mt-5 text-center">
                  <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#635bff]">
                    Audio studio
                  </p>
                  <DialogTitle className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-[#0a2540]">
                    Turn your book into audio
                  </DialogTitle>
                  <DialogDescription className="mx-auto mt-2 max-w-[360px] text-[13px] leading-relaxed text-[#697386]">
                    <span className="font-medium text-[#0a2540]">{bookTitle}</span>{" "}
                    can become an audiobook, podcast series, or theme track.
                  </DialogDescription>
                </div>
              </div>
            </div>

            <div className="grid gap-3 p-5 sm:grid-cols-2">
              {OPTIONS.map((option) => {
                const Icon = option.icon;
                const hasExisting =
                  option.audioType && existingTypes.includes(option.audioType);
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={busy}
                    onClick={() => handleSelect(option)}
                    className="group flex flex-col rounded-xl border border-[#e6ebf1] bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[#635bff]/35 hover:shadow-[0_10px_28px_rgba(10,37,64,0.08)] disabled:opacity-60"
                  >
                    <div
                      className={cn(
                        "mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-linear-to-br text-white",
                        option.tone
                      )}
                    >
                      {busy && option.audioType === "MUSIC" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Icon className="h-4 w-4" />
                      )}
                    </div>
                    <p className="text-[14px] font-semibold text-[#0a2540]">
                      {option.label}
                    </p>
                    <p className="mt-1 flex-1 text-[12px] leading-relaxed text-[#697386]">
                      {option.description}
                    </p>
                    <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-[#635bff]">
                      {!option.available
                        ? "Join waitlist"
                        : option.audioType === "MUSIC"
                          ? hasExisting
                            ? "Regenerate"
                            : "Generate"
                          : "Customize voice"}
                      <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="max-h-[min(70vh,560px)] space-y-5 overflow-y-auto px-6 py-5">
              <DialogTitle className="sr-only">
                Voice settings for {selected?.label}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Customize ElevenLabs narration settings.
              </DialogDescription>
              <div>
                <Label className="text-[13px] text-[#0a2540]">Voice</Label>
                <Select value={voiceId} onValueChange={(v) => v && setVoiceId(v)}>
                  <SelectTrigger className="mt-2 h-10 w-full border-[#e6ebf1]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ELEVENLABS_VOICES.map((voice) => (
                      <SelectItem key={voice.id} value={voice.id}>
                        {voice.name} · {voice.style} · {voice.gender}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-[12px] text-[#697386]">
                  {selectedVoice.description}
                </p>
              </div>

              <div>
                <Label className="text-[13px] text-[#0a2540]">Model</Label>
                <Select
                  value={settings.modelId}
                  onValueChange={(modelId) =>
                    modelId && patchSettings({ modelId })
                  }
                >
                  <SelectTrigger className="mt-2 h-10 w-full border-[#e6ebf1]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ELEVENLABS_TTS_MODELS.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-[12px] text-[#697386]">
                  {
                    ELEVENLABS_TTS_MODELS.find((m) => m.id === settings.modelId)
                      ?.description
                  }
                </p>
              </div>

              <div>
                <Label className="text-[13px] text-[#0a2540]">Presets</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {VOICE_SETTING_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setActivePreset(preset.id);
                        setSettings({
                          ...DEFAULT_VOICE_SETTINGS,
                          ...preset.settings,
                          modelId: settings.modelId,
                        });
                      }}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
                        activePreset === preset.id
                          ? "border-[#635bff] bg-[#f0efff] text-[#635bff]"
                          : "border-[#e6ebf1] text-[#425466] hover:border-[#c9c5ff]"
                      )}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4 rounded-xl border border-[#e6ebf1] bg-[#fafbfc] p-4">
                <SliderField
                  label="Stability"
                  hint="Lower = more expressive. Higher = steadier narration."
                  value={settings.stability}
                  min={0}
                  max={1}
                  step={0.05}
                  display={`${Math.round(settings.stability * 100)}%`}
                  onChange={(stability) => patchSettings({ stability })}
                />
                <SliderField
                  label="Similarity"
                  hint="How closely the AI matches the original voice sample."
                  value={settings.similarityBoost}
                  min={0}
                  max={1}
                  step={0.05}
                  display={`${Math.round(settings.similarityBoost * 100)}%`}
                  onChange={(similarityBoost) =>
                    patchSettings({ similarityBoost })
                  }
                />
                <SliderField
                  label="Style exaggeration"
                  hint="Amplifies the voice’s speaking style (uses more compute)."
                  value={settings.style}
                  min={0}
                  max={1}
                  step={0.05}
                  display={`${Math.round(settings.style * 100)}%`}
                  onChange={(style) => patchSettings({ style })}
                />
                <SliderField
                  label="Speed"
                  hint="Speech rate. 1.0 is natural pace."
                  value={settings.speed}
                  min={0.7}
                  max={1.2}
                  step={0.05}
                  display={`${settings.speed.toFixed(2)}×`}
                  onChange={(speed) => patchSettings({ speed })}
                />
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={settings.useSpeakerBoost}
                    onChange={(e) =>
                      patchSettings({ useSpeakerBoost: e.target.checked })
                    }
                    className="mt-0.5 h-4 w-4 rounded border-[#e6ebf1] accent-[#635bff]"
                  />
                  <span>
                    <span className="block text-[13px] font-medium text-[#0a2540]">
                      Speaker boost
                    </span>
                    <span className="mt-0.5 block text-[11px] text-[#697386]">
                      Enhances clarity and similarity to the original speaker.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e6ebf1] bg-[#fafbfc] px-5 py-3.5">
              <button
                type="button"
                onClick={() => setStep("pick")}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-[#697386] hover:text-[#0a2540]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
              <Button
                className="h-9 bg-[#635bff] text-[13px] hover:bg-[#5851e5]"
                onClick={handleGenerate}
                disabled={busy}
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {selected?.audioType &&
                existingTypes.includes(selected.audioType)
                  ? "Regenerate"
                  : "Generate"}{" "}
                {selected?.label.toLowerCase()}
              </Button>
            </div>
          </>
        )}

        {step === "pick" && (
          <div className="border-t border-[#e6ebf1] bg-[#fafbfc] px-5 py-3.5">
            <Button
              variant="ghost"
              className="h-8 w-full text-[13px] text-[#697386] hover:bg-transparent hover:text-[#0a2540]"
              onClick={() => resetAndClose(false)}
            >
              Not now
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
