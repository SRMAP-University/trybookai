/**
 * One-off user activity analysis. Run: node scripts/analyze-users.mjs
 * Prints JSON summary (emails hashed) for product insights.
 */
import { config } from "dotenv";
import pg from "pg";
import { createHash } from "crypto";
import { writeFileSync } from "fs";

config({ path: ".env.local" });
config({ path: ".env" });

const { Client } = pg;

function anonEmail(email) {
  const [local, domain = "?"] = String(email).split("@");
  const hash = createHash("sha256").update(email).digest("hex").slice(0, 6);
  return `${(local || "?").slice(0, 2)}…@${domain}#${hash}`;
}

function daysBetween(a, b) {
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const users = (
  await client.query(`
  SELECT
    u.id, u.name, u.email, u.plan,
    u."pagesUsed", u."pagesLimit", u."pagesBonus",
    u."audioMinutesUsed", u."audioMinutesLimit", u."audioMinutesBonus",
    u."trialEndsAt", u."trialStartedAt", u."hasUsedPremiumTrial",
    u."stripeCustomerId", u."stripeSubId",
    u."defaultGenre", u."defaultTone", u."defaultAudience",
    u."defaultTargetPages", u."defaultLanguage", u."defaultModel",
    u."brandName", u."authorName", u."styleGuide",
    u."autoGenerateOnCreate", u."createdAt", u."updatedAt",
    (SELECT COUNT(*)::int FROM "Account" a WHERE a."userId" = u.id) AS account_count,
    (SELECT STRING_AGG(DISTINCT a.provider, ',') FROM "Account" a WHERE a."userId" = u.id) AS providers,
    (SELECT COUNT(*)::int FROM "Book" b WHERE b."userId" = u.id) AS book_count,
    (SELECT COUNT(*)::int FROM "DevicePushToken" d WHERE d."userId" = u.id) AS push_tokens
  FROM "User" u
  ORDER BY u."createdAt" ASC
`)
).rows;

const books = (
  await client.query(`
  SELECT
    b.id, b."userId", b.title, b.genre, b.status, b."targetPages", b."currentPages",
    b.progress, b.audience, b.tone, b.language, b.model, b.pov, b.tense,
    b."isPublic", b."generateAudiobookOnComplete", b."customInstructions",
    b.characters, b.themes, b."coverImage", b."chapterCount",
    b."createdAt", b."updatedAt", b."completedAt", b."errorMessage",
    (SELECT COUNT(*)::int FROM "Chapter" c WHERE c."bookId" = b.id) AS chapter_count,
    (SELECT COUNT(*)::int FROM "Chapter" c WHERE c."bookId" = b.id AND c.status = 'COMPLETED') AS chapters_done,
    (SELECT COUNT(*)::int FROM "GenerationJob" j WHERE j."bookId" = b.id) AS job_count,
    (SELECT COUNT(*)::int FROM "GenerationJob" j WHERE j."bookId" = b.id AND j.status = 'FAILED') AS jobs_failed,
    (SELECT COUNT(*)::int FROM "BookAudio" a WHERE a."bookId" = b.id) AS audio_count,
    (SELECT COUNT(*)::int FROM "BookAudio" a WHERE a."bookId" = b.id AND a.status = 'COMPLETED') AS audio_done,
    (SELECT COUNT(*)::int FROM "BookAudio" a WHERE a."bookId" = b.id AND a.type = 'AUDIOBOOK') AS audiobook_count,
    (SELECT COUNT(*)::int FROM "BookAudio" a WHERE a."bookId" = b.id AND a.type = 'PODCAST') AS podcast_count,
    (SELECT COUNT(*)::int FROM "BookAudio" a WHERE a."bookId" = b.id AND a.type = 'MUSIC') AS music_count
  FROM "Book" b
`)
).rows;

const jobs = (
  await client.query(`
  SELECT type, status, COUNT(*)::int AS n,
    AVG(EXTRACT(EPOCH FROM (COALESCE("completedAt", NOW()) - "createdAt"))) AS avg_sec
  FROM "GenerationJob"
  GROUP BY type, status
  ORDER BY n DESC
`)
).rows;

const audioAgg = (
  await client.query(`
  SELECT type, status, COUNT(*)::int AS n
  FROM "BookAudio"
  GROUP BY type, status
  ORDER BY n DESC
`)
).rows;

const now = new Date();
const byPlan = {};
const byProvider = {};
const genres = {};
const tones = {};
const audiences = {};
const languages = {};
const models = {};
const statuses = {};
const targetPageBuckets = { "1-50": 0, "51-100": 0, "101-200": 0, "201-400": 0, "400+": 0 };

let withPassword = 0;
let withGoogle = 0;
let withStripe = 0;
let withTrial = 0;
let usedTrial = 0;
let withBranding = 0;
let withStyleGuide = 0;
let withPush = 0;
let zeroBooks = 0;
let oneBook = 0;
let multiBooks = 0;
let completedAny = 0;
let failedAny = 0;
let audioUsers = 0;
let pagesExhausted = 0;
let pagesNearLimit = 0;
let active7 = 0;
let active30 = 0;
let signup7 = 0;
let signup30 = 0;

const userById = Object.fromEntries(users.map((u) => [u.id, u]));
const booksByUser = {};
for (const b of books) {
  (booksByUser[b.userId] ||= []).push(b);
  statuses[b.status] = (statuses[b.status] || 0) + 1;
  if (b.genre) genres[b.genre] = (genres[b.genre] || 0) + 1;
  if (b.tone) tones[b.tone] = (tones[b.tone] || 0) + 1;
  if (b.audience) audiences[b.audience] = (audiences[b.audience] || 0) + 1;
  if (b.language) languages[b.language] = (languages[b.language] || 0) + 1;
  if (b.model) models[b.model] = (models[b.model] || 0) + 1;
  const tp = b.targetPages || 0;
  if (tp <= 50) targetPageBuckets["1-50"]++;
  else if (tp <= 100) targetPageBuckets["51-100"]++;
  else if (tp <= 200) targetPageBuckets["101-200"]++;
  else if (tp <= 400) targetPageBuckets["201-400"]++;
  else targetPageBuckets["400+"]++;
}

const cohort = users.map((u) => {
  const ub = booksByUser[u.id] || [];
  const completed = ub.filter((b) => b.status === "COMPLETED");
  const failed = ub.filter((b) => b.status === "FAILED");
  const generating = ub.filter((b) =>
    ["GENERATING", "OUTLINING", "QUEUED"].includes(b.status)
  );
  const audioDone = ub.reduce((s, b) => s + (b.audio_done || 0), 0);
  const jobsFailed = ub.reduce((s, b) => s + (b.jobs_failed || 0), 0);
  const lastBook = ub.sort(
    (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
  )[0];
  const lastActive = new Date(
    Math.max(
      new Date(u.updatedAt).getTime(),
      lastBook ? new Date(lastBook.updatedAt).getTime() : 0
    )
  );
  const pagesLimit = (u.pagesLimit || 0) + (u.pagesBonus || 0);
  const pageUtil =
    pagesLimit > 0 ? Math.round((100 * (u.pagesUsed || 0)) / pagesLimit) : 0;

  byPlan[u.plan] = (byPlan[u.plan] || 0) + 1;
  for (const p of (u.providers || "credentials").split(",").filter(Boolean)) {
    byProvider[p] = (byProvider[p] || 0) + 1;
  }
  if ((u.providers || "").includes("google")) withGoogle++;
  if (!u.providers || u.providers.includes("credentials") || !u.providers) {
    // passwordHash not selected — infer from providers
  }
  if (u.stripeCustomerId) withStripe++;
  if (u.trialEndsAt && new Date(u.trialEndsAt) > now) withTrial++;
  if (u.hasUsedPremiumTrial) usedTrial++;
  if (u.brandName || u.authorName) withBranding++;
  if (u.styleGuide) withStyleGuide++;
  if (u.push_tokens > 0) withPush++;
  if (ub.length === 0) zeroBooks++;
  else if (ub.length === 1) oneBook++;
  else multiBooks++;
  if (completed.length) completedAny++;
  if (failed.length) failedAny++;
  if (audioDone > 0) audioUsers++;
  if (pagesLimit > 0 && (u.pagesUsed || 0) >= pagesLimit) pagesExhausted++;
  else if (pageUtil >= 80) pagesNearLimit++;
  if (daysBetween(lastActive, now) <= 7) active7++;
  if (daysBetween(lastActive, now) <= 30) active30++;
  if (daysBetween(new Date(u.createdAt), now) <= 7) signup7++;
  if (daysBetween(new Date(u.createdAt), now) <= 30) signup30++;

  const topGenres = [...new Set(ub.map((b) => b.genre).filter(Boolean))];
  const wantsAudio = ub.some(
    (b) => b.generateAudiobookOnComplete || (b.audio_count || 0) > 0
  );
  const wantsCustom = ub.some(
    (b) => b.customInstructions || b.characters || b.themes
  );
  const stuck =
    ub.some((b) => ["GENERATING", "OUTLINING", "FAILED", "PAUSED"].includes(b.status)) &&
    completed.length === 0;

  return {
    id: u.id.slice(0, 8),
    email: anonEmail(u.email),
    name: u.name || null,
    plan: u.plan,
    providers: u.providers || "none",
    createdAt: u.createdAt,
    daysSinceSignup: daysBetween(new Date(u.createdAt), now),
    daysSinceActive: daysBetween(lastActive, now),
    books: ub.length,
    completed: completed.length,
    failed: failed.length,
    generating: generating.length,
    pagesUsed: u.pagesUsed,
    pagesLimit,
    pageUtilPct: pageUtil,
    audioMinUsed: u.audioMinutesUsed,
    audioDone,
    jobsFailed,
    wantsAudio,
    wantsCustom,
    stuck,
    genres: topGenres.slice(0, 5),
    defaultGenre: u.defaultGenre,
    defaultTargetPages: u.defaultTargetPages,
    defaultLanguage: u.defaultLanguage,
    hasStripe: Boolean(u.stripeCustomerId),
    hasSub: Boolean(u.stripeSubId),
    onTrial: Boolean(u.trialEndsAt && new Date(u.trialEndsAt) > now),
    usedTrial: u.hasUsedPremiumTrial,
    hasBranding: Boolean(u.brandName || u.authorName),
    hasPush: u.push_tokens > 0,
    avgTargetPages:
      ub.length > 0
        ? Math.round(ub.reduce((s, b) => s + (b.targetPages || 0), 0) / ub.length)
        : u.defaultTargetPages,
  };
});

// Intent signals from titles/descriptions (lightweight keyword)
const intentKeywords = {
  business: /\b(business|startup|entrepreneur|marketing|sales|leadership)\b/i,
  selfHelp: /\b(self[- ]?help|mindset|habit|productivity|motivation|wellness)\b/i,
  fiction: /\b(novel|fantasy|romance|thriller|mystery|sci-?fi|fiction)\b/i,
  kids: /\b(children|kids|young adult|ya\b|bedtime)\b/i,
  education: /\b(textbook|course|learn|guide|tutorial|how to)\b/i,
  memoir: /\b(memoir|biography|autobiograph)\b/i,
  spirituality: /\b(spiritual|faith|bible|meditation|religion)\b/i,
};
const intents = Object.fromEntries(Object.keys(intentKeywords).map((k) => [k, 0]));
for (const b of books) {
  const text = `${b.title || ""} ${b.genre || ""} ${b.audience || ""}`;
  for (const [k, re] of Object.entries(intentKeywords)) {
    if (re.test(text)) intents[k]++;
  }
}

const top = (obj, n = 10) =>
  Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => ({ name, count }));

const funnel = {
  users: users.length,
  createdBook: users.length - zeroBooks,
  completedBook: completedAny,
  triedAudio: books.filter((b) => (b.audio_count || 0) > 0).length,
  completedAudio: books.filter((b) => (b.audio_done || 0) > 0).length,
  paidOrTrial: withStripe + withTrial,
  payingSub: users.filter((u) => u.stripeSubId).length,
};

const gaps = [];
const completionRate =
  books.length > 0
    ? Math.round((100 * (statuses.COMPLETED || 0)) / books.length)
    : 0;
const failRate =
  books.length > 0 ? Math.round((100 * (statuses.FAILED || 0)) / books.length) : 0;
const draftish =
  (statuses.DRAFT || 0) + (statuses.OUTLINING || 0) + (statuses.PAUSED || 0);

if (zeroBooks / Math.max(users.length, 1) > 0.25) {
  gaps.push({
    severity: "high",
    area: "Activation",
    finding: `${Math.round((100 * zeroBooks) / users.length)}% of users never created a book`,
    opportunity: "Stronger empty-state CTA, onboarding template, or guided first book",
  });
}
if (completionRate < 40 && books.length >= 5) {
  gaps.push({
    severity: "high",
    area: "Generation reliability",
    finding: `Only ${completionRate}% of books reach COMPLETED (failed ${failRate}%)`,
    opportunity: "Improve resume/retry UX, clearer failure reasons, progress reliability",
  });
}
if (audioUsers / Math.max(completedAny, 1) < 0.3 && completedAny >= 3) {
  gaps.push({
    severity: "medium",
    area: "Audiobook adoption",
    finding: `Only ${audioUsers} users finished any audio vs ${completedAny} with a completed book`,
    opportunity: "Surface audiobook CTA post-completion; fix audio quota/trial friction",
  });
}
if (pagesExhausted + pagesNearLimit >= Math.max(2, Math.floor(users.length * 0.1))) {
  gaps.push({
    severity: "high",
    area: "Monetization / limits",
    finding: `${pagesExhausted} at page limit, ${pagesNearLimit} near (≥80%)`,
    opportunity: "Upgrade prompts at limit; clearer usage; trial-to-paid path",
  });
}
if (withBranding / Math.max(users.length, 1) < 0.15) {
  gaps.push({
    severity: "low",
    area: "Branding / export",
    finding: `Only ${withBranding} users set brand/author identity`,
    opportunity: "Prompt branding before export; publisher pack for Pro",
  });
}
if (multiBooks / Math.max(users.length - zeroBooks, 1) < 0.35 && users.length - zeroBooks >= 5) {
  gaps.push({
    severity: "medium",
    area: "Retention",
    finding: `Most creators stop at one book (${oneBook} one-book vs ${multiBooks} multi)`,
    opportunity: "Series/edition workflows, templates from past books, weekly prompts",
  });
}
if ((statuses.FAILED || 0) + draftish > (statuses.COMPLETED || 0)) {
  gaps.push({
    severity: "high",
    area: "Drop-off before finish",
    finding: `${draftish} draft/outline/paused + ${statuses.FAILED || 0} failed vs ${statuses.COMPLETED || 0} completed`,
    opportunity: "Faster short-book path; auto-retry; email/push when stuck",
  });
}

const summary = {
  generatedAt: now.toISOString(),
  totals: {
    users: users.length,
    books: books.length,
    signup7,
    signup30,
    active7,
    active30,
    zeroBooks,
    oneBook,
    multiBooks,
    completedAny,
    failedAny,
    audioUsers,
    withGoogle,
    withStripe,
    withTrial,
    usedTrial,
    withBranding,
    withStyleGuide,
    withPush,
    pagesExhausted,
    pagesNearLimit,
    completionRate,
    failRate,
  },
  byPlan,
  byProvider,
  funnel,
  bookStatuses: statuses,
  topGenres: top(genres),
  topTones: top(tones),
  topAudiences: top(audiences),
  topLanguages: top(languages),
  topModels: top(models),
  targetPageBuckets,
  intentSignals: intents,
  jobs,
  audioAgg,
  gaps,
  users: cohort.sort((a, b) => a.daysSinceActive - b.daysSinceActive),
  stuckUsers: cohort.filter((u) => u.stuck).slice(0, 25),
  powerUsers: cohort
    .filter((u) => u.completed >= 1 || u.books >= 2)
    .sort((a, b) => b.completed - a.completed || b.books - a.books)
    .slice(0, 20),
  limitHitters: cohort
    .filter((u) => u.pageUtilPct >= 80)
    .sort((a, b) => b.pageUtilPct - a.pageUtilPct)
    .slice(0, 20),
};

writeFileSync("scripts/user-analysis.json", JSON.stringify(summary, null, 2));
console.log(JSON.stringify({
  totals: summary.totals,
  byPlan,
  byProvider,
  funnel,
  bookStatuses: statuses,
  topGenres: summary.topGenres,
  topLanguages: summary.topLanguages,
  targetPageBuckets,
  intentSignals: intents,
  jobs: jobs.slice(0, 20),
  audioAgg,
  gaps,
  userSample: cohort.length,
  stuckCount: summary.stuckUsers.length,
  powerCount: summary.powerUsers.length,
  limitHitters: summary.limitHitters.length,
}, null, 2));

await client.end();
