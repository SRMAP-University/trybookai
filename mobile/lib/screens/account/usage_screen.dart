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
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user.onTrial ? 'Premium trial' : user.planLabel,
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: AppColors.primary,
                        ),
                      ),
                      const SizedBox(height: 10),
                      CompactUsageStats(
                        pagesUsed: user.pagesUsed,
                        pagesLimit: user.pagesLimit,
                        audioUsed: user.audioMinutesUsed,
                        audioLimit: user.audioMinutesLimit,
                      ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }
}
