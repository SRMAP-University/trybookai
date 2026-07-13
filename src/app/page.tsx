import "./landing.css";
import { Navbar } from "@/components/marketing/navbar";
import { LandingExperience } from "@/components/marketing/landing-experience";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Pricing } from "@/components/marketing/pricing";
import { CTA } from "@/components/marketing/cta";
import { Footer } from "@/components/marketing/footer";
import { getRecentLandingCovers } from "@/lib/landing-covers";

export const dynamic = "force-dynamic";

export default async function Home() {
  const covers = await getRecentLandingCovers(4);

  return (
    <div className="landing-root min-h-screen overflow-x-hidden">
      <Navbar />
      <main>
        <LandingExperience covers={covers} />
        <HowItWorks />
        <Pricing />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
