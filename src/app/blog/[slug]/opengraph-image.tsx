import { ImageResponse } from "next/og";
import { getBlogPost } from "@/lib/blogs";
import { OG_SIZE, OgCard } from "@/lib/og-template";

export const alt = "BookAI blog";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function BlogOpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getBlogPost(slug);

  return new ImageResponse(
    (
      <OgCard
        kicker="BookAI Blog"
        title={post?.title ?? "BookAI Blog"}
        footer={post?.description?.slice(0, 90) ?? "Guides for AI authors"}
      />
    ),
    { ...OG_SIZE }
  );
}
