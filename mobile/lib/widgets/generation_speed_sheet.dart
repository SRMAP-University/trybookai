import 'package:flutter/material.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/premium_upgrade_sheet.dart';

enum GenerationSpeed { normal, superFast }

/// Returns chosen speed, or null if cancelled. Opens upgrade sheet for free users on Super Fast.
Future<GenerationSpeed?> showGenerationSpeedSheet(
  BuildContext context, {
  required bool canUseSuperFast,
  bool resume = false,
}) {
  return showModalBottomSheet<GenerationSpeed>(
    context: context,
    showDragHandle: true,
    builder: (ctx) {
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                resume ? 'Resume generation' : 'Generate your book',
                style: Theme.of(ctx).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
              ),
              const SizedBox(height: 6),
              Text(
                'Choose how fast to write. You can change this next time.',
                style: TextStyle(color: Colors.grey.shade700, height: 1.35),
              ),
              const SizedBox(height: 16),
              _SpeedTile(
                title: 'Normal',
                subtitle:
                    'Cloudflare Workers AI — reliable long-form writing at standard speed.',
                icon: Icons.auto_stories_outlined,
                onTap: () => Navigator.of(ctx).pop(GenerationSpeed.normal),
              ),
              const SizedBox(height: 10),
              _SpeedTile(
                title: canUseSuperFast ? 'Super Fast' : 'Super Fast · Pro',
                subtitle: canUseSuperFast
                    ? 'Groq Llama 3.3 — much quicker drafts.'
                    : 'Groq-powered drafts — tap to see Pro (\$20) and Premium (\$30).',
                icon: canUseSuperFast ? Icons.bolt_rounded : Icons.lock_outline,
                highlight: true,
                onTap: () async {
                  if (canUseSuperFast) {
                    Navigator.of(ctx).pop(GenerationSpeed.superFast);
                    return;
                  }
                  final upgraded = await showPremiumUpgradeSheet(
                    ctx,
                    featureLabel:
                        'Super Fast generation uses Groq and is included on Pro and Premium.',
                  );
                  if (!ctx.mounted) return;
                  if (upgraded) {
                    Navigator.of(ctx).pop(GenerationSpeed.superFast);
                  }
                },
              ),
            ],
          ),
        ),
      );
    },
  );
}

class _SpeedTile extends StatelessWidget {
  const _SpeedTile({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.onTap,
    this.highlight = false,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final VoidCallback onTap;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: highlight
          ? AppColors.primary.withValues(alpha: 0.06)
          : Colors.grey.shade50,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: highlight
                  ? AppColors.primary.withValues(alpha: 0.35)
                  : Colors.grey.shade300,
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, color: highlight ? AppColors.primary : Colors.black87),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: TextStyle(
                        color: Colors.grey.shade700,
                        fontSize: 13,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
