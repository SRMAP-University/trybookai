/// Store billing (Google Play / App Store via RevenueCat).
/// Play requires in-app subscriptions to go through Play Billing, so the app
/// never links to website checkout. Set to false only as an emergency kill
/// switch: paid features and the billing screen are hidden again.
class AppBilling {
  static const bool iapEnabled = true;

  static const String freeAppMessage =
      'This isn’t available in the free Android app yet.';
}
