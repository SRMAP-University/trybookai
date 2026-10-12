import type { Metadata } from "next";
import "./landing.css";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { AppDownloadDrawer } from "@/components/app-download-drawer";
import { serifDisplay } from "@/components/marketing/home/fonts";
import { HomeHero } from "@/components/marketing/home/home-hero";
import { HomeShelf } from "@/components/marketing/home/home-shelf";
import { HomeProcess } from "@/components/marketing/home/home-process";
import { HomeFeatures } from "@/components/marketing/home/home-features";
import { HomePricing } from "@/components/marketing/home/home-pricing";
import { HomeFaq } from "@/components/marketing/home/home-faq";
import { HomeClosing } from "@/components/marketing/home/home-closing";
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
    <div
      className={`home-root ${serifDisplay.variable} min-h-screen overflow-x-hidden`}
    >
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={websiteJsonLd()} />
      <JsonLd data={softwareApplicationJsonLd()} />
      <JsonLd data={faqPageJsonLd()} />
      <Navbar />
      <main>
        <HomeHero covers={covers} />
        <HomeShelf covers={covers} />
        <HomeProcess cover={covers[0]} />
        <HomeFeatures />
        <HomePricing />
        <HomeFaq />
        <HomeClosing covers={covers.slice(3)} />
      </main>
      <Footer />
      <AppDownloadDrawer />
    </div>
  );
}
