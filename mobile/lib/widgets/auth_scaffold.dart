import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/bookai_logo.dart';

/// Shared shell for sign-in and sign-up: a brand panel over a form sheet.
class AuthScaffold extends StatefulWidget {
  const AuthScaffold({
    super.key,
    required this.child,
    this.leading,
    this.brandLine = 'Your book, written in one workspace.',
  });

  final Widget child;
  final Widget? leading;
  final String brandLine;

  @override
  State<AuthScaffold> createState() => _AuthScaffoldState();
}

class _AuthScaffoldState extends State<AuthScaffold>
    with SingleTickerProviderStateMixin {
  late final AnimationController _motion = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 700),
  )..forward();

  late final Animation<double> _fade = CurvedAnimation(
    parent: _motion,
    curve: Curves.easeOut,
  );
  late final Animation<Offset> _slide = Tween<Offset>(
    begin: const Offset(0, 0.06),
    end: Offset.zero,
  ).animate(
    CurvedAnimation(parent: _motion, curve: Curves.easeOutCubic),
  );

  @override
  void dispose() {
    _motion.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final keyboardOpen = MediaQuery.viewInsetsOf(context).bottom > 0;

    return Scaffold(
      backgroundColor: const Color(0xFF4338CA),
      resizeToAvoidBottomInset: true,
      body: Stack(
        children: [
          const Positioned.fill(child: _AuthBackdrop()),
          SafeArea(
            bottom: false,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                AnimatedSize(
                  duration: const Duration(milliseconds: 180),
                  curve: Curves.easeOut,
                  alignment: Alignment.topCenter,
                  child: _BrandHeader(
                    leading: widget.leading,
                    line: widget.brandLine,
                    compact: keyboardOpen,
                  ),
                ),
                Expanded(
                  child: FadeTransition(
                    opacity: _fade,
                    child: SlideTransition(
                      position: _slide,
                      child: _FormSheet(child: widget.child),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _FormSheet extends StatelessWidget {
  const _FormSheet({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        boxShadow: [
          BoxShadow(
            color: Color(0x330A2540),
            blurRadius: 28,
            offset: Offset(0, -10),
          ),
        ],
      ),
      child: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: child,
        ),
      ),
    );
  }
}

class AuthHero extends StatelessWidget {
  const AuthHero({
    super.key,
    required this.headline,
    this.subtitle,
  });

  final String headline;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          headline,
          style: GoogleFonts.fraunces(
            fontSize: 30,
            height: 1.15,
            fontWeight: FontWeight.w600,
            letterSpacing: -0.6,
            color: AppColors.navy,
          ),
        ),
        if (subtitle != null) ...[
          const SizedBox(height: 8),
          Text(
            subtitle!,
            style: const TextStyle(
              fontSize: 15,
              height: 1.4,
              color: AppColors.textBody,
            ),
          ),
        ],
      ],
    );
  }
}

class AuthLabeledField extends StatelessWidget {
  const AuthLabeledField({
    super.key,
    required this.label,
    required this.child,
  });

  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: AppColors.navy,
          ),
        ),
        const SizedBox(height: 8),
        child,
      ],
    );
  }
}

InputDecoration authInputDecoration({
  String? hintText,
  Widget? suffixIcon,
}) {
  const radius = BorderRadius.all(Radius.circular(12));
  const enabled = OutlineInputBorder(
    borderRadius: radius,
    borderSide: BorderSide(color: AppColors.border),
  );
  return InputDecoration(
    hintText: hintText,
    suffixIcon: suffixIcon,
    filled: true,
    fillColor: const Color(0xFFF6F9FC),
    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
    border: enabled,
    enabledBorder: enabled,
    focusedBorder: const OutlineInputBorder(
      borderRadius: radius,
      borderSide: BorderSide(color: AppColors.primary, width: 1.5),
    ),
    errorBorder: const OutlineInputBorder(
      borderRadius: radius,
      borderSide: BorderSide(color: AppColors.destructive),
    ),
    focusedErrorBorder: const OutlineInputBorder(
      borderRadius: radius,
      borderSide: BorderSide(color: AppColors.destructive, width: 1.5),
    ),
  );
}

class AuthPasswordField extends StatefulWidget {
  const AuthPasswordField({
    super.key,
    required this.controller,
    this.label = 'Password',
    this.hint = 'At least 8 characters',
    this.validator,
    this.onSubmitted,
  });

  final TextEditingController controller;
  final String label;
  final String hint;
  final String? Function(String?)? validator;
  final ValueChanged<String>? onSubmitted;

  @override
  State<AuthPasswordField> createState() => _AuthPasswordFieldState();
}

class _AuthPasswordFieldState extends State<AuthPasswordField> {
  bool _obscure = true;

  @override
  Widget build(BuildContext context) {
    return AuthLabeledField(
      label: widget.label,
      child: TextFormField(
        controller: widget.controller,
        obscureText: _obscure,
        autofillHints: const [AutofillHints.password],
        textInputAction: TextInputAction.done,
        onFieldSubmitted: widget.onSubmitted,
        decoration: authInputDecoration(
          hintText: widget.hint,
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
      ),
    );
  }
}

class AuthPrimaryButton extends StatelessWidget {
  const AuthPrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.loading = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: loading ? null : onPressed,
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      child: loading
          ? const SizedBox(
              height: 20,
              width: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Colors.white,
              ),
            )
          : Text(label),
    );
  }
}

class _BrandHeader extends StatelessWidget {
  const _BrandHeader({
    required this.line,
    required this.compact,
    this.leading,
  });

  final String line;
  final bool compact;
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(8, 4, 20, compact ? 12 : 22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (leading != null)
                IconTheme(
                  data: const IconThemeData(color: Colors.white),
                  child: leading!,
                )
              else
                const SizedBox(width: 12),
              const BookAiLogo(height: 28, foreground: Colors.white),
            ],
          ),
          if (!compact) ...[
            const SizedBox(height: 18),
            Padding(
              padding: EdgeInsets.only(
                left: leading != null ? 48 : 12,
                right: 8,
              ),
              child: Text(
                line,
                style: GoogleFonts.fraunces(
                  fontSize: 26,
                  height: 1.15,
                  fontWeight: FontWeight.w600,
                  letterSpacing: -0.4,
                  color: Colors.white,
                ),
              ),
            ),
            const SizedBox(height: 14),
            Padding(
              padding: EdgeInsets.only(left: leading != null ? 48 : 12),
              child: const _FeatureRow(),
            ),
          ],
        ],
      ),
    );
  }
}

class _FeatureRow extends StatelessWidget {
  const _FeatureRow();

  static const _items = <(IconData, String)>[
    (Icons.account_tree_outlined, 'Outline'),
    (Icons.auto_awesome_outlined, 'Generate'),
    (Icons.ios_share_outlined, 'Export'),
  ];

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final item in _items)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.16),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(item.$1, size: 14, color: Colors.white),
                const SizedBox(width: 6),
                Text(
                  item.$2,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _AuthBackdrop extends StatelessWidget {
  const _AuthBackdrop();

  @override
  Widget build(BuildContext context) {
    return const DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF7C75FF),
            Color(0xFF635BFF),
            Color(0xFF4338CA),
          ],
          stops: [0, 0.42, 1],
        ),
      ),
      child: Stack(
        children: [
          Positioned(
            top: -90,
            right: -70,
            child: _Glow(size: 260, color: Color(0x38FFFFFF)),
          ),
          Positioned(
            top: 120,
            left: -80,
            child: _Glow(size: 200, color: Color(0x224338CA)),
          ),
        ],
      ),
    );
  }
}

class _Glow extends StatelessWidget {
  const _Glow({required this.size, required this.color});

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(
          colors: [color, color.withValues(alpha: 0)],
        ),
      ),
    );
  }
}
