import PDFDocument from "pdfkit";
import epub from "epub-gen-memory";
import {
  blocksToHtml,
  escapeHtml,
  parseManuscriptBlocks,
  tokenizeInline,
  type ManuscriptBlock,
} from "@/lib/book-content-blocks";

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

const PDF_CONTENT_WIDTH = 468;
const PDF_LEFT = 72;
const PDF_BOTTOM = 72;

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed > doc.page.height - PDF_BOTTOM) {
    doc.addPage();
    doc.x = PDF_LEFT;
    doc.y = 72;
  }
}

function writeRichText(
  doc: PDFKit.PDFDocument,
  text: string,
  options?: {
    fontSize?: number;
    color?: string;
    align?: "left" | "center" | "justify";
    indent?: number;
    italic?: boolean;
    bold?: boolean;
  }
) {
  const fontSize = options?.fontSize ?? 11;
  const color = options?.color ?? "#333333";
  const indent = options?.indent ?? 0;
  const width = PDF_CONTENT_WIDTH - indent;
  const spans = tokenizeInline(text);
  const x = PDF_LEFT + indent;

  spans.forEach((span, index) => {
    let font = "Times-Roman";
    if (span.bold || options?.bold) font = "Times-Bold";
    else if (span.italic || options?.italic) font = "Times-Italic";
    else if (span.code) font = "Courier";
    doc.font(font).fontSize(fontSize).fillColor(color);
    doc.text(span.text, x, doc.y, {
      width,
      align: options?.align ?? "left",
      continued: index < spans.length - 1,
      lineGap: 2,
    });
  });
  if (!spans.length) {
    doc.font("Times-Roman").fontSize(fontSize).fillColor(color);
    doc.text("", x, doc.y, { width });
  }
}

function writePdfTable(
  doc: PDFKit.PDFDocument,
  headers: string[],
  rows: string[][]
) {
  const cols = Math.max(headers.length, ...rows.map((r) => r.length), 1);
  const colW = PDF_CONTENT_WIDTH / cols;
  const pad = 5;
  const fontSize = 9;

  const cellHeight = (text: string, bold: boolean) => {
    doc.font(bold ? "Times-Bold" : "Times-Roman").fontSize(fontSize);
    return (
      doc.heightOfString(text || " ", { width: colW - pad * 2, lineGap: 1 }) +
      pad * 2
    );
  };

  const drawRow = (cells: string[], bold: boolean, fill: string) => {
    const height = Math.max(
      18,
      ...Array.from({ length: cols }, (_, i) => cellHeight(cells[i] ?? "", bold))
    );
    ensureSpace(doc, height + 2);
    const y = doc.y;
    for (let i = 0; i < cols; i += 1) {
      const x = PDF_LEFT + i * colW;
      doc.save();
      doc.rect(x, y, colW, height).fillAndStroke(fill, "#d0d5dd");
      doc.restore();
      doc
        .font(bold ? "Times-Bold" : "Times-Roman")
        .fontSize(fontSize)
        .fillColor("#222222");
      doc.text(cells[i] ?? "", x + pad, y + pad, {
        width: colW - pad * 2,
        lineGap: 1,
      });
    }
    doc.x = PDF_LEFT;
    doc.y = y + height;
  };

  drawRow(headers, true, "#f3f6fa");
  for (const row of rows) {
    drawRow(row, false, "#ffffff");
  }
}

function writePdfBlocks(doc: PDFKit.PDFDocument, content: string) {
  const blocks = parseManuscriptBlocks(content.trim() || "Not generated yet.");
  if (!blocks.length) {
    writeRichText(doc, "Not generated yet.", {
      italic: true,
      color: "#697386",
    });
    return;
  }

  for (const block of blocks) {
    writePdfBlock(doc, block);
  }
}

function writePdfBlock(doc: PDFKit.PDFDocument, block: ManuscriptBlock) {
  if (block.type === "heading") {
    const size = block.level <= 2 ? 14 : block.level === 3 ? 12 : 11;
    ensureSpace(doc, 28);
    doc.moveDown(0.35);
    writeRichText(doc, block.text, {
      fontSize: size,
      color: "#111111",
      bold: true,
    });
    doc.moveDown(0.35);
    return;
  }

  if (block.type === "quote") {
    ensureSpace(doc, 24);
    writeRichText(doc, block.text, {
      italic: true,
      color: "#555555",
      indent: 18,
    });
    doc.moveDown(0.45);
    return;
  }

  if (block.type === "list") {
    for (let i = 0; i < block.items.length; i += 1) {
      ensureSpace(doc, 18);
      const marker = block.ordered ? `${i + 1}. ` : "•  ";
      writeRichText(doc, `${marker}${block.items[i]}`, { indent: 14 });
      doc.moveDown(0.15);
    }
    doc.moveDown(0.25);
    return;
  }

  if (block.type === "table") {
    doc.moveDown(0.2);
    writePdfTable(doc, block.headers, block.rows);
    doc.moveDown(0.45);
    return;
  }

  if (block.type === "figure") {
    const caption = block.caption || "Illustration";
    doc.font("Times-Italic").fontSize(10);
    const boxH = Math.max(
      48,
      doc.heightOfString(`Illustration\n${caption}`, {
        width: PDF_CONTENT_WIDTH - 24,
      }) + 24
    );
    ensureSpace(doc, boxH + 8);
    const y = doc.y;
    doc.save();
    doc.roundedRect(PDF_LEFT, y, PDF_CONTENT_WIDTH, boxH, 6).fill("#f4f7fb");
    doc
      .roundedRect(PDF_LEFT, y, PDF_CONTENT_WIDTH, boxH, 6)
      .strokeColor("#d8dee8")
      .stroke();
    doc.restore();
    doc
      .font("Times-Bold")
      .fontSize(8)
      .fillColor("#697386")
      .text("ILLUSTRATION", PDF_LEFT + 12, y + 10, {
        width: PDF_CONTENT_WIDTH - 24,
      });
    doc
      .font("Times-Italic")
      .fontSize(10)
      .fillColor("#0a2540")
      .text(caption, PDF_LEFT + 12, y + 24, {
        width: PDF_CONTENT_WIDTH - 24,
      });
    doc.y = y + boxH + 8;
    doc.x = PDF_LEFT;
    return;
  }

  if (block.type === "rule") {
    ensureSpace(doc, 16);
    doc
      .moveTo(PDF_LEFT, doc.y + 4)
      .lineTo(PDF_LEFT + PDF_CONTENT_WIDTH, doc.y + 4)
      .strokeColor("#d8dee8")
      .stroke();
    doc.moveDown(0.6);
    return;
  }

  ensureSpace(doc, 20);
  writeRichText(doc, block.text);
  doc.moveDown(0.45);
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
      writePdfBlocks(doc, book.description);
      doc.moveDown(0.5);
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
        writeRichText(doc, chapter.summary, {
          fontSize: 10,
          italic: true,
          color: "#555555",
        });
        doc.moveDown(0.75);
      }

      for (const section of chapter.sections) {
        doc.moveDown(0.4);
        writeRichText(doc, section.title, {
          fontSize: 13,
          bold: true,
          color: "#222222",
        });
        doc.moveDown(0.35);
        writePdfBlocks(doc, section.content?.trim() || "Not generated yet.");
        doc.moveDown(0.35);
      }
    }

    if (user.includeBrandInExport) {
      doc.addPage();
      writeRichText(doc, copyrightLine(user), {
        fontSize: 10,
        color: "#555555",
      });
      if (user.exportFooter) {
        doc.moveDown(0.5);
        writeRichText(doc, user.exportFooter, {
          fontSize: 10,
          color: "#555555",
        });
      }
      if (user.websiteUrl) {
        doc.moveDown(0.5);
        writeRichText(doc, user.websiteUrl, {
          fontSize: 10,
          color: "#555555",
        });
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
    frontParts.push(blocksToHtml(book.description));
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
        blocksToHtml(section.content?.trim() || "Not generated yet.")
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
