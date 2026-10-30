/// The stats that sit behind Home. Home is a sheet over them: pull it down
/// from the top to see your plan, what's left this month and what you've
/// written; let go and it settles open or closed.
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:bookai_mobile/models/models.dart';
import 'package:bookai_mobile/theme/app_theme.dart';

/// How far Home's sheet moves down to show the stats.
const homeStatsHeight = 300.0;

const _lavender = Color(0xFFC9C5FF);

/// Scrolling for the Home sheet. The first [restOffset] of the scroll is
/// the stats area: let go there and the sheet springs open or shut, by
/// position or by the direction of the flick. A fling up from the books
/// stops at the sheet's top instead of flying the stats open.
class HomeSheetPhysics extends ScrollPhysics {
  const HomeSheetPhysics({required this.restOffset, super.parent});

  final double restOffset;

  @override
  HomeSheetPhysics applyTo(ScrollPhysics? ancestor) =>
      HomeSheetPhysics(restOffset: restOffset, parent: buildParent(ancestor));

  @override
  bool shouldAcceptUserOffset(ScrollMetrics position) => true;

  @override
  Simulation? createBallisticSimulation(
    ScrollMetrics position,
    double velocity,
  ) {
    final p = position.pixels;
    if (p < restOffset - 0.5 && p > position.minScrollExtent) {
      final double target;
      if (velocity < -250) {
        target = 0;
      } else if (velocity > 250) {
        target = restOffset;
      } else {
        target = p < restOffset * 0.6 ? 0 : restOffset;
      }
      return ScrollSpringSimulation(
        SpringDescription.withDampingRatio(
          mass: 0.5,
          stiffness: 120,
          ratio: 1.0,
        ),
        p,
        target,
        velocity,
        tolerance: toleranceFor(position),
      );
    }
    final sim = super.createBallisticSimulation(position, velocity);
    if (sim == null || p < restOffset || velocity >= 0) return sim;
    return _StopAt(sim, restOffset);
  }
}

/// [inner], stopped where it would pass [stop] on its way up.
class _StopAt extends Simulation {
  _StopAt(this.inner, this.stop);

  final Simulation inner;
  final double stop;

  @override
  double x(double time) => math.max(stop, inner.x(time));

  @override
  double dx(double time) => inner.x(time) <= stop ? 0 : inner.dx(time);

  @override
  bool isDone(double time) => inner.isDone(time) || inner.x(time) <= stop;
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

/// Plan, what's left this month and what you've written, on the dark layer
/// behind Home.
class HomeStatsPanel extends StatelessWidget {
  const HomeStatsPanel({
    super.key,
    required this.user,
    required this.books,
    required this.writing,
    required this.onUsage,
    required this.onUpgrade,
  });

  final UserModel? user;
  final List<BookModel> books;
  final int writing;
  final VoidCallback onUsage;
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

    String plan = u?.displayPlanLabel ?? 'Free';
    if (u != null && u.onTrial && u.trialEndsAt != null) {
      final ends = DateTime.tryParse(u.trialEndsAt!);
      if (ends != null) {
        plan =
            'Free trial · ends ${DateFormat('d MMM').format(ends.toLocal())}';
      }
    } else if (u != null && !u.onTrial) {
      plan = '${u.displayPlanLabel} plan';
    }

    return ClipRect(
      child: OverflowBox(
        alignment: Alignment.topCenter,
        maxHeight: double.infinity,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Your stats',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.2,
                      ),
                    ),
                  ),
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
                      plan,
                      style: const TextStyle(
                        color: _lavender,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
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
                  TextButton(
                    onPressed: onUsage,
                    style: TextButton.styleFrom(
                      foregroundColor: _lavender,
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                    ),
                    child: const Text('See full usage →'),
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
