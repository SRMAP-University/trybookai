import 'dart:ui' show PlatformDispatcher;

import 'package:intl/intl.dart';

/// Subscription prices by country: ₹ in India, $ everywhere else.
/// Mirrors `REGIONAL_PRICING` in `src/lib/regional-pricing.ts`; the server's
/// answer (`/api/billing/pricing`) wins once it loads.
class PlanPricing {
  const PlanPricing({
    required this.region,
    required this.currency,
    required this.symbol,
    required this.monthly,
  });

  final String region;
  final String currency;
  final String symbol;

  /// Monthly price per plan key (PRO / ENTERPRISE / UNLIMITED).
  /// Null means the plan isn't sold in this region.
  final Map<String, num?> monthly;

  static const usd = PlanPricing(
    region: 'DEFAULT',
    currency: 'USD',
    symbol: r'$',
    monthly: {'PRO': 20, 'ENTERPRISE': 30, 'UNLIMITED': 99},
  );

  static const india = PlanPricing(
    region: 'IN',
    currency: 'INR',
    symbol: '₹',
    monthly: {'PRO': 200, 'ENTERPRISE': 1390, 'UNLIMITED': null},
  );

  /// Best guess before the server answers: the device's region setting.
  static PlanPricing forDevice() {
    final country = PlatformDispatcher.instance.locale.countryCode;
    return country?.toUpperCase() == 'IN' ? india : usd;
  }

  factory PlanPricing.fromJson(Map<String, dynamic> json) {
    final plans = json['plans'] as Map<String, dynamic>? ?? const {};
    return PlanPricing(
      region: json['region'] as String? ?? 'DEFAULT',
      currency: json['currency'] as String? ?? 'USD',
      symbol: json['symbol'] as String? ?? r'$',
      monthly: {
        for (final entry in plans.entries)
          entry.key: (entry.value as Map<String, dynamic>?)?['month'] as num?,
      },
    );
  }

  /// "$20", "₹1,390", or null when the plan isn't sold here.
  String? monthlyLabel(String plan) {
    final amount = monthly[plan];
    if (amount == null) return null;
    final format = NumberFormat.decimalPattern(
      currency == 'INR' ? 'en_IN' : 'en_US',
    );
    return '$symbol${format.format(amount)}';
  }
}
