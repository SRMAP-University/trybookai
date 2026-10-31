import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:bookai_mobile/providers/public_books_provider.dart';
import 'package:bookai_mobile/screens/home/home_stats.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/bookai_logo.dart';
import 'package:bookai_mobile/widgets/cover_hero.dart';

/// Sign-in and sign-up, laid out like Home: the logo on Home's navy strip,
/// and the form on a white sheet below it.
class AuthScaffold extends StatefulWidget {
  const AuthScaffold({super.key, required this.child, this.onBack});

  final Widget child;

  /// Shows a back button before the logo.
  final VoidCallback? onBack;

  @override
  State<AuthScaffold> createState() => _AuthScaffoldState();
}

class _AuthScaffoldState extends State<AuthScaffold>
    with SingleTickerProviderStateMixin {
  late final AnimationController _motion = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..forward();

  late final Animation<double> _fade = CurvedAnimation(
    parent: _motion,
    curve: const Interval(0, 0.55, curve: Curves.easeOut),
  );
  late final Animation<Offset> _slide =
      Tween<Offset>(begin: const Offset(0, 0.04), end: Offset.zero).animate(
        CurvedAnimation(
          parent: _motion,
          curve: const Interval(0.1, 0.75, curve: Curves.easeOutCubic),
        ),
      );

  @override
  void dispose() {
    _motion.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const dock = DockTheme.navy;
    final onBack = widget.onBack;
    return AnnotatedRegion(
      value: dock.overlay,
      child: Scaffold(
        backgroundColor: dock.base,
        body: Padding(
          padding: EdgeInsets.only(top: MediaQuery.paddingOf(context).top),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                height: homePeekHeight,
                child: Padding(
                  padding: EdgeInsets.only(left: onBack == null ? 20 : 12),
                  child: Row(
                    children: [
                      if (onBack != null) ...[
                        IconButton(
                          tooltip: 'Back',
                          onPressed: onBack,
                          style: IconButton.styleFrom(
                            backgroundColor: dock.wash,
                            foregroundColor: dock.ink,
                            fixedSize: const Size(40, 40),
                          ),
                          icon: const Icon(Icons.arrow_back_rounded, size: 20),
                        ),
                        const SizedBox(width: 12),
                      ],
                      BookAiLogo(height: 24, color: dock.ink),
                    ],
                  ),
                ),
              ),
              Expanded(
                child: ClipRRect(
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(24),
                  ),
                  child: ColoredBox(
                    color: AppColors.white,
                    child: SafeArea(
                      top: false,
                      child: FadeTransition(
                        opacity: _fade,
                        child: SlideTransition(
                          position: _slide,
                          child: widget.child,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The top of the sheet, in Home's style, with books from Discover floating
/// beside it.
class AuthHero extends StatefulWidget {
  const AuthHero({
    super.key,
    this.eyebrow,
    required this.title,
    required this.subtitle,
  });

  /// Defaults to "Good morning" and so on, like Home.
  final String? eyebrow;
  final String title;
  final String subtitle;

  @override
  State<AuthHero> createState() => _AuthHeroState();
}

class _AuthHeroState extends State<AuthHero> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final pub = context.read<PublicBooksProvider>();
      if (pub.books.isEmpty && !pub.loading) pub.load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final pub = context.watch<PublicBooksProvider>();
    return CoverHero(
      eyebrow: widget.eyebrow ?? greetingNow(),
      title: widget.title,
      subtitle: widget.subtitle,
      titleLines: 2,
      covers: [
        for (final b in pub.books.where((b) => b.coverImage != null).take(3))
          (title: b.title, coverImage: b.coverImage, slug: b.slug),
      ],
    );
  }
}

class AuthPasswordField extends StatefulWidget {
  const AuthPasswordField({
    super.key,
    required this.controller,
    this.label = 'Password',
    this.validator,
  });

  final TextEditingController controller;
  final String label;
  final String? Function(String?)? validator;

  @override
  State<AuthPasswordField> createState() => _AuthPasswordFieldState();
}

class _AuthPasswordFieldState extends State<AuthPasswordField> {
  bool _obscure = true;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: widget.controller,
      obscureText: _obscure,
      autofillHints: const [AutofillHints.password],
      decoration: InputDecoration(
        labelText: widget.label,
        suffixIcon: IconButton(
          onPressed: () => setState(() => _obscure = !_obscure),
          icon: Icon(
            _obscure
                ? Icons.visibility_outlined
                : Icons.visibility_off_outlined,
            size: 20,
            color: AppColors.textMuted,
          ),
        ),
      ),
      validator: widget.validator,
    );
  }
}
