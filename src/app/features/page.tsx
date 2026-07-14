import type { Metadata } from "next";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { CTA } from "@/components/marketing/cta";
import { getAppUrl } from "@/lib/book-public";
import {
  BookOpen,
  Wand2,
  Headphones,
  Download,
  Palette,
  Lock,
  Zap,
  Globe,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Features — BookAI",
  description:
    "Explore BookAI's AI book writing features: long-form manuscript generation, audiobooks, custom branding, exports, and public book pages.",
  alternates: { canonical: `${getAppUrl()}/features` },
  openGraph: {
    title: "Features — BookAI",
    description:
      "Explore BookAI's AI book writing features: long-form manuscript generation, audiobooks, custom branding, exports, and public book pages.",
    url: `${getAppUrl()}/features`,
    type: "website",
  },
};

const features = [
  {
    icon: Wand2,
    title: "Full-length manuscript generation",
    description:
      "Generate books up to 1,000 pages from a simple premise. BookAI builds the outline, writes chapters, and keeps the narrative consistent.",
  },
  {
    icon: BookOpen,
    title: "Built-in book editor",
    description:
      "Refine chapters, rewrite sections, and manage your manuscript in a clean editor designed for long-form writing workflows.",
  },
  {
    icon: Headphones,
    title: "AI audiobooks & narration",
    description:
      "Turn completed books into audiobooks, podcasts, or theme music with AI-powered audio generation and voice customization.",
  },
  {
    icon: Download,
    title: "Professional exports",
    description:
      "Export your manuscript to Markdown or DOCX with optional branding, copyright, dedication, and custom front matter.",
  },
  {
    icon: Palette,
    title: "Custom branding",
    description:
      "Set your author name, imprint, brand color, logo, and copyright notice so every export matches your publisher identity.",
  },
  {
    icon: Lock,
    title: "Public or private books",
    description:
      "Publish public book pages optimized for SEO, or keep manuscripts private while you work on Pro and Premium plans.",
  },
  {
    icon: Zap,
    title: "Priority generation",
    description:
      "Pro and Premium plans get faster queues and access to advanced models for higher quality prose.",
  },
  {
    icon: Globe,
    title: "SEO-ready public pages",
    description:
      "Every public book gets a canonical URL, Open Graph tags, and indexable content so readers can find you through search.",
  },
];

export default function FeaturesPage() {
  return (
    <div className="landing-root min-h-screen overflow-x-hidden">
      <Navbar />
      <main>
        <section className="landing-section pt-28">
          <div className="mx-auto max-w-[1080px] px-6 text-center">
            <h1 className="landing-heading">
              Everything you need to write and publish books with AI
            </h1>
            <p className="mx-auto mt-4 max-w-[640px] text-[17px] leading-relaxed text-[#6b6b6b]">
              BookAI combines manuscript generation, editing, audiobooks, and
              publishing tools in one workspace built for authors.
            </p>
          </div>
        </section>

        <section className="landing-section">
          <div className="mx-auto max-w-[1080px] px-6">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.title}
                    className="rounded-2xl border border-[#e8e8e8] bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f0efff] text-[#635bff]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-[17px] font-semibold tracking-[-0.02em] text-[#0a2540]">
                      {feature.title}
                    </h3>
                    <p className="mt-2 text-[14px] leading-relaxed text-[#6b6b6b]">
                      {feature.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <CTA />
      </main>
      <Footer />
    </div>
  );
}
