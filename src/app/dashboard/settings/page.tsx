"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UpgradeButton } from "@/components/dashboard/upgrade-button";
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
  BOOK_TENSES,
  BOOK_TONES,
  CREATIVITY_LEVELS,
  DEFAULT_AI_MODEL,
  STYLE_PRESETS,
} from "@/lib/constants";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { readJson } from "@/lib/api";

type Settings = {
  name: string | null;
  email: string;
  plan: string;
  pagesUsed: number;
  pagesLimit: number;
  audioMinutesUsed: number;
  audioMinutesLimit: number;
  stripeBillingEnabled?: boolean;
  hasStripeCustomer?: boolean;
  defaultGenre: string;
  defaultTone: string;
  defaultAudience: string;
  defaultTargetPages: number;
  defaultPov: string;
  defaultTense: string;
  defaultLanguage: string;
  defaultModel: string;
  defaultCreativity: number;
  defaultWordsPerPage: number;
  defaultSectionsPerChapter: number;
  styleGuide: string | null;
  autoGenerateOnCreate: boolean;
  emailNotifications: boolean;
};

const tabs = [
  { id: "account", label: "Account" },
  { id: "defaults", label: "Writing defaults" },
  { id: "generation", label: "Generation" },
  { id: "style", label: "Style guide" },
] as const;

function nearestCreativity(value: number) {
  return CREATIVITY_LEVELS.reduce((best, level) =>
    Math.abs(level.value - value) < Math.abs(best.value - value) ? level : best
  ).value;
}

export default function SettingsPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("account");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/api/settings")
      .then(async (res) => {
        const result = await readJson<Settings>(res);
        if (!result.ok) throw new Error(result.error);
        if (!cancelled) {
          const data = result.data;
          setSettings({
            ...data,
            defaultCreativity: nearestCreativity(Number(data.defaultCreativity)),
            defaultGenre: data.defaultGenre || "Fiction",
            defaultTone: data.defaultTone || "Professional",
            defaultPov: data.defaultPov || "third",
            defaultTense: data.defaultTense || "past",
            defaultLanguage: data.defaultLanguage || "en",
            defaultModel: data.defaultModel || DEFAULT_AI_MODEL,
            defaultAudience: data.defaultAudience || "General readers",
            defaultTargetPages: Number(data.defaultTargetPages) || 100,
            defaultWordsPerPage: Number(data.defaultWordsPerPage) || 300,
            defaultSectionsPerChapter:
              Number(data.defaultSectionsPerChapter) || 4,
            autoGenerateOnCreate: Boolean(data.autoGenerateOnCreate),
            emailNotifications: data.emailNotifications !== false,
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
          toast.error("Failed to load settings");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);

    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: settings.name?.trim() || undefined,
        defaultGenre: settings.defaultGenre,
        defaultTone: settings.defaultTone,
        defaultAudience: settings.defaultAudience,
        defaultTargetPages: Number(settings.defaultTargetPages),
        defaultPov: settings.defaultPov,
        defaultTense: settings.defaultTense,
        defaultLanguage: settings.defaultLanguage,
        defaultModel: settings.defaultModel,
        defaultCreativity: Number(settings.defaultCreativity),
        defaultWordsPerPage: Number(settings.defaultWordsPerPage),
        defaultSectionsPerChapter: Number(settings.defaultSectionsPerChapter),
        styleGuide: settings.styleGuide?.trim() ? settings.styleGuide : null,
        autoGenerateOnCreate: settings.autoGenerateOnCreate,
        emailNotifications: settings.emailNotifications,
      }),
    });

    setSaving(false);

    const result = await readJson<Settings>(res);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    setSettings({
      ...result.data,
      defaultCreativity: nearestCreativity(
        Number(result.data.defaultCreativity)
      ),
    });
    toast.success("Settings saved");
  }

  async function openBillingPortal() {
    if (!settings?.stripeBillingEnabled) {
      toast.info("Billing portal is available after Stripe is configured.");
      return;
    }
    if (!settings.hasStripeCustomer) {
      toast.info("Subscribe to a plan first to manage billing.");
      return;
    }

    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/checkout");
      const result = await readJson<{ url?: string; error?: string }>(res);
      if (!result.ok || !result.data.url) {
        throw new Error(
          result.ok ? "Could not open billing portal" : result.error
        );
      }
      window.location.href = result.data.url;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not open billing portal"
      );
      setPortalLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-[#635bff]" />
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="rounded-lg border border-[#e6ebf1] px-6 py-16 text-center">
        <p className="text-[15px] font-medium text-[#0a2540]">
          Couldn’t load settings
        </p>
        <p className="mt-1 text-[14px] text-[#697386]">
          {error ?? "Please try again."}
        </p>
        <Button
          className="mt-6 h-9 bg-[#635bff] text-[13px] hover:bg-[#5851e5]"
          onClick={() => window.location.reload()}
        >
          Reload
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-[720px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#0a2540]">
            Settings
          </h1>
          <p className="mt-1 text-[14px] text-[#697386]">
            Account, writing defaults, and generation preferences.
          </p>
        </div>
        {settings.plan === "FREE" && (
          <UpgradeButton
            plan="PRO"
            className="h-9 rounded-md bg-[#635bff] text-[13px] hover:bg-[#5851e5]"
          >
            Upgrade to Pro
          </UpgradeButton>
        )}
      </div>

      <div className="mt-8 flex gap-1 overflow-x-auto border-b border-[#e6ebf1]">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors",
              tab === item.id
                ? "border-[#635bff] text-[#635bff]"
                : "border-transparent text-[#697386] hover:text-[#0a2540]"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-8 space-y-6">
        {tab === "account" && (
          <>
            <Section title="Profile">
              <Field label="Name">
                <Input
                  value={settings.name ?? ""}
                  onChange={(e) =>
                    setSettings({ ...settings, name: e.target.value })
                  }
                  className="h-10 w-full border-[#e6ebf1]"
                />
              </Field>
              <Field label="Email">
                <Input
                  value={settings.email}
                  disabled
                  className="h-10 w-full border-[#e6ebf1] bg-[#f6f9fc]"
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Plan">
                  <Input
                    value={settings.plan}
                    disabled
                    className="h-10 w-full border-[#e6ebf1] bg-[#f6f9fc] capitalize"
                  />
                </Field>
                <Field label="Pages used">
                  <Input
                    value={`${settings.pagesUsed} / ${settings.pagesLimit}`}
                    disabled
                    className="h-10 w-full border-[#e6ebf1] bg-[#f6f9fc]"
                  />
                </Field>
              </div>
              <Field label="Audiobook time used">
                <Input
                  value={`${settings.audioMinutesUsed ?? 0} / ${settings.audioMinutesLimit ?? 0} min`}
                  disabled
                  className="h-10 w-full border-[#e6ebf1] bg-[#f6f9fc]"
                />
              </Field>
              <Link
                href="/dashboard/billing"
                className="inline-flex text-[13px] text-[#635bff] hover:underline"
              >
                View plans →
              </Link>
            </Section>

            <Section title="Manage subscription">
              <p className="text-[13px] leading-relaxed text-[#697386]">
                Update your payment method, view invoices, or cancel your plan
                in the Stripe billing portal.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  className="h-10 border-[#e6ebf1] text-[13px]"
                  onClick={openBillingPortal}
                  disabled={portalLoading}
                >
                  {portalLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="mr-2 h-4 w-4" />
                  )}
                  Open billing portal
                </Button>
                <Link
                  href="/dashboard/billing"
                  className="text-[13px] font-medium text-[#635bff] hover:underline"
                >
                  Change plan
                </Link>
              </div>
            </Section>

            <Section title="Notifications">
              <Toggle
                label="Email notifications"
                description="Get updates when long books finish generating."
                checked={settings.emailNotifications}
                onChange={(emailNotifications) =>
                  setSettings({ ...settings, emailNotifications })
                }
              />
            </Section>
          </>
        )}

        {tab === "defaults" && (
          <Section title="Defaults for new books">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Genre">
                <Select
                  value={settings.defaultGenre}
                  onValueChange={(value) => {
                    if (value)
                      setSettings({ ...settings, defaultGenre: value });
                  }}
                >
                  <SelectTrigger className="h-10 w-full border-[#e6ebf1]">
                    <SelectValue placeholder="Select genre" />
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
                  value={settings.defaultTone}
                  onValueChange={(value) => {
                    if (value) setSettings({ ...settings, defaultTone: value });
                  }}
                >
                  <SelectTrigger className="h-10 w-full border-[#e6ebf1]">
                    <SelectValue placeholder="Select tone" />
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
              <Field label="Point of view">
                <Select
                  value={settings.defaultPov}
                  onValueChange={(value) => {
                    if (value) setSettings({ ...settings, defaultPov: value });
                  }}
                >
                  <SelectTrigger className="h-10 w-full border-[#e6ebf1]">
                    <SelectValue placeholder="Select POV" />
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
                  value={settings.defaultTense}
                  onValueChange={(value) => {
                    if (value)
                      setSettings({ ...settings, defaultTense: value });
                  }}
                >
                  <SelectTrigger className="h-10 w-full border-[#e6ebf1]">
                    <SelectValue placeholder="Select tense" />
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
                  value={settings.defaultLanguage}
                  onValueChange={(value) => {
                    if (value)
                      setSettings({ ...settings, defaultLanguage: value });
                  }}
                >
                  <SelectTrigger className="h-10 w-full border-[#e6ebf1]">
                    <SelectValue placeholder="Select language" />
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
              <Field label="Target pages">
                <Input
                  type="number"
                  min={3}
                  max={1000}
                  value={settings.defaultTargetPages}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultTargetPages: Number(e.target.value) || 100,
                    })
                  }
                  className="h-10 w-full border-[#e6ebf1]"
                />
              </Field>
            </div>
            <Field label="Default audience">
              <Input
                value={settings.defaultAudience}
                onChange={(e) =>
                  setSettings({ ...settings, defaultAudience: e.target.value })
                }
                className="h-10 w-full border-[#e6ebf1]"
              />
            </Field>
          </Section>
        )}

        {tab === "generation" && (
          <Section title="Generation engine">
            <Field label="Default model">
              <Select
                value={settings.defaultModel}
                onValueChange={(value) => {
                  if (value)
                    setSettings({ ...settings, defaultModel: value });
                }}
              >
                <SelectTrigger className="h-10 w-full border-[#e6ebf1]">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {AI_MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label} — {m.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Creativity">
              <Select
                value={String(nearestCreativity(settings.defaultCreativity))}
                onValueChange={(value) => {
                  if (value)
                    setSettings({
                      ...settings,
                      defaultCreativity: Number(value),
                    });
                }}
              >
                <SelectTrigger className="h-10 w-full border-[#e6ebf1]">
                  <SelectValue placeholder="Select creativity" />
                </SelectTrigger>
                <SelectContent>
                  {CREATIVITY_LEVELS.map((c) => (
                    <SelectItem key={c.value} value={String(c.value)}>
                      {c.label} — {c.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Words per page">
                <Input
                  type="number"
                  min={150}
                  max={500}
                  value={settings.defaultWordsPerPage}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultWordsPerPage: Number(e.target.value) || 300,
                    })
                  }
                  className="h-10 w-full border-[#e6ebf1]"
                />
              </Field>
              <Field label="Sections per chapter">
                <Input
                  type="number"
                  min={2}
                  max={8}
                  value={settings.defaultSectionsPerChapter}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultSectionsPerChapter: Number(e.target.value) || 4,
                    })
                  }
                  className="h-10 w-full border-[#e6ebf1]"
                />
              </Field>
            </div>
            <Toggle
              label="Auto-generate on create"
              description="Start writing immediately after creating a book (on by default)."
              checked={settings.autoGenerateOnCreate}
              onChange={(autoGenerateOnCreate) =>
                setSettings({ ...settings, autoGenerateOnCreate })
              }
            />
          </Section>
        )}

        {tab === "style" && (
          <Section title="Global style guide">
            <p className="text-[13px] text-[#697386]">
              Applied to every new book unless overridden. Pick a preset or write
              your own.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {STYLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() =>
                    setSettings({ ...settings, styleGuide: preset.style })
                  }
                  className={cn(
                    "rounded-md border px-3 py-2.5 text-left transition-colors",
                    settings.styleGuide === preset.style
                      ? "border-[#635bff] bg-[#f0efff]/50"
                      : "border-[#e6ebf1] hover:border-[#635bff]"
                  )}
                >
                  <p className="text-[13px] font-medium text-[#0a2540]">
                    {preset.name}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[12px] text-[#697386]">
                    {preset.style}
                  </p>
                </button>
              ))}
            </div>
            <Field label="Custom style guide">
              <Textarea
                rows={6}
                value={settings.styleGuide ?? ""}
                onChange={(e) =>
                  setSettings({ ...settings, styleGuide: e.target.value })
                }
                placeholder="e.g. Short paragraphs. Avoid adverbs. Prefer concrete nouns..."
                className="w-full border-[#e6ebf1]"
              />
            </Field>
          </Section>
        )}

        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={save}
            disabled={saving}
            className="h-10 rounded-md bg-[#635bff] px-5 text-[14px] hover:bg-[#5851e5]"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
          <p className="text-[12px] text-[#697386]">
            Changes apply to new books by default.
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 rounded-lg border border-[#e6ebf1] bg-white p-6">
      <h2 className="text-[15px] font-medium text-[#0a2540]">{title}</h2>
      {children}
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
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-start justify-between gap-4 rounded-md border border-[#e6ebf1] px-4 py-3 text-left hover:bg-[#f6f9fc]"
    >
      <div>
        <p className="text-[14px] font-medium text-[#0a2540]">{label}</p>
        <p className="mt-0.5 text-[13px] text-[#697386]">{description}</p>
      </div>
      <span
        className={cn(
          "mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors",
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
