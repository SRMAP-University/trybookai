/// The stats that sit behind Home. Home is a sheet over them: pull it down
/// from the top to see your plan, what's left this month and what you've
/// written; let go and it settles open or closed.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:bookai_mobile/models/models.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/bookai_logo.dart';

/// The strip of the dark layer that always shows above Home's sheet (logo
/// and plan), and how much further the sheet moves down to show the stats.
const homePeekHeight = 52.0;
const homeStatsHeight = 236.0;

const _lavender = Color(0xFFC9C5FF);

/// The colours of the layer behind Home: navy, or metallic gold for
/// Premium. On gold the text turns a deep warm ink; every label stays at
/// 4.5:1 or better against the darkest part of the gold.
class DockTheme {
  const DockTheme({
    required this.base,
    required this.ink,
    required this.label,
    required this.detail,
    required this.accent,
    required this.track,
    required this.wash,
    required this.overlay,
    this.gradient,
  });

  /// The solid colour, under the gradient if there is one.
  final Color base;

  /// Values, the logo and the studio icons.
  final Color ink;

  /// A tile's label, and the small print under its value.
  final Color label;
  final Color detail;

  /// Bars and the plan name, and the bars' empty track.
  final Color accent;
  final Color track;

  /// Tiles, the plan pill and the studio buttons.
  final Color wash;

  /// Status-bar icons that read on it.
  final SystemUiOverlayStyle overlay;
  final List<Color>? gradient;

  static const navy = DockTheme(
    base: AppColors.navy,
    ink: Colors.white,
    label: Color(0xA6FFFFFF),
    detail: Color(0x8CFFFFFF),
    accent: _lavender,
    track: Color(0x1FFFFFFF),
    wash: Color(0x1AFFFFFF),
    overlay: SystemUiOverlayStyle.light,
  );

  static const gold = DockTheme(
    base: Color(0xFFD6AB45),
    ink: Color(0xFF2A1C02),
    label: Color(0xCC2A1C02),
    detail: Color(0xBF2A1C02),
    accent: Color(0xFF5A3E0A),
    track: Color(0x262A1C02),
    wash: Color(0x38FFFFFF),
    overlay: SystemUiOverlayStyle.dark,
    // Rich gold, a lit band through the middle, then gold again.
    gradient: [Color(0xFFC9982F), Color(0xFFF2D27A), Color(0xFFD6AB45)],
  );

  /// The layer's paint. Gold runs left to right, so the status-bar band
  /// painted with it lines up with the layer below at every point.
  Decoration get decoration => BoxDecoration(
    color: gradient == null ? base : null,
    gradient: gradient == null ? null : LinearGradient(colors: gradient!),
  );

  /// Gold for Premium (and Unlimited) members.
  static DockTheme forUser(UserModel? u) =>
      u != null && u.isPaid && (u.plan == 'ENTERPRISE' || u.plan == 'UNLIMITED')
      ? gold
      : navy;
}

/// The grab handle at the top of the Home sheet; tap to open or close.
class SheetHandle extends StatelessWidget {
  const SheetHandle({super.key, required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Show or hide your stats',
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: const SizedBox(
          height: 20,
          child: Center(
            child: SizedBox(
              width: 36,
              height: 4,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: AppColors.border,
                  borderRadius: BorderRadius.all(Radius.circular(2)),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

String _planLabel(UserModel? u) {
  if (u == null) return 'Free';
  if (u.onTrial && u.trialEndsAt != null) {
    final ends = DateTime.tryParse(u.trialEndsAt!);
    if (ends != null) {
      return 'Free trial · ends ${DateFormat('d MMM').format(ends.toLocal())}';
    }
  }
  return u.onTrial ? u.displayPlanLabel : '${u.displayPlanLabel} plan';
}

/// The always-visible strip of the dark layer: logo on the left, Audio
/// Studio and Song Studio on the right. Tap the strip to open or close the
/// stats.
class HomePeekBar extends StatelessWidget {
  const HomePeekBar({
    super.key,
    required this.onTap,
    required this.onAudioStudio,
    required this.onSongStudio,
    this.dock = DockTheme.navy,
  });

  final DockTheme dock;
  final VoidCallback onTap;
  final VoidCallback onAudioStudio;
  final VoidCallback onSongStudio;

  Widget _studio(IconData icon, String label, VoidCallback onPressed) {
    return IconButton(
      tooltip: label,
      onPressed: onPressed,
      style: IconButton.styleFrom(
        backgroundColor: dock.wash,
        foregroundColor: dock.ink,
        fixedSize: const Size(40, 40),
      ),
      icon: Icon(icon, size: 20),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Show or hide your stats',
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: SizedBox(
          height: homePeekHeight,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(
              children: [
                BookAiLogo(height: 24, color: dock.ink),
                const Spacer(),
                _studio(
                  Icons.headphones_rounded,
                  'Audio Studio',
                  onAudioStudio,
                ),
                const SizedBox(width: 8),
                _studio(Icons.music_note_rounded, 'Song Studio', onSongStudio),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// What's left this month and what you've written, on the dark layer
/// behind Home, below the logo strip.
class HomeStatsPanel extends StatelessWidget {
  const HomeStatsPanel({
    super.key,
    required this.user,
    required this.books,
    required this.writing,
    required this.onUpgrade,
    this.dock = DockTheme.navy,
  });

  final DockTheme dock;

  final UserModel? user;
  final List<BookModel> books;
  final int writing;
  final VoidCallback onUpgrade;

  @override
  Widget build(BuildContext context) {
    final u = user;
    final number = NumberFormat.decimalPattern();
    final finished = books.where((b) => b.status == 'COMPLETED').length;
    final pagesWritten = books.fold(0, (n, b) => n + b.currentPages);
    final audioLeft = u == null
        ? 0
        : (u.audioMinutesLimit - u.audioMinutesUsed).clamp(
            0,
            u.audioMinutesLimit,
          );

    return ClipRect(
      child: OverflowBox(
        alignment: Alignment.topCenter,
        maxHeight: double.infinity,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Expanded(
                    child: _Tile(
                      dock: dock,
                      label: 'Pages left',
                      value: u == null ? '–' : number.format(u.pagesRemaining),
                      detail: u == null
                          ? ''
                          : 'of ${number.format(u.pagesLimit)} this month',
                      fraction: u == null || u.pagesLimit <= 0
                          ? null
                          : u.pagesRemaining / u.pagesLimit,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _Tile(
                      dock: dock,
                      label: 'Audio left',
                      value: u == null || u.audioMinutesLimit <= 0
                          ? '–'
                          : '$audioLeft min',
                      detail: u == null || u.audioMinutesLimit <= 0
                          ? 'Not in your plan'
                          : 'of ${u.audioMinutesLimit} min',
                      fraction: u == null || u.audioMinutesLimit <= 0
                          ? null
                          : audioLeft / u.audioMinutesLimit,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: _Tile(
                      dock: dock,
                      label: 'Books finished',
                      value: '$finished',
                      detail: writing > 0
                          ? '$writing writing now'
                          : '${books.length} in your library',
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _Tile(
                      dock: dock,
                      label: 'Pages written',
                      value: number.format(pagesWritten),
                      detail: 'across all your books',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: dock.wash,
                      borderRadius: BorderRadius.circular(99),
                    ),
                    child: Text(
                      _planLabel(u),
                      style: TextStyle(
                        color: dock.accent,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const Spacer(),
                  if (u != null && !u.isPaid)
                    TextButton(
                      onPressed: onUpgrade,
                      style: TextButton.styleFrom(
                        foregroundColor: Colors.white,
                        backgroundColor: AppColors.primary,
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        minimumSize: const Size(0, 36),
                      ),
                      child: const Text('Upgrade'),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({
    required this.dock,
    required this.label,
    required this.value,
    required this.detail,
    this.fraction,
  });

  final String label;
  final String value;
  final String detail;
  final double? fraction;
  final DockTheme dock;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: dock.wash,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(color: dock.label, fontSize: 11.5)),
          const SizedBox(height: 2),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: dock.ink,
              fontSize: 20,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.3,
            ),
          ),
          if (fraction != null) ...[
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: BorderRadius.circular(99),
              child: LinearProgressIndicator(
                value: fraction!.clamp(0.0, 1.0),
                minHeight: 3,
                color: dock.accent,
                backgroundColor: dock.track,
              ),
            ),
          ],
          const SizedBox(height: 4),
          Text(
            detail,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: dock.detail, fontSize: 11.5),
          ),
        ],
      ),
    );
  }
}
