import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:bookai_mobile/providers/auth_provider.dart';
import 'package:bookai_mobile/providers/books_provider.dart';
import 'package:bookai_mobile/providers/public_books_provider.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/book_shelf.dart';
import 'package:bookai_mobile/widgets/bookai_logo.dart';
import 'package:bookai_mobile/widgets/common.dart';

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

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final books = context.watch<BooksProvider>();
    final pub = context.watch<PublicBooksProvider>();
    final user = auth.user;

    return Scaffold(
      appBar: AppBar(
        title: const BookAiLogo(height: 28),
        actions: [
          IconButton(
            onPressed: () {
              books.load();
              auth.refreshUser();
            },
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await books.load();
          await books.loadActiveJobs();
          await auth.refreshUser();
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 100),
          children: [
            if (user != null)
              StripeCard(
                padding: const EdgeInsets.fromLTRB(14, 10, 10, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          user.displayPlanLabel,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: AppColors.primary,
                            letterSpacing: 0.4,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    CompactUsageStats(
                      pagesUsed: user.pagesUsed,
                      pagesLimit: user.pagesLimit,
                      audioUsed: user.audioMinutesUsed,
                      audioLimit: user.audioMinutesLimit,
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 16),
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Generating now',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppColors.navy,
                      letterSpacing: -0.2,
                    ),
                  ),
                ),
                TextButton(
                  style: TextButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  onPressed: () => context.go('/books'),
                  child: const Text('All books', style: TextStyle(fontSize: 12)),
                ),
              ],
            ),
            const SizedBox(height: 6),
            if (books.loading && books.books.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 10),
                child: LinearProgressIndicator(minHeight: 2),
              )
            else if ((books.activeJobs?.books.isEmpty ?? true) &&
                books.generating.isEmpty)
              StripeCard(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                child: Column(
                  children: [
                    const Icon(Icons.auto_stories_outlined,
                        color: AppColors.primary, size: 22),
                    const SizedBox(height: 6),
                    const Text(
                      'No books generating',
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 2),
                    const Text(
                      'Start a new book to see live progress here.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 11, color: AppColors.textMuted),
                    ),
                    const SizedBox(height: 8),
                    SizedBox(
                      height: 32,
                      child: FilledButton(
                        onPressed: () => context.push('/books/new'),
                        child: const Text('New book', style: TextStyle(fontSize: 12)),
                      ),
                    ),
                  ],
                ),
              )
            else
              ...(books.activeJobs?.books.isNotEmpty == true
                      ? books.activeJobs!.books
                      : books.generating)
                  .map(
                (b) => Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: StripeCard(
                    padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
                    onTap: () => context.push('/books/${b.id}'),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                b.title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 12,
                                ),
                              ),
                            ),
                            Text(
                              '${b.progress.round()}%',
                              style: const TextStyle(
                                color: AppColors.primary,
                                fontWeight: FontWeight.w600,
                                fontSize: 11,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${b.status.toLowerCase()} · ${b.currentPages}/${b.targetPages} pages',
                          style: const TextStyle(
                            fontSize: 10,
                            color: AppColors.textMuted,
                          ),
                        ),
                        const SizedBox(height: 6),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(99),
                          child: LinearProgressIndicator(
                            value: (b.progress / 100).clamp(0, 1),
                            minHeight: 3,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            if (books.completed.isNotEmpty) ...[
              const SizedBox(height: 24),
              SectionHeader(
                'Your recent books',
                action: TextButton(
                  onPressed: () => context.go('/books'),
                  child: const Text('View all'),
                ),
              ),
              const SizedBox(height: 12),
              BookShelfRow(
                books: [
                  for (final b in books.completed.take(8))
                    (
                      title: b.title,
                      subtitle: '${b.genre ?? 'Book'} · ${b.currentPages} pages',
                      coverImage: b.coverImage,
                      slug: b.slug,
                      onTap: () => context.push('/books/${b.id}'),
                    ),
                ],
              ),
            ],
            const SizedBox(height: 20),
            SectionHeader(
              'Popular on BookAI',
              action: TextButton(
                onPressed: () => context.go('/discover'),
                child: const Text('View all'),
              ),
            ),
            const SizedBox(height: 12),
            if (pub.books.isEmpty && !pub.loading)
              const Text(
                'Browse published manuscripts on Discover.',
                style: TextStyle(color: AppColors.textMuted, fontSize: 13),
              )
            else
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
          ],
        ),
      ),
    );
  }
}
