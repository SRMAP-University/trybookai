import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:bookai_mobile/config/api_config.dart';
import 'package:bookai_mobile/config/book_options.dart';
import 'package:bookai_mobile/models/models.dart';
import 'package:bookai_mobile/providers/auth_provider.dart';
import 'package:bookai_mobile/providers/books_provider.dart';
import 'package:bookai_mobile/providers/new_book_draft_provider.dart';
import 'package:bookai_mobile/providers/public_books_provider.dart';
import 'package:bookai_mobile/screens/home/home_stats.dart';
import 'package:bookai_mobile/screens/home/home_widgets.dart';
import 'package:bookai_mobile/services/reader_memory.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/book_shelf.dart';
import 'package:bookai_mobile/widgets/cover_hero.dart';
import 'package:bookai_mobile/widgets/skeleton.dart';

/// Cover width on Home's shelves (covers only, so they can be generous).
const _shelfCover = 140.0;

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen>
    with SingleTickerProviderStateMixin {
  Timer? _poll;
  final _scroll = ScrollController();

  /// How far Home's sheet is pulled down over your stats: 0 shut,
  /// [homeStatsHeight] open. Only a deliberate pull at the very top moves
  /// it; ordinary scrolling never does.
  final _pull = ValueNotifier<double>(0);
  late final _settle = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 320),
  );
  Animation<double>? _settleTo;
  bool _open = false;

  /// The page stops scrolling while the sheet is pulled or open.
  bool _locked = false;

  // The pull gesture in progress.
  int? _pointer;
  bool _dragging = false;
  bool _startedAtTop = false;
  Offset _start = Offset.zero;
  double _startPull = 0;
  Offset _last = Offset.zero;
  Duration _lastTime = Duration.zero;
  double _velocity = 0;

  @override
  void initState() {
    super.initState();
    _settle.addListener(() {
      final to = _settleTo;
      if (to != null) _pull.value = to.value;
    });
    unawaited(ReaderMemory.load());
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final books = context.read<BooksProvider>();
      books.load();
      books.loadActiveJobs();
      context.read<PublicBooksProvider>().load();
      _poll = Timer.periodic(const Duration(seconds: 12), (_) {
        if (!mounted) return;
        context.read<BooksProvider>().loadActiveJobs();
      });
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    _scroll.dispose();
    _pull.dispose();
    _settle.dispose();
    super.dispose();
  }

  void _setLocked(bool locked) {
    if (_locked != locked) setState(() => _locked = locked);
  }

  void _onPointerDown(PointerDownEvent e) {
    if (_pointer != null) return;
    _pointer = e.pointer;
    _settle.stop();
    _dragging = false;
    _startedAtTop = !_scroll.hasClients || _scroll.offset <= 0.5;
    _start = e.position;
    _startPull = _pull.value;
    _last = e.position;
    _lastTime = e.timeStamp;
    _velocity = 0;
  }

  void _onPointerMove(PointerMoveEvent e) {
    if (e.pointer != _pointer) return;
    final ms = (e.timeStamp - _lastTime).inMicroseconds / 1000;
    if (ms > 0) _velocity = (e.position.dy - _last.dy) / ms;
    _last = e.position;
    _lastTime = e.timeStamp;
    final dy = e.position.dy - _start.dy;
    if (!_dragging) {
      // Starts only as a clear vertical pull: down from the very top, or
      // either way once the sheet is already down.
      final canPull = _startPull > 0 || (_startedAtTop && dy > 0);
      if (!canPull || dy.abs() < 10) return;
      if (dy.abs() < (e.position.dx - _start.dx).abs()) return;
      _dragging = true;
      _setLocked(true);
    }
    final raw = _startPull + dy;
    // Past fully open it gives a little, like pulling on elastic.
    _pull.value = raw <= homeStatsHeight
        ? math.max(0, raw)
        : homeStatsHeight + (raw - homeStatsHeight) * 0.25;
  }

  void _onPointerEnd(PointerEvent e) {
    if (e.pointer != _pointer) return;
    _pointer = null;
    if (!_dragging) return;
    _dragging = false;
    final open = _velocity > 0.6
        ? true
        : _velocity < -0.6
        ? false
        : _pull.value > homeStatsHeight * 0.45;
    _animatePull(open);
  }

  /// Settles the sheet open or shut; opening refreshes the numbers (this is
  /// Home's pull-to-refresh).
  void _animatePull(bool open) {
    final target = open ? homeStatsHeight : 0.0;
    final opening = open && !_open;
    _open = open;
    if (open) _setLocked(true);
    _settleTo = Tween(
      begin: _pull.value,
      end: target,
    ).animate(CurvedAnimation(parent: _settle, curve: Curves.easeOutCubic));
    _settle
      ..reset()
      ..forward().whenComplete(() {
        if (!mounted) return;
        if (!open && _pull.value == 0) _setLocked(false);
      });
    if (opening) unawaited(_refresh());
  }

  Future<void> _refresh() async {
    final books = context.read<BooksProvider>();
    await Future.wait([
      books.load(),
      books.loadActiveJobs(),
      context.read<AuthProvider>().refreshUser(),
      context.read<PublicBooksProvider>().load(),
    ]);
  }

  void _toggleStats() {
    if (!_open && _scroll.hasClients && _scroll.offset > 0) _scroll.jumpTo(0);
    _animatePull(!_open);
  }

  void _useIdea(BookIdea idea) {
    final draft = context.read<NewBookDraftProvider>();
    draft.title = idea.title;
    draft.description = idea.pitch;
    if (BookOptions.genres.contains(idea.genre)) draft.genre = idea.genre;
    context.push('/books/new');
  }

  String? _firstName(UserModel? user) {
    final name = user?.name?.trim();
    if (name != null && name.isNotEmpty) {
      return name.split(RegExp(r'\s+')).first;
    }
    final email = user?.email;
    if (email == null || !email.contains('@')) return null;
    return email.split('@').first;
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final books = context.watch<BooksProvider>();
    final pub = context.watch<PublicBooksProvider>();
    final user = auth.user;

    final writing = books.activeJobs?.books.isNotEmpty == true
        ? books.activeJobs!.books
        : books.generating;
    final heroCovers = <HeroCover>[
      for (final b in books.books.where((b) => b.coverImage != null).take(3))
        (title: b.title, coverImage: b.coverImage, slug: b.slug),
      for (final b in pub.books.where((b) => b.coverImage != null).take(3))
        (title: b.title, coverImage: b.coverImage, slug: b.slug),
    ];

    var step = 0;
    Widget reveal(Widget child) => Reveal(
      delay: Duration(milliseconds: 70 * step++),
      child: child,
    );

    final top = MediaQuery.paddingOf(context).top;
    final dock = DockTheme.forUser(user);
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: dock.overlay,
      child: Scaffold(
        backgroundColor: dock.base,
        body: Listener(
          onPointerDown: _onPointerDown,
          onPointerMove: _onPointerMove,
          onPointerUp: _onPointerEnd,
          onPointerCancel: _onPointerEnd,
          child: Stack(
            children: [
              if (dock.gradient != null)
                Positioned.fill(
                  child: DecoratedBox(decoration: dock.decoration),
                ),
              // Your stats, between the logo strip and the sheet; they rise in
              // as the sheet is pulled down.
              Positioned(
                top: top + homePeekHeight,
                left: 0,
                right: 0,
                height: homeStatsHeight,
                child: ValueListenableBuilder<double>(
                  valueListenable: _pull,
                  builder: (context, pull, child) {
                    final shown = (pull / homeStatsHeight).clamp(0.0, 1.0);
                    return Opacity(
                      opacity: shown,
                      child: Transform.translate(
                        offset: Offset(0, -16 * (1 - shown)),
                        child: child,
                      ),
                    );
                  },
                  child: HomeStatsPanel(
                    dock: dock,
                    user: user,
                    books: books.books,
                    writing: writing.length,
                    onUpgrade: () => context.push('/billing'),
                  ),
                ),
              ),
              ValueListenableBuilder<double>(
                valueListenable: _pull,
                builder: (context, pull, child) =>
                    Transform.translate(offset: Offset(0, pull), child: child),
                child: ScrollConfiguration(
                  behavior: ScrollConfiguration.of(
                    context,
                  ).copyWith(overscroll: false),
                  child: CustomScrollView(
                    controller: _scroll,
                    physics: _locked
                        ? const NeverScrollableScrollPhysics()
                        : const AlwaysScrollableScrollPhysics(),
                    slivers: [
                      SliverToBoxAdapter(
                        child: SizedBox(height: top + homePeekHeight),
                      ),
                      DecoratedSliver(
                        decoration: const BoxDecoration(
                          color: AppColors.white,
                          borderRadius: BorderRadius.vertical(
                            top: Radius.circular(24),
                          ),
                        ),
                        sliver: SliverPadding(
                          // Room at the bottom so the last row scrolls clear of the
                          // bottom bar and the floating New book button.
                          padding: const EdgeInsets.fromLTRB(20, 0, 20, 170),
                          sliver: SliverList.list(
                            children: [
                              SheetHandle(onTap: _toggleStats),
                              reveal(
                                HomeHero(
                                  name: _firstName(user),
                                  covers: heroCovers,
                                ),
                              ),
                              ValueListenableBuilder<LastRead?>(
                                valueListenable: ReaderMemory.last,
                                builder: (context, last, _) {
                                  final loading =
                                      books.loading && books.books.isEmpty;
                                  final row = loading
                                      ? const ContinueRowSkeleton()
                                      : _continueRow(books, last);
                                  if (row == null) {
                                    return const SizedBox.shrink();
                                  }
                                  return Padding(
                                    padding: const EdgeInsets.only(top: 14),
                                    child: Column(
                                      children: [
                                        const Divider(
                                          height: 1,
                                          color: AppColors.border,
                                        ),
                                        const SizedBox(height: 10),
                                        row,
                                        const SizedBox(height: 10),
                                        const Divider(
                                          height: 1,
                                          color: AppColors.border,
                                        ),
                                      ],
                                    ),
                                  );
                                },
                              ),
                              if (writing.isNotEmpty) ...[
                                const SizedBox(height: 32),
                                reveal(
                                  HomeHeading(
                                    'Writing now',
                                    action: HomeLink(
                                      'All books',
                                      onTap: () => context.go('/books'),
                                    ),
                                  ),
                                ),
                                for (var i = 0; i < writing.length; i++) ...[
                                  if (i > 0)
                                    const Divider(
                                      height: 1,
                                      color: AppColors.border,
                                    ),
                                  reveal(
                                    WritingNowRow(
                                      book: writing[i],
                                      onTap: () => context.push(
                                        '/books/${writing[i].id}',
                                      ),
                                    ),
                                  ),
                                ],
                              ],
                              if (books.loading && books.books.isEmpty) ...[
                                const SizedBox(height: 32),
                                const Skeleton(
                                  child: Bone(
                                    width: 150,
                                    height: 20,
                                    radius: 4,
                                  ),
                                ),
                                const SizedBox(height: 16),
                                const ShelfSkeleton(coverWidth: _shelfCover),
                              ],
                              if (books.completed.isNotEmpty) ...[
                                const SizedBox(height: 32),
                                reveal(
                                  HomeHeading(
                                    'Your bookshelf',
                                    action: HomeLink(
                                      'View all',
                                      onTap: () => context.go('/books'),
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 12),
                                reveal(
                                  BookShelfRow(
                                    coverWidth: _shelfCover,
                                    books: [
                                      for (final b in books.completed.take(8))
                                        (
                                          title: b.title,
                                          coverImage: b.coverImage,
                                          slug: b.slug,
                                          onTap: () =>
                                              context.push('/books/${b.id}'),
                                        ),
                                    ],
                                  ),
                                ),
                              ],
                              const SizedBox(height: 28),
                              reveal(IdeaList(onPick: _useIdea)),
                              const SizedBox(height: 28),
                              reveal(
                                HomeHeading(
                                  'Popular on BookAI',
                                  action: HomeLink(
                                    'View all',
                                    onTap: () => context.go('/discover'),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 12),
                              if (pub.books.isEmpty && !pub.loading)
                                const Text(
                                  'Browse published manuscripts on Discover.',
                                  style: TextStyle(
                                    color: AppColors.textMuted,
                                    fontSize: 13,
                                  ),
                                )
                              else if (pub.books.isEmpty)
                                const ShelfSkeleton(coverWidth: _shelfCover)
                              else
                                reveal(
                                  BookShelfRow(
                                    coverWidth: _shelfCover,
                                    books: [
                                      for (final b in pub.books.take(10))
                                        (
                                          title: b.title,
                                          coverImage: b.coverImage,
                                          slug: b.slug,
                                          onTap: () => context.push(
                                            '/discover/${b.slug}',
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              // The logo strip is part of the page: it scrolls away with it,
              // but stays put while the sheet is pulled down.
              AnimatedBuilder(
                animation: _scroll,
                builder: (context, child) => Positioned(
                  top: top - (_scroll.hasClients ? _scroll.offset : 0),
                  left: 0,
                  right: 0,
                  height: homePeekHeight,
                  child: child!,
                ),
                child: HomePeekBar(
                  dock: dock,
                  onTap: _toggleStats,
                  onAudioStudio: () => context.go('/studio'),
                  // Song Studio is on the website for now.
                  onSongStudio: () => launchUrl(
                    Uri.parse('${ApiConfig.baseUrl}/dashboard/songs'),
                    mode: LaunchMode.externalApplication,
                  ),
                ),
              ),
              // The status bar keeps its dark band as the page scrolls under.
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                height: top,
                child: DecoratedBox(decoration: dock.decoration),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// "Continue reading" for the last book open in the reader, or "Start
  /// reading" for the newest finished book.
  Widget? _continueRow(BooksProvider books, LastRead? last) {
    BookModel? find(String id) {
      for (final b in books.books) {
        if (b.id == id) return b;
      }
      return null;
    }

    final lastBook = last == null ? null : find(last.bookId);
    if (last != null && lastBook != null) {
      return ContinueReadingRow(
        book: lastBook,
        label: 'Continue reading',
        detail: 'Chapter ${last.chapter} of ${last.total}',
        progress: last.total <= 0 ? 0 : last.chapter / last.total,
        onTap: () => context.push('/books/${lastBook.id}/read'),
      );
    }
    if (books.completed.isEmpty) return null;
    final newest = books.completed.first;
    return ContinueReadingRow(
      book: newest,
      label: 'Ready to read',
      detail: '${newest.currentPages} pages',
      progress: 0,
      onTap: () => context.push('/books/${newest.id}/read'),
    );
  }
}
