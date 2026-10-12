import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getAppUrl } from "@/lib/book-public";
import { loadSharedReel } from "@/lib/reel-generator/timeline";
import { SharedReel } from "./shared-reel";

type Props = { params: Promise<{ token: string }> };

const getSharedReel = cache(loadSharedReel);

function posterOf(reel: NonNullable<Awaited<ReturnType<typeof loadSharedReel>>>["reel"]) {
  return reel.episodes.flatMap((e) => e.shots).find((s) => s.imageUrl)?.imageUrl ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const shared = await getSharedReel(token);
  if (!shared) {
    return { title: "Reel not found", robots: { index: false, follow: false } };
  }
  const poster = posterOf(shared.reel);
  const description = `A narrated, illustrated story video from "${shared.book.title}", made with BookAI.`;
  return {
    title: shared.reel.title,
    description,
    // Unlisted: reachable only by people who have the link.
    robots: { index: false, follow: false },
    openGraph: {
      title: shared.reel.title,
      description,
      url: `${getAppUrl()}/r/${token}`,
      type: "video.other",
      ...(poster ? { images: [{ url: poster, width: 720, height: 1280 }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: shared.reel.title,
      description,
      ...(poster ? { images: [poster] } : {}),
    },
  };
}

export default async function SharedReelPage({ params }: Props) {
  const { token } = await params;
  const shared = await getSharedReel(token);
  if (!shared) notFound();

  return (
    <SharedReel
      reel={shared.reel}
      poster={posterOf(shared.reel)}
      bookTitle={shared.book.title}
      bookUrl={shared.book.isPublic ? `/books/${shared.book.slug}` : null}
    />
  );
}
