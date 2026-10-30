import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:bookai_mobile/config/api_config.dart';

/// Colours for one reader theme.
class ReaderPalette {
  const ReaderPalette({
    required this.name,
    required this.background,
    required this.text,
    required this.muted,
    required this.rule,
  });

  final String name;
  final Color background;
  final Color text;
  final Color muted;
  final Color rule;

  static const paper = ReaderPalette(
    name: 'Paper',
    background: Color(0xFFFFFCF6),
    text: Color(0xFF2A2320),
    muted: Color(0xFF7A6D64),
    rule: Color(0xFFE8DDCF),
  );
  static const sepia = ReaderPalette(
    name: 'Sepia',
    background: Color(0xFFF3E7D0),
    text: Color(0xFF4B3A2A),
    muted: Color(0xFF8A7457),
    rule: Color(0xFFDCCBAA),
  );
  static const night = ReaderPalette(
    name: 'Night',
    background: Color(0xFF1C1916),
    text: Color(0xFFE9E2D8),
    muted: Color(0xFFA2988C),
    rule: Color(0xFF3A342E),
  );
  static const all = [paper, sepia, night];
}

/// One block of manuscript text. Same rules as the website's
/// `src/lib/book-content-blocks.ts`.
sealed class ManuscriptBlock {}

class HeadingBlock extends ManuscriptBlock {
  HeadingBlock(this.level, this.text);
  final int level;
  final String text;
}

class ParagraphBlock extends ManuscriptBlock {
  ParagraphBlock(this.text);
  final String text;
}

class ListBlock extends ManuscriptBlock {
  ListBlock(this.ordered, this.items);
  final bool ordered;
  final List<String> items;
}

class TableBlock extends ManuscriptBlock {
  TableBlock(this.headers, this.rows);
  final List<String> headers;
  final List<List<String>> rows;
}

class FigureBlock extends ManuscriptBlock {
  FigureBlock(this.caption, this.src);
  final String caption;
  final String? src;
}

class QuoteBlock extends ManuscriptBlock {
  QuoteBlock(this.text);
  final String text;
}

class RuleBlock extends ManuscriptBlock {}

/// Drops a reasoning model's thinking that leaked into saved prose (same as
/// the server's `stripReasoning`).
String stripReasoning(String text) {
  var out = text.replaceAll(
    RegExp(r'<think>[\s\S]*?</think>', caseSensitive: false),
    '',
  );
  final strayClose = out.toLowerCase().lastIndexOf('</think>');
  if (strayClose >= 0) out = out.substring(strayClose + '</think>'.length);
  final open = out.toLowerCase().indexOf('<think>');
  if (open >= 0) out = out.substring(0, open);
  return out
      .replaceAll(
        RegExp(r'<\|im_start\|>[\s\S]*?<\|im_end\|>', caseSensitive: false),
        '',
      )
      .trim();
}

final _rule = RegExp(r'^(-{3,}|\*{3,}|_{3,})$');
final _heading = RegExp(r'^(#{1,4})\s+(.+)$');
final _headingStart = RegExp(r'^(#{1,4})\s+');
final _figureMarker = RegExp(r'^\[FIGURE:\s*(.+?)\]\s*$', caseSensitive: false);
final _figureMd = RegExp(r'^!\[([^\]]*)\]\(([^)]+)\)\s*$');
final _separator = RegExp(r'^\s*\|?\s*:?-{3,}.*\|');
final _unordered = RegExp(r'^[-*+]\s+(.+)$');
final _ordered = RegExp(r'^\d+[.)]\s+(.+)$');
final _quotePrefix = RegExp(r'^\s*>\s?');

List<String> _splitRow(String line) {
  var cells = line.trim();
  if (cells.startsWith('|')) cells = cells.substring(1);
  if (cells.endsWith('|')) cells = cells.substring(0, cells.length - 1);
  return cells.split('|').map((c) => c.trim()).toList();
}

FigureBlock? _parseFigure(String line) {
  final marker = _figureMarker.firstMatch(line);
  if (marker != null) return FigureBlock(marker.group(1)!.trim(), null);
  final md = _figureMd.firstMatch(line);
  if (md == null) return null;
  final caption = md.group(1)!.trim();
  return FigureBlock(caption.isEmpty ? 'Illustration' : caption, md.group(2)!.trim());
}

List<ManuscriptBlock> parseManuscript(String content) {
  final lines = stripReasoning(content).replaceAll('\r\n', '\n').split('\n');
  final blocks = <ManuscriptBlock>[];
  var i = 0;

  bool tableStartsAt(int at) =>
      lines[at].contains('|') &&
      at + 1 < lines.length &&
      _separator.hasMatch(lines[at + 1]);

  while (i < lines.length) {
    final trimmed = lines[i].trim();

    if (trimmed.isEmpty) {
      i++;
      continue;
    }

    if (_rule.hasMatch(trimmed)) {
      blocks.add(RuleBlock());
      i++;
      continue;
    }

    final heading = _heading.firstMatch(trimmed);
    if (heading != null) {
      blocks.add(HeadingBlock(heading.group(1)!.length, heading.group(2)!.trim()));
      i++;
      continue;
    }

    final figure = _parseFigure(trimmed);
    if (figure != null) {
      blocks.add(figure);
      i++;
      continue;
    }

    if (trimmed.startsWith('>')) {
      final quote = <String>[];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quote.add(lines[i].replaceFirst(_quotePrefix, ''));
        i++;
      }
      blocks.add(QuoteBlock(quote.join(' ')));
      continue;
    }

    if (tableStartsAt(i)) {
      final headers = _splitRow(trimmed);
      i += 2;
      final rows = <List<String>>[];
      while (i < lines.length &&
          lines[i].contains('|') &&
          !_separator.hasMatch(lines[i])) {
        if (lines[i].trim().isNotEmpty) rows.add(_splitRow(lines[i]));
        i++;
      }
      blocks.add(TableBlock(headers, rows));
      continue;
    }

    final isOrdered = _ordered.hasMatch(trimmed);
    if (isOrdered || _unordered.hasMatch(trimmed)) {
      final pattern = isOrdered ? _ordered : _unordered;
      final items = <String>[];
      while (i < lines.length) {
        final item = pattern.firstMatch(lines[i].trim());
        if (item == null) break;
        items.add(item.group(1)!);
        i++;
      }
      blocks.add(ListBlock(isOrdered, items));
      continue;
    }

    final para = <String>[];
    while (i < lines.length && lines[i].trim().isNotEmpty) {
      final next = lines[i].trim();
      if (_headingStart.hasMatch(next) ||
          _rule.hasMatch(next) ||
          _parseFigure(next) != null ||
          next.startsWith('>') ||
          RegExp(r'^[-*+]\s+').hasMatch(next) ||
          RegExp(r'^\d+[.)]\s+').hasMatch(next) ||
          tableStartsAt(i)) {
        break;
      }
      para.add(next);
      i++;
    }
    if (para.isNotEmpty) blocks.add(ParagraphBlock(para.join(' ')));
  }

  return blocks;
}

final _inline = RegExp(r'(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)');

/// `**bold**`, `*italic*` and `` `code` `` → one styled span.
TextSpan inlineSpan(String text, TextStyle base) {
  final children = <InlineSpan>[];
  var last = 0;
  for (final m in _inline.allMatches(text)) {
    if (m.start > last) children.add(TextSpan(text: text.substring(last, m.start)));
    final token = m.group(0)!;
    if (token.startsWith('**')) {
      children.add(TextSpan(
        text: token.substring(2, token.length - 2),
        style: const TextStyle(fontWeight: FontWeight.w800),
      ));
    } else if (token.startsWith('*')) {
      children.add(TextSpan(
        text: token.substring(1, token.length - 1),
        style: const TextStyle(fontStyle: FontStyle.italic),
      ));
    } else {
      children.add(TextSpan(
        text: token.substring(1, token.length - 1),
        style: const TextStyle(fontFamily: 'monospace'),
      ));
    }
    last = m.end;
  }
  if (last < text.length) children.add(TextSpan(text: text.substring(last)));
  return TextSpan(style: base, children: children);
}

/// Pictures saved with a site-relative path load from the BookAI server.
String resolveImageUrl(String src) =>
    src.startsWith('/') ? '${ApiConfig.baseUrl}$src' : src;

/// Renders manuscript text with the given palette and size.
class ManuscriptView extends StatelessWidget {
  const ManuscriptView({
    super.key,
    required this.content,
    required this.palette,
    this.fontSize = 18,
  });

  final String content;
  final ReaderPalette palette;
  final double fontSize;

  @override
  Widget build(BuildContext context) {
    final body = GoogleFonts.literata(
      fontSize: fontSize,
      height: 1.65,
      color: palette.text,
    );
    final heading = GoogleFonts.nunito(
      fontWeight: FontWeight.w800,
      height: 1.3,
      color: palette.text,
    );
    final blocks = parseManuscript(content);
    if (blocks.isEmpty) {
      return Text(
        'Not written yet.',
        style: body.copyWith(fontStyle: FontStyle.italic, color: palette.muted),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [for (final b in blocks) _block(b, body, heading)],
    );
  }

  Widget _block(ManuscriptBlock b, TextStyle body, TextStyle heading) {
    switch (b) {
      case HeadingBlock():
        return Padding(
          padding: const EdgeInsets.only(top: 14, bottom: 8),
          child: Text.rich(
            inlineSpan(
              b.text,
              heading.copyWith(fontSize: fontSize * (b.level <= 2 ? 1.25 : 1.08)),
            ),
          ),
        );
      case ParagraphBlock():
        return Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: Text.rich(inlineSpan(b.text, body)),
        );
      case QuoteBlock():
        return Container(
          margin: const EdgeInsets.only(bottom: 14),
          padding: const EdgeInsets.only(left: 14),
          decoration: BoxDecoration(
            border: Border(left: BorderSide(color: palette.rule, width: 3)),
          ),
          child: Text.rich(
            inlineSpan(
              b.text,
              body.copyWith(fontStyle: FontStyle.italic, color: palette.muted),
            ),
          ),
        );
      case ListBlock():
        return Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (var i = 0; i < b.items.length; i++)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                        width: fontSize * 1.6,
                        child: Text(b.ordered ? '${i + 1}.' : '•', style: body),
                      ),
                      Expanded(child: Text.rich(inlineSpan(b.items[i], body))),
                    ],
                  ),
                ),
            ],
          ),
        );
      case TableBlock():
        final small = body.copyWith(fontSize: fontSize * 0.8, height: 1.4);
        final columns = b.rows.fold<int>(
          b.headers.length,
          (n, r) => r.length > n ? r.length : n,
        );
        String cell(List<String> row, int c) => c < row.length ? row[c] : '';
        return Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Table(
              defaultColumnWidth: const IntrinsicColumnWidth(),
              border: TableBorder.all(color: palette.rule),
              children: [
                TableRow(
                  children: [
                    for (var c = 0; c < columns; c++)
                      Padding(
                        padding: const EdgeInsets.all(8),
                        child: Text.rich(
                          inlineSpan(
                            cell(b.headers, c),
                            small.copyWith(fontWeight: FontWeight.w800),
                          ),
                        ),
                      ),
                  ],
                ),
                for (final r in b.rows)
                  TableRow(
                    children: [
                      for (var c = 0; c < columns; c++)
                        Padding(
                          padding: const EdgeInsets.all(8),
                          child: Text.rich(inlineSpan(cell(r, c), small)),
                        ),
                    ],
                  ),
              ],
            ),
          ),
        );
      case FigureBlock():
        final caption = b.src != null && b.caption == 'Illustration'
            ? null
            : (b.src == null ? 'Illustration: ${b.caption}' : b.caption);
        return Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: Column(
            children: [
              if (b.src != null)
                ClipRRect(
                  borderRadius: BorderRadius.circular(14),
                  child: CachedNetworkImage(
                    imageUrl: resolveImageUrl(b.src!),
                    fit: BoxFit.cover,
                    placeholder: (_, _) => AspectRatio(
                      aspectRatio: 4 / 3,
                      child: ColoredBox(color: palette.rule),
                    ),
                    errorWidget: (_, _, _) => const SizedBox.shrink(),
                  ),
                ),
              if (caption != null) ...[
                const SizedBox(height: 6),
                Text(
                  caption,
                  textAlign: TextAlign.center,
                  style: body.copyWith(
                    fontSize: fontSize * 0.75,
                    fontStyle: FontStyle.italic,
                    color: palette.muted,
                  ),
                ),
              ],
            ],
          ),
        );
      case RuleBlock():
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 18),
          child: Center(
            child: Text('✦   ✦   ✦', style: TextStyle(color: palette.muted)),
          ),
        );
    }
  }
}
