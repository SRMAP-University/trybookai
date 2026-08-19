import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:bookai_mobile/config/api_config.dart';
import 'package:bookai_mobile/config/app_billing.dart';
import 'package:bookai_mobile/providers/auth_provider.dart';
import 'package:bookai_mobile/services/api_client.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/common.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _name = TextEditingController();
  bool _loading = true;
  bool _saving = false;
  bool _emailNotifications = true;
  String _email = '';
  String _plan = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final api = context.read<ApiClient>();
      final res = await api.dio.get(ApiConfig.settings);
      final data = res.data as Map<String, dynamic>;
      setState(() {
        _name.text = data['name'] as String? ?? '';
        _email = data['email'] as String? ?? '';
        _plan = data['plan'] as String? ?? 'FREE';
        _emailNotifications = data['emailNotifications'] as bool? ?? true;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final api = context.read<ApiClient>();
    final auth = context.read<AuthProvider>();
    try {
      await api.dio.patch(
        ApiConfig.settings,
        data: {
          'name': _name.text.trim(),
          'emailNotifications': _emailNotifications,
        },
      );
      await auth.refreshUser();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Profile saved')),
      );
    } on DioException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(api.extractError(e))),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String get _planLabel {
    if (!AppBilling.iapEnabled) return 'Free';
    switch (_plan) {
      case 'ENTERPRISE':
        return 'Premium';
      case 'UNLIMITED':
        return 'Unlimited';
      case 'PRO':
        return 'Pro';
      default:
        return 'Free';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
              children: [
                const MenuSectionLabel('Identity'),
                StripeCard(
                  child: Column(
                    children: [
                      TextField(
                        controller: _name,
                        decoration:
                            const InputDecoration(labelText: 'Display name'),
                        textCapitalization: TextCapitalization.words,
                      ),
                      const SizedBox(height: 14),
                      InputDecorator(
                        decoration: const InputDecoration(labelText: 'Email'),
                        child: Text(
                          _email,
                          style: const TextStyle(color: AppColors.textMuted),
                        ),
                      ),
                      const SizedBox(height: 14),
                      InputDecorator(
                        decoration: const InputDecoration(labelText: 'Plan'),
                        child: Text(
                          _planLabel,
                          style: const TextStyle(
                            color: AppColors.primary,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const MenuSectionLabel('Notifications'),
                StripeCard(
                  padding: EdgeInsets.zero,
                  child: SwitchListTile(
                    title: const Text('Email notifications'),
                    subtitle: const Text(
                      'Usage alerts and product emails',
                      style:
                          TextStyle(fontSize: 12, color: AppColors.textMuted),
                    ),
                    value: _emailNotifications,
                    activeThumbColor: AppColors.primary,
                    onChanged: (v) => setState(() => _emailNotifications = v),
                  ),
                ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: _saving ? null : _save,
                  child: _saving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Text('Save profile'),
                ),
              ],
            ),
    );
  }
}
