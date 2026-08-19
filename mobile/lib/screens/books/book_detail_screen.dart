import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:bookai_mobile/config/api_config.dart';
import 'package:bookai_mobile/models/models.dart';
import 'package:bookai_mobile/providers/auth_provider.dart';
import 'package:bookai_mobile/providers/books_provider.dart';
import 'package:bookai_mobile/services/api_client.dart';
import 'package:bookai_mobile/services/file_download.dart';
import 'package:bookai_mobile/services/generation_stream.dart';
import 'package:bookai_mobile/services/push_notifications.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
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

  @override
  void initState() {
    super.initState();
    _load().then((_) {
      if (_book?.isGenerating == true) _connectStream();
      if (_book?.status == 'COMPLETED') _loadAudios();
      _maybePromptGenerate();
    });
    _poll = Timer.periodic(const Duration(seconds: 12), (_) => _refreshQuiet());
  }

  @override
  void dispose() {
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
      canUseSuperFast: user?.isPaid == true,
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
    final audioRunning = _audios.any(
      (a) =>
          '${a['status']}'.toUpperCase() == 'GENERATING' ||
          '${a['status']}'.toUpperCase() == 'PENDING',
    );
    Map<String, dynamic>? completedAudiobook;
    for (final a in _audios) {
      final type = '${a['type'] ?? ''}'.toUpperCase();
      final status = '${a['status'] ?? ''}'.toUpperCase();
      if (type == 'AUDIOBOOK' && status == 'COMPLETED') {
        completedAudiobook = a;
        break;
      }
    }
    if (completedAudiobook == null) {
      for (final a in _audios) {
        if ('${a['status']}'.toUpperCase() == 'COMPLETED' &&
            _audioHasPlayableUrl(a)) {
          completedAudiobook = a;
          break;
        }
      }
    }
    final audioDone = completedAudiobook != null ||
        _audios.any((a) => '${a['status']}'.toUpperCase() == 'COMPLETED');
    final playableTracks = _extractPlayableTracks(completedAudiobook);

    return Scaffold(
      appBar: AppBar(
        title: Text(book?.title ?? 'Book'),
        actions: [
          if (book?.status == 'COMPLETED')
            IconButton(
              onPressed: _downloadingBook ? null : _downloadBook,
              icon: _downloadingBook
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.download_rounded),
              tooltip: 'Download book',
            ),
          if (book?.isPublic == true && book?.publicUrl != null)
            IconButton(
              onPressed: _share,
              icon: const Icon(Icons.ios_share_rounded),
              tooltip: 'Share',
            ),
          IconButton(
            onPressed: () => _showReviewSheet(trigger: 'manual'),
            icon: const Icon(Icons.report_problem_outlined),
            tooltip: 'Troubleshoot',
          ),
          IconButton(
            onPressed: _openExport,
            icon: const Icon(Icons.open_in_new_rounded),
            tooltip: 'Open in web',
          ),
        ],
      ),
      body: _loading && book == null
          ? const Center(child: CircularProgressIndicator())
          : book == null
              ? const Center(child: Text('Book not found'))
              : ListView(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
                  children: [
                    StripeCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            book.title,
                            style: const TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w700,
                              letterSpacing: -0.5,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            '${book.genre ?? 'Book'} · ${book.status.toLowerCase()}',
                            style: const TextStyle(
                              color: AppColors.textMuted,
                              fontSize: 13,
                            ),
                          ),
                          TextButton.icon(
                            onPressed: () =>
                                _showReviewSheet(trigger: 'manual'),
                            icon: const Icon(Icons.report_problem_outlined,
                                size: 16),
                            label: const Text('Troubleshoot'),
                            style: TextButton.styleFrom(
                              foregroundColor: AppColors.primary,
                              padding: EdgeInsets.zero,
                              visualDensity: VisualDensity.compact,
                            ),
                          ),
                          if (book.description != null &&
                              book.description!.isNotEmpty) ...[
                            const SizedBox(height: 12),
                            ExpandableText(
                              book.description!,
                              maxLines: 3,
                              style: const TextStyle(
                                color: AppColors.textBody,
                                height: 1.45,
                              ),
                            ),
                          ],
                          const SizedBox(height: 16),
                          Row(
                            children: [
                              Text(
                                '${book.progress.round()}%',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.primary,
                                  fontSize: 18,
                                ),
                              ),
                              const Spacer(),
                              Text(
                                '${book.currentPages} / ${book.targetPages} pages',
                                style: const TextStyle(
                                  color: AppColors.textMuted,
                                  fontSize: 13,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(99),
                            child: LinearProgressIndicator(
                              value: (book.progress / 100).clamp(0, 1),
                              minHeight: 8,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (book.isGenerating || _liveText.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      StripeCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                if (_streaming || book.isGenerating)
                                  const SizedBox(
                                    width: 14,
                                    height: 14,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: AppColors.primary,
                                    ),
                                  ),
                                if (_streaming || book.isGenerating)
                                  const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    _phase.isEmpty
                                        ? 'Live generation'
                                        : _phase,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w600,
                                      fontSize: 13,
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
                                color: AppColors.mutedBg,
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: AppColors.border),
                              ),
                              child: Text(
                                _liveText.isEmpty
                                    ? 'Waiting for manuscript tokens…'
                                    : _liveText,
                                style: TextStyle(
                                  fontSize: 13,
                                  height: 1.5,
                                  color: _liveText.isEmpty
                                      ? AppColors.textMuted
                                      : AppColors.navy,
                                  fontFamily: 'serif',
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    StripeCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Sharing',
                            style: TextStyle(fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            book.slug != null
                                ? 'Public ID · ${book.slug}'
                                : 'Public page',
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.textMuted,
                              fontFamily: 'monospace',
                            ),
                          ),
                          SwitchListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(
                              book.isPublic ? 'Public' : 'Private',
                              style:
                                  const TextStyle(fontWeight: FontWeight.w600),
                            ),
                            subtitle: Text(
                              book.isPublic
                                  ? 'Anyone with the link can read it'
                                  : book.canMakePrivate
                                      ? 'Only you can see this book'
                                      : 'Upgrade to make books private',
                              style: const TextStyle(
                                fontSize: 12,
                                color: AppColors.textMuted,
                              ),
                            ),
                            value: book.isPublic,
                            activeThumbColor: AppColors.primary,
                            onChanged: _togglePublic,
                          ),
                          if (book.isPublic && !book.canMakePrivate)
                            Align(
                              alignment: Alignment.centerLeft,
                              child: TextButton(
                                onPressed: () => showPremiumUpgradeSheet(
                                  context,
                                  featureLabel:
                                      'Private books are included on Pro and Premium.',
                                ),
                                child: const Text('Upgrade to make private'),
                              ),
                            ),
                          if (book.isPublic && book.publicUrl != null)
                            Row(
                              children: [
                                Expanded(
                                  child: OutlinedButton.icon(
                                    onPressed: _share,
                                    icon: const Icon(Icons.ios_share_rounded,
                                        size: 18),
                                    label: const Text('Share'),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: OutlinedButton.icon(
                                    onPressed: _copyLink,
                                    icon: const Icon(Icons.link_rounded,
                                        size: 18),
                                    label: const Text('Copy'),
                                  ),
                                ),
                              ],
                            ),
                          if (book.isPublic && book.publicUrl != null) ...[
                            const SizedBox(height: 8),
                            TextButton(
                              onPressed: _openPublic,
                              child: const Text('View public page'),
                            ),
                          ],
                        ],
                      ),
                    ),
                    if (book.status == 'COMPLETED') ...[
                      const SizedBox(height: 16),
                      StripeCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Download',
                              style: TextStyle(fontWeight: FontWeight.w700),
                            ),
                            const SizedBox(height: 6),
                            const Text(
                              'Save the manuscript or audiobook to Files, Drive, or another app.',
                              style: TextStyle(
                                fontSize: 13,
                                color: AppColors.textMuted,
                              ),
                            ),
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                Expanded(
                                  child: OutlinedButton.icon(
                                    onPressed:
                                        _downloadingBook ? null : _downloadBook,
                                    icon: _downloadingBook
                                        ? const SizedBox(
                                            width: 16,
                                            height: 16,
                                            child: CircularProgressIndicator(
                                              strokeWidth: 2,
                                            ),
                                          )
                                        : const Icon(
                                            Icons.description_outlined,
                                            size: 18,
                                          ),
                                    label: Text(
                                      _downloadingBook
                                          ? 'Downloading…'
                                          : 'Export book',
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: OutlinedButton.icon(
                                    onPressed: playableTracks.isEmpty ||
                                            _downloadingAudio
                                        ? null
                                        : () =>
                                            _downloadAudiobook(playableTracks),
                                    icon: _downloadingAudio
                                        ? const SizedBox(
                                            width: 16,
                                            height: 16,
                                            child: CircularProgressIndicator(
                                              strokeWidth: 2,
                                            ),
                                          )
                                        : const Icon(
                                            Icons.headphones_outlined,
                                            size: 18,
                                          ),
                                    label: Text(
                                      _downloadingAudio
                                          ? 'Downloading…'
                                          : 'Audio (.mp3)',
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                      StripeCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (playableTracks.isNotEmpty) ...[
                              const Text(
                                'Audiobook',
                                style: TextStyle(fontWeight: FontWeight.w700),
                              ),
                              const SizedBox(height: 12),
                              AudiobookPlayer(
                                tracks: playableTracks,
                                downloading: _downloadingAudio,
                                onDownload: () =>
                                    _downloadAudiobook(playableTracks),
                              ),
                              Align(
                                alignment: Alignment.centerRight,
                                child: TextButton(
                                  onPressed: _audioBusy || audioRunning
                                      ? null
                                      : () => _startAudiobook(regenerate: true),
                                  child: Text(
                                    audioRunning ? 'Regenerating…' : 'Regenerate',
                                    style: const TextStyle(fontSize: 12),
                                  ),
                                ),
                              ),
                            ] else ...[
                              const Text(
                                'Audiobook',
                                style: TextStyle(fontWeight: FontWeight.w700),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                audioRunning ||
                                        book.generateAudiobookOnComplete
                                    ? 'Audiobook converting… pull to refresh in a moment'
                                    : audioDone
                                        ? 'Audio finished, but no playable file URL was returned. Try regenerate, or open the web editor.'
                                        : 'Convert the finished manuscript to audio',
                                style: const TextStyle(
                                  fontSize: 13,
                                  color: AppColors.textMuted,
                                ),
                              ),
                              const SizedBox(height: 12),
                              FilledButton.icon(
                                onPressed: _audioBusy || audioRunning
                                    ? null
                                    : () => _startAudiobook(
                                          regenerate: audioDone,
                                        ),
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
                                  audioDone
                                      ? 'Regenerate audiobook'
                                      : audioRunning
                                          ? 'Converting…'
                                          : 'Convert to audiobook',
                                ),
                              ),
                              const SizedBox(height: 8),
                              TextButton(
                                onPressed: _loadAudios,
                                child: const Text('Refresh audio'),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    if (book.isGenerating)
                      OutlinedButton.icon(
                        onPressed: _cancel,
                        icon: const Icon(Icons.stop_circle_outlined),
                        label: const Text('Stop generation'),
                      )
                    else if (book.status == 'DRAFT' ||
                        book.status == 'FAILED' ||
                        book.status == 'PAUSED')
                      FilledButton.icon(
                        onPressed: _start,
                        icon: const Icon(Icons.play_arrow_rounded),
                        label: Text(
                          book.status == 'DRAFT'
                              ? 'Start generation'
                              : 'Resume generation',
                        ),
                      )
                    else if (book.status == 'COMPLETED')
                      OutlinedButton.icon(
                        onPressed: _openExport,
                        icon: const Icon(Icons.open_in_browser),
                        label: const Text('Open full editor (web)'),
                      ),
                  ],
                ),
    );
  }
}
