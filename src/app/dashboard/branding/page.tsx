"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AnonymousRouteFallback } from "@/components/dashboard/anonymous-route-fallback";

type Branding = {
  brandName: string | null;
  brandTagline: string | null;
  authorName: string | null;
  imprintName: string | null;
  websiteUrl: string | null;
  brandColor: string;
  logoUrl: string | null;
  copyrightNotice: string | null;
  dedicationDefault: string | null;
  exportFooter: string | null;
  includeBrandInExport: boolean;
  name: string | null;
  email: string;
};

function BrandingPageContent() {
  const [branding, setBranding] = useState<Branding | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/branding")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setBranding(data);
      })
      .catch(() => toast.error("Failed to load branding"))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    if (!branding) return;
    setSaving(true);
    const res = await fetch("/api/branding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brandName: branding.brandName,
        brandTagline: branding.brandTagline,
        authorName: branding.authorName,
        imprintName: branding.imprintName,
        websiteUrl: branding.websiteUrl,
        brandColor: branding.brandColor,
        logoUrl: branding.logoUrl,
        copyrightNotice: branding.copyrightNotice,
        dedicationDefault: branding.dedicationDefault,
        exportFooter: branding.exportFooter,
        includeBrandInExport: branding.includeBrandInExport,
      }),
    });
    setSaving(false);

    if (!res.ok) {
      toast.error("Failed to save branding");
      return;
    }

    setBranding(await res.json());
    toast.success("Branding saved");
  }

  if (loading || !branding) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-[#635bff]" />
      </div>
    );
  }

  const displayName =
    branding.brandName || branding.authorName || branding.name || "BookAI";
  const color = branding.brandColor || "#635bff";

  return (
    <div className="max-w-[960px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#0a2540]">
            Branding
          </h1>
          <p className="mt-1 text-[14px] text-[#697386]">
            Publisher identity applied to exports and manuscript front matter.
          </p>
        </div>
        <Button
          onClick={save}
          disabled={saving}
          className="h-9 rounded-md bg-[#635bff] text-[13px] hover:bg-[#5851e5]"
        >
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Save branding
        </Button>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Section title="Identity">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Brand / imprint name">
                <Input
                  value={branding.brandName ?? ""}
                  onChange={(e) =>
                    setBranding({ ...branding, brandName: e.target.value })
                  }
                  placeholder="Northwind Press"
                  className="h-10 border-[#e6ebf1]"
                />
              </Field>
              <Field label="Author name">
                <Input
                  value={branding.authorName ?? ""}
                  onChange={(e) =>
                    setBranding({ ...branding, authorName: e.target.value })
                  }
                  placeholder="Your pen name"
                  className="h-10 border-[#e6ebf1]"
                />
              </Field>
              <Field label="Imprint">
                <Input
                  value={branding.imprintName ?? ""}
                  onChange={(e) =>
                    setBranding({ ...branding, imprintName: e.target.value })
                  }
                  placeholder="Optional imprint line"
                  className="h-10 border-[#e6ebf1]"
                />
              </Field>
              <Field label="Website">
                <Input
                  value={branding.websiteUrl ?? ""}
                  onChange={(e) =>
                    setBranding({ ...branding, websiteUrl: e.target.value })
                  }
                  placeholder="https://yoursite.com"
                  className="h-10 border-[#e6ebf1]"
                />
              </Field>
            </div>
            <Field label="Tagline">
              <Input
                value={branding.brandTagline ?? ""}
                onChange={(e) =>
                  setBranding({ ...branding, brandTagline: e.target.value })
                }
                placeholder="Stories that stay with you"
                className="h-10 border-[#e6ebf1]"
              />
            </Field>
          </Section>

          <Section title="Visual">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Brand color">
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={branding.brandColor || "#635bff"}
                    onChange={(e) =>
                      setBranding({ ...branding, brandColor: e.target.value })
                    }
                    className="h-10 w-12 cursor-pointer rounded border border-[#e6ebf1] bg-white p-1"
                  />
                  <Input
                    value={branding.brandColor}
                    onChange={(e) =>
                      setBranding({ ...branding, brandColor: e.target.value })
                    }
                    className="h-10 border-[#e6ebf1]"
                  />
                </div>
              </Field>
              <Field label="Logo URL">
                <Input
                  value={branding.logoUrl ?? ""}
                  onChange={(e) =>
                    setBranding({ ...branding, logoUrl: e.target.value })
                  }
                  placeholder="https://..."
                  className="h-10 border-[#e6ebf1]"
                />
              </Field>
            </div>
          </Section>

          <Section title="Export front matter">
            <Field label="Default dedication">
              <Textarea
                rows={3}
                value={branding.dedicationDefault ?? ""}
                onChange={(e) =>
                  setBranding({
                    ...branding,
                    dedicationDefault: e.target.value,
                  })
                }
                placeholder="For those who keep reading after midnight."
                className="border-[#e6ebf1]"
              />
            </Field>
            <Field label="Copyright notice">
              <Textarea
                rows={2}
                value={branding.copyrightNotice ?? ""}
                onChange={(e) =>
                  setBranding({
                    ...branding,
                    copyrightNotice: e.target.value,
                  })
                }
                placeholder="© 2026 Your Name. All rights reserved."
                className="border-[#e6ebf1]"
              />
            </Field>
            <Field label="Export footer">
              <Textarea
                rows={2}
                value={branding.exportFooter ?? ""}
                onChange={(e) =>
                  setBranding({ ...branding, exportFooter: e.target.value })
                }
                placeholder="Published by Northwind Press"
                className="border-[#e6ebf1]"
              />
            </Field>
            <button
              type="button"
              onClick={() =>
                setBranding({
                  ...branding,
                  includeBrandInExport: !branding.includeBrandInExport,
                })
              }
              className="flex w-full items-center justify-between rounded-md border border-[#e6ebf1] px-4 py-3 text-left"
            >
              <div>
                <p className="text-[14px] font-medium text-[#0a2540]">
                  Include branding in exports
                </p>
                <p className="text-[12px] text-[#697386]">
                  Adds title page, dedication, and footer to Markdown exports
                </p>
              </div>
              <span
                className={cn(
                  "flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors",
                  branding.includeBrandInExport
                    ? "bg-[#635bff]"
                    : "bg-[#e6ebf1]"
                )}
              >
                <span
                  className={cn(
                    "h-4 w-4 rounded-full bg-white transition-transform",
                    branding.includeBrandInExport && "translate-x-4"
                  )}
                />
              </span>
            </button>
          </Section>
        </div>

        <div className="lg:sticky lg:top-8 lg:self-start">
          <p className="mb-3 text-[12px] font-medium uppercase tracking-wider text-[#697386]">
            Preview
          </p>
          <div className="overflow-hidden rounded-lg border border-[#e6ebf1] bg-white shadow-sm">
            <div className="h-1.5" style={{ backgroundColor: color }} />
            <div className="flex min-h-[360px] flex-col items-center justify-center px-8 py-12 text-center">
              {branding.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={branding.logoUrl}
                  alt="Logo"
                  className="mb-6 h-10 object-contain"
                />
              ) : (
                <div
                  className="mb-6 flex h-10 w-10 items-center justify-center rounded-md text-[14px] font-semibold text-white"
                  style={{ backgroundColor: color }}
                >
                  {displayName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#697386]">
                {branding.imprintName || displayName}
              </p>
              <h3 className="mt-6 text-[22px] font-semibold tracking-[-0.03em] text-[#0a2540]">
                Sample Manuscript
              </h3>
              {branding.authorName && (
                <p className="mt-2 text-[14px] text-[#425466]">
                  by {branding.authorName}
                </p>
              )}
              {branding.brandTagline && (
                <p className="mt-6 text-[13px] italic text-[#697386]">
                  {branding.brandTagline}
                </p>
              )}
              {branding.dedicationDefault && (
                <p className="mt-8 max-w-[220px] text-[12px] text-[#425466]">
                  {branding.dedicationDefault}
                </p>
              )}
              <div className="mt-auto pt-10 text-[11px] text-[#a3acb9]">
                {branding.copyrightNotice ||
                  `© ${new Date().getFullYear()} ${displayName}`}
                {branding.websiteUrl && (
                  <p className="mt-1">{branding.websiteUrl}</p>
                )}
              </div>
            </div>
          </div>
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

export default function BrandingPage() {
  return (
    <AnonymousRouteFallback
      title="Branding"
      description="Customize publisher identity for exports and manuscript front matter."
    >
      <BrandingPageContent />
    </AnonymousRouteFallback>
  );
}
