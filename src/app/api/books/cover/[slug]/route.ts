import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAppUrl } from "@/lib/book-public";
import { getCoverFromR2, canUploadCoversToR2 } from "@/lib/r2";

function parseDataUri(dataUri: string): { bytes: Buffer; mime: string } | null {
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mime: match[1],
    bytes: Buffer.from(match[2], "base64"),
  };
}

function isHttpUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const book = await db.book.findFirst({
    where: { slug, isPublic: true },
    select: { id: true, coverImage: true },
  });

  if (!book?.coverImage) {
    return new NextResponse(null, { status: 404 });
  }

  if (isHttpUrl(book.coverImage)) {
    const isOwnProxy = book.coverImage.startsWith(`${getAppUrl()}/api/books/`);
    if (!isOwnProxy) {
      return NextResponse.redirect(book.coverImage, 307);
    }
  } else {
    const parsed = parseDataUri(book.coverImage);
    if (parsed) {
      return new NextResponse(new Uint8Array(parsed.bytes), {
        headers: {
          "Content-Type": parsed.mime,
          "Cache-Control": "public, max-age=86400, immutable",
        },
      });
    }
  }

  if (canUploadCoversToR2()) {
    const bytes = await getCoverFromR2(book.id);
    if (bytes) {
      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=86400, immutable",
        },
      });
    }
  }

  return new NextResponse(null, { status: 404 });
}
