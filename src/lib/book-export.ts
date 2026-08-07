import PDFDocument from "pdfkit";
import epub from "epub-gen-memory";

export type ExportFormat = "md" | "pdf" | "epub";

export type ExportBrandUser = {
  brandName: string | null;
  brandTagline: string | null;
  authorName: string | null;
  imprintName: string | null;
  websiteUrl: string | null;
  copyrightNotice: string | null;
  dedicationDefault: string | null;
  exportFooter: string | null;
  includeBrandInExport: boolean;
  name: string | null;
};

export type ExportSection = {
  title: string;
  content: string | null;
};

export type ExportChapter = {
  number: number;
  title: string;
  summary: string | null;
  sections: ExportSection[];
};

export type ExportBook = {
  title: string;
  description: string | null;
  user: ExportBrandUser;
  chapters: ExportChapter[];
};

export const EXPORT_FORMATS: ExportFormat[] = ["md", "pdf", "epub"];

export function parseExportFormat(value: string | null): ExportFormat | null {
  if (!value) return "md";
  const normalized = value.trim().toLowerCase();
  if (EXPORT_FORMATS.includes(normalized as ExportFormat)) {
    return normalized as ExportFormat;
  }
  return null;
}

export function exportFilename(title: string, format: ExportFormat): string {
  const base =
    title.replace(/[^a-z0-9-_ ]/gi, "").trim().replace(/\s+/g, "-") || "book";
  return `${base}.${format === "md" ? "md" : format}`;
}

export function exportContentType(format: ExportFormat): string {
  switch (format) {
    case "pdf":
      return "application/pdf";
    case "epub":
      return "application/epub+zip";
    default:
      return "text/markdown; charset=utf-8";
  }
}

function copyrightLine(user: ExportBrandUser): string {
  if (user.copyrightNotice) return user.copyrightNotice;
  const name = user.brandName || user.authorName || user.name || "BookAI";
  return `© ${new Date().getFullYear()} ${name}. All rights reserved.`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraphsToHtml(text: string): string {
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length === 0) return "<p><em>Not generated yet.</em></p>";
  return blocks
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}

export function buildMarkdownManuscript(book: ExportBook): string {
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
    lines.push(copyrightLine(user), "");
    if (user.exportFooter) lines.push(user.exportFooter, "");
    if (user.websiteUrl) lines.push(user.websiteUrl, "");
  }

  return lines.join("\n");
}

function writeWrappedText(
  doc: PDFKit.PDFDocument,
  text: string,
  options?: PDFKit.Mixins.TextOptions
) {
  doc.text(text, { width: 468, align: "left", ...options });
}

export async function buildPdfBuffer(book: ExportBook): Promise<Buffer> {
  const { user } = book;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 72,
      size: "LETTER",
      info: {
        Title: book.title,
        Author: user.authorName || user.name || "BookAI",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Times-Roman");

    if (user.includeBrandInExport) {
      const imprint = user.imprintName || user.brandName;
      if (imprint) {
        doc
          .fontSize(11)
          .fillColor("#666666")
          .text(imprint, { align: "center" });
        doc.moveDown(1.5);
      }
    }

    doc
      .font("Times-Bold")
      .fontSize(24)
      .fillColor("#111111")
      .text(book.title, { align: "center" });
    doc.moveDown(0.75);

    if (user.includeBrandInExport && user.authorName) {
      doc
        .font("Times-Roman")
        .fontSize(14)
        .fillColor("#333333")
        .text(`by ${user.authorName}`, { align: "center" });
      doc.moveDown(0.5);
    }

    if (user.includeBrandInExport && user.brandTagline) {
      doc
        .font("Times-Italic")
        .fontSize(11)
        .fillColor("#555555")
        .text(user.brandTagline, { align: "center" });
      doc.font("Times-Roman");
      doc.moveDown(1);
    }

    if (book.description) {
      doc.moveDown(0.5);
      doc.font("Times-Roman").fontSize(11).fillColor("#333333");
      writeWrappedText(doc, book.description);
      doc.moveDown(1);
    }

    if (user.includeBrandInExport && user.dedicationDefault) {
      doc.moveDown(0.5);
      doc
        .font("Times-Italic")
        .fontSize(11)
        .fillColor("#555555")
        .text(user.dedicationDefault, { align: "center" });
      doc.font("Times-Roman");
      doc.moveDown(1);
    }

    for (const chapter of book.chapters) {
      doc.addPage();
      doc
        .font("Times-Bold")
        .fontSize(16)
        .fillColor("#111111")
        .text(`Chapter ${chapter.number}: ${chapter.title}`, { width: 468 });
      doc.moveDown(0.5);

      if (chapter.summary) {
        doc.font("Times-Italic").fontSize(10).fillColor("#555555");
        writeWrappedText(doc, chapter.summary);
        doc.font("Times-Roman");
        doc.moveDown(0.75);
      }

      for (const section of chapter.sections) {
        doc.moveDown(0.4);
        doc
          .font("Times-Bold")
          .fontSize(13)
          .fillColor("#222222")
          .text(section.title, { width: 468 });
        doc.moveDown(0.35);
        doc.font("Times-Roman").fontSize(11).fillColor("#333333");
        writeWrappedText(doc, section.content?.trim() || "Not generated yet.");
        doc.moveDown(0.5);
      }
    }

    if (user.includeBrandInExport) {
      doc.addPage();
      doc.font("Times-Roman").fontSize(10).fillColor("#555555");
      writeWrappedText(doc, copyrightLine(user));
      if (user.exportFooter) {
        doc.moveDown(0.5);
        writeWrappedText(doc, user.exportFooter);
      }
      if (user.websiteUrl) {
        doc.moveDown(0.5);
        writeWrappedText(doc, user.websiteUrl);
      }
    }

    doc.end();
  });
}

export async function buildEpubBuffer(book: ExportBook): Promise<Buffer> {
  const { user } = book;
  const author =
    (user.includeBrandInExport && user.authorName) ||
    user.name ||
    "BookAI";

  const frontParts: string[] = [];
  if (user.includeBrandInExport) {
    const imprint = user.imprintName || user.brandName;
    if (imprint) frontParts.push(`<p><em>${escapeHtml(imprint)}</em></p>`);
  }
  frontParts.push(`<h1>${escapeHtml(book.title)}</h1>`);
  if (user.includeBrandInExport && user.authorName) {
    frontParts.push(`<p><strong>by ${escapeHtml(user.authorName)}</strong></p>`);
  }
  if (user.includeBrandInExport && user.brandTagline) {
    frontParts.push(`<blockquote>${escapeHtml(user.brandTagline)}</blockquote>`);
  }
  if (book.description) {
    frontParts.push(paragraphsToHtml(book.description));
  }
  if (user.includeBrandInExport && user.dedicationDefault) {
    frontParts.push(
      `<p><em>${escapeHtml(user.dedicationDefault)}</em></p>`
    );
  }

  const content: { title: string; content: string }[] = [
    {
      title: "Title",
      content: frontParts.join("\n"),
    },
  ];

  for (const chapter of book.chapters) {
    const parts: string[] = [
      `<h1>Chapter ${chapter.number}: ${escapeHtml(chapter.title)}</h1>`,
    ];
    if (chapter.summary) {
      parts.push(`<p><em>${escapeHtml(chapter.summary)}</em></p>`);
    }
    for (const section of chapter.sections) {
      parts.push(`<h2>${escapeHtml(section.title)}</h2>`);
      parts.push(
        paragraphsToHtml(section.content?.trim() || "Not generated yet.")
      );
    }
    content.push({
      title: `Chapter ${chapter.number}: ${chapter.title}`,
      content: parts.join("\n"),
    });
  }

  if (user.includeBrandInExport) {
    const back: string[] = [`<p>${escapeHtml(copyrightLine(user))}</p>`];
    if (user.exportFooter) {
      back.push(`<p>${escapeHtml(user.exportFooter)}</p>`);
    }
    if (user.websiteUrl) {
      back.push(
        `<p><a href="${escapeHtml(user.websiteUrl)}">${escapeHtml(user.websiteUrl)}</a></p>`
      );
    }
    content.push({ title: "Copyright", content: back.join("\n") });
  }

  return epub(
    {
      title: book.title,
      author,
      description: book.description || undefined,
      publisher:
        (user.includeBrandInExport &&
          (user.imprintName || user.brandName || undefined)) ||
        undefined,
      css: `body { font-family: Georgia, serif; line-height: 1.5; } h1, h2 { font-family: Georgia, serif; } p { margin: 0 0 1em; }`,
    },
    content
  );
}

export async function buildExportBuffer(
  book: ExportBook,
  format: ExportFormat
): Promise<Buffer | string> {
  switch (format) {
    case "pdf":
      return buildPdfBuffer(book);
    case "epub":
      return buildEpubBuffer(book);
    default:
      return buildMarkdownManuscript(book);
  }
}
