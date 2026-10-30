import 'package:flutter/material.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/book_cover_3d.dart';

/// One book on a shelf row.
typedef ShelfBook = ({
  String title,
  String? coverImage,
  String? slug,
  VoidCallback onTap,
});

/// A horizontal row of 3D book covers standing on a shelf. Covers only:
/// the title is on the cover, and screen readers get it from the label.
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
    final coverHeight = coverWidth * 1.45;
    final pages = coverWidth * 0.035;
    // Where the bottom of a cover's page block sits (see BookCover3D).
    final plankTop = coverHeight + pages - 2;
    return SizedBox(
      // Cover, page edges and the ribbon hanging over the shelf, plus room
      // for the shelf's shadow.
      height: coverHeight * 1.07 + pages + 16,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          // A thin ledge: light top edge, short soft shadow.
          if (shelf)
            Positioned(
              left: -20,
              right: -20,
              top: plankTop,
              height: 6,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Color(0xFFF6F8FB), Color(0xFFDDE3EB)],
                  ),
                  border: const Border(
                    top: BorderSide(color: Color(0xFFFFFFFF)),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.navy.withValues(alpha: 0.08),
                      blurRadius: 4,
                      offset: const Offset(0, 2),
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
        return Semantics(
          button: true,
          label: b.title,
          excludeSemantics: true,
          child: GestureDetector(
            onTap: b.onTap,
            behavior: HitTestBehavior.opaque,
            child: Align(
              alignment: Alignment.topCenter,
              child: BookCover3D(
                title: b.title,
                coverImage: b.coverImage,
                slug: b.slug,
                width: coverWidth,
              ),
            ),
          ),
        );
      },
    );
  }
}
