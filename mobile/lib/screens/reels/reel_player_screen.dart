import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:bookai_mobile/models/reel.dart';
import 'package:bookai_mobile/reels/reel_playback.dart';
import 'package:bookai_mobile/reels/reel_stage.dart';
import 'package:bookai_mobile/services/api_client.dart';
import 'package:bookai_mobile/services/reels_api.dart';

/// A rail button over the reel: icon above a small label.
class _RailButton extends StatelessWidget {
  const _RailButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      child: InkResponse(
        onTap: onTap,
        radius: 28,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                color: Colors.white,
                size: 28,
                shadows: const [Shadow(color: Colors.black54, blurRadius: 6)],
              ),
              const SizedBox(height: 2),
              Text(
                label,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  shadows: [Shadow(color: Colors.black54, blurRadius: 4)],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// One reel part on screen: the stage, tap to pause, the rail, the title
/// and the scrubber.
class ReelPage extends StatelessWidget {
  const ReelPage({
    super.key,
    required this.controller,
    required this.episode,
    required this.active,
    required this.title,
    required this.subtitle,
    this.onShare,
    this.extra,
  });

  final ReelController controller;
  final ReelEpisode episode;
  final bool active;
  final String title;
  final String subtitle;
  final VoidCallback? onShare;

  /// Shown under the title (e.g. a link to the book).
  final Widget? extra;

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;
    final bottom = MediaQuery.paddingOf(context).bottom;
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final playing = active && controller.playing;
        final duration = controller.durationMs;
        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: active ? controller.toggle : null,
          child: Stack(
            fit: StackFit.expand,
            children: [
              ReelStage(
                episode: episode,
                clock: () => controller.ms,
                active: active,
                captionsOn: controller.captionsOn,
                topInset: top + 8,
              ),
              if (active && !playing)
                const Center(
                  child: IgnorePointer(
                    child: Icon(
                      Icons.play_arrow_rounded,
                      color: Colors.white,
                      size: 84,
                      shadows: [Shadow(color: Colors.black54, blurRadius: 18)],
                    ),
                  ),
                ),
              Positioned(
                right: 6,
                bottom: bottom + 120,
                child: Column(
                  children: [
                    _RailButton(
                      icon: controller.captionsOn
                          ? Icons.closed_caption_rounded
                          : Icons.closed_caption_disabled_outlined,
                      label: 'Captions',
                      onTap: controller.toggleCaptions,
                    ),
                    _RailButton(
                      icon: controller.musicOn
                          ? Icons.music_note_rounded
                          : Icons.music_off_rounded,
                      label: 'Music',
                      onTap: () => controller.musicOn = !controller.musicOn,
                    ),
                    if (onShare != null)
                      _RailButton(
                        icon: Icons.ios_share_rounded,
                        label: 'Share',
                        onTap: onShare!,
                      ),
                  ],
                ),
              ),
              Positioned(
                left: 16,
                right: 72,
                bottom: bottom + 52,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        shadows: [Shadow(color: Colors.black54, blurRadius: 6)],
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.8),
                        fontSize: 13,
                        shadows: const [
                          Shadow(color: Colors.black54, blurRadius: 6),
                        ],
                      ),
                    ),
                    ?extra,
                  ],
                ),
              ),
              if (active && duration > 0)
                Positioned(
                  left: 4,
                  right: 4,
                  bottom: bottom + 4,
                  child: _Scrubber(controller: controller, duration: duration),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _Scrubber extends StatefulWidget {
  const _Scrubber({required this.controller, required this.duration});

  final ReelController controller;
  final int duration;

  @override
  State<_Scrubber> createState() => _ScrubberState();
}

class _ScrubberState extends State<_Scrubber> {
  Timer? _tick;
  double? _dragging;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(milliseconds: 250), (_) {
      if (mounted && _dragging == null) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.duration.toDouble();
    final value = (_dragging ?? widget.controller.ms.toDouble()).clamp(0.0, d);
    return Row(
      children: [
        const SizedBox(width: 12),
        Text(
          formatReelTime(value.round()),
          style: const TextStyle(color: Colors.white70, fontSize: 11),
        ),
        Expanded(
          child: SliderTheme(
            data: SliderTheme.of(context).copyWith(
              trackHeight: 2,
              thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
              overlayShape: const RoundSliderOverlayShape(overlayRadius: 14),
              activeTrackColor: const Color(0xFFFFD84D),
              inactiveTrackColor: Colors.white.withValues(alpha: 0.25),
              thumbColor: Colors.white,
            ),
            child: Slider(
              value: value,
              max: d,
              onChanged: (v) => setState(() => _dragging = v),
              onChangeEnd: (v) {
                widget.controller.seek(v.round());
                setState(() => _dragging = null);
              },
            ),
          ),
        ),
        Text(
          formatReelTime(widget.duration),
          style: const TextStyle(color: Colors.white70, fontSize: 11),
        ),
        const SizedBox(width: 12),
      ],
    );
  }
}

/// Close button over a reel screen.
Widget _closeButton(BuildContext context) => Positioned(
  top: MediaQuery.paddingOf(context).top + 18,
  left: 8,
  child: IconButton(
    tooltip: 'Close',
    color: Colors.white,
    icon: const Icon(
      Icons.close_rounded,
      shadows: [Shadow(color: Colors.black54, blurRadius: 6)],
    ),
    onPressed: () => Navigator.of(context).maybePop(),
  ),
);

/// One of your reels, full screen; swipe between its parts.
class ReelPlayerScreen extends StatefulWidget {
  const ReelPlayerScreen({super.key, required this.reelId, this.startEpisode});

  final String reelId;
  final int? startEpisode;

  @override
  State<ReelPlayerScreen> createState() => _ReelPlayerScreenState();
}

class _ReelPlayerScreenState extends State<ReelPlayerScreen> {
  final _controller = ReelController();
  PageController? _pages;
  ReelView? _reel;
  List<ReelEpisode> _parts = const [];
  int _index = 0;
  String? _error;

  ReelsApi get _api => ReelsApi(context.read<ApiClient>());

  @override
  void initState() {
    super.initState();
    _controller.onEnded = () {
      if (_index < _parts.length - 1) {
        _pages?.animateToPage(
          _index + 1,
          duration: const Duration(milliseconds: 350),
          curve: Curves.easeOutCubic,
        );
      }
    };
    _load();
  }

  @override
  void dispose() {
    _controller.dispose();
    _pages?.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final reel = await _api.get(widget.reelId);
      if (!mounted) return;
      final parts = reel.playable;
      final start = parts.indexWhere((e) => e.number == widget.startEpisode);
      setState(() {
        _reel = reel;
        _parts = parts;
        _index = start < 0 ? 0 : start;
        _pages = PageController(initialPage: _index);
      });
      if (parts.isNotEmpty) {
        unawaited(_controller.open(parts[_index], score: reel.music));
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = '$e'.replaceFirst('Exception: ', ''));
      }
    }
  }

  Future<void> _share() async {
    final reel = _reel;
    if (reel == null) return;
    try {
      final link = await _api.share(reel.id);
      if (!mounted) return;
      _controller.pause();
      await SharePlus.instance.share(
        ShareParams(text: link.url, subject: reel.title),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$e'.replaceFirst('Exception: ', ''))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final reel = _reel;
    Widget body;
    if (_error != null) {
      body = Center(
        child: Text(_error!, style: const TextStyle(color: Colors.white70)),
      );
    } else if (reel == null) {
      body = const Center(
        child: CircularProgressIndicator(color: Colors.white70),
      );
    } else if (_parts.isEmpty) {
      body = const Center(
        child: Text(
          'Nothing to play yet.',
          style: TextStyle(color: Colors.white70),
        ),
      );
    } else {
      body = PageView.builder(
        controller: _pages,
        scrollDirection: Axis.vertical,
        itemCount: _parts.length,
        onPageChanged: (i) {
          setState(() => _index = i);
          unawaited(_controller.open(_parts[i], score: reel.music));
        },
        itemBuilder: (context, i) {
          final e = _parts[i];
          return ReelPage(
            controller: _controller,
            episode: e,
            active: i == _index,
            title: reel.title,
            subtitle: reel.format == 'TRAILER'
                ? 'Trailer'
                : 'Part ${i + 1} of ${_parts.length} · ${e.title}',
            onShare: _share,
          );
        },
      );
    }
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Stack(
          children: [
            Positioned.fill(child: body),
            _closeButton(context),
          ],
        ),
      ),
    );
  }
}

/// Reels from public books, one after another: swipe up for the next.
class ReelsFeedScreen extends StatefulWidget {
  const ReelsFeedScreen({super.key});

  @override
  State<ReelsFeedScreen> createState() => _ReelsFeedScreenState();
}

class _ReelsFeedScreenState extends State<ReelsFeedScreen> {
  final _controller = ReelController();
  final _pages = PageController();
  final _items = <ReelFeedItem>[];
  String? _cursor;
  bool _loading = false;
  bool _done = false;
  String? _error;
  int _index = 0;

  /// The part of the current reel that's playing.
  int _part = 0;

  ReelsApi get _api => ReelsApi(context.read<ApiClient>());

  @override
  void initState() {
    super.initState();
    _controller.onEnded = _next;
    _loadMore();
  }

  @override
  void dispose() {
    _controller.dispose();
    _pages.dispose();
    super.dispose();
  }

  List<ReelEpisode> _partsOf(int i) => _items[i].reel.playable;

  Future<void> _loadMore() async {
    if (_loading || _done) return;
    setState(() => _loading = true);
    try {
      final page = await _api.feed(cursor: _cursor);
      if (!mounted) return;
      final first = _items.isEmpty;
      setState(() {
        _items.addAll(page.items.where((it) => it.reel.playable.isNotEmpty));
        _cursor = page.nextCursor;
        _done = page.nextCursor == null;
        _loading = false;
      });
      if (first && _items.isNotEmpty) _play(0, 0);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = '$e'.replaceFirst('Exception: ', '');
      });
    }
  }

  void _play(int item, int part) {
    final parts = _partsOf(item);
    if (parts.isEmpty) return;
    _part = part.clamp(0, parts.length - 1);
    unawaited(_controller.open(parts[_part], score: _items[item].reel.music));
    setState(() {});
  }

  /// When a part ends: the next part, or the next reel.
  void _next() {
    if (_items.isEmpty) return;
    if (_part < _partsOf(_index).length - 1) {
      _play(_index, _part + 1);
    } else if (_index < _items.length - 1) {
      _pages.animateToPage(
        _index + 1,
        duration: const Duration(milliseconds: 400),
        curve: Curves.easeOutCubic,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    Widget body;
    if (_items.isEmpty) {
      body = Center(
        child: _loading
            ? const CircularProgressIndicator(color: Colors.white70)
            : Padding(
                padding: const EdgeInsets.all(32),
                child: Text(
                  _error ?? 'No reels yet. Make one from a finished book.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white70),
                ),
              ),
      );
    } else {
      body = PageView.builder(
        controller: _pages,
        scrollDirection: Axis.vertical,
        itemCount: _items.length,
        onPageChanged: (i) {
          _index = i;
          _play(i, 0);
          if (i >= _items.length - 2) _loadMore();
        },
        itemBuilder: (context, i) {
          final item = _items[i];
          final parts = item.reel.playable;
          final part = i == _index ? _part : 0;
          return ReelPage(
            controller: _controller,
            episode: parts[part],
            active: i == _index,
            title: item.bookTitle,
            subtitle: parts.length > 1
                ? '${item.author} · Part ${part + 1} of ${parts.length}'
                : item.author,
            extra: item.bookSlug.isEmpty
                ? null
                : Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: OutlinedButton.icon(
                      onPressed: () {
                        _controller.pause();
                        context.push('/discover/${item.bookSlug}');
                      },
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        backgroundColor: Colors.white.withValues(alpha: 0.12),
                        side: BorderSide(
                          color: Colors.white.withValues(alpha: 0.35),
                        ),
                        minimumSize: const Size(0, 40),
                      ),
                      icon: const Icon(Icons.menu_book_rounded, size: 18),
                      label: const Text('Read the book'),
                    ),
                  ),
          );
        },
      );
    }
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Stack(
          children: [
            Positioned.fill(child: body),
            _closeButton(context),
          ],
        ),
      ),
    );
  }
}
