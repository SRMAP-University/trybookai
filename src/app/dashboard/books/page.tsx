import Link from "next/link";
import { BookOpen, Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { AnimatedBookGrid } from "@/components/dashboard/animated-book-grid";
import { AnonymousRouteFallback } from "@/components/dashboard/anonymous-route-fallback";
import { AUDIO_STUDIO_GENRE } from "@/lib/audio-studio";
import { SONG_STUDIO_GENRE } from "@/lib/song-studio";

const TITLE = "Your books";
const DESCRIPTION = "Every book you’ve generated, newest first.";

export default async function BooksPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return (
      <AnonymousRouteFallback title={TITLE} description={DESCRIPTION}>
        {null}
      </AnonymousRouteFallback>
    );
  }

  // Same scope as the dashboard: writing projects, not studio drafts.
  const books = await db.book.findMany({
    where: {
      userId: session.user.id,
      NOT: { genre: { in: [AUDIO_STUDIO_GENRE, SONG_STUDIO_GENRE] } },
    },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { chapters: true } } },
  });
  const completed = books.filter((b) => b.status === "COMPLETED").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#0a2540]">
            {TITLE}
          </h1>
          <p className="mt-1 text-[14px] text-[#697386]">
            {books.length === 0
              ? DESCRIPTION
              : `${books.length} book${books.length === 1 ? "" : "s"} · ${completed} completed`}
          </p>
        </div>
        <Button
          className="h-9 rounded-md bg-[#635bff] text-[13px] hover:bg-[#5851e5]"
          asChild
        >
          <Link href="/dashboard/books/new">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New book
          </Link>
        </Button>
      </div>

      {books.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#e6ebf1] px-6 py-14 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#f0efff] text-[#635bff]">
            <BookOpen className="h-5 w-5" />
          </div>
          <p className="mt-4 text-[15px] font-medium text-[#0a2540]">
            No books generated yet
          </p>
          <p className="mt-1 text-[14px] text-[#697386]">
            Your first book will show up here as soon as it starts writing.
          </p>
        </div>
      ) : (
        <AnimatedBookGrid books={books} />
      )}
    </div>
  );
}
