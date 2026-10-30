import 'package:dio/dio.dart';
import 'package:purchases_flutter/purchases_flutter.dart';
import 'package:bookai_mobile/config/api_config.dart';
import 'package:bookai_mobile/providers/auth_provider.dart';
import 'package:bookai_mobile/services/api_client.dart';
import 'package:bookai_mobile/services/revenuecat_service.dart';

/// Buys BookAI plans through Google Play / the App Store, then asks the
/// server to apply them. The server re-checks the purchase with RevenueCat,
/// so nothing the app sends can grant a plan on its own.
class PlanPurchase {
  PlanPurchase({required this.api, required this.auth, required this.store});

  final ApiClient api;
  final AuthProvider auth;
  final RevenueCatService store;

  /// Link RevenueCat to the signed-in user and load store products.
  Future<void> prepare() async {
    final userId = auth.user?.id;
    if (!store.isConfigured) {
      await store.configure(appUserId: userId);
    } else if (userId != null) {
      await store.logIn(userId);
    }
    if (!store.hasPackages) await store.refreshOfferings();
  }

  /// False when the user backs out of the store sheet; throws on failure.
  /// [prepaid] buys one month once (no auto-renew; Play balance works).
  Future<bool> buy(
    String plan, {
    String interval = 'month',
    bool prepaid = false,
  }) async {
    await prepare();
    final info = await store.purchasePlan(
      plan,
      interval: interval,
      prepaid: prepaid,
    );
    if (info == null) return false;
    try {
      await sync(info, requestedPlan: plan);
    } catch (e) {
      throw Exception(
        'Your payment went through, but BookAI couldn’t confirm it yet. '
        'Tap Restore purchases in a minute.',
      );
    }
    return true;
  }

  Future<void> restore() async {
    await prepare();
    await sync(await store.restore());
  }

  /// Never downgrades — expiries reach the server through the RevenueCat
  /// webhook, so a stale device can't remove a plan.
  Future<void> sync(CustomerInfo info, {String? requestedPlan}) async {
    final productIds = <String>{
      ...info.activeSubscriptions,
      for (final e in info.entitlements.active.values)
        if (e.productIdentifier.isNotEmpty) e.productIdentifier,
    }.toList();
    await api.dio.post(
      ApiConfig.billingRevenueCatSync,
      data: {
        'entitlements': info.entitlements.active.keys.toList(),
        'productIds': productIds,
        'appUserId': auth.user?.id,
        'requestedPlan': ?requestedPlan,
        'allowDowngrade': false,
      },
    );
    await auth.refreshUser();
  }

  /// User-facing text for a failed purchase; empty when they cancelled.
  String errorText(Object error) =>
      error is DioException ? api.extractError(error) : friendlyPurchaseError(error);
}
