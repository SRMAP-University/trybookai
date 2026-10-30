import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:bookai_mobile/models/book_content.dart';
import 'package:bookai_mobile/providers/books_provider.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/manuscript_view.dart';

/// Reads your own book chapter by chapter, swiping between chapters.
class BookReaderScreen extends StatefulWidget {
  const BookReaderScreen({super.key, required this.bookId, this.chapterId});

  final String bookId;

  /// Open at this chapter instead of where the reader left off.
  final String? chapterId;

  @override
  State<BookReaderScreen> createState() => _BookReaderScreenState();
}

class _BookReaderScreenState extends State<BookReaderScreen> {
  static const _storage = FlutterSecureStorage();
  static const _themeKey = 'reader_theme';
  static const _fontKey = 'reader_font_size';
  String get _posKey => 'reader_pos_${widget.bookId}';

  BookContent? _book;
  List<ChapterContent> _chapters = const [];
  bool _loading = true;
  String? _error;
  ReaderPalette _palette = ReaderPalette.paper;
  double _fontSize = 18;
  int _index = 0;
  PageController? _pages;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _pages?.dispose();
    super.dispose();
  }

  Future<String?> _read(String key) async {
    try {
      return await _storage.read(key: key);
    } catch (_) {
      return null;
    }
  }

  void _write(String key, String value) {
    unawaited(_storage.write(key: key, value: value).catchError((_) {}));
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final books = context.read<BooksProvider>();
    final results = await Future.wait([
      books.fetchContent(widget.bookId),
      _read(_themeKey),
      _read(_fontKey),
      _read(_posKey),
    ]);
    if (!mounted) return;
    final book = results[0] as BookContent?;
    if (book == null) {
      setState(() {
        _loading = false;
        _error = books.error ?? 'Could not open this book.';
      });
      return;
    }
    final chapters = book.readable;
    final themeName = results[1] as String?;
    final font = double.tryParse((results[2] as String?) ?? '');
    final savedId = results[3] as String?;
    final startId = widget.chapterId ?? savedId;
    final start = chapters.indexWhere((c) => c.id == startId);
    _pages?.dispose();
    final index = start < 0 ? 0 : start;
    setState(() {
      _book = book;
      _chapters = chapters;
      _palette = ReaderPalette.all.firstWhere(
        (p) => p.name == themeName,
        orElse: () => ReaderPalette.paper,
      );
      if (font != null) _fontSize = font.clamp(14, 28);
      _index = index;
      _pages = PageController(initialPage: index);
      _loading = false;
    });
  }

  void _goTo(int index) {
    if (index < 0 || index >= _chapters.length) return;
    _pages?.animateToPage(
      index,
      duration: const Duration(milliseconds: 320),
      curve: Curves.easeOutCubic,
    );
  }

  void _onPage(int index) {
    setState(() => _index = index);
    _write(_posKey, _chapters[index].id);
  }

  void _setPalette(ReaderPalette p) {
    setState(() => _palette = p);
    _write(_themeKey, p.name);
  }

  void _setFont(double size) {
    setState(() => _fontSize = size.clamp(14, 28));
    _write(_fontKey, _fontSize.toStringAsFixed(0));
  }

  @override
  Widget build(BuildContext context) {
    final p = _palette;
    final chapter = _chapters.isEmpty ? null : _chapters[_index];
    return Scaffold(
      backgroundColor: p.background,
      appBar: AppBar(
        backgroundColor: p.background,
        surfaceTintColor: Colors.transparent,
        foregroundColor: p.text,
        titleSpacing: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _book?.title ?? 'Reading',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: p.text,
              ),
            ),
            if (chapter != null)
              Text(
                'Chapter ${chapter.number} of ${_book!.chapters.length}',
                style: TextStyle(fontSize: 12, color: p.muted),
              ),
          ],
        ),
        actions: [
          if (_chapters.isNotEmpty) ...[
            IconButton(
              tooltip: 'Contents',
              icon: const Icon(Icons.format_list_bulleted_rounded),
              onPressed: _showContents,
            ),
            IconButton(
              tooltip: 'Reading options',
              icon: const Icon(Icons.text_fields_rounded),
              onPressed: _showOptions,
            ),
          ],
        ],
      ),
      body: _body(),
      bottomNavigationBar: _chapters.length < 2
          ? null
          : SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 10),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(99),
                  child: LinearProgressIndicator(
                    value: (_index + 1) / _chapters.length,
                    minHeight: 4,
                    color: AppColors.primary,
                    backgroundColor: p.rule,
                  ),
                ),
              ),
            ),
    );
  }

  Widget _body() {
    final p = _palette;
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return _message(_error!, action: ('Try again', _load));
    }
    if (_chapters.isEmpty) {
      return _message(
        _book?.status == 'GENERATING' || _book?.status == 'OUTLINING'
            ? 'The first chapter is still being written. Check back in a minute.'
            : 'There is nothing to read yet.',
      );
    }
    return PageView.builder(
      controller: _pages,
      itemCount: _chapters.length,
      onPageChanged: _onPage,
      itemBuilder: (context, i) {
        final c = _chapters[i];
        final multi = c.sections.where((s) => s.title.trim().isNotEmpty).length > 1;
        return SingleChildScrollView(
          key: PageStorageKey('chapter_${c.id}'),
          padding: const EdgeInsets.fromLTRB(22, 8, 22, 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'CHAPTER ${c.number}',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 12,
                  letterSpacing: 2,
                  fontWeight: FontWeight.w800,
                  color: AppColors.primary,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                c.title,
                textAlign: TextAlign.center,
                style: GoogleFonts.literata(
                  fontSize: _fontSize * 1.45,
                  fontWeight: FontWeight.w700,
                  height: 1.25,
                  color: p.text,
                ),
              ),
              const SizedBox(height: 20),
              if (c.imageUrl != null && c.imageUrl!.isNotEmpty) ...[
                ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: AspectRatio(
                    aspectRatio: 3 / 2,
                    child: CachedNetworkImage(
                      imageUrl: resolveImageUrl(c.imageUrl!),
                      fit: BoxFit.cover,
                      placeholder: (_, _) => ColoredBox(color: p.rule),
                      errorWidget: (_, _, _) => ColoredBox(color: p.rule),
                    ),
                  ),
                ),
                const SizedBox(height: 20),
              ],
              for (final s in c.sections)
                if ((s.content ?? '').trim().isNotEmpty) ...[
                  if (multi && s.title.trim().isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 6, bottom: 10),
                      child: Text(
                        s.title,
                        style: GoogleFonts.nunito(
                          fontSize: _fontSize * 1.1,
                          fontWeight: FontWeight.w800,
                          color: p.text,
                        ),
                      ),
                    ),
                  ManuscriptView(
                    content: s.content!,
                    palette: p,
                    fontSize: _fontSize,
                  ),
                ],
              const SizedBox(height: 18),
              _chapterNav(i),
            ],
          ),
        );
      },
    );
  }

  Widget _chapterNav(int i) {
    final p = _palette;
    final style = TextButton.styleFrom(foregroundColor: p.text);
    return Row(
      children: [
        if (i > 0)
          TextButton.icon(
            style: style,
            onPressed: () => _goTo(i - 1),
            icon: const Icon(Icons.chevron_left_rounded),
            label: const Text('Previous'),
          ),
        const Spacer(),
        if (i < _chapters.length - 1)
          FilledButton.icon(
            onPressed: () => _goTo(i + 1),
            icon: const Icon(Icons.chevron_right_rounded),
            label: const Text('Next chapter'),
          )
        else
          Text(
            'The end',
            style: GoogleFonts.literata(
              fontStyle: FontStyle.italic,
              color: p.muted,
              fontSize: 15,
            ),
          ),
      ],
    );
  }

  Widget _message(String text, {(String, VoidCallback)? action}) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.menu_book_rounded, size: 40, color: _palette.muted),
            const SizedBox(height: 12),
            Text(
              text,
              textAlign: TextAlign.center,
              style: TextStyle(color: _palette.muted, fontSize: 15),
            ),
            if (action != null) ...[
              const SizedBox(height: 16),
              FilledButton(onPressed: action.$2, child: Text(action.$1)),
            ],
          ],
        ),
      ),
    );
  }

  void _showContents() {
    final p = _palette;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: p.background,
      builder: (ctx) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.6,
        maxChildSize: 0.9,
        builder: (ctx, scroll) => ListView(
          controller: scroll,
          padding: const EdgeInsets.fromLTRB(8, 12, 8, 24),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: Text(
                'Contents',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: p.text,
                ),
              ),
            ),
            for (var i = 0; i < _chapters.length; i++)
              ListTile(
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
                selected: i == _index,
                selectedTileColor: AppColors.primary.withValues(alpha: 0.1),
                leading: Text(
                  '${_chapters[i].number}',
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    color: i == _index ? AppColors.primary : p.muted,
                  ),
                ),
                title: Text(
                  _chapters[i].title,
                  style: TextStyle(
                    color: p.text,
                    fontWeight: i == _index ? FontWeight.w800 : FontWeight.w500,
                  ),
                ),
                onTap: () {
                  Navigator.pop(ctx);
                  _pages?.jumpToPage(i);
                },
              ),
          ],
        ),
      ),
    );
  }

  void _showOptions() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: _palette.background,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) {
          final p = _palette;
          return SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Page',
                    style: TextStyle(fontWeight: FontWeight.w800, color: p.text),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      for (final option in ReaderPalette.all)
                        Expanded(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 4),
                            child: InkWell(
                              borderRadius: BorderRadius.circular(14),
                              onTap: () {
                                _setPalette(option);
                                setSheet(() {});
                              },
                              child: Container(
                                height: 52,
                                alignment: Alignment.center,
                                decoration: BoxDecoration(
                                  color: option.background,
                                  borderRadius: BorderRadius.circular(14),
                                  border: Border.all(
                                    color: option == p
                                        ? AppColors.primary
                                        : option.rule,
                                    width: option == p ? 2 : 1,
                                  ),
                                ),
                                child: Text(
                                  option.name,
                                  style: TextStyle(
                                    color: option.text,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  Text(
                    'Text size',
                    style: TextStyle(fontWeight: FontWeight.w800, color: p.text),
                  ),
                  Row(
                    children: [
                      Text('A', style: TextStyle(fontSize: 14, color: p.muted)),
                      Expanded(
                        child: Slider(
                          value: _fontSize,
                          min: 14,
                          max: 28,
                          divisions: 7,
                          activeColor: AppColors.primary,
                          onChanged: (v) {
                            _setFont(v);
                            setSheet(() {});
                          },
                        ),
                      ),
                      Text('A', style: TextStyle(fontSize: 24, color: p.muted)),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
