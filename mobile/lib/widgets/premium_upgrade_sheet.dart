import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:bookai_mobile/config/api_config.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/common.dart';

/// Pro / Premium upgrade sheet — website checkout until Play Billing ships.
Future<bool> showPremiumUpgradeSheet(
  BuildContext context, {
  String featureLabel =
      'This feature is included on Pro and Premium.',
}) async {
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => _PremiumUpgradeSheet(featureLabel: featureLabel),
  );
  return false;
}

class _PremiumUpgradeSheet extends StatelessWidget {
  const _PremiumUpgradeSheet({required this.featureLabel});

  final String featureLabel;

  static const _plans = [
    (
      name: 'Pro',
      price: r'$20',
      period: '/mo',
      highlight: false,
      features: [
        '5,000 pages per month',
        '1 hour of audiobook narration',
        'Up to 500 pages per book',
        'Private books',
        'Super Fast generation',
      ],
    ),
    (
      name: 'Premium',
      price: r'$30',
      period: '/mo',
      highlight: true,
      features: [
        '10,000 pages per month',
        '3 hours of audiobook narration',
        'Up to 1,000 pages per book',
        'Unlimited books',
        'Super Fast + priority support',
      ],
    ),
  ];

  Future<void> _openWebsite(BuildContext context) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/dashboard/billing');
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open the website')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Upgrade to unlock',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
            ),
            const SizedBox(height: 6),
            Text(
              featureLabel,
              style: TextStyle(color: Colors.grey.shade700, height: 1.35),
            ),
            const SizedBox(height: 8),
            Text(
              'In-app purchases coming soon. Subscribe on the website with the same account.',
              style: TextStyle(
                color: Colors.grey.shade600,
                fontSize: 13,
                height: 1.35,
              ),
            ),
            const SizedBox(height: 16),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (var i = 0; i < _plans.length; i++) ...[
                  if (i > 0) const SizedBox(width: 12),
                  Expanded(child: _planCard(_plans[i])),
                ],
              ],
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: () => _openWebsite(context),
              icon: const Icon(Icons.open_in_new_rounded, size: 18),
              label: const Text('Subscribe on website'),
            ),
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Not now'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _planCard(
    ({
      String name,
      String price,
      String period,
      bool highlight,
      List<String> features,
    }) plan,
  ) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: plan.highlight
            ? AppColors.primary.withValues(alpha: 0.06)
            : Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: plan.highlight
              ? AppColors.primary.withValues(alpha: 0.45)
              : Colors.grey.shade300,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            plan.name,
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 15,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                plan.price,
                style: const TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                  height: 1,
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(bottom: 4, left: 2),
                child: Text(
                  plan.period,
                  style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          for (final f in plan.features)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.check, size: 14),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(f, style: const TextStyle(fontSize: 12, height: 1.3)),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
