import Link from "next/link";
import { BookOpen, Sparkles, Layers, FileDown } from "lucide-react";
import "./auth.css";

const showcaseFeatures = [
  { title: "Outlines", icon: Layers },
  { title: "Generation", icon: Sparkles },
  { title: "Export", icon: FileDown },
];

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="auth-root flex min-h-screen">
      {/* Showcase panel — desktop only */}
      <aside className="auth-showcase relative hidden w-[44%] max-w-[560px] overflow-hidden lg:block">
        <div className="auth-showcase-orb left-[-90px] top-[-70px] h-[320px] w-[320px] bg-white/20" />
        <div className="auth-showcase-orb bottom-[-100px] right-[-70px] h-[340px] w-[340px] bg-[#4338ca]/40" />

        <div className="relative z-10 flex h-full flex-col justify-between p-12">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.02em] text-white"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/15 backdrop-blur-sm">
              <BookOpen className="h-4 w-4 text-white" />
            </span>
            BookAI
          </Link>

          <div className="max-w-[360px]">
            <h2 className="text-[34px] font-bold leading-[1.05] tracking-[-0.03em] text-white">
              Your book, written in one workspace
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-white/80">
              Outline, generate, and export publication-ready manuscripts up to
              a thousand pages.
            </p>

            <div className="mt-8 flex flex-wrap gap-2.5">
              {showcaseFeatures.map((feature) => (
                <div
                  key={feature.title}
                  className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-2 backdrop-blur-sm"
                >
                  <feature.icon className="h-4 w-4 text-white" />
                  <span className="text-[13px] font-medium text-white">
                    {feature.title}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <figure className="max-w-[360px]">
            <blockquote className="text-[15px] leading-relaxed text-white/90">
              &ldquo;I drafted a 300-page novel in a weekend. BookAI handled the
              outline, prose, and export in one place.&rdquo;
            </blockquote>
            <figcaption className="mt-3 text-[13px] font-medium text-white/70">
              Elena M. &middot; Independent author
            </figcaption>
          </figure>
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
        <div className="auth-appear w-full max-w-[400px]">{children}</div>
      </main>
    </div>
  );
}
