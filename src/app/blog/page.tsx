import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { getAppUrl } from "@/lib/book-public";
import { BLOG_POSTS } from "@/lib/blogs";

export const metadata: Metadata = {
  title: "Blog — BookAI",
  description:
    "Tips, guides, and strategies for writing and publishing books with AI. Browse the BookAI blog.",
  alternates: { canonical: `${getAppUrl()}/blog` },
  openGraph: {
    title: "Blog — BookAI",
    description:
      "Tips, guides, and strategies for writing and publishing books with AI.",
    url: `${getAppUrl()}/blog`,
    type: "website",
  },
};

export default function BlogPage() {
  const posts = BLOG_POSTS.slice().sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-white pt-[72px]">
        <div className="mx-auto max-w-[960px] px-6 py-14">
          <div className="mb-10">
            <h1 className="text-[32px] font-semibold tracking-[-0.03em] text-[#0a2540]">
              BookAI Blog
            </h1>
            <p className="mt-2 max-w-xl text-[15px] text-[#697386]">
              Guides, comparisons, and publishing strategies for authors using
              AI.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {posts.map((post) => (
              <article
                key={post.slug}
                className="group flex flex-col overflow-hidden rounded-xl border border-[#e6ebf1] bg-white transition-colors hover:border-[#635bff]/40"
              >
                <Link href={`/blog/${post.slug}`} className="flex flex-1 flex-col p-6">
                  <div className="flex flex-wrap gap-2">
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-[#f0efff] px-2.5 py-0.5 text-[11px] font-medium text-[#635bff]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <h2 className="mt-3 text-[18px] font-semibold leading-snug tracking-[-0.02em] text-[#0a2540] group-hover:text-[#635bff]">
                    {post.title}
                  </h2>
                  <p className="mt-2 flex-1 text-[14px] leading-relaxed text-[#425466]">
                    {post.description}
                  </p>
                  <div className="mt-4 flex items-center gap-3 text-[12px] text-[#697386]">
                    <time dateTime={post.publishedAt}>
                      {new Date(post.publishedAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </time>
                    <span>·</span>
                    <span>{post.readMinutes} min read</span>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
