import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:bookai_mobile/config/api_config.dart';
import 'package:bookai_mobile/providers/auth_provider.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/common.dart';

class BillingScreen extends StatelessWidget {
  const BillingScreen({super.key});

  static Uri get _webBillingUri =>
      Uri.parse('${ApiConfig.baseUrl}/dashboard/billing');

  Future<void> _openWebsite(BuildContext context) async {
    final ok = await launchUrl(
      _webBillingUri,
      mode: LaunchMode.externalApplication,
    );
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open the website')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;

    return Scaffold(
      appBar: AppBar(title: const Text('Billing')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          if (user != null)
            StripeCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Current · ${user.onTrial ? 'Free trial' : user.planLabel}',
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${user.pagesUsed}/${user.pagesLimit} pages · ${user.audioMinutesUsed}/${user.audioMinutesLimit} min audio',
                    style: const TextStyle(
                      color: AppColors.textMuted,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 16),
          StripeCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.primarySoft,
                    borderRadius: BorderRadius.circular(99),
                  ),
                  child: const Text(
                    'Coming soon',
                    style: TextStyle(
                      color: AppColors.primary,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                const Text(
                  'In-app purchases coming soon',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 17,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Google Play billing is not available in the app yet. '
                  'Subscribe on the BookAI website — your plan applies here after you sign in with the same account.',
                  style: TextStyle(
                    color: AppColors.textMuted,
                    fontSize: 13,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: () => _openWebsite(context),
                    icon: const Icon(Icons.open_in_new_rounded, size: 18),
                    label: const Text('Subscribe on website'),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          _planPreview(
            name: 'Pro',
            price: r'$20',
            period: '/mo',
            features: const [
              '5,000 pages / mo',
              '1 hour audiobook',
              'Private books',
            ],
            current: user?.plan == 'PRO',
          ),
          const SizedBox(height: 12),
          _planPreview(
            name: 'Premium',
            price: r'$30',
            period: '/mo',
            features: const [
              '10,000 pages / mo',
              '3 hours audiobook',
              'Priority support',
            ],
            highlight: true,
            current: user?.plan == 'ENTERPRISE',
          ),
          const SizedBox(height: 12),
          _planPreview(
            name: 'Unlimited',
            price: r'$99',
            period: '/mo',
            features: const [
              'Unlimited pages*',
              'Unlimited audio*',
              'Fair use applies',
            ],
            current: user?.plan == 'UNLIMITED',
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => _openWebsite(context),
              icon: const Icon(Icons.open_in_new_rounded, size: 18),
              label: const Text('Subscribe on website'),
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            '*Unlimited is subject to fair-use Terms (rate limits). '
            'Manage or cancel a website subscription from trybookai.com.',
            style: TextStyle(fontSize: 11, color: AppColors.textMuted, height: 1.4),
          ),
        ],
      ),
    );
  }

  Widget _planPreview({
    required String name,
    required String price,
    required String period,
    required List<String> features,
    bool highlight = false,
    bool current = false,
  }) {
    return StripeCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                name,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
              ),
              if (highlight) ...[
                const SizedBox(width: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.navy,
                    borderRadius: BorderRadius.circular(99),
                  ),
                  child: const Text(
                    'Popular',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
              if (current) ...[
                const SizedBox(width: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.primarySoft,
                    borderRadius: BorderRadius.circular(99),
                  ),
                  child: const Text(
                    'Current',
                    style: TextStyle(
                      color: AppColors.primary,
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 8),
          Text.rich(
            TextSpan(
              text: price,
              style: const TextStyle(
                fontSize: 32,
                fontWeight: FontWeight.w800,
                letterSpacing: -1,
              ),
              children: [
                TextSpan(
                  text: ' $period',
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: AppColors.textMuted,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          ...features.map(
            (f) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                children: [
                  const Icon(Icons.check, size: 16, color: AppColors.navy),
                  const SizedBox(width: 8),
                  Text(
                    f,
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppColors.textBody,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
