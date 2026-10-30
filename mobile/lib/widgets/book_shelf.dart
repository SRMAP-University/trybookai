import 'package:flutter/material.dart';
import 'package:bookai_mobile/widgets/book_cover_3d.dart';

/// One book on a shelf row.
typedef ShelfBook = ({
  String title,
  String? coverImage,
  String? slug,
  VoidCallback onTap,
});

/// A horizontal row of 3D book covers. Covers only: the title is on the
/// cover, and screen readers get it from the label.
class BookShelfRow extends StatelessWidget {
  const BookShelfRow({super.key, required this.books, this.coverWidth = 118});

  final List<ShelfBook> books;
  final double coverWidth;

  @override
  Widget build(BuildContext context) {
    final coverHeight = coverWidth * 1.45;
    final pages = coverWidth * 0.035;
    return SizedBox(
      // Cover, page edges and the ribbon, plus room for the cover's shadow.
      height: coverHeight * 1.07 + pages + 16,
      child: ListView.separated(
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
      ),
    );
  }
}
