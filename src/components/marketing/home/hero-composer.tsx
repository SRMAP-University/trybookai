"use client";

import { FormEvent, KeyboardEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const IDEAS = [
  {
    label: "Mystery",
    prompt:
      "A lighthouse keeper starts receiving letters from a ship that sank in 1911.",
  },
  {
    label: "Romance",
    prompt:
      "Two rival bakers are forced to share a stall at a winter market in Vienna.",
  },
  {
    label: "Fantasy",
    prompt:
      "A mapmaker discovers that every map she draws quietly rewrites the land it shows.",
  },
  {
    label: "Business",
    prompt:
      "A practical playbook for first-time managers leading remote teams.",
  },
  {
    label: "Memoir",
    prompt:
      "A memoir about leaving a corporate job to restore my grandfather's orchard.",
  },
] as const;

const STATIC_PLACEHOLDER = "Describe your book…";

/** Types each idea into the placeholder, holds, erases, moves on. */
function useTypedPlaceholder(active: boolean) {
  const [text, setText] = useState(STATIC_PLACEHOLDER);

  useEffect(() => {
    if (!active) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let idea = 0;
    let length = 0;
    let erasing = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const full = IDEAS[idea].prompt;
      if (!erasing) {
        length += 1;
        if (length >= full.length) erasing = true;
      } else {
        length -= 3;
        if (length <= 0) {
          length = 0;
          erasing = false;
          idea = (idea + 1) % IDEAS.length;
        }
      }
      setText(full.slice(0, length));
      const pause = length >= full.length ? 2200 : length === 0 ? 400 : 0;
      timer = setTimeout(tick, pause || (erasing ? 14 : 38));
    };

    timer = setTimeout(tick, 1400);
    return () => clearTimeout(timer);
  }, [active]);

  return active ? text : STATIC_PLACEHOLDER;
}

export function HeroComposer() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [focused, setFocused] = useState(false);
  const placeholder = useTypedPlaceholder(!prompt && !focused);

  function submit() {
    const q = prompt.trim();
    router.push(
      q ? `/register?prompt=${encodeURIComponent(q.slice(0, 500))}` : "/register"
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[20px] border border-[#e6ebf1] bg-white shadow-[0_1px_2px_rgba(10,37,64,0.04),0_18px_40px_-22px_rgba(10,37,64,0.3)] transition-[border-color,box-shadow] focus-within:border-[#635bff] focus-within:ring-4 focus-within:ring-[#635bff]/10"
    >
      <label htmlFor="hero-prompt" className="sr-only">
        Describe your book
      </label>
      <textarea
        id="hero-prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        rows={3}
        maxLength={500}
        placeholder={placeholder}
        className="block w-full resize-none bg-transparent px-5 pb-2 pt-4 text-[16px] leading-relaxed text-[#0a2540] outline-none placeholder:text-[#a3acb9]"
      />
      <div className="flex flex-col gap-3 px-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-3 flex items-center gap-1.5 overflow-x-auto px-5 scrollbar-none sm:mx-0 sm:px-2">
          {IDEAS.map((idea) => {
            const active = prompt === idea.prompt;
            return (
              <button
                key={idea.label}
                type="button"
                aria-pressed={active}
                onClick={() => setPrompt(idea.prompt)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-[12.5px] transition-[background-color,border-color,color,transform] active:scale-95",
                  active
                    ? "border-[#c9c5ff] bg-[#f0efff] text-[#635bff]"
                    : "border-[#e6ebf1] text-[#425466] hover:-translate-y-0.5 hover:border-[#c9c5ff] hover:text-[#635bff]"
                )}
              >
                {idea.label}
              </button>
            );
          })}
        </div>
        <button
          type="submit"
          className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#635bff] px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-[#5851e5]"
        >
          Start writing
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </form>
  );
}
