import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:bookai_mobile/config/api_config.dart';
import 'package:bookai_mobile/config/app_billing.dart';
import 'package:bookai_mobile/models/book_content.dart';
import 'package:bookai_mobile/models/models.dart';
import 'package:bookai_mobile/providers/auth_provider.dart';
import 'package:bookai_mobile/providers/books_provider.dart';
import 'package:bookai_mobile/reels/story_reels_panel.dart';
import 'package:bookai_mobile/screens/books/book_page_parts.dart';
import 'package:bookai_mobile/services/api_client.dart';
import 'package:bookai_mobile/services/file_download.dart';
import 'package:bookai_mobile/services/generation_stream.dart';
import 'package:bookai_mobile/services/push_notifications.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/skeleton.dart';
import 'package:bookai_mobile/widgets/audiobook_player.dart';
import 'package:bookai_mobile/widgets/common.dart';
import 'package:bookai_mobile/widgets/generation_speed_sheet.dart';
import 'package:bookai_mobile/widgets/premium_upgrade_sheet.dart';

class BookDetailScreen extends StatefulWidget {
  const BookDetailScreen({
    super.key,
    required this.bookId,
    this.promptGenerate = false,
  });

  final String bookId;
  final bool promptGenerate;

  @override
  State<BookDetailScreen> createState() => _BookDetailScreenState();
}

class _BookDetailScreenState extends State<BookDetailScreen> {
  BookModel? _book;
  bool _loading = true;
  Timer? _poll;
  Timer? _reconnect;
  Timer? _uiFlush;
  GenerationStream? _stream;
  int _listenId = 0;
  int _backoffMs = 2000;
  bool _uiDirty = false;
  String _phase = '';
  String _liveText = '';
  bool _streaming = false;
  bool _audioBusy = false;
  bool _offeredAudio = false;
  bool _downloadingBook = false;
  bool _downloadingAudio = false;
  bool _offeredReview = false;
  bool _promptedGenerate = false;
  List<Map<String, dynamic>> _audios = [];

  /// Chapters with their text, for the chapter list and the Read button.
  BookContent? _content;
  String? _rewritingChapter;
  bool _coverBusy = false;
  int? _liveChapter;
  String? _liveChapterId;
  final _liveKey = GlobalKey();
  final _audioKey = GlobalKey();

  /// The page's scroll, and the hero places the cover and title fly from.
  final _scroll = ScrollController();
  final _coverKey = GlobalKey();
  final _titleKey = GlobalKey();

  @override
  void initState() {
    super.initState();
    _load().then((_) {
      if (_book?.isGenerating == true) _connectStream();
      if (_book?.status == 'COMPLETED') _loadAudios();
      _maybePromptGenerate();
    });
    _loadContent();
    _poll = Timer.periodic(const Duration(seconds: 12), (_) => _refreshQuiet());
  }

  @override
  void dispose() {
    _scroll.dispose();
    _poll?.cancel();
    _reconnect?.cancel();
    _uiFlush?.cancel();
    _stream?.stop();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final book = await context.read<BooksProvider>().fetchBook(widget.bookId);
    if (!mounted) return;
    setState(() {
      _book = book;
      _loading = false;
    });
  }

  Future<void> _loadContent() async {
    final content =
        await context.read<BooksProvider>().fetchContent(widget.bookId);
    if (!mounted || content == null) return;
    setState(() => _content = content);
  }

  void _read([ChapterContent? from]) {
    final query = from == null ? '' : '?chapter=${from.id}';
    context.push('/books/${widget.bookId}/read$query');
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  String _errorText(Object e) => '$e'.replaceFirst('Exception: ', '');

  Future<bool> _confirm({
    required String title,
    required String body,
    required String action,
    bool destructive = false,
  }) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: destructive
                ? FilledButton.styleFrom(
                    backgroundColor: AppColors.destructive,
                  )
                : null,
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(action),
          ),
        ],
      ),
    );
    return ok == true;
  }

  Future<void> _rewriteChapter(ChapterContent chapter) async {
    if (_rewritingChapter != null) return;
    final ok = await _confirm(
      title: 'Rewrite chapter ${chapter.number}?',
      body:
          'BookAI writes this chapter again from its outline and replaces the current text. It can take a few minutes.',
      action: 'Rewrite',
    );
    if (!ok || !mounted) return;
    setState(() => _rewritingChapter = chapter.id);
    try {
      await context
          .read<BooksProvider>()
          .regenerateChapter(widget.bookId, chapter.id);
      if (!mounted) return;
      _toast('Chapter ${chapter.number} rewritten');
      await _loadContent();
    } catch (e) {
      if (mounted) _toast(_errorText(e));
    } finally {
      if (mounted) setState(() => _rewritingChapter = null);
    }
  }

  Future<void> _newCover() async {
    final book = _book;
    if (book == null || _coverBusy) return;
    setState(() => _coverBusy = true);
    final oldUrl = ApiConfig.coverUrl(book.coverImage, book.slug);
    try {
      await context.read<BooksProvider>().regenerateCover(widget.bookId);
      if (oldUrl.isNotEmpty) await CachedNetworkImage.evictFromCache(oldUrl);
      await _refreshQuiet();
      if (mounted) _toast('New cover ready');
    } catch (e) {
      if (mounted) _toast(_errorText(e));
    } finally {
      if (mounted) setState(() => _coverBusy = false);
    }
  }

  Future<void> _newEdition() async {
    final ok = await _confirm(
      title: 'Write a new edition?',
      body:
          'BookAI starts a fresh manuscript from the same idea and settings. This book stays as it is, and the new edition uses page credits like any new book.',
      action: 'Start new edition',
    );
    if (!ok || !mounted) return;
    try {
      final next =
          await context.read<BooksProvider>().newEdition(widget.bookId);
      if (!mounted) return;
      context.pushReplacement('/books/${next.id}?generate=1');
    } catch (e) {
      if (mounted) _toast(_errorText(e));
    }
  }

  Future<void> _delete() async {
    final book = _book;
    if (book == null) return;
    final ok = await _confirm(
      title: 'Delete this book?',
      body: '"${book.title}" will be deleted for good. This can\'t be undone.',
      action: 'Delete',
      destructive: true,
    );
    if (!ok || !mounted) return;
    try {
      await context.read<BooksProvider>().deleteBook(widget.bookId);
      if (!mounted) return;
      _toast('Book deleted');
      context.go('/books');
    } catch (e) {
      if (mounted) _toast(_errorText(e));
    }
  }

  void _onMenu(String action) {
    switch (action) {
      case 'editor':
        unawaited(_openEditor());
      case 'refresh':
        unawaited(_refreshQuiet());
        unawaited(_loadContent());
      case 'edition':
        unawaited(_newEdition());
      case 'cover':
        unawaited(_newCover());
      case 'export':
        if (!_downloadingBook) unawaited(_downloadBook());
      case 'share':
        unawaited(_share());
      case 'copy':
        unawaited(_copyLink());
      case 'troubleshoot':
        _showReviewSheet(trigger: 'manual');
      case 'web':
        unawaited(_openExport());
      case 'delete':
        unawaited(_delete());
    }
  }

  Future<void> _openEditor() async {
    final url = Uri.parse('${ApiConfig.baseUrl}/editor/${widget.bookId}');
    await launchUrl(url, mode: LaunchMode.externalApplication);
  }

  void _scrollTo(GlobalKey key) {
    final target = key.currentContext;
    if (target == null) return;
    Scrollable.ensureVisible(
      target,
      duration: const Duration(milliseconds: 450),
      curve: Curves.easeOutCubic,
      alignment: 0.05,
    );
  }

  void _back() {
    if (Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    } else {
      context.go('/books');
    }
  }

  Future<void> _loadAudios() async {
    final list =
        await context.read<BooksProvider>().fetchAudios(widget.bookId);
    if (!mounted) return;
    setState(() => _audios = list);
  }

  Future<void> _refreshQuiet() async {
    final book = await context.read<BooksProvider>().fetchBook(widget.bookId);
    if (!mounted || book == null) return;
    final wasGenerating = _book?.isGenerating == true;
    final justCompleted =
        wasGenerating && book.status == 'COMPLETED';
    final justFailed = wasGenerating && book.status == 'FAILED';
    final audioRunning = _audios.any(
      (a) => a['status'] == 'GENERATING' || a['status'] == 'PENDING',
    );
    setState(() => _book = book);
    if (book.isGenerating && !_streaming) {
      _connectStream();
    } else if (!book.isGenerating && wasGenerating) {
      _listenId += 1;
      _reconnect?.cancel();
      _stream?.stop();
      setState(() => _streaming = false);
      unawaited(_loadContent());
    }
    if (justCompleted) {
      await _loadAudios();
      _maybeOfferAudiobook();
      _maybeOfferReview(trigger: 'completed');
    } else if (justFailed) {
      _maybeOfferReview(trigger: 'failed');
    } else if (book.status == 'COMPLETED' && audioRunning) {
      // Pick up completed tracks without leaving the screen.
      await _loadAudios();
    }
  }

  void _maybeOfferReview({required String trigger}) {
    if (_offeredReview || !mounted) return;
    _offeredReview = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _showReviewSheet(trigger: trigger);
    });
  }

  Future<void> _showReviewSheet({required String trigger}) async {
    String? sentiment;
    final commentCtrl = TextEditingController();
    final isFailed = trigger == 'failed';
    final isManual = trigger == 'manual';

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            8,
            20,
            28 + MediaQuery.of(ctx).viewInsets.bottom,
          ),
          child: StatefulBuilder(
            builder: (ctx, setModal) {
              return Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    isManual
                        ? 'Report an issue'
                        : isFailed
                            ? 'Generation failed — how bad was it?'
                            : 'How was this generation?',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    isManual
                        ? 'Tell us what’s wrong so we can fix it.'
                        : 'Quick feedback helps us improve BookAI.',
                    style: const TextStyle(color: AppColors.textMuted, height: 1.4),
                  ),
                  if (!isManual) ...[
                    const SizedBox(height: 14),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final opt in (isFailed
                            ? const [
                                ('disappointed', 'Frustrating'),
                                ('ok', 'Annoying'),
                                ('complaint', 'Broken'),
                              ]
                            : const [
                                ('happy', 'Loved it'),
                                ('ok', 'Okay'),
                                ('disappointed', 'Disappointed'),
                              ]))
                          ChoiceChip(
                            label: Text(opt.$2),
                            selected: sentiment == opt.$1,
                            onSelected: (_) =>
                                setModal(() => sentiment = opt.$1),
                          ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 12),
                  TextField(
                    controller: commentCtrl,
                    maxLines: 3,
                    decoration: InputDecoration(
                      hintText: isFailed || isManual
                          ? 'What went wrong?'
                          : 'Optional — what should we improve?',
                      border: const OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 14),
                  FilledButton(
                    onPressed: () async {
                      final s = isManual ? 'complaint' : sentiment;
                      if (s == null) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Pick how it went')),
                        );
                        return;
                      }
                      if ((s == 'complaint' || isManual) &&
                          commentCtrl.text.trim().isEmpty) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Please describe the issue'),
                          ),
                        );
                        return;
                      }
                      try {
                        final api = context.read<ApiClient>();
                        await api.dio.post(
                          '${ApiConfig.books}/${widget.bookId}/feedback',
                          data: {
                            'sentiment': s,
                            'trigger': isManual ? 'manual' : trigger,
                            'rating': s == 'happy'
                                ? 5
                                : s == 'ok'
                                    ? 3
                                    : 1,
                            'comment': commentCtrl.text.trim().isEmpty
                                ? null
                                : commentCtrl.text.trim(),
                          },
                        );
                        if (ctx.mounted) Navigator.pop(ctx);
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Thanks for the feedback')),
                          );
                        }
                      } catch (e) {
                        if (mounted) {
                          final msg = context.read<ApiClient>().extractError(e);
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(
                                msg.isNotEmpty ? msg : 'Could not send feedback',
                              ),
                            ),
                          );
                        }
                      }
                    },
                    child: const Text('Send feedback'),
                  ),
                  TextButton(
                    onPressed: () => Navigator.pop(ctx),
                    child: const Text('Not now'),
                  ),
                ],
              );
            },
          ),
        );
      },
    );
    commentCtrl.dispose();
  }

  void _maybeOfferAudiobook() {
    if (!AppBilling.iapEnabled) return;
    if (_offeredAudio || !mounted) return;
    final book = _book;
    if (book == null || book.status != 'COMPLETED') return;
    final hasAudio = _audios.any(
      (a) =>
          a['type'] == 'AUDIOBOOK' &&
          (a['status'] == 'COMPLETED' ||
              a['status'] == 'GENERATING' ||
              a['status'] == 'PENDING'),
    );
    if (hasAudio || book.generateAudiobookOnComplete) {
      // Server may already be converting when flag is set.
      _offeredAudio = true;
      return;
    }
    _offeredAudio = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        builder: (ctx) => Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Book complete',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              const Text(
                'Convert this manuscript to an audiobook, like on the website.',
                style: TextStyle(color: AppColors.textMuted, height: 1.4),
              ),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: () {
                  Navigator.pop(ctx);
                  _startAudiobook();
                },
                icon: const Icon(Icons.headphones_rounded),
                label: const Text('Convert to audiobook'),
              ),
              const SizedBox(height: 8),
              if (book.publicUrl != null)
                OutlinedButton.icon(
                  onPressed: () {
                    Navigator.pop(ctx);
                    _share();
                  },
                  icon: const Icon(Icons.ios_share_rounded),
                  label: const Text('Share public page'),
                ),
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Not now'),
              ),
            ],
          ),
        ),
      );
    });
  }

  void _flushUi() {
    _uiDirty = false;
    if (mounted) setState(() {});
  }

  void _scheduleUi() {
    if (_uiDirty) return;
    _uiDirty = true;
    _uiFlush?.cancel();
    _uiFlush = Timer(const Duration(milliseconds: 250), _flushUi);
  }

  void _scheduleReconnect() {
    if (!mounted || _book?.isGenerating != true) return;
    _reconnect?.cancel();
    _reconnect = Timer(Duration(milliseconds: _backoffMs), () {
      if (!mounted) return;
      if (_book?.isGenerating == true && !_streaming) _connectStream();
    });
    _backoffMs = (_backoffMs * 2).clamp(2000, 30000);
  }

  void _connectStream() {
    if (_streaming) return;
    _reconnect?.cancel();
    _stream?.stop();
    final listenId = ++_listenId;
    final api = context.read<ApiClient>();
    _stream = GenerationStream(api);
    setState(() {
      _streaming = true;
      _phase = 'Connecting to live stream…';
    });

    unawaited(_stream!.listen(
      widget.bookId,
      watchOnly: true,
      resume: false,
      onEvent: (event) {
        if (!mounted || listenId != _listenId) return;
        _backoffMs = 2000;
        switch (event.type) {
          case 'phase':
            _phase = event.data['message'] as String? ??
                event.data['phase'] as String? ??
                _phase;
            _scheduleUi();
            break;
          case 'progress':
            if (_book != null) {
              _book = _book!.copyWith(
                progress: (event.data['progress'] as num?)?.toDouble() ??
                    _book!.progress,
                currentPages:
                    (event.data['currentPages'] as num?)?.toInt() ??
                        _book!.currentPages,
                targetPages: (event.data['targetPages'] as num?)?.toInt() ??
                    _book!.targetPages,
                status: event.data['status'] as String? ?? _book!.status,
              );
            }
            _scheduleUi();
            break;
          case 'token':
            final text = event.data['text'] as String? ?? '';
            if (text.isEmpty) break;
            _liveText = _liveText + text;
            if (_liveText.length > 2500) {
              _liveText = _liveText.substring(_liveText.length - 2500);
            }
            _scheduleUi();
            break;
          case 'section_start':
            final title = event.data['sectionTitle'] as String? ??
                event.data['title'] as String?;
            final chapterNumber =
                (event.data['chapterNumber'] as num?)?.toInt();
            if (chapterNumber != null) _liveChapter = chapterNumber;
            final chapterId = event.data['chapterId'] as String?;
            if (chapterId != null && chapterId != _liveChapterId) {
              // A new chapter started: the last one is finished.
              _liveChapterId = chapterId;
              unawaited(_loadContent());
            }
            if (title != null) {
              _phase = 'Writing: $title';
              _liveText = '';
              _scheduleUi();
            }
            break;
          case 'outline_ready':
            _phase =
                'Outline ready · ${event.data['chapterCount'] ?? ''} chapters';
            _scheduleUi();
            break;
          case 'cover_ready':
            _phase = 'Cover ready';
            _scheduleUi();
            break;
          case 'done':
            _phase = 'Complete';
            _streaming = false;
            _flushUi();
            unawaited(_refreshQuiet());
            break;
          case 'error':
            _phase = event.data['message'] as String? ?? 'Stream error';
            _scheduleUi();
            break;
        }
      },
      onDone: () {
        if (!mounted || listenId != _listenId) return;
        _streaming = false;
        _scheduleUi();
        unawaited(_refreshQuiet());
        _scheduleReconnect();
      },
      onError: (_) {
        if (!mounted || listenId != _listenId) return;
        _streaming = false;
        _scheduleUi();
        _scheduleReconnect();
      },
    ));
  }

  void _maybePromptGenerate() {
    if (_promptedGenerate || !widget.promptGenerate) return;
    final status = _book?.status;
    if (status != 'DRAFT' && status != 'FAILED' && status != 'PAUSED') return;
    if (_book?.isGenerating == true) return;
    _promptedGenerate = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(_start());
    });
  }

  Future<void> _start() async {
    final book = _book;
    if (book == null) return;

    final auth = context.read<AuthProvider>();
    await auth.refreshUser();
    if (!mounted) return;
    final user = auth.user;
    final remaining = user?.pagesRemaining;
    if (remaining != null && book.targetPages > remaining) {
      await showPremiumUpgradeSheet(
        context,
        featureLabel:
            'Insufficient page credits — you have $remaining pages remaining, but this book needs ${book.targetPages}. Upgrade for more monthly pages.',
      );
      return;
    }

    final resume = book.status == 'PAUSED' || book.status == 'FAILED';
    final speed = await showGenerationSpeedSheet(
      context,
      canUseSuperFast: AppBilling.iapEnabled && user?.isPaid == true,
      resume: resume,
    );
    if (!mounted || speed == null) return;

    final ok = await context.read<BooksProvider>().startGeneration(
          widget.bookId,
          resume: resume,
          speed: speed == GenerationSpeed.superFast ? 'super_fast' : 'normal',
        );
    if (!mounted) return;
    if (ok) {
      final title = book.title;
      unawaited(
        context.read<PushNotificationService>().showLocal(
          title: 'Generation started',
          body: '"$title" is building now.',
          bookId: widget.bookId,
        ),
      );
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          ok
              ? (speed == GenerationSpeed.superFast
                  ? 'Super Fast generation started'
                  : 'Generation started')
              : (context.read<BooksProvider>().error ??
                  'Could not start generation'),
        ),
      ),
    );
    await _load();
    _listenId += 1;
    _reconnect?.cancel();
    _stream?.stop();
    _streaming = false;
    if (_book?.isGenerating == true) _connectStream();
  }

  Future<void> _cancel() async {
    _listenId += 1;
    _reconnect?.cancel();
    _stream?.stop();
    await context.read<BooksProvider>().cancelGeneration(widget.bookId);
    await _load();
  }

  Future<void> _startAudiobook({bool regenerate = false}) async {
    if (!AppBilling.iapEnabled) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(AppBilling.freeAppMessage)),
      );
      return;
    }
    setState(() => _audioBusy = true);
    final books = context.read<BooksProvider>();
    final id = await books.startAudiobook(
      widget.bookId,
      regenerate: regenerate,
    );
    if (!mounted) return;
    setState(() => _audioBusy = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          id != null
              ? 'Audiobook generation started'
              : (books.error ?? 'Could not start audiobook'),
        ),
      ),
    );
    await _loadAudios();
    await books.loadActiveJobs();
  }

  Future<void> _togglePublic(bool value) async {
    final book = _book;
    if (book == null) return;
    if (!value && !book.canMakePrivate) {
      await showPremiumUpgradeSheet(
        context,
        featureLabel:
            'Private books are included on Pro and Premium. Free plans stay public.',
      );
      return;
    }
    final books = context.read<BooksProvider>();
    final updated = await books.setPublic(widget.bookId, value);
    if (!mounted) return;
    if (updated == null) {
      final err = books.error ?? 'Could not update visibility';
      if (RegExp(
        r'private|upgrade|pro|premium',
        caseSensitive: false,
      ).hasMatch(err)) {
        await showPremiumUpgradeSheet(context, featureLabel: err);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(err)),
        );
      }
      return;
    }
    setState(() => _book = updated);
  }

  Future<void> _share() async {
    final book = _book;
    final url = book?.publicUrl;
    if (url == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Make the book public to share')),
      );
      return;
    }
    await SharePlus.instance.share(
      ShareParams(
        text: '${book!.title} — $url',
        subject: book.title,
      ),
    );
  }

  Future<String?> _pickExportFormat() async {
    return showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(20, 4, 20, 8),
                child: Text(
                  'Export book',
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              ListTile(
                leading: const Icon(Icons.picture_as_pdf_outlined),
                title: const Text('PDF'),
                subtitle: const Text('Printable document (.pdf)'),
                onTap: () => Navigator.pop(ctx, 'pdf'),
              ),
              ListTile(
                leading: const Icon(Icons.menu_book_outlined),
                title: const Text('EPUB'),
                subtitle: const Text('E-reader format (.epub)'),
                onTap: () => Navigator.pop(ctx, 'epub'),
              ),
              ListTile(
                leading: const Icon(Icons.description_outlined),
                title: const Text('Markdown'),
                subtitle: const Text('Plain manuscript (.md)'),
                onTap: () => Navigator.pop(ctx, 'md'),
              ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
  }

  Future<void> _downloadBook() async {
    final book = _book;
    if (book == null || _downloadingBook) return;
    final format = await _pickExportFormat();
    if (format == null || !mounted) return;

    setState(() => _downloadingBook = true);
    final dl = FileDownloadService(context.read<ApiClient>());
    try {
      final filename = FileDownloadService.safeFilename(
        book.title,
        extension: format,
      );
      await dl.downloadApiAndShare(
        path: ApiConfig.bookExport(widget.bookId, format: format),
        filename: filename,
        subject: book.title,
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            context.read<ApiClient>().extractError(e),
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _downloadingBook = false);
    }
  }

  Future<void> _downloadAudiobook(List<AudioTrackData> tracks) async {
    final book = _book;
    if (book == null || _downloadingAudio || tracks.isEmpty) return;
    setState(() => _downloadingAudio = true);
    final dl = FileDownloadService(context.read<ApiClient>());
    try {
      if (tracks.length == 1) {
        final filename = FileDownloadService.safeFilename(
          book.title,
          extension: 'mp3',
        );
        await dl.downloadUrlAndShare(
          url: tracks.first.audioUrl,
          filename: filename,
          subject: book.title,
        );
      } else {
        final items = [
          for (final t in tracks)
            (
              url: t.audioUrl,
              filename: FileDownloadService.safeFilename(
                '${book.title}-${t.number}-${t.title}',
                extension: 'mp3',
              ),
            ),
        ];
        await dl.downloadUrlsAndShare(
          items: items,
          subject: book.title,
          text: '${book.title} audiobook chapters',
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            context.read<ApiClient>().extractError(e),
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _downloadingAudio = false);
    }
  }

  Future<void> _copyLink() async {
    final url = _book?.publicUrl;
    if (url == null) return;
    await Clipboard.setData(ClipboardData(text: url));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Public link copied')),
    );
  }

  Future<void> _openExport() async {
    final web = Uri.parse(
      '${ApiConfig.baseUrl}/dashboard/books/${widget.bookId}',
    );
    await launchUrl(web, mode: LaunchMode.externalApplication);
  }

  Future<void> _openPublic() async {
    final url = _book?.publicUrl;
    if (url == null) return;
    await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
  }

  bool _audioHasPlayableUrl(Map<String, dynamic> audio) {
    final full = audio['audioUrl'];
    if (full is String && full.startsWith('http')) return true;
    final tracks = audio['tracks'];
    if (tracks is! List) return false;
    for (final t in tracks) {
      if (t is! Map) continue;
      final url = t['audioUrl'];
      if (url is String && url.startsWith('http')) return true;
    }
    return false;
  }

  List<AudioTrackData> _extractPlayableTracks(Map<String, dynamic>? audio) {
    if (audio == null) return [];

    // Prefer the full audiobook file — one track, simple player.
    final fullUrl = audio['audioUrl'];
    if (fullUrl is String && fullUrl.startsWith('http')) {
      return [
        AudioTrackData(
          id: '${audio['id'] ?? 'full'}-full',
          number: 1,
          title: _book?.title ?? 'Audiobook',
          audioUrl: fullUrl,
        ),
      ];
    }

    final out = <AudioTrackData>[];
    final rawTracks = audio['tracks'];
    if (rawTracks is List) {
      for (final t in rawTracks) {
        if (t is! Map) continue;
        final track = AudioTrackData.fromJson(Map<String, dynamic>.from(t));
        if (track.audioUrl.startsWith('http')) out.add(track);
      }
    }
    out.sort((a, b) => a.number.compareTo(b.number));
    return out;
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
        body: const Center(child: Text('Book not found')),
      );
    }

    final content = _content;
    final chapters = content?.chapters ?? const <ChapterContent>[];
    final chapterCount = chapters.length;
    final inProgress = book.isGenerating;
    final complete = book.status == 'COMPLETED';
    final canResume = book.status == 'FAILED' || book.status == 'PAUSED';
    final canStart = (book.status == 'DRAFT' || canResume) && !inProgress;
    final canRewrite =
        complete || book.status == 'DRAFT' || book.status == 'FAILED';
    final states = [
      for (final c in chapters) chapterStateOf(c, inProgress, _liveChapterId),
    ];
    final doneCount = states.where((s) => s == ChapterState.done).length;
    final words = complete ? (content?.wordCount ?? 0) : 0;
    final error = content?.errorMessage;
    final progressLabel = inProgress
        ? (_phase.isNotEmpty
              ? _phase
              : book.status == 'OUTLINING'
              ? 'Outlining chapters…'
              : 'Writing…')
        : book.status == 'PAUSED'
        ? 'Paused'
        : book.status == 'FAILED'
        ? 'Stopped with an error'
        : 'Not started yet';
    final meta = [
      if ((book.genre ?? '').isNotEmpty) book.genre!,
      if (book.targetPages > 0) '${book.targetPages} pages',
    ].join(' · ');
    final hasNotes =
        content != null &&
        (content.characters.isNotEmpty ||
            content.themes.isNotEmpty ||
            (content.customInstructions ?? '').trim().isNotEmpty);

    final actions = <Widget>[
      if (canStart)
        StageButton(
          tone: StageTone.primary,
          icon: Icons.play_arrow_rounded,
          label: canResume ? 'Resume writing' : 'Start writing',
          onPressed: _start,
        ),
      if (inProgress)
        StageButton(
          tone: StageTone.primary,
          icon: Icons.visibility_outlined,
          label: 'Watch it write',
          onPressed: () => _scrollTo(_liveKey),
        ),
      if (complete && chapterCount > 0)
        StageButton(
          tone: StageTone.primary,
          icon: Icons.auto_stories_outlined,
          label: 'Read the book',
          onPressed: _read,
        ),
      if (complete)
        StageButton(
          icon: Icons.headphones_outlined,
          label: 'Create audio',
          onPressed: () => _scrollTo(_audioKey),
        ),
      if (inProgress)
        StageButton(
          tone: StageTone.danger,
          icon: Icons.stop_rounded,
          label: 'Stop',
          onPressed: _cancel,
        ),
      if (!inProgress)
        StageButton(
          icon: Icons.download_rounded,
          label: 'Export',
          busy: _downloadingBook,
          onPressed: _downloadBook,
        ),
      StageMenu(
        onSelected: _onMenu,
        items: [
          if (chapterCount > 0)
            stageMenuItem('editor', Icons.edit_outlined, 'Open editor'),
          if (inProgress)
            stageMenuItem('refresh', Icons.refresh_rounded, 'Refresh progress'),
          stageMenuItem('edition', Icons.library_add_outlined, 'New edition'),
          if (chapterCount > 0 || book.coverImage != null)
            stageMenuItem(
              'cover',
              Icons.image_outlined,
              book.coverImage != null ? 'New cover' : 'Generate cover',
              enabled: !_coverBusy,
            ),
          if (inProgress)
            stageMenuItem('export', Icons.download_rounded, 'Export'),
          if (book.publicUrl != null && chapterCount > 0)
            stageMenuItem('share', Icons.ios_share_rounded, 'Share book'),
          if (book.publicUrl != null && chapterCount > 0)
            stageMenuItem('copy', Icons.link_rounded, 'Copy link'),
          const PopupMenuDivider(),
          stageMenuItem(
            'troubleshoot',
            Icons.report_gmailerrorred_outlined,
            'Troubleshoot',
          ),
          stageMenuItem('web', Icons.open_in_new_rounded, 'Open on the website'),
          stageMenuItem(
            'delete',
            Icons.delete_outline_rounded,
            inProgress ? 'Stop writing to delete' : 'Delete book',
            enabled: !inProgress,
            danger: true,
          ),
        ],
      ),
    ];

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: AppColors.white,
        body: Stack(
          children: [
            RefreshIndicator(
              onRefresh: () async {
                await Future.wait([_refreshQuiet(), _loadContent(), _loadAudios()]);
              },
              child: ListView(
                controller: _scroll,
                padding: EdgeInsets.zero,
                children: [
                  BookHero(
                    title: book.title,
                    coverImage: book.coverImage,
                    slug: book.slug,
                    edition: content?.edition ?? 1,
                    meta: meta,
                    description: book.description,
                    coverKey: _coverKey,
                    titleKey: _titleKey,
                    pill: StatusPill(
                      status: book.status,
                      inProgress: inProgress,
                      chapterCount: chapterCount,
                      liveChapter: _liveChapter,
                    ),
                    actions: actions,
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 24, 20, 48),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (complete && content == null)
                          const StatsSkeleton()
                        else if (complete)
                          BookStats(
                            stats: [
                              (
                                'Pages',
                                '${book.currentPages > 0 ? book.currentPages : book.targetPages}',
                              ),
                              ('Words', formatWords(words)),
                              ('Chapters', '$chapterCount'),
                              ('Read', readingTime(words)),
                            ],
                          )
                        else
                          WritingProgress(
                            label: progressLabel,
                            progress: book.progress,
                            currentPages: book.currentPages,
                            targetPages: book.targetPages,
                            states: states,
                            error: error,
                          ),
                        if (complete && (error ?? '').isNotEmpty) ...[
                          const SizedBox(height: 16),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 12,
                            ),
                            decoration: BoxDecoration(
                              color: const Color(0x99FDE8E8),
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: Text(
                              error!,
                              style: const TextStyle(
                                fontSize: 13,
                                color: AppColors.destructive,
                              ),
                            ),
                          ),
                        ],
                        if (inProgress || _liveText.isNotEmpty) ...[
                          const SizedBox(height: 24),
                          KeyedSubtree(key: _liveKey, child: _liveCard(book)),
                        ],
                        if (complete) ...[
                          const SizedBox(height: 32),
                          KeyedSubtree(key: _audioKey, child: _audioSection(book)),
                        ],
                        if (content != null &&
                            (content.includeIllustrations ||
                                complete ||
                                doneCount > 0)) ...[
                          const SizedBox(height: 32),
                          IllustrationsPanel(
                            bookId: book.id,
                            enabled: content.includeIllustrations,
                            generating: inProgress,
                            onPicturesAdded: _loadContent,
                          ),
                        ],
                        if (complete && content != null) ...[
                          const SizedBox(height: 32),
                          StoryReelsPanel(
                            bookId: book.id,
                            chapters: content.chapters,
                          ),
                        ],
                        const SizedBox(height: 32),
                        PageSectionTitle(
                          'Chapters',
                          trailing: chapterCount > 0
                              ? '$doneCount of $chapterCount written'
                              : null,
                        ),
                        if (content == null)
                          const ChapterRowsSkeleton()
                        else if (chapterCount == 0)
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 24,
                              vertical: 48,
                            ),
                            decoration: BoxDecoration(
                              color: const Color(0xFFF7F8FB),
                              borderRadius: BorderRadius.circular(24),
                            ),
                            child: Text(
                              inProgress
                                  ? 'Outlining chapters… they’ll appear here in a moment.'
                                  : 'No chapters yet. Start writing to create the outline.',
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                fontSize: 14,
                                color: AppColors.textMuted,
                              ),
                            ),
                          )
                        else
                          ChapterList(
                            chapters: chapters,
                            inProgress: inProgress,
                            liveChapterId: _liveChapterId,
                            canRewrite: canRewrite,
                            rewriting: _rewritingChapter,
                            onRewrite: _rewriteChapter,
                            onRead: _read,
                          ),
                        if (content != null && content.editions.length > 1) ...[
                          const SizedBox(height: 32),
                          EditionsList(
                            editions: content.editions,
                            currentId: book.id,
                            onOpen: (e) => context.push('/books/${e.id}'),
                          ),
                        ],
                        if (hasNotes) ...[
                          const SizedBox(height: 32),
                          StoryNotes(
                            characters: content.characters,
                            themes: content.themes,
                            instructions: content.customInstructions,
                          ),
                        ],
                        const SizedBox(height: 32),
                        VisibilityCard(
                          isPublic: book.isPublic,
                          canMakePrivate: book.canMakePrivate,
                          busy: false,
                          onChanged: _togglePublic,
                          onViewPublic: book.publicUrl == null ? null : _openPublic,
                          showUpgrade: AppBilling.iapEnabled,
                          onUpgrade: () => showPremiumUpgradeSheet(
                            context,
                            featureLabel:
                                'Private books are included on Pro and Premium.',
                          ),
                        ),
                        if (content != null) ...[
                          const SizedBox(height: 16),
                          BookSettingsCard(
                            rows: BookSettingsCard.rowsFor(content),
                          ),
                        ],
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
                coverBusy: _coverBusy,
                onBack: _back,
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// The text arriving as it's written.
  Widget _liveCard(BookModel book) {
    return StripeCard(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (_streaming || book.isGenerating) ...[
                const SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.primary,
                  ),
                ),
                const SizedBox(width: 8),
              ],
              Expanded(
                child: Text(
                  _phase.isEmpty ? 'Live writing' : _phase,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                    color: AppColors.navy,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            constraints: const BoxConstraints(minHeight: 100),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              _liveText.isEmpty ? 'Waiting for the first words…' : _liveText,
              style: GoogleFonts.literata(
                fontSize: 14,
                height: 1.6,
                color: _liveText.isEmpty
                    ? AppColors.textMuted
                    : AppColors.textBody,
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Audiobook: play it, or make it.
  Widget _audioSection(BookModel book) {
    final audioRunning = _audios.any(
      (a) =>
          '${a['status']}'.toUpperCase() == 'GENERATING' ||
          '${a['status']}'.toUpperCase() == 'PENDING',
    );
    Map<String, dynamic>? audiobook;
    for (final a in _audios) {
      if ('${a['type'] ?? ''}'.toUpperCase() == 'AUDIOBOOK' &&
          '${a['status'] ?? ''}'.toUpperCase() == 'COMPLETED') {
        audiobook = a;
        break;
      }
    }
    if (audiobook == null) {
      for (final a in _audios) {
        if ('${a['status']}'.toUpperCase() == 'COMPLETED' &&
            _audioHasPlayableUrl(a)) {
          audiobook = a;
          break;
        }
      }
    }
    final audioDone =
        audiobook != null ||
        _audios.any((a) => '${a['status']}'.toUpperCase() == 'COMPLETED');
    final tracks = _extractPlayableTracks(audiobook);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const PageSectionTitle('Audio'),
        StripeCard(
          padding: const EdgeInsets.all(20),
          child: tracks.isNotEmpty
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AudiobookPlayer(
                      tracks: tracks,
                      downloading: _downloadingAudio,
                      onDownload: () => _downloadAudiobook(tracks),
                    ),
                    if (AppBilling.iapEnabled)
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton(
                          onPressed: _audioBusy || audioRunning
                              ? null
                              : () => _startAudiobook(regenerate: true),
                          child: Text(
                            audioRunning ? 'Regenerating…' : 'Regenerate',
                          ),
                        ),
                      ),
                  ],
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 40,
                          height: 40,
                          decoration: const BoxDecoration(
                            color: AppColors.primarySoft,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.headphones_rounded,
                            color: AppColors.primaryText,
                            size: 20,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Audiobook',
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.navy,
                                ),
                              ),
                              Text(
                                audioRunning ||
                                        book.generateAudiobookOnComplete
                                    ? 'Converting… pull down to refresh in a moment.'
                                    : audioDone
                                    ? 'Finished, but no playable file came back. Try again.'
                                    : AppBilling.iapEnabled
                                    ? 'Turn the finished book into narrated audio.'
                                    : AppBilling.freeAppMessage,
                                style: const TextStyle(
                                  fontSize: 13,
                                  color: AppColors.textMuted,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    if (AppBilling.iapEnabled) ...[
                      const SizedBox(height: 16),
                      FilledButton.icon(
                        onPressed: _audioBusy || audioRunning
                            ? null
                            : () => _startAudiobook(regenerate: audioDone),
                        icon: _audioBusy || audioRunning
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.headphones_rounded),
                        label: Text(
                          audioRunning
                              ? 'Converting…'
                              : audioDone
                              ? 'Make it again'
                              : 'Create audiobook',
                        ),
                      ),
                    ],
                  ],
                ),
        ),
      ],
    );
  }
}
