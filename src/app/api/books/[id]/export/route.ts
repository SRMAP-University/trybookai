import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  buildExportBuffer,
  exportContentType,
  exportFilename,
  parseExportFormat,
} from "@/lib/book-export";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const format = parseExportFormat(
    new URL(request.url).searchParams.get("format")
  );
  if (!format) {
    return NextResponse.json(
      { error: "Invalid format. Use md, pdf, or epub." },
      { status: 400 }
    );
  }

  const book = await db.book.findFirst({
    where: { id, userId: session.user.id },
    include: {
      user: {
        select: {
          brandName: true,
          brandTagline: true,
          authorName: true,
          imprintName: true,
          websiteUrl: true,
          copyrightNotice: true,
          dedicationDefault: true,
          exportFooter: true,
          includeBrandInExport: true,
          name: true,
        },
      },
      chapters: {
        orderBy: { number: "asc" },
        include: {
          sections: { orderBy: { number: "asc" } },
        },
      },
    },
  });

  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const body = await buildExportBuffer(book, format);
  const filename = exportFilename(book.title, format);
  const bytes =
    typeof body === "string" ? Buffer.from(body, "utf8") : body;

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": exportContentType(format),
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
