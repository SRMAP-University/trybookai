import 'package:flutter/foundation.dart';

/// RevenueCat public SDK keys (never put `sk_…` secret keys in the app).
///
/// - `test_…` = Test Store — **debug builds only** (SDK kills release processes)
/// - `goog_…` / `appl_…` = Play / App Store — use for release & Shorebird builds
///
/// Pass production key: `--dart-define=REVENUECAT_API_KEY=goog_xxx`
class RevenueCatConfig {
  static const String testApiKey = 'test_DiHlFWGSHJWFiFlKRPMkckPCuCl';

  static const String _envApiKey = String.fromEnvironment('REVENUECAT_API_KEY');

  /// Public SDK key safe for the current build mode.
  static String get apiKey {
    if (_envApiKey.isNotEmpty) return _envApiKey;
    // Release / profile: never fall back to Test Store — Purchases.configure
    // intentionally crashes the process when a test_ key is used.
    if (kReleaseMode) return '';
    return testApiKey;
  }

  static bool get canConfigure {
    final key = apiKey;
    if (key.isEmpty) return false;
    if (kReleaseMode && key.startsWith('test_')) return false;
    return true;
  }

  /// Entitlement identifiers configured in the RevenueCat dashboard.
  static const String entitlementPro = 'pro';
  static const String entitlementPremium = 'premium';
  static const String entitlementUnlimited = 'unlimited';

  static const entitlementIds = <String>[
    entitlementPro,
    entitlementPremium,
    entitlementUnlimited,
  ];
}
