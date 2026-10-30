import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:bookai_mobile/config/book_options.dart';
import 'package:bookai_mobile/models/models.dart';
import 'package:bookai_mobile/providers/auth_provider.dart';
import 'package:bookai_mobile/providers/books_provider.dart';
import 'package:bookai_mobile/providers/new_book_draft_provider.dart';
import 'package:bookai_mobile/providers/public_books_provider.dart';
import 'package:bookai_mobile/screens/home/home_widgets.dart';
import 'package:bookai_mobile/services/reader_memory.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/book_shelf.dart';
import 'package:bookai_mobile/widgets/bookai_logo.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Timer? _poll;

  @override
  void initState() {
    super.initState();
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
    super.dispose();
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

    return Scaffold(
      appBar: AppBar(
        title: const BookAiLogo(height: 28),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 14),
            child: GestureDetector(
              onTap: () => context.go('/account'),
              child: _Avatar(user: user),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await Future.wait([
            books.load(),
            books.loadActiveJobs(),
            auth.refreshUser(),
            pub.load(),
          ]);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 110),
          children: [
            reveal(
              HomeHero(
                name: _firstName(user),
                covers: heroCovers,
                onWrite: () => context.push('/books/new'),
              ),
            ),
            ValueListenableBuilder<LastRead?>(
              valueListenable: ReaderMemory.last,
              builder: (context, last, _) {
                final row = _continueRow(books, last);
                if (row == null) return const SizedBox.shrink();
                return Padding(
                  padding: const EdgeInsets.only(top: 18),
                  child: Column(
                    children: [
                      const Divider(height: 1, color: AppColors.border),
                      const SizedBox(height: 16),
                      row,
                      const SizedBox(height: 16),
                      const Divider(height: 1, color: AppColors.border),
                    ],
                  ),
                );
              },
            ),
            const SizedBox(height: 24),
            reveal(
              QuickActions(
                actions: [
                  (
                    label: 'New book',
                    icon: Icons.edit_note_rounded,
                    onTap: () => context.push('/books/new'),
                  ),
                  (
                    label: 'Audio Studio',
                    icon: Icons.headphones_rounded,
                    onTap: () => context.go('/studio'),
                  ),
                  (
                    label: 'Discover',
                    icon: Icons.explore_outlined,
                    onTap: () => context.go('/discover'),
                  ),
                  (
                    label: 'My books',
                    icon: Icons.auto_stories_outlined,
                    onTap: () => context.go('/books'),
                  ),
                ],
              ),
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
                if (i > 0) const Divider(height: 1, color: AppColors.border),
                reveal(
                  WritingNowRow(
                    book: writing[i],
                    onTap: () => context.push('/books/${writing[i].id}'),
                  ),
                ),
              ],
            ],
            if (books.loading && books.books.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 24),
                child: LinearProgressIndicator(minHeight: 2),
              ),
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
                  books: [
                    for (final b in books.completed.take(8))
                      (
                        title: b.title,
                        subtitle:
                            '${b.genre ?? 'Book'} · ${b.currentPages} pages',
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
                style: TextStyle(color: AppColors.textMuted, fontSize: 13),
              )
            else
              reveal(
                BookShelfRow(
                  books: [
                    for (final b in pub.books.take(10))
                      (
                        title: b.title,
                        subtitle: b.author,
                        coverImage: b.coverImage,
                        slug: b.slug,
                        onTap: () => context.push('/discover/${b.slug}'),
                      ),
                  ],
                ),
              ),
            if (user != null) ...[
              const SizedBox(height: 32),
              reveal(
                PlanLine(
                  user: user,
                  onTap: () => context.push('/usage'),
                  onUpgrade: () => context.push('/billing'),
                ),
              ),
            ],
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
      detail: '${newest.currentPages} pages · tap to start',
      progress: 0,
      onTap: () => context.push('/books/${newest.id}/read'),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.user});

  final UserModel? user;

  @override
  Widget build(BuildContext context) {
    final image = user?.image;
    final letter =
        (user?.name?.trim().isNotEmpty == true
                ? user!.name!.trim()
                : user?.email ?? '?')
            .substring(0, 1)
            .toUpperCase();
    return Container(
      width: 36,
      height: 36,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: AppColors.mutedBg,
        border: Border.all(color: AppColors.border),
      ),
      clipBehavior: Clip.antiAlias,
      alignment: Alignment.center,
      child: image != null && image.startsWith('http')
          ? CachedNetworkImage(
              imageUrl: image,
              fit: BoxFit.cover,
              width: 36,
              height: 36,
              errorWidget: (_, _, _) => _letter(letter),
            )
          : _letter(letter),
    );
  }

  Widget _letter(String letter) => Text(
    letter,
    style: const TextStyle(
      color: AppColors.primary,
      fontWeight: FontWeight.w900,
      fontSize: 15,
    ),
  );
}
