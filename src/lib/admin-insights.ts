/**
 * Product-health scoring from behavioral signals.
 * Positive = happy / retained; negative = disappointed / at-risk.
 */

export type SentimentLabel = "delighted" | "happy" | "neutral" | "frustrated" | "churning";

export type UserInsight = {
  userId: string;
  email: string;
  name: string | null;
  plan: string;
  score: number;
  label: SentimentLabel;
  happy: string[];
  pain: string[];
  improvements: string[];
  books: number;
  completed: number;
  failed: number;
  pagesUsed: number;
  pagesLimit: number;
  daysSinceActive: number;
  daysSinceSignup: number;
  lastActiveAt: string;
  createdAt: string;
  hasStripe: boolean;
  onTrial: boolean;
  stuck: boolean;
};

export type BookTrouble = {
  severity: "critical" | "high" | "medium" | "low" | "ok";
  code: string;
  title: string;
  detail: string;
  fix: string;
};

export type ImprovementGap = {
  severity: "high" | "medium" | "low";
  area: string;
  finding: string;
  opportunity: string;
};

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function labelFromScore(score: number): SentimentLabel {
  if (score >= 45) return "delighted";
  if (score >= 20) return "happy";
  if (score >= 0) return "neutral";
  if (score >= -25) return "frustrated";
  return "churning";
}

type BookRow = {
  id: string;
  status: string;
  progress: number;
  currentPages: number;
  targetPages: number;
  coverImage: string | null;
  errorMessage: string | null;
  updatedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  generateAudiobookOnComplete: boolean;
  jobsFailed: number;
  jobsTotal: number;
  audioDone: number;
  audioTotal: number;
  chaptersDone: number;
  chapterCount: number;
};

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  pagesUsed: number;
  pagesLimit: number;
  pagesBonus: number;
  audioMinutesUsed: number;
  stripeCustomerId: string | null;
  stripeSubId: string | null;
  trialEndsAt: Date | null;
  hasUsedPremiumTrial: boolean;
  createdAt: Date;
  updatedAt: Date;
  brandName: string | null;
  authorName: string | null;
  pushTokens: number;
};

export function scoreUser(user: UserRow, books: BookRow[], now = new Date()): UserInsight {
  const happy: string[] = [];
  const pain: string[] = [];
  const improvements: string[] = [];
  let score = 0;

  const completed = books.filter((b) => b.status === "COMPLETED");
  const failed = books.filter((b) => b.status === "FAILED");
  const generating = books.filter((b) =>
    ["GENERATING", "OUTLINING"].includes(b.status)
  );
  const paused = books.filter((b) => b.status === "PAUSED");
  const drafts = books.filter((b) => b.status === "DRAFT");
  const pagesLimit = user.pagesLimit + (user.pagesBonus || 0);
  const pageUtil = pagesLimit > 0 ? user.pagesUsed / pagesLimit : 0;

  const lastBook = [...books].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
  )[0];
  const lastActive = new Date(
    Math.max(
      user.updatedAt.getTime(),
      lastBook?.updatedAt.getTime() ?? 0
    )
  );
  const daysSinceActive = daysBetween(lastActive, now);
  const daysSinceSignup = daysBetween(user.createdAt, now);
  const onTrial = Boolean(user.trialEndsAt && user.trialEndsAt > now);
  const stuck =
    books.length > 0 &&
    completed.length === 0 &&
    books.some((b) =>
      ["FAILED", "PAUSED", "GENERATING", "OUTLINING"].includes(b.status)
    );

  // --- Happy signals ---
  if (completed.length >= 1) {
    score += 18;
    happy.push(`Completed ${completed.length} book${completed.length === 1 ? "" : "s"}`);
  }
  if (completed.length >= 3) {
    score += 12;
    happy.push("Power user — multiple finished books");
  }
  if (books.some((b) => b.audioDone > 0)) {
    score += 10;
    happy.push("Finished audiobook / audio derivative");
  }
  if (books.some((b) => b.coverImage)) {
    score += 4;
    happy.push("Has cover art");
  }
  if (user.plan === "PRO" || user.plan === "ENTERPRISE" || user.plan === "UNLIMITED") {
    score += 20;
    happy.push(`Paying / premium plan (${user.plan})`);
  }
  if (user.stripeSubId) {
    score += 8;
    happy.push("Active Stripe subscription");
  }
  if (onTrial) {
    score += 6;
    happy.push("On Premium trial");
  }
  if (user.pushTokens > 0) {
    score += 3;
    happy.push("Mobile push enabled");
  }
  if (user.brandName || user.authorName) {
    score += 3;
    happy.push("Set branding / author identity");
  }
  if (daysSinceActive <= 3 && books.length > 0) {
    score += 8;
    happy.push("Active in last 3 days");
  }
  if (pageUtil > 0.15 && pageUtil < 0.9 && completed.length > 0) {
    score += 5;
    happy.push("Healthy page usage");
  }

  // --- Pain signals ---
  if (books.length === 0 && daysSinceSignup >= 1) {
    score -= 20;
    pain.push("Never created a book");
    improvements.push("Trigger guided first-book onboarding email / in-app CTA");
  }
  if (failed.length > 0) {
    score -= 10 * Math.min(failed.length, 3);
    pain.push(`${failed.length} failed book${failed.length === 1 ? "" : "s"}`);
    improvements.push("Surface clearer failure reasons + one-click Resume");
  }
  if (stuck) {
    score -= 18;
    pain.push("Stuck without a completed book");
    improvements.push("Proactive support / auto-retry stale generations");
  }
  if (paused.length > 0 && completed.length === 0) {
    score -= 8;
    pain.push("Paused generation and never finished");
  }
  if (drafts.length > 0 && completed.length === 0 && generating.length === 0) {
    score -= 6;
    pain.push("Draft books never started");
    improvements.push("Auto-start generation or simplify create → generate flow");
  }
  const jobsFailed = books.reduce((s, b) => s + b.jobsFailed, 0);
  if (jobsFailed >= 2) {
    score -= 8;
    pain.push(`${jobsFailed} failed generation jobs`);
  }
  if (pageUtil >= 1) {
    score -= 12;
    pain.push("Hit page limit");
    improvements.push("Upgrade paywall at limit with clear value props");
  } else if (pageUtil >= 0.85 && user.plan === "FREE") {
    score -= 4;
    pain.push("Near page limit on Free");
    improvements.push("Soft upgrade nudge at 85% usage");
  }
  if (user.hasUsedPremiumTrial && !user.stripeSubId && user.plan === "FREE") {
    score -= 10;
    pain.push("Trial ended without converting");
    improvements.push("Win-back offer / trial expiry email sequence");
  }
  if (daysSinceActive >= 14 && books.length > 0) {
    score -= 15;
    pain.push(`Inactive ${daysSinceActive} days`);
    improvements.push("Re-engagement push/email with unfinished book link");
  }
  if (daysSinceActive >= 30) {
    score -= 10;
    pain.push("Likely churned (30+ days quiet)");
  }
  if (
    completed.length > 0 &&
    !books.some((b) => b.audioDone > 0) &&
    books.some((b) => b.generateAudiobookOnComplete || b.audioTotal > 0)
  ) {
    score -= 3;
    pain.push("Tried audio but none completed");
    improvements.push("Audit audio failures for this user");
  }
  if (completed.some((b) => !b.coverImage)) {
    score -= 2;
    pain.push("Completed book missing cover");
    improvements.push("Backfill covers / ensure worker cover step");
  }

  // Missing cover on completed is mild; incomplete generations with errors are worse
  for (const b of failed.slice(0, 2)) {
    if (b.errorMessage) {
      pain.push(`Error: ${b.errorMessage.slice(0, 80)}`);
    }
  }

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    plan: user.plan,
    score,
    label: labelFromScore(score),
    happy: [...new Set(happy)].slice(0, 6),
    pain: [...new Set(pain)].slice(0, 6),
    improvements: [...new Set(improvements)].slice(0, 5),
    books: books.length,
    completed: completed.length,
    failed: failed.length,
    pagesUsed: user.pagesUsed,
    pagesLimit,
    daysSinceActive,
    daysSinceSignup,
    lastActiveAt: lastActive.toISOString(),
    createdAt: user.createdAt.toISOString(),
    hasStripe: Boolean(user.stripeCustomerId),
    onTrial,
    stuck,
  };
}

export function troubleshootBook(input: {
  status: string;
  progress: number;
  currentPages: number;
  targetPages: number;
  coverImage: string | null;
  errorMessage: string | null;
  updatedAt: Date;
  completedAt: Date | null;
  chapterCount: number;
  chaptersDone: number;
  sectionsTotal: number;
  sectionsWithContent: number;
  jobs: Array<{
    status: string;
    error: string | null;
    attempts: number;
    maxAttempts: number;
    createdAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
    payload: unknown;
  }>;
  audios: Array<{ status: string; type: string; errorMessage: string | null }>;
  now?: Date;
}): BookTrouble[] {
  const now = input.now ?? new Date();
  const issues: BookTrouble[] = [];
  const minsSinceUpdate =
    (now.getTime() - input.updatedAt.getTime()) / 60000;

  if (input.status === "FAILED") {
    issues.push({
      severity: "critical",
      code: "BOOK_FAILED",
      title: "Book marked FAILED",
      detail: input.errorMessage || "No error message stored on the book.",
      fix: "Open book → Resume generation. Check latest GenerationJob.error for root cause.",
    });
  }

  if (input.status === "PAUSED") {
    issues.push({
      severity: "medium",
      code: "BOOK_PAUSED",
      title: "Generation paused by user",
      detail: `Progress ${Math.round(input.progress)}%, ${input.currentPages}/${input.targetPages} pages.`,
      fix: "User can Resume from dashboard. Confirm worker enqueue still works.",
    });
  }

  if (
    (input.status === "GENERATING" || input.status === "OUTLINING") &&
    minsSinceUpdate > 20
  ) {
    issues.push({
      severity: "high",
      code: "STALE_GENERATION",
      title: "Stale in-progress generation",
      detail: `No book update for ${Math.round(minsSinceUpdate)} minutes while status is ${input.status}.`,
      fix: "Worker cron should requeue stale RUNNING jobs. Check Cloudflare workflow + GENERATION_WORKER_URL.",
    });
  }

  const running = input.jobs.filter((j) =>
    ["RUNNING", "QUEUED", "PENDING"].includes(j.status)
  );
  const failedJobs = input.jobs.filter((j) => j.status === "FAILED");
  if (failedJobs.length > 0) {
    const last = failedJobs[0];
    issues.push({
      severity: failedJobs.length >= 2 ? "high" : "medium",
      code: "JOB_FAILURES",
      title: `${failedJobs.length} failed generation job(s)`,
      detail: last.error || "Job failed without error text.",
      fix:
        last.attempts >= last.maxAttempts
          ? "Max attempts reached — create a fresh job via Resume."
          : "Retry / resume. Inspect worker logs for the job id.",
    });
  }

  if (
    (input.status === "GENERATING" || input.status === "OUTLINING") &&
    running.length === 0 &&
    !input.completedAt
  ) {
    issues.push({
      severity: "high",
      code: "NO_ACTIVE_JOB",
      title: "Book generating but no active job",
      detail: "Status says generating, yet no PENDING/QUEUED/RUNNING job exists.",
      fix: "Enqueue a new job (Resume). Verify /api/generate and worker /enqueue.",
    });
  }

  if (input.status === "COMPLETED" && !input.coverImage) {
    issues.push({
      severity: "medium",
      code: "MISSING_COVER",
      title: "Completed without cover image",
      detail: "coverImage is null — cover step likely failed or never ran.",
      fix: "POST /api/books/:id/cover or ensure worker cover → /api/internal/cover path.",
    });
  }

  if (
    input.chapterCount > 0 &&
    input.chaptersDone < input.chapterCount &&
    input.status === "COMPLETED"
  ) {
    issues.push({
      severity: "low",
      code: "PARTIAL_CHAPTERS",
      title: "Completed with incomplete chapters",
      detail: `${input.chaptersDone}/${input.chapterCount} chapters completed.`,
      fix: "May have hit target pages early — verify targetPages stop condition.",
    });
  }

  if (
    input.sectionsTotal > 0 &&
    input.sectionsWithContent === 0 &&
    ["GENERATING", "FAILED", "PAUSED"].includes(input.status)
  ) {
    issues.push({
      severity: "high",
      code: "NO_SECTION_CONTENT",
      title: "Outline exists but no section prose",
      detail: `${input.sectionsTotal} sections, none with content.`,
      fix: "Writing phase never started or all writes failed — check AI model / worker logs.",
    });
  }

  for (const audio of input.audios.filter((a) => a.status === "FAILED")) {
    issues.push({
      severity: "medium",
      code: "AUDIO_FAILED",
      title: `${audio.type} generation failed`,
      detail: audio.errorMessage || "Audio failed without message.",
      fix: "Retry from Audio Studio; check ElevenLabs / R2 audio env vars.",
    });
  }

  if (
    input.status === "COMPLETED" &&
    input.currentPages < Math.max(1, Math.floor(input.targetPages * 0.5))
  ) {
    issues.push({
      severity: "low",
      code: "SHORT_MANUSCRIPT",
      title: "Finished far under target pages",
      detail: `${input.currentPages} pages vs target ${input.targetPages}.`,
      fix: "Check wordsPerPage / early exit; user may want a new edition.",
    });
  }

  if (issues.length === 0) {
    issues.push({
      severity: "ok",
      code: "HEALTHY",
      title: "No major issues detected",
      detail: `Status ${input.status}, progress ${Math.round(input.progress)}%.`,
      fix: "Monitor only.",
    });
  }

  return issues;
}

export function buildProductGaps(stats: {
  users: number;
  zeroBooks: number;
  completionRate: number;
  failRate: number;
  books: number;
  audioUsers: number;
  completedUsers: number;
  pagesExhausted: number;
  pagesNearLimit: number;
  brandingUsers: number;
  frustratedUsers: number;
  churningUsers: number;
  missingCovers: number;
}): ImprovementGap[] {
  const gaps: ImprovementGap[] = [];
  if (stats.users === 0) return gaps;

  if (stats.zeroBooks / stats.users > 0.25) {
    gaps.push({
      severity: "high",
      area: "Activation",
      finding: `${Math.round((100 * stats.zeroBooks) / stats.users)}% of users never created a book`,
      opportunity: "Stronger empty-state CTA and guided first book",
    });
  }
  if (stats.completionRate < 40 && stats.books >= 5) {
    gaps.push({
      severity: "high",
      area: "Generation reliability",
      finding: `Only ${stats.completionRate}% of books complete (fail ${stats.failRate}%)`,
      opportunity: "Better resume/retry, clearer errors, worker stale-job recovery",
    });
  }
  if (
    stats.completedUsers >= 3 &&
    stats.audioUsers / Math.max(stats.completedUsers, 1) < 0.3
  ) {
    gaps.push({
      severity: "medium",
      area: "Audiobook adoption",
      finding: `Only ${stats.audioUsers} users finished audio vs ${stats.completedUsers} with a completed book`,
      opportunity: "Post-completion audiobook CTA; fix audio quota friction",
    });
  }
  if (stats.pagesExhausted + stats.pagesNearLimit >= Math.max(2, Math.floor(stats.users * 0.1))) {
    gaps.push({
      severity: "high",
      area: "Monetization",
      finding: `${stats.pagesExhausted} at limit, ${stats.pagesNearLimit} near (≥85%)`,
      opportunity: "Upgrade prompts at limit; clearer usage meter",
    });
  }
  if (stats.brandingUsers / stats.users < 0.15) {
    gaps.push({
      severity: "low",
      area: "Branding",
      finding: `Only ${stats.brandingUsers} users set brand/author identity`,
      opportunity: "Prompt branding before export",
    });
  }
  if (stats.frustratedUsers + stats.churningUsers >= 2) {
    gaps.push({
      severity: "high",
      area: "Retention",
      finding: `${stats.frustratedUsers} frustrated + ${stats.churningUsers} churning users`,
      opportunity: "Support outreach on failed books; re-engagement for quiet accounts",
    });
  }
  if (stats.missingCovers >= 1) {
    gaps.push({
      severity: "medium",
      area: "Cover pipeline",
      finding: `${stats.missingCovers} completed books missing covers`,
      opportunity: "Ensure worker cover step + /api/internal/cover are healthy",
    });
  }
  return gaps;
}
