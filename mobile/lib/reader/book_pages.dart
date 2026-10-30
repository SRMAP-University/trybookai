/// Lays a book out into printed pages and draws them. A port of the
/// website's `src/lib/reader/paginate.ts` and its `.bkr-body` styles:
/// pages are filled by measuring real text with the same fonts, widths and
/// spacing the page is drawn with, so what's measured is what's shown.
library;

import 'dart:async';
import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:bookai_mobile/models/book_content.dart';
import 'package:bookai_mobile/reader/reader_blocks.dart';
import 'package:bookai_mobile/widgets/manuscript_view.dart';

/// Page colours, the same three themes as the website reader.
class ReaderTheme {
  const ReaderTheme({
    required this.id,
    required this.label,
    required this.page,
    required this.ink,
    required this.muted,
    required this.accent,
    required this.rule,
    required this.table,
  });

  final String id;
  final String label;
  final Color page;
  final Color ink;
  final Color muted;
  final Color accent;
  final Color rule;

  /// The dark "table" the book lies on.
  final List<Color> table;

  static const paper = ReaderTheme(
    id: 'paper',
    label: 'Paper',
    page: Color(0xFFFBF8F1),
    ink: Color(0xFF23262D),
    muted: Color(0xFF8B8F97),
    accent: Color(0xFF2C4A6E),
    rule: Color(0x2423262D),
    table: [Color(0xFF2D374A), Color(0xFF161C28), Color(0xFF0C1017)],
  );
  static const sepia = ReaderTheme(
    id: 'sepia',
    label: 'Sepia',
    page: Color(0xFFF3E6CF),
    ink: Color(0xFF3B2F22),
    muted: Color(0xFF9A8669),
    accent: Color(0xFF8A4B2A),
    rule: Color(0x293B2F22),
    table: [Color(0xFF3B2F23), Color(0xFF1B150F), Color(0xFF0F0B08)],
  );
  static const night = ReaderTheme(
    id: 'night',
    label: 'Night',
    page: Color(0xFF1D1F24),
    ink: Color(0xFFD8D4CC),
    muted: Color(0xFF8A8E96),
    accent: Color(0xFFC9A86A),
    rule: Color(0x24D8D4CC),
    table: [Color(0xFF171A20), Color(0xFF090A0D), Color(0xFF090A0D)],
  );
  static const all = [paper, sepia, night];

  static ReaderTheme byId(String? id) =>
      all.firstWhere((t) => t.id == id?.toLowerCase(), orElse: () => paper);
}

/// Page size, margins and type size for the space available.
class PageGeometry {
  PageGeometry._({
    required this.pw,
    required this.ph,
    required this.fs,
    required this.inner,
    required this.pt,
    required this.pb,
  });

  static const fontSteps = [15.0, 16.5, 18.0, 19.5, 21.0];

  factory PageGeometry.fit(Size space, int step) {
    final pw = math.min(space.width, 620.0);
    final ph = math.max(space.height, 320.0);
    final scale = (pw / 460).clamp(0.85, 1.15);
    final fs =
        (fontSteps[step.clamp(0, fontSteps.length - 1)] * scale * 10)
            .roundToDouble() /
        10;
    return PageGeometry._(
      pw: pw,
      ph: ph,
      fs: fs,
      inner: math.max(22.0, (pw * 0.08).roundToDouble()),
      pt: math.max(40.0, (ph * 0.08).roundToDouble()),
      pb: math.max(46.0, (ph * 0.085).roundToDouble()),
    );
  }

  final double pw;
  final double ph;
  final double fs;
  final double inner;
  final double pt;
  final double pb;

  double get cw => pw - inner * 2;
  double get ch => ph - pt - pb;

  /// Base unit for cover and title type.
  double get unit => math.min(pw, ph * 0.68);

  String get key => '$pw|$ph|$fs';
}

/// Every text style on a page. Measuring and drawing both read from here.
class PageType {
  PageType(this.g, this.theme, this.scaler, this.locale)
    : body = GoogleFonts.literata(
        fontSize: g.fs,
        height: 1.62,
        color: theme.ink,
      ),
      italic = GoogleFonts.literata(
        fontSize: g.fs,
        height: 1.62,
        color: theme.ink,
        fontStyle: FontStyle.italic,
      ),
      bold = GoogleFonts.literata(
        fontSize: g.fs,
        height: 1.62,
        color: theme.ink,
        fontWeight: FontWeight.w700,
      ),
      boldItalic = GoogleFonts.literata(
        fontSize: g.fs,
        height: 1.62,
        color: theme.ink,
        fontWeight: FontWeight.w700,
        fontStyle: FontStyle.italic,
      ),
      semibold = GoogleFonts.literata(
        fontSize: g.fs,
        height: 1.62,
        color: theme.ink,
        fontWeight: FontWeight.w600,
      ),
      display = GoogleFonts.instrumentSerif(color: theme.ink),
      ui = GoogleFonts.inter(fontWeight: FontWeight.w600, color: theme.muted),
      uiMedium = GoogleFonts.inter(
        fontWeight: FontWeight.w500,
        color: theme.muted,
      );

  final PageGeometry g;
  final ReaderTheme theme;
  final TextScaler scaler;
  final Locale? locale;

  final TextStyle body;
  final TextStyle italic;
  final TextStyle bold;
  final TextStyle boldItalic;
  final TextStyle semibold;
  final TextStyle display;
  final TextStyle ui;
  final TextStyle uiMedium;

  double get em => g.fs;
  double get indent => em * 1.35;

  TextStyle heading(int level) =>
      semibold.copyWith(fontSize: level == 3 ? em * 1.1 : em, height: 1.3);
  TextStyle get rule => body.copyWith(color: theme.muted);
  TextStyle get table => body.copyWith(fontSize: em * 0.8, height: 1.4);
  TextStyle get tableHead => semibold.copyWith(fontSize: em * 0.8, height: 1.4);
  TextStyle get caption =>
      italic.copyWith(fontSize: em * 0.8, height: 1.4, color: theme.muted);
  TextStyle get chapterNumber => ui.copyWith(
    fontSize: em * 0.66,
    height: 1,
    letterSpacing: em * 0.66 * 0.24,
    color: theme.accent,
  );
  TextStyle get chapterTitle =>
      display.copyWith(fontSize: em * 2.05, height: 1.08);
  TextStyle get ornament =>
      body.copyWith(fontSize: em * 0.75, color: theme.accent);
  TextStyle get furniture => uiMedium.copyWith(
    fontSize: 10.5,
    height: 1.2,
    letterSpacing: 10.5 * 0.16,
  );

  /// Starts loading every font file a page uses; await before measuring.
  Future<void> fontsReady() async {
    try {
      await GoogleFonts.pendingFonts();
    } catch (_) {}
  }

  TextStyle? _wordStyle(Word w, {bool inItalic = false}) {
    if (w.c) {
      return TextStyle(fontFamily: 'monospace', fontSize: em * 0.88);
    }
    final i = w.i || inItalic;
    if (w.b && i) return boldItalic;
    if (w.b) return bold;
    if (i) return italic;
    return null;
  }

  /// Words [from, to) as one span, runs of the same style merged.
  TextSpan words(
    List<Word> words,
    int from,
    int to,
    TextStyle base, {
    bool indent = false,
    bool inItalic = false,
  }) {
    final children = <InlineSpan>[
      if (indent)
        WidgetSpan(
          alignment: PlaceholderAlignment.bottom,
          child: SizedBox(width: this.indent, height: 1),
        ),
    ];
    final run = StringBuffer();
    TextStyle? runStyle;
    var started = false;
    void close() {
      if (run.isEmpty) return;
      children.add(TextSpan(text: run.toString(), style: runStyle));
      run.clear();
    }

    for (var n = from; n < to; n++) {
      final w = words[n];
      final style = _wordStyle(w, inItalic: inItalic);
      if (started && style != runStyle) close();
      runStyle = style;
      started = true;
      run.write(w.t);
      if (w.sp && n < to - 1) run.write(' ');
    }
    close();
    return TextSpan(style: base, children: children);
  }

  TextSpan inline(String text, TextStyle base) {
    final w = toWords(text);
    return words(w, 0, w.length, base);
  }

  TextPainter painter(
    InlineSpan span,
    double width, {
    TextAlign align = TextAlign.start,
    bool indent = false,
  }) {
    final p = TextPainter(
      text: span,
      textAlign: align,
      textDirection: TextDirection.ltr,
      textScaler: scaler,
      locale: locale,
    );
    if (indent) {
      // RichText scales inline widgets by the text scale factor; measure the
      // indent at the size it will be drawn.
      final f = scaler.scale(em) / em;
      p.setPlaceholderDimensions([
        PlaceholderDimensions(
          size: Size(this.indent * f, f),
          alignment: PlaceholderAlignment.bottom,
        ),
      ]);
    }
    p.layout(maxWidth: width);
    return p;
  }

  double height(
    InlineSpan span,
    double width, {
    TextAlign align = TextAlign.start,
  }) {
    final p = painter(span, width, align: align);
    final h = p.height;
    p.dispose();
    return h;
  }

  /// Draws a span exactly as [painter] measured it.
  Widget text(InlineSpan span, {TextAlign align = TextAlign.start}) => RichText(
    text: span,
    textAlign: align,
    textDirection: TextDirection.ltr,
    textScaler: scaler,
    locale: locale,
  );
}

/// Where a page begins: chapter, block, and word or list item.
typedef Anchor = (int, int, int);

int compareAnchors(Anchor a, Anchor b) {
  if (a.$1 != b.$1) return a.$1 - b.$1;
  if (a.$2 != b.$2) return a.$2 - b.$2;
  return a.$3 - b.$3;
}

/// Something placed on a page, with the space above it.
sealed class PageItem {
  PageItem(this.height, this.top, this.bottom);

  /// Drawn height, and the margins above and below (CSS-style, collapsing).
  final double height;
  final double top;
  final double bottom;
  double gap = 0;
  bool get heading => false;
}

class ChapterHeadItem extends PageItem {
  ChapterHeadItem(this.chapter, this.imageHeight, super.h, super.t, super.b);
  final ChapterContent chapter;
  final double imageHeight;
}

class ParaItem extends PageItem {
  ParaItem(
    this.block,
    this.from,
    this.to,
    this.indent,
    super.h,
    super.t,
    super.b,
  );
  final RPara block;
  final int from;
  final int to;
  final bool indent;
}

class HeadItem extends PageItem {
  HeadItem(this.block, super.h, super.t, super.b);
  final RHead block;
  @override
  bool get heading => true;
}

class ListItemPiece extends PageItem {
  ListItemPiece(this.block, this.index, super.h, super.t, super.b);
  final RList block;
  final int index;
}

class TableItem extends PageItem {
  TableItem(this.block, super.h, super.t, super.b);
  final RTable block;
}

class FigureItem extends PageItem {
  FigureItem(this.block, this.imageHeight, super.h, super.t, super.b);
  final RFigure block;
  final double imageHeight;
}

class BreakItem extends PageItem {
  BreakItem(super.h, super.t, super.b);
}

/// One printed page of the book's text.
class BookPage {
  BookPage(this.chapter, this.start, this.items, this.anchor);
  final int chapter;

  /// First page of a chapter: no running head, chapter header on top.
  final bool start;
  final List<PageItem> items;
  final Anchor anchor;
}

/// Fewer words than this at the foot of a page and the paragraph moves on.
const _minSplitWords = 7;

class PaginationJob {
  bool cancelled = false;
}

/// Lays [chapters] out into pages of the type's geometry. Paragraphs and
/// lists split across pages; headings stay with the text after them;
/// pictures and tables move to the next page whole. Yields between chapters.
Future<List<BookPage>?> paginateBook(
  List<ChapterContent> chapters,
  bool narrative,
  PageType t,
  PaginationJob job,
) async {
  final g = t.g;
  final limit = g.ch - 1;
  final em = t.em;
  final pages = <BookPage>[];

  for (var ci = 0; ci < chapters.length; ci++) {
    if (job.cancelled) return null;
    final blocks = chapterBlocks(chapters[ci], narrative);

    var items = <PageItem>[];
    var used = 0.0;
    var start = true;
    Anchor anchor = (ci, 0, 0);

    double gapFor(PageItem item) {
      if (items.isEmpty) return item.heading ? 0 : item.top;
      return math.max(items.last.bottom, item.top);
    }

    bool fits(PageItem item) => used + gapFor(item) + item.height <= limit;

    void place(PageItem item) {
      item.gap = gapFor(item);
      used += item.gap + item.height;
      items.add(item);
    }

    /// Nothing on the page yet but the chapter header and headings.
    bool pageEmpty() => items.skip(start ? 1 : 0).every((i) => i.heading);

    void flush(Anchor next) {
      // Keep a heading with the text that follows it.
      final carry = <PageItem>[];
      if (!pageEmpty()) {
        while (items.length > (start ? 1 : 0) && items.last.heading) {
          carry.insert(0, items.removeLast());
        }
      }
      pages.add(BookPage(ci, start, items, anchor));
      start = false;
      anchor = next;
      items = [];
      used = 0;
      for (final c in carry) {
        place(c);
      }
    }

    place(_chapterHead(chapters[ci], t));

    for (var bi = 0; bi < blocks.length; bi++) {
      final block = blocks[bi];
      switch (block) {
        case RPara():
          final width = block.quote ? g.cw - em * 2.4 : g.cw;
          final margin = block.quote ? em * 0.55 : 0.0;
          final base = block.quote ? t.italic : t.body;
          final total = block.words.length;
          var from = 0;
          while (from < total) {
            final indent = from == 0 && !block.noIndent;
            final p = t.painter(
              t.words(
                block.words,
                from,
                total,
                base,
                indent: indent,
                inItalic: block.quote,
              ),
              width,
              align: TextAlign.justify,
              indent: indent,
            );
            final whole = ParaItem(
              block,
              from,
              total,
              indent,
              p.height,
              margin,
              margin,
            );
            if (fits(whole)) {
              p.dispose();
              place(whole);
              break;
            }

            // Whole lines that fit at the foot of this page.
            final room = limit - used - gapFor(whole);
            var lineBottom = 0.0;
            var lines = 0;
            for (final m in p.computeLineMetrics()) {
              if (lineBottom + m.height > room) break;
              lineBottom += m.height;
              lines++;
            }
            var fitWords = 0;
            if (lines > 0) {
              final end = p
                  .getLineBoundary(
                    p.getPositionForOffset(Offset(1, lineBottom - 1)),
                  )
                  .end;
              var offset = indent ? 1 : 0;
              for (var n = from; n < total; n++) {
                if (offset >= end) break;
                fitWords++;
                offset += block.words[n].t.length + (block.words[n].sp ? 1 : 0);
              }
            }
            p.dispose();

            if (fitWords >= total - from) {
              place(whole);
              break;
            }
            if (fitWords >= _minSplitWords || (fitWords > 0 && pageEmpty())) {
              final pieceHeight = t.height(
                t.words(
                  block.words,
                  from,
                  from + fitWords,
                  base,
                  indent: indent,
                  inItalic: block.quote,
                ),
                width,
                align: TextAlign.justify,
              );
              place(
                ParaItem(
                  block,
                  from,
                  from + fitWords,
                  indent,
                  pieceHeight,
                  margin,
                  margin,
                ),
              );
              from += fitWords;
              flush((ci, bi, from));
            } else if (pageEmpty()) {
              // Too big even for an empty page: place it and move on.
              place(whole);
              flush((ci, bi + 1, 0));
              break;
            } else {
              flush((ci, bi, from));
            }
          }

        case RHead():
          final item = HeadItem(
            block,
            t.height(t.inline(block.text, t.heading(block.level)), g.cw),
            em * 1.05,
            em * 0.45,
          );
          if (!fits(item)) flush((ci, bi, 0));
          place(item);

        case RList():
          for (var k = 0; k < block.items.length; k++) {
            final item = ListItemPiece(
              block,
              k,
              t.height(
                t.words(block.items[k], 0, block.items[k].length, t.body),
                g.cw - em * 1.3,
              ),
              k == 0 ? em * 0.4 : em * 0.15,
              k == block.items.length - 1 ? em * 0.6 : em * 0.15,
            );
            if (!fits(item) && !pageEmpty()) flush((ci, bi, k));
            place(item);
          }

        case RTable():
          final item = TableItem(
            block,
            _tableHeight(block, t),
            em * 0.6,
            em * 0.6,
          );
          if (!fits(item) && !pageEmpty()) flush((ci, bi, 0));
          place(item);

        case RFigure():
          final imageHeight = math.min(g.cw * 2 / 3, g.ch * 0.6);
          final captionHeight = block.caption.isEmpty
              ? 0.0
              : em * 0.8 * 0.45 +
                    t.height(
                      t.inline(block.caption, t.caption),
                      g.cw,
                      align: TextAlign.center,
                    );
          final item = FigureItem(
            block,
            imageHeight,
            imageHeight + captionHeight,
            em * 0.85,
            em * 0.85,
          );
          if (!fits(item) && !pageEmpty()) flush((ci, bi, 0));
          place(item);

        case RBreak():
          // A scene break never starts a page.
          if (items.isEmpty) continue;
          final item = BreakItem(
            t.height(TextSpan(text: '⁂', style: t.rule), g.cw),
            em * 0.8,
            em * 0.8,
          );
          if (fits(item)) place(item);
      }
    }

    if (items.isNotEmpty) pages.add(BookPage(ci, start, items, anchor));
    // Let a frame through between chapters.
    await Future<void>.delayed(Duration.zero);
  }
  return pages;
}

ChapterHeadItem _chapterHead(ChapterContent chapter, PageType t) {
  final g = t.g;
  final em = t.em;
  final hasImage = (chapter.imageUrl ?? '').isNotEmpty;
  final imageHeight = hasImage ? math.min(g.cw * 2 / 3, g.ch * 0.44) : 0.0;
  final number = t.height(
    TextSpan(text: 'CHAPTER ${chapter.number}', style: t.chapterNumber),
    g.cw,
    align: TextAlign.center,
  );
  final title = t.height(
    TextSpan(text: chapter.title, style: t.chapterTitle),
    g.cw,
    align: TextAlign.center,
  );
  final ornament = t.height(
    TextSpan(text: '✦', style: t.ornament),
    g.cw,
    align: TextAlign.center,
  );
  final height =
      (hasImage ? imageHeight + em * 1.3 : g.ch * 0.12) +
      number +
      em * 0.7 +
      title +
      em * 0.6 +
      ornament;
  return ChapterHeadItem(chapter, imageHeight, height, 0, em * 1.5);
}

int _columns(RTable table) =>
    table.rows.fold(table.headers.length, (n, r) => math.max(n, r.length));

double _tableHeight(RTable table, PageType t) {
  final fs = t.em * 0.8;
  final cols = math.max(1, _columns(table));
  final colWidth = t.g.cw / cols - fs * 0.8;
  double row(List<String> cells, TextStyle style) {
    var h = 0.0;
    for (final cell in cells) {
      h = math.max(h, t.height(t.inline(cell, style), colWidth));
    }
    return h + fs * 0.6 + 1;
  }

  var total = row(table.headers, t.tableHead);
  for (final r in table.rows) {
    total += row(r, t.table);
  }
  return total;
}

/// Draws a page's text area. Every item uses the span and width it was
/// measured with.
class PageBody extends StatelessWidget {
  const PageBody({super.key, required this.page, required this.type});

  final BookPage page;
  final PageType type;

  @override
  Widget build(BuildContext context) {
    final t = type;
    final g = t.g;
    return ClipRect(
      child: OverflowBox(
        alignment: Alignment.topLeft,
        minHeight: 0,
        maxHeight: double.infinity,
        child: SizedBox(
          width: g.cw,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final item in page.items) ...[
                if (item.gap > 0) SizedBox(height: item.gap),
                _item(item),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _item(PageItem item) {
    final t = type;
    final g = t.g;
    final em = t.em;
    switch (item) {
      case ChapterHeadItem():
        final c = item.chapter;
        return SizedBox(
          width: g.cw,
          child: Column(
            children: [
              if (item.imageHeight > 0) ...[
                ClipRRect(
                  borderRadius: BorderRadius.circular(3),
                  child: SizedBox(
                    width: g.cw,
                    height: item.imageHeight,
                    child: CachedNetworkImage(
                      imageUrl: resolveImageUrl(c.imageUrl!),
                      fit: BoxFit.cover,
                      placeholder: (_, _) => ColoredBox(color: t.theme.rule),
                      errorWidget: (_, _, _) => ColoredBox(color: t.theme.rule),
                    ),
                  ),
                ),
                SizedBox(height: em * 1.3),
              ] else
                SizedBox(height: g.ch * 0.12),
              t.text(
                TextSpan(text: 'CHAPTER ${c.number}', style: t.chapterNumber),
                align: TextAlign.center,
              ),
              SizedBox(height: em * 0.7),
              SizedBox(
                width: g.cw,
                child: t.text(
                  TextSpan(text: c.title, style: t.chapterTitle),
                  align: TextAlign.center,
                ),
              ),
              SizedBox(height: em * 0.6),
              t.text(
                TextSpan(text: '✦', style: t.ornament),
                align: TextAlign.center,
              ),
            ],
          ),
        );
      case ParaItem():
        final b = item.block;
        final text = SizedBox(
          width: b.quote ? g.cw - em * 2.4 : g.cw,
          child: t.text(
            t.words(
              b.words,
              item.from,
              item.to,
              b.quote ? t.italic : t.body,
              indent: item.indent,
              inItalic: b.quote,
            ),
            align: TextAlign.justify,
          ),
        );
        return b.quote
            ? Padding(
                padding: EdgeInsets.symmetric(horizontal: em * 1.2),
                child: text,
              )
            : text;
      case HeadItem():
        return SizedBox(
          width: g.cw,
          child: t.text(t.inline(item.block.text, t.heading(item.block.level))),
        );
      case ListItemPiece():
        final words = item.block.items[item.index];
        final marker = item.block.ordered ? '${item.index + 1}.' : '•';
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: em * 1.3,
              child: t.text(TextSpan(text: marker, style: t.body)),
            ),
            SizedBox(
              width: g.cw - em * 1.3,
              child: t.text(t.words(words, 0, words.length, t.body)),
            ),
          ],
        );
      case TableItem():
        final fs = em * 0.8;
        final cols = math.max(1, _columns(item.block));
        final colWidth = g.cw / cols;
        Widget row(List<String> cells, TextStyle style) => Container(
          padding: const EdgeInsets.only(bottom: 1),
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: t.theme.rule)),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (var c = 0; c < cols; c++)
                SizedBox(
                  width: colWidth,
                  child: Padding(
                    padding: EdgeInsets.symmetric(
                      horizontal: fs * 0.4,
                      vertical: fs * 0.3,
                    ),
                    child: t.text(
                      t.inline(c < cells.length ? cells[c] : '', style),
                    ),
                  ),
                ),
            ],
          ),
        );
        return Column(
          children: [
            row(item.block.headers, t.tableHead),
            for (final r in item.block.rows) row(r, t.table),
          ],
        );
      case FigureItem():
        final caption = item.block.caption;
        return SizedBox(
          width: g.cw,
          child: Column(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(3),
                child: SizedBox(
                  width: g.cw,
                  height: item.imageHeight,
                  child: CachedNetworkImage(
                    imageUrl: item.block.src,
                    fit: BoxFit.cover,
                    placeholder: (_, _) => ColoredBox(color: t.theme.rule),
                    errorWidget: (_, _, _) => ColoredBox(color: t.theme.rule),
                  ),
                ),
              ),
              if (caption.isNotEmpty) ...[
                SizedBox(height: em * 0.8 * 0.45),
                SizedBox(
                  width: g.cw,
                  child: t.text(
                    t.inline(caption, t.caption),
                    align: TextAlign.center,
                  ),
                ),
              ],
            ],
          ),
        );
      case BreakItem():
        return SizedBox(
          width: g.cw,
          child: t.text(
            TextSpan(text: '⁂', style: t.rule),
            align: TextAlign.center,
          ),
        );
    }
  }
}
