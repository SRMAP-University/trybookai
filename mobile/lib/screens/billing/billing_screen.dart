import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:purchases_flutter/purchases_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:bookai_mobile/config/api_config.dart';
import 'package:bookai_mobile/config/plan_pricing.dart';
import 'package:bookai_mobile/models/models.dart';
import 'package:bookai_mobile/providers/auth_provider.dart';
import 'package:bookai_mobile/services/api_client.dart';
import 'package:bookai_mobile/services/plan_purchase.dart';
import 'package:bookai_mobile/services/revenuecat_service.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/common.dart';

/// Plans are bought through Google Play / the App Store only — store policy
/// forbids pointing app users at website checkout.
class BillingScreen extends StatefulWidget {
  const BillingScreen({super.key});

  @override
  State<BillingScreen> createState() => _BillingScreenState();
}

class _BillingScreenState extends State<BillingScreen> {
  static const _plans = [
    (
      key: 'PRO',
      name: 'Pro',
      highlight: false,
      features: ['5,000 pages / mo', '1 hour audiobook', 'Private books'],
    ),
    (
      key: 'ENTERPRISE',
      name: 'Premium',
      highlight: true,
      features: ['10,000 pages / mo', '3 hours audiobook', 'Priority support'],
    ),
    (
      key: 'UNLIMITED',
      name: 'Unlimited',
      highlight: false,
      features: ['Unlimited pages*', 'Unlimited audio*', 'Fair use applies'],
    ),
  ];

  static String get _storeName =>
      defaultTargetPlatform == TargetPlatform.iOS ? 'the App Store' : 'Google Play';

  late final PlanPurchase _purchase = PlanPurchase(
    api: context.read<ApiClient>(),
    auth: context.read<AuthProvider>(),
    store: context.read<RevenueCatService>(),
  );

  /// Device-region guess until the server says which prices apply here.
  /// Only shown while store products are loading or unavailable.
  PlanPricing _pricing = PlanPricing.forDevice();
  bool _loadingStore = true;
  CustomerInfo? _customer;

  /// Plan key being bought, or 'RESTORE'.
  String? _busy;

  @override
  void initState() {
    super.initState();
    _loadPricing();
    _loadStore();
  }

  Future<void> _loadPricing() async {
    final api = context.read<ApiClient>();
    try {
      final res = await api.dio.get(ApiConfig.billingPricing);
      final data = res.data;
      if (data is Map<String, dynamic> && mounted) {
        setState(() => _pricing = PlanPricing.fromJson(data));
      }
    } catch (e) {
      debugPrint('[billing] pricing fetch failed: $e');
    }
  }

  Future<void> _loadStore() async {
    try {
      await _purchase.prepare().timeout(const Duration(seconds: 15));
      _customer = await _purchase.store.customerInfo();
    } catch (e) {
      debugPrint('[billing] store load failed: $e');
    }
    if (mounted) setState(() => _loadingStore = false);
  }

  Future<void> _retryStore() async {
    setState(() => _loadingStore = true);
    await _loadStore();
  }

  /// [prepaid] buys one month once (no auto-renew; Play balance works).
  Future<void> _buy(String plan, {bool prepaid = false}) async {
    setState(() => _busy = prepaid ? '$plan:prepaid' : plan);
    try {
      final bought = await _purchase.buy(plan, prepaid: prepaid);
      if (!bought || !mounted) return;
      _customer = await _purchase.store.customerInfo();
      if (!mounted) return;
      final label = context.read<AuthProvider>().user?.planLabel;
      _snack('You’re on ${label ?? 'your new plan'} now.');
    } catch (e) {
      final message = _purchase.errorText(e);
      if (message.isNotEmpty) _snack(message);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _restore() async {
    setState(() => _busy = 'RESTORE');
    try {
      await _purchase.restore();
      _customer = await _purchase.store.customerInfo();
      if (!mounted) return;
      final label = context.read<AuthProvider>().user?.planLabel ?? 'Free';
      _snack('Purchases restored · $label');
    } catch (e) {
      final message = _purchase.errorText(e);
      if (message.isNotEmpty) _snack(message);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _manageSubscription() async {
    final url = _customer?.managementURL;
    if (url == null) return;
    final ok = await launchUrl(
      Uri.parse(url),
      mode: LaunchMode.externalApplication,
    );
    if (!ok) _snack('Could not open $_storeName');
  }

  void _snack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    final store = context.watch<RevenueCatService>();
    final storeReady = store.hasPackages;

    // Once the store answers, show exactly what it sells (store-localized
    // price, so India sees ₹). Until then, preview the regional prices.
    final plans = [
      for (final plan in _plans)
        if ((storeReady
                ? store.priceLabelForPlan(plan.key, interval: 'month')
                : _pricing.monthlyLabel(plan.key))
            case final price?)
          (plan: plan, price: price),
    ];
    final showsUnlimited = plans.any((p) => p.plan.key == 'UNLIMITED');
    final billedOnWeb = user?.hasStripeSubscription ?? false;
    final hasStoreSubscription =
        _customer?.activeSubscriptions.isNotEmpty ?? false;
    // Current access comes from a one-time month (it can be topped up).
    final onPrepaid = _customer?.entitlements.active.values.any(
          (e) => e.productPlanIdentifier?.contains('prepaid') ?? false,
        ) ??
        false;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Billing'),
        actions: [
          TextButton(
            onPressed: _busy != null ? null : _restore,
            child: _busy == 'RESTORE'
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Restore'),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          if (user != null)
            StripeCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Current · ${user.onTrial ? 'Free trial' : user.planLabel}',
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${user.pagesUsed}/${user.pagesLimit} pages · ${user.audioMinutesUsed}/${user.audioMinutesLimit} min audio',
                    style: const TextStyle(
                      color: AppColors.textMuted,
                      fontSize: 13,
                    ),
                  ),
                  if (hasStoreSubscription && _customer?.managementURL != null) ...[
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      onPressed: _manageSubscription,
                      icon: const Icon(Icons.open_in_new_rounded, size: 18),
                      label: Text('Manage in $_storeName'),
                    ),
                  ],
                ],
              ),
            ),
          if (billedOnWeb) ...[
            const SizedBox(height: 16),
            const StripeCard(
              child: Text(
                'Your plan is billed through the BookAI website, so it can’t '
                'be changed here. Manage or cancel it at trybookai.com.',
                style: TextStyle(fontSize: 13, height: 1.4),
              ),
            ),
          ],
          if (!_loadingStore && !storeReady) ...[
            const SizedBox(height: 16),
            StripeCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Couldn’t load plans from $_storeName. Check your '
                    'connection and try again.',
                    style: const TextStyle(fontSize: 13, height: 1.4),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton(
                    onPressed: _retryStore,
                    child: const Text('Try again'),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 16),
          for (final (i, p) in plans.indexed) ...[
            if (i > 0) const SizedBox(height: 12),
            _planCard(
              name: p.plan.name,
              price: p.price,
              features: p.plan.features,
              highlight: p.plan.highlight,
              current: _isCurrent(user, p.plan.key),
              action: _planAction(
                p.plan.key,
                name: p.plan.name,
                current: _isCurrent(user, p.plan.key),
                enabled: storeReady && !billedOnWeb,
                switching: hasStoreSubscription && !onPrepaid,
                onPrepaid: onPrepaid,
                oneTimePrice: storeReady
                    ? store.priceLabelForPlan(
                        p.plan.key,
                        interval: 'month',
                        prepaid: true,
                      )
                    : null,
              ),
            ),
          ],
          const SizedBox(height: 16),
          Text(
            'Monthly subscriptions renew at the price shown until you cancel; '
            'cancel anytime in $_storeName → Subscriptions. One-time months '
            'don’t renew — buy another when yours ends.'
            '${showsUnlimited ? ' *Unlimited is subject to fair-use Terms (rate limits).' : ''}',
            style: const TextStyle(
              fontSize: 11,
              color: AppColors.textMuted,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }

  /// A trial isn't a purchase — trial users can still buy Premium.
  static bool _isCurrent(UserModel? user, String plan) =>
      user != null && user.plan == plan && !user.onTrial;

  Widget _planAction(
    String plan, {
    required String name,
    required bool current,
    required bool enabled,
    required bool switching,
    required bool onPrepaid,
    String? oneTimePrice,
  }) {
    Widget spinner(Color color) => SizedBox(
          width: 16,
          height: 16,
          child: CircularProgressIndicator(strokeWidth: 2, color: color),
        );
    final oneTime = oneTimePrice == null
        ? null
        : OutlinedButton(
            onPressed: enabled && _busy == null
                ? () => _buy(plan, prepaid: true)
                : null,
            child: _busy == '$plan:prepaid'
                ? spinner(AppColors.primary)
                : Text(
                    current
                        ? 'Add another month · $oneTimePrice'
                        : 'Pay once · 1 month · $oneTimePrice',
                  ),
          );

    if (current) {
      // A one-time month can be extended; a subscription is just current.
      if (onPrepaid && oneTime != null) return oneTime;
      return const OutlinedButton(onPressed: null, child: Text('Current plan'));
    }
    final waiting = _loadingStore && !enabled;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        FilledButton(
          onPressed: enabled && _busy == null ? () => _buy(plan) : null,
          child: _busy == plan || waiting
              ? spinner(Colors.white)
              : Text(switching ? 'Switch to $name' : 'Subscribe to $name'),
        ),
        if (oneTime != null) ...[
          const SizedBox(height: 8),
          oneTime,
          const SizedBox(height: 4),
          const Text(
            'No auto-renew · Google Play balance & gift cards work',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 11, color: AppColors.textMuted),
          ),
        ],
      ],
    );
  }

  Widget _planCard({
    required String name,
    required String price,
    required List<String> features,
    required Widget action,
    bool highlight = false,
    bool current = false,
  }) {
    return StripeCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                name,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
              ),
              if (highlight) ...[
                const SizedBox(width: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.navy,
                    borderRadius: BorderRadius.circular(99),
                  ),
                  child: const Text(
                    'Popular',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
              if (current) ...[
                const SizedBox(width: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.primarySoft,
                    borderRadius: BorderRadius.circular(99),
                  ),
                  child: const Text(
                    'Current',
                    style: TextStyle(
                      color: AppColors.primaryText,
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 8),
          Text.rich(
            TextSpan(
              text: price,
              style: const TextStyle(
                fontSize: 32,
                fontWeight: FontWeight.w800,
                letterSpacing: -1,
              ),
              children: const [
                TextSpan(
                  text: ' /mo',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: AppColors.textMuted,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          ...features.map(
            (f) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                children: [
                  const Icon(Icons.check, size: 16, color: AppColors.navy),
                  const SizedBox(width: 8),
                  Text(
                    f,
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppColors.textBody,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(width: double.infinity, child: action),
        ],
      ),
    );
  }
}
