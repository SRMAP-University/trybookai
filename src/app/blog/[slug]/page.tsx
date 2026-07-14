import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { getAppUrl } from "@/lib/book-public";
import { getAllBlogSlugs, getBlogPost } from "@/lib/blogs";

export function generateStaticParams() {
  return getAllBlogSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return {};

  const url = `${getAppUrl()}/blog/${slug}`;
  return {
    title: `${post.title} — BookAI`,
    description: post.description,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description: post.description,
      url,
      type: "article",
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt ?? post.publishedAt,
      authors: [post.author],
      tags: post.tags,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  const paragraphs = post.content.split("\n\n");

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-white pt-[72px]">
        <article className="mx-auto max-w-[720px] px-6 py-14">
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

          <h1 className="mt-4 text-[28px] font-semibold leading-tight tracking-[-0.03em] text-[#0a2540] sm:text-[34px]">
            {post.title}
          </h1>

          <p className="mt-4 text-[17px] leading-relaxed text-[#425466]">
            {post.description}
          </p>

          <div className="mt-6 flex items-center gap-3 border-b border-[#e6ebf1] pb-6 text-[13px] text-[#697386]">
            <span className="font-medium text-[#0a2540]">{post.author}</span>
            <span>·</span>
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

          <div className="prose prose-slate mt-8 max-w-none text-[#0a2540]">
            {paragraphs.map((paragraph, i) => {
              if (paragraph.startsWith("## ")) {
                return (
                  <h2
                    key={i}
                    className="mb-4 mt-8 text-[22px] font-semibold tracking-[-0.02em] text-[#0a2540]"
                  >
                    {paragraph.replace("## ", "")}
                  </h2>
                );
              }
              return (
                <p key={i} className="mb-4 text-[16px] leading-relaxed text-[#425466]">
                  {paragraph}
                </p>
              );
            })}
          </div>

          <div className="mt-12 border-t border-[#e6ebf1] pt-8">
            <Link
              href="/blog"
              className="text-[14px] font-medium text-[#635bff] hover:underline"
            >
              ← Back to all posts
            </Link>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
