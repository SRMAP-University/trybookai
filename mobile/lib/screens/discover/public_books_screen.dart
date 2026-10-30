import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:bookai_mobile/providers/public_books_provider.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/book_cover_3d.dart';

class PublicBooksScreen extends StatefulWidget {
  const PublicBooksScreen({super.key});

  @override
  State<PublicBooksScreen> createState() => _PublicBooksScreenState();
}

class _PublicBooksScreenState extends State<PublicBooksScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<PublicBooksProvider>().load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final pub = context.watch<PublicBooksProvider>();

    return Scaffold(
      appBar: AppBar(title: const Text('Public books')),
      body: RefreshIndicator(
        onRefresh: () => context.read<PublicBooksProvider>().load(),
        child: pub.loading && pub.books.isEmpty
            ? const Center(child: CircularProgressIndicator())
            : pub.error != null && pub.books.isEmpty
                ? ListView(
                    children: [
                      const SizedBox(height: 80),
                      Center(
                        child: Text(
                          pub.error!,
                          style: const TextStyle(color: AppColors.textMuted),
                        ),
                      ),
                    ],
                  )
                : pub.books.isEmpty
                    ? ListView(
                        padding: const EdgeInsets.all(24),
                        children: const [
                          SizedBox(height: 60),
                          Icon(Icons.public_outlined,
                              size: 36, color: AppColors.primary),
                          SizedBox(height: 12),
                          Text(
                            'No public books yet',
                            textAlign: TextAlign.center,
                            style: TextStyle(fontWeight: FontWeight.w600),
                          ),
                        ],
                      )
                    : LayoutBuilder(
                        builder: (context, constraints) {
                          const gap = 18.0;
                          final cell = (constraints.maxWidth - 32 - gap) / 2;
                          final cover = cell - 10;
                          return GridView.builder(
                            padding: const EdgeInsets.fromLTRB(16, 8, 16, 110),
                            itemCount: pub.books.length,
                            gridDelegate:
                                SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: 2,
                              crossAxisSpacing: gap,
                              mainAxisSpacing: 22,
                              mainAxisExtent: cover * 1.6 + 62,
                            ),
                            itemBuilder: (context, i) {
                              final b = pub.books[i];
                              return GestureDetector(
                                onTap: () => context.push('/discover/${b.slug}'),
                                behavior: HitTestBehavior.opaque,
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    BookCover3D(
                                      title: b.title,
                                      coverImage: b.coverImage,
                                      slug: b.slug,
                                      width: cover,
                                    ),
                                    const SizedBox(height: 8),
                                    Text(
                                      b.title,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontSize: 14,
                                        fontWeight: FontWeight.w800,
                                        height: 1.2,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      b.author,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w700,
                                        color: AppColors.primary,
                                      ),
                                    ),
                                  ],
                                ),
                              );
                            },
                          );
                        },
                      ),
      ),
    );
  }
}
