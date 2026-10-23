"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ChevronDown, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  PLANS,
} from "@/lib/constants";
import { normalizeModelId } from "@/lib/ai-models";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDashboardUser } from "@/components/dashboard/user-context";
import { UpgradeLink } from "@/components/dashboard/upgrade-button";
import { PremiumUpgradeDialog } from "@/components/dashboard/premium-upgrade-dialog";
import {
  Chip,
  Collapse,
  EnhanceButton,
  Field,
  GroupHeading,
  Segmented,
  SwitchRow,
} from "./form-controls";
import { BookPreviewCover, PreviewStats, genreColor } from "./book-preview";
import type { TemplateCover } from "@/lib/template-covers";
import { formatWords, readingTime } from "@/lib/reading-stats";

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
  includeIllustrations: boolean;
};

const PAGE_PRESETS = [
  { pages: 10, label: "Short" },
  { pages: 25, label: "Medium" },
  { pages: 50, label: "Long" },
] as const;

const TENSE_OPTIONS = BOOK_TENSES.map((t) => ({
  value: t.value as string,
  label: t.label.replace(/ tense$/, ""),
}));

const CREATIVITY_OPTIONS = CREATIVITY_LEVELS.map((c) => ({
  value: c.value as number,
  label: c.label,
}));

const initialForm: FormState = {
  title: "",
  description: "",
  genre: "Fiction",
  tone: "Professional",
  audience: "General readers",
  targetPages: 10,
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
  includeIllustrations: true,
};

export function NewBookForm({
  templateCovers = {},
}: {
  /** A real public cover per template id, from getTemplateCovers(). */
  templateCovers?: Record<string, TemplateCover>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useDashboardUser();
  const canGenerateAudio = Boolean(
    user && user.plan !== "FREE" && (user.audioMinutesLimit ?? 0) > 0
  );
  const maxBookPages =
    (user?.plan && user.plan in PLANS
      ? PLANS[user.plan as keyof typeof PLANS].maxBookPages
      : PLANS.FREE.maxBookPages) ?? 50;
  const [form, setForm] = useState<FormState>(initialForm);
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [defaultsLoaded, setDefaultsLoaded] = useState(false);
  const [enhancing, setEnhancing] = useState<string | null>(null);
  const [premiumUpgradeOpen, setPremiumUpgradeOpen] = useState(false);
  const [premiumFeatureLabel, setPremiumFeatureLabel] = useState(
    "Upgrade for more monthly page credits."
  );
  const [customLength, setCustomLength] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function enhanceField(
    field:
      | "description"
      | "customInstructions"
      | "characters"
      | "themes"
      | "style"
  ) {
    const current = form[field];
    if (
      !current.trim() &&
      !form.title.trim() &&
      !form.genre.trim()
    ) {
      toast.error("Add a title, genre, or a short draft first.");
      return;
    }

    setEnhancing(field);
    try {
      const res = await fetch("/api/books/enhance-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field,
          text: current,
          title: form.title,
          genre: form.genre,
          tone: form.tone,
          audience: form.audience,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not enhance");
      }
      setForm((prev) => ({ ...prev, [field]: data.text as string }));
      toast.success("Prompt enhanced");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not enhance prompt"
      );
    } finally {
      setEnhancing(null);
    }
  }

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
          targetPages: 10, // product default (settings value often still 100 for existing users)
          pov: data.defaultPov ?? prev.pov,
          tense: data.defaultTense ?? prev.tense,
          language: data.defaultLanguage ?? prev.language,
          model: data.defaultModel ? normalizeModelId(data.defaultModel) : prev.model,
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
    const prompt = searchParams.get("prompt");
    if (prompt) {
      setForm((prev) => ({
        ...prev,
        description: prev.description || prompt,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply once after defaults
  }, [defaultsLoaded, searchParams]);

  function applyTemplate(templateId: string) {
    const template = BOOK_TEMPLATES.find((t) => t.id === templateId);
    if (!template) {
      setForm((prev) => ({ ...prev, templateId: "" }));
      return;
    }
    // Fit the template to the plan's per-book limit rather than letting the
    // author fill in the whole form and only then hit the upgrade dialog.
    const targetPages = Math.min(template.targetPages, maxBookPages);
    setForm((prev) => ({
      ...prev,
      templateId,
      genre: template.genre,
      tone: template.tone,
      targetPages,
      pov: template.pov,
      tense: template.tense,
      includeDialogue: template.includeDialogue,
      includeExamples: template.includeExamples,
      // Swap in the new template's premise unless the author wrote their own.
      description:
        !prev.description || BOOK_TEMPLATES.some((t) => t.description === prev.description)
          ? template.description
          : prev.description,
    }));
    const isPreset = PAGE_PRESETS.some((p) => p.pages === targetPages);
    setCustomLength(!isPreset);
    if (typeof window === "undefined" || window.matchMedia("(min-width: 1024px)").matches) {
      setShowAdvanced(true);
    }
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
        includeIllustrations: form.includeIllustrations,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      const err =
        typeof data.error === "string" ? data.error : "Failed to create book";
      if (
        /insufficient page credits|pages remaining|allows up to .* pages/i.test(
          err
        )
      ) {
        setPremiumFeatureLabel(err);
        setPremiumUpgradeOpen(true);
      } else {
        toast.error(err);
      }
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

  const words = form.targetPages * form.wordsPerPage;
  const overPlan = form.targetPages > maxBookPages;
  const template = BOOK_TEMPLATES.find((t) => t.id === form.templateId);
  // The chosen template normally runs longer than this plan allows per book.
  const templateTrimmed =
    !overPlan && template !== undefined && template.targetPages > maxBookPages;
  const narrate = canGenerateAudio && form.generateAudiobook;
  const ctaLabel = form.startGeneration
    ? narrate
      ? "Create, write & narrate"
      : "Create & generate"
    : "Create book";
  const descriptionWords = form.description.trim()
    ? form.description.trim().split(/\s+/).length
    : 0;
  const pagesLeft = user ? Math.max(0, user.pagesLimit - user.pagesUsed) : null;
  const languageLabel =
    BOOK_LANGUAGES.find((l) => l.value === form.language)?.label ??
    form.language;
  const creativity = CREATIVITY_LEVELS.find((c) => c.value === form.creativity);

  return (
    <div className="w-full max-lg:pb-28">
      <header>
        <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#0a2540]">
          New book
        </h1>
        <p className="mt-1 text-[14px] text-[#697386]">
          Describe it, choose its shape, and BookAI writes it.
        </p>
      </header>

      <TemplatePicker
        selected={form.templateId}
        covers={templateCovers}
        maxBookPages={maxBookPages}
        onSelect={applyTemplate}
      />

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_272px]">
        <form
          id="new-book-form"
          onSubmit={handleSubmit}
          className="min-w-0 space-y-8"
        >
          {/* Composer */}
          <div className="rounded-2xl border border-[#e6ebf1] bg-white shadow-[0_1px_2px_rgba(10,37,64,0.04),0_12px_32px_-20px_rgba(10,37,64,0.25)] transition-[border-color,box-shadow] duration-200 focus-within:border-[#c9c5ff] focus-within:ring-4 focus-within:ring-[#635bff]/10">
            <label htmlFor="book-title" className="sr-only">
              Title
            </label>
            <input
              id="book-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Untitled book"
              required
              className="block w-full bg-transparent px-5 pt-5 text-[22px] font-semibold tracking-[-0.02em] text-[#0a2540] outline-none placeholder:text-[#c1c9d2]"
            />
            <label htmlFor="book-description" className="sr-only">
              What’s the book about?
            </label>
            <textarea
              id="book-description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={5}
              placeholder="What’s it about? A few sentences on plot, topic, or who it’s for…"
              className="block w-full resize-none bg-transparent px-5 pb-3 pt-3 text-[16px] leading-relaxed text-[#0a2540] outline-none placeholder:text-[#a3acb9] lg:text-[15px]"
            />
            <div className="flex items-center justify-between gap-3 border-t border-[#eef1f5] px-3 py-2">
              <span className="px-2 text-[12px] tabular-nums text-[#a3acb9]">
                {descriptionWords > 0 &&
                  `${descriptionWords} word${descriptionWords === 1 ? "" : "s"}`}
              </span>
              <EnhanceButton
                loading={enhancing === "description"}
                disabled={Boolean(enhancing)}
                onClick={() => enhanceField("description")}
              />
            </div>
          </div>

          <section className="space-y-3">
            <GroupHeading title="Genre" />
            <div className="flex flex-wrap gap-2">
              {BOOK_GENRES.map((genre) => (
                <Chip
                  key={genre}
                  selected={form.genre === genre}
                  onClick={() => set("genre", genre)}
                >
                  {genre}
                </Chip>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <GroupHeading title="Tone" />
            <div className="flex flex-wrap gap-2">
              {BOOK_TONES.map((tone) => (
                <Chip
                  key={tone}
                  selected={form.tone === tone}
                  onClick={() => set("tone", tone)}
                >
                  {tone}
                </Chip>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <GroupHeading title="Length" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PAGE_PRESETS.map((preset) => (
                <LengthCard
                  key={preset.pages}
                  selected={!customLength && form.targetPages === preset.pages}
                  label={preset.label}
                  detail={`${preset.pages} pages`}
                  sub={`~${formatWords(preset.pages * form.wordsPerPage)} words`}
                  onClick={() => {
                    setCustomLength(false);
                    set("targetPages", preset.pages);
                  }}
                />
              ))}
              <LengthCard
                selected={customLength}
                label="Custom"
                detail={customLength ? `${form.targetPages} pages` : "Any length"}
                sub={`Up to ${maxBookPages} on your plan`}
                onClick={() => setCustomLength(true)}
              />
            </div>
            <Collapse open={customLength}>
              <div className="flex items-center gap-3 pt-1">
                <Input
                  id="book-pages"
                  type="number"
                  min={3}
                  max={1000}
                  inputMode="numeric"
                  aria-label="Target pages"
                  value={form.targetPages}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    set("targetPages", Number.isFinite(n) ? n : form.targetPages);
                  }}
                  className="h-10 w-28 border-[#e6ebf1] text-[16px] lg:text-[14px]"
                />
                <span className="text-[13px] text-[#697386]">pages</span>
              </div>
            </Collapse>
            {overPlan && (
              <p className="text-[12.5px] text-[#635bff]">
                Your plan writes up to {maxBookPages} pages per book.{" "}
                <UpgradeLink plan="PRO" className="font-medium hover:underline">
                  Upgrade for longer books
                </UpgradeLink>
              </p>
            )}
            {templateTrimmed && (
              <p className="text-[12.5px] text-[#697386]">
                The {template.name.toLowerCase()} template usually runs{" "}
                {template.targetPages} pages; your plan writes up to{" "}
                {maxBookPages} per book.{" "}
                <UpgradeLink
                  plan="PRO"
                  className="font-medium text-[#635bff] hover:underline"
                >
                  Upgrade for the full length
                </UpgradeLink>
              </p>
            )}
          </section>

          <Field label="Audience" htmlFor="book-audience">
            <Input
              id="book-audience"
              value={form.audience}
              onChange={(e) => set("audience", e.target.value)}
              placeholder="General readers"
              className="h-10 border-[#e6ebf1] text-[16px] lg:text-[14px]"
            />
          </Field>

          {/* More options */}
          <div className="rounded-2xl border border-[#e6ebf1] bg-white">
            <button
              type="button"
              aria-expanded={showAdvanced}
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
            >
              <span>
                <span className="block text-[14px] font-semibold text-[#0a2540]">
                  More options
                </span>
                <span className="block text-[12.5px] text-[#697386]">
                  Voice, story details, style and model
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-[#697386] transition-transform duration-300",
                  showAdvanced && "rotate-180"
                )}
              />
            </button>

            <Collapse open={showAdvanced}>
              <div className="space-y-8 border-t border-[#eef1f5] px-5 py-6">
                <section className="space-y-4">
                  <GroupHeading title="Voice & structure" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Point of view">
                      <Select value={form.pov} onValueChange={(pov) => set("pov", pov)}>
                        <SelectTrigger className="h-10 w-full border-[#e6ebf1]">
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
                      <Segmented
                        label="Tense"
                        value={form.tense}
                        options={TENSE_OPTIONS}
                        onChange={(tense) => set("tense", tense)}
                      />
                    </Field>
                    <Field label="Language">
                      <Select
                        value={form.language}
                        onValueChange={(language) => set("language", language)}
                      >
                        <SelectTrigger className="h-10 w-full border-[#e6ebf1]">
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
                    <Field label="Chapters" htmlFor="book-chapters">
                      <Input
                        id="book-chapters"
                        type="number"
                        min={1}
                        max={100}
                        value={form.chapterCount}
                        onChange={(e) => set("chapterCount", e.target.value)}
                        placeholder="Auto"
                        className="h-10 border-[#e6ebf1]"
                      />
                    </Field>
                    <Field label="Sections per chapter" htmlFor="book-sections">
                      <Input
                        id="book-sections"
                        type="number"
                        min={2}
                        max={8}
                        value={form.sectionsPerChapter}
                        onChange={(e) =>
                          set("sectionsPerChapter", Number(e.target.value))
                        }
                        className="h-10 border-[#e6ebf1]"
                      />
                    </Field>
                    <Field label="Words per page" htmlFor="book-wpp">
                      <Input
                        id="book-wpp"
                        type="number"
                        min={150}
                        max={500}
                        value={form.wordsPerPage}
                        onChange={(e) => set("wordsPerPage", Number(e.target.value))}
                        className="h-10 border-[#e6ebf1]"
                      />
                    </Field>
                  </div>
                  <div className="grid gap-x-6 sm:grid-cols-2">
                    <SwitchRow
                      label="Dialogue"
                      checked={form.includeDialogue}
                      onChange={(v) => set("includeDialogue", v)}
                    />
                    <SwitchRow
                      label="Examples & case studies"
                      checked={form.includeExamples}
                      onChange={(v) => set("includeExamples", v)}
                    />
                  </div>
                </section>

                <section className="space-y-4">
                  <GroupHeading title="Story details" />
                  <Field
                    label="Characters (one per line)"
                    htmlFor="book-characters"
                    action={
                      <EnhanceButton
                        loading={enhancing === "characters"}
                        disabled={Boolean(enhancing)}
                        onClick={() => enhanceField("characters")}
                      />
                    }
                  >
                    <Textarea
                      id="book-characters"
                      rows={3}
                      value={form.characters}
                      onChange={(e) => set("characters", e.target.value)}
                      placeholder={"Elena Voss — archivist\nMarcus Hale — rival scholar"}
                      className="border-[#e6ebf1]"
                    />
                  </Field>
                  <Field
                    label="Themes (comma-separated)"
                    htmlFor="book-themes"
                    action={
                      <EnhanceButton
                        loading={enhancing === "themes"}
                        disabled={Boolean(enhancing)}
                        onClick={() => enhanceField("themes")}
                      />
                    }
                  >
                    <Input
                      id="book-themes"
                      value={form.themes}
                      onChange={(e) => set("themes", e.target.value)}
                      placeholder="memory, power, redemption"
                      className="h-10 border-[#e6ebf1]"
                    />
                  </Field>
                  <Field label="Topics to avoid" htmlFor="book-avoid">
                    <Textarea
                      id="book-avoid"
                      rows={2}
                      value={form.forbiddenTopics}
                      onChange={(e) => set("forbiddenTopics", e.target.value)}
                      placeholder="Anything the model should not include..."
                      className="border-[#e6ebf1]"
                    />
                  </Field>
                </section>

                <section className="space-y-4">
                  <GroupHeading title="Writing style" />
                  <div className="flex flex-wrap gap-2">
                    {STYLE_PRESETS.map((preset) => (
                      <Chip
                        key={preset.id}
                        selected={form.style === preset.style}
                        onClick={() => set("style", preset.style)}
                      >
                        {preset.name}
                      </Chip>
                    ))}
                  </div>
                  <Field
                    label="Style guide"
                    htmlFor="book-style"
                    action={
                      <EnhanceButton
                        loading={enhancing === "style"}
                        disabled={Boolean(enhancing)}
                        onClick={() => enhanceField("style")}
                      />
                    }
                  >
                    <Textarea
                      id="book-style"
                      rows={4}
                      value={form.style}
                      onChange={(e) => set("style", e.target.value)}
                      className="border-[#e6ebf1]"
                    />
                  </Field>
                  <Field
                    label="Custom instructions"
                    htmlFor="book-instructions"
                    action={
                      <EnhanceButton
                        loading={enhancing === "customInstructions"}
                        disabled={Boolean(enhancing)}
                        onClick={() => enhanceField("customInstructions")}
                      />
                    }
                  >
                    <Textarea
                      id="book-instructions"
                      rows={3}
                      value={form.customInstructions}
                      onChange={(e) => set("customInstructions", e.target.value)}
                      placeholder="End each chapter with a cliffhanger. Keep chapters under 4,000 words..."
                      className="border-[#e6ebf1]"
                    />
                  </Field>
                </section>

                <section className="space-y-4">
                  <GroupHeading title="Model" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Writer model">
                      <Select value={form.model} onValueChange={(model) => set("model", model)}>
                        <SelectTrigger className="h-10 w-full border-[#e6ebf1]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AI_MODELS.filter((m) => m.provider === "cloudflare").map((m) => (
                            <SelectItem key={m.value} value={m.value}>
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Creativity" hint={creativity?.description}>
                      <Segmented
                        label="Creativity"
                        value={form.creativity}
                        options={CREATIVITY_OPTIONS}
                        onChange={(value) => set("creativity", value)}
                      />
                    </Field>
                  </div>
                </section>
              </div>
            </Collapse>
          </div>
        </form>

        {/* Live preview + generation options */}
        <aside className="lg:sticky lg:top-6">
          <div className="rounded-2xl border border-[#e6ebf1] bg-white p-5">
            <div className="flex gap-5 lg:flex-col lg:items-center">
              <BookPreviewCover
                title={form.title.trim()}
                genre={form.genre}
                author={user?.name}
                className="w-[96px] shrink-0 lg:w-[164px]"
              />
              <div className="min-w-0 flex-1 lg:w-full">
                <PreviewStats
                  rows={[
                    { label: "Genre", value: form.genre },
                    { label: "Tone", value: form.tone },
                    {
                      label: "Length",
                      value: `${form.targetPages} pages · ~${formatWords(words)} words`,
                    },
                    { label: "Read time", value: `~${readingTime(words)}` },
                    { label: "Chapters", value: form.chapterCount || "Auto" },
                    { label: "Language", value: languageLabel },
                  ]}
                />
              </div>
            </div>

            <div className="mt-4 border-t border-[#eef1f5] pt-3">
              <SwitchRow
                label="Start writing right away"
                checked={form.startGeneration}
                onChange={(startGeneration) =>
                  setForm((prev) => ({
                    ...prev,
                    startGeneration,
                    generateAudiobook: startGeneration
                      ? prev.generateAudiobook
                      : false,
                  }))
                }
              />
              <SwitchRow
                label="Illustrate the book"
                description="A picture for every chapter and its key scenes"
                checked={form.includeIllustrations}
                onChange={(includeIllustrations) => set("includeIllustrations", includeIllustrations)}
              />
              <SwitchRow
                label="Narrate when finished"
                description={canGenerateAudio ? "Audiobook from the final text" : undefined}
                checked={narrate}
                disabled={!canGenerateAudio}
                onChange={(generateAudiobook) =>
                  setForm((prev) => ({
                    ...prev,
                    generateAudiobook,
                    startGeneration: generateAudiobook
                      ? true
                      : prev.startGeneration,
                  }))
                }
              />
              {!canGenerateAudio && (
                <p className="px-1 pb-1 text-[12px] text-[#697386]">
                  Audiobooks need Pro or Premium.{" "}
                  <UpgradeLink
                    plan="PRO"
                    className="font-medium text-[#635bff] hover:underline"
                  >
                    Upgrade
                  </UpgradeLink>
                </p>
              )}
            </div>

            <Button
              type="submit"
              form="new-book-form"
              className="group mt-4 hidden h-11 w-full rounded-full bg-[#635bff] text-[14px] font-medium hover:bg-[#5851e5] lg:flex"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : null}
              {ctaLabel}
              {!loading && (
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              )}
            </Button>
            {pagesLeft !== null && (
              <p className="mt-3 text-center text-[12px] text-[#697386] max-lg:text-left">
                {pagesLeft.toLocaleString()} of {user?.pagesLimit.toLocaleString()} pages
                left this month
              </p>
            )}
          </div>
        </aside>
      </div>

      <PremiumUpgradeDialog
        open={premiumUpgradeOpen}
        onOpenChange={setPremiumUpgradeOpen}
        featureLabel={premiumFeatureLabel}
      />

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-[#e6ebf1] bg-white/95 px-4 py-3 lg:hidden">
        <Button
          form="new-book-form"
          type="submit"
          className="h-12 w-full rounded-full bg-[#635bff] text-[15px] font-medium hover:bg-[#5851e5]"
          disabled={loading}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {ctaLabel}
        </Button>
      </div>
    </div>
  );
}

function TemplatePicker({
  selected,
  covers,
  maxBookPages,
  onSelect,
}: {
  selected: string;
  covers: Record<string, TemplateCover>;
  /** Templates show the length they will actually get on this plan. */
  maxBookPages: number;
  onSelect: (templateId: string) => void;
}) {
  const items = [
    { id: "", name: "Blank", meta: "Your defaults", genre: null },
    ...BOOK_TEMPLATES.map((t) => ({
      id: t.id as string,
      name: t.name as string,
      meta: `${Math.min(t.targetPages, maxBookPages)}p · ${t.genre}`,
      genre: t.genre as string | null,
    })),
  ];

  return (
    <div className="mt-6">
      <p className="mb-2.5 text-[13px] font-medium text-[#425466]">Start from</p>
      <div className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-7 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const active = selected === item.id;
          return (
            <button
              key={item.id || "blank"}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(item.id)}
              className={cn(
                "group flex w-[120px] shrink-0 snap-start flex-col rounded-xl border p-2 text-left transition-[border-color,background-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 lg:w-auto",
                active
                  ? "border-[#c9c5ff] bg-[#f8f7ff] ring-2 ring-[#635bff]/15"
                  : "border-[#e6ebf1] bg-white hover:border-[#c9c5ff] hover:shadow-[0_10px_24px_-16px_rgba(99,91,255,0.5)]"
              )}
            >
              <span className="flex h-[76px] items-center justify-center rounded-lg bg-[#f6f9fc]">
                {covers[item.id] ? (
                  <span className="relative h-[64px] w-[48px] overflow-hidden rounded-[2px_4px_4px_2px] bg-[#0a2540] shadow-[0_6px_14px_-6px_rgba(10,37,64,0.65)] transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={covers[item.id].coverImage}
                      alt=""
                      width={96}
                      height={128}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute inset-y-0 left-0 w-[3px] bg-black/25" />
                  </span>
                ) : item.genre ? (
                  <span
                    className="relative h-[58px] w-[44px] overflow-hidden rounded-[2px_4px_4px_2px] shadow-[0_6px_12px_-6px_rgba(10,37,64,0.6)] transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105"
                    style={{ backgroundColor: genreColor(item.genre) }}
                  >
                    <span className="absolute inset-y-0 left-0 w-[3px] bg-black/25" />
                    <span className="absolute inset-x-[9px] bottom-[10px] space-y-[3px]">
                      <span className="block h-[2px] w-full rounded-full bg-white/60" />
                      <span className="block h-[2px] w-2/3 rounded-full bg-white/40" />
                    </span>
                  </span>
                ) : (
                  <span className="flex h-[58px] w-[44px] items-center justify-center rounded-[2px_4px_4px_2px] border-2 border-dashed border-[#c1c9d2] text-[#a3acb9] transition-[transform,border-color,color] duration-300 group-hover:scale-105 group-hover:border-[#635bff] group-hover:text-[#635bff]">
                    <Plus className="h-4 w-4" />
                  </span>
                )}
              </span>
              <span className="mt-2 truncate px-0.5 text-[13px] font-medium text-[#0a2540]">
                {item.name}
              </span>
              <span className="truncate px-0.5 text-[11.5px] text-[#697386]">
                {item.meta}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LengthCard({
  selected,
  label,
  detail,
  sub,
  onClick,
}: {
  selected: boolean;
  label: string;
  detail: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "rounded-xl border px-3 py-3 text-left transition-[border-color,background-color,box-shadow] duration-200",
        selected
          ? "border-[#c9c5ff] bg-[#f8f7ff] ring-2 ring-[#635bff]/15"
          : "border-[#e6ebf1] bg-white hover:border-[#c9c5ff]"
      )}
    >
      <span className="block text-[13.5px] font-semibold text-[#0a2540]">
        {label}
      </span>
      <span className="mt-0.5 block text-[12.5px] text-[#425466]">{detail}</span>
      <span className="mt-0.5 block truncate text-[11.5px] text-[#697386]">{sub}</span>
    </button>
  );
}
