import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:bookai_mobile/config/app_billing.dart';
import 'package:bookai_mobile/config/plan_pricing.dart';
import 'package:bookai_mobile/providers/auth_provider.dart';
import 'package:bookai_mobile/services/api_client.dart';
import 'package:bookai_mobile/services/plan_purchase.dart';
import 'package:bookai_mobile/services/revenuecat_service.dart';
import 'package:bookai_mobile/theme/app_theme.dart';

/// Pro / Premium paywall, bought through Google Play / the App Store.
/// Returns true when the user upgraded.
Future<bool> showPremiumUpgradeSheet(
  BuildContext context, {
  String featureLabel = 'This feature is included on Pro and Premium.',
}) async {
  if (!AppBilling.iapEnabled) {
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Free app'),
        content: Text(
          '$featureLabel\n\n${AppBilling.freeAppMessage}',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('OK'),
          ),
        ],
      ),
    );
    return false;
  }
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
  static const _plans = [
    (
      key: 'PRO',
      name: 'Pro',
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

  late final PlanPurchase _purchase = PlanPurchase(
    api: context.read<ApiClient>(),
    auth: context.read<AuthProvider>(),
    store: context.read<RevenueCatService>(),
  );
  final PlanPricing _fallbackPricing = PlanPricing.forDevice();
  bool _loadingStore = true;
  String? _loadingPlan;

  @override
  void initState() {
    super.initState();
    _loadStore();
  }

  Future<void> _loadStore() async {
    try {
      await _purchase.prepare().timeout(const Duration(seconds: 15));
    } catch (e) {
      debugPrint('[upgrade] store load failed: $e');
    }
    if (mounted) setState(() => _loadingStore = false);
  }

  /// [prepaid] buys one month once (no auto-renew; Play balance works).
  Future<void> _buy(String plan, {bool prepaid = false}) async {
    setState(() => _loadingPlan = prepaid ? '$plan:prepaid' : plan);
    try {
      final bought = await _purchase.buy(plan, prepaid: prepaid);
      if (!bought || !mounted) return;
      final label = context.read<AuthProvider>().user?.planLabel;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Upgraded to ${label ?? 'your new plan'}')),
      );
      Navigator.of(context).pop(true);
    } catch (e) {
      final message = _purchase.errorText(e);
      if (message.isNotEmpty && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(message)),
        );
      }
    } finally {
      if (mounted) setState(() => _loadingPlan = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final store = context.watch<RevenueCatService>();
    final billedOnWeb =
        context.watch<AuthProvider>().user?.hasStripeSubscription ?? false;

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
              billedOnWeb
                  ? '${widget.featureLabel}\n\nYour plan is billed through the '
                      'BookAI website — change it at trybookai.com.'
                  : widget.featureLabel,
              style: TextStyle(color: Colors.grey.shade700, height: 1.35),
            ),
            const SizedBox(height: 16),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (var i = 0; i < _plans.length; i++) ...[
                  if (i > 0) const SizedBox(width: 12),
                  Expanded(
                    child: _planCard(
                      _plans[i],
                      // Store-localized price (₹ in India) once loaded.
                      price: store.priceLabelForPlan(
                            _plans[i].key,
                            interval: 'month',
                          ) ??
                          _fallbackPricing.monthlyLabel(_plans[i].key) ??
                          '',
                      enabled: !billedOnWeb &&
                          store.packageForPlan(
                                _plans[i].key,
                                interval: 'month',
                              ) !=
                              null,
                      oneTimePrice: billedOnWeb
                          ? null
                          : store.priceLabelForPlan(
                              _plans[i].key,
                              interval: 'month',
                              prepaid: true,
                            ),
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'Monthly renews until you cancel. “Pay once” is one month with '
              'no auto-renew — Google Play balance works.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey.shade600, fontSize: 11),
            ),
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
      bool highlight,
      List<String> features,
    }) plan, {
    required String price,
    required bool enabled,
    String? oneTimePrice,
  }) {
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
              Flexible(
                child: Text(
                  price,
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    height: 1,
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(bottom: 3, left: 2),
                child: Text(
                  '/mo',
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
                    child: Text(
                      f,
                      style: const TextStyle(fontSize: 12, height: 1.3),
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: enabled && _loadingPlan == null
                  ? () => _buy(plan.key)
                  : null,
              style: FilledButton.styleFrom(
                backgroundColor:
                    plan.highlight ? AppColors.primary : const Color(0xFF0A2540),
              ),
              child: busy || (_loadingStore && !enabled)
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
          if (oneTimePrice != null)
            SizedBox(
              width: double.infinity,
              child: TextButton(
                onPressed: _loadingPlan == null
                    ? () => _buy(plan.key, prepaid: true)
                    : null,
                child: _loadingPlan == '${plan.key}:prepaid'
                    ? const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(
                        'Pay once · $oneTimePrice',
                        style: const TextStyle(fontSize: 12),
                      ),
              ),
            ),
        ],
      ),
    );
  }
}
