import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/book_cover_3d.dart';

/// A cover to show beside a [CoverHero].
typedef HeroCover = ({String title, String? coverImage, String? slug});

/// "Good morning", "Good afternoon" or "Good evening", by the clock.
String greetingNow() {
  final hour = DateTime.now().hour;
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/// Home's header: a small line, a big serif title and a sentence, with a
/// few books floating beside them. Sign-in and sign-up use it too.
class CoverHero extends StatefulWidget {
  const CoverHero({
    super.key,
    required this.eyebrow,
    required this.title,
    required this.subtitle,
    required this.covers,
    this.titleLines = 1,
  });

  final String eyebrow;
  final String title;
  final String subtitle;
  final List<HeroCover> covers;
  final int titleLines;

  @override
  State<CoverHero> createState() => _CoverHeroState();
}

class _CoverHeroState extends State<CoverHero>
    with SingleTickerProviderStateMixin {
  late final _float = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 3800),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (AppMotion.reduced(context)) {
      _float.value = 0.5;
    } else if (!_float.isAnimating) {
      _float.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _float.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const placeholders = <HeroCover>[
      (title: 'Your next story', coverImage: null, slug: null),
      (title: 'Once upon a time', coverImage: null, slug: null),
      (title: 'Chapter one', coverImage: null, slug: null),
    ];
    final covers = [...widget.covers, ...placeholders].take(3).toList();

    // At least as tall as the books; taller only if the copy wraps.
    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 172),
      child: Stack(
        alignment: AlignmentDirectional.centerStart,
        children: [
          Positioned(
            right: -4,
            top: 0,
            bottom: 0,
            width: 150,
            child: AnimatedBuilder(
              animation: _float,
              builder: (_, _) =>
                  _bookStack(covers, Curves.easeInOut.transform(_float.value)),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(right: 150),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.eyebrow,
                  style: const TextStyle(
                    color: AppColors.textMuted,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  widget.title,
                  maxLines: widget.titleLines,
                  overflow: TextOverflow.ellipsis,
                  style: AppType.display(size: 40),
                ),
                const SizedBox(height: 8),
                Text(
                  widget.subtitle,
                  style: const TextStyle(
                    color: AppColors.textBody,
                    fontSize: 15,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _bookStack(List<HeroCover> covers, double t) {
    // Back left, back right, then the biggest one in front.
    final layout = [
      (left: 4.0, top: 48.0, width: 58.0, angle: -0.18, bob: -5 * t),
      (left: 78.0, top: 52.0, width: 56.0, angle: 0.16, bob: 5 * (1 - t)),
      (left: 34.0, top: 24.0, width: 72.0, angle: -0.03, bob: 7 * t - 3),
    ];
    return Stack(
      clipBehavior: Clip.none,
      children: [
        for (var i = 0; i < covers.length && i < layout.length; i++)
          Positioned(
            left: layout[i].left,
            top: layout[i].top + layout[i].bob,
            child: Transform.rotate(
              angle: layout[i].angle + 0.02 * math.sin(t * math.pi),
              child: BookCover3D(
                title: covers[i].title,
                coverImage: covers[i].coverImage,
                slug: covers[i].slug,
                width: layout[i].width,
                ribbon: i == 2,
              ),
            ),
          ),
      ],
    );
  }
}
