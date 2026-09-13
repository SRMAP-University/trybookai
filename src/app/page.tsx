import type { Metadata } from "next";
import "./landing.css";
import { Navbar } from "@/components/marketing/navbar";
import { LandingExperience } from "@/components/marketing/landing-experience";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Pricing } from "@/components/marketing/pricing";
import { CTA } from "@/components/marketing/cta";
import { FaqSection } from "@/components/marketing/faq-section";
import { Footer } from "@/components/marketing/footer";
import { AppDownloadDrawer } from "@/components/app-download-drawer";
import { getRecentLandingCovers } from "@/lib/landing-covers";
import { JsonLd } from "@/components/seo/json-ld";
import {
  buildPageMetadata,
  faqPageJsonLd,
  organizationJsonLd,
  softwareApplicationJsonLd,
  websiteJsonLd,
} from "@/lib/seo";

export const revalidate = 120;

export const metadata: Metadata = buildPageMetadata({
  title: "BookAI — AI Book Generator",
  description:
    "Write a full-length book with AI. BookAI outlines chapters, drafts the manuscript, generates a cover, narrates an audiobook, and exports PDF or EPUB.",
  path: "/",
  absolute: true,
});

export default async function Home() {
  const covers = await getRecentLandingCovers(6);

  return (
    <div className="landing-root min-h-screen overflow-x-hidden">
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={websiteJsonLd()} />
      <JsonLd data={softwareApplicationJsonLd()} />
      <JsonLd data={faqPageJsonLd()} />
      <Navbar />
      <main>
        <LandingExperience covers={covers} />
        <HowItWorks />
        <Pricing />
        <FaqSection />
        <CTA />
      </main>
      <Footer />
      <AppDownloadDrawer />
    </div>
  );
}
