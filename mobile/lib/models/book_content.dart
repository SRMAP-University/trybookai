/// A book with its full text, from `GET /api/books/:id` (no `summary=1`).
class BookContent {
  BookContent({
    required this.id,
    required this.title,
    required this.status,
    this.coverImage,
    this.slug,
    required this.chapters,
    required this.editions,
  });

  final String id;
  final String title;
  final String status;
  final String? coverImage;
  final String? slug;
  final List<ChapterContent> chapters;
  final List<EditionRef> editions;

  /// Chapters that have text to read.
  List<ChapterContent> get readable =>
      chapters.where((c) => c.hasText).toList();

  factory BookContent.fromJson(Map<String, dynamic> json) {
    List<Map<String, dynamic>> list(Object? v) =>
        (v as List?)?.whereType<Map<String, dynamic>>().toList() ?? const [];
    return BookContent(
      id: json['id'] as String,
      title: json['title'] as String? ?? 'Book',
      status: json['status'] as String? ?? 'DRAFT',
      coverImage: json['coverImage'] as String?,
      slug: json['slug'] as String?,
      chapters: list(json['chapters']).map(ChapterContent.fromJson).toList(),
      editions: list(json['editions']).map(EditionRef.fromJson).toList(),
    );
  }
}

class ChapterContent {
  ChapterContent({
    required this.id,
    required this.number,
    required this.title,
    required this.status,
    this.summary,
    this.imageUrl,
    required this.pageCount,
    required this.sections,
  });

  final String id;
  final int number;
  final String title;
  final String status;
  final String? summary;
  final String? imageUrl;
  final int pageCount;
  final List<SectionContent> sections;

  bool get hasText => sections.any((s) => (s.content ?? '').trim().isNotEmpty);

  factory ChapterContent.fromJson(Map<String, dynamic> json) => ChapterContent(
        id: json['id'] as String,
        number: (json['number'] as num?)?.toInt() ?? 0,
        title: json['title'] as String? ?? '',
        status: json['status'] as String? ?? 'PENDING',
        summary: json['summary'] as String?,
        imageUrl: json['imageUrl'] as String?,
        pageCount: (json['pageCount'] as num?)?.toInt() ?? 0,
        sections: ((json['sections'] as List?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(SectionContent.fromJson)
            .toList(),
      );
}

class SectionContent {
  SectionContent({
    required this.id,
    required this.number,
    required this.title,
    this.content,
  });

  final String id;
  final int number;
  final String title;
  final String? content;

  factory SectionContent.fromJson(Map<String, dynamic> json) => SectionContent(
        id: json['id'] as String,
        number: (json['number'] as num?)?.toInt() ?? 0,
        title: json['title'] as String? ?? '',
        content: json['content'] as String?,
      );
}

/// Another edition of the same book (same premise, fresh manuscript).
class EditionRef {
  EditionRef({
    required this.id,
    required this.edition,
    required this.status,
    this.title,
  });

  final String id;
  final int edition;
  final String status;
  final String? title;

  factory EditionRef.fromJson(Map<String, dynamic> json) => EditionRef(
        id: json['id'] as String,
        edition: (json['edition'] as num?)?.toInt() ?? 1,
        status: json['status'] as String? ?? 'DRAFT',
        title: json['title'] as String?,
      );
}
