"use client";

import Link from "next/link";
import { UpgradeButton } from "@/components/dashboard/upgrade-button";
import { signOut, useSession } from "next-auth/react";
import {
  CreditCard,
  LogOut,
  Settings,
  Sparkles,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDashboardUser } from "@/components/dashboard/user-context";
import { LogoMark } from "@/components/marketing/landing-showcase";

export function DashboardHeader() {
  const { data: session, status } = useSession();
  const { user } = useDashboardUser();
  const isAnonymous = status === "unauthenticated";

  const name = user?.name ?? session?.user?.name ?? "User";
  const email = user?.email ?? session?.user?.email ?? "";
  const plan = user?.plan ?? "FREE";
  const isFree = plan === "FREE";
  const initials =
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U";

  return (
    <header className="sticky top-0 z-20 border-b border-[#e6ebf1] bg-white/95 backdrop-blur">
      <div className="flex h-14 items-center justify-between gap-3 px-4 lg:h-16 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.02em] text-[#0a2540] lg:hidden"
          >
            <LogoMark className="h-6 w-6" />
            BookAI
          </Link>
          <div className="hidden min-w-0 lg:block">
            <p className="truncate text-[13px] text-[#697386]">
              {isFree
                ? "Free plan"
                : `${plan.charAt(0)}${plan.slice(1).toLowerCase()} plan`}
              {user ? ` · ${user.pagesUsed}/${user.pagesLimit} pages used` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {isAnonymous ? (
            <>
              <Button
                variant="ghost"
                className="h-8 px-2 text-[13px] text-[#0a2540] hover:bg-[#f6f9fc] sm:h-9 sm:px-3"
                asChild
              >
                <Link href="/login?callbackUrl=/dashboard">Sign in</Link>
              </Button>
              <Button
                className="h-8 rounded-md bg-[#635bff] px-3 text-[13px] hover:bg-[#5851e5] sm:h-9 sm:px-4"
                asChild
              >
                <Link href="/register?callbackUrl=/dashboard">Get started</Link>
              </Button>
            </>
          ) : (
            <>
              {isFree ? (
                <UpgradeButton
                  plan="PRO"
                  className="h-8 rounded-md bg-[#635bff] px-3 text-[13px] hover:bg-[#5851e5] sm:h-9 sm:px-4"
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Upgrade to Pro</span>
                  <span className="sm:hidden">Pro</span>
                </UpgradeButton>
              ) : (
                <Button
                  variant="outline"
                  className="h-8 rounded-md border-[#e6ebf1] px-3 text-[13px] text-[#0a2540] hover:bg-[#f6f9fc] sm:h-9"
                  asChild
                >
                  <Link href="/dashboard/billing">
                    <Sparkles className="mr-1.5 h-3.5 w-3.5 text-[#635bff]" />
                    <span className="capitalize">{plan.toLowerCase()}</span>
                  </Link>
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-full outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-[#635bff]"
                  >
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-[#f0efff] text-[12px] font-medium text-[#635bff]">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <p className="text-[13px] font-medium text-[#0a2540]">{name}</p>
                    <p className="truncate text-[12px] text-[#697386]">{email}</p>
                    <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-[#635bff]">
                      {plan.toLowerCase()} plan
                    </p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/settings" className="cursor-pointer">
                      <User className="mr-2 h-4 w-4" />
                      Profile & settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/billing" className="cursor-pointer">
                      <CreditCard className="mr-2 h-4 w-4" />
                      Billing
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/branding" className="cursor-pointer">
                      <Settings className="mr-2 h-4 w-4" />
                      Branding
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => signOut({ callbackUrl: "/" })}
                    className="cursor-pointer text-[#df1b41] focus:text-[#df1b41]"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
