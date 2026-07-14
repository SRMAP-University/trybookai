import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/constants";
import { isTrialActive, syncUserTrialState } from "@/lib/billing";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    await syncUserTrialState(userId);

    const [user, books, jobs, chapters] = await Promise.all([
      db.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          plan: true,
          pagesUsed: true,
          pagesLimit: true,
          audioMinutesUsed: true,
          audioMinutesLimit: true,
          trialEndsAt: true,
          hasUsedPremiumTrial: true,
          createdAt: true,
        },
      }),
      db.book.findMany({
        where: { userId },
        select: {
          id: true,
          title: true,
          status: true,
          genre: true,
          currentPages: true,
          targetPages: true,
          progress: true,
          createdAt: true,
          updatedAt: true,
          completedAt: true,
          _count: { select: { chapters: true } },
        },
        orderBy: { updatedAt: "desc" },
      }),
      db.generationJob.findMany({
        where: { book: { userId } },
        include: {
          book: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      db.chapter.findMany({
        where: { book: { userId } },
        select: {
          status: true,
          pageCount: true,
          updatedAt: true,
        },
      }),
    ]);

    const statusCounts = books.reduce(
      (acc, book) => {
        acc[book.status] = (acc[book.status] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const totalPagesGenerated = books.reduce(
      (sum, book) => sum + book.currentPages,
      0
    );
    const completedBooks = books.filter((b) => b.status === "COMPLETED").length;
    const activeJobs = jobs.filter(
      (j) =>
        j.status === "RUNNING" ||
        j.status === "QUEUED" ||
        j.status === "PENDING"
    ).length;
    const failedJobs = jobs.filter((j) => j.status === "FAILED").length;
    const completedChapters = chapters.filter(
      (c) => c.status === "COMPLETED"
    ).length;

    const days = Array.from({ length: 14 }, (_, i) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (13 - i));
      return date;
    });

    const dailyActivity = days.map((day) => {
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      const dayJobs = jobs.filter((j) => {
        const created = new Date(j.createdAt);
        return created >= day && created < next;
      });
      return {
        date: day.toISOString().slice(0, 10),
        jobs: dayJobs.length,
        completed: dayJobs.filter((j) => j.status === "COMPLETED").length,
        failed: dayJobs.filter((j) => j.status === "FAILED").length,
      };
    });

    const genreBreakdown = books.reduce(
      (acc, book) => {
        const genre = book.genre ?? "Unspecified";
        acc[genre] = (acc[genre] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const planKey = user.plan as keyof typeof PLANS;
    const audioMinutesUsed = user.audioMinutesUsed ?? 0;
    const audioMinutesLimit =
      user.audioMinutesLimit ?? PLANS[planKey]?.audioMinutesLimit ?? 0;

    return NextResponse.json({
      user: {
        ...user,
        audioMinutesUsed,
        audioMinutesLimit,
        onTrial: isTrialActive(user),
      },
      summary: {
        totalBooks: books.length,
        completedBooks,
        totalPagesGenerated,
        pagesUsed: user.pagesUsed,
        pagesLimit: user.pagesLimit,
        pagesRemaining: user.pagesLimit - user.pagesUsed,
        usagePercent:
          user.pagesLimit > 0
            ? Math.round((user.pagesUsed / user.pagesLimit) * 100)
            : 0,
        audioMinutesUsed,
        audioMinutesLimit,
        audioMinutesRemaining: Math.max(
          0,
          audioMinutesLimit - audioMinutesUsed
        ),
        audioUsagePercent:
          audioMinutesLimit > 0
            ? Math.round((audioMinutesUsed / audioMinutesLimit) * 100)
            : 0,
        activeJobs,
        failedJobs,
        completedChapters,
        totalChapters: chapters.length,
        statusCounts,
        genreBreakdown,
      },
      dailyActivity,
      books,
      jobs,
    });
  } catch (error) {
    console.error("[analytics GET]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load analytics",
      },
      { status: 500 }
    );
  }
}
