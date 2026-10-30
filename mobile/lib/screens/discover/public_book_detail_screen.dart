import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:bookai_mobile/config/api_config.dart';
import 'package:bookai_mobile/models/book_content.dart';
import 'package:bookai_mobile/screens/books/book_page_parts.dart';
import 'package:bookai_mobile/services/api_client.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/skeleton.dart';

/// Someone's public book, laid out like your own book's page: the hero lit
/// by its cover (flying into the top bar as you scroll), stats and the
/// chapters, read in the same book reader.
class PublicBookDetailScreen extends StatefulWidget {
  const PublicBookDetailScreen({super.key, required this.slug});

  final String slug;

  @override
  State<PublicBookDetailScreen> createState() => _PublicBookDetailScreenState();
}

class _PublicBookDetailScreenState extends State<PublicBookDetailScreen> {
  final _scroll = ScrollController();
  final _coverKey = GlobalKey();
  final _titleKey = GlobalKey();

  BookContent? _book;
  String _author = 'BookAI author';
  int _pages = 0;
  bool _loading = true;
  String? _error;

  String get _publicUrl => '${ApiConfig.baseUrl}/books/${widget.slug}';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = context.read<ApiClient>();
    try {
      final res = await api.dio.get('${ApiConfig.publicBooks}/${widget.slug}');
      final json = res.data as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _book = BookContent.fromJson(publicBookAsContent(json));
        _author = json['author'] as String? ?? 'BookAI author';
        _pages = (json['currentPages'] as num?)?.toInt() ?? 0;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = api.extractError(e);
      });
    }
  }

  void _read([ChapterContent? from]) {
    final query = from == null ? '' : '?chapter=${from.id}';
    context.push('/discover/${widget.slug}/read$query');
  }

  Future<void> _share() async {
    final book = _book;
    await SharePlus.instance.share(
      ShareParams(text: _publicUrl, subject: book?.title),
    );
  }

  Future<void> _openWeb() async {
    await launchUrl(
      Uri.parse(_publicUrl),
      mode: LaunchMode.externalApplication,
    );
  }

  @override
  Widget build(BuildContext context) {
    final book = _book;
    if (book == null) {
      if (_loading) {
        return const AnnotatedRegion<SystemUiOverlayStyle>(
          value: SystemUiOverlayStyle.light,
          child: Scaffold(
            backgroundColor: AppColors.white,
            body: BookPageSkeleton(),
          ),
        );
      }
      return Scaffold(
        appBar: AppBar(),
        body: Center(child: Text(_error ?? 'Book not found')),
      );
    }

    final chapters = book.chapters;
    final words = book.wordCount;
    final inProgress =
        book.status == 'GENERATING' || book.status == 'OUTLINING';
    final meta = [
      'By $_author',
      if ((book.genre ?? '').isNotEmpty) book.genre!,
    ].join(' · ');

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: AppColors.white,
        body: Stack(
          children: [
            RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                controller: _scroll,
                padding: EdgeInsets.zero,
                children: [
                  BookHero(
                    title: book.title,
                    coverImage: book.coverImage,
                    slug: book.slug,
                    edition: 1,
                    meta: meta,
                    description: book.description,
                    coverKey: _coverKey,
                    titleKey: _titleKey,
                    pill: StatusPill(
                      status: book.status,
                      inProgress: inProgress,
                      chapterCount: chapters.length,
                    ),
                    actions: [
                      if (chapters.isNotEmpty)
                        StageButton(
                          tone: StageTone.primary,
                          icon: Icons.auto_stories_outlined,
                          label: 'Read the book',
                          onPressed: _read,
                        ),
                      StageButton(
                        icon: Icons.ios_share_rounded,
                        label: 'Share',
                        onPressed: _share,
                      ),
                      StageMenu(
                        onSelected: (v) {
                          if (v == 'web') _openWeb();
                        },
                        items: [
                          stageMenuItem(
                            'web',
                            Icons.open_in_new_rounded,
                            'Open on the website',
                          ),
                        ],
                      ),
                    ],
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 24, 20, 48),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        BookStats(
                          stats: [
                            ('Pages', '$_pages'),
                            ('Words', formatWords(words)),
                            ('Chapters', '${chapters.length}'),
                            ('Read', readingTime(words)),
                          ],
                        ),
                        const SizedBox(height: 32),
                        PageSectionTitle(
                          'Chapters',
                          trailing: chapters.isEmpty
                              ? null
                              : '${chapters.length} chapters',
                        ),
                        if (chapters.isEmpty)
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 24,
                              vertical: 48,
                            ),
                            decoration: BoxDecoration(
                              color: const Color(0xFFF7F8FB),
                              borderRadius: BorderRadius.circular(24),
                            ),
                            child: const Text(
                              'Chapters appear here as they are finished.',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: 14,
                                color: AppColors.textMuted,
                              ),
                            ),
                          )
                        else
                          ChapterList(
                            chapters: chapters,
                            inProgress: false,
                            canRewrite: false,
                            rewriting: null,
                            onRewrite: (_) {},
                            onRead: _read,
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Positioned.fill(
              child: HeroFlight(
                scroll: _scroll,
                coverKey: _coverKey,
                titleKey: _titleKey,
                title: book.title,
                coverImage: book.coverImage,
                slug: book.slug,
                coverBusy: false,
                onBack: () => Navigator.of(context).maybePop(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
