import 'package:bookai_mobile/config/api_config.dart';

class UserModel {
  UserModel({
    required this.id,
    required this.email,
    this.name,
    this.image,
    required this.plan,
    required this.pagesUsed,
    required this.pagesLimit,
    required this.audioMinutesUsed,
    required this.audioMinutesLimit,
    required this.onTrial,
    this.trialEndsAt,
    required this.hasUsedPremiumTrial,
    required this.hasStripeSubscription,
  });

  final String id;
  final String email;
  final String? name;
  final String? image;
  final String plan;
  final int pagesUsed;
  final int pagesLimit;
  final int audioMinutesUsed;
  final int audioMinutesLimit;
  final bool onTrial;
  final String? trialEndsAt;
  final bool hasUsedPremiumTrial;
  final bool hasStripeSubscription;

  String get planLabel {
    switch (plan) {
      case 'ENTERPRISE':
        return 'Premium';
      case 'UNLIMITED':
        return 'Unlimited';
      case 'PRO':
        return 'Pro';
      default:
        return 'Free';
    }
  }

  double get pagesPercent =>
      pagesLimit <= 0 ? 0 : (pagesUsed / pagesLimit).clamp(0, 1);

  bool get isPaid =>
      plan == 'PRO' || plan == 'ENTERPRISE' || plan == 'UNLIMITED';

  int get pagesRemaining => (pagesLimit - pagesUsed).clamp(0, pagesLimit);

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['id'] as String,
      email: json['email'] as String,
      name: json['name'] as String?,
      image: json['image'] as String?,
      plan: json['plan'] as String? ?? 'FREE',
      pagesUsed: (json['pagesUsed'] as num?)?.toInt() ?? 0,
      pagesLimit: (json['pagesLimit'] as num?)?.toInt() ?? 50,
      audioMinutesUsed: (json['audioMinutesUsed'] as num?)?.toInt() ?? 0,
      audioMinutesLimit: (json['audioMinutesLimit'] as num?)?.toInt() ?? 0,
      onTrial: json['onTrial'] as bool? ?? false,
      trialEndsAt: json['trialEndsAt'] as String?,
      hasUsedPremiumTrial: json['hasUsedPremiumTrial'] as bool? ?? false,
      hasStripeSubscription: json['hasStripeSubscription'] as bool? ?? false,
    );
  }
}

class BookModel {
  BookModel({
    required this.id,
    required this.title,
    required this.status,
    required this.progress,
    required this.currentPages,
    required this.targetPages,
    this.genre,
    this.coverImage,
    this.description,
    this.updatedAt,
    this.slug,
    this.isPublic = true,
    this.canMakePrivate = false,
    this.generateAudiobookOnComplete = false,
  });

  final String id;
  final String title;
  final String status;
  final double progress;
  final int currentPages;
  final int targetPages;
  final String? genre;
  final String? coverImage;
  final String? description;
  final String? updatedAt;
  final String? slug;
  final bool isPublic;
  final bool canMakePrivate;
  final bool generateAudiobookOnComplete;

  bool get isGenerating =>
      status == 'GENERATING' || status == 'OUTLINING';

  String? get publicUrl {
    if (slug == null || slug!.isEmpty) return null;
    return '${ApiConfig.baseUrl}/books/$slug';
  }

  BookModel copyWith({
    String? status,
    double? progress,
    int? currentPages,
    int? targetPages,
    String? coverImage,
    bool? isPublic,
    bool? generateAudiobookOnComplete,
  }) {
    return BookModel(
      id: id,
      title: title,
      status: status ?? this.status,
      progress: progress ?? this.progress,
      currentPages: currentPages ?? this.currentPages,
      targetPages: targetPages ?? this.targetPages,
      genre: genre,
      coverImage: coverImage ?? this.coverImage,
      description: description,
      updatedAt: updatedAt,
      slug: slug,
      isPublic: isPublic ?? this.isPublic,
      canMakePrivate: canMakePrivate,
      generateAudiobookOnComplete:
          generateAudiobookOnComplete ?? this.generateAudiobookOnComplete,
    );
  }

  factory BookModel.fromJson(Map<String, dynamic> json) {
    return BookModel(
      id: json['id'] as String,
      title: json['title'] as String? ?? 'Untitled',
      status: json['status'] as String? ?? 'DRAFT',
      progress: (json['progress'] as num?)?.toDouble() ?? 0,
      currentPages: (json['currentPages'] as num?)?.toInt() ?? 0,
      targetPages: (json['targetPages'] as num?)?.toInt() ?? 0,
      genre: json['genre'] as String?,
      coverImage: json['coverImage'] as String?,
      description: json['description'] as String?,
      updatedAt: json['updatedAt'] as String?,
      slug: json['slug'] as String?,
      isPublic: json['isPublic'] as bool? ?? true,
      canMakePrivate: json['canMakePrivate'] as bool? ?? false,
      generateAudiobookOnComplete:
          json['generateAudiobookOnComplete'] as bool? ?? false,
    );
  }
}

class ActiveAudioJob {
  ActiveAudioJob({
    required this.id,
    required this.bookId,
    required this.bookTitle,
    required this.type,
    required this.status,
    required this.progress,
    this.title,
  });

  final String id;
  final String bookId;
  final String bookTitle;
  final String type;
  final String status;
  final double progress;
  final String? title;

  String get typeLabel {
    switch (type) {
      case 'PODCAST':
        return 'Podcast';
      case 'MUSIC':
        return 'Theme music';
      default:
        return 'Audiobook';
    }
  }

  factory ActiveAudioJob.fromJson(Map<String, dynamic> json) {
    return ActiveAudioJob(
      id: json['id'] as String,
      bookId: json['bookId'] as String? ?? '',
      bookTitle: json['bookTitle'] as String? ?? 'Book',
      type: json['type'] as String? ?? 'AUDIOBOOK',
      status: json['status'] as String? ?? 'PENDING',
      progress: (json['progress'] as num?)?.toDouble() ?? 0,
      title: json['title'] as String?,
    );
  }
}

class ActiveJobs {
  ActiveJobs({required this.books, required this.audios});

  final List<BookModel> books;
  final List<ActiveAudioJob> audios;

  int get total => books.length + audios.length;

  factory ActiveJobs.fromJson(Map<String, dynamic> json) {
    final books = (json['books'] as List? ?? [])
        .map((e) => BookModel.fromJson(e as Map<String, dynamic>))
        .toList();
    final audios = (json['audios'] as List? ?? [])
        .map((e) => ActiveAudioJob.fromJson(e as Map<String, dynamic>))
        .toList();
    return ActiveJobs(books: books, audios: audios);
  }
}

class PublicBookModel {
  PublicBookModel({
    required this.id,
    required this.slug,
    required this.title,
    required this.author,
    this.description,
    this.genre,
    this.coverImage,
    required this.currentPages,
    required this.targetPages,
    required this.chapterCount,
    this.status,
  });

  final String id;
  final String slug;
  final String title;
  final String author;
  final String? description;
  final String? genre;
  final String? coverImage;
  final int currentPages;
  final int targetPages;
  final int chapterCount;
  final String? status;

  factory PublicBookModel.fromJson(Map<String, dynamic> json) {
    return PublicBookModel(
      id: json['id'] as String? ?? '',
      slug: json['slug'] as String? ?? '',
      title: json['title'] as String? ?? 'Untitled',
      author: json['author'] as String? ?? 'BookAI author',
      description: json['description'] as String?,
      genre: json['genre'] as String?,
      coverImage: json['coverImage'] as String?,
      currentPages: (json['currentPages'] as num?)?.toInt() ?? 0,
      targetPages: (json['targetPages'] as num?)?.toInt() ?? 0,
      chapterCount: (json['chapterCount'] as num?)?.toInt() ?? 0,
      status: json['status'] as String?,
    );
  }
}

class PublicChapterModel {
  PublicChapterModel({
    required this.number,
    required this.title,
    this.summary,
    required this.pageCount,
    required this.sections,
  });

  final int number;
  final String title;
  final String? summary;
  final int pageCount;
  final List<PublicSectionModel> sections;

  factory PublicChapterModel.fromJson(Map<String, dynamic> json) {
    final sections = (json['sections'] as List? ?? [])
        .map((e) => PublicSectionModel.fromJson(e as Map<String, dynamic>))
        .toList();
    return PublicChapterModel(
      number: (json['number'] as num?)?.toInt() ?? 0,
      title: json['title'] as String? ?? 'Chapter',
      summary: json['summary'] as String?,
      pageCount: (json['pageCount'] as num?)?.toInt() ?? 0,
      sections: sections,
    );
  }
}

class PublicSectionModel {
  PublicSectionModel({
    required this.number,
    required this.title,
    this.content,
    required this.pageCount,
    required this.wordCount,
  });

  final int number;
  final String title;
  final String? content;
  final int pageCount;
  final int wordCount;

  factory PublicSectionModel.fromJson(Map<String, dynamic> json) {
    return PublicSectionModel(
      number: (json['number'] as num?)?.toInt() ?? 0,
      title: json['title'] as String? ?? '',
      content: json['content'] as String?,
      pageCount: (json['pageCount'] as num?)?.toInt() ?? 0,
      wordCount: (json['wordCount'] as num?)?.toInt() ?? 0,
    );
  }
}

class PublicBookDetail extends PublicBookModel {
  PublicBookDetail({
    required super.id,
    required super.slug,
    required super.title,
    required super.author,
    super.description,
    super.genre,
    super.coverImage,
    required super.currentPages,
    required super.targetPages,
    required super.chapterCount,
    super.status,
    required this.chapters,
  });

  final List<PublicChapterModel> chapters;

  factory PublicBookDetail.fromJson(Map<String, dynamic> json) {
    final chapters = (json['chapters'] as List? ?? [])
        .map((e) => PublicChapterModel.fromJson(e as Map<String, dynamic>))
        .toList();
    return PublicBookDetail(
      id: json['id'] as String? ?? '',
      slug: json['slug'] as String? ?? '',
      title: json['title'] as String? ?? 'Untitled',
      author: json['author'] as String? ?? 'BookAI author',
      description: json['description'] as String?,
      genre: json['genre'] as String?,
      coverImage: json['coverImage'] as String?,
      currentPages: (json['currentPages'] as num?)?.toInt() ?? 0,
      targetPages: (json['targetPages'] as num?)?.toInt() ?? 0,
      chapterCount: chapters.length,
      status: json['status'] as String?,
      chapters: chapters,
    );
  }
}
