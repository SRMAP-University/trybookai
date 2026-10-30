/// The reader's view of a chapter: paragraphs as words so they can split
/// across pages. A port of the website's `src/lib/reader/blocks.ts`.
library;

import 'package:bookai_mobile/models/book_content.dart';
import 'package:bookai_mobile/widgets/manuscript_view.dart';

/// One word with its inline style; [sp] when a space follows it.
class Word {
  Word(this.t, {this.b = false, this.i = false, this.c = false});

  final String t;
  final bool b;
  final bool i;
  final bool c;
  bool sp = false;
}

/// A unit the paginator places on pages. Paragraphs and lists can split.
sealed class ReaderBlock {}

class RPara extends ReaderBlock {
  RPara(this.words, {this.quote = false, this.noIndent = false});
  final List<Word> words;
  final bool quote;
  final bool noIndent;
}

class RHead extends ReaderBlock {
  RHead(this.level, this.text);
  final int level;
  final String text;
}

class RList extends ReaderBlock {
  RList(this.ordered, this.items);
  final bool ordered;
  final List<List<Word>> items;
}

class RTable extends ReaderBlock {
  RTable(this.headers, this.rows);
  final List<String> headers;
  final List<List<String>> rows;
}

class RFigure extends ReaderBlock {
  RFigure(this.src, this.caption);
  final String src;
  final String caption;
}

class RBreak extends ReaderBlock {}

final _inlineToken = RegExp(r'(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)');
final _wordOrSpace = RegExp(r'\s+|\S+');

/// `**bold**`, `*italic*` and `` `code` `` split into styled words.
List<Word> toWords(String text) {
  final words = <Word>[];
  void add(String chunk, {bool b = false, bool i = false, bool c = false}) {
    for (final m in _wordOrSpace.allMatches(chunk)) {
      final part = m.group(0)!;
      if (part.trim().isEmpty) {
        if (words.isNotEmpty) words.last.sp = true;
      } else {
        words.add(Word(part, b: b, i: i, c: c));
      }
    }
  }

  var last = 0;
  for (final m in _inlineToken.allMatches(text)) {
    if (m.start > last) add(text.substring(last, m.start));
    final token = m.group(0)!;
    if (token.startsWith('**')) {
      add(token.substring(2, token.length - 2), b: true);
    } else if (token.startsWith('*')) {
      add(token.substring(1, token.length - 1), i: true);
    } else {
      add(token.substring(1, token.length - 1), c: true);
    }
    last = m.end;
  }
  if (last < text.length) add(text.substring(last));
  return words;
}

/// A chapter's text as reader blocks. Narrative books get a scene break
/// between sections; other books show section titles as headings.
List<ReaderBlock> chapterBlocks(ChapterContent chapter, bool narrative) {
  final out = <ReaderBlock>[];
  var afterBreak = true;
  for (var si = 0; si < chapter.sections.length; si++) {
    final section = chapter.sections[si];
    final blocks = parseManuscript(section.content ?? '');
    if (blocks.isEmpty) continue;
    if (narrative) {
      if (si > 0 && out.isNotEmpty) {
        out.add(RBreak());
        afterBreak = true;
      }
    } else if (section.title.trim().isNotEmpty &&
        blocks.first is! HeadingBlock) {
      out.add(RHead(3, section.title.trim()));
      afterBreak = true;
    }
    for (final block in blocks) {
      switch (block) {
        case ParagraphBlock():
          out.add(RPara(toWords(block.text), noIndent: afterBreak));
          afterBreak = false;
        case QuoteBlock():
          out.add(RPara(toWords(block.text), quote: true, noIndent: true));
          afterBreak = false;
        case HeadingBlock():
          out.add(RHead(block.level <= 2 ? 3 : 4, block.text));
          afterBreak = true;
        case ListBlock():
          out.add(RList(block.ordered, block.items.map(toWords).toList()));
          afterBreak = false;
        case TableBlock():
          out.add(RTable(block.headers, block.rows));
          afterBreak = true;
        case FigureBlock():
          final src = block.src;
          if (src != null) {
            out.add(
              RFigure(
                resolveImageUrl(src),
                block.caption == 'Illustration' ? '' : block.caption,
              ),
            );
          }
        case RuleBlock():
          out.add(RBreak());
          afterBreak = true;
      }
    }
  }
  return out;
}

const _youthGenres = {"children's", 'childrens', 'young adult'};
const _practicalGenres = {
  'business',
  'technology',
  'education',
  'self-help',
  'self help',
  'health & wellness',
  'health',
  'non-fiction',
  'nonfiction',
};
const _academicGenres = {'history', 'philosophy', 'biography', 'science'};
const _structuredTemplates = {'business-guide', 'self-help', 'tech-handbook'};

/// Storytelling books (novels, memoir, YA, children's) vs. books that teach
/// or explain. Same rule as the server's `isNarrativeBook`.
bool isNarrativeBook(String? genre, String? templateId) {
  final g = (genre ?? '').trim().toLowerCase();
  final t = (templateId ?? '').trim().toLowerCase();
  if (_youthGenres.contains(g) || g.contains('children')) return true;
  if (_practicalGenres.contains(g) || _structuredTemplates.contains(t)) {
    return false;
  }
  if (_academicGenres.contains(g)) return false;
  return true;
}
