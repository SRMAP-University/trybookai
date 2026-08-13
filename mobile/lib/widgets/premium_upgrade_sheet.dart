import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:purchases_flutter/purchases_flutter.dart';
import 'package:bookai_mobile/config/api_config.dart';
import 'package:bookai_mobile/providers/auth_provider.dart';
import 'package:bookai_mobile/services/api_client.dart';
import 'package:bookai_mobile/services/revenuecat_service.dart';
import 'package:bookai_mobile/theme/app_theme.dart';

/// Pro ($20) / Premium ($30) upgrade sheet — mirrors the web paywall popup.
Future<bool> showPremiumUpgradeSheet(
  BuildContext context, {
  String featureLabel =
      'This feature is included on Pro and Premium.',
}) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => _PremiumUpgradeSheet(featureLabel: featureLabel),
  );
  return result == true;
}

class _PremiumUpgradeSheet extends StatefulWidget {
  const _PremiumUpgradeSheet({required this.featureLabel});

  final String featureLabel;

  @override
  State<_PremiumUpgradeSheet> createState() => _PremiumUpgradeSheetState();
}

class _PremiumUpgradeSheetState extends State<_PremiumUpgradeSheet> {
  String? _loadingPlan;

  static const _plans = [
    (
      key: 'PRO',
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
      key: 'ENTERPRISE',
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

  Future<void> _checkout(String plan) async {
    setState(() => _loadingPlan = plan);
    final api = context.read<ApiClient>();
    final auth = context.read<AuthProvider>();
    final rc = context.read<RevenueCatService>();
    try {
      final userId = auth.user?.id;
      if (!rc.isConfigured) {
        await rc.configure(appUserId: userId);
      } else if (userId != null) {
        await rc.logIn(userId);
      }
      await rc.refreshOfferings();

      final info = await rc.purchasePlan(plan, interval: 'month');
      if (info == null) return;

      final entitlements = info.entitlements.active.keys.toList();
      final productIds = <String>{
        ...info.activeSubscriptions,
        for (final e in info.entitlements.active.values)
          if (e.productIdentifier.isNotEmpty) e.productIdentifier,
      }.toList();

      await api.dio.post(
        ApiConfig.billingRevenueCatSync,
        data: {
          'entitlements': entitlements,
          'productIds': productIds,
          'appUserId': auth.user?.id,
          'requestedPlan': plan,
          'allowDowngrade': false,
        },
      );
      await auth.refreshUser();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Upgraded to ${auth.user?.planLabel ?? plan}')),
      );
      Navigator.of(context).pop(true);
    } on PlatformException catch (e) {
      if (!mounted) return;
      final code = PurchasesErrorHelper.getErrorCode(e);
      if (code == PurchasesErrorCode.purchaseCancelledError) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message ?? 'Purchase failed')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(api.extractError(e))),
      );
    } finally {
      if (mounted) setState(() => _loadingPlan = null);
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
              widget.featureLabel,
              style: TextStyle(color: Colors.grey.shade700, height: 1.35),
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
            const SizedBox(height: 8),
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Not now'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _planCard(
    ({
      String key,
      String name,
      String price,
      String period,
      bool highlight,
      List<String> features,
    }) plan,
  ) {
    final busy = _loadingPlan == plan.key;
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
          Row(
            children: [
              Expanded(
                child: Text(
                  plan.name,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                  ),
                ),
              ),
              if (plan.highlight)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.primary,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: const Text(
                    'Popular',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
            ],
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
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _loadingPlan != null ? null : () => _checkout(plan.key),
              style: FilledButton.styleFrom(
                backgroundColor:
                    plan.highlight ? AppColors.primary : const Color(0xFF0A2540),
              ),
              child: busy
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Text(plan.highlight ? 'Get Premium' : 'Get Pro'),
            ),
          ),
        ],
      ),
    );
  }
}
