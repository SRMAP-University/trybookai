import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { CTA } from "@/components/marketing/cta";
import { getAppUrl } from "@/lib/book-public";

export const metadata: Metadata = {
  title: "About — BookAI",
  description:
    "BookAI helps authors and publishers generate full-length books, audiobooks, and branded manuscripts with AI. Learn about our mission and product.",
  alternates: { canonical: `${getAppUrl()}/about` },
  openGraph: {
    title: "About — BookAI",
    description:
      "BookAI helps authors and publishers generate full-length books, audiobooks, and branded manuscripts with AI.",
    url: `${getAppUrl()}/about`,
    type: "website",
  },
};

export default function AboutPage() {
  return (
    <div className="landing-root min-h-screen overflow-x-hidden">
      <Navbar />
      <main>
        <section className="landing-section pt-28">
          <div className="mx-auto max-w-[720px] px-6">
            <h1 className="landing-heading text-center">About BookAI</h1>
            <p className="mt-6 text-[17px] leading-relaxed text-[#425466]">
              BookAI is an AI-powered writing workspace for authors, indie
              publishers, and content creators who want to turn ideas into
              finished books faster. We built BookAI because writing a book
              should be about creativity and ideas — not wrestling with blank
              pages and formatting.
            </p>
            <p className="mt-4 text-[17px] leading-relaxed text-[#425466]">
              Our platform handles the heavy lifting: generating detailed
              outlines, writing consistent long-form chapters, producing
              audiobook narration, and exporting professional manuscripts with
              your branding. You stay in control of the premise, voice, and
              final edits.
            </p>
          </div>
        </section>

        <section className="landing-section bg-[#fafafa]">
          <div className="mx-auto max-w-[1080px] px-6">
            <div className="grid gap-8 sm:grid-cols-3">
              <div className="text-center">
                <p className="text-[40px] font-bold tracking-[-0.03em] text-[#0a2540]">
                  1,000
                </p>
                <p className="mt-1 text-[14px] text-[#6b6b6b]">
                  Pages per book
                </p>
              </div>
              <div className="text-center">
                <p className="text-[40px] font-bold tracking-[-0.03em] text-[#0a2540]">
                  10,000+
                </p>
                <p className="mt-1 text-[14px] text-[#6b6b6b]">
                  Monthly page credits
                </p>
              </div>
              <div className="text-center">
                <p className="text-[40px] font-bold tracking-[-0.03em] text-[#0a2540]">
                  3 hrs
                </p>
                <p className="mt-1 text-[14px] text-[#6b6b6b]">
                  Audiobook narration / mo
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section">
          <div className="mx-auto max-w-[720px] px-6">
            <h2 className="landing-heading">What we believe</h2>
            <ul className="mt-6 space-y-4 text-[17px] leading-relaxed text-[#425466]">
              <li>
                <strong className="text-[#0a2540]">Authors stay in control.</strong>{" "}
                AI is a collaborator, not a replacement. You own the idea, the
                edits, and the final work.
              </li>
              <li>
                <strong className="text-[#0a2540]">Quality beats quantity.</strong>{" "}
                Our tools are tuned for coherence across hundreds of pages, not
                just short snippets.
              </li>
              <li>
                <strong className="text-[#0a2540]">Publishing should be simple.</strong>{" "}
                From manuscript to audiobook to public book page, we streamline
                the steps so you can ship.
              </li>
            </ul>
            <div className="mt-10 text-center">
              <Link
                href="/register"
                className="landing-btn-dark inline-block"
              >
                Start writing for free
              </Link>
            </div>
          </div>
        </section>

        <CTA />
      </main>
      <Footer />
    </div>
  );
}
