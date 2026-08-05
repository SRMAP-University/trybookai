import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:bookai_mobile/config/api_config.dart';
import 'package:bookai_mobile/models/models.dart';
import 'package:bookai_mobile/providers/books_provider.dart';
import 'package:bookai_mobile/services/api_client.dart';
import 'package:bookai_mobile/services/file_download.dart';
import 'package:bookai_mobile/services/generation_stream.dart';
import 'package:bookai_mobile/services/push_notifications.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/audiobook_player.dart';
import 'package:bookai_mobile/widgets/common.dart';

class BookDetailScreen extends StatefulWidget {
  const BookDetailScreen({super.key, required this.bookId});

  final String bookId;

  @override
  State<BookDetailScreen> createState() => _BookDetailScreenState();
}

class _BookDetailScreenState extends State<BookDetailScreen> {
  BookModel? _book;
  bool _loading = true;
  Timer? _poll;
  GenerationStream? _stream;
  String _phase = '';
  String _liveText = '';
  bool _streaming = false;
  bool _audioBusy = false;
  bool _offeredAudio = false;
  bool _downloadingBook = false;
  bool _downloadingAudio = false;
  List<Map<String, dynamic>> _audios = [];

  @override
  void initState() {
    super.initState();
    _load().then((_) {
      if (_book?.isGenerating == true) _connectStream();
      if (_book?.status == 'COMPLETED') _loadAudios();
    });
    _poll = Timer.periodic(const Duration(seconds: 4), (_) => _refreshQuiet());
  }

  @override
  void dispose() {
    _poll?.cancel();
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
    final audioRunning = _audios.any(
      (a) => a['status'] == 'GENERATING' || a['status'] == 'PENDING',
    );
    setState(() => _book = book);
    if (book.isGenerating && !_streaming) {
      _connectStream();
    } else if (!book.isGenerating && wasGenerating) {
      _stream?.stop();
      setState(() => _streaming = false);
    }
    if (justCompleted) {
      await _loadAudios();
      _maybeOfferAudiobook();
    } else if (book.status == 'COMPLETED' && audioRunning) {
      // Pick up completed tracks without leaving the screen.
      await _loadAudios();
    }
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

  void _connectStream() {
    _stream?.stop();
    final api = context.read<ApiClient>();
    _stream = GenerationStream(api);
    setState(() {
      _streaming = true;
      _phase = 'Connecting to live stream…';
    });

    _stream!.listen(
      widget.bookId,
      onEvent: (event) {
        if (!mounted) return;
        setState(() {
          switch (event.type) {
            case 'phase':
              _phase = event.data['message'] as String? ??
                  event.data['phase'] as String? ??
                  _phase;
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
              break;
            case 'token':
              final text = event.data['text'] as String? ?? '';
              _liveText = _liveText + text;
              if (_liveText.length > 4000) {
                _liveText = _liveText.substring(_liveText.length - 4000);
              }
              break;
            case 'section_start':
              final title = event.data['sectionTitle'] as String? ??
                  event.data['title'] as String?;
              if (title != null) {
                _phase = 'Writing: $title';
                _liveText = '';
              }
              break;
            case 'outline_ready':
              _phase =
                  'Outline ready · ${event.data['chapterCount'] ?? ''} chapters';
              break;
            case 'cover_ready':
              _phase = 'Cover ready';
              break;
            case 'done':
              _phase = 'Complete';
              _streaming = false;
              break;
            case 'error':
              _phase = event.data['message'] as String? ?? 'Stream error';
              break;
          }
        });
        if (event.type == 'done') {
          _refreshQuiet();
        }
      },
      onDone: () {
        if (!mounted) return;
        setState(() => _streaming = false);
        _refreshQuiet();
        Future.delayed(const Duration(milliseconds: 1200), () {
          if (!mounted) return;
          if (_book?.isGenerating == true) _connectStream();
        });
      },
      onError: (_) {
        if (!mounted) return;
        setState(() => _streaming = false);
      },
    );
  }

  Future<void> _start() async {
    final ok =
        await context.read<BooksProvider>().startGeneration(widget.bookId);
    if (!mounted) return;
    if (ok) {
      final title = _book?.title ?? 'Your book';
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
        content: Text(ok ? 'Generation started' : 'Could not start generation'),
      ),
    );
    await _load();
    if (_book?.isGenerating == true) _connectStream();
  }

  Future<void> _cancel() async {
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
    final books = context.read<BooksProvider>();
    final updated = await books.setPublic(widget.bookId, value);
    if (!mounted) return;
    if (updated == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(books.error ?? 'Could not update visibility')),
      );
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

  Future<void> _downloadBook() async {
    final book = _book;
    if (book == null || _downloadingBook) return;
    setState(() => _downloadingBook = true);
    final dl = FileDownloadService(context.read<ApiClient>());
    try {
      final filename = FileDownloadService.safeFilename(
        book.title,
        extension: 'md',
      );
      await dl.downloadApiAndShare(
        path: ApiConfig.bookExport(widget.bookId),
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
                          if (book.description != null &&
                              book.description!.isNotEmpty) ...[
                            const SizedBox(height: 12),
                            Text(
                              book.description!,
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
                            onChanged: (!book.isPublic || book.canMakePrivate)
                                ? _togglePublic
                                : null,
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
                                          : 'Book (.md)',
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
