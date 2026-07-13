"use client";

import { useState } from "react";
import { readJson } from "@/lib/api";
import { useDashboardUser } from "@/components/dashboard/user-context";
import {
  TrialBanner,
  isClientTrialActive,
} from "@/components/dashboard/trial-banner";
import { toast } from "sonner";

export function DashboardTrialSection() {
  const { user, refresh } = useDashboardUser();
  const [ending, setEnding] = useState(false);

  const onTrial = isClientTrialActive(user?.trialEndsAt, user?.onTrial);
  if (!user || !onTrial) return null;

  async function handleEndTrial() {
    setEnding(true);
    try {
      const res = await fetch("/api/billing/trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end" }),
      });
      const result = await readJson<{ error?: string; message?: string }>(res);
      if (!result.ok) throw new Error(result.error);
      toast.success(result.data.message ?? "Full Premium unlocked");
      refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not end trial"
      );
    } finally {
      setEnding(false);
    }
  }

  return (
    <TrialBanner
      trialEndsAt={user.trialEndsAt}
      pagesUsed={user.pagesUsed}
      pagesLimit={user.pagesLimit}
      audioMinutesUsed={user.audioMinutesUsed ?? 0}
      audioMinutesLimit={user.audioMinutesLimit ?? 0}
      onEndTrial={handleEndTrial}
      ending={ending}
    />
  );
}
