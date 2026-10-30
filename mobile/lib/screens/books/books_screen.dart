import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:bookai_mobile/models/models.dart';
import 'package:bookai_mobile/providers/books_provider.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/book_cover_3d.dart';
import 'package:bookai_mobile/widgets/skeleton.dart';

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
      appBar: AppBar(title: const Text('Your books')),
      body: RefreshIndicator(
        onRefresh: books.load,
        child: books.loading && books.books.isEmpty
            ? const BookGridSkeleton()
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
                : LayoutBuilder(
                    builder: (context, constraints) {
                      const gap = 18.0;
                      final cell = (constraints.maxWidth - 40 - gap) / 2;
                      final cover = cell - 10;
                      return GridView.builder(
                        padding: const EdgeInsets.fromLTRB(20, 8, 20, 110),
                        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          crossAxisSpacing: gap,
                          mainAxisSpacing: 22,
                          mainAxisExtent: cover * 1.6 + 70,
                        ),
                        itemCount: books.books.length,
                        itemBuilder: (context, i) =>
                            BookShelfItem(book: books.books[i], coverWidth: cover),
                      );
                    },
                  ),
      ),
    );
  }
}

/// One book on the shelf: 3D cover, title and a friendly status line.
class BookShelfItem extends StatelessWidget {
  const BookShelfItem({super.key, required this.book, required this.coverWidth});

  final BookModel book;
  final double coverWidth;

  static String statusLabel(BookModel b) => switch (b.status) {
        'COMPLETED' => 'Ready to read',
        'GENERATING' => 'Writing · ${b.progress.round()}%',
        'OUTLINING' => 'Planning chapters',
        'FAILED' => 'Needs attention',
        'CANCELLED' => 'Stopped',
        _ => 'Draft',
      };

  @override
  Widget build(BuildContext context) {
    final failed = book.status == 'FAILED';
    return GestureDetector(
      onTap: () => context.push('/books/${book.id}'),
      behavior: HitTestBehavior.opaque,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          BookCover3D(
            title: book.title,
            coverImage: book.coverImage,
            slug: book.slug,
            width: coverWidth,
          ),
          const SizedBox(height: 8),
          Text(
            book.title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 14,
              height: 1.2,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            statusLabel(book),
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: failed ? AppColors.destructive : AppColors.primary,
            ),
          ),
          if (book.isGenerating) ...[
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: BorderRadius.circular(99),
              child: LinearProgressIndicator(
                value: (book.progress / 100).clamp(0, 1),
                minHeight: 4,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
