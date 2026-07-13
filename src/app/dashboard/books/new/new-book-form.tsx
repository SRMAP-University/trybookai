"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AI_MODELS,
  BOOK_GENRES,
  BOOK_LANGUAGES,
  BOOK_POVS,
  BOOK_TEMPLATES,
  BOOK_TENSES,
  BOOK_TONES,
  CREATIVITY_LEVELS,
  DEFAULT_AI_MODEL,
  STYLE_PRESETS,
} from "@/lib/constants";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDashboardUser } from "@/components/dashboard/user-context";
import { UpgradeLink } from "@/components/dashboard/upgrade-button";

type FormState = {
  title: string;
  description: string;
  genre: string;
  tone: string;
  audience: string;
  targetPages: number;
  pov: string;
  tense: string;
  language: string;
  chapterCount: string;
  sectionsPerChapter: number;
  wordsPerPage: number;
  includeDialogue: boolean;
  includeExamples: boolean;
  customInstructions: string;
  characters: string;
  themes: string;
  forbiddenTopics: string;
  style: string;
  model: string;
  creativity: number;
  templateId: string;
  startGeneration: boolean;
  generateAudiobook: boolean;
};

const initialForm: FormState = {
  title: "",
  description: "",
  genre: "Fiction",
  tone: "Professional",
  audience: "General readers",
  targetPages: 100,
  pov: "third",
  tense: "past",
  language: "en",
  chapterCount: "",
  sectionsPerChapter: 4,
  wordsPerPage: 300,
  includeDialogue: true,
  includeExamples: false,
  customInstructions: "",
  characters: "",
  themes: "",
  forbiddenTopics: "",
  style: "",
  model: DEFAULT_AI_MODEL,
  creativity: 0.7,
  templateId: "",
  startGeneration: true,
  generateAudiobook: false,
};

export function NewBookForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useDashboardUser();
  const canGenerateAudio = Boolean(
    user && user.plan !== "FREE" && (user.audioMinutesLimit ?? 0) > 0
  );
  const [form, setForm] = useState<FormState>(initialForm);
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [defaultsLoaded, setDefaultsLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setForm((prev) => ({
          ...prev,
          genre: data.defaultGenre ?? prev.genre,
          tone: data.defaultTone ?? prev.tone,
          audience: data.defaultAudience ?? prev.audience,
          targetPages: data.defaultTargetPages ?? prev.targetPages,
          pov: data.defaultPov ?? prev.pov,
          tense: data.defaultTense ?? prev.tense,
          language: data.defaultLanguage ?? prev.language,
          model: data.defaultModel ?? prev.model,
          creativity: data.defaultCreativity ?? prev.creativity,
          wordsPerPage: data.defaultWordsPerPage ?? prev.wordsPerPage,
          sectionsPerChapter:
            data.defaultSectionsPerChapter ?? prev.sectionsPerChapter,
          style: data.styleGuide ?? prev.style,
          // Default on unless the user explicitly disabled auto-generate
          startGeneration: data.autoGenerateOnCreate ?? true,
        }));
      })
      .finally(() => setDefaultsLoaded(true));
  }, []);

  useEffect(() => {
    if (!defaultsLoaded) return;
    const templateId = searchParams.get("template");
    if (templateId) applyTemplate(templateId);
    const title = searchParams.get("title");
    if (title) {
      setForm((prev) => ({ ...prev, title: prev.title || title }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply once after defaults
  }, [defaultsLoaded, searchParams]);

  function applyTemplate(templateId: string) {
    const template = BOOK_TEMPLATES.find((t) => t.id === templateId);
    if (!template) {
      setForm((prev) => ({ ...prev, templateId: "" }));
      return;
    }
    setForm((prev) => ({
      ...prev,
      templateId,
      genre: template.genre,
      tone: template.tone,
      targetPages: template.targetPages,
      pov: template.pov,
      tense: template.tense,
      includeDialogue: template.includeDialogue,
      includeExamples: template.includeExamples,
      description: prev.description || template.description,
    }));
    setShowAdvanced(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const res = await fetch("/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        description: form.description || undefined,
        genre: form.genre,
        tone: form.tone,
        audience: form.audience || undefined,
        targetPages: form.targetPages,
        pov: form.pov,
        tense: form.tense,
        language: form.language,
        chapterCount: form.chapterCount ? Number(form.chapterCount) : null,
        sectionsPerChapter: form.sectionsPerChapter,
        wordsPerPage: form.wordsPerPage,
        includeDialogue: form.includeDialogue,
        includeExamples: form.includeExamples,
        customInstructions: form.customInstructions || undefined,
        characters: form.characters
          ? form.characters
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
        themes: form.themes
          ? form.themes
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
        forbiddenTopics: form.forbiddenTopics || undefined,
        style: form.style || undefined,
        model: form.model,
        creativity: form.creativity,
        templateId: form.templateId || undefined,
        startGeneration: form.startGeneration,
        generateAudiobookOnComplete:
          canGenerateAudio && form.generateAudiobook,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      toast.error(
        typeof data.error === "string" ? data.error : "Failed to create book"
      );
      return;
    }

    const book = await res.json();
    const shouldStream = form.startGeneration || book.startStream;
    toast.success(
      shouldStream
        ? form.generateAudiobook
          ? "Book created — writing, then narrating"
          : "Book created — writing now"
        : "Book created"
    );
    router.push(
      `/dashboard/books/${book.id}${shouldStream ? "?generate=1" : ""}`
    );
  }

  if (!defaultsLoaded) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-[#635bff]" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1100px]">
      <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#0a2540]">
        New book
      </h1>
      <p className="mt-1 text-[14px] text-[#697386]">
        Configure your book on the left, or pick a template on the right.
      </p>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-lg border border-[#e6ebf1] bg-white p-6"
        >
        <Field label="Title">
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="The Silent Archive"
            className="h-10 border-[#e6ebf1]"
            required
          />
        </Field>

        <Field label="Description / premise">
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Plot, themes, or subject matter..."
            rows={4}
            className="border-[#e6ebf1]"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Genre">
            <Select
              value={form.genre}
              onValueChange={(genre) => setForm({ ...form, genre })}
            >
              <SelectTrigger className="h-10 border-[#e6ebf1]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BOOK_GENRES.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Tone">
            <Select
              value={form.tone}
              onValueChange={(tone) => setForm({ ...form, tone })}
            >
              <SelectTrigger className="h-10 border-[#e6ebf1]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BOOK_TONES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Audience">
            <Input
              value={form.audience}
              onChange={(e) => setForm({ ...form, audience: e.target.value })}
              className="h-10 border-[#e6ebf1]"
            />
          </Field>
          <Field label="Target pages">
            <Input
              type="number"
              min={3}
              max={1000}
              value={form.targetPages}
              onChange={(e) =>
                setForm({ ...form, targetPages: Number(e.target.value) })
              }
              className="h-10 border-[#e6ebf1]"
              required
            />
          </Field>
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex w-full items-center justify-between rounded-md border border-[#e6ebf1] px-4 py-3 text-left hover:bg-[#f6f9fc]"
        >
          <div>
            <p className="text-[14px] font-medium text-[#0a2540]">
              Advanced settings
            </p>
            <p className="text-[12px] text-[#697386]">
              POV, structure, characters, model, style, and more
            </p>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-[#697386] transition-transform",
              showAdvanced && "rotate-180"
            )}
          />
        </button>

        {showAdvanced && (
          <div className="space-y-6 border-t border-[#e6ebf1] pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Point of view">
                <Select
                  value={form.pov}
                  onValueChange={(pov) => setForm({ ...form, pov })}
                >
                  <SelectTrigger className="h-10 border-[#e6ebf1]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOOK_POVS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Tense">
                <Select
                  value={form.tense}
                  onValueChange={(tense) => setForm({ ...form, tense })}
                >
                  <SelectTrigger className="h-10 border-[#e6ebf1]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOOK_TENSES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Language">
                <Select
                  value={form.language}
                  onValueChange={(language) => setForm({ ...form, language })}
                >
                  <SelectTrigger className="h-10 border-[#e6ebf1]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOOK_LANGUAGES.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Chapter count (optional)">
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={form.chapterCount}
                  onChange={(e) =>
                    setForm({ ...form, chapterCount: e.target.value })
                  }
                  placeholder="Auto"
                  className="h-10 border-[#e6ebf1]"
                />
              </Field>
              <Field label="Sections per chapter">
                <Input
                  type="number"
                  min={2}
                  max={8}
                  value={form.sectionsPerChapter}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      sectionsPerChapter: Number(e.target.value),
                    })
                  }
                  className="h-10 border-[#e6ebf1]"
                />
              </Field>
              <Field label="Words per page">
                <Input
                  type="number"
                  min={150}
                  max={500}
                  value={form.wordsPerPage}
                  onChange={(e) =>
                    setForm({ ...form, wordsPerPage: Number(e.target.value) })
                  }
                  className="h-10 border-[#e6ebf1]"
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Toggle
                label="Include dialogue"
                checked={form.includeDialogue}
                onChange={(includeDialogue) =>
                  setForm({ ...form, includeDialogue })
                }
              />
              <Toggle
                label="Include examples / case studies"
                checked={form.includeExamples}
                onChange={(includeExamples) =>
                  setForm({ ...form, includeExamples })
                }
              />
            </div>

            <Field label="Characters (one per line)">
              <Textarea
                rows={3}
                value={form.characters}
                onChange={(e) =>
                  setForm({ ...form, characters: e.target.value })
                }
                placeholder={"Elena Voss — archivist\nMarcus Hale — rival scholar"}
                className="border-[#e6ebf1]"
              />
            </Field>

            <Field label="Themes (comma-separated)">
              <Input
                value={form.themes}
                onChange={(e) => setForm({ ...form, themes: e.target.value })}
                placeholder="memory, power, redemption"
                className="h-10 border-[#e6ebf1]"
              />
            </Field>

            <Field label="Topics to avoid">
              <Textarea
                rows={2}
                value={form.forbiddenTopics}
                onChange={(e) =>
                  setForm({ ...form, forbiddenTopics: e.target.value })
                }
                placeholder="Anything the model should not include..."
                className="border-[#e6ebf1]"
              />
            </Field>

            <Field label="Custom instructions">
              <Textarea
                rows={3}
                value={form.customInstructions}
                onChange={(e) =>
                  setForm({ ...form, customInstructions: e.target.value })
                }
                placeholder="End each chapter with a cliffhanger. Keep chapters under 4,000 words..."
                className="border-[#e6ebf1]"
              />
            </Field>

            <div>
              <p className="mb-2 text-[13px] text-[#425466]">Style presets</p>
              <div className="mb-3 grid gap-2 sm:grid-cols-2">
                {STYLE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setForm({ ...form, style: preset.style })}
                    className="rounded-md border border-[#e6ebf1] px-3 py-2 text-left text-[12px] hover:border-[#635bff]"
                  >
                    <span className="font-medium text-[#0a2540]">
                      {preset.name}
                    </span>
                  </button>
                ))}
              </div>
              <Field label="Style guide">
                <Textarea
                  rows={4}
                  value={form.style}
                  onChange={(e) => setForm({ ...form, style: e.target.value })}
                  className="border-[#e6ebf1]"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Model">
                <Select
                  value={form.model}
                  onValueChange={(model) => setForm({ ...form, model })}
                >
                  <SelectTrigger className="h-10 border-[#e6ebf1]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_MODELS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Creativity">
                <Select
                  value={String(form.creativity)}
                  onValueChange={(v) =>
                    setForm({ ...form, creativity: Number(v) })
                  }
                >
                  <SelectTrigger className="h-10 border-[#e6ebf1]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CREATIVITY_LEVELS.map((c) => (
                      <SelectItem key={c.value} value={String(c.value)}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>
        )}

        <Toggle
          label="Start generation after create"
          checked={form.startGeneration}
          onChange={(startGeneration) =>
            setForm({
              ...form,
              startGeneration,
              generateAudiobook: startGeneration
                ? form.generateAudiobook
                : false,
            })
          }
        />

        <Toggle
          label="Generate audiobook after book completes"
          checked={canGenerateAudio && form.generateAudiobook}
          onChange={(generateAudiobook) => {
            if (!canGenerateAudio) return;
            setForm({
              ...form,
              generateAudiobook,
              startGeneration: generateAudiobook
                ? true
                : form.startGeneration,
            });
          }}
        />
        {!canGenerateAudio && (
          <p className="-mt-4 text-[12px] text-[#697386]">
            Audiobooks require Pro or Premium.{" "}
            <UpgradeLink
              plan="PRO"
              className="font-medium text-[#635bff] hover:underline"
            >
              Upgrade
            </UpgradeLink>
          </p>
        )}

        <Button
          type="submit"
          className="h-10 w-full rounded-md bg-[#635bff] text-[14px] hover:bg-[#5851e5]"
          disabled={loading}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {form.startGeneration
            ? form.generateAudiobook
              ? "Create, write & narrate"
              : "Create & generate"
            : "Create book"}
        </Button>
      </form>

        <aside className="lg:sticky lg:top-6">
          <div className="rounded-lg border border-[#e6ebf1] bg-white p-4">
            <p className="text-[13px] font-medium text-[#0a2540]">Templates</p>
            <p className="mt-1 text-[12px] text-[#697386]">
              Click one to fill genre, tone, and length.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => applyTemplate("")}
                className={cn(
                  "rounded-md border px-3 py-2.5 text-left transition-colors",
                  !form.templateId
                    ? "border-[#635bff] bg-[#f0efff]/50"
                    : "border-[#e6ebf1] hover:border-[#635bff]/50"
                )}
              >
                <p className="text-[13px] font-medium text-[#0a2540]">
                  Blank book
                </p>
                <p className="mt-0.5 text-[12px] text-[#697386]">
                  Start from your defaults
                </p>
              </button>
              {BOOK_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => applyTemplate(template.id)}
                  className={cn(
                    "rounded-md border px-3 py-2.5 text-left transition-colors",
                    form.templateId === template.id
                      ? "border-[#635bff] bg-[#f0efff]/50"
                      : "border-[#e6ebf1] hover:border-[#635bff]/50"
                  )}
                >
                  <p className="text-[13px] font-medium text-[#0a2540]">
                    {template.name}
                  </p>
                  <p className="mt-0.5 text-[12px] text-[#697386]">
                    {template.targetPages} pages · {template.genre}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-[13px] text-[#425466]">{label}</Label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-md border border-[#e6ebf1] px-4 py-3 text-left"
    >
      <span className="text-[14px] text-[#0a2540]">{label}</span>
      <span
        className={cn(
          "flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors",
          checked ? "bg-[#635bff]" : "bg-[#e6ebf1]"
        )}
      >
        <span
          className={cn(
            "h-4 w-4 rounded-full bg-white transition-transform",
            checked && "translate-x-4"
          )}
        />
      </span>
    </button>
  );
}
