"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";

export function ExplorationNotice() {
  const { status } = useSession();

  if (status !== "unauthenticated") return null;

  return (
    <div className="border-b border-[#e6ebf1] bg-[#f0efff] px-4 py-2 text-center text-[13px] text-[#0a2540]">
      <span className="hidden sm:inline">
        You&rsquo;re exploring BookAI.{" "}
      </span>
      <Link
        href="/login?callbackUrl=/dashboard"
        className="font-medium text-[#635bff] underline hover:text-[#4338ca]"
      >
        Sign in
      </Link>{" "}
      or{" "}
      <Link
        href="/register?callbackUrl=/dashboard"
        className="font-medium text-[#635bff] underline hover:text-[#4338ca]"
      >
        create a free account
      </Link>{" "}
      to generate books.
    </div>
  );
}
