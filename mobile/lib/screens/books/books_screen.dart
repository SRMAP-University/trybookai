import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:bookai_mobile/providers/books_provider.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/common.dart';

class BooksScreen extends StatefulWidget {
  const BooksScreen({super.key});

  @override
  State<BooksScreen> createState() => _BooksScreenState();
}

class _BooksScreenState extends State<BooksScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<BooksProvider>().load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final books = context.watch<BooksProvider>();

    return Scaffold(
      appBar: AppBar(title: const Text('Books')),
      body: RefreshIndicator(
        onRefresh: books.load,
        child: books.loading && books.books.isEmpty
            ? const Center(child: CircularProgressIndicator())
            : books.books.isEmpty
                ? ListView(
                    children: const [
                      SizedBox(height: 80),
                      Center(
                        child: Text(
                          'No books yet. Tap New book to start.',
                          style: TextStyle(color: AppColors.textMuted),
                        ),
                      ),
                    ],
                  )
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 100),
                    itemCount: books.books.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 10),
                    itemBuilder: (context, i) {
                      final b = books.books[i];
                      return StripeCard(
                        onTap: () => context.push('/books/${b.id}'),
                        child: Row(
                          children: [
                            Container(
                              width: 48,
                              height: 64,
                              decoration: BoxDecoration(
                                color: AppColors.mutedBg,
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(color: AppColors.border),
                              ),
                              child: b.coverImage != null
                                  ? ClipRRect(
                                      borderRadius: BorderRadius.circular(6),
                                      child: Image.network(
                                        b.coverImage!,
                                        fit: BoxFit.cover,
                                        errorBuilder: (_, _, _) =>
                                            const Icon(Icons.menu_book_outlined),
                                      ),
                                    )
                                  : const Icon(
                                      Icons.menu_book_outlined,
                                      color: AppColors.primary,
                                    ),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    b.title,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w600,
                                      fontSize: 15,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '${b.status.toLowerCase()} · ${b.currentPages}/${b.targetPages} pg',
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: AppColors.textMuted,
                                    ),
                                  ),
                                  if (b.isGenerating) ...[
                                    const SizedBox(height: 8),
                                    LinearProgressIndicator(
                                      value: (b.progress / 100).clamp(0, 1),
                                      minHeight: 4,
                                    ),
                                  ],
                                ],
                              ),
                            ),
                            const Icon(Icons.chevron_right,
                                color: AppColors.textMuted),
                          ],
                        ),
                      );
                    },
                  ),
      ),
    );
  }
}
