import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:purchases_flutter/purchases_flutter.dart';
import 'package:bookai_mobile/config/api_config.dart';
import 'package:bookai_mobile/providers/auth_provider.dart';
import 'package:bookai_mobile/services/api_client.dart';
import 'package:bookai_mobile/services/revenuecat_service.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/common.dart';

class BillingScreen extends StatefulWidget {
  const BillingScreen({super.key});

  @override
  State<BillingScreen> createState() => _BillingScreenState();
}

class _BillingScreenState extends State<BillingScreen> {
  String _interval = 'month';
  String? _loadingPlan;
  bool _loadingOfferings = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadOfferings());
  }

  Future<void> _loadOfferings() async {
    setState(() => _loadingOfferings = true);
    final rc = context.read<RevenueCatService>();
    final auth = context.read<AuthProvider>();
    final userId = auth.user?.id;
    if (!rc.isConfigured) {
      await rc.configure(appUserId: userId);
    } else if (userId != null) {
      await rc.logIn(userId);
    }
    await rc.refreshOfferings();
    if (mounted) setState(() => _loadingOfferings = false);
  }

  Future<void> _syncRevenueCat(CustomerInfo? info) async {
    final api = context.read<ApiClient>();
    final auth = context.read<AuthProvider>();
    final rc = context.read<RevenueCatService>();
    final entitlements =
        info?.entitlements.active.keys.toList() ?? await rc.activeEntitlements();
    await api.dio.post(
      ApiConfig.billingRevenueCatSync,
      data: {
        'entitlements': entitlements,
        'appUserId': auth.user?.id,
      },
    );
    await auth.refreshUser();
  }

  Future<void> _checkout(String plan) async {
    setState(() => _loadingPlan = plan);
    final api = context.read<ApiClient>();
    final auth = context.read<AuthProvider>();
    final rc = context.read<RevenueCatService>();
    try {
      final info = await rc.purchasePlan(plan, interval: _interval);
      if (info == null) return; // cancelled
      await _syncRevenueCat(info);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Upgraded to ${auth.user?.planLabel ?? plan}')),
      );
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

  Future<void> _restore() async {
    setState(() => _loadingPlan = 'RESTORE');
    final api = context.read<ApiClient>();
    final rc = context.read<RevenueCatService>();
    try {
      final info = await rc.restore();
      await _syncRevenueCat(info);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Purchases restored')),
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

  /// Local Premium trial (no Stripe checkout).
  Future<void> _startLocalTrial() async {
    setState(() => _loadingPlan = 'TRIAL');
    final api = context.read<ApiClient>();
    final auth = context.read<AuthProvider>();
    try {
      final res = await api.dio.post(
        ApiConfig.billingTrial,
        data: {
          'action': 'start',
          'interval': _interval,
          'acceptedTerms': true,
          'localOnly': true,
        },
      );
      await auth.refreshUser();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(res.data['message'] ?? 'Trial started')),
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

  String _priceText(String plan, int fallback) {
    final rc = context.read<RevenueCatService>();
    final storePrice = rc.priceLabelForPlan(plan, interval: _interval);
    if (storePrice != null) return storePrice;
    return '\$$fallback';
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    final rc = context.watch<RevenueCatService>();
    final hasPackages = rc.hasPackages;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Billing'),
        actions: [
          TextButton(
            onPressed: _loadingPlan != null ? null : _restore,
            child: _loadingPlan == 'RESTORE'
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
                  const SizedBox(height: 6),
                  Text(
                    _loadingOfferings
                        ? 'Loading in-app products…'
                        : hasPackages
                            ? 'Pay with RevenueCat in-app purchase'
                            : 'No store products yet — add Test Store products to your RevenueCat Offering',
                    style: const TextStyle(
                      color: AppColors.textMuted,
                      fontSize: 12,
                    ),
                  ),
                  if (!_loadingOfferings && !hasPackages) ...[
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: _loadOfferings,
                      child: const Text('Retry loading products'),
                    ),
                  ],
                ],
              ),
            ),
          const SizedBox(height: 16),
          Center(
            child: SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'month', label: Text('Monthly')),
                ButtonSegment(value: 'year', label: Text('Yearly')),
              ],
              selected: {_interval},
              onSelectionChanged: (s) => setState(() => _interval = s.first),
            ),
          ),
          const SizedBox(height: 16),
          _planCard(
            name: 'Pro',
            priceFallback: _interval == 'year' ? 200 : 20,
            plan: 'PRO',
            features: const [
              '5,000 pages / mo',
              '1 hour audiobook',
              'Private books',
            ],
            current: user?.plan == 'PRO',
          ),
          const SizedBox(height: 12),
          _planCard(
            name: 'Premium',
            priceFallback: _interval == 'year' ? 300 : 30,
            plan: 'ENTERPRISE',
            features: const [
              '10,000 pages / mo',
              '3 hours audiobook',
              '2-day free trial',
            ],
            highlight: true,
            showTrial:
                user?.plan == 'FREE' && !(user?.hasUsedPremiumTrial ?? true),
            current: user?.plan == 'ENTERPRISE',
          ),
          const SizedBox(height: 12),
          _planCard(
            name: 'Unlimited',
            priceFallback: _interval == 'year' ? 990 : 99,
            plan: 'UNLIMITED',
            features: const [
              'Unlimited pages*',
              'Unlimited audio*',
              'Fair use applies',
            ],
            current: user?.plan == 'UNLIMITED',
          ),
          const SizedBox(height: 12),
          const Text(
            '*Unlimited is subject to fair-use Terms (rate limits).',
            style: TextStyle(fontSize: 11, color: AppColors.textMuted),
          ),
        ],
      ),
    );
  }

  Widget _planCard({
    required String name,
    required int priceFallback,
    required String plan,
    required List<String> features,
    bool highlight = false,
    bool showTrial = false,
    bool current = false,
  }) {
    final loading =
        _loadingPlan == plan || (_loadingPlan == 'TRIAL' && showTrial);
    final rc = context.read<RevenueCatService>();
    final package = rc.packageForPlan(plan, interval: _interval);
    final price = _priceText(plan, priceFallback);
    final canBuy = package != null && !current;

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
                      color: AppColors.primary,
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
              children: [
                if (package == null)
                  TextSpan(
                    text: _interval == 'year' ? ' /yr' : ' /mo',
                    style: const TextStyle(
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
          const SizedBox(height: 12),
          if (showTrial)
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: AppColors.navy),
              onPressed: loading ? null : _startLocalTrial,
              child: loading
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Start free trial · \$0 today'),
            )
          else
            FilledButton(
              onPressed: !canBuy || loading ? null : () => _checkout(plan),
              child: loading
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Text(
                      current
                          ? 'Your current plan'
                          : package == null
                              ? 'Product unavailable'
                              : 'Upgrade to $name',
                    ),
            ),
        ],
      ),
    );
  }
}
