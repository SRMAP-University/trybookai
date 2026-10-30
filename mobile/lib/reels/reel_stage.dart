/// The picture side of a reel, drawn from the narration clock every frame:
/// the current shot with its camera move, a crossfade into each new shot,
/// shot ticks at the top and word captions. A port of the website's
/// `reel-stage.tsx`.
library;

import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:bookai_mobile/models/reel.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/manuscript_view.dart';

double _easeInOut(double p) =>
    p < 0.5 ? 4 * p * p * p : 1 - math.pow(-2 * p + 2, 3) / 2;
double _easeOutExpo(double p) =>
    p >= 1 ? 1 : 1 - math.pow(2, -10 * p).toDouble();

/// Camera move over a shot, [raw] from 0 (shot starts) to 1 (shot ends):
/// scale, then a shift as a fraction of the frame.
({double scale, double dx, double dy}) _motion(String motion, double raw) {
  final p = _easeInOut(raw.clamp(0.0, 1.0));
  switch (motion) {
    case 'pull-out':
      return (scale: 1.2 - 0.16 * p, dx: 0, dy: 0);
    case 'pan-left':
      return (scale: 1.18, dx: 0.05 - 0.1 * p, dy: 0);
    case 'pan-right':
      return (scale: 1.18, dx: -0.05 + 0.1 * p, dy: 0);
    case 'rise':
      return (scale: 1.16, dx: 0, dy: -0.05 + 0.1 * p);
    case 'tilt-down':
      return (scale: 1.16, dx: 0, dy: 0.05 - 0.1 * p);
    case 'drift':
      return (
        scale: 1.12 + 0.08 * p,
        dx: -0.03 + 0.06 * p,
        dy: 0.02 - 0.04 * p,
      );
    case 'punch-in':
      final punch = _easeOutExpo((raw * 3).clamp(0.0, 1.0));
      return (scale: 1.24 - 0.12 * punch + 0.04 * raw, dx: 0, dy: 0);
    default:
      return (scale: 1.04 + 0.16 * p, dx: 0, dy: 0);
  }
}

/// Moods that get a slight handheld sway.
const _handheld = {'suspense', 'action', 'dark', 'mystery'};

/// How fast pictures change into a shot of this mood: near-cuts for action,
/// slow dissolves for quiet scenes.
int _fadeMs(String mood) => switch (mood) {
  'action' || 'suspense' || 'triumph' => 140,
  'calm' || 'sad' || 'warm' || 'wonder' => 700,
  _ => 320,
};

const _captionShadows = [
  Shadow(color: Color(0x8C000000), offset: Offset(0, 2)),
  Shadow(color: Color(0x8C000000), blurRadius: 14),
  Shadow(color: Colors.black, offset: Offset(1, 1)),
  Shadow(color: Colors.black, offset: Offset(-1, -1)),
  Shadow(color: Colors.black, offset: Offset(1, -1)),
  Shadow(color: Colors.black, offset: Offset(-1, 1)),
];

class ReelStage extends StatefulWidget {
  const ReelStage({
    super.key,
    required this.episode,
    required this.clock,
    required this.active,
    this.captionsOn = true,
    this.topInset = 12,
  });

  final ReelEpisode episode;

  /// Current narration position in ms.
  final int Function() clock;

  /// Only the reel in view animates; others show their opening frame.
  final bool active;
  final bool captionsOn;
  final double topInset;

  @override
  State<ReelStage> createState() => _ReelStageState();
}

class _ReelStageState extends State<ReelStage>
    with SingleTickerProviderStateMixin {
  late final Ticker _ticker = createTicker((_) {
    final t = widget.clock();
    if (t != _t) setState(() => _t = t);
  });
  int _t = 0;
  late List<CaptionChunk> _chunks = captionChunks(widget.episode.captions);
  int _precachedFor = -1;

  @override
  void initState() {
    super.initState();
    if (widget.active) _ticker.start();
  }

  @override
  void didUpdateWidget(ReelStage old) {
    super.didUpdateWidget(old);
    if (!identical(old.episode, widget.episode)) {
      _chunks = captionChunks(widget.episode.captions);
      _precachedFor = -1;
    }
    if (widget.active && !_ticker.isActive) {
      _ticker.start();
    } else if (!widget.active && _ticker.isActive) {
      _ticker.stop();
      setState(() => _t = 0);
    }
  }

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  double _shotProgress(ReelShot s, int t) {
    final start = s.startMs;
    final end = s.endMs;
    if (start == null || end == null) return 0;
    return ((t - start) / math.max(1, end - start)).clamp(0.0, 1.0);
  }

  /// Loads the next pictures before they're needed.
  void _precache(List<ReelShot> shots, int index) {
    if (_precachedFor == index) return;
    _precachedFor = index;
    for (var i = index + 1; i <= index + 2 && i < shots.length; i++) {
      final url = shots[i].imageUrl;
      if ((url ?? '').isNotEmpty) {
        precacheImage(
          CachedNetworkImageProvider(resolveImageUrl(url!)),
          context,
        ).ignore();
      }
    }
  }

  Widget _picture(ReelShot shot, int t, bool reduced, Size size) {
    final m = _motion(shot.motion, reduced ? 0.5 : _shotProgress(shot, t));
    final matrix = Matrix4.identity()
      ..scaleByDouble(m.scale, m.scale, 1, 1)
      ..translateByDouble(m.dx * size.width, m.dy * size.height, 0, 1);
    if (!reduced && _handheld.contains(shot.mood)) {
      final x = math.sin(t / 640) * 0.0035 + math.sin(t / 233) * 0.0008;
      final y = math.cos(t / 820) * 0.003;
      final r = math.sin(t / 1100) * 0.18 * math.pi / 180;
      matrix
        ..translateByDouble(x * size.width, y * size.height, 0, 1)
        ..rotateZ(r);
    }
    return Transform(
      alignment: Alignment.center,
      transform: matrix,
      child: CachedNetworkImage(
        imageUrl: resolveImageUrl(shot.imageUrl!),
        fit: BoxFit.cover,
        width: size.width,
        height: size.height,
        fadeInDuration: Duration.zero,
        placeholder: (_, _) => const ColoredBox(color: Color(0xFF0A2540)),
        errorWidget: (_, _, _) => const ColoredBox(color: Color(0xFF0A2540)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final e = widget.episode;
    final shots = e.shots.where((s) => (s.imageUrl ?? '').isNotEmpty).toList();
    final reduced = AppMotion.reduced(context);
    final t = widget.active ? _t : 0;
    final index = shots.isEmpty ? 0 : shotIndexAt(shots, t);
    if (shots.isNotEmpty) _precache(shots, index);

    // Crossfade: the new shot fades in over the previous one.
    final current = shots.isEmpty ? null : shots[index];
    final previous = index > 0 ? shots[index - 1] : null;
    final fade = current == null || previous == null || reduced
        ? 1.0
        : ((t - (current.startMs ?? 0)) / _fadeMs(current.mood)).clamp(
            0.0,
            1.0,
          );

    final chunkIndex = widget.captionsOn ? chunkIndexAt(_chunks, t) : -1;
    var spoken = -1;
    if (chunkIndex >= 0) {
      final c = _chunks[chunkIndex];
      for (var i = c.first; i <= c.last; i++) {
        if (e.captions[i].start <= t) spoken = i;
      }
    }

    return LayoutBuilder(
      builder: (context, box) {
        final size = box.biggest;
        return ClipRect(
          child: Stack(
            fit: StackFit.expand,
            children: [
              const ColoredBox(color: Color(0xFF0A2540)),
              if (previous != null && fade < 1)
                _picture(previous, t, reduced, size),
              if (current != null)
                Opacity(
                  opacity: fade,
                  child: _picture(current, t, reduced, size),
                ),
              // Vignette, and darker top and bottom for the captions and UI.
              const IgnorePointer(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: RadialGradient(
                      radius: 0.9,
                      colors: [Color(0x00000000), Color(0x73000000)],
                      stops: [0.55, 1],
                    ),
                  ),
                ),
              ),
              const IgnorePointer(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Color(0x80000000),
                        Color(0x00000000),
                        Color(0x00000000),
                        Color(0xB3000000),
                      ],
                      stops: [0, 0.18, 0.55, 1],
                    ),
                  ),
                ),
              ),
              // A tick per shot, filling as it plays.
              Positioned(
                top: widget.topInset,
                left: 12,
                right: 12,
                child: Row(
                  children: [
                    for (var i = 0; i < shots.length; i++) ...[
                      if (i > 0) const SizedBox(width: 3),
                      Expanded(
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(99),
                          child: LinearProgressIndicator(
                            value: i < index
                                ? 1
                                : i > index
                                ? 0
                                : _shotProgress(shots[i], t),
                            minHeight: 3,
                            color: Colors.white,
                            backgroundColor: Colors.white.withValues(
                              alpha: 0.3,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (chunkIndex >= 0)
                Positioned(
                  left: 16,
                  right: 64,
                  top: size.height * 0.58,
                  child: Wrap(
                    alignment: WrapAlignment.center,
                    children: [
                      for (
                        var i = _chunks[chunkIndex].first;
                        i <= _chunks[chunkIndex].last;
                        i++
                      )
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 3),
                          child: AnimatedScale(
                            scale: i == spoken ? 1.1 : 1,
                            duration: const Duration(milliseconds: 100),
                            child: Text(
                              e.captions[i].word,
                              style: TextStyle(
                                color: i == spoken
                                    ? const Color(0xFFFFD84D)
                                    : Colors.white,
                                fontSize: 23,
                                fontWeight: FontWeight.w800,
                                height: 1.2,
                                shadows: _captionShadows,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}
