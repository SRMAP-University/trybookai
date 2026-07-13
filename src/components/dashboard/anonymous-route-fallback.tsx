"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AnonymousRouteFallbackProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

export function AnonymousRouteFallback({
  title,
  description,
  children,
}: AnonymousRouteFallbackProps) {
  const { status } = useSession();

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-[#635bff]" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#0a2540]">
            {title}
          </h1>
          <p className="mt-1 text-[14px] text-[#697386]">{description}</p>
        </div>

        <div className="rounded-xl border border-dashed border-[#e6ebf1] bg-[#f8fafc] px-6 py-14 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#f0efff] text-[#635bff]">
            <Lock className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-[17px] font-semibold tracking-[-0.02em] text-[#0a2540]">
            Sign in to use {title.toLowerCase()}
          </h2>
          <p className="mx-auto mt-1 max-w-[400px] text-[14px] text-[#697386]">
            You can explore the dashboard, but generation and account features
            require a free BookAI account.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Button
              variant="outline"
              className="h-9 rounded-md border-[#e6ebf1] px-4 text-[13px] text-[#0a2540] hover:bg-white"
              asChild
            >
              <Link href="/login">Sign in</Link>
            </Button>
            <Button
              className="h-9 rounded-md bg-[#635bff] px-4 text-[13px] hover:bg-[#5851e5]"
              asChild
            >
              <Link href="/register">Create free account</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return children;
}
