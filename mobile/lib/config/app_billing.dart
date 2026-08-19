/// In-app purchases are off until Google Play Billing is approved.
/// Flip to true and restore Play/RevenueCat checkout when products are live.
class AppBilling {
  static const bool iapEnabled = false;

  static const String freeAppMessage =
      'This isn’t available in the free Android app yet.';
}
