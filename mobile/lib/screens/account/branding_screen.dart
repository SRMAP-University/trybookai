import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:bookai_mobile/config/api_config.dart';
import 'package:bookai_mobile/services/api_client.dart';
import 'package:bookai_mobile/theme/app_theme.dart';

class BrandingScreen extends StatefulWidget {
  const BrandingScreen({super.key});

  @override
  State<BrandingScreen> createState() => _BrandingScreenState();
}

class _BrandingScreenState extends State<BrandingScreen> {
  final _brandName = TextEditingController();
  final _authorName = TextEditingController();
  final _tagline = TextEditingController();
  final _website = TextEditingController();
  final _imprint = TextEditingController();
  bool _loading = true;
  bool _saving = false;
  bool _includeInExport = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _brandName.dispose();
    _authorName.dispose();
    _tagline.dispose();
    _website.dispose();
    _imprint.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final api = context.read<ApiClient>();
      final res = await api.dio.get(ApiConfig.branding);
      final data = res.data as Map<String, dynamic>;
      setState(() {
        _brandName.text = data['brandName'] as String? ?? '';
        _authorName.text = data['authorName'] as String? ?? '';
        _tagline.text = data['brandTagline'] as String? ?? '';
        _website.text = data['websiteUrl'] as String? ?? '';
        _imprint.text = data['imprintName'] as String? ?? '';
        _includeInExport = data['includeBrandInExport'] as bool? ?? true;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final api = context.read<ApiClient>();
    try {
      await api.dio.patch(
        ApiConfig.branding,
        data: {
          'brandName': _brandName.text.trim().isEmpty
              ? null
              : _brandName.text.trim(),
          'authorName': _authorName.text.trim().isEmpty
              ? null
              : _authorName.text.trim(),
          'brandTagline':
              _tagline.text.trim().isEmpty ? null : _tagline.text.trim(),
          'websiteUrl':
              _website.text.trim().isEmpty ? null : _website.text.trim(),
          'imprintName':
              _imprint.text.trim().isEmpty ? null : _imprint.text.trim(),
          'includeBrandInExport': _includeInExport,
        },
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Branding saved')),
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Branding')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                const Text(
                  'Shown on public book pages and exports.',
                  style: TextStyle(color: AppColors.textMuted, fontSize: 13),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _authorName,
                  decoration: const InputDecoration(labelText: 'Author name'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _brandName,
                  decoration: const InputDecoration(labelText: 'Brand name'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _imprint,
                  decoration: const InputDecoration(labelText: 'Imprint'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _tagline,
                  decoration: const InputDecoration(labelText: 'Tagline'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _website,
                  decoration: const InputDecoration(labelText: 'Website URL'),
                  keyboardType: TextInputType.url,
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Include brand in exports'),
                  value: _includeInExport,
                  activeThumbColor: AppColors.primary,
                  onChanged: (v) => setState(() => _includeInExport = v),
                ),
                const SizedBox(height: 12),
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
                      : const Text('Save branding'),
                ),
              ],
            ),
    );
  }
}
