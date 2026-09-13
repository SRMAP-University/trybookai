import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { OG_SIZE, OgCard } from "@/lib/og-template";

export const alt = "BookAI public book";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function BookOpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const book = await db.book.findFirst({
    where: { slug, isPublic: true },
    select: {
      title: true,
      genre: true,
      user: { select: { authorName: true, brandName: true, name: true } },
    },
  });

  const title = book?.title ?? "Public book";
  const author =
    book?.user.authorName || book?.user.brandName || book?.user.name || "BookAI";
  const genre = book?.genre ? ` · ${book.genre}` : "";

  return new ImageResponse(
    (
      <OgCard
        kicker="Read on BookAI"
        title={title}
        footer={`By ${author}${genre}`}
      />
    ),
    { ...OG_SIZE }
  );
}
