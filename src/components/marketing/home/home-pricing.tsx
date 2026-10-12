"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { PLANS, PREMIUM_TRIAL, type BillingInterval } from "@/lib/constants";
import { PRICING_FEATURES, PRICING_PLANS } from "@/lib/pricing-plans";
import { LEGAL } from "@/lib/legal";
import { cn } from "@/lib/utils";
import { InView } from "@/components/marketing/home/in-view";

type PlanKey = "FREE" | (typeof PRICING_PLANS)[number]["key"];

const CARDS: { key: PlanKey; featuresLabel: string; highlight: boolean }[] = [
  { key: "FREE", featuresLabel: "Includes:", highlight: false },
  ...PRICING_PLANS.map((plan) => ({
    key: plan.key,
    featuresLabel: plan.featuresLabel,
    highlight: plan.highlight,
  })),
];

const CTA: Record<PlanKey, string> = {
  FREE: "Start free",
  PRO: "Get Pro",
  ENTERPRISE: "Start free trial",
  UNLIMITED: "Get Unlimited",
};

const BADGE: Partial<Record<PlanKey, string>> = {
  ENTERPRISE: `${PREMIUM_TRIAL.days}-day free trial`,
  UNLIMITED: "Everything unlimited*",
};

export function HomePricing() {
  const [billing, setBilling] = useState<BillingInterval>("month");
  const yearly = billing === "year";

  return (
    <section id="pricing" className="scroll-mt-20 py-24 md:py-32">
      <InView className="mx-auto max-w-[1200px] px-6">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <h2 className="rv home-serif text-[40px] leading-[1.02] text-[#0a2540] sm:text-[56px]">
            Start free.
            <br />
            <span className="text-[#697386]">Write more later.</span>
          </h2>

          <div
            role="group"
            aria-label="Billing interval"
            className="rv relative inline-grid grid-cols-2 self-start rounded-full border border-[#e6ebf1] bg-[#f6f9fc] p-1 lg:self-auto"
            style={{ "--i": 1 } as CSSProperties}
          >
            {/* Sliding thumb */}
            <span
              aria-hidden
              className={cn(
                "absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-white shadow-[0_1px_3px_rgba(10,37,64,0.12)] transition-transform duration-300 ease-out",
                yearly && "translate-x-full"
              )}
            />
            {(["month", "year"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={billing === value}
                onClick={() => setBilling(value)}
                className={cn(
                  "relative rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors duration-300",
                  billing === value
                    ? "text-[#0a2540]"
                    : "text-[#697386] hover:text-[#0a2540]"
                )}
              >
                {value === "month" ? "Monthly" : "Yearly"}
                {value === "year" && (
                  <span className="ml-1.5 text-[11px] font-semibold text-[#0e6245]">
                    2 mo free
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-14 grid items-stretch gap-5 md:grid-cols-2 lg:grid-cols-4">
          {CARDS.map((card, i) => {
            const config = PLANS[card.key];
            const highlight = card.highlight;
            const price = yearly ? config.yearlyPrice : config.price;
            const badge = BADGE[card.key];
            const features = PRICING_FEATURES[card.key].filter(
              (item) => !item.startsWith("*")
            );

            const notes: { text: string; tone: "green" | "purple" }[] = [];
            if (card.key === "ENTERPRISE") {
              notes.push({
                text: `${PREMIUM_TRIAL.days}-day free trial, then $${price}/${yearly ? "yr" : "mo"}`,
                tone: "green",
              });
            }
            if (card.key === "UNLIMITED") {
              notes.push({ text: "Fair use & rate limits apply", tone: "purple" });
            }
            if ((card.key === "PRO" || card.key === "UNLIMITED") && yearly) {
              notes.push({ text: "2 months free vs monthly", tone: "green" });
            }

            return (
              <div
                key={card.key}
                className={cn(
                  "rv relative flex flex-col rounded-[20px] border bg-white p-6 text-[#0a2540] transition-[transform,box-shadow] duration-300 hover:-translate-y-1",
                  highlight
                    ? "border-[#c9c5ff] shadow-[0_12px_40px_rgba(99,91,255,0.12)] hover:shadow-[0_24px_50px_-18px_rgba(99,91,255,0.35)]"
                    : "border-[#e6ebf1] shadow-[0_8px_30px_rgba(10,37,64,0.04)] hover:shadow-[0_24px_44px_-26px_rgba(10,37,64,0.3)]"
                )}
                style={{ "--i": 2 + i } as CSSProperties}
              >
                {badge && (
                  <span className="absolute -top-3 left-6 rounded-full bg-[#635bff] px-3 py-1 text-[11.5px] font-medium whitespace-nowrap text-white">
                    {badge}
                  </span>
                )}

                <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-[#0a2540]">
                  {config.name}
                </h3>

                <div className="mt-5 flex items-baseline gap-1.5">
                  <span
                    key={`${card.key}-${billing}`}
                    className="home-tick home-serif text-[56px] leading-none"
                  >
                    ${price}
                  </span>
                  <span className="text-[13px] text-[#697386]">
                    {card.key === "FREE" ? "forever" : yearly ? "/ year" : "/ month"}
                  </span>
                </div>
                <div className="mt-2 min-h-[38px] space-y-0.5">
                  {notes.map((note) => (
                    <p
                      key={note.text}
                      className={cn(
                        "text-[12.5px] font-medium",
                        note.tone === "green" ? "text-[#0e6245]" : "text-[#635bff]"
                      )}
                    >
                      {note.text}
                    </p>
                  ))}
                </div>

                <Link
                  href="/register"
                  className={cn(
                    "mt-4 flex h-11 items-center justify-center rounded-full text-[14px] font-medium transition-colors",
                    highlight
                      ? "bg-[#635bff] text-white hover:bg-[#5851e5]"
                      : "border border-[#e6ebf1] text-[#0a2540] hover:border-[#c9c5ff] hover:bg-[#f8f7ff] hover:text-[#635bff]"
                  )}
                >
                  {CTA[card.key]}
                </Link>

                <div className="my-6 h-px bg-[#eef1f5]" />

                <p className="mb-3 text-[12.5px] font-medium text-[#697386]">
                  {card.featuresLabel}
                </p>
                <ul className="space-y-2.5">
                  {features.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2.5 text-[13.5px] leading-snug text-[#425466]"
                    >
                      <Check
                        className={cn(
                          "mt-0.5 h-3.5 w-3.5 shrink-0",
                          highlight ? "text-[#635bff]" : "text-[#0a2540]"
                        )}
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-[12.5px] text-[#697386]">
          *Subject to the{" "}
          <Link
            href={`${LEGAL.terms}#unlimited-fair-use`}
            className="font-medium text-[#0a2540] underline underline-offset-2"
          >
            fair-use Terms
          </Link>
          .
        </p>
      </InView>
    </section>
  );
}
