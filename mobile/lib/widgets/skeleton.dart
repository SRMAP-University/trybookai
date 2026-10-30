/// Skeleton loading: grey shapes laid out like the content that's coming,
/// with a soft shimmer sweeping across (a gentle pulse on dark backgrounds).
/// Motion stops when the system asks for reduced motion, and screen readers
/// hear "Loading" instead of the shapes.
library;

import 'package:flutter/material.dart';
import 'package:bookai_mobile/theme/app_theme.dart';

const _bone = Color(0xFFEEF2F7);
const _shine = Color(0xFFF8FAFC);
const _darkBone = Color(0x24FFFFFF);
const _coverRadius = BorderRadius.only(
  topLeft: Radius.circular(4),
  bottomLeft: Radius.circular(4),
  topRight: Radius.circular(9),
  bottomRight: Radius.circular(9),
);

/// Shimmers every [Bone] inside it.
class Skeleton extends StatefulWidget {
  const Skeleton({super.key, required this.child, this.dark = false});

  final Widget child;

  /// On a dark background: pulse instead of a light sweep.
  final bool dark;

  @override
  State<Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<Skeleton>
    with SingleTickerProviderStateMixin {
  late final _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1500),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (AppMotion.reduced(context)) {
      _c.stop();
      _c.value = 0.5;
    } else if (!_c.isAnimating) {
      _c.repeat();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final Widget body;
    if (widget.dark) {
      body = FadeTransition(
        opacity: TweenSequence([
          TweenSequenceItem(tween: Tween(begin: 0.55, end: 1.0), weight: 1),
          TweenSequenceItem(tween: Tween(begin: 1.0, end: 0.55), weight: 1),
        ]).animate(_c),
        child: widget.child,
      );
    } else {
      body = AnimatedBuilder(
        animation: _c,
        child: widget.child,
        builder: (_, child) => ShaderMask(
          blendMode: BlendMode.srcATop,
          shaderCallback: (rect) => LinearGradient(
            colors: const [_bone, _shine, _bone],
            stops: const [0.35, 0.5, 0.65],
            transform: _Slide(_c.value),
          ).createShader(rect),
          child: child,
        ),
      );
    }
    return Semantics(label: 'Loading', child: ExcludeSemantics(child: body));
  }
}

class _Slide extends GradientTransform {
  const _Slide(this.t);
  final double t;

  @override
  Matrix4 transform(Rect bounds, {TextDirection? textDirection}) =>
      Matrix4.translationValues(bounds.width * (2 * t - 1), 0, 0);
}

/// One grey shape.
class Bone extends StatelessWidget {
  const Bone({
    super.key,
    this.width,
    required this.height,
    this.radius = 8,
    this.dark = false,
    this.circle = false,
  });

  final double? width;
  final double height;
  final double radius;
  final bool dark;
  final bool circle;

  /// Shaped like a book cover of width [w].
  static Widget cover(double w, {bool dark = false}) => Container(
    width: w,
    height: w * 1.45,
    decoration: BoxDecoration(
      color: dark ? _darkBone : _bone,
      borderRadius: _coverRadius,
    ),
  );

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: dark ? _darkBone : _bone,
        shape: circle ? BoxShape.circle : BoxShape.rectangle,
        borderRadius: circle ? null : BorderRadius.circular(radius),
      ),
    );
  }
}

/// A row of covers, as on Home's shelves.
class ShelfSkeleton extends StatelessWidget {
  const ShelfSkeleton({super.key, this.coverWidth = 118, this.count = 4});

  final double coverWidth;
  final int count;

  @override
  Widget build(BuildContext context) {
    final height = coverWidth * 1.45;
    return Skeleton(
      child: SizedBox(
        height: height * 1.07 + coverWidth * 0.035 + 16,
        child: ClipRect(
          child: OverflowBox(
            alignment: Alignment.topLeft,
            maxWidth: double.infinity,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (var i = 0; i < count; i++) ...[
                  if (i > 0) const SizedBox(width: 18),
                  Bone.cover(coverWidth),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Home's Continue reading row.
class ContinueRowSkeleton extends StatelessWidget {
  const ContinueRowSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Skeleton(
      child: Row(
        children: [
          Bone.cover(34),
          const SizedBox(width: 12),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Bone(width: 150, height: 14, radius: 4),
                SizedBox(height: 6),
                Bone(width: 190, height: 11, radius: 4),
                SizedBox(height: 9),
                Bone(height: 3, radius: 99),
              ],
            ),
          ),
          const SizedBox(width: 12),
          const Bone(width: 36, height: 36, circle: true),
        ],
      ),
    );
  }
}

/// A two-column grid of covers with a title and a caption line, matching
/// the Books and Discover grids.
class BookGridSkeleton extends StatelessWidget {
  const BookGridSkeleton({
    super.key,
    this.horizontalPadding = 20,
    this.extraHeight = 70,
    this.count = 6,
  });

  final double horizontalPadding;
  final double extraHeight;
  final int count;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        const gap = 18.0;
        final cell = (constraints.maxWidth - horizontalPadding * 2 - gap) / 2;
        final cover = cell - 10;
        return Skeleton(
          child: GridView.builder(
            physics: const NeverScrollableScrollPhysics(),
            padding: EdgeInsets.fromLTRB(
              horizontalPadding,
              8,
              horizontalPadding,
              24,
            ),
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: gap,
              mainAxisSpacing: 22,
              mainAxisExtent: cover * 1.6 + extraHeight,
            ),
            itemCount: count,
            itemBuilder: (_, _) => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Bone.cover(cover),
                const SizedBox(height: 12),
                Bone(width: cover * 0.8, height: 14, radius: 4),
                const SizedBox(height: 6),
                Bone(width: cover * 0.5, height: 11, radius: 4),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// Chapter rows: number, title, state icon.
class ChapterRowsSkeleton extends StatelessWidget {
  const ChapterRowsSkeleton({super.key, this.count = 6});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Skeleton(
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.navy.withValues(alpha: 0.05)),
        ),
        child: Column(
          children: [
            for (var i = 0; i < count; i++) ...[
              if (i > 0) const Divider(height: 1, color: Color(0xFFF0F2F6)),
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 16,
                ),
                child: Row(
                  children: [
                    const Bone(width: 18, height: 10, radius: 3),
                    const SizedBox(width: 16),
                    Expanded(
                      child: FractionallySizedBox(
                        alignment: Alignment.centerLeft,
                        widthFactor: 0.45 + (i * 37 % 40) / 100,
                        child: const Bone(height: 12, radius: 4),
                      ),
                    ),
                    const SizedBox(width: 16),
                    const Bone(width: 16, height: 16, circle: true),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Your book's page while it loads: the dark hero, stats and chapters.
class BookPageSkeleton extends StatelessWidget {
  const BookPageSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;
    return ListView(
      padding: EdgeInsets.zero,
      physics: const NeverScrollableScrollPhysics(),
      children: [
        Container(
          color: AppColors.navy,
          padding: EdgeInsets.fromLTRB(20, top + 40, 20, 32),
          child: Skeleton(
            dark: true,
            child: Column(
              children: [
                Bone.cover(150, dark: true),
                const SizedBox(height: 24),
                const Bone(width: 130, height: 24, radius: 99, dark: true),
                const SizedBox(height: 14),
                const Bone(width: 230, height: 32, radius: 6, dark: true),
                const SizedBox(height: 10),
                const Bone(width: 140, height: 13, radius: 4, dark: true),
                const SizedBox(height: 24),
                const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Bone(width: 130, height: 40, radius: 99, dark: true),
                    SizedBox(width: 8),
                    Bone(width: 96, height: 40, radius: 99, dark: true),
                    SizedBox(width: 8),
                    Bone(width: 40, height: 40, circle: true, dark: true),
                  ],
                ),
              ],
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Skeleton(
                child: Row(
                  children: [
                    for (var i = 0; i < 4; i++) ...[
                      if (i > 0) const SizedBox(width: 8),
                      const Expanded(child: Bone(height: 58, radius: 16)),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 32),
              const Skeleton(child: Bone(width: 96, height: 16, radius: 4)),
              const SizedBox(height: 14),
              const ChapterRowsSkeleton(count: 5),
            ],
          ),
        ),
      ],
    );
  }
}

/// A public book's page while it loads: cover beside the title, a few
/// lines of description, then chapter cards.
class PublicBookSkeleton extends StatelessWidget {
  const PublicBookSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Skeleton(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        physics: const NeverScrollableScrollPhysics(),
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Bone.cover(110),
              const SizedBox(width: 16),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(height: 6),
                    Bone(height: 20, radius: 4),
                    SizedBox(height: 8),
                    Bone(width: 120, height: 20, radius: 4),
                    SizedBox(height: 14),
                    Bone(width: 100, height: 12, radius: 4),
                    SizedBox(height: 8),
                    Bone(width: 140, height: 12, radius: 4),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          for (final f in const [1.0, 0.95, 0.7]) ...[
            FractionallySizedBox(
              alignment: Alignment.centerLeft,
              widthFactor: f,
              child: const Bone(height: 12, radius: 4),
            ),
            const SizedBox(height: 8),
          ],
          const SizedBox(height: 24),
          const Bone(width: 90, height: 16, radius: 4),
          const SizedBox(height: 12),
          for (var i = 0; i < 4; i++) ...[
            const Bone(height: 64, radius: 16),
            const SizedBox(height: 10),
          ],
        ],
      ),
    );
  }
}

/// A form while its values load: label and field, repeated.
class FormSkeleton extends StatelessWidget {
  const FormSkeleton({super.key, this.fields = 5});

  final int fields;

  @override
  Widget build(BuildContext context) {
    return Skeleton(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        physics: const NeverScrollableScrollPhysics(),
        children: [
          for (var i = 0; i < fields; i++) ...[
            Bone(width: 80 + (i * 29 % 60).toDouble(), height: 12, radius: 4),
            const SizedBox(height: 8),
            const Bone(height: 48, radius: 12),
            const SizedBox(height: 20),
          ],
        ],
      ),
    );
  }
}
