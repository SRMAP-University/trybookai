import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { genreToSlug, getAppUrl } from "@/lib/book-public";
import { BookCover } from "@/components/dashboard/book-cover";
import { BookAudioPanel } from "@/components/dashboard/book-audio-panel";
import type { BookAudioItem } from "@/components/dashboard/book-audio-panel";
import { ExpandableDescription } from "@/components/ui/expandable-description";
import { BookManuscript } from "@/components/book/book-manuscript";
import { ListenButton, ReadingProgress } from "@/components/book/reading-progress";
import { readingSerif, serifDisplay } from "@/components/marketing/home/fonts";
import { ArrowRight, BookOpen, ChevronDown, Headphones } from "lucide-react";
import { isNarrativeBook } from "@/lib/book-generator/core/format";
import { countWords, readingTime } from "@/lib/reading-stats";
import { cn } from "@/lib/utils";
import { JsonLd } from "@/components/seo/json-ld";
import { bookJsonLd, breadcrumbJsonLd, truncateForMeta } from "@/lib/seo";
import { parseMusicScore } from "@/lib/audio-generator/score-types";

type Props = { params: Promise<{ slug: string }> };

const getPublicBook = cache(async function getPublicBook(slug: string) {
  return db.book.findFirst({
    where: { slug, isPublic: true },
    include: {
      chapters: {
        orderBy: { number: "asc" },
        select: {
          number: true,
          title: true,
          summary: true,
          pageCount: true,
          status: true,
          imageUrl: true,
          sections: {
            orderBy: { number: "asc" },
            select: {
              number: true,
              title: true,
              content: true,
              pageCount: true,
              wordCount: true,
            },
          },
        },
      },
      audios: {
        where: { status: "COMPLETED" },
        orderBy: { createdAt: "desc" },
        include: {
          tracks: { orderBy: { number: "asc" } },
        },
      },
      user: {
        select: {
          name: true,
          authorName: true,
          brandName: true,
          brandTagline: true,
          websiteUrl: true,
        },
      },
    },
  });
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const book = await getPublicBook(slug);
  if (!book) {
    return { title: "Book not found", robots: { index: false, follow: false } };
  }

  const author =
    book.user.authorName ||
    book.user.brandName ||
    book.user.name ||
    "BookAI author";
  const description = book.description
    ? truncateForMeta(book.description)
    : `Read ${book.title}, an AI-generated ${book.genre ?? "book"} by ${author} on BookAI.`;
  // A book with no finished chapters renders only a placeholder — thin content.
  const hasReadableChapters = book.chapters.some((c) => c.status === "COMPLETED");
  const url = `${getAppUrl()}/books/${book.slug}`;
  const coverUrl = book.coverImage
    ? `${getAppUrl()}/api/books/cover/${book.slug}`
    : `${getAppUrl()}/books/${book.slug}/opengraph-image`;

  return {
    title: `${book.title} by ${author}`,
    description,
    authors: [{ name: author }],
    keywords: [
      book.title,
      author,
      book.genre ?? "AI book",
      "AI generated book",
      "read online",
    ],
    alternates: { canonical: url },
    openGraph: {
      title: book.title,
      description,
      url,
      type: "book",
      authors: [author],
      images: [{ url: coverUrl, width: 512, height: 768, alt: `${book.title} cover` }],
    },
    twitter: {
      card: "summary_large_image",
      title: book.title,
      description,
      images: [coverUrl],
    },
    robots: hasReadableChapters
      ? { index: true, follow: true }
      : { index: false, follow: true },
  };
}

const AUDIO_LABELS: Record<string, string> = {
  AUDIOBOOK: "Audiobook",
  PODCAST: "Podcast",
  MUSIC: "Theme music",
  SONG: "Song",
};

/** True when a section's text opens with its own markdown heading. */
function startsWithHeading(content: string | null): boolean {
  return /^\s*#{1,6}\s/.test(content ?? "");
}

export default async function PublicBookPage({ params }: Props) {
  const { slug } = await params;
  const book = await getPublicBook(slug);
  if (!book) notFound();

  const author =
    book.user.authorName ||
    book.user.brandName ||
    book.user.name ||
    "BookAI author";
  const url = `${getAppUrl()}/books/${book.slug}`;
  const completedChapters = book.chapters.filter(
    (c) => c.status === "COMPLETED"
  );
  // Novels read as continuous prose: their section titles are internal, so
  // sections are separated by a scene break instead of a heading.
  const narrative = isNarrativeBook(book);
  const chapterWords = new Map(
    book.chapters.map((c) => [
      c.number,
      c.sections.reduce((sum, s) => sum + countWords(s.content), 0),
    ])
  );
  const totalWords = completedChapters.reduce(
    (sum, c) => sum + (chapterWords.get(c.number) ?? 0),
    0
  );
  const firstChapter = completedChapters[0];
  const audioTypes = [...new Set(book.audios.map((a) => AUDIO_LABELS[a.type] ?? "Audio"))];

  const coverUrl = book.coverImage
    ? `${getAppUrl()}/api/books/cover/${book.slug}`
    : undefined;
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Public books", path: "/books" },
    ...(book.genre
      ? [{ name: book.genre, path: `/books/genre/${genreToSlug(book.genre)}` }]
      : []),
    { name: book.title, path: `/books/${book.slug}` },
  ];

  const actions = (
    <>
      {firstChapter && (
        <a
          href={`/books/${book.slug}/read`}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-[#0a2540] px-5 text-[14px] font-medium text-white transition-colors hover:bg-[#1a3a5c]"
        >
          <BookOpen className="h-4 w-4" />
          Read the book
        </a>
      )}
      {book.audios.length > 0 && (
        <ListenButton
          targetId="listen"
          className="inline-flex h-10 items-center gap-2 rounded-full border border-[#e6ebf1] px-5 text-[14px] font-medium text-[#0a2540] transition-colors hover:border-[#c9c5ff] hover:text-[#635bff]"
        />
      )}
    </>
  );

  return (
    <>
      <JsonLd
        data={bookJsonLd({
          title: book.title,
          description: book.description,
          genre: book.genre,
          language: book.language,
          url,
          slug: book.slug,
          coverUrl,
          pageCount: book.currentPages,
          author,
          authorUrl: book.user.websiteUrl,
          publisher: book.user.brandName || "BookAI",
          datePublished: book.createdAt.toISOString(),
          dateModified: book.updatedAt.toISOString(),
        })}
      />
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <Navbar />
      {completedChapters.length > 0 && <ReadingProgress targetId="book-text" />}
      <main className="min-h-screen bg-white pt-[72px]">
        <article className="mx-auto max-w-[720px] px-5 py-10 sm:px-6 sm:py-14">
          <nav aria-label="Breadcrumb" className="mb-8 truncate text-[13px] text-[#697386]">
            <Link href="/books" className="hover:text-[#635bff]">
              Public books
            </Link>
            {book.genre ? (
              <>
                <span className="mx-2">/</span>
                <Link
                  href={`/books/genre/${genreToSlug(book.genre)}`}
                  className="hover:text-[#635bff]"
                >
                  {book.genre}
                </Link>
              </>
            ) : null}
          </nav>

          <header className="flex items-start gap-5 sm:gap-8">
            <BookCover
              title={book.title}
              coverImage={book.coverImage}
              aspect="card"
              className="w-[104px] shrink-0 sm:w-[200px]"
            />
            <div className="min-w-0 flex-1">
              {book.genre && (
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#635bff]">
                  {book.genre}
                </p>
              )}
              <h1
                className={cn(
                  serifDisplay.className,
                  "mt-1 text-balance text-[32px] leading-[1.05] text-[#0a2540] sm:text-[48px]"
                )}
              >
                {book.title}
              </h1>
              <p className="mt-2 text-[15px] text-[#425466]">
                by <span className="font-medium text-[#0a2540]">{author}</span>
              </p>
              <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-[#697386]">
                {completedChapters.length > 0 && (
                  <span>
                    {completedChapters.length} {completedChapters.length === 1 ? "chapter" : "chapters"}
                  </span>
                )}
                {totalWords > 0 && <span>{readingTime(totalWords)} read</span>}
                {book.audios.length > 0 && <span>Audio available</span>}
              </p>
              <div className="mt-5 hidden flex-wrap gap-2 sm:flex">{actions}</div>
            </div>
          </header>
          <div className="mt-5 flex flex-wrap gap-2 sm:hidden">{actions}</div>

          {book.description && (
            <ExpandableDescription
              text={book.description}
              previewChars={280}
              className="mt-8 text-[16px] leading-relaxed text-[#425466]"
            />
          )}

          {book.chapters.length > 0 && (
            <nav
              id="contents"
              aria-label="Contents"
              className="mt-10 scroll-mt-24 rounded-2xl border border-[#e6ebf1] bg-[#f8fafc] px-5 py-4 sm:px-6"
            >
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#697386]">
                Contents
              </h2>
              <ol className="mt-1 divide-y divide-[#e6ebf1]">
                {book.chapters.map((chapter) => {
                  const done = chapter.status === "COMPLETED";
                  const row = (
                    <>
                      <span className="w-6 shrink-0 tabular-nums text-[13px] text-[#a3acb9]">
                        {chapter.number}
                      </span>
                      <span className="min-w-0 flex-1 text-[15px] text-[#0a2540] group-hover:text-[#635bff]">
                        {chapter.title}
                      </span>
                      <span className="shrink-0 text-[12px] tabular-nums text-[#697386]">
                        {done ? readingTime(chapterWords.get(chapter.number) ?? 0) : "Coming soon"}
                      </span>
                    </>
                  );
                  return (
                    <li key={chapter.number}>
                      {done ? (
                        <a
                          href={`#chapter-${chapter.number}`}
                          className="group flex items-baseline gap-3 py-2.5"
                        >
                          {row}
                        </a>
                      ) : (
                        <div className="flex items-baseline gap-3 py-2.5 opacity-60">{row}</div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}

          {book.audios.length > 0 && (
            <details id="listen" className="group mt-4 scroll-mt-24 rounded-2xl border border-[#e6ebf1]">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 sm:px-6 [&::-webkit-details-marker]:hidden">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f0efff] text-[#635bff]">
                  <Headphones className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-[#0a2540]">
                    Listen to this book
                  </span>
                  <span className="block text-[13px] text-[#697386]">{audioTypes.join(" · ")}</span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-[#697386] transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-[#e6ebf1] px-3 py-4 sm:px-5">
                <BookAudioPanel
                  readOnly
                  audios={book.audios.map(
                    (audio): BookAudioItem => ({
                      id: audio.id,
                      type: audio.type,
                      status: audio.status,
                      progress: audio.progress,
                      title: audio.title,
                      voiceName: audio.voiceName,
                      audioUrl: audio.audioUrl,
                      errorMessage: audio.errorMessage,
                      // Only the music score is public; voice settings stay server-side.
                      voiceSettings: { music: parseMusicScore(audio.voiceSettings) },
                      tracks: audio.tracks.map((t) => ({
                        id: t.id,
                        number: t.number,
                        title: t.title,
                        audioUrl: t.audioUrl,
                        durationMs: t.durationMs,
                      })),
                    })
                  )}
                />
              </div>
            </details>
          )}

          {completedChapters.length > 0 ? (
            <div
              id="book-text"
              className={cn(readingSerif.className, serifDisplay.variable, "mt-16")}
            >
              {completedChapters.map((chapter, index) => {
                const next = completedChapters[index + 1];
                return (
                  <section
                    key={chapter.number}
                    id={`chapter-${chapter.number}`}
                    className="scroll-mt-24 border-t border-[#e6ebf1] pb-4 pt-16 first:border-t-0 first:pt-0"
                  >
                    {chapter.imageUrl && (
                      <figure className="-mx-5 mb-10 sm:-mx-6 lg:-mx-12">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={chapter.imageUrl}
                          alt={`Chapter ${chapter.number} illustration`}
                          loading={index === 0 ? "eager" : "lazy"}
                          className="aspect-[3/2] w-full bg-[#eef2f7] object-cover sm:rounded-2xl"
                        />
                      </figure>
                    )}
                    <header className="mb-10 text-center">
                      <p className="font-sans text-[12px] font-semibold uppercase tracking-[0.18em] text-[#635bff]">
                        Chapter {chapter.number}
                      </p>
                      <h2
                        className={cn(
                          serifDisplay.className,
                          "mt-3 text-balance text-[30px] leading-tight text-[#0a2540] sm:text-[40px]"
                        )}
                      >
                        {chapter.title}
                      </h2>
                    </header>

                    {chapter.sections.map((section, sectionIndex) => (
                      <div key={section.number}>
                        {narrative && sectionIndex > 0 && (
                          <p
                            aria-hidden
                            className="my-10 text-center text-[16px] tracking-[0.6em] text-[#a3acb9]"
                          >
                            * * *
                          </p>
                        )}
                        {!narrative && section.title && !startsWithHeading(section.content) && (
                          <h3
                            className={cn(
                              "mb-4 font-sans text-[21px] font-semibold tracking-[-0.01em] text-[#0a2540]",
                              sectionIndex > 0 && "mt-12"
                            )}
                          >
                            {section.title}
                          </h3>
                        )}
                        <BookManuscript
                          variant="reader"
                          dropCap={narrative && sectionIndex === 0}
                          genre={book.genre}
                          templateId={book.templateId}
                          content={section.content || ""}
                        />
                      </div>
                    ))}

                    <div className="mt-14 flex flex-wrap items-center justify-between gap-3 font-sans text-[14px]">
                      <a href="#contents" className="text-[#697386] hover:text-[#0a2540]">
                        Contents
                      </a>
                      {next ? (
                        <a
                          href={`#chapter-${next.number}`}
                          className="inline-flex max-w-full items-center gap-2 rounded-full border border-[#e6ebf1] px-4 py-2 font-medium text-[#0a2540] transition-colors hover:border-[#c9c5ff] hover:text-[#635bff]"
                        >
                          <span className="truncate">Next: {next.title}</span>
                          <ArrowRight className="h-4 w-4 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-[#697386]">The end</span>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="mt-12 rounded-lg border border-dashed border-[#e6ebf1] px-6 py-10 text-center text-[14px] text-[#697386]">
              This book is still being written. Check back soon for chapters.
            </div>
          )}

          <footer className="mt-16 border-t border-[#e6ebf1] pt-8 text-[13px] text-[#697386]">
            Generated with{" "}
            <Link href="/" className="text-[#635bff] hover:underline">
              BookAI
            </Link>
            . Want to publish your own?{" "}
            <Link href="/register" className="text-[#635bff] hover:underline">
              Create a free account
            </Link>
            .
          </footer>
        </article>
      </main>
      <Footer />
    </>
  );
}
