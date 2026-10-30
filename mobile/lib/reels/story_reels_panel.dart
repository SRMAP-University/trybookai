/// Story Reels on a book's page: your reels for the book, making new ones,
/// live progress while they're drawn, and playing or sharing them. Same
/// API, states and actions as the website's `story-reel-panel.tsx`.
library;

import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:bookai_mobile/models/book_content.dart';
import 'package:bookai_mobile/models/reel.dart';
import 'package:bookai_mobile/services/api_client.dart';
import 'package:bookai_mobile/services/reels_api.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/common.dart';
import 'package:bookai_mobile/widgets/manuscript_view.dart';

const _soft = Color(0xFFF6F9FC);

class StoryReelsPanel extends StatefulWidget {
  const StoryReelsPanel({
    super.key,
    required this.bookId,
    required this.chapters,
  });

  final String bookId;
  final List<ChapterContent> chapters;

  @override
  State<StoryReelsPanel> createState() => _StoryReelsPanelState();
}

class _StoryReelsPanelState extends State<StoryReelsPanel> {
  List<ReelView>? _reels;
  ReelAllowance? _allowance;
  final _watching = <String, void Function()>{};
  Timer? _poll;

  ReelsApi get _api => ReelsApi(context.read<ApiClient>());

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _poll?.cancel();
    for (final stop in _watching.values) {
      stop();
    }
    super.dispose();
  }

  void _toast(String message) => ScaffoldMessenger.of(
    context,
  ).showSnackBar(SnackBar(content: Text(message)));

  String _err(Object e) => '$e'.replaceFirst('Exception: ', '');

  Future<void> _load() async {
    try {
      final result = await _api.list(widget.bookId);
      if (!mounted) return;
      setState(() {
        _reels = result.reels;
        _allowance = result.allowance;
      });
      for (final r in result.reels.where((r) => r.running)) {
        _watch(r.id);
      }
    } catch (_) {
      if (mounted) setState(() => _reels ??= const []);
    }
  }

  void _patch(String id, ReelView Function(ReelView) change) {
    final reels = _reels;
    if (reels == null) return;
    setState(() {
      _reels = [for (final r in reels) r.id == id ? change(r) : r];
    });
  }

  /// Keeps a reel generating and follows it: live phase and progress from
  /// the stream, fresh shots and episodes from polling.
  void _watch(String id, {bool retry = false}) {
    if (_watching.containsKey(id)) return;
    _watching[id] = _api.watch(
      id,
      retry: retry,
      onEvent: (type, data) {
        if (!mounted) return;
        if (type == 'phase') {
          _patch(id, (r) => r.copyWith(phase: data['message'] as String?));
        } else if (type == 'progress') {
          _patch(
            id,
            (r) => r.copyWith(
              progress: (data['progress'] as num?)?.toDouble(),
              status: data['status'] as String?,
            ),
          );
        } else if (type == 'error') {
          _patch(
            id,
            (r) => r.copyWith(
              status: 'FAILED',
              errorMessage: data['message'] as String?,
            ),
          );
        }
      },
      onDone: () {
        _watching.remove(id);
        unawaited(_refresh(id));
      },
    );
    _poll ??= Timer.periodic(const Duration(seconds: 5), (_) {
      final running = _reels?.where((r) => r.running).toList() ?? const [];
      if (running.isEmpty) {
        _poll?.cancel();
        _poll = null;
        return;
      }
      for (final r in running) {
        unawaited(_refresh(r.id));
      }
    });
  }

  Future<void> _refresh(String id) async {
    try {
      final fresh = await _api.get(id);
      if (!mounted) return;
      final reels = _reels;
      if (reels == null) return;
      setState(() {
        _reels = [for (final r in reels) r.id == id ? fresh : r];
      });
      if (!fresh.running) {
        _watching.remove(id)?.call();
        if (fresh.status == 'COMPLETED') {
          final list = await _api.list(widget.bookId);
          if (mounted) setState(() => _allowance = list.allowance);
        }
      }
    } catch (_) {}
  }

  Future<void> _create() async {
    final reel = await showCreateReelSheet(
      context,
      bookId: widget.bookId,
      chapters: widget.chapters,
      allowance: _allowance,
    );
    if (reel == null || !mounted) return;
    setState(() => _reels = [reel, ...?_reels]);
    _toast("Making your reel. Shots appear as they're drawn.");
    _watch(reel.id);
  }

  void _play(ReelView reel, [int? episode]) {
    final parts = reel.playable;
    if (parts.isEmpty) return;
    context.push('/reels/${reel.id}?episode=${episode ?? parts.first.number}');
  }

  Future<void> _share(ReelView reel) async {
    try {
      final link = await _api.share(reel.id);
      if (!mounted) return;
      _patch(reel.id, (r) => r.copyWith(shareToken: link.token));
      await SharePlus.instance.share(
        ShareParams(text: link.url, subject: reel.title),
      );
    } catch (e) {
      if (mounted) _toast(_err(e));
    }
  }

  Future<void> _copyLink(ReelView reel) async {
    try {
      final link = await _api.share(reel.id);
      await Clipboard.setData(ClipboardData(text: link.url));
      if (mounted) _toast('Share link copied');
    } catch (e) {
      if (mounted) _toast(_err(e));
    }
  }

  Future<void> _stopSharing(ReelView reel) async {
    try {
      await _api.unshare(reel.id);
      _patch(reel.id, (r) => r.copyWith(clearShare: true));
      if (mounted) _toast('Share link turned off');
    } catch (e) {
      if (mounted) _toast(_err(e));
    }
  }

  void _retry(ReelView reel) {
    _patch(reel.id, (r) => r.copyWith(status: 'GENERATING', errorMessage: ''));
    _watch(reel.id, retry: true);
  }

  Future<void> _delete(ReelView reel) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete this reel?'),
        content: Text(
          '"${reel.title}" will be deleted and its share link stops working.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.destructive,
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await _api.delete(reel.id);
      if (!mounted) return;
      setState(() => _reels = _reels?.where((r) => r.id != reel.id).toList());
      _toast('Reel deleted');
    } catch (e) {
      if (mounted) _toast(_err(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final reels = _reels;
    final allowance = _allowance;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              const Text(
                'Story Reels',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w600,
                  letterSpacing: -0.3,
                  color: AppColors.navy,
                ),
              ),
              const SizedBox(width: 10),
              if (allowance != null)
                Expanded(
                  child: Text(
                    '${formatReelSeconds(allowance.remainingSeconds)} of '
                    '${formatReelSeconds(allowance.limitSeconds)} left',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textMuted,
                    ),
                  ),
                )
              else
                const Spacer(),
              if (reels != null && reels.isNotEmpty)
                TextButton.icon(
                  onPressed: _create,
                  icon: const Icon(Icons.add_rounded, size: 18),
                  label: const Text('New reel'),
                ),
            ],
          ),
        ),
        if (reels == null)
          Container(
            height: 112,
            decoration: BoxDecoration(
              color: _soft,
              borderRadius: BorderRadius.circular(16),
            ),
          )
        else if (reels.isEmpty)
          _empty()
        else
          for (final r in reels) ...[_card(r), const SizedBox(height: 12)],
      ],
    );
  }

  Widget _empty() {
    Widget swatch(double w, double h, List<Color> c, double angle) =>
        Transform.rotate(
          angle: angle,
          child: Container(
            width: w,
            height: h,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(6),
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: c,
              ),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x33000000),
                  blurRadius: 8,
                  offset: Offset(0, 3),
                ),
              ],
            ),
          ),
        );
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFFF7F8FB),
        borderRadius: BorderRadius.circular(24),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            height: 92,
            child: Stack(
              children: [
                Positioned(
                  left: 4,
                  top: 12,
                  child: swatch(43, 76, const [
                    Color(0xFF1D2B4F),
                    Color(0xFFC27A3A),
                  ], -0.14),
                ),
                Positioned(
                  left: 34,
                  top: 0,
                  child: swatch(46, 82, const [
                    Color(0xFF0B2D36),
                    Color(0xFF36E0A5),
                  ], 0),
                ),
                Positioned(
                  left: 64,
                  top: 16,
                  child: swatch(42, 74, const [
                    Color(0xFF2B1A0D),
                    Color(0xFFFFB84F),
                  ], 0.16),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            'Make TikTok-style videos from your book',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: AppColors.navy,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'A narrator reads each chapter in about a minute, a new '
            'illustration appears for every scene, and captions follow the '
            'voice. Watch here or share a link.',
            style: TextStyle(
              fontSize: 13,
              height: 1.5,
              color: AppColors.textMuted,
            ),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _create,
            style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
            icon: const Icon(Icons.movie_creation_outlined, size: 18),
            label: const Text('Make a reel'),
          ),
        ],
      ),
    );
  }

  Widget _card(ReelView reel) {
    final style = reelStyle(reel.stylePreset);
    final parts = reel.episodes.length;
    final meta = [
      style.label,
      '$parts ${parts == 1 ? 'video' : 'videos'}',
      ?reel.voiceName,
      if (reel.shareToken != null) 'Shared',
    ].join(' · ');
    final ready = reel.playable;
    return StripeCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      reel.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.navy,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      meta,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textMuted,
                      ),
                    ),
                  ],
                ),
              ),
              if (ready.isNotEmpty)
                FilledButton.icon(
                  onPressed: () => _play(reel),
                  style: FilledButton.styleFrom(
                    minimumSize: const Size(0, 36),
                    padding: const EdgeInsets.symmetric(horizontal: 14),
                  ),
                  icon: const Icon(Icons.play_arrow_rounded, size: 18),
                  label: const Text('Play'),
                ),
              PopupMenuButton<String>(
                tooltip: 'Reel actions',
                onSelected: (v) {
                  switch (v) {
                    case 'share':
                      unawaited(_share(reel));
                    case 'copy':
                      unawaited(_copyLink(reel));
                    case 'off':
                      unawaited(_stopSharing(reel));
                    case 'retry':
                      _retry(reel);
                    case 'delete':
                      unawaited(_delete(reel));
                  }
                },
                itemBuilder: (_) => [
                  if (ready.isNotEmpty)
                    const PopupMenuItem(value: 'share', child: Text('Share')),
                  if (ready.isNotEmpty)
                    PopupMenuItem(
                      value: 'copy',
                      child: Text(
                        reel.shareToken != null
                            ? 'Copy share link'
                            : 'Get share link',
                      ),
                    ),
                  if (reel.shareToken != null)
                    const PopupMenuItem(
                      value: 'off',
                      child: Text('Turn off link'),
                    ),
                  if (reel.status == 'FAILED')
                    const PopupMenuItem(value: 'retry', child: Text('Retry')),
                  if (!reel.running)
                    const PopupMenuItem(
                      value: 'delete',
                      child: Text(
                        'Delete',
                        style: TextStyle(color: AppColors.destructive),
                      ),
                    ),
                ],
              ),
            ],
          ),
          if (reel.running) ...[
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(99),
              child: LinearProgressIndicator(
                value: (reel.progress / 100).clamp(0.0, 1.0),
                minHeight: 6,
              ),
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                const SizedBox(
                  width: 12,
                  height: 12,
                  child: CircularProgressIndicator(strokeWidth: 1.5),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    '${reel.phase ?? 'Starting…'}'
                    '${reel.shotsTotal > 0 ? ' · ${reel.shotsDrawn} of ${reel.shotsTotal} shots drawn' : ''}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textMuted,
                    ),
                  ),
                ),
              ],
            ),
          ],
          if (reel.status == 'FAILED' &&
              (reel.errorMessage ?? '').isNotEmpty) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.fromLTRB(12, 6, 6, 6),
              decoration: BoxDecoration(
                color: const Color(0x99FDE8E8),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      reel.errorMessage!,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.destructive,
                      ),
                    ),
                  ),
                  TextButton(
                    onPressed: () => _retry(reel),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
          ],
          if (reel.episodes.isNotEmpty) ...[
            const SizedBox(height: 12),
            SizedBox(
              height: 136,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: reel.episodes.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (_, i) => _poster(reel, reel.episodes[i]),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _poster(ReelView reel, ReelEpisode e) {
    final done = e.playable;
    final poster = e.poster;
    final drawn = e.shots.where((s) => (s.imageUrl ?? '').isNotEmpty).length;
    return Semantics(
      button: done,
      label: '${done ? 'Play' : 'Making'} ${e.title}',
      child: GestureDetector(
        onTap: done ? () => _play(reel, e.number) : null,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: SizedBox(
            width: 76.5,
            height: 136,
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (poster != null)
                  Opacity(
                    opacity: done ? 1 : 0.6,
                    child: CachedNetworkImage(
                      imageUrl: resolveImageUrl(poster),
                      fit: BoxFit.cover,
                      placeholder: (_, _) =>
                          const ColoredBox(color: AppColors.navy),
                      errorWidget: (_, _, _) =>
                          const ColoredBox(color: AppColors.navy),
                    ),
                  )
                else
                  const DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [Color(0xFF1A3A5C), Color(0xFF0A2540)],
                      ),
                    ),
                  ),
                const DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.bottomCenter,
                      end: Alignment.topCenter,
                      colors: [Color(0x99000000), Color(0x00000000)],
                      stops: [0, 0.5],
                    ),
                  ),
                ),
                if (done)
                  const Center(
                    child: Icon(
                      Icons.play_circle_fill_rounded,
                      color: Colors.white,
                      size: 30,
                    ),
                  ),
                Positioned(
                  left: 6,
                  bottom: 4,
                  right: 6,
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          reel.format == 'TRAILER'
                              ? 'Trailer'
                              : 'Ch ${e.number}',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      Text(
                        done
                            ? formatReelTime(e.durationMs ?? 0)
                            : '$drawn/${e.shots.length}',
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.85),
                          fontSize: 10,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Make a reel: format, chapters, art style, pacing, narrator and music.
/// Returns the new reel once it has started.
Future<ReelView?> showCreateReelSheet(
  BuildContext context, {
  required String bookId,
  required List<ChapterContent> chapters,
  required ReelAllowance? allowance,
}) {
  return showModalBottomSheet<ReelView>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _CreateReelSheet(
      bookId: bookId,
      chapters: chapters,
      allowance: allowance,
    ),
  );
}

class _CreateReelSheet extends StatefulWidget {
  const _CreateReelSheet({
    required this.bookId,
    required this.chapters,
    required this.allowance,
  });

  final String bookId;
  final List<ChapterContent> chapters;
  final ReelAllowance? allowance;

  @override
  State<_CreateReelSheet> createState() => _CreateReelSheetState();
}

class _CreateReelSheetState extends State<_CreateReelSheet> {
  String _format = 'SHORTS';
  late final List<ChapterContent> _written = widget.chapters
      .where((c) => c.hasText)
      .toList();
  late Set<String> _picked = {
    for (final c
        in (widget.allowance?.isFree ?? false) ? _written.take(1) : _written)
      c.id,
  };
  String _style = reelStyles.first.id;
  String _pacing = 'dynamic';
  String _music = 'subtle';
  List<ReelVoice> _voices = const [];
  String? _voiceId;
  bool _busy = false;

  ReelsApi get _api => ReelsApi(context.read<ApiClient>());

  @override
  void initState() {
    super.initState();
    _api
        .voices()
        .then((v) {
          if (!mounted) return;
          setState(() {
            _voices = v.voices;
            _voiceId =
                v.defaultId ?? (v.voices.isEmpty ? null : v.voices.first.id);
          });
        })
        .catchError((_) {});
  }

  int get _episodes => _format == 'TRAILER' ? 1 : _picked.length;
  int get _estimate =>
      _episodes *
      estimateReelSeconds(
        _format == 'TRAILER'
            ? trailerTargetWords
            : (widget.allowance?.shortWords ?? 190),
      );
  bool get _overBudget =>
      widget.allowance != null &&
      _estimate > widget.allowance!.remainingSeconds + 10;

  Future<void> _submit() async {
    setState(() => _busy = true);
    try {
      ReelVoice? voice;
      for (final v in _voices) {
        if (v.id == _voiceId) voice = v;
      }
      final reel = await _api.create(
        bookId: widget.bookId,
        format: _format,
        chapterIds: _format == 'SHORTS' ? _picked.toList() : null,
        stylePreset: _style,
        pacing: _pacing,
        voice: voice,
        music: _music,
      );
      if (mounted) Navigator.pop(context, reel);
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$e'.replaceFirst('Exception: ', ''))),
      );
    }
  }

  Widget _label(String text) => Padding(
    padding: const EdgeInsets.only(top: 20, bottom: 8),
    child: Text(
      text,
      style: const TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: AppColors.navy,
      ),
    ),
  );

  Widget _choice({
    required bool selected,
    required String title,
    required String detail,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          color: selected ? AppColors.primarySoft : AppColors.white,
          border: Border.all(
            color: selected ? AppColors.primary : AppColors.border,
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.w600,
                color: selected ? AppColors.primaryText : AppColors.navy,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              detail,
              style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final allowance = widget.allowance;
    final canSubmit =
        !_busy && _episodes > 0 && !_overBudget && _written.isNotEmpty;
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.85,
      maxChildSize: 0.95,
      builder: (context, scroll) => Column(
        children: [
          Expanded(
            child: ListView(
              controller: scroll,
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
              children: [
                const Text(
                  'Make a story reel',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    color: AppColors.navy,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Narrated, illustrated and captioned, ready to watch or share.',
                  style: TextStyle(fontSize: 13, color: AppColors.textMuted),
                ),
                _label('Format'),
                Row(
                  children: [
                    Expanded(
                      child: _choice(
                        selected: _format == 'SHORTS',
                        title: 'Shorts',
                        detail: 'About a minute per chapter',
                        onTap: () => setState(() => _format = 'SHORTS'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _choice(
                        selected: _format == 'TRAILER',
                        title: 'Trailer',
                        detail: 'One minute for the whole book',
                        onTap: () => setState(() => _format = 'TRAILER'),
                      ),
                    ),
                  ],
                ),
                if (_format == 'SHORTS') ...[
                  _label('Chapters'),
                  if (_written.isEmpty)
                    const Text(
                      'No chapters are written yet.',
                      style: TextStyle(
                        fontSize: 13,
                        color: AppColors.textMuted,
                      ),
                    ),
                  for (final c in _written)
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      dense: true,
                      controlAffinity: ListTileControlAffinity.leading,
                      value: _picked.contains(c.id),
                      onChanged: (on) => setState(() {
                        _picked = {..._picked};
                        if (on == true) {
                          _picked.add(c.id);
                        } else {
                          _picked.remove(c.id);
                        }
                      }),
                      title: Text(
                        '${c.number}. ${c.title}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 13.5),
                      ),
                    ),
                ],
                _label('Art style'),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final s in reelStyles)
                      InkWell(
                        onTap: () => setState(() => _style = s.id),
                        borderRadius: BorderRadius.circular(12),
                        child: Container(
                          width: 98,
                          padding: const EdgeInsets.all(6),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: _style == s.id
                                  ? AppColors.primary
                                  : AppColors.border,
                              width: _style == s.id ? 2 : 1,
                            ),
                          ),
                          child: Column(
                            children: [
                              Container(
                                height: 44,
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(8),
                                  gradient: LinearGradient(
                                    begin: Alignment.topLeft,
                                    end: Alignment.bottomRight,
                                    colors: [s.from, s.to],
                                  ),
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                s.label,
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
                _label('Pacing'),
                Row(
                  children: [
                    Expanded(
                      child: _choice(
                        selected: _pacing == 'dynamic',
                        title: 'Dynamic',
                        detail: 'A new picture about every 3 s',
                        onTap: () => setState(() => _pacing = 'dynamic'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _choice(
                        selected: _pacing == 'calm',
                        title: 'Calm',
                        detail: 'About every 6 s, slower and quieter',
                        onTap: () => setState(() => _pacing = 'calm'),
                      ),
                    ),
                  ],
                ),
                if (_voices.isNotEmpty) ...[
                  _label('Narrator'),
                  DropdownButtonFormField<String>(
                    initialValue: _voiceId,
                    isExpanded: true,
                    items: [
                      for (final v in _voices)
                        DropdownMenuItem(
                          value: v.id,
                          child: Text(
                            v.description.isEmpty
                                ? v.name
                                : '${v.name} · ${v.description}',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                    ],
                    onChanged: (v) => setState(() => _voiceId = v),
                  ),
                ],
                _label('Music'),
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'off', label: Text('Off')),
                    ButtonSegment(value: 'subtle', label: Text('Subtle')),
                    ButtonSegment(value: 'cinematic', label: Text('Cinematic')),
                  ],
                  selected: {_music},
                  onSelectionChanged: (s) => setState(() => _music = s.first),
                ),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Container(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
              decoration: const BoxDecoration(
                border: Border(top: BorderSide(color: AppColors.border)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'About ${formatReelSeconds(_estimate)}'
                    '${allowance == null ? '' : ' · ${formatReelSeconds(allowance.remainingSeconds)} left this month'}',
                    style: TextStyle(
                      fontSize: 12.5,
                      color: _overBudget
                          ? AppColors.destructive
                          : AppColors.textMuted,
                    ),
                  ),
                  if (_overBudget)
                    const Padding(
                      padding: EdgeInsets.only(top: 2),
                      child: Text(
                        'Pick fewer chapters, or upgrade for more reel time.',
                        style: TextStyle(
                          fontSize: 12.5,
                          color: AppColors.destructive,
                        ),
                      ),
                    ),
                  const SizedBox(height: 10),
                  FilledButton.icon(
                    onPressed: canSubmit ? _submit : null,
                    icon: _busy
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.movie_creation_outlined, size: 18),
                    label: Text(
                      _format == 'TRAILER'
                          ? 'Make the trailer'
                          : 'Make $_episodes ${_episodes == 1 ? 'reel' : 'reels'}',
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
