import type { Metadata } from "next";
import "./landing.css";
import { Navbar } from "@/components/marketing/navbar";
import { LandingExperience } from "@/components/marketing/landing-experience";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Pricing } from "@/components/marketing/pricing";
import { CTA } from "@/components/marketing/cta";
import { Footer } from "@/components/marketing/footer";
import { AppDownloadDrawer } from "@/components/app-download-drawer";
import { getRecentLandingCovers } from "@/lib/landing-covers";
import {
  buildPageMetadata,
  organizationJsonLd,
  softwareApplicationJsonLd,
  websiteJsonLd,
} from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPageMetadata({
  title: "BookAI — AI Book Generator",
  description:
    "Generate full-length books up to 1,000 pages with AI. Outline, write, and export publication-ready manuscripts, audiobooks, and branded content.",
  path: "/",
});

export default async function Home() {
  const covers = await getRecentLandingCovers(10);
  const jsonLd = [organizationJsonLd(), websiteJsonLd(), softwareApplicationJsonLd()];

  return (
    <div className="landing-root min-h-screen overflow-x-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar />
      <main>
        <LandingExperience covers={covers} />
        <HowItWorks />
        <Pricing />
        <CTA />
      </main>
      <Footer />
      <AppDownloadDrawer />
    </div>
  );
}
