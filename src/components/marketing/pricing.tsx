"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { PLANS, PREMIUM_TRIAL, type BillingInterval } from "@/lib/constants";
import {
  FREE_PLAN_BANNER,
  PRICING_FEATURES,
  PRICING_PLANS,
  pricingHeaderStyle,
} from "@/lib/pricing-plans";
import { LEGAL } from "@/lib/legal";
import { cn } from "@/lib/utils";

export function Pricing() {
  const [interval, setInterval] = useState<BillingInterval>("month");

  return (
    <section id="pricing" className="landing-section">
      <div className="mx-auto max-w-[1100px] px-6">
        <h2 className="landing-heading text-center">Pricing</h2>
        <p className="mx-auto mt-3 max-w-md text-center text-[15px] text-[#6b6b6b]">
          Start free, upgrade when you need more pages and audiobook time.
        </p>

        <div className="mt-8 flex justify-center">
          <div className="inline-flex rounded-full border border-[#e8e8e8] bg-[#f7f7f7] p-1">
            <button
              type="button"
              onClick={() => setInterval("month")}
              className={cn(
                "rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors",
                interval === "month"
                  ? "bg-white text-[#111] shadow-sm"
                  : "text-[#6b6b6b]"
              )}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setInterval("year")}
              className={cn(
                "rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors",
                interval === "year"
                  ? "bg-white text-[#111] shadow-sm"
                  : "text-[#6b6b6b]"
              )}
            >
              Yearly
              <span className="ml-1.5 text-[11px] font-semibold text-[#0e6245]">
                2 mo free
              </span>
            </button>
          </div>
        </div>

        <div className="mt-14 grid items-stretch gap-5 lg:grid-cols-3">
          {PRICING_PLANS.map((plan) => {
            const config = PLANS[plan.key];
            const items = PRICING_FEATURES[plan.key];
            const displayPrice =
              interval === "year" ? config.yearlyPrice : config.price;
            const periodLabel = interval === "year" ? "per year" : "per month";
            const cta =
              plan.key === "ENTERPRISE"
                ? "Start free trial"
                : plan.key === "UNLIMITED"
                  ? "Get Unlimited"
                  : "Get Pro";

            return (
              <div
                key={plan.key}
                className={cn(
                  "relative flex flex-col overflow-visible rounded-2xl border border-[#e8e8e8] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.06)]",
                  plan.highlight &&
                    "border-[#c9c5ff] shadow-[0_12px_40px_rgba(99,91,255,0.12)]"
                )}
              >
                {plan.key === "ENTERPRISE" && (
                  <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2">
                    <span className="inline-flex whitespace-nowrap rounded-full bg-[#0a2540] px-3.5 py-1.5 text-[12px] font-medium text-white shadow-md">
                      {PREMIUM_TRIAL.days}-day free trial
                    </span>
                  </div>
                )}
                {plan.key === "UNLIMITED" && (
                  <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2">
                    <span className="inline-flex whitespace-nowrap rounded-full bg-[#635bff] px-3.5 py-1.5 text-[12px] font-medium text-white shadow-md">
                      Everything unlimited*
                    </span>
                  </div>
                )}

                <div
                  className="overflow-hidden rounded-t-2xl px-7 pb-2 pt-10"
                  style={pricingHeaderStyle(plan.headerFrom)}
                >
                  <h3 className="text-[28px] font-semibold tracking-[-0.03em] text-[#0a2540]">
                    {config.name}
                  </h3>

                  <p className="mt-5 text-[13px] font-medium text-[#697386]">
                    Starts at
                  </p>
                  <div className="mt-1 flex items-end gap-2">
                    <span className="text-[48px] font-bold leading-none tracking-[-0.04em] text-[#0a2540]">
                      ${displayPrice}
                    </span>
                    <span className="mb-1.5 text-[14px] text-[#697386]">
                      {periodLabel}
                    </span>
                  </div>

                  {plan.key === "ENTERPRISE" && (
                    <p className="mt-2 text-[13px] font-medium text-[#0e6245]">
                      {PREMIUM_TRIAL.days}-day free trial, then ${displayPrice}/
                      {interval === "year" ? "yr" : "mo"}
                    </p>
                  )}
                  {plan.key === "UNLIMITED" && (
                    <p className="mt-2 text-[13px] font-medium text-[#635bff]">
                      Fair use &amp; rate limits apply
                    </p>
                  )}
                  {(plan.key === "PRO" || plan.key === "UNLIMITED") &&
                    interval === "year" && (
                      <p className="mt-2 text-[13px] font-medium text-[#0e6245]">
                        2 months free vs monthly
                      </p>
                    )}

                  <p className="mt-4 min-h-[48px] text-[14px] leading-relaxed text-[#697386]">
                    {plan.description}
                  </p>
                </div>

                <div className="flex flex-1 flex-col px-7 pb-7 pt-3">
                  <Link
                    href="/register"
                    className={cn(
                      "mt-1 flex h-11 w-full items-center justify-center rounded-lg text-[14px] font-semibold transition-colors",
                      plan.highlight || plan.key === "UNLIMITED"
                        ? "bg-[#635bff] text-white hover:bg-[#5851e5]"
                        : "border border-[#e6ebf1] bg-white text-[#0a2540] hover:bg-[#f6f9fc]"
                    )}
                  >
                    {cta}
                  </Link>

                  <div className="my-6 h-px bg-[#eef1f5]" />

                  <p className="text-[13px] font-medium text-[#0a2540]">
                    {plan.featuresLabel}
                  </p>
                  <ul className="mt-4 space-y-3">
                    {items.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2.5 text-[14px] leading-snug text-[#425466]"
                      >
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0a2540]" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  {plan.key === "UNLIMITED" && (
                    <p className="mt-4 text-[12px] leading-relaxed text-[#697386]">
                      *Subject to{" "}
                      <Link
                        href={`${LEGAL.terms}#unlimited-fair-use`}
                        className="font-medium text-[#635bff] hover:underline"
                      >
                        fair-use Terms
                      </Link>{" "}
                      (rate limits, anti-abuse).
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-[#e8e8e8] bg-[#fafbfc] px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-[18px] font-semibold tracking-[-0.02em] text-[#0a2540]">
                {PLANS.FREE.name}
              </h3>
              <p className="text-[15px] font-medium text-[#0a2540]">
                $0{" "}
                <span className="font-normal text-[#697386]">forever</span>
              </p>
            </div>
            <p className="mt-1 text-[14px] text-[#697386]">
              {FREE_PLAN_BANNER.description}
            </p>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {FREE_PLAN_BANNER.features.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-1.5 text-[13px] text-[#425466]"
                >
                  <Check className="h-3.5 w-3.5 shrink-0 text-[#0a2540]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <Link
            href="/register"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-[#e6ebf1] bg-white px-5 text-[13px] font-semibold text-[#0a2540] transition-colors hover:bg-white"
          >
            Start free
          </Link>
        </div>
      </div>
    </section>
  );
}
