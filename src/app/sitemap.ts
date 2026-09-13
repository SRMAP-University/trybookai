import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { BLOG_POSTS } from "@/lib/blogs";
import { genreToSlug, getAppUrl } from "@/lib/book-public";

const STATIC_UPDATED = new Date("2026-09-13");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getAppUrl();

  const [books, genreRows] = await Promise.all([
    db.book.findMany({
      where: { isPublic: true },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 5000,
    }),
    db.book.groupBy({
      by: ["genre"],
      where: { isPublic: true, genre: { not: null } },
    }),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, lastModified: STATIC_UPDATED, changeFrequency: "weekly", priority: 1 },
    {
      url: `${base}/books`,
      lastModified: books[0]?.updatedAt ?? STATIC_UPDATED,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${base}/features`,
      lastModified: STATIC_UPDATED,
      changeFrequency: "monthly",
      priority: 0.85,
    },
    {
      url: `${base}/faq`,
      lastModified: STATIC_UPDATED,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${base}/blog`,
      lastModified: STATIC_UPDATED,
      changeFrequency: "weekly",
      priority: 0.85,
    },
    {
      url: `${base}/about`,
      lastModified: STATIC_UPDATED,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${base}/download`,
      lastModified: STATIC_UPDATED,
      changeFrequency: "monthly",
      priority: 0.75,
    },
    {
      url: `${base}/privacy`,
      lastModified: STATIC_UPDATED,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${base}/terms`,
      lastModified: STATIC_UPDATED,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${base}/refund`,
      lastModified: STATIC_UPDATED,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  const genreRoutes: MetadataRoute.Sitemap = genreRows
    .filter((row): row is { genre: string } => Boolean(row.genre))
    .map((row) => ({
      url: `${base}/books/genre/${genreToSlug(row.genre)}`,
      lastModified: STATIC_UPDATED,
      changeFrequency: "weekly" as const,
      priority: 0.75,
    }));

  const bookRoutes: MetadataRoute.Sitemap = books.map((book) => ({
    url: `${base}/books/${book.slug}`,
    lastModified: book.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  const blogRoutes: MetadataRoute.Sitemap = BLOG_POSTS.map((post) => ({
    url: `${base}/blog/${post.slug}`,
    lastModified: new Date(post.updatedAt ?? post.publishedAt),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [...staticRoutes, ...genreRoutes, ...bookRoutes, ...blogRoutes];
}
