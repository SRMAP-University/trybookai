/// A book with its full text, from `GET /api/books/:id` (no `summary=1`).
class BookContent {
  BookContent({
    required this.id,
    required this.title,
    required this.status,
    this.coverImage,
    this.slug,
    this.description,
    this.genre,
    this.templateId,
    this.updatedAt,
    required this.chapters,
    required this.editions,
    this.edition = 1,
    this.tone,
    this.audience,
    this.pov,
    this.tense,
    this.language,
    this.model,
    this.creativity,
    this.includeDialogue,
    this.includeExamples,
    this.includeIllustrations = false,
    this.customInstructions,
    this.characters = const [],
    this.themes = const [],
    this.errorMessage,
  });

  final String id;
  final String title;
  final String status;
  final String? coverImage;
  final String? slug;
  final String? description;
  final String? genre;
  final String? templateId;

  /// Changes whenever the book does; part of the saved-layout key.
  final String? updatedAt;
  final List<ChapterContent> chapters;
  final List<EditionRef> editions;

  // How it was written (the book page's Settings and Story notes).
  final int edition;
  final String? tone;
  final String? audience;
  final String? pov;
  final String? tense;
  final String? language;
  final String? model;
  final double? creativity;
  final bool? includeDialogue;
  final bool? includeExamples;
  final bool includeIllustrations;
  final String? customInstructions;
  final List<String> characters;
  final List<String> themes;
  final String? errorMessage;

  /// Chapters that have text to read.
  List<ChapterContent> get readable =>
      chapters.where((c) => c.hasText).toList();

  /// Every word of the manuscript.
  int get wordCount => chapters.fold(
    0,
    (n, c) =>
        n +
        c.sections.fold(
          0,
          (m, s) => m + _words.allMatches(s.content ?? '').length,
        ),
  );

  static final _words = RegExp(r'\S+');

  factory BookContent.fromJson(Map<String, dynamic> json) {
    List<Map<String, dynamic>> list(Object? v) =>
        (v as List?)?.whereType<Map<String, dynamic>>().toList() ?? const [];
    List<String> strings(Object? v) =>
        (v as List?)?.whereType<String>().toList() ?? const [];
    return BookContent(
      edition: (json['edition'] as num?)?.toInt() ?? 1,
      tone: json['tone'] as String?,
      audience: json['audience'] as String?,
      pov: json['pov'] as String?,
      tense: json['tense'] as String?,
      language: json['language'] as String?,
      model: json['model'] as String?,
      creativity: (json['creativity'] as num?)?.toDouble(),
      includeDialogue: json['includeDialogue'] as bool?,
      includeExamples: json['includeExamples'] as bool?,
      includeIllustrations: json['includeIllustrations'] as bool? ?? false,
      customInstructions: json['customInstructions'] as String?,
      characters: strings(json['characters']),
      themes: strings(json['themes']),
      errorMessage: json['errorMessage'] as String?,
      id: json['id'] as String,
      title: json['title'] as String? ?? 'Book',
      status: json['status'] as String? ?? 'DRAFT',
      coverImage: json['coverImage'] as String?,
      slug: json['slug'] as String?,
      description: json['description'] as String?,
      genre: json['genre'] as String?,
      templateId: json['templateId'] as String?,
      updatedAt: json['updatedAt'] as String?,
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
    this.coverImage,
    this.slug,
  });

  final String id;
  final int edition;
  final String status;
  final String? title;
  final String? coverImage;
  final String? slug;

  factory EditionRef.fromJson(Map<String, dynamic> json) => EditionRef(
    id: json['id'] as String,
    edition: (json['edition'] as num?)?.toInt() ?? 1,
    status: json['status'] as String? ?? 'DRAFT',
    title: json['title'] as String?,
    coverImage: json['coverImage'] as String?,
    slug: json['slug'] as String?,
  );
}

/// A public book (`GET /api/public/books/:slug`) in the shape of
/// [BookContent]'s JSON, so the reader and book page work on it unchanged.
/// Public chapters carry no ids, so they get stable ones from their numbers;
/// the text is the markdown with pictures.
Map<String, dynamic> publicBookAsContent(Map<String, dynamic> j) => {
  ...j,
  'chapters': [
    for (final c in (j['chapters'] as List?) ?? const [])
      if (c is Map)
        {
          'id': 'ch-${c['number']}',
          'number': c['number'],
          'title': c['title'],
          'status': 'COMPLETED',
          'summary': c['summary'],
          'imageUrl': c['imageUrl'],
          'pageCount': c['pageCount'],
          'sections': [
            for (final s in (c['sections'] as List?) ?? const [])
              if (s is Map)
                {
                  'id': 'sec-${c['number']}-${s['number']}',
                  'number': s['number'],
                  'title': s['title'],
                  'content': s['markdown'] ?? s['content'],
                },
          ],
        },
  ],
  'editions': const [],
};
