import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:bookai_mobile/config/api_config.dart';
import 'package:bookai_mobile/providers/auth_provider.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/common.dart';

class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;

    return Scaffold(
      appBar: AppBar(title: const Text('Account')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 120),
        children: [
          StripeCard(
            child: Row(
              children: [
                CircleAvatar(
                  radius: 28,
                  backgroundColor: AppColors.primarySoft,
                  child: Text(
                    (user?.name ?? user?.email ?? '?')
                        .substring(0, 1)
                        .toUpperCase(),
                    style: const TextStyle(
                      color: AppColors.primary,
                      fontWeight: FontWeight.w700,
                      fontSize: 20,
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user?.name ?? 'Author',
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 16,
                        ),
                      ),
                      Text(
                        user?.email ?? '',
                        style: const TextStyle(
                          color: AppColors.textMuted,
                          fontSize: 13,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        user?.onTrial == true
                            ? 'Free trial'
                            : (user?.planLabel ?? 'Free'),
                        style: const TextStyle(
                          color: AppColors.primary,
                          fontWeight: FontWeight.w600,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          // Partitions = separate cards (no section titles).
          MenuSection(
            children: [
              MenuTile(
                icon: Icons.person_outline_rounded,
                label: 'Profile',
                onTap: () => context.push('/account/profile'),
              ),
              MenuTile(
                icon: Icons.palette_outlined,
                label: 'Branding',
                onTap: () => context.push('/account/branding'),
              ),
            ],
          ),
          MenuSection(
            children: [
              MenuTile(
                icon: Icons.tune_rounded,
                label: 'Writing defaults',
                onTap: () => context.push('/settings'),
              ),
            ],
          ),
          MenuSection(
            children: [
              MenuTile(
                icon: Icons.bar_chart_rounded,
                label: 'Usage',
                onTap: () => context.push('/usage'),
              ),
              MenuTile(
                icon: Icons.credit_card_rounded,
                label: 'Billing',
                onTap: () => context.push('/billing'),
              ),
            ],
          ),
          MenuSection(
            children: [
              MenuTile(
                icon: Icons.privacy_tip_outlined,
                label: 'Privacy policy',
                onTap: () => _openLegal('/privacy'),
              ),
              MenuTile(
                icon: Icons.description_outlined,
                label: 'Terms of service',
                onTap: () => _openLegal('/terms'),
              ),
            ],
          ),
          MenuSection(
            children: [
              MenuTile(
                icon: Icons.logout_rounded,
                label: 'Sign out',
                trailing: const SizedBox.shrink(),
                onTap: () async {
                  await context.read<AuthProvider>().logout();
                  if (context.mounted) context.go('/login');
                },
              ),
              MenuTile(
                icon: Icons.delete_outline_rounded,
                label: 'Delete account',
                trailing: const SizedBox.shrink(),
                onTap: () => _confirmDeleteAccount(context),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

Future<void> _openLegal(String path) async {
  final uri = Uri.parse('${ApiConfig.baseUrl}$path');
  await launchUrl(uri, mode: LaunchMode.externalApplication);
}

Future<void> _confirmDeleteAccount(BuildContext context) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Delete account?'),
      content: const Text(
        'This permanently deletes your BookAI account and all books. '
        'Cancel Google Play subscriptions in Play Store as well. '
        'This cannot be undone.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('Cancel'),
        ),
        TextButton(
          onPressed: () => Navigator.pop(ctx, true),
          style: TextButton.styleFrom(foregroundColor: AppColors.destructive),
          child: const Text('Delete'),
        ),
      ],
    ),
  );
  if (confirmed != true || !context.mounted) return;

  final auth = context.read<AuthProvider>();
  final ok = await auth.deleteAccount();
  if (!context.mounted) return;
  if (ok) {
    context.go('/login');
  } else {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(auth.error ?? 'Could not delete account')),
    );
  }
}
