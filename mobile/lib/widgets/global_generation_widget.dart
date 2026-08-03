import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:bookai_mobile/models/models.dart';
import 'package:bookai_mobile/providers/books_provider.dart';
import 'package:bookai_mobile/theme/app_theme.dart';

/// Compact floating jobs chip (website-style, smaller).
class GlobalGenerationWidget extends StatefulWidget {
  const GlobalGenerationWidget({super.key});

  @override
  State<GlobalGenerationWidget> createState() => _GlobalGenerationWidgetState();
}

class _GlobalGenerationWidgetState extends State<GlobalGenerationWidget> {
  bool _collapsed = true;
  bool _dismissed = false;
  String _visibleKey = '';

  String _statusLabel(String status) {
    switch (status) {
      case 'OUTLINING':
        return 'Outlining';
      case 'GENERATING':
        return 'Generating';
      case 'PENDING':
        return 'Queued';
      default:
        return status.toLowerCase();
    }
  }

  @override
  Widget build(BuildContext context) {
    final jobs = context.watch<BooksProvider>().activeJobs;
    final books = jobs?.books ?? const <BookModel>[];
    final audios = jobs?.audios ?? const <ActiveAudioJob>[];
    final total = books.length + audios.length;

    final ids = <String>[
      ...books.map((b) => b.id),
      ...audios.map((a) => a.id),
    ]..sort();
    final keyStr = ids.join('|');

    if (total > 0 && keyStr != _visibleKey) {
      _visibleKey = keyStr;
      _dismissed = false;
    } else if (total == 0) {
      _visibleKey = '';
    }

    if (total == 0 || _dismissed) return const SizedBox.shrink();

    return Align(
      alignment: Alignment.bottomRight,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 6),
        child: Material(
          color: Colors.transparent,
          child: _collapsed
              ? _miniChip(total)
              : ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 260),
                  child: _expandedPanel(books, audios, total),
                ),
        ),
      ),
    );
  }

  Widget _miniChip(int total) {
    return InkWell(
      onTap: () => setState(() => _collapsed = false),
      borderRadius: BorderRadius.circular(99),
      child: Container(
        padding: const EdgeInsets.fromLTRB(8, 6, 10, 6),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(99),
          border: Border.all(color: AppColors.border),
          boxShadow: [
            BoxShadow(
              color: AppColors.navy.withValues(alpha: 0.12),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: AppColors.primary,
              ),
            ),
            const SizedBox(width: 6),
            Text(
              '$total',
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 12,
                color: AppColors.navy,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _expandedPanel(
    List<BookModel> books,
    List<ActiveAudioJob> audios,
    int total,
  ) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
        boxShadow: [
          BoxShadow(
            color: AppColors.navy.withValues(alpha: 0.14),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 6, 2, 6),
            child: Row(
              children: [
                const SizedBox(
                  width: 12,
                  height: 12,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.primary,
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  '$total running',
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 12,
                    color: AppColors.navy,
                  ),
                ),
                const Spacer(),
                IconButton(
                  visualDensity: VisualDensity.compact,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                  onPressed: () => setState(() => _collapsed = true),
                  icon: const Icon(Icons.keyboard_arrow_down, size: 18),
                  color: AppColors.textMuted,
                ),
                IconButton(
                  visualDensity: VisualDensity.compact,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                  onPressed: () => setState(() => _dismissed = true),
                  icon: const Icon(Icons.close, size: 16),
                  color: AppColors.textMuted,
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 180),
            child: ListView(
              shrinkWrap: true,
              padding: EdgeInsets.zero,
              children: [
                for (final b in books)
                  _jobTile(
                    icon: Icons.menu_book_rounded,
                    title: b.title,
                    subtitle:
                        '${_statusLabel(b.status)} · ${b.progress.round()}%',
                    progress: b.progress,
                    onTap: () => context.push('/books/${b.id}'),
                  ),
                for (final a in audios)
                  _jobTile(
                    icon: Icons.headphones_rounded,
                    title: a.title ?? a.bookTitle,
                    subtitle:
                        '${a.typeLabel} · ${_statusLabel(a.status)} · ${a.progress.round()}%',
                    progress: a.progress,
                    onTap: () => context.push('/books/${a.bookId}'),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _jobTile({
    required IconData icon,
    required String title,
    required String subtitle,
    required double progress,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
        child: Row(
          children: [
            Icon(icon, size: 14, color: AppColors.primary),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 11,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      fontSize: 10,
                      color: AppColors.textMuted,
                    ),
                  ),
                  const SizedBox(height: 4),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(99),
                    child: LinearProgressIndicator(
                      value: (progress / 100).clamp(0, 1),
                      minHeight: 3,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
