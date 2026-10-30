import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
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
import 'package:bookai_mobile/widgets/skeleton.dart';

/// Cover width on Home's shelves (covers only, so they can be generous).
const _shelfCover = 140.0;

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Timer? _poll;

  /// Home is a sheet over your stats; it rests [homeStatsHeight] down the
  /// scroll, so scrolling up past its top pulls it down to show them.
  final _scroll = ScrollController(initialScrollOffset: homeStatsHeight);
  bool _statsOpen = false;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
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
    super.dispose();
  }

  /// Opening the stats also refreshes them (this is Home's pull-to-refresh).
  void _onScroll() {
    final offset = _scroll.offset;
    if (offset <= 1 && !_statsOpen) {
      _statsOpen = true;
      unawaited(_refresh());
    } else if (offset >= homeStatsHeight - 1) {
      _statsOpen = false;
    }
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
    if (!_scroll.hasClients) return;
    final open = _scroll.offset < homeStatsHeight / 2;
    _scroll.animateTo(
      open ? homeStatsHeight : 0,
      duration: const Duration(milliseconds: 380),
      curve: Curves.easeOutCubic,
    );
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
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: AppColors.navy,
        body: Stack(
          children: [
            // Your stats, behind the sheet; they rise in as it's pulled down.
            Positioned(
              top: top + homePeekHeight,
              left: 0,
              right: 0,
              height: homeStatsHeight,
              child: AnimatedBuilder(
                animation: _scroll,
                builder: (context, child) {
                  final shown = _scroll.hasClients
                      ? (1 - _scroll.offset / homeStatsHeight).clamp(0.0, 1.0)
                      : 0.0;
                  return Opacity(
                    opacity: shown,
                    child: Transform.translate(
                      offset: Offset(0, -16 * (1 - shown)),
                      child: child,
                    ),
                  );
                },
                child: HomeStatsPanel(
                  user: user,
                  books: books.books,
                  writing: writing.length,
                  onUsage: () => context.push('/usage'),
                  onUpgrade: () => context.push('/billing'),
                ),
              ),
            ),
            CustomScrollView(
              controller: _scroll,
              physics: const HomeSheetPhysics(restOffset: homeStatsHeight),
              slivers: [
                SliverToBoxAdapter(
                  child: SizedBox(
                    height: top + homePeekHeight + homeStatsHeight,
                  ),
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
                          HomeHero(name: _firstName(user), covers: heroCovers),
                        ),
                        ValueListenableBuilder<LastRead?>(
                          valueListenable: ReaderMemory.last,
                          builder: (context, last, _) {
                            final loading =
                                books.loading && books.books.isEmpty;
                            final row = loading
                                ? const ContinueRowSkeleton()
                                : _continueRow(books, last);
                            if (row == null) return const SizedBox.shrink();
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
                              const Divider(height: 1, color: AppColors.border),
                            reveal(
                              WritingNowRow(
                                book: writing[i],
                                onTap: () =>
                                    context.push('/books/${writing[i].id}'),
                              ),
                            ),
                          ],
                        ],
                        if (books.loading && books.books.isEmpty) ...[
                          const SizedBox(height: 32),
                          const Skeleton(
                            child: Bone(width: 150, height: 20, radius: 4),
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
                                    onTap: () => context.push('/books/${b.id}'),
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
                                    onTap: () =>
                                        context.push('/discover/${b.slug}'),
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
            // The dark strip with the logo and plan stays on top; the sheet
            // scrolls under it.
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              height: top + homePeekHeight,
              child: ColoredBox(
                color: AppColors.navy,
                child: Padding(
                  padding: EdgeInsets.only(top: top),
                  child: HomePeekBar(user: user, onTap: _toggleStats),
                ),
              ),
            ),
          ],
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
