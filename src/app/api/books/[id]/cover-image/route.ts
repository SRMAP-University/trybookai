import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
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

async function serveCoverBytes(bookId: string, coverImage: string) {
  if (isHttpUrl(coverImage)) {
    const isOwnProxy =
      coverImage.startsWith(`${getAppUrl()}/api/books/`) &&
      coverImage.includes("/cover");
    if (!isOwnProxy) {
      return NextResponse.redirect(coverImage, 307);
    }
  } else {
    const parsed = parseDataUri(coverImage);
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
    const bytes = await getCoverFromR2(bookId);
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const { id } = await params;

  const book = await db.book.findUnique({
    where: { id },
    select: { id: true, userId: true, isPublic: true, coverImage: true },
  });

  if (!book?.coverImage) {
    return new NextResponse(null, { status: 404 });
  }

  const isOwner = session?.user?.id === book.userId;
  if (!book.isPublic && !isOwner) {
    return new NextResponse(null, { status: 404 });
  }

  return serveCoverBytes(book.id, book.coverImage);
}
