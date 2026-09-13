import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { getAppUrl } from "@/lib/book-public";
import { getAllBlogSlugs, getBlogPost, getRelatedBlogPosts } from "@/lib/blogs";
import { JsonLd } from "@/components/seo/json-ld";
import { blogPostingJsonLd, breadcrumbJsonLd } from "@/lib/seo";

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
  if (!post) return { robots: { index: false, follow: false } };

  const url = `${getAppUrl()}/blog/${slug}`;
  const image = `${url}/opengraph-image`;
  return {
    title: post.title,
    description: post.description,
    authors: [{ name: post.author }],
    keywords: post.tags,
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
      images: [{ url: image, width: 1200, height: 630, alt: post.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
      images: [image],
    },
    robots: { index: true, follow: true },
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

  const url = `${getAppUrl()}/blog/${slug}`;
  const paragraphs = post.content.split("\n\n");
  const related = getRelatedBlogPosts(slug);

  return (
    <>
      <JsonLd
        data={blogPostingJsonLd({
          title: post.title,
          description: post.description,
          url,
          author: post.author,
          publishedAt: post.publishedAt,
          updatedAt: post.updatedAt,
          tags: post.tags,
          image: `${url}/opengraph-image`,
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Blog", path: "/blog" },
          { name: post.title, path: `/blog/${slug}` },
        ])}
      />
      <Navbar />
      <main className="min-h-screen bg-white pt-[72px]">
        <article className="mx-auto max-w-[720px] px-6 py-14">
          <nav aria-label="Breadcrumb" className="mb-6 text-[13px] text-[#697386]">
            <Link href="/blog" className="hover:text-[#635bff]">
              Blog
            </Link>
            <span className="mx-2">/</span>
            <span className="text-[#0a2540]">{post.title}</span>
          </nav>

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

          {related.length > 0 ? (
            <aside className="mt-12 border-t border-[#e6ebf1] pt-8">
              <h2 className="text-[18px] font-semibold text-[#0a2540]">
                Keep reading
              </h2>
              <ul className="mt-4 space-y-3">
                {related.map((item) => (
                  <li key={item.slug}>
                    <Link
                      href={`/blog/${item.slug}`}
                      className="text-[15px] font-medium text-[#635bff] hover:underline"
                    >
                      {item.title}
                    </Link>
                    <p className="mt-1 text-[13px] text-[#697386]">
                      {item.description}
                    </p>
                  </li>
                ))}
              </ul>
            </aside>
          ) : null}

          <div className="mt-10">
            <Link
              href="/blog"
              className="text-[14px] font-medium text-[#635bff] hover:underline"
            >
              ← All posts
            </Link>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
