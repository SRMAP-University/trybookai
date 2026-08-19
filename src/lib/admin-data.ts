import { db } from "@/lib/db";
import {
  buildProductGaps,
  scoreUser,
  troubleshootBook,
  type ImprovementGap,
  type UserInsight,
} from "@/lib/admin-insights";

export async function loadAdminOverview() {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [users, books, jobGroups, recentJobs, statusGroups, planGroups] =
    await Promise.all([
      db.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          plan: true,
          pagesUsed: true,
          pagesLimit: true,
          pagesBonus: true,
          audioMinutesUsed: true,
          stripeCustomerId: true,
          stripeSubId: true,
          trialEndsAt: true,
          hasUsedPremiumTrial: true,
          createdAt: true,
          updatedAt: true,
          brandName: true,
          authorName: true,
          countryCode: true,
          _count: { select: { pushTokens: true, books: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      db.book.findMany({
        select: {
          id: true,
          userId: true,
          title: true,
          status: true,
          progress: true,
          currentPages: true,
          targetPages: true,
          coverImage: true,
          errorMessage: true,
          updatedAt: true,
          completedAt: true,
          createdAt: true,
          createdVia: true,
          generateAudiobookOnComplete: true,
          genre: true,
          _count: { select: { chapters: true, generationJobs: true } },
        },
      }),
      db.generationJob.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      db.generationJob.findMany({
        where: { createdAt: { gte: weekAgo } },
        select: {
          status: true,
          createdAt: true,
          completedAt: true,
          error: true,
          payload: true,
        },
      }),
      db.book.groupBy({ by: ["status"], _count: { _all: true } }),
      db.user.groupBy({ by: ["plan"], _count: { _all: true } }),
    ]);

  const bookIds = books.map((b) => b.id);
  const [failedJobCounts, audioCounts, chapterDoneCounts] = await Promise.all([
    bookIds.length
      ? db.generationJob.groupBy({
          by: ["bookId"],
          where: { bookId: { in: bookIds }, status: "FAILED" },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    bookIds.length
      ? db.bookAudio.groupBy({
          by: ["bookId", "status"],
          where: { bookId: { in: bookIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    bookIds.length
      ? db.chapter.groupBy({
          by: ["bookId"],
          where: { bookId: { in: bookIds }, status: "COMPLETED" },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const failedByBook = Object.fromEntries(
    failedJobCounts.map((r) => [r.bookId, r._count._all])
  );
  const chaptersDoneByBook = Object.fromEntries(
    chapterDoneCounts.map((r) => [r.bookId, r._count._all])
  );
  const audioByBook: Record<string, { total: number; done: number }> = {};
  for (const row of audioCounts) {
    const cur = audioByBook[row.bookId] ?? { total: 0, done: 0 };
    cur.total += row._count._all;
    if (row.status === "COMPLETED") cur.done += row._count._all;
    audioByBook[row.bookId] = cur;
  }

  const enrichedBooks = books.map((b) => ({
    userId: b.userId,
    id: b.id,
    status: b.status,
    progress: b.progress,
    currentPages: b.currentPages,
    targetPages: b.targetPages,
    coverImage: b.coverImage,
    errorMessage: b.errorMessage,
    updatedAt: b.updatedAt,
    completedAt: b.completedAt,
    createdAt: b.createdAt,
    generateAudiobookOnComplete: b.generateAudiobookOnComplete,
    jobsFailed: failedByBook[b.id] ?? 0,
    jobsTotal: b._count.generationJobs,
    audioDone: audioByBook[b.id]?.done ?? 0,
    audioTotal: audioByBook[b.id]?.total ?? 0,
    chaptersDone: chaptersDoneByBook[b.id] ?? 0,
    chapterCount: b._count.chapters,
  }));
  const booksByUser: Record<string, typeof enrichedBooks> = {};
  for (const b of enrichedBooks) {
    (booksByUser[b.userId] ||= []).push(b);
  }

  const insights: UserInsight[] = users.map((u) =>
    scoreUser(
      {
        id: u.id,
        email: u.email,
        name: u.name,
        plan: u.plan,
        pagesUsed: u.pagesUsed,
        pagesLimit: u.pagesLimit,
        pagesBonus: u.pagesBonus,
        audioMinutesUsed: u.audioMinutesUsed,
        stripeCustomerId: u.stripeCustomerId,
        stripeSubId: u.stripeSubId,
        trialEndsAt: u.trialEndsAt,
        hasUsedPremiumTrial: u.hasUsedPremiumTrial,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        brandName: u.brandName,
        authorName: u.authorName,
        pushTokens: u._count.pushTokens,
      },
      booksByUser[u.id] ?? [],
      now
    )
  );

  const sentiment = {
    delighted: insights.filter((i) => i.label === "delighted").length,
    happy: insights.filter((i) => i.label === "happy").length,
    neutral: insights.filter((i) => i.label === "neutral").length,
    frustrated: insights.filter((i) => i.label === "frustrated").length,
    churning: insights.filter((i) => i.label === "churning").length,
  };

  const completedBooks = books.filter((b) => b.status === "COMPLETED").length;
  const failedBooks = books.filter((b) => b.status === "FAILED").length;
  const completionRate =
    books.length > 0 ? Math.round((100 * completedBooks) / books.length) : 0;
  const failRate =
    books.length > 0 ? Math.round((100 * failedBooks) / books.length) : 0;

  const gaps: ImprovementGap[] = buildProductGaps({
    users: users.length,
    zeroBooks: insights.filter((i) => i.books === 0).length,
    completionRate,
    failRate,
    books: books.length,
    audioUsers: insights.filter((i) =>
      (booksByUser[i.userId] ?? []).some((b) => b.audioDone > 0)
    ).length,
    completedUsers: insights.filter((i) => i.completed > 0).length,
    pagesExhausted: insights.filter((i) => i.pagesLimit > 0 && i.pagesUsed >= i.pagesLimit)
      .length,
    pagesNearLimit: insights.filter(
      (i) =>
        i.pagesLimit > 0 &&
        i.pagesUsed / i.pagesLimit >= 0.85 &&
        i.pagesUsed < i.pagesLimit
    ).length,
    brandingUsers: users.filter((u) => u.brandName || u.authorName).length,
    frustratedUsers: sentiment.frustrated,
    churningUsers: sentiment.churning,
    missingCovers: books.filter((b) => b.status === "COMPLETED" && !b.coverImage)
      .length,
  });

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (13 - i));
    return d;
  });

  const daily = days.map((day) => {
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const dayJobs = recentJobs.filter(
      (j) => j.createdAt >= day && j.createdAt < next
    );
    const daySignups = users.filter(
      (u) => u.createdAt >= day && u.createdAt < next
    ).length;
    const dayBooks = books.filter(
      (b) => b.createdAt >= day && b.createdAt < next
    );
    const dayBooksApp = dayBooks.filter((b) =>
      isAppCreatedVia(b.createdVia)
    ).length;
    const dayBooksWeb = dayBooks.filter((b) => b.createdVia === "web").length;
    return {
      date: day.toISOString().slice(0, 10),
      jobs: dayJobs.length,
      completed: dayJobs.filter((j) => j.status === "COMPLETED").length,
      failed: dayJobs.filter((j) => j.status === "FAILED").length,
      signups: daySignups,
      books: dayBooks.length,
      booksApp: dayBooksApp,
      booksWeb: dayBooksWeb,
    };
  });

  const createdViaAll = countCreatedVia(books.map((b) => b.createdVia));
  const createdVia7d = countCreatedVia(
    books.filter((b) => b.createdAt >= weekAgo).map((b) => b.createdVia)
  );
  const jobsByClient7d = countJobClients(recentJobs);
  const appBooks = createdViaAll.ios + createdViaAll.android + createdViaAll.unknown;
  const webBooks = createdViaAll.web;
  const appBooks7d =
    createdVia7d.ios + createdVia7d.android + createdVia7d.unknown;
  const webBooks7d = createdVia7d.web;
  const appJobs7d =
    jobsByClient7d.ios + jobsByClient7d.android + jobsByClient7d.unknown;
  const webJobs7d = jobsByClient7d.web;

  const atRisk = [...insights]
    .filter((i) => i.label === "frustrated" || i.label === "churning" || i.stuck)
    .sort((a, b) => a.score - b.score)
    .slice(0, 20)
    .map((i) => ({
      ...i,
      countryCode:
        users.find((u) => u.id === i.userId)?.countryCode ?? null,
    }));

  const champions = [...insights]
    .filter((i) => i.label === "delighted" || i.label === "happy")
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((i) => ({
      ...i,
      countryCode:
        users.find((u) => u.id === i.userId)?.countryCode ?? null,
    }));

  return {
    summary: {
      users: users.length,
      books: books.length,
      completedBooks,
      failedBooks,
      activeJobs:
        jobGroups
          .filter((g) => ["PENDING", "QUEUED", "RUNNING"].includes(g.status))
          .reduce((s, g) => s + g._count._all, 0) ?? 0,
      signups24h: users.filter((u) => u.createdAt >= dayAgo).length,
      signups7d: users.filter((u) => u.createdAt >= weekAgo).length,
      completionRate,
      failRate,
      avgScore: insights.length
        ? Math.round(
            insights.reduce((s, i) => s + i.score, 0) / insights.length
          )
        : 0,
      appBooks,
      webBooks,
      appBooks7d,
      webBooks7d,
      appJobs7d,
      webJobs7d,
    },
    clients: {
      booksAll: createdViaAll,
      books7d: createdVia7d,
      jobs7d: jobsByClient7d,
    },
    sentiment,
    gaps,
    daily,
    bookStatus: Object.fromEntries(
      statusGroups.map((g) => [g.status, g._count._all])
    ),
    plans: Object.fromEntries(planGroups.map((g) => [g.plan, g._count._all])),
    jobStatus: Object.fromEntries(
      jobGroups.map((g) => [g.status, g._count._all])
    ),
    atRisk,
    champions,
    topImprovements: topImprovements(insights, gaps),
  };
}

type ClientCounts = {
  ios: number;
  android: number;
  web: number;
  unknown: number;
};

function emptyClientCounts(): ClientCounts {
  return { ios: 0, android: 0, web: 0, unknown: 0 };
}

function isAppCreatedVia(via: string | null | undefined): boolean {
  return via === "ios" || via === "android" || via === "unknown";
}

function countCreatedVia(values: Array<string | null | undefined>): ClientCounts {
  const counts = emptyClientCounts();
  for (const v of values) {
    if (v === "ios") counts.ios += 1;
    else if (v === "android") counts.android += 1;
    else if (v === "unknown") counts.unknown += 1;
    else counts.web += 1;
  }
  return counts;
}

function countJobClients(
  jobs: Array<{ payload: unknown }>
): ClientCounts {
  const counts = emptyClientCounts();
  for (const job of jobs) {
    const payload =
      job.payload && typeof job.payload === "object"
        ? (job.payload as Record<string, unknown>)
        : null;
    const client = typeof payload?.client === "string" ? payload.client : null;
    if (client === "ios") counts.ios += 1;
    else if (client === "android") counts.android += 1;
    else if (client === "unknown") counts.unknown += 1;
    else if (client === "web") counts.web += 1;
    else counts.web += 1; // legacy jobs without client → treat as web
  }
  return counts;
}

function topImprovements(insights: UserInsight[], gaps: ImprovementGap[]) {
  const counts = new Map<string, number>();
  for (const i of insights) {
    for (const tip of i.improvements) {
      counts.set(tip, (counts.get(tip) ?? 0) + 1);
    }
  }
  const fromUsers = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([text, count]) => ({ text, count, source: "users" as const }));
  const fromGaps = gaps.map((g) => ({
    text: `${g.area}: ${g.opportunity}`,
    count: g.severity === "high" ? 99 : g.severity === "medium" ? 50 : 20,
    source: "product" as const,
  }));
  return [...fromGaps, ...fromUsers].slice(0, 12);
}

export async function loadAdminUsers(q?: string) {
  const query = q?.trim() || undefined;
  const countryFilter =
    query && /^[A-Za-z]{2}$/.test(query) ? query.toUpperCase() : undefined;

  const users = await db.user.findMany({
    where: query
      ? {
          OR: [
            { email: { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
            ...(countryFilter ? [{ countryCode: countryFilter }] : []),
          ],
        }
      : undefined,
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      pagesUsed: true,
      pagesLimit: true,
      pagesBonus: true,
      audioMinutesUsed: true,
      audioMinutesLimit: true,
      stripeCustomerId: true,
      stripeSubId: true,
      trialEndsAt: true,
      hasUsedPremiumTrial: true,
      createdAt: true,
      updatedAt: true,
      brandName: true,
      authorName: true,
      countryCode: true,
      _count: { select: { books: true, pushTokens: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const userIds = users.map((u) => u.id);
  const books = userIds.length
    ? await db.book.findMany({
        where: { userId: { in: userIds } },
        select: {
          id: true,
          userId: true,
          status: true,
          progress: true,
          currentPages: true,
          targetPages: true,
          coverImage: true,
          errorMessage: true,
          updatedAt: true,
          completedAt: true,
          createdAt: true,
          generateAudiobookOnComplete: true,
          _count: { select: { chapters: true, generationJobs: true } },
        },
      })
    : [];

  const bookIds = books.map((b) => b.id);
  const [failedJobCounts, audioCounts, chapterDoneCounts] = await Promise.all([
    bookIds.length
      ? db.generationJob.groupBy({
          by: ["bookId"],
          where: { bookId: { in: bookIds }, status: "FAILED" },
          _count: { _all: true },
        })
      : [],
    bookIds.length
      ? db.bookAudio.groupBy({
          by: ["bookId", "status"],
          where: { bookId: { in: bookIds } },
          _count: { _all: true },
        })
      : [],
    bookIds.length
      ? db.chapter.groupBy({
          by: ["bookId"],
          where: { bookId: { in: bookIds }, status: "COMPLETED" },
          _count: { _all: true },
        })
      : [],
  ]);

  const failedByBook = Object.fromEntries(
    failedJobCounts.map((r) => [r.bookId, r._count._all])
  );
  const chaptersDoneByBook = Object.fromEntries(
    chapterDoneCounts.map((r) => [r.bookId, r._count._all])
  );
  const audioByBook: Record<string, { total: number; done: number }> = {};
  for (const row of audioCounts) {
    const cur = audioByBook[row.bookId] ?? { total: 0, done: 0 };
    cur.total += row._count._all;
    if (row.status === "COMPLETED") cur.done += row._count._all;
    audioByBook[row.bookId] = cur;
  }

  const booksByUser: Record<
    string,
    Array<{
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
    }>
  > = {};
  for (const b of books) {
    (booksByUser[b.userId] ||= []).push({
      id: b.id,
      status: b.status,
      progress: b.progress,
      currentPages: b.currentPages,
      targetPages: b.targetPages,
      coverImage: b.coverImage,
      errorMessage: b.errorMessage,
      updatedAt: b.updatedAt,
      completedAt: b.completedAt,
      createdAt: b.createdAt,
      generateAudiobookOnComplete: b.generateAudiobookOnComplete,
      jobsFailed: failedByBook[b.id] ?? 0,
      jobsTotal: b._count.generationJobs,
      audioDone: audioByBook[b.id]?.done ?? 0,
      audioTotal: audioByBook[b.id]?.total ?? 0,
      chaptersDone: chaptersDoneByBook[b.id] ?? 0,
      chapterCount: b._count.chapters,
    });
  }

  return users.map((u) => {
    const insight = scoreUser(
      {
        id: u.id,
        email: u.email,
        name: u.name,
        plan: u.plan,
        pagesUsed: u.pagesUsed,
        pagesLimit: u.pagesLimit,
        pagesBonus: u.pagesBonus,
        audioMinutesUsed: u.audioMinutesUsed,
        stripeCustomerId: u.stripeCustomerId,
        stripeSubId: u.stripeSubId,
        trialEndsAt: u.trialEndsAt,
        hasUsedPremiumTrial: u.hasUsedPremiumTrial,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        brandName: u.brandName,
        authorName: u.authorName,
        pushTokens: u._count.pushTokens,
      },
      booksByUser[u.id] ?? []
    );
    return {
      ...insight,
      audioMinutesUsed: u.audioMinutesUsed,
      audioMinutesLimit: u.audioMinutesLimit,
      hasSub: Boolean(u.stripeSubId),
      countryCode: u.countryCode,
    };
  });
}

export async function loadAdminBooks() {
  const books = await db.book.findMany({
    select: {
      id: true,
      title: true,
      status: true,
      progress: true,
      currentPages: true,
      targetPages: true,
      coverImage: true,
      errorMessage: true,
      genre: true,
      model: true,
      updatedAt: true,
      createdAt: true,
      completedAt: true,
      user: { select: { id: true, email: true, name: true, plan: true } },
      _count: { select: { chapters: true, generationJobs: true } },
      generationJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, error: true, attempts: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 150,
  });

  return books.map((b) => {
    const lastJob = b.generationJobs[0];
    const quick = troubleshootBook({
      status: b.status,
      progress: b.progress,
      currentPages: b.currentPages,
      targetPages: b.targetPages,
      coverImage: b.coverImage,
      errorMessage: b.errorMessage,
      updatedAt: b.updatedAt,
      completedAt: b.completedAt,
      chapterCount: b._count.chapters,
      chaptersDone: 0,
      sectionsTotal: 0,
      sectionsWithContent: 0,
      jobs: lastJob
        ? [
            {
              status: lastJob.status,
              error: lastJob.error,
              attempts: lastJob.attempts,
              maxAttempts: 3,
              createdAt: b.updatedAt,
              startedAt: null,
              completedAt: null,
              payload: null,
            },
          ]
        : [],
      audios: [],
    });
    const top = quick.find((i) => i.severity !== "ok") ?? quick[0];
    return {
      id: b.id,
      title: b.title,
      status: b.status,
      progress: b.progress,
      currentPages: b.currentPages,
      targetPages: b.targetPages,
      hasCover: Boolean(b.coverImage),
      genre: b.genre,
      model: b.model,
      updatedAt: b.updatedAt.toISOString(),
      createdAt: b.createdAt.toISOString(),
      user: b.user,
      jobs: b._count.generationJobs,
      lastJobError: lastJob?.error ?? b.errorMessage,
      trouble: top,
    };
  });
}

export async function loadBookTroubleshoot(bookId: string) {
  const book = await db.book.findUnique({
    where: { id: bookId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          plan: true,
          pagesUsed: true,
          pagesLimit: true,
        },
      },
      chapters: {
        orderBy: { number: "asc" },
        select: {
          id: true,
          number: true,
          title: true,
          status: true,
          pageCount: true,
          _count: { select: { sections: true } },
          sections: {
            select: { id: true, number: true, wordCount: true, pageCount: true },
          },
        },
      },
      generationJobs: {
        orderBy: { createdAt: "desc" },
        take: 30,
      },
      audios: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          status: true,
          progress: true,
          errorMessage: true,
          createdAt: true,
          completedAt: true,
        },
      },
      feedbacks: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          rating: true,
          sentiment: true,
          trigger: true,
          comment: true,
          createdAt: true,
        },
      },
    },
  });
  if (!book) return null;

  const sectionsTotal = book.chapters.reduce(
    (s, c) => s + c.sections.length,
    0
  );
  const sectionsWithContent = book.chapters.reduce(
    (s, c) => s + c.sections.filter((sec) => sec.wordCount > 0).length,
    0
  );
  const chaptersDone = book.chapters.filter((c) => c.status === "COMPLETED")
    .length;

  const issues = troubleshootBook({
    status: book.status,
    progress: book.progress,
    currentPages: book.currentPages,
    targetPages: book.targetPages,
    coverImage: book.coverImage,
    errorMessage: book.errorMessage,
    updatedAt: book.updatedAt,
    completedAt: book.completedAt,
    chapterCount: book.chapters.length,
    chaptersDone,
    sectionsTotal,
    sectionsWithContent,
    jobs: book.generationJobs.map((j) => ({
      status: j.status,
      error: j.error,
      attempts: j.attempts,
      maxAttempts: j.maxAttempts,
      createdAt: j.createdAt,
      startedAt: j.startedAt,
      completedAt: j.completedAt,
      payload: j.payload,
    })),
    audios: book.audios.map((a) => ({
      status: a.status,
      type: a.type,
      errorMessage: a.errorMessage,
    })),
  });

  return {
    book: {
      id: book.id,
      title: book.title,
      slug: book.slug,
      status: book.status,
      progress: book.progress,
      currentPages: book.currentPages,
      targetPages: book.targetPages,
      genre: book.genre,
      model: book.model,
      coverImage: book.coverImage,
      errorMessage: book.errorMessage,
      createdAt: book.createdAt.toISOString(),
      updatedAt: book.updatedAt.toISOString(),
      completedAt: book.completedAt?.toISOString() ?? null,
      user: book.user,
    },
    issues,
    chapters: book.chapters.map((c) => ({
      id: c.id,
      number: c.number,
      title: c.title,
      status: c.status,
      pageCount: c.pageCount,
      sections: c.sections.length,
      sectionsDone: c.sections.filter((s) => s.wordCount > 0).length,
    })),
    jobs: book.generationJobs.map((j) => ({
      id: j.id,
      type: j.type,
      status: j.status,
      error: j.error,
      attempts: j.attempts,
      maxAttempts: j.maxAttempts,
      priority: j.priority,
      payload: j.payload,
      startedAt: j.startedAt?.toISOString() ?? null,
      completedAt: j.completedAt?.toISOString() ?? null,
      createdAt: j.createdAt.toISOString(),
      durationSec:
        j.startedAt && j.completedAt
          ? Math.round(
              (j.completedAt.getTime() - j.startedAt.getTime()) / 1000
            )
          : null,
    })),
    audios: book.audios.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
      completedAt: a.completedAt?.toISOString() ?? null,
    })),
    feedbacks: book.feedbacks.map((f) => ({
      ...f,
      createdAt: f.createdAt.toISOString(),
    })),
    stats: {
      sectionsTotal,
      sectionsWithContent,
      chaptersDone,
      chapterCount: book.chapters.length,
    },
  };
}
