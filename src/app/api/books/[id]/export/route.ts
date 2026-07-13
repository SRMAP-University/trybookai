import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

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

  const { user } = book;
  const lines: string[] = [];

  if (user.includeBrandInExport) {
    const imprint = user.imprintName || user.brandName;
    if (imprint) {
      lines.push(`*${imprint}*`, "");
    }
  }

  lines.push(`# ${book.title}`, "");

  if (user.includeBrandInExport && user.authorName) {
    lines.push(`**by ${user.authorName}**`, "");
  }

  if (user.includeBrandInExport && user.brandTagline) {
    lines.push(`> ${user.brandTagline}`, "");
  }

  if (book.description) {
    lines.push(book.description, "");
  }

  if (user.includeBrandInExport && user.dedicationDefault) {
    lines.push("---", "", `*${user.dedicationDefault}*`, "");
  }

  lines.push("---", "");

  for (const chapter of book.chapters) {
    lines.push(`## Chapter ${chapter.number}: ${chapter.title}`, "");
    if (chapter.summary) {
      lines.push(`*${chapter.summary}*`, "");
    }

    for (const section of chapter.sections) {
      lines.push(`### ${section.title}`, "");
      lines.push(section.content ?? "_Not generated yet._", "");
    }
  }

  if (user.includeBrandInExport) {
    lines.push("---", "");
    if (user.copyrightNotice) {
      lines.push(user.copyrightNotice, "");
    } else {
      const name = user.brandName || user.authorName || user.name || "BookAI";
      lines.push(`© ${new Date().getFullYear()} ${name}. All rights reserved.`, "");
    }
    if (user.exportFooter) lines.push(user.exportFooter, "");
    if (user.websiteUrl) lines.push(user.websiteUrl, "");
  }

  const markdown = lines.join("\n");

  return new NextResponse(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${book.title.replace(/[^a-z0-9-_ ]/gi, "").trim() || "book"}.md"`,
    },
  });
}
