/// The stats that sit behind Home. Home is a sheet over them: pull it down
/// from the top to see your plan, what's left this month and what you've
/// written; let go and it settles open or closed.
library;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:bookai_mobile/models/models.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/bookai_logo.dart';

/// The strip of the dark layer that always shows above Home's sheet (logo
/// and plan), and how much further the sheet moves down to show the stats.
const homePeekHeight = 52.0;
const homeStatsHeight = 236.0;

const _lavender = Color(0xFFC9C5FF);

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
  });

  final VoidCallback onTap;
  final VoidCallback onAudioStudio;
  final VoidCallback onSongStudio;

  Widget _studio(IconData icon, String label, VoidCallback onPressed) {
    return IconButton(
      tooltip: label,
      onPressed: onPressed,
      style: IconButton.styleFrom(
        backgroundColor: Colors.white.withValues(alpha: 0.1),
        foregroundColor: Colors.white,
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
                const BookAiLogo(height: 24, color: Colors.white),
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
  });

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
                      color: Colors.white.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(99),
                    ),
                    child: Text(
                      _planLabel(u),
                      style: const TextStyle(
                        color: _lavender,
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
    required this.label,
    required this.value,
    required this.detail,
    this.fraction,
  });

  final String label;
  final String value;
  final String detail;
  final double? fraction;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.65),
              fontSize: 11.5,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Colors.white,
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
                color: _lavender,
                backgroundColor: Colors.white.withValues(alpha: 0.12),
              ),
            ),
          ],
          const SizedBox(height: 4),
          Text(
            detail,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.55),
              fontSize: 11.5,
            ),
          ),
        ],
      ),
    );
  }
}
