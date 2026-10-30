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

/// A horizontal row of 3D book covers with title and subtitle.
class BookShelfRow extends StatelessWidget {
  const BookShelfRow({super.key, required this.books, this.coverWidth = 118});

  final List<ShelfBook> books;
  final double coverWidth;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: coverWidth * 1.6 + 64,
      child: ListView.separated(
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
                      fontWeight: FontWeight.w800,
                      fontSize: 13.5,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    b.subtitle,
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
            ),
          );
        },
      ),
    );
  }
}
