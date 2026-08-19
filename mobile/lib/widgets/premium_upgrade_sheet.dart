import 'package:flutter/material.dart';
import 'package:bookai_mobile/config/app_billing.dart';

/// Paid-feature notice. No prices or checkout while Play Billing is disabled.
Future<bool> showPremiumUpgradeSheet(
  BuildContext context, {
  String featureLabel = 'This feature is not included on the free plan.',
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
  return false;
}
