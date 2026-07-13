import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { getAppUrl } from "@/lib/book-public";
import { BookCover } from "@/components/dashboard/book-cover";
import { BookAudioPanel } from "@/components/dashboard/book-audio-panel";
import type { BookAudioItem } from "@/components/dashboard/book-audio-panel";

type Props = { params: Promise<{ slug: string }> };

async function getPublicBook(slug: string) {
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
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const book = await getPublicBook(slug);
  if (!book) {
    return { title: "Book not found — BookAI", robots: { index: false } };
  }

  const author =
    book.user.authorName ||
    book.user.brandName ||
    book.user.name ||
    "BookAI author";
  const description =
    book.description?.slice(0, 160) ||
    `${book.title} — an AI-generated ${book.genre ?? "book"} by ${author} on BookAI.`;
  const url = `${getAppUrl()}/books/${book.slug}`;
  const coverUrl = book.coverImage
    ? `${getAppUrl()}/api/books/cover/${book.slug}`
    : undefined;

  return {
    title: `${book.title} — BookAI`,
    description,
    authors: [{ name: author }],
    alternates: { canonical: url },
    openGraph: {
      title: book.title,
      description,
      url,
      type: "book",
      authors: [author],
      ...(coverUrl ? { images: [{ url: coverUrl, width: 512, height: 768 }] } : {}),
    },
    twitter: {
      card: coverUrl ? "summary_large_image" : "summary",
      title: book.title,
      description,
      ...(coverUrl ? { images: [coverUrl] } : {}),
    },
    robots: { index: true, follow: true },
  };
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

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Book",
    name: book.title,
    description: book.description ?? undefined,
    genre: book.genre ?? undefined,
    inLanguage: book.language,
    url,
    identifier: book.slug,
    ...(book.coverImage
      ? { image: `${getAppUrl()}/api/books/cover/${book.slug}` }
      : {}),
    numberOfPages: book.currentPages || undefined,
    author: {
      "@type": "Person",
      name: author,
      url: book.user.websiteUrl || undefined,
    },
    publisher: {
      "@type": "Organization",
      name: book.user.brandName || "BookAI",
    },
    dateModified: book.updatedAt.toISOString(),
    datePublished: book.createdAt.toISOString(),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar />
      <main className="min-h-screen bg-white pt-[72px]">
        <article className="mx-auto max-w-[720px] px-6 py-14">
          <nav className="mb-8 text-[13px] text-[#697386]">
            <Link href="/books" className="hover:text-[#635bff]">
              Public books
            </Link>
            <span className="mx-2">/</span>
            <span className="text-[#0a2540]">{book.title}</span>
          </nav>

          <header className="flex flex-col gap-8 sm:flex-row sm:items-start">
            <BookCover
              title={book.title}
              coverImage={book.coverImage}
              aspect="detail"
              className="shrink-0"
            />
            <div className="min-w-0 flex-1">
            <p className="font-mono text-[12px] text-[#a3acb9]">
              ID · {book.slug}
            </p>
            <h1 className="mt-2 text-[36px] font-semibold tracking-[-0.04em] text-[#0a2540]">
              {book.title}
            </h1>
            <p className="mt-3 text-[15px] text-[#425466]">
              By {author}
              {book.genre ? ` · ${book.genre}` : ""}
              {book.tone ? ` · ${book.tone}` : ""}
              {` · ${book.currentPages} pages`}
            </p>
            {book.description && (
              <p className="mt-6 text-[16px] leading-relaxed text-[#425466]">
                {book.description}
              </p>
            )}
            </div>
          </header>

          {book.audios.length > 0 && (
            <section className="mt-12">
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
            </section>
          )}

          {book.chapters.length > 0 && (
            <section className="mt-12">
              <h2 className="text-[18px] font-semibold text-[#0a2540]">
                Table of contents
              </h2>
              <ol className="mt-4 space-y-3">
                {book.chapters.map((chapter) => (
                  <li key={chapter.number} className="text-[14px]">
                    <a
                      href={`#chapter-${chapter.number}`}
                      className="font-medium text-[#635bff] hover:underline"
                    >
                      {chapter.number}. {chapter.title}
                    </a>
                    {chapter.summary && (
                      <p className="mt-0.5 text-[13px] text-[#697386]">
                        {chapter.summary}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {completedChapters.length > 0 ? (
            <div className="mt-14 space-y-16">
              {completedChapters.map((chapter) => (
                <section
                  key={chapter.number}
                  id={`chapter-${chapter.number}`}
                  className="scroll-mt-24"
                >
                  <h2 className="text-[22px] font-semibold tracking-[-0.03em] text-[#0a2540]">
                    Chapter {chapter.number}: {chapter.title}
                  </h2>
                  {chapter.summary && (
                    <p className="mt-2 text-[14px] italic text-[#697386]">
                      {chapter.summary}
                    </p>
                  )}
                  <div className="mt-6 space-y-8">
                    {chapter.sections.map((section) => (
                      <div key={section.number}>
                        {section.title && (
                          <h3 className="text-[15px] font-medium text-[#0a2540]">
                            {section.title}
                          </h3>
                        )}
                        <div className="mt-2 whitespace-pre-wrap text-[15px] leading-[1.75] text-[#425466]">
                          {section.content || "Content coming soon."}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
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
