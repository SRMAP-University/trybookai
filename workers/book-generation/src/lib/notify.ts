import type { Env } from "../env";

export type NotifyPhase =
  | "started"
  | "outline"
  | "progress"
  | "completed"
  | "failed";

export async function notifyApp(
  env: Env,
  body: {
    userId: string;
    bookId: string;
    phase: NotifyPhase;
    progress?: number;
    title?: string;
    lastMilestone?: number;
  }
): Promise<{ milestone?: number | null } | null> {
  const base = (env.APP_NOTIFY_URL || "https://www.trybookai.com").replace(
    /\/$/,
    ""
  );
  if (!env.GENERATION_WORKER_SECRET) return null;

  try {
    const res = await fetch(`${base}/api/internal/push`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GENERATION_WORKER_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(
        "[notify] push endpoint failed:",
        res.status,
        (await res.text()).slice(0, 200)
      );
      return null;
    }
    return (await res.json()) as { milestone?: number | null };
  } catch (error) {
    console.warn("[notify] push request error:", error);
    return null;
  }
}

export function nextPushMilestone(
  previous: number | null | undefined,
  progress: number
): number | null {
  const milestones = [25, 50, 75];
  const prev = previous ?? 0;
  for (const m of milestones) {
    if (progress >= m && prev < m) return m;
  }
  return null;
}
