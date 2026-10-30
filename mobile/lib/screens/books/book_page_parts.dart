/// The sections of your book's page, matching the website's
/// `/dashboard/books/[id]`: a dark hero lit by the cover, stats or writing
/// progress, illustrations, chapters, editions, story notes, visibility and
/// settings.
library;

import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:bookai_mobile/config/api_config.dart';
import 'package:bookai_mobile/config/book_options.dart';
import 'package:bookai_mobile/models/book_content.dart';
import 'package:bookai_mobile/services/api_client.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/book_cover_3d.dart';
import 'package:bookai_mobile/widgets/common.dart';
import 'package:bookai_mobile/widgets/manuscript_view.dart';

const _ink = AppColors.navy;
const _lavender = Color(0xFFC9C5FF);
const _soft = Color(0xFFF6F9FC);
const _hairline = Color(0xFFF0F2F6);
const _faint = Color(0xFFA3ACB9);
const _tabular = [ui.FontFeature.tabularFigures()];

/// Section title, as on the website (17px semibold).
class PageSectionTitle extends StatelessWidget {
  const PageSectionTitle(this.title, {super.key, this.trailing});

  final String title;
  final String? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Text(
              title,
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w600,
                letterSpacing: -0.3,
                color: _ink,
              ),
            ),
          ),
          if (trailing != null)
            Text(
              trailing!,
              style: const TextStyle(
                fontSize: 13,
                color: AppColors.textMuted,
                fontFeatures: _tabular,
              ),
            ),
        ],
      ),
    );
  }
}

// Hero -------------------------------------------------------------------------

/// The dark stage at the top: the book's own cover, blurred, lights it; the
/// cover rises in, catches a sheen and then floats.
class BookHero extends StatefulWidget {
  const BookHero({
    super.key,
    required this.title,
    required this.coverImage,
    required this.slug,
    required this.pill,
    required this.meta,
    required this.edition,
    required this.description,
    required this.actions,
    required this.onBack,
    this.coverBusy = false,
  });

  final String title;
  final String? coverImage;
  final String? slug;
  final Widget pill;
  final String meta;
  final int edition;
  final String? description;
  final List<Widget> actions;
  final VoidCallback onBack;
  final bool coverBusy;

  @override
  State<BookHero> createState() => _BookHeroState();
}

class _BookHeroState extends State<BookHero> with TickerProviderStateMixin {
  late final _rise = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  );
  late final _sheen = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1600),
  );
  late final _float = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 7),
  );
  late final _drift = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 26),
  );
  final _timers = <Timer>[];
  bool _started = false;
  bool _synopsis = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    if (AppMotion.reduced(context)) {
      _rise.value = 1;
      _sheen.value = 1;
      return;
    }
    _rise.forward();
    _drift.repeat(reverse: true);
    _timers.add(Timer(const Duration(milliseconds: 600), _sheen.forward));
    _timers.add(Timer(const Duration(seconds: 1), _float.repeat));
  }

  @override
  void dispose() {
    for (final t in _timers) {
      t.cancel();
    }
    _rise.dispose();
    _sheen.dispose();
    _float.dispose();
    _drift.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final url = ApiConfig.coverUrl(widget.coverImage, widget.slug);
    final top = MediaQuery.paddingOf(context).top;
    return ClipRect(
      child: Stack(
        children: [
          Positioned.fill(child: _backdrop(url)),
          Padding(
            padding: EdgeInsets.fromLTRB(20, top + 40, 20, 32),
            child: Column(
              children: [
                _cover(),
                const SizedBox(height: 24),
                widget.pill,
                const SizedBox(height: 12),
                Text(
                  widget.title,
                  textAlign: TextAlign.center,
                  style: AppType.display(size: 34, color: Colors.white),
                ),
                const SizedBox(height: 8),
                Wrap(
                  alignment: WrapAlignment.center,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    if (widget.edition > 1)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(99),
                        ),
                        child: Text(
                          'Edition ${widget.edition}',
                          style: const TextStyle(
                            color: _lavender,
                            fontSize: 11.5,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    Text(
                      widget.meta,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.65),
                        fontSize: 13.5,
                      ),
                    ),
                  ],
                ),
                if ((widget.description ?? '').trim().isNotEmpty) ...[
                  const SizedBox(height: 4),
                  TextButton(
                    onPressed: () => setState(() => _synopsis = !_synopsis),
                    style: TextButton.styleFrom(
                      foregroundColor: Colors.white.withValues(alpha: 0.75),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Text(
                          'Synopsis',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        const SizedBox(width: 4),
                        AnimatedRotation(
                          turns: _synopsis ? 0.5 : 0,
                          duration: const Duration(milliseconds: 200),
                          child: const Icon(
                            Icons.expand_more_rounded,
                            size: 18,
                          ),
                        ),
                      ],
                    ),
                  ),
                  AnimatedSize(
                    duration: const Duration(milliseconds: 250),
                    curve: Curves.easeOut,
                    alignment: Alignment.topCenter,
                    child: _synopsis
                        ? Padding(
                            padding: const EdgeInsets.only(bottom: 4),
                            child: ExpandableText(
                              widget.description!.trim(),
                              maxLines: 6,
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.78),
                                fontSize: 14.5,
                                height: 1.55,
                              ),
                            ),
                          )
                        : const SizedBox(width: double.infinity),
                  ),
                ],
                const SizedBox(height: 20),
                Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 8,
                  runSpacing: 8,
                  children: widget.actions,
                ),
              ],
            ),
          ),
          Positioned(
            top: top + 8,
            left: 12,
            child: Material(
              color: Colors.white.withValues(alpha: 0.1),
              shape: const CircleBorder(),
              child: IconButton(
                tooltip: 'Your books',
                color: Colors.white,
                icon: const Icon(Icons.arrow_back_rounded, size: 20),
                onPressed: widget.onBack,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _backdrop(String url) {
    return Stack(
      fit: StackFit.expand,
      children: [
        const ColoredBox(color: _ink),
        AnimatedBuilder(
          animation: _drift,
          builder: (_, child) {
            final t = Curves.easeInOut.transform(_drift.value);
            return Transform.translate(
              offset: Offset(-12 + 24 * t, -8 + 16 * t),
              child: Transform.scale(scale: 1.35, child: child),
            );
          },
          // Blurred once and moved as a layer, not re-blurred each frame.
          child: RepaintBoundary(
            child: Opacity(
              opacity: 0.8,
              child: url.isEmpty
                  ? const DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: RadialGradient(
                          center: Alignment(-0.4, -0.5),
                          radius: 0.9,
                          colors: [AppColors.primary, Color(0x00635BFF)],
                        ),
                      ),
                    )
                  : ImageFiltered(
                      imageFilter: ui.ImageFilter.blur(sigmaX: 28, sigmaY: 28),
                      child: CachedNetworkImage(
                        imageUrl: url,
                        fit: BoxFit.cover,
                        memCacheWidth: 96,
                        errorWidget: (_, _, _) => const SizedBox.shrink(),
                      ),
                    ),
            ),
          ),
        ),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0x590A2540), Color(0xB30A2540), Color(0xF20A2540)],
              stops: [0, 0.55, 1],
            ),
          ),
        ),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              radius: 1,
              colors: [Color(0x00000000), Color(0x73000000)],
              stops: [0.35, 1],
            ),
          ),
        ),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              center: Alignment.topCenter,
              radius: 0.8,
              colors: [Color(0x29FFFFFF), Color(0x00FFFFFF)],
            ),
          ),
        ),
      ],
    );
  }

  Widget _cover() {
    const width = 150.0;
    const height = width * 1.45;
    return AnimatedBuilder(
      animation: Listenable.merge([_rise, _float, _sheen]),
      builder: (_, _) {
        final rise = const Cubic(0.2, 0.75, 0.15, 1).transform(_rise.value);
        final float = -6 * math.sin(_float.value * math.pi * 2).abs();
        final sheen = Curves.easeInOutCubic.transform(_sheen.value);
        return Opacity(
          opacity: rise,
          child: Transform.translate(
            offset: Offset(0, 18 * (1 - rise) + float),
            child: Transform.scale(
              scale: 0.94 + 0.06 * rise,
              child: Stack(
                children: [
                  BookCover3D(
                    title: widget.title,
                    coverImage: widget.coverImage,
                    slug: widget.slug,
                    width: width,
                    ribbon: false,
                  ),
                  // One light sweep across the cover.
                  if (_sheen.value > 0 && _sheen.value < 1)
                    Positioned(
                      left: 0,
                      top: 0,
                      width: width,
                      height: height,
                      child: ClipRRect(
                        borderRadius: const BorderRadius.only(
                          topLeft: Radius.circular(4),
                          bottomLeft: Radius.circular(4),
                          topRight: Radius.circular(9),
                          bottomRight: Radius.circular(9),
                        ),
                        child: FractionalTranslation(
                          translation: Offset(-1.2 + 2.6 * sheen, 0),
                          child: Transform(
                            transform: Matrix4.skewX(-0.32),
                            child: FractionallySizedBox(
                              widthFactor: 0.5,
                              alignment: Alignment.centerLeft,
                              child: const DecoratedBox(
                                decoration: BoxDecoration(
                                  gradient: LinearGradient(
                                    colors: [
                                      Color(0x00FFFFFF),
                                      Color(0x4DFFFFFF),
                                      Color(0x00FFFFFF),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  if (widget.coverBusy)
                    Positioned(
                      left: 0,
                      top: 0,
                      width: width,
                      height: height,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.4),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Center(
                          child: CircularProgressIndicator(color: Colors.white),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

/// Book status on the hero: writing, finished, failed, paused or draft.
class StatusPill extends StatelessWidget {
  const StatusPill({
    super.key,
    required this.status,
    required this.inProgress,
    required this.chapterCount,
    this.liveChapter,
  });

  final String status;
  final bool inProgress;
  final int chapterCount;
  final int? liveChapter;

  @override
  Widget build(BuildContext context) {
    if (inProgress) {
      final label = status == 'OUTLINING' || chapterCount == 0
          ? 'Outlining chapters'
          : liveChapter != null
          ? 'Writing chapter $liveChapter of $chapterCount'
          : 'Writing';
      return _pill(
        Colors.white.withValues(alpha: 0.1),
        _lavender,
        label,
        leading: const _PulsingDot(),
      );
    }
    if (status == 'COMPLETED') {
      return _pill(
        const Color(0x590E6245),
        const Color(0xFF9FF0C0),
        chapterCount > 0 ? 'Finished · $chapterCount chapters' : 'Finished',
        leading: const Icon(
          Icons.check_circle_outline_rounded,
          size: 14,
          color: Color(0xFF9FF0C0),
        ),
      );
    }
    if (status == 'FAILED') {
      return _pill(const Color(0x33DF1B41), const Color(0xFFFFB3C0), 'Failed');
    }
    if (status == 'PAUSED') {
      return _pill(const Color(0x4D9A6700), const Color(0xFFFCD77A), 'Paused');
    }
    return _pill(
      Colors.white.withValues(alpha: 0.1),
      Colors.white.withValues(alpha: 0.75),
      status == 'CANCELLED' ? 'Stopped' : 'Draft',
    );
  }

  Widget _pill(Color bg, Color fg, String label, {Widget? leading}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(99),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (leading != null) ...[leading, const SizedBox(width: 6)],
          Text(
            label,
            style: TextStyle(
              color: fg,
              fontSize: 12.5,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}

class _PulsingDot extends StatefulWidget {
  const _PulsingDot();

  @override
  State<_PulsingDot> createState() => _PulsingDotState();
}

class _PulsingDotState extends State<_PulsingDot>
    with SingleTickerProviderStateMixin {
  late final _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1000),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!AppMotion.reduced(context) && !_c.isAnimating) {
      _c.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween(begin: 0.35, end: 1.0).animate(_c),
      child: Container(
        width: 6,
        height: 6,
        decoration: const BoxDecoration(
          color: Color(0xFFA5A0FF),
          shape: BoxShape.circle,
        ),
      ),
    );
  }
}

enum StageTone { primary, normal, danger }

/// A button on the dark hero: the indigo primary, a glassy ghost, or the
/// red-tinted Stop.
class StageButton extends StatelessWidget {
  const StageButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onPressed,
    this.tone = StageTone.normal,
    this.busy = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onPressed;
  final StageTone tone;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final (bg, fg, side) = switch (tone) {
      StageTone.primary => (
        AppColors.primary,
        Colors.white,
        Colors.transparent,
      ),
      StageTone.normal => (
        Colors.white.withValues(alpha: 0.1),
        Colors.white,
        Colors.white.withValues(alpha: 0.15),
      ),
      StageTone.danger => (
        const Color(0x26DF1B41),
        const Color(0xFFFFB3C0),
        const Color(0x66FF6B81),
      ),
    };
    return TextButton(
      onPressed: busy ? null : onPressed,
      style: TextButton.styleFrom(
        backgroundColor: bg,
        foregroundColor: fg,
        disabledForegroundColor: fg.withValues(alpha: 0.6),
        minimumSize: const Size(0, 40),
        tapTargetSize: MaterialTapTargetSize.padded,
        padding: EdgeInsets.symmetric(
          horizontal: tone == StageTone.primary ? 20 : 16,
        ),
        shape: StadiumBorder(side: BorderSide(color: side)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (busy)
            SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(strokeWidth: 2, color: fg),
            )
          else
            Icon(icon, size: 16),
          const SizedBox(width: 6),
          Text(
            label,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }
}

/// The ⋯ circle on the hero that opens [items].
class StageMenu extends StatelessWidget {
  const StageMenu({super.key, required this.items, required this.onSelected});

  final List<PopupMenuEntry<String>> items;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<String>(
      tooltip: 'More actions',
      onSelected: onSelected,
      itemBuilder: (_) => items,
      child: Container(
        width: 48,
        height: 48,
        alignment: Alignment.center,
        child: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.1),
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
          ),
          child: const Icon(Icons.more_horiz_rounded, color: Colors.white),
        ),
      ),
    );
  }
}

/// One row in a hero menu.
PopupMenuItem<String> stageMenuItem(
  String value,
  IconData icon,
  String label, {
  bool enabled = true,
  bool danger = false,
}) {
  final color = danger ? AppColors.destructive : AppColors.textBody;
  return PopupMenuItem(
    value: value,
    enabled: enabled,
    child: Row(
      children: [
        Icon(icon, size: 18, color: enabled ? color : AppColors.border),
        const SizedBox(width: 12),
        Text(label, style: TextStyle(color: danger ? color : null)),
      ],
    ),
  );
}

// Stats and progress ------------------------------------------------------------

String formatWords(int words) {
  if (words < 1000) return '$words';
  final k = words / 1000;
  return '${k.toStringAsFixed(words < 10000 ? 1 : 0).replaceAll(RegExp(r'\.0$'), '')}k';
}

/// Reading time at 250 words a minute: "12 min", "1.5 hr".
String readingTime(int words) {
  final minutes = math.max(1, (words / 250).round());
  if (minutes < 60) return '$minutes min';
  final hours = minutes / 60;
  return '${hours.toStringAsFixed(hours < 10 ? 1 : 0).replaceAll(RegExp(r'\.0$'), '')} hr';
}

/// Pages, words, chapters and reading time for a finished book.
class BookStats extends StatelessWidget {
  const BookStats({super.key, required this.stats});

  final List<(String, String)> stats;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < stats.length; i++) ...[
          if (i > 0) const SizedBox(width: 8),
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
              decoration: BoxDecoration(
                color: _soft,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                children: [
                  Text(
                    stats[i].$1,
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.textMuted,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    stats[i].$2,
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w600,
                      letterSpacing: -0.3,
                      color: _ink,
                      fontFeatures: _tabular,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }
}

enum ChapterState { done, writing, pending }

/// Same rule as the website: written when marked done or every section has
/// text; writing while the book is in progress and it's the live chapter
/// (or, before the stream says which, some of its text is there).
ChapterState chapterStateOf(
  ChapterContent c,
  bool inProgress, [
  String? liveChapterId,
]) {
  final written = c.sections
      .where((s) => (s.content ?? '').trim().isNotEmpty)
      .length;
  if (c.status == 'COMPLETED' ||
      (c.sections.isNotEmpty && written == c.sections.length)) {
    return ChapterState.done;
  }
  if (inProgress &&
      (liveChapterId != null
          ? liveChapterId == c.id
          : c.status == 'GENERATING' || written > 0)) {
    return ChapterState.writing;
  }
  return ChapterState.pending;
}

/// Progress while writing: one segment per chapter.
class WritingProgress extends StatelessWidget {
  const WritingProgress({
    super.key,
    required this.label,
    required this.progress,
    required this.currentPages,
    required this.targetPages,
    required this.states,
    this.error,
  });

  final String label;
  final double progress;
  final int currentPages;
  final int targetPages;
  final List<ChapterState> states;
  final String? error;

  @override
  Widget build(BuildContext context) {
    return StripeCard(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: _ink,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                '${progress.round()}% · $currentPages'
                '${targetPages > 0 ? ' of $targetPages' : ''} pages',
                style: const TextStyle(
                  fontSize: 13,
                  color: AppColors.textMuted,
                  fontFeatures: _tabular,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (states.isEmpty)
            ClipRRect(
              borderRadius: BorderRadius.circular(99),
              child: LinearProgressIndicator(
                value: (progress / 100).clamp(0, 1),
                minHeight: 6,
              ),
            )
          else
            Row(
              children: [
                for (var i = 0; i < states.length; i++) ...[
                  if (i > 0) const SizedBox(width: 4),
                  Expanded(child: _Segment(states[i])),
                ],
              ],
            ),
          if ((error ?? '').isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              error!,
              style: const TextStyle(
                fontSize: 13,
                color: AppColors.destructive,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Segment extends StatefulWidget {
  const _Segment(this.state);
  final ChapterState state;

  @override
  State<_Segment> createState() => _SegmentState();
}

class _SegmentState extends State<_Segment>
    with SingleTickerProviderStateMixin {
  late final _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1000),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync();
  }

  @override
  void didUpdateWidget(_Segment old) {
    super.didUpdateWidget(old);
    _sync();
  }

  void _sync() {
    final pulse =
        widget.state == ChapterState.writing && !AppMotion.reduced(context);
    if (pulse && !_pulse.isAnimating) {
      _pulse.repeat(reverse: true);
    } else if (!pulse && _pulse.isAnimating) {
      _pulse.stop();
      _pulse.value = 1;
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color = widget.state == ChapterState.pending
        ? AppColors.border
        : AppColors.primary;
    final bar = AnimatedContainer(
      duration: const Duration(milliseconds: 500),
      height: 6,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(99),
      ),
    );
    if (widget.state != ChapterState.writing) return bar;
    return FadeTransition(
      opacity: Tween(begin: 0.4, end: 1.0).animate(_pulse),
      child: bar,
    );
  }
}

// Chapters ------------------------------------------------------------------------

/// The chapter list: number, title, state; tap to read the text in place.
class ChapterList extends StatefulWidget {
  const ChapterList({
    super.key,
    required this.chapters,
    required this.inProgress,
    this.liveChapterId,
    required this.canRewrite,
    required this.rewriting,
    required this.onRewrite,
    required this.onRead,
  });

  final List<ChapterContent> chapters;
  final bool inProgress;
  final String? liveChapterId;
  final bool canRewrite;
  final String? rewriting;
  final ValueChanged<ChapterContent> onRewrite;
  final ValueChanged<ChapterContent> onRead;

  @override
  State<ChapterList> createState() => _ChapterListState();
}

class _ChapterListState extends State<ChapterList> {
  String? _open;

  @override
  Widget build(BuildContext context) {
    final chapters = widget.chapters;
    return StripeCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (var i = 0; i < chapters.length; i++) ...[
            if (i > 0) const Divider(height: 1, color: _hairline),
            _row(chapters[i]),
          ],
        ],
      ),
    );
  }

  Widget _row(ChapterContent c) {
    final open = _open == c.id;
    final state = chapterStateOf(c, widget.inProgress, widget.liveChapterId);
    final busy = widget.rewriting == c.id;
    return Column(
      children: [
        InkWell(
          onTap: () => setState(() => _open = open ? null : c.id),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 6, 8, 6),
            child: Row(
              children: [
                SizedBox(
                  width: 26,
                  child: Text(
                    c.number.toString().padLeft(2, '0'),
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 12,
                      color: _faint,
                      fontFeatures: _tabular,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    c.title.isEmpty ? 'Chapter ${c.number}' : c.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: _ink,
                    ),
                  ),
                ),
                AnimatedRotation(
                  turns: open ? 0.5 : 0,
                  duration: const Duration(milliseconds: 200),
                  child: const Icon(
                    Icons.expand_more_rounded,
                    size: 18,
                    color: _faint,
                  ),
                ),
                if (widget.canRewrite)
                  IconButton(
                    tooltip: 'Rewrite chapter ${c.number}',
                    onPressed: widget.rewriting == null
                        ? () => widget.onRewrite(c)
                        : null,
                    icon: busy
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(
                            Icons.replay_rounded,
                            size: 16,
                            color: AppColors.textMuted,
                          ),
                  )
                else
                  const SizedBox(width: 8),
                _stateIcon(state),
                const SizedBox(width: 8),
              ],
            ),
          ),
        ),
        AnimatedSize(
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOut,
          alignment: Alignment.topCenter,
          child: open ? _body(c) : const SizedBox(width: double.infinity),
        ),
      ],
    );
  }

  Widget _stateIcon(ChapterState state) {
    switch (state) {
      case ChapterState.done:
        return const Icon(
          Icons.check_circle_outline_rounded,
          size: 16,
          color: AppColors.success,
        );
      case ChapterState.writing:
        return const SizedBox(
          width: 16,
          height: 16,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            color: AppColors.primary,
          ),
        );
      case ChapterState.pending:
        return const Icon(
          Icons.schedule_rounded,
          size: 16,
          color: Color(0xFFC1C9D2),
        );
    }
  }

  Widget _body(ChapterContent c) {
    final sections = c.sections
        .where((s) => (s.content ?? '').trim().isNotEmpty)
        .toList();
    return Container(
      width: double.infinity,
      color: const Color(0xFFF8FAFC),
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if ((c.imageUrl ?? '').isNotEmpty) ...[
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: AspectRatio(
                aspectRatio: 3 / 2,
                child: CachedNetworkImage(
                  imageUrl: resolveImageUrl(c.imageUrl!),
                  fit: BoxFit.cover,
                  placeholder: (_, _) =>
                      const ColoredBox(color: Color(0xFFEEF2F7)),
                  errorWidget: (_, _, _) =>
                      const ColoredBox(color: Color(0xFFEEF2F7)),
                ),
              ),
            ),
            const SizedBox(height: 16),
          ],
          if (sections.isEmpty)
            const Text(
              'Not written yet.',
              style: TextStyle(fontSize: 13, color: AppColors.textMuted),
            ),
          for (final s in sections) ...[
            if (s.title.trim().isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text(
                  s.title,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: AppColors.textMuted,
                  ),
                ),
              ),
            ManuscriptView(
              content: s.content!,
              palette: ReaderPalette.paper,
              fontSize: 15,
            ),
            const SizedBox(height: 8),
          ],
          if (sections.isNotEmpty)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: () => widget.onRead(c),
                icon: const Icon(Icons.auto_stories_outlined, size: 18),
                label: const Text('Read from here'),
              ),
            ),
        ],
      ),
    );
  }
}

// Editions, notes, visibility, settings -------------------------------------------

class EditionsList extends StatelessWidget {
  const EditionsList({
    super.key,
    required this.editions,
    required this.currentId,
    required this.onOpen,
  });

  final List<EditionRef> editions;
  final String currentId;
  final ValueChanged<EditionRef> onOpen;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const PageSectionTitle('Editions'),
        const Padding(
          padding: EdgeInsets.only(bottom: 12),
          child: Text(
            'Each edition reuses the same premise and settings with a fresh '
            'manuscript.',
            style: TextStyle(fontSize: 13, color: AppColors.textMuted),
          ),
        ),
        StripeCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              for (var i = 0; i < editions.length; i++) ...[
                if (i > 0) const Divider(height: 1, color: _hairline),
                _row(editions[i]),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _row(EditionRef e) {
    final current = e.id == currentId;
    final status = e.status.toLowerCase();
    return InkWell(
      onTap: current ? null : () => onOpen(e),
      child: Container(
        color: current ? const Color(0xFFF8F7FF) : null,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            BookCover3D(
              title: e.title ?? 'Edition ${e.edition}',
              coverImage: e.coverImage,
              slug: e.slug,
              width: 36,
              ribbon: false,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    e.title ?? 'Edition ${e.edition}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w500,
                      color: _ink,
                    ),
                  ),
                  Text(
                    'Edition ${e.edition} · '
                    '${status.isEmpty ? '' : status[0].toUpperCase() + status.substring(1)}',
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textMuted,
                    ),
                  ),
                ],
              ),
            ),
            if (current)
              const Text(
                'Viewing',
                style: TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w500,
                  color: AppColors.primaryText,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Characters, themes and instructions the book was written with.
class StoryNotes extends StatelessWidget {
  const StoryNotes({
    super.key,
    required this.characters,
    required this.themes,
    required this.instructions,
  });

  final List<String> characters;
  final List<String> themes;
  final String? instructions;

  static const _label = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.w500,
    color: AppColors.textMuted,
  );
  static const _body = TextStyle(
    fontSize: 13.5,
    height: 1.5,
    color: AppColors.textBody,
  );

  @override
  Widget build(BuildContext context) {
    return StripeCard(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Story notes',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: _ink,
            ),
          ),
          if (characters.isNotEmpty) ...[
            const SizedBox(height: 16),
            const Text('Characters', style: _label),
            const SizedBox(height: 4),
            for (final c in characters)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text(c, style: _body),
              ),
          ],
          if (themes.isNotEmpty) ...[
            const SizedBox(height: 16),
            const Text('Themes', style: _label),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final t in themes)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: _soft,
                      borderRadius: BorderRadius.circular(99),
                    ),
                    child: Text(
                      t,
                      style: const TextStyle(
                        fontSize: 12.5,
                        color: AppColors.textBody,
                      ),
                    ),
                  ),
              ],
            ),
          ],
          if ((instructions ?? '').trim().isNotEmpty) ...[
            const SizedBox(height: 16),
            const Text('Instructions', style: _label),
            const SizedBox(height: 4),
            Text(instructions!.trim(), style: _body),
          ],
        ],
      ),
    );
  }
}

/// Public or private, with the switch and the public page link.
class VisibilityCard extends StatelessWidget {
  const VisibilityCard({
    super.key,
    required this.isPublic,
    required this.canMakePrivate,
    required this.busy,
    required this.onChanged,
    required this.onViewPublic,
    required this.onUpgrade,
    required this.showUpgrade,
  });

  final bool isPublic;
  final bool canMakePrivate;
  final bool busy;
  final ValueChanged<bool> onChanged;
  final VoidCallback? onViewPublic;
  final VoidCallback onUpgrade;
  final bool showUpgrade;

  @override
  Widget build(BuildContext context) {
    return StripeCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                isPublic ? Icons.public_rounded : Icons.lock_outline_rounded,
                size: 18,
                color: isPublic ? AppColors.success : AppColors.textMuted,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      isPublic ? 'Public' : 'Private',
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: _ink,
                      ),
                    ),
                    Text(
                      isPublic
                          ? 'Listed in the library and search'
                          : 'Only you can see it',
                      style: const TextStyle(
                        fontSize: 12.5,
                        color: AppColors.textMuted,
                      ),
                    ),
                  ],
                ),
              ),
              Switch(
                value: isPublic,
                onChanged: busy ? null : onChanged,
                activeTrackColor: AppColors.primary,
                activeThumbColor: Colors.white,
              ),
            ],
          ),
          if (isPublic && onViewPublic != null)
            TextButton(
              onPressed: onViewPublic,
              style: TextButton.styleFrom(padding: EdgeInsets.zero),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('View public page', style: TextStyle(fontSize: 13)),
                  SizedBox(width: 4),
                  Icon(Icons.open_in_new_rounded, size: 14),
                ],
              ),
            ),
          if (isPublic && !canMakePrivate && showUpgrade)
            TextButton(
              onPressed: onUpgrade,
              style: TextButton.styleFrom(
                foregroundColor: AppColors.textMuted,
                padding: EdgeInsets.zero,
              ),
              child: const Text(
                'Private books need Pro →',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w400),
              ),
            ),
        ],
      ),
    );
  }
}

/// How the book was written; folded away until tapped, as on phones on the
/// website.
class BookSettingsCard extends StatefulWidget {
  const BookSettingsCard({super.key, required this.rows});

  final List<(String, String)> rows;

  /// The website's rows, from the full book.
  static List<(String, String)> rowsFor(BookContent b) {
    final pov = BookOptions.povs[b.pov] ?? b.pov;
    final creativity = b.creativity;
    const levels = [
      (0.3, 'Precise'),
      (0.7, 'Balanced'),
      (1.0, 'Creative'),
      (1.3, 'Experimental'),
    ];
    String? level;
    if (creativity != null) {
      level = levels
          .reduce(
            (a, c) =>
                (c.$1 - creativity).abs() < (a.$1 - creativity).abs() ? c : a,
          )
          .$2;
    }
    const models = {
      'nemotron-3-super': 'Nemotron 3 Super 120B',
      'groq-llama-3.3': 'Super Fast',
      'deepseek-r1': 'DeepSeek R1',
      'qwen-32b': 'Qwen2.5 32B',
    };
    String on(bool? v) => v == null ? '—' : (v ? 'On' : 'Off');
    return [
      if (pov != null || b.tense != null)
        ('Voice', [pov, b.tense].whereType<String>().join(', ')),
      if (b.model != null) ('Model', models[b.model] ?? b.model!),
      if (level != null) ('Creativity', level),
      if (b.language != null)
        ('Language', BookOptions.languages[b.language] ?? b.language!),
      ('Audience', b.audience ?? '—'),
      ('Dialogue', on(b.includeDialogue)),
      ('Examples', on(b.includeExamples)),
    ];
  }

  @override
  State<BookSettingsCard> createState() => _BookSettingsCardState();
}

class _BookSettingsCardState extends State<BookSettingsCard> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    return StripeCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          InkWell(
            onTap: () => setState(() => _open = !_open),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
              child: Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Settings',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: _ink,
                      ),
                    ),
                  ),
                  AnimatedRotation(
                    turns: _open ? 0.5 : 0,
                    duration: const Duration(milliseconds: 200),
                    child: const Icon(Icons.expand_more_rounded, color: _faint),
                  ),
                ],
              ),
            ),
          ),
          AnimatedSize(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOut,
            alignment: Alignment.topCenter,
            child: !_open
                ? const SizedBox(width: double.infinity)
                : Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                    child: Column(
                      children: [
                        for (var i = 0; i < widget.rows.length; i++) ...[
                          if (i > 0) const Divider(height: 1, color: _hairline),
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            child: Row(
                              children: [
                                Text(
                                  widget.rows[i].$1,
                                  style: const TextStyle(
                                    fontSize: 13,
                                    color: AppColors.textMuted,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Text(
                                    widget.rows[i].$2,
                                    textAlign: TextAlign.right,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w500,
                                      color: _ink,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

// Illustrations ---------------------------------------------------------------------

/// Pictures for the book: offer to add them, show drawing progress, then
/// the chapter openers. Same API and states as the website panel.
class IllustrationsPanel extends StatefulWidget {
  const IllustrationsPanel({
    super.key,
    required this.bookId,
    required this.enabled,
    required this.generating,
    required this.onPicturesAdded,
  });

  final String bookId;
  final bool enabled;
  final bool generating;
  final VoidCallback onPicturesAdded;

  @override
  State<IllustrationsPanel> createState() => _IllustrationsPanelState();
}

class _IllustrationsPanelState extends State<IllustrationsPanel> {
  Map<String, dynamic>? _status;
  bool _starting = false;
  Timer? _timer;
  int? _placed;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  ApiClient get _api => context.read<ApiClient>();
  String get _path => '${ApiConfig.books}/${widget.bookId}/illustrations';

  int _n(String key) => (_status?[key] as num?)?.toInt() ?? 0;
  bool _b(String key) => _status?[key] == true;

  Future<void> _load() async {
    _timer?.cancel();
    try {
      final res = await _api.dio.get(_path);
      if (!mounted) return;
      final next = res.data as Map<String, dynamic>;
      final done = (next['chaptersDone'] as num?)?.toInt() ?? 0;
      if (_placed != null && done > _placed!) widget.onPicturesAdded();
      _placed = done;
      setState(() => _status = next);
      if (next['enabled'] == true &&
          (next['running'] == true ||
              next['actionable'] == true ||
              widget.generating)) {
        _timer = Timer(const Duration(seconds: 4), _load);
      }
    } catch (_) {}
  }

  Future<void> _start({bool retry = false}) async {
    setState(() => _starting = true);
    try {
      final res = await _api.dio.post(_path, data: {'retry': retry});
      if (!mounted) return;
      setState(() => _status = res.data as Map<String, dynamic>);
      unawaited(_load());
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(_api.extractError(e))));
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = _status;
    final on = status == null ? widget.enabled : _b('enabled');
    final ready = _n('ready');
    final total = _n('chaptersTotal');
    final done = _n('chaptersDone');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        PageSectionTitle(
          'Illustrations',
          trailing: on && ready > 0
              ? '$ready ${ready == 1 ? 'picture' : 'pictures'} · $done of $total'
              : null,
        ),
        if (status == null)
          Container(
            height: 96,
            decoration: BoxDecoration(
              color: _soft,
              borderRadius: BorderRadius.circular(16),
            ),
          )
        else if (!on)
          _offer()
        else
          _progress(total, done),
      ],
    );
  }

  Widget _offer() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: _soft,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 118,
            height: 84,
            child: Stack(
              children: [
                Positioned(
                  left: 0,
                  top: 16,
                  child: Transform.rotate(
                    angle: -0.1,
                    child: _swatch(82, 58, const [
                      Color(0xFF2B3D55),
                      Color(0xFFC9D3DD),
                    ]),
                  ),
                ),
                Positioned(
                  left: 30,
                  top: 0,
                  child: Transform.rotate(
                    angle: 0.07,
                    child: _swatch(86, 62, const [
                      Color(0xFF3A2A1C),
                      Color(0xFFE0A96D),
                    ]),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            'Add pictures to this book',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: _ink,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'A picture at the top of every chapter and at its key scenes, with '
            'characters that look the same throughout. Your text stays as it is.',
            style: TextStyle(
              fontSize: 13,
              height: 1.5,
              color: AppColors.textMuted,
            ),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _starting ? null : () => _start(),
            style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
            icon: _starting
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.add_photo_alternate_outlined, size: 18),
            label: const Text('Illustrate this book'),
          ),
        ],
      ),
    );
  }

  Widget _swatch(double w, double h, List<Color> colors) => Container(
    width: w,
    height: h,
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(6),
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: colors,
      ),
      boxShadow: const [
        BoxShadow(
          color: Color(0x33000000),
          blurRadius: 8,
          offset: Offset(0, 3),
        ),
      ],
    ),
  );

  Widget _progress(int total, int done) {
    final working = _b('running') || _b('actionable');
    final failed = _n('failed');
    final openers = ((_status?['openers'] as List?) ?? const [])
        .whereType<Map<String, dynamic>>()
        .take(6)
        .toList();
    const body = TextStyle(fontSize: 13, color: AppColors.textBody);
    Widget state;
    if (working || (widget.generating && done < total) || total == 0) {
      state = Column(
        children: [
          Row(
            children: [
              const SizedBox(
                width: 14,
                height: 14,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: AppColors.primary,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  working
                      ? 'Drawing pictures'
                            '${total > 0 ? ' for chapter ${math.min(done + 1, total)} of $total' : ''}'
                      : 'Pictures are added as each chapter is finished',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: _ink,
                  ),
                ),
              ),
              if (total > 0)
                Text(
                  '${(done / total * 100).round()}%',
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textMuted,
                    fontFeatures: _tabular,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(
              value: total > 0 ? done / total : 0,
              minHeight: 6,
            ),
          ),
        ],
      );
    } else if (failed > 0) {
      state = Row(
        children: [
          Expanded(
            child: Text(
              "$failed ${failed == 1 ? 'picture' : 'pictures'} couldn't be drawn.",
              style: body,
            ),
          ),
          OutlinedButton.icon(
            onPressed: _starting ? null : () => _start(retry: true),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size(0, 36),
              side: BorderSide.none,
              backgroundColor: _soft,
            ),
            icon: const Icon(Icons.replay_rounded, size: 16),
            label: const Text('Try again', style: TextStyle(fontSize: 12)),
          ),
        ],
      );
    } else {
      state = const Text('Every chapter has its pictures.', style: body);
    }
    return StripeCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          state,
          if (openers.isNotEmpty) ...[
            const SizedBox(height: 16),
            GridView.count(
              crossAxisCount: 3,
              crossAxisSpacing: 8,
              mainAxisSpacing: 8,
              childAspectRatio: 3 / 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              children: [
                for (final o in openers)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        CachedNetworkImage(
                          imageUrl: resolveImageUrl('${o['imageUrl']}'),
                          fit: BoxFit.cover,
                          placeholder: (_, _) =>
                              const ColoredBox(color: Color(0xFFEEF2F7)),
                          errorWidget: (_, _, _) =>
                              const ColoredBox(color: Color(0xFFEEF2F7)),
                        ),
                        Positioned(
                          left: 4,
                          bottom: 4,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 1,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.black.withValues(alpha: 0.55),
                              borderRadius: BorderRadius.circular(99),
                            ),
                            child: Text(
                              '${o['number']}',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
