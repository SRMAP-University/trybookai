import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function CTA() {
  return (
    <section className="pb-20 md:pb-28">
      <div className="mx-auto max-w-[1080px] px-6">
        <div className="landing-showcase-gradient rounded-[28px] px-8 py-14 text-center md:px-16">
          <h2 className="text-[32px] font-bold tracking-[-0.03em] text-white sm:text-[40px]">
            Start your next book
          </h2>
          <Link
            href="/register"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#111] px-6 py-3 text-[15px] font-medium text-white transition-colors hover:bg-[#2a2a2a]"
          >
            Get started
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
