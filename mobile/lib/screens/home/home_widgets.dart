import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:bookai_mobile/models/models.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/book_cover_3d.dart';

/// A cover to show in the Home header.
typedef HeroCover = ({String title, String? coverImage, String? slug});

/// Fades and slides its child up once, after [delay].
class Reveal extends StatefulWidget {
  const Reveal({super.key, required this.child, this.delay = Duration.zero});

  final Widget child;
  final Duration delay;

  @override
  State<Reveal> createState() => _RevealState();
}

class _RevealState extends State<Reveal> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: AppMotion.enter);
  late final _curve = CurvedAnimation(parent: _c, curve: AppMotion.enterCurve);
  Timer? _timer;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_timer != null || _c.isCompleted) return;
    if (AppMotion.reduced(context)) {
      _c.value = 1;
      return;
    }
    _timer = Timer(widget.delay, () {
      if (mounted) _c.forward();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _curve,
      child: AnimatedBuilder(
        animation: _curve,
        builder: (_, child) => Transform.translate(
          offset: Offset(0, 16 * (1 - _curve.value)),
          child: child,
        ),
        child: widget.child,
      ),
    );
  }
}

/// Shrinks a little while pressed.
class Pressable extends StatefulWidget {
  const Pressable({super.key, required this.child, required this.onTap});

  final Widget child;
  final VoidCallback onTap;

  @override
  State<Pressable> createState() => _PressableState();
}

class _PressableState extends State<Pressable> {
  bool _down = false;

  void _set(bool down) {
    if (_down != down) setState(() => _down = down);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) => _set(true),
      onTapUp: (_) => _set(false),
      onTapCancel: () => _set(false),
      onTap: widget.onTap,
      child: AnimatedScale(
        scale: _down ? 0.97 : 1,
        duration: AppMotion.quick,
        curve: Curves.easeOut,
        child: widget.child,
      ),
    );
  }
}

/// A thin progress bar that animates to each new value.
class AnimatedBar extends StatelessWidget {
  const AnimatedBar({super.key, required this.value, this.height = 4});

  final double value;
  final double height;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: value.clamp(0, 1)),
      duration: const Duration(milliseconds: 900),
      curve: Curves.easeOutCubic,
      builder: (_, v, _) => ClipRRect(
        borderRadius: BorderRadius.circular(99),
        child: LinearProgressIndicator(
          value: v,
          minHeight: height,
          color: AppColors.primary,
          backgroundColor: AppColors.mutedBg,
        ),
      ),
    );
  }
}

/// Section title used on Home.
class HomeHeading extends StatelessWidget {
  const HomeHeading(this.title, {super.key, this.action});

  final String title;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w700,
              color: AppColors.navy,
              letterSpacing: -0.3,
            ),
          ),
        ),
        ?action,
      ],
    );
  }
}

/// A quiet text button for section actions ("View all", "Shuffle").
class HomeLink extends StatelessWidget {
  const HomeLink(this.label, {super.key, required this.onTap, this.icon});

  final String label;
  final VoidCallback onTap;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: onTap,
      style: TextButton.styleFrom(
        foregroundColor: AppColors.primaryText,
        minimumSize: const Size(48, 48),
        padding: const EdgeInsets.symmetric(horizontal: 10),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 16), const SizedBox(width: 4)],
          Text(
            label,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

/// Greeting with a few books floating beside it. Starting a book lives in
/// the floating New book button, so this stays quiet.
class HomeHero extends StatefulWidget {
  const HomeHero({super.key, required this.name, required this.covers});

  final String? name;
  final List<HeroCover> covers;

  @override
  State<HomeHero> createState() => _HomeHeroState();
}

class _HomeHeroState extends State<HomeHero>
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

  String get _greeting {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  @override
  Widget build(BuildContext context) {
    const placeholders = <HeroCover>[
      (title: 'Your next story', coverImage: null, slug: null),
      (title: 'Once upon a time', coverImage: null, slug: null),
      (title: 'Chapter one', coverImage: null, slug: null),
    ];
    final covers = [...widget.covers, ...placeholders].take(3).toList();

    return SizedBox(
      height: 172,
      child: Stack(
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
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  _greeting,
                  style: const TextStyle(
                    color: AppColors.textMuted,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  widget.name ?? 'Writer',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppType.display(size: 40),
                ),
                const SizedBox(height: 8),
                const Text(
                  'What story will you write today?',
                  style: TextStyle(
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
        // Soft floor shadow that breathes as the books float.
        Positioned(
          left: 18,
          right: 4,
          bottom: 14,
          height: 14,
          child: Transform.scale(
            scaleX: 0.9 + 0.08 * (1 - t),
            child: DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(99),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.navy.withValues(alpha: 0.10 + 0.04 * t),
                    blurRadius: 16,
                  ),
                ],
              ),
            ),
          ),
        ),
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

/// Reopens the reader where you left off.
class ContinueReadingRow extends StatelessWidget {
  const ContinueReadingRow({
    super.key,
    required this.book,
    required this.label,
    required this.detail,
    required this.progress,
    required this.onTap,
  });

  final BookModel book;
  final String label;
  final String detail;
  final double progress;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Pressable(
      onTap: onTap,
      child: Row(
        children: [
          BookCover3D(
            title: book.title,
            coverImage: book.coverImage,
            slug: book.slug,
            width: 34,
            ribbon: false,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  book.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: AppColors.navy,
                  ),
                ),
                const SizedBox(height: 1),
                Text(
                  '$label · $detail',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12.5,
                    color: AppColors.textMuted,
                  ),
                ),
                const SizedBox(height: 6),
                AnimatedBar(value: progress, height: 3),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Container(
            width: 36,
            height: 36,
            decoration: const BoxDecoration(
              color: AppColors.navy,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.play_arrow_rounded,
              color: Colors.white,
              size: 22,
            ),
          ),
        ],
      ),
    );
  }
}

/// A dot with a ring that keeps pulsing outwards.
class PulseDot extends StatefulWidget {
  const PulseDot({super.key, this.color = AppColors.primary, this.size = 7});

  final Color color;
  final double size;

  @override
  State<PulseDot> createState() => _PulseDotState();
}

class _PulseDotState extends State<PulseDot>
    with SingleTickerProviderStateMixin {
  late final _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1300),
  )..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.size;
    return SizedBox(
      width: s * 2.4,
      height: s * 2.4,
      child: AnimatedBuilder(
        animation: _c,
        builder: (_, _) => Stack(
          alignment: Alignment.center,
          children: [
            Container(
              width: s * (1 + 1.4 * _c.value),
              height: s * (1 + 1.4 * _c.value),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: widget.color.withValues(alpha: 0.35 * (1 - _c.value)),
              ),
            ),
            Container(
              width: s,
              height: s,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: widget.color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A book being written right now, with live progress.
class WritingNowRow extends StatelessWidget {
  const WritingNowRow({super.key, required this.book, required this.onTap});

  final BookModel book;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Pressable(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          children: [
            BookCover3D(
              title: book.title,
              coverImage: book.coverImage,
              slug: book.slug,
              width: 44,
              ribbon: false,
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const PulseDot(),
                      const SizedBox(width: 2),
                      Text(
                        book.status == 'OUTLINING'
                            ? 'Planning chapters'
                            : 'Writing now',
                        style: const TextStyle(
                          color: AppColors.textMuted,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const Spacer(),
                      Text(
                        '${book.progress.round()}%',
                        style: const TextStyle(
                          color: AppColors.navy,
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                  Text(
                    book.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: AppColors.navy,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${book.currentPages} of ${book.targetPages} pages',
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textMuted,
                    ),
                  ),
                  const SizedBox(height: 8),
                  AnimatedBar(value: book.progress / 100),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A ready-made book idea that fills in the new-book form.
typedef BookIdea = ({String genre, String title, String pitch});

const bookIdeas = <BookIdea>[
  (
    genre: 'Mystery',
    title: 'The Lighthouse Letters',
    pitch:
        'A bookseller finds unsent letters hidden inside old novels and follows them to a lighthouse keeper who vanished thirty years ago.',
  ),
  (
    genre: 'Self-Help',
    title: 'Small Habits, Big Days',
    pitch:
        'A friendly, practical guide to building daily routines that actually stick, with one small exercise per chapter.',
  ),
  (
    genre: 'Fantasy',
    title: "The Cartographer's Daughter",
    pitch:
        'A girl who can redraw maps discovers that every line she changes reshapes the real world, and someone wants her pen.',
  ),
  (
    genre: 'Business',
    title: 'From Side Project to Startup',
    pitch:
        'A step-by-step playbook for turning a weekend idea into a real company: validation, first customers, pricing and hiring.',
  ),
  (
    genre: "Children's",
    title: 'Milo and the Moon Kite',
    pitch:
        'A small boy builds a kite strong enough to visit the moon, and learns that the best adventures are shared.',
  ),
  (
    genre: 'Science Fiction',
    title: 'Last Signal from Europa',
    pitch:
        'A lone engineer on an ice station decodes a message rising from the ocean beneath the ice, and it knows her name.',
  ),
  (
    genre: 'Romance',
    title: 'Monsoon at the Bookshop',
    pitch:
        'Two rival booksellers on the same Mumbai street are forced to share one shop for a rainy season.',
  ),
  (
    genre: 'History',
    title: 'The Silk Road in Ten Objects',
    pitch:
        'The story of the trade routes that connected East and West, told through ten things people carried along them.',
  ),
  (
    genre: 'Health & Wellness',
    title: 'Sleep Like You Mean It',
    pitch:
        'What the research says about better sleep, turned into a simple four-week plan anyone can follow.',
  ),
];

/// Three ideas at a time, with a shuffle that cross-fades to the next three.
class IdeaList extends StatefulWidget {
  const IdeaList({super.key, required this.onPick});

  final ValueChanged<BookIdea> onPick;

  @override
  State<IdeaList> createState() => _IdeaListState();
}

class _IdeaListState extends State<IdeaList> {
  static const _perPage = 3;
  int _start = 0;

  void _shuffle() {
    setState(() => _start = (_start + _perPage) % bookIdeas.length);
  }

  @override
  Widget build(BuildContext context) {
    final ideas = [
      for (var i = 0; i < _perPage; i++)
        bookIdeas[(_start + i) % bookIdeas.length],
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        HomeHeading(
          'Start from an idea',
          action: HomeLink(
            'Shuffle',
            icon: Icons.shuffle_rounded,
            onTap: _shuffle,
          ),
        ),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 380),
          switchInCurve: Curves.easeOutCubic,
          switchOutCurve: Curves.easeInCubic,
          transitionBuilder: (child, animation) => FadeTransition(
            opacity: animation,
            child: SlideTransition(
              position: Tween(
                begin: const Offset(0.06, 0),
                end: Offset.zero,
              ).animate(animation),
              child: child,
            ),
          ),
          layoutBuilder: (current, previous) => Stack(
            alignment: Alignment.topCenter,
            children: [...previous, ?current],
          ),
          child: Column(
            key: ValueKey(_start),
            children: [
              for (var i = 0; i < ideas.length; i++) ...[
                if (i > 0) const Divider(height: 1, color: AppColors.border),
                _row(ideas[i]),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _row(BookIdea idea) {
    return Pressable(
      onTap: () => widget.onPick(idea),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    idea.genre.toUpperCase(),
                    style: const TextStyle(
                      fontSize: 10.5,
                      letterSpacing: 1,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textMuted,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    idea.title,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: AppColors.navy,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    idea.pitch,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 13,
                      height: 1.4,
                      color: AppColors.textMuted,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            const Icon(
              Icons.arrow_forward_rounded,
              size: 20,
              color: AppColors.textMuted,
            ),
          ],
        ),
      ),
    );
  }
}
