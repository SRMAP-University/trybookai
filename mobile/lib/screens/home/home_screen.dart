import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:bookai_mobile/config/api_config.dart';
import 'package:bookai_mobile/providers/auth_provider.dart';
import 'package:bookai_mobile/providers/books_provider.dart';
import 'package:bookai_mobile/providers/public_books_provider.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
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
      _poll = Timer.periodic(const Duration(seconds: 4), (_) {
        if (!mounted) return;
        context.read<BooksProvider>().loadActiveJobs();
        context.read<AuthProvider>().refreshUser();
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
                          user.onTrial ? 'Free trial' : user.planLabel,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: AppColors.primary,
                            letterSpacing: 0.4,
                          ),
                        ),
                        const Spacer(),
                        TextButton(
                          style: TextButton.styleFrom(
                            visualDensity: VisualDensity.compact,
                            padding: const EdgeInsets.symmetric(horizontal: 8),
                            minimumSize: Size.zero,
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          ),
                          onPressed: () => context.push('/billing'),
                          child: const Text('Manage'),
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
            const SizedBox(height: 24),
            SectionHeader(
              'Generating now',
              action: TextButton(
                onPressed: () => context.go('/books'),
                child: const Text('All books'),
              ),
            ),
            const SizedBox(height: 10),
            if (books.loading && books.books.isEmpty)
              const Center(child: CircularProgressIndicator())
            else if ((books.activeJobs?.books.isEmpty ?? true) &&
                books.generating.isEmpty)
              StripeCard(
                child: Column(
                  children: [
                    const Icon(Icons.auto_stories_outlined,
                        color: AppColors.primary, size: 28),
                    const SizedBox(height: 10),
                    const Text(
                      'No books generating',
                      style: TextStyle(fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Start a new book to see live progress here.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 13, color: AppColors.textMuted),
                    ),
                    const SizedBox(height: 14),
                    FilledButton(
                      onPressed: () => context.push('/books/new'),
                      child: const Text('New book'),
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
                  padding: const EdgeInsets.only(bottom: 10),
                  child: StripeCard(
                    onTap: () => context.push('/books/${b.id}'),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                b.title,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 15,
                                ),
                              ),
                            ),
                            Text(
                              '${b.progress.round()}%',
                              style: const TextStyle(
                                color: AppColors.primary,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${b.status.toLowerCase()} · ${b.currentPages}/${b.targetPages} pages',
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.textMuted,
                          ),
                        ),
                        const SizedBox(height: 10),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(99),
                          child: LinearProgressIndicator(
                            value: (b.progress / 100).clamp(0, 1),
                            minHeight: 6,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            if (books.completed.isNotEmpty) ...[
              const SizedBox(height: 24),
              const SectionHeader('Recent books'),
              const SizedBox(height: 10),
              ...books.completed.take(5).map(
                    (b) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(b.title),
                      subtitle: Text(
                        '${b.genre ?? 'Book'} · ${b.currentPages} pages',
                        style: const TextStyle(color: AppColors.textMuted),
                      ),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => context.push('/books/${b.id}'),
                    ),
                  ),
            ],
            const SizedBox(height: 24),
            SectionHeader(
              'Public books',
              action: TextButton(
                onPressed: () => context.go('/discover'),
                child: const Text('See all'),
              ),
            ),
            const SizedBox(height: 10),
            if (pub.books.isEmpty && !pub.loading)
              const Text(
                'Browse published manuscripts on Discover.',
                style: TextStyle(color: AppColors.textMuted, fontSize: 13),
              )
            else
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: pub.books.take(6).length,
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
                  childAspectRatio: 0.62,
                ),
                itemBuilder: (context, i) {
                  final b = pub.books[i];
                  final cover = ApiConfig.coverUrl(b.coverImage, b.slug);
                  return InkWell(
                    onTap: () => context.push('/discover/${b.slug}'),
                    borderRadius: BorderRadius.circular(8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: Container(
                              width: double.infinity,
                              color: AppColors.mutedBg,
                              child: cover.isNotEmpty
                                  ? Image.network(
                                      cover,
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, _, _) => const Icon(
                                        Icons.menu_book_outlined,
                                        color: AppColors.primary,
                                      ),
                                    )
                                  : const Icon(
                                      Icons.menu_book_outlined,
                                      color: AppColors.primary,
                                    ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          b.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: AppColors.navy,
                          ),
                        ),
                        if (b.description != null &&
                            b.description!.isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(
                            b.description!,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 9,
                              height: 1.25,
                              color: AppColors.textMuted,
                            ),
                          ),
                        ],
                      ],
                    ),
                  );
                },
              ),
          ],
        ),
      ),
    );
  }
}
