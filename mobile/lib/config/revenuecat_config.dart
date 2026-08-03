/// RevenueCat public SDK keys.
///
/// `test_…` = RevenueCat Test Store (sandbox purchases without App Store / Play).
/// Replace with `appl_…` / `goog_…` for production store builds.
class RevenueCatConfig {
  static const String testApiKey = 'test_DiHlFWGSHJWFiFlKRPMkckPCuCl';

  /// Override via `--dart-define=REVENUECAT_API_KEY=appl_xxx` for store builds.
  static const String apiKey = String.fromEnvironment(
    'REVENUECAT_API_KEY',
    defaultValue: testApiKey,
  );

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
