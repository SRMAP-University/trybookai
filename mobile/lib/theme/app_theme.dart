/// BookAI design tokens, matched to the website (`src/app/globals.css`):
/// navy ink, indigo-blue accent, white pages, Inter for UI and Instrument
/// Serif for display headings.
///
/// Contrast (WCAG 2.2, checked against white):
/// ink 15.5:1, body 7.8:1, muted 4.8:1, accent text 5.6:1,
/// white on the accent button 4.7:1. All pass AA for normal text.
library;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppColors {
  /// Ink — headings and primary text (`--foreground`).
  static const navy = Color(0xFF0A2540);

  /// Accent for fills: buttons, progress, selected nav (`--primary`).
  static const primary = Color(0xFF635BFF);
  static const primaryHover = Color(0xFF5851E5);

  /// Accent for small text and icons on light fills; the fill colour itself
  /// drops below 4.5:1 on tinted backgrounds.
  static const primaryText = Color(0xFF5851E5);
  static const primarySoft = Color(0xFFF0EFFF);
  static const primaryTint = Color(0xFFC9C5FF);
  static const brand = primary;

  /// Page background. White like the website, so muted text keeps 4.8:1.
  static const cream = Color(0xFFFFFFFF);

  /// Tracks, chips and quiet fills (`--muted`).
  static const mutedBg = Color(0xFFF0F3F7);
  static const card = Color(0xFFFFFFFF);
  static const border = Color(0xFFE6EBF1);
  static const textMuted = Color(0xFF697386);
  static const textBody = Color(0xFF425466);

  /// Bookmark ribbon on 3D covers.
  static const ribbon = primary;
  static const destructive = Color(0xFFDF1B41);
  static const success = Color(0xFF0E6245);
  static const successSoft = Color(0xFFD7F7C2);
  static const warning = Color(0xFF9A6700);
  static const white = Color(0xFFFFFFFF);
}

/// Display type for large headings (the website's `serifDisplay`).
class AppType {
  static TextStyle display({double size = 32, Color color = AppColors.navy}) =>
      GoogleFonts.instrumentSerif(
        fontSize: size,
        height: 1.05,
        color: color,
        letterSpacing: -0.2,
      );
}

/// Motion from Material 3: entering things decelerate, nothing longer than
/// half a second, and none of it when the system asks for reduced motion.
class AppMotion {
  static const enter = Duration(milliseconds: 450);
  static const quick = Duration(milliseconds: 150);
  static const Curve enterCurve = Easing.emphasizedDecelerate;

  static bool reduced(BuildContext context) =>
      MediaQuery.maybeDisableAnimationsOf(context) ?? false;
}

class AppTheme {
  static ThemeData light() {
    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: AppColors.cream,
      colorScheme: ColorScheme.fromSeed(
        seedColor: AppColors.primary,
        primary: AppColors.primary,
        onPrimary: AppColors.white,
        surface: AppColors.card,
        onSurface: AppColors.navy,
        error: AppColors.destructive,
      ),
    );

    final textTheme = GoogleFonts.interTextTheme(
      base.textTheme,
    ).apply(bodyColor: AppColors.navy, displayColor: AppColors.navy);
    const pill = StadiumBorder();
    // Material's minimum touch target.
    const tap = Size(48, 48);

    return base.copyWith(
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.cream,
        foregroundColor: AppColors.navy,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w700,
          letterSpacing: -0.3,
          fontSize: 20,
          color: AppColors.navy,
        ),
      ),
      cardTheme: CardThemeData(
        color: AppColors.card,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.card,
        surfaceTintColor: Colors.transparent,
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: AppColors.card,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.card,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 14,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
        ),
        hintStyle: const TextStyle(color: AppColors.textMuted, fontSize: 14),
        labelStyle: const TextStyle(color: AppColors.textBody, fontSize: 13),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: AppColors.white,
          minimumSize: const Size.fromHeight(48),
          shape: pill,
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.navy,
          backgroundColor: AppColors.card,
          minimumSize: const Size.fromHeight(48),
          side: const BorderSide(color: AppColors.border),
          shape: pill,
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.primaryText,
          minimumSize: tap,
          shape: pill,
          textStyle: const TextStyle(fontWeight: FontWeight.w600),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.card,
        selectedColor: AppColors.primarySoft,
        side: const BorderSide(color: AppColors.border),
        shape: pill,
        labelStyle: const TextStyle(
          color: AppColors.navy,
          fontWeight: FontWeight.w500,
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: AppColors.card,
        indicatorColor: AppColors.primarySoft,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return TextStyle(
            fontSize: 12,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
            color: selected ? AppColors.primaryText : AppColors.textMuted,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return IconThemeData(
            size: 22,
            color: selected ? AppColors.primaryText : AppColors.textMuted,
          );
        }),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: AppColors.navy,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      dividerTheme: const DividerThemeData(
        color: AppColors.border,
        thickness: 1,
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: AppColors.primary,
        linearTrackColor: AppColors.mutedBg,
      ),
    );
  }
}
