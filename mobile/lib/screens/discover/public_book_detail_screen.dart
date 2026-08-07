import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:bookai_mobile/config/api_config.dart';
import 'package:bookai_mobile/models/models.dart';
import 'package:bookai_mobile/providers/public_books_provider.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/common.dart';

class PublicBookDetailScreen extends StatefulWidget {
  const PublicBookDetailScreen({super.key, required this.slug});

  final String slug;

  @override
  State<PublicBookDetailScreen> createState() => _PublicBookDetailScreenState();
}

class _PublicBookDetailScreenState extends State<PublicBookDetailScreen> {
  PublicBookDetail? _book;
  bool _loading = true;
  String? _error;
  int? _openChapter;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final book = await context.read<PublicBooksProvider>().fetch(widget.slug);
    if (!mounted) return;
    setState(() {
      _book = book;
      _loading = false;
      _error = book == null ? 'Book not found' : null;
    });
  }

  Future<void> _openWeb() async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/books/${widget.slug}');
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final book = _book;
    final cover = book == null
        ? ''
        : ApiConfig.coverUrl(book.coverImage, book.slug);

    return Scaffold(
      appBar: AppBar(
        title: Text(book?.title ?? 'Book'),
        actions: [
          IconButton(
            onPressed: _openWeb,
            icon: const Icon(Icons.open_in_new_rounded),
            tooltip: 'Open on web',
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null || book == null
              ? Center(child: Text(_error ?? 'Not found'))
              : ListView(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Container(
                            width: 96,
                            height: 140,
                            color: AppColors.mutedBg,
                            child: cover.isNotEmpty
                                ? Image.network(cover, fit: BoxFit.cover)
                                : const Icon(Icons.menu_book_outlined,
                                    color: AppColors.primary, size: 32),
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                book.title,
                                style: const TextStyle(
                                  fontSize: 20,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: -0.4,
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                book.author,
                                style: const TextStyle(
                                  color: AppColors.textMuted,
                                  fontSize: 13,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                [
                                  if (book.genre != null) book.genre!,
                                  '${book.chapters.length} chapters',
                                  '${book.currentPages} pages',
                                ].join(' · '),
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: AppColors.textBody,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    if (book.description != null &&
                        book.description!.isNotEmpty) ...[
                      const SizedBox(height: 20),
                      ExpandableText(
                        book.description!,
                        maxLines: 3,
                        style: const TextStyle(
                          color: AppColors.textBody,
                          height: 1.45,
                          fontSize: 14,
                        ),
                      ),
                    ],
                    const SizedBox(height: 24),
                    const SectionHeader('Chapters'),
                    const SizedBox(height: 8),
                    if (book.chapters.isEmpty)
                      const Text(
                        'Chapters will appear when the manuscript is ready.',
                        style: TextStyle(color: AppColors.textMuted),
                      )
                    else
                      ...book.chapters.map((ch) {
                        final open = _openChapter == ch.number;
                        final body = ch.sections
                            .map((s) => s.content ?? '')
                            .where((c) => c.isNotEmpty)
                            .join('\n\n');
                        return StripeCard(
                          onTap: () => setState(
                            () => _openChapter = open ? null : ch.number,
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      '${ch.number}. ${ch.title}',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w600,
                                        fontSize: 15,
                                      ),
                                    ),
                                  ),
                                  Icon(
                                    open
                                        ? Icons.expand_less
                                        : Icons.expand_more,
                                    color: AppColors.textMuted,
                                  ),
                                ],
                              ),
                              if (ch.summary != null &&
                                  ch.summary!.isNotEmpty) ...[
                                const SizedBox(height: 6),
                                Text(
                                  ch.summary!,
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: AppColors.textMuted,
                                  ),
                                ),
                              ],
                              if (open && body.isNotEmpty) ...[
                                const SizedBox(height: 12),
                                Text(
                                  body,
                                  style: const TextStyle(
                                    fontSize: 14,
                                    height: 1.55,
                                    color: AppColors.navy,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        );
                      }).expand(
                        (w) => [w, const SizedBox(height: 10)],
                      ),
                  ],
                ),
    );
  }
}
