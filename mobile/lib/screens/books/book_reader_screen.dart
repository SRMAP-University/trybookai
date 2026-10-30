import 'dart:async';
import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:provider/provider.dart';
import 'package:bookai_mobile/config/api_config.dart';
import 'package:bookai_mobile/models/book_content.dart';
import 'package:bookai_mobile/providers/auth_provider.dart';
import 'package:bookai_mobile/providers/books_provider.dart';
import 'package:bookai_mobile/reader/book_pages.dart';
import 'package:bookai_mobile/reader/reader_blocks.dart';
import 'package:bookai_mobile/reader/reader_cache.dart';
import 'package:bookai_mobile/services/api_client.dart';
import 'package:bookai_mobile/services/reader_memory.dart';
import 'package:bookai_mobile/theme/app_theme.dart';

/// Reads your own book as a printed book, like the website reader: cover,
/// title page, laid-out pages with running heads and page numbers, the end
/// and the back cover. Swipe or tap the sides to turn pages.
class BookReaderScreen extends StatefulWidget {
  const BookReaderScreen({
    super.key,
    this.bookId = '',
    this.chapterId,
    this.publicSlug,
  });

  /// Your own book.
  final String bookId;

  /// Someone's public book instead, read the same way.
  final String? publicSlug;

  /// Open at this chapter instead of where the reader left off.
  final String? chapterId;

  @override
  State<BookReaderScreen> createState() => _BookReaderScreenState();
}

class _BookReaderScreenState extends State<BookReaderScreen>
    with SingleTickerProviderStateMixin {
  static const _storage = FlutterSecureStorage();
  static const _themeKey = 'reader_theme';
  static const _stepKey = 'reader_size_step';
  static const _turnCurve = Cubic(0.42, 0.06, 0.24, 1);
  static const _topBar = 52.0;
  static const _bottomBar = 60.0;

  /// Where this book's copy, layout and place are kept on the phone.
  String get _key =>
      widget.publicSlug != null ? 'pub_${widget.publicSlug}' : widget.bookId;
  String get _anchorKey => 'reader_anchor_$_key';
  String get _oldPosKey => 'reader_pos_$_key';

  /// A public book's author, for its cover and title page.
  String? _publicAuthor;

  BookContent? _book;
  List<ChapterContent> _chapters = const [];
  bool _narrative = true;
  bool _illustrated = false;
  bool _loading = true;
  String? _error;

  /// Short fingerprint of the text, so a saved layout is only reused for
  /// the same words.
  String _contentSig = '';
  String? _oldChapterId;

  ReaderTheme _theme = ReaderTheme.paper;
  int _step = 2;

  List<BookPage>? _pages;
  PageGeometry? _pagesGeometry;

  /// False while later chapters are still being laid out.
  bool _complete = false;
  String? _layoutKey;
  PaginationJob? _job;
  Anchor? _anchor;

  /// Where a new layout should open (null: the cover), and whether it has.
  Anchor? _placeTarget;
  bool _awaitingPlace = false;
  bool _openedOnce = false;

  /// Cover 0, title page 1, text pages from 2, then the end and back cover.
  int _slot = 0;
  int _dir = 0;
  double _dragDx = 0;
  bool _chrome = true;
  late final AnimationController _turn = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 560),
  );

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _job?.cancelled = true;
    _turn.dispose();
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

  /// Opens the copy saved on the phone straight away, then fetches the
  /// latest and switches to it only if the text changed.
  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final books = context.read<BooksProvider>();
    final prefs = await Future.wait([
      _read(_themeKey),
      _read(_stepKey),
      _read(_anchorKey),
      _read(_oldPosKey),
    ]);
    final cached = await ReaderCache.book(_key);
    if (!mounted) return;

    _theme = ReaderTheme.byId(prefs[0]);
    _step = (int.tryParse(prefs[1] ?? '') ?? 2).clamp(
      0,
      PageGeometry.fontSteps.length - 1,
    );
    final saved = prefs[2]?.split(',');
    if (saved != null && saved.length == 3) {
      final n = saved.map(int.tryParse).toList();
      if (!n.contains(null)) _anchor = (n[0]!, n[1]!, n[2]!);
    }
    _oldChapterId = prefs[3];

    BookContent? shown;
    if (cached != null) {
      try {
        _publicAuthor = cached['author'] as String?;
        shown = BookContent.fromJson(cached);
        _applyBook(shown);
      } catch (_) {}
    }

    final fresh = await _fetch(books);
    if (!mounted) return;
    if (fresh == null) {
      // Offline or failed: keep reading the saved copy if there is one.
      if (_book == null) {
        setState(() {
          _loading = false;
          _error = books.error ?? 'Could not open this book.';
        });
      }
      return;
    }
    _publicAuthor = fresh['author'] as String?;
    unawaited(ReaderCache.saveBook(_key, fresh));
    final latest = BookContent.fromJson(fresh);
    if (shown == null || _signature(latest) != _signature(shown)) {
      _applyBook(latest);
    }
  }

  /// The book's text: yours from the reading-only API, a public one from
  /// the public API in the same shape.
  Future<Map<String, dynamic>?> _fetch(BooksProvider books) async {
    final slug = widget.publicSlug;
    if (slug == null) return books.fetchReaderJson(widget.bookId);
    try {
      final api = context.read<ApiClient>();
      final res = await api.dio.get('${ApiConfig.publicBooks}/$slug');
      return publicBookAsContent(res.data as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  void _applyBook(BookContent book) {
    final chapters = book.readable;
    setState(() {
      _book = book;
      _chapters = chapters;
      _contentSig = _signature(book);
      _narrative = isNarrativeBook(book.genre, book.templateId);
      _illustrated = chapters.any(
        (c) =>
            (c.imageUrl ?? '').isNotEmpty ||
            c.sections.any(
              (s) => (s.content ?? '').contains('/illustrations/'),
            ),
      );
      if (_anchor == null && _oldChapterId != null) {
        // Older versions saved the chapter only.
        final ci = chapters.indexWhere((c) => c.id == _oldChapterId);
        if (ci >= 0) _anchor = (ci, 0, 0);
      }
      _loading = false;
    });
  }

  /// FNV-1a over every chapter's title and text, stable across launches.
  static String _signature(BookContent book) {
    var h = 0x811c9dc5;
    void add(String s) {
      for (final unit in s.codeUnits) {
        h = ((h ^ unit) * 0x01000193) & 0xffffffff;
      }
    }

    add(book.title);
    for (final c in book.chapters) {
      add('|${c.id}|${c.number}|${c.title}|${c.imageUrl ?? ''}');
      for (final s in c.sections) {
        add('|${s.title}|');
        add(s.content ?? '');
      }
    }
    return h.toRadixString(16);
  }

  // Layout -------------------------------------------------------------------

  /// Lays the book out again whenever the text, page or type size changes.
  /// A layout saved for the same key is reused; otherwise pages appear as
  /// soon as the chapter the reader is going to is laid out.
  void _ensureLayout(PageType type) {
    final book = _book;
    if (book == null || _chapters.isEmpty) return;
    final key = [
      'v1',
      book.id,
      _contentSig,
      _narrative,
      type.g.key,
      type.scaler.scale(10),
    ].join('|');
    if (key == _layoutKey) return;
    _layoutKey = key;
    _job?.cancelled = true;
    final job = PaginationJob();
    _job = job;

    var target = _currentAnchor() ?? _anchor;
    if (!_openedOnce && widget.chapterId != null) {
      final ci = _chapters.indexWhere((c) => c.id == widget.chapterId);
      if (ci >= 0) target = (ci, 0, 0);
    }
    _placeTarget = target;
    _awaitingPlace = true;
    final chapters = _chapters;
    final narrative = _narrative;

    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final saved = await ReaderCache.layout(book.id, key);
      if (job.cancelled || !mounted) return;
      final restored = saved == null
          ? null
          : decodePages(saved, chapters, narrative, type.g);
      if (restored != null) {
        _setPages(restored, type.g, complete: true);
        return;
      }
      await type.fontsReady();
      if (job.cancelled || !mounted) return;
      final pages = await paginateBook(
        chapters,
        narrative,
        type,
        job,
        onChapter: (soFar) {
          if (!job.cancelled && mounted) {
            _setPages(soFar, type.g, complete: false);
          }
        },
      );
      if (pages == null || job.cancelled || !mounted) return;
      _setPages(pages, type.g, complete: true);
      unawaited(ReaderCache.saveLayout(book.id, key, encodePages(pages)));
    });
  }

  /// Shows newly laid-out pages. A new layout waits until the page the
  /// reader is going to exists, so the old pages (or the cover) stay until
  /// then and the place never jumps.
  void _setPages(
    List<BookPage> pages,
    PageGeometry g, {
    required bool complete,
  }) {
    if (_awaitingPlace) {
      final target = _placeTarget;
      final ready =
          complete ||
          target == null ||
          (pages.isNotEmpty && pages.last.chapter > target.$1);
      if (!ready) return;
      setState(() {
        _pages = pages;
        _pagesGeometry = g;
        _complete = complete;
        _slot = _slotFor(pages, target);
        _dir = 0;
        _turn.value = 0;
      });
      _awaitingPlace = false;
      _openedOnce = true;
      _afterMove();
      return;
    }
    setState(() {
      _pages = pages;
      _pagesGeometry = g;
      _complete = complete;
    });
  }

  int _slotFor(List<BookPage> pages, Anchor? target) {
    if (target == null) {
      if (!_openedOnce) return 0;
      // Cover and title page stay put; the end moves with the page count.
      return _slot <= 1 ? _slot : pages.length + 2;
    }
    var index = 0;
    for (var i = 0; i < pages.length; i++) {
      if (compareAnchors(pages[i].anchor, target) <= 0) index = i;
    }
    return index + 2;
  }

  BookPage? _pageAt(int slot) {
    final pages = _pages;
    if (pages == null || slot < 2 || slot - 2 >= pages.length) return null;
    return pages[slot - 2];
  }

  Anchor? _currentAnchor() => _pageAt(_slot)?.anchor;

  /// Until the layout is complete there's one "more pages coming" slot.
  int get _slotCount =>
      _pages == null ? 2 : _pages!.length + (_complete ? 4 : 3);

  void _afterMove() {
    final page = _pageAt(_slot);
    final book = _book;
    if (page == null || book == null) return;
    final a = page.anchor;
    _anchor = a;
    _write(_anchorKey, '${a.$1},${a.$2},${a.$3}');
    ReaderMemory.remember(
      book.id,
      _chapters[page.chapter].number,
      book.chapters.length,
    );
  }

  // Turning --------------------------------------------------------------------

  bool _canGo(int dir) =>
      dir > 0 ? _pages != null && _slot < _slotCount - 1 : _slot > 0;

  void _go(int dir) {
    if (_dir != 0 || !_canGo(dir)) return;
    if (AppMotion.reduced(context)) {
      setState(() => _slot += dir);
      _afterMove();
      return;
    }
    setState(() => _dir = dir);
    _turn.value = 0;
    _turn.animateTo(1, curve: _turnCurve).whenComplete(_finishTurn);
  }

  void _finishTurn() {
    if (!mounted || _dir == 0 || _turn.value < 1) return;
    setState(() {
      _slot += _dir;
      _dir = 0;
      _turn.value = 0;
      if (_slot >= 2) _chrome = false;
    });
    _afterMove();
  }

  void _jumpTo(int slot) {
    if (_dir != 0) return;
    setState(() => _slot = slot.clamp(0, _slotCount - 1));
    _afterMove();
  }

  void _onDragUpdate(DragUpdateDetails d, double width) {
    if (_turn.isAnimating) return;
    _dragDx += d.delta.dx;
    if (_dir == 0) {
      final dir = _dragDx < 0 ? 1 : -1;
      if (!_canGo(dir)) return;
      setState(() => _dir = dir);
    }
    final pulled = _dir > 0 ? -_dragDx : _dragDx;
    _turn.value = (pulled / width).clamp(0.0, 1.0);
  }

  void _onDragEnd(DragEndDetails d) {
    _dragDx = 0;
    if (_dir == 0 || _turn.isAnimating) return;
    final v = d.primaryVelocity ?? 0;
    final flung = _dir > 0 ? v < -350 : v > 350;
    if (_turn.value > 0.33 || flung) {
      _turn
          .animateTo(
            1,
            curve: Curves.easeOut,
            duration: const Duration(milliseconds: 280),
          )
          .whenComplete(_finishTurn);
    } else {
      _turn
          .animateBack(
            0,
            curve: Curves.easeOut,
            duration: const Duration(milliseconds: 220),
          )
          .whenComplete(() {
            if (mounted && _turn.value == 0) setState(() => _dir = 0);
          });
    }
  }

  void _onTap(TapUpDetails d, double width) {
    final x = d.localPosition.dx / width;
    if (x < 0.3) {
      _go(-1);
    } else if (x > 0.6) {
      _go(1);
    } else {
      setState(() => _chrome = !_chrome);
    }
  }

  // Build ------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final theme = _theme;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: theme.table.last,
        body: DecoratedBox(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              center: const Alignment(0, -0.24),
              radius: 1.1,
              colors: theme.table,
              stops: const [0, 0.58, 1],
            ),
          ),
          child: SafeArea(
            child: LayoutBuilder(
              builder: (context, box) => _stage(context, box),
            ),
          ),
        ),
      ),
    );
  }

  Widget _stage(BuildContext context, BoxConstraints box) {
    if (_loading) {
      return const Center(
        child: CircularProgressIndicator(color: Colors.white70),
      );
    }
    if (_error != null || _book == null) {
      return _message(_error ?? 'Could not open this book.', retry: true);
    }
    if (_chapters.isEmpty) {
      return _message(
        _book!.status == 'GENERATING' || _book!.status == 'OUTLINING'
            ? 'The first chapter is still being written. Check back in a minute.'
            : 'There is nothing to read yet.',
      );
    }

    final scaler = MediaQuery.textScalerOf(context);
    final locale = Localizations.maybeLocaleOf(context);
    final space = Size(
      box.maxWidth - 16,
      box.maxHeight - _topBar - _bottomBar - 12,
    );
    _ensureLayout(
      PageType(PageGeometry.fit(space, _step), _theme, scaler, locale),
    );

    final g = _pagesGeometry ?? PageGeometry.fit(space, _step);
    final type = PageType(g, _theme, scaler, locale);
    final reading = _slot >= 2 && _slot < _slotCount - 2;
    final showChrome = _chrome || !reading;

    return Stack(
      children: [
        Positioned(
          top: _topBar,
          bottom: _bottomBar,
          left: 0,
          right: 0,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTapUp: (d) => _onTap(d, box.maxWidth),
            onHorizontalDragUpdate: (d) => _onDragUpdate(d, g.pw),
            onHorizontalDragEnd: _onDragEnd,
            child: Center(
              child: SizedBox(
                width: g.pw,
                height: g.ph,
                child: AnimatedBuilder(
                  animation: _turn,
                  builder: (_, _) => _turner(g, type),
                ),
              ),
            ),
          ),
        ),
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          height: _topBar,
          child: _fade(showChrome, _topControls()),
        ),
        Positioned(
          bottom: 0,
          left: 0,
          right: 0,
          height: _bottomBar,
          child: _fade(showChrome || _pages == null, _bottomControls()),
        ),
      ],
    );
  }

  Widget _fade(bool visible, Widget child) => IgnorePointer(
    ignoring: !visible,
    child: AnimatedOpacity(
      opacity: visible ? 1 : 0,
      duration: const Duration(milliseconds: 250),
      child: child,
    ),
  );

  /// The page underneath, plus the leaf while one turns over the spine.
  Widget _turner(PageGeometry g, PageType t) {
    if (_dir == 0) return _slotWidget(_slot, g, t);
    final under = _dir > 0 ? _slot + 1 : _slot;
    final leaf = _dir > 0 ? _slot : _slot - 1;
    // How far the leaf has lifted: 0 flat on the book, 1 turned away.
    final lift = _dir > 0 ? _turn.value : 1 - _turn.value;
    return Stack(
      children: [
        _slotWidget(under, g, t),
        // Shadow the lifting leaf casts on the page below.
        Positioned.fill(
          child: IgnorePointer(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    Colors.black.withValues(alpha: 0.35 * (1 - lift)),
                    Colors.transparent,
                  ],
                  stops: [0, 0.2 + 0.6 * (1 - lift)],
                ),
              ),
            ),
          ),
        ),
        Transform(
          alignment: Alignment.centerLeft,
          transform: Matrix4.identity()
            ..setEntry(3, 2, 0.0011)
            ..rotateY(-math.pi / 2 * lift),
          child: Stack(
            children: [
              _slotWidget(leaf, g, t),
              Positioned.fill(
                child: IgnorePointer(
                  child: ColoredBox(
                    color: Colors.black.withValues(alpha: 0.55 * lift),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _slotWidget(int slot, PageGeometry g, PageType t) {
    if (slot <= 0) return _cover(g);
    if (slot == 1) return _sheet(g, _titlePage(g, t));
    final pages = _pages;
    if (pages == null) {
      return _sheet(
        g,
        Center(child: CircularProgressIndicator(color: t.theme.muted)),
      );
    }
    final index = slot - 2;
    if (index < pages.length) {
      return _sheet(g, _textPage(pages[index], index, g, t));
    }
    if (!_complete) {
      return _sheet(
        g,
        Center(child: CircularProgressIndicator(color: t.theme.muted)),
      );
    }
    if (index == pages.length) return _sheet(g, _endPage(g, t));
    return _backCover(g);
  }

  /// A page of paper: shadow below, spine shading on the left.
  Widget _sheet(PageGeometry g, Widget child) {
    const radius = BorderRadius.only(
      topLeft: Radius.circular(3),
      bottomLeft: Radius.circular(3),
      topRight: Radius.circular(6),
      bottomRight: Radius.circular(6),
    );
    return Container(
      width: g.pw,
      height: g.ph,
      decoration: BoxDecoration(
        color: _theme.page,
        borderRadius: radius,
        boxShadow: const [
          BoxShadow(
            color: Color(0xD9000000),
            blurRadius: 50,
            spreadRadius: -22,
            offset: Offset(0, 26),
          ),
          BoxShadow(
            color: Color(0x4D000000),
            blurRadius: 6,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: radius,
        child: Stack(
          children: [
            Positioned.fill(child: child),
            Positioned(
              left: 0,
              top: 0,
              bottom: 0,
              width: g.pw * 0.09,
              child: const IgnorePointer(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [
                        Color(0x29000000),
                        Color(0x0A000000),
                        Color(0x00000000),
                      ],
                      stops: [0, 0.4, 1],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _textPage(BookPage page, int index, PageGeometry g, PageType t) {
    final head = page.start ? null : _chapters[page.chapter].title;
    return Stack(
      children: [
        if (head != null)
          Positioned(
            top: g.pt * 0.42,
            left: g.inner,
            right: g.inner,
            child: Text(
              head.toUpperCase(),
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: t.furniture,
            ),
          ),
        Positioned(
          left: g.inner,
          top: g.pt,
          width: g.cw,
          height: g.ch,
          child: PageBody(page: page, type: t),
        ),
        Positioned(
          left: 0,
          right: 0,
          bottom: g.pb * 0.38,
          child: Text(
            '${index + 1}',
            textAlign: TextAlign.center,
            style: t.furniture.copyWith(letterSpacing: 10.5 * 0.08),
          ),
        ),
      ],
    );
  }

  String? get _author => widget.publicSlug != null
      ? _publicAuthor
      : context.read<AuthProvider>().user?.name;

  Widget _cover(PageGeometry g) {
    final book = _book!;
    final url = ApiConfig.coverUrl(book.coverImage, book.slug);
    final u = g.unit;
    final author = _author;
    final title = AppType.display(
      size: u * (url.isEmpty ? 0.115 : 0.105),
      color: Colors.white,
    );
    final byline = TextStyle(
      color: Colors.white.withValues(alpha: 0.85),
      fontSize: u * 0.026,
      fontWeight: FontWeight.w600,
      letterSpacing: u * 0.026 * 0.22,
    );
    return Container(
      width: g.pw,
      height: g.ph,
      clipBehavior: Clip.antiAlias,
      decoration: const BoxDecoration(
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(2),
          bottomLeft: Radius.circular(2),
          topRight: Radius.circular(6),
          bottomRight: Radius.circular(6),
        ),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF1C2D4D), Color(0xFF0A1428)],
        ),
        boxShadow: [
          BoxShadow(
            color: Color(0xD9000000),
            blurRadius: 50,
            spreadRadius: -22,
            offset: Offset(0, 26),
          ),
        ],
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (url.isNotEmpty) ...[
            CachedNetworkImage(
              imageUrl: url,
              fit: BoxFit.cover,
              errorWidget: (_, _, _) => const SizedBox.shrink(),
            ),
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color(0x40000000),
                    Color(0x00000000),
                    Color(0x00000000),
                    Color(0xC7000000),
                  ],
                  stops: [0, 0.28, 0.5, 1],
                ),
              ),
            ),
            Positioned(
              left: g.pw * 0.09,
              right: g.pw * 0.09,
              bottom: g.ph * 0.09,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(book.title, style: title.copyWith(height: 1)),
                  if (author != null) ...[
                    SizedBox(height: u * 0.026 * 0.9),
                    Text(author.toUpperCase(), style: byline),
                  ],
                ],
              ),
            ),
          ] else ...[
            Positioned.fill(
              child: Padding(
                padding: EdgeInsets.all(g.pw * 0.055),
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.28),
                    ),
                  ),
                ),
              ),
            ),
            Positioned(
              left: g.pw * 0.09,
              right: g.pw * 0.09,
              top: g.ph * 0.3,
              child: Column(
                children: [
                  Text(
                    book.title,
                    textAlign: TextAlign.center,
                    style: title.copyWith(height: 1),
                  ),
                  if (author != null) ...[
                    SizedBox(height: u * 0.026 * 0.9),
                    Text(author.toUpperCase(), style: byline),
                  ],
                ],
              ),
            ),
            Positioned(
              left: 0,
              right: 0,
              bottom: g.ph * 0.14,
              child: Text(
                '✦',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: const Color(0xFFC9A86A),
                  fontSize: u * 0.04,
                ),
              ),
            ),
          ],
          // Spine fold along the left edge.
          const IgnorePointer(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    Color(0x29FFFFFF),
                    Color(0x00FFFFFF),
                    Color(0x47000000),
                    Color(0x00000000),
                  ],
                  stops: [0, 0.025, 0.035, 0.09],
                ),
              ),
            ),
          ),
          if (_pages == null)
            Positioned(
              left: 0,
              right: 0,
              bottom: 14,
              child: Center(
                child: SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white.withValues(alpha: 0.7),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _titlePage(PageGeometry g, PageType t) {
    final u = g.unit;
    final author = _author;
    return Padding(
      padding: EdgeInsets.all(g.pw * 0.12),
      child: Stack(
        children: [
          Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  _book!.title,
                  textAlign: TextAlign.center,
                  style: t.display.copyWith(fontSize: u * 0.085, height: 1.05),
                ),
                if (author != null) ...[
                  SizedBox(height: u * 0.025 * 1.2),
                  Text(
                    author.toUpperCase(),
                    textAlign: TextAlign.center,
                    style: t.ui.copyWith(
                      fontSize: u * 0.025,
                      letterSpacing: u * 0.025 * 0.22,
                    ),
                  ),
                ],
                SizedBox(height: u * 0.04),
                Text('✦', style: TextStyle(color: t.theme.accent)),
                if (_illustrated) ...[
                  SizedBox(height: u * 0.04),
                  Text(
                    'An illustrated edition',
                    style: t.italic.copyWith(
                      fontSize: u * 0.032,
                      color: t.theme.muted,
                    ),
                  ),
                ],
              ],
            ),
          ),
          Align(
            alignment: Alignment.bottomCenter,
            child: Text(
              'BOOKAI',
              style: t.ui.copyWith(
                fontSize: u * 0.022,
                letterSpacing: u * 0.022 * 0.2,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _endPage(PageGeometry g, PageType t) {
    final u = g.unit;
    return Center(
      child: Padding(
        padding: EdgeInsets.all(g.pw * 0.1),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('✦   ✦   ✦', style: TextStyle(color: t.theme.accent)),
            SizedBox(height: u * 0.05),
            Text(
              'The End',
              style: t.display.copyWith(fontSize: u * 0.085, height: 1.05),
            ),
            SizedBox(height: u * 0.08),
            Wrap(
              alignment: WrapAlignment.center,
              spacing: 8,
              runSpacing: 8,
              children: [
                OutlinedButton(
                  onPressed: () => _jumpTo(2),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: t.theme.ink,
                    backgroundColor: Colors.transparent,
                    minimumSize: const Size(0, 44),
                    side: BorderSide(color: t.theme.ink.withValues(alpha: 0.2)),
                  ),
                  child: const Text('Read again'),
                ),
                FilledButton(
                  onPressed: () => Navigator.of(context).maybePop(),
                  style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
                  child: const Text('Close the book'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _backCover(PageGeometry g) {
    final u = g.unit;
    final blurb = (_book!.description ?? '').trim();
    final mark = TextStyle(
      color: Colors.white.withValues(alpha: 0.7),
      fontSize: u * 0.024,
      fontWeight: FontWeight.w600,
      letterSpacing: u * 0.024 * 0.18,
    );
    return Container(
      width: g.pw,
      height: g.ph,
      decoration: const BoxDecoration(
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(6),
          bottomLeft: Radius.circular(6),
          topRight: Radius.circular(2),
          bottomRight: Radius.circular(2),
        ),
        gradient: LinearGradient(
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
          colors: [Color(0xFF1C2D4D), Color(0xFF0A1428)],
        ),
      ),
      padding: EdgeInsets.fromLTRB(
        g.pw * 0.11,
        g.ph * 0.12,
        g.pw * 0.11,
        g.ph * 0.09,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (blurb.isNotEmpty)
            Text(
              blurb.length > 520 ? '${blurb.substring(0, 519)}…' : blurb,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.88),
                fontSize: u * 0.034,
                height: 1.6,
              ),
            ),
          const Spacer(),
          Row(
            children: [
              Expanded(
                child: Text(
                  _book!.title.toUpperCase(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: mark,
                ),
              ),
              Text('BOOKAI', style: mark),
            ],
          ),
        ],
      ),
    );
  }

  // Controls --------------------------------------------------------------------

  Widget _topControls() {
    final page = _pageAt(_slot);
    final chapter = page == null ? null : _chapters[page.chapter];
    return Row(
      children: [
        IconButton(
          tooltip: 'Close the book',
          color: Colors.white.withValues(alpha: 0.85),
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        Expanded(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                _book?.title ?? '',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.9),
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
              if (chapter != null)
                Text(
                  'Chapter ${chapter.number}: ${chapter.title}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.6),
                    fontSize: 11,
                  ),
                ),
            ],
          ),
        ),
        IconButton(
          tooltip: 'Contents',
          color: Colors.white.withValues(alpha: 0.85),
          icon: const Icon(Icons.format_list_bulleted_rounded),
          onPressed: _pages == null ? null : _showContents,
        ),
        IconButton(
          tooltip: 'Reading options',
          color: Colors.white.withValues(alpha: 0.85),
          icon: const Icon(Icons.text_fields_rounded),
          onPressed: _showOptions,
        ),
      ],
    );
  }

  Widget _bottomControls() {
    final pages = _pages;
    final muted = Colors.white.withValues(alpha: 0.6);
    if (pages == null) {
      return Center(
        child: Text(
          'Laying out pages…',
          style: TextStyle(color: muted, fontSize: 12),
        ),
      );
    }
    final page = _pageAt(_slot);
    final label = page != null
        ? (_complete
              ? 'Page ${_slot - 1} of ${pages.length}'
              : 'Page ${_slot - 1}')
        : _slot == 0
        ? 'Tap or swipe to open'
        : _slot == 1
        ? (_complete ? '${pages.length} pages' : 'Laying out pages…')
        : _complete
        ? 'The end'
        : 'Laying out pages…';
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 10, 24, 12),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(
              value: _slotCount <= 1 ? 0 : _slot / (_slotCount - 1),
              minHeight: 3,
              color: Colors.white.withValues(alpha: 0.75),
              backgroundColor: Colors.white.withValues(alpha: 0.15),
            ),
          ),
          const SizedBox(height: 8),
          Text(label, style: TextStyle(color: muted, fontSize: 12)),
        ],
      ),
    );
  }

  Widget _message(String text, {bool retry = false}) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.menu_book_rounded,
              size: 40,
              color: Colors.white.withValues(alpha: 0.6),
            ),
            const SizedBox(height: 12),
            Text(
              text,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.75),
                fontSize: 15,
              ),
            ),
            const SizedBox(height: 16),
            if (retry)
              FilledButton(onPressed: _load, child: const Text('Try again'))
            else
              TextButton(
                onPressed: () => Navigator.of(context).maybePop(),
                child: const Text('Back'),
              ),
          ],
        ),
      ),
    );
  }

  void _showContents() {
    final pages = _pages;
    if (pages == null) return;
    final current = _pageAt(_slot)?.chapter;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.6,
        maxChildSize: 0.9,
        builder: (ctx, scroll) => ListView(
          controller: scroll,
          padding: const EdgeInsets.fromLTRB(8, 16, 8, 24),
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Text(
                'Contents',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
              ),
            ),
            for (var ci = 0; ci < _chapters.length; ci++)
              Builder(
                builder: (_) {
                  final first = pages.indexWhere((p) => p.chapter == ci);
                  final selected = ci == current;
                  return ListTile(
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    selected: selected,
                    selectedTileColor: AppColors.primarySoft,
                    leading: Text(
                      '${_chapters[ci].number}',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: selected
                            ? AppColors.primaryText
                            : AppColors.textMuted,
                      ),
                    ),
                    title: Text(
                      _chapters[ci].title,
                      style: TextStyle(
                        color: AppColors.navy,
                        fontWeight: selected
                            ? FontWeight.w700
                            : FontWeight.w500,
                      ),
                    ),
                    trailing: Text(
                      first < 0 ? '' : '${first + 1}',
                      style: const TextStyle(color: AppColors.textMuted),
                    ),
                    onTap: first < 0
                        ? null
                        : () {
                            Navigator.pop(ctx);
                            _jumpTo(first + 2);
                          },
                  );
                },
              ),
          ],
        ),
      ),
    );
  }

  void _setStep(int step, StateSetter setSheet) {
    setState(() => _step = step);
    _write(_stepKey, '$step');
    setSheet(() {});
  }

  void _showOptions() {
    showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Page',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    for (final option in ReaderTheme.all)
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 4),
                          child: InkWell(
                            borderRadius: BorderRadius.circular(12),
                            onTap: () {
                              setState(() => _theme = option);
                              _write(_themeKey, option.id);
                              setSheet(() {});
                            },
                            child: Container(
                              height: 52,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: option.page,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: option == _theme
                                      ? AppColors.primary
                                      : AppColors.border,
                                  width: option == _theme ? 2 : 1,
                                ),
                              ),
                              child: Text(
                                option.label,
                                style: TextStyle(
                                  color: option.ink,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 20),
                const Text(
                  'Text size',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    IconButton(
                      tooltip: 'Smaller text',
                      onPressed: _step <= 0
                          ? null
                          : () => _setStep(_step - 1, setSheet),
                      icon: const Icon(Icons.text_decrease_rounded),
                    ),
                    Expanded(
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          for (
                            var s = 0;
                            s < PageGeometry.fontSteps.length;
                            s++
                          )
                            Container(
                              width: 8,
                              height: 8,
                              margin: const EdgeInsets.symmetric(horizontal: 5),
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: s <= _step
                                    ? AppColors.primary
                                    : AppColors.mutedBg,
                              ),
                            ),
                        ],
                      ),
                    ),
                    IconButton(
                      tooltip: 'Larger text',
                      onPressed: _step >= PageGeometry.fontSteps.length - 1
                          ? null
                          : () => _setStep(_step + 1, setSheet),
                      icon: const Icon(Icons.text_increase_rounded),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
