import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:bookai_mobile/providers/auth_provider.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/common.dart';

class UsageScreen extends StatelessWidget {
  const UsageScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;

    return Scaffold(
      appBar: AppBar(title: const Text('Usage')),
      body: user == null
          ? const Center(child: Text('Sign in to view usage'))
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                StripeCard(
                  child: ProgressRow(
                    label: 'Pages this cycle',
                    value: user.pagesUsed,
                    total: user.pagesLimit,
                  ),
                ),
                const SizedBox(height: 12),
                StripeCard(
                  child: ProgressRow(
                    label: 'Audio minutes',
                    value: user.audioMinutesUsed,
                    total: user.audioMinutesLimit,
                    unit: ' min',
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  'Plan: ${user.onTrial ? 'Premium trial' : user.planLabel}',
                  style: const TextStyle(color: AppColors.textMuted),
                ),
              ],
            ),
    );
  }
}
