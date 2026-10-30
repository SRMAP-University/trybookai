import 'package:flutter/material.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/book_cover_3d.dart';

/// One book on a shelf row.
typedef ShelfBook = ({
  String title,
  String subtitle,
  String? coverImage,
  String? slug,
  VoidCallback onTap,
});

/// A horizontal row of 3D book covers standing on a wooden shelf, with
/// title and subtitle under each.
class BookShelfRow extends StatelessWidget {
  const BookShelfRow({
    super.key,
    required this.books,
    this.coverWidth = 118,
    this.shelf = true,
  });

  final List<ShelfBook> books;
  final double coverWidth;
  final bool shelf;

  @override
  Widget build(BuildContext context) {
    // Where the bottom of a cover's page block sits (see BookCover3D).
    final plankTop = coverWidth * 1.45 + coverWidth * 0.035 - 3;
    return SizedBox(
      height: coverWidth * 1.6 + 64,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          if (shelf)
            Positioned(
              left: -20,
              right: -20,
              top: plankTop,
              height: 12,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Color(0xFFF0F3F7), Color(0xFFDDE3EB)],
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.navy.withValues(alpha: 0.12),
                      blurRadius: 10,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
              ),
            ),
          _row(),
        ],
      ),
    );
  }

  Widget _row() {
    return ListView.separated(
      scrollDirection: Axis.horizontal,
      clipBehavior: Clip.none,
      padding: const EdgeInsets.only(right: 20),
      itemCount: books.length,
      separatorBuilder: (_, _) => const SizedBox(width: 18),
      itemBuilder: (context, i) {
        final b = books[i];
        return GestureDetector(
          onTap: b.onTap,
          behavior: HitTestBehavior.opaque,
          child: SizedBox(
            width: coverWidth + 6,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                BookCover3D(
                  title: b.title,
                  coverImage: b.coverImage,
                  slug: b.slug,
                  width: coverWidth,
                ),
                const SizedBox(height: 8),
                Text(
                  b.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                    color: AppColors.navy,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  b.subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppColors.textMuted,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
