import 'package:flutter/foundation.dart';

/// RevenueCat public SDK keys (never put `sk_…` secret keys in the app).
///
/// - `test_…` = Test Store — **debug builds only** (SDK kills release processes)
/// - `goog_…` / `appl_…` = Play / App Store — use for release & Shorebird builds
///
/// Override with `--dart-define=REVENUECAT_API_KEY=...`.
class RevenueCatConfig {
  static const String testApiKey = 'test_DiHlFWGSHJWFiFlKRPMkckPCuCl';

  /// Google Play app "BookAI (Google Play)" in RevenueCat project
  /// proj602f353b. Public by design — shipped in every Android build.
  static const String googleApiKey = 'goog_gnLIztFcJoYZbLsmoqUdBHhUzUk';

  static const String _envApiKey = String.fromEnvironment('REVENUECAT_API_KEY');

  /// Public SDK key safe for the current build mode.
  static String get apiKey {
    if (_envApiKey.isNotEmpty) return _envApiKey;
    // Release / profile: never fall back to Test Store — Purchases.configure
    // intentionally crashes the process when a test_ key is used.
    if (kReleaseMode) {
      return defaultTargetPlatform == TargetPlatform.android ? googleApiKey : '';
    }
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
