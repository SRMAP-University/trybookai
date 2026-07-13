"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  CreditCard,
  Headphones,
  LayoutGrid,
  Palette,
  Plus,
  Settings,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { UpgradeLink } from "@/components/dashboard/upgrade-button";
import { useDashboardUser } from "@/components/dashboard/user-context";
import {
  formatTrialCountdown,
  isClientTrialActive,
} from "@/components/dashboard/trial-banner";
import { PREMIUM_TRIAL } from "@/lib/constants";

const navSections = [
  {
    label: "Workspace",
    items: [
      { href: "/dashboard", label: "Home", icon: LayoutGrid },
      { href: "/dashboard/books/new", label: "New book", icon: Plus },
      { href: "/dashboard/audio-studio", label: "Audio Studio", icon: Headphones },
      { href: "/dashboard/tracking", label: "Tracking", icon: Activity },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/dashboard/usage", label: "Usage", icon: BarChart3 },
      { href: "/dashboard/branding", label: "Branding", icon: Palette },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
      { href: "/dashboard/settings", label: "Settings", icon: Settings },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return href === "/dashboard"
    ? pathname === "/dashboard"
    : pathname.startsWith(href);
}

export function DashboardSidebar() {
  const pathname = usePathname();
  const { user: usage } = useDashboardUser();

  const usagePercent =
    usage && usage.pagesLimit > 0
      ? Math.min(100, Math.round((usage.pagesUsed / usage.pagesLimit) * 100))
      : 0;
  const audioLimit = usage?.audioMinutesLimit ?? 0;
  const audioUsed = usage?.audioMinutesUsed ?? 0;
  const audioPercent =
    audioLimit > 0
      ? Math.min(100, Math.round((audioUsed / audioLimit) * 100))
      : 0;
  const onTrial = isClientTrialActive(usage?.trialEndsAt, usage?.onTrial);
  const trialLeft = formatTrialCountdown(usage?.trialEndsAt);
  const canStartTrial =
    usage?.plan === "FREE" && !usage?.hasStripeSubscription && !onTrial;

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[240px] flex-col border-r border-[#e6ebf1] bg-white lg:flex">
      <div className="flex h-16 items-center px-5">
        <Link
          href="/dashboard"
          className="text-[15px] font-semibold tracking-[-0.02em] text-[#0a2540]"
        >
          BookAI
        </Link>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {navSections.map((section) => (
          <div key={section.label}>
            <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-[#a3acb9]">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-[14px] transition-colors",
                      active
                        ? "bg-[#f0efff] font-medium text-[#635bff]"
                        : "text-[#425466] hover:bg-[#f6f9fc] hover:text-[#0a2540]"
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-[#e6ebf1] p-3">
        <div
          className={cn(
            "rounded-md border px-2.5 py-2",
            onTrial
              ? "border-[#f0e0a8] bg-[#fffbeb]"
              : "border-[#e6ebf1] bg-[#f6f9fc]"
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[#697386]">
              Usage
            </p>
            <span
              className={cn(
                "text-[10px] font-semibold",
                onTrial ? "text-[#9a6700]" : "capitalize text-[#635bff]"
              )}
            >
              {onTrial
                ? "Free trial"
                : usage?.plan === "ENTERPRISE"
                  ? "Premium"
                  : (usage?.plan.toLowerCase() ?? "—")}
            </span>
          </div>

          {onTrial && trialLeft && (
            <p className="mt-1 text-[10px] font-medium text-[#9a6700]">
              {trialLeft}
            </p>
          )}

          <div className="mt-2 space-y-1.5">
            <div>
              <div className="flex items-center justify-between gap-2 text-[10px]">
                <span className="text-[#425466]">Pages</span>
                <span className="tabular-nums text-[#697386]">
                  {usage ? `${usage.pagesUsed}/${usage.pagesLimit}` : "—"}
                </span>
              </div>
              <Progress value={usagePercent} className="mt-1 h-1" />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 text-[10px]">
                <span className="text-[#425466]">Audio</span>
                <span className="tabular-nums text-[#697386]">
                  {usage?.plan === "FREE" && !onTrial
                    ? "Locked"
                    : usage
                      ? `${usage.audioMinutesUsed ?? 0}/${usage.audioMinutesLimit ?? 0}m`
                      : "—"}
                </span>
              </div>
              <Progress
                value={usage?.plan === "FREE" && !onTrial ? 0 : audioPercent}
                className="mt-1 h-1"
              />
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-medium">
            <Link
              href="/dashboard/usage"
              className="text-[#635bff] hover:underline"
            >
              Details
            </Link>
            {canStartTrial && (
              <>
                <span className="text-[#d8dee8]">·</span>
                <Link
                  href="/dashboard/billing"
                  className="text-[#9a6700] hover:underline"
                >
                  {PREMIUM_TRIAL.days}-day trial
                </Link>
              </>
            )}
            {onTrial && (
              <>
                <span className="text-[#d8dee8]">·</span>
                <Link
                  href="/dashboard/billing"
                  className="text-[#0e6245] hover:underline"
                >
                  Unlock Premium
                </Link>
              </>
            )}
            {usage?.plan === "FREE" && !canStartTrial && !onTrial && (
              <>
                <span className="text-[#d8dee8]">·</span>
                <UpgradeLink
                  plan="PRO"
                  className="text-[#635bff] hover:underline"
                >
                  Upgrade
                </UpgradeLink>
              </>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

const mobileNav = [
  { href: "/dashboard", label: "Home", icon: LayoutGrid },
  { href: "/dashboard/audio-studio", label: "Audio", icon: Headphones },
  { href: "/dashboard/tracking", label: "Track", icon: Activity },
  { href: "/dashboard/usage", label: "Usage", icon: BarChart3 },
  { href: "/dashboard/settings", label: "More", icon: Settings },
];

export function MobileDashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 flex border-t border-[#e6ebf1] bg-white lg:hidden">
      {mobileNav.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px]",
              active ? "text-[#635bff]" : "text-[#697386]"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
