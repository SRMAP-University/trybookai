import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:bookai_mobile/config/api_config.dart';
import 'package:bookai_mobile/providers/public_books_provider.dart';
import 'package:bookai_mobile/theme/app_theme.dart';

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
                    : GridView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
                        itemCount: pub.books.length,
                        gridDelegate:
                            const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          mainAxisSpacing: 14,
                          crossAxisSpacing: 12,
                          childAspectRatio: 0.58,
                        ),
                        itemBuilder: (context, i) {
                          final b = pub.books[i];
                          final cover =
                              ApiConfig.coverUrl(b.coverImage, b.slug);
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
                                              errorBuilder: (_, _, _) =>
                                                  const Icon(
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
      ),
    );
  }
}
