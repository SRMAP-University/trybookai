import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:bookai_mobile/config/api_config.dart';
import 'package:bookai_mobile/services/api_client.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/common.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _loading = true;
  bool _saving = false;
  String _pov = 'third';
  String _tense = 'past';
  String _language = 'en';
  String _genre = 'Fiction';
  String _tone = 'Professional';
  double _creativity = 0.7;
  double _targetPages = 40;
  bool _autoGenerate = true;
  bool _pushNotifications = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final api = context.read<ApiClient>();
      final res = await api.dio.get(ApiConfig.settings);
      final data = res.data as Map<String, dynamic>;
      setState(() {
        _pov = data['defaultPov'] as String? ?? 'third';
        _tense = data['defaultTense'] as String? ?? 'past';
        _language = data['defaultLanguage'] as String? ?? 'en';
        _genre = data['defaultGenre'] as String? ?? 'Fiction';
        _tone = data['defaultTone'] as String? ?? 'Professional';
        _creativity = (data['defaultCreativity'] as num?)?.toDouble() ?? 0.7;
        _targetPages =
            (data['defaultTargetPages'] as num?)?.toDouble() ?? 40;
        _autoGenerate = data['autoGenerateOnCreate'] as bool? ?? true;
        _pushNotifications = data['pushNotifications'] as bool? ?? true;
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
        ApiConfig.settings,
        data: {
          'defaultPov': _pov,
          'defaultTense': _tense,
          'defaultLanguage': _language,
          'defaultGenre': _genre,
          'defaultTone': _tone,
          'defaultCreativity': _creativity,
          'defaultTargetPages': _targetPages.round(),
          'autoGenerateOnCreate': _autoGenerate,
          'pushNotifications': _pushNotifications,
        },
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Defaults saved')),
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
      appBar: AppBar(title: const Text('Writing defaults')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
              children: [
                const MenuSectionLabel('Style'),
                StripeCard(
                  child: Column(
                    children: [
                      DropdownButtonFormField<String>(
                        initialValue: _genre,
                        decoration:
                            const InputDecoration(labelText: 'Default genre'),
                        items: const [
                          'Fiction',
                          'Non-Fiction',
                          'Self-Help',
                          'Business',
                          'Science Fiction',
                          'Fantasy',
                          'Romance',
                          'Thriller',
                        ]
                            .map(
                              (g) =>
                                  DropdownMenuItem(value: g, child: Text(g)),
                            )
                            .toList(),
                        onChanged: (v) =>
                            setState(() => _genre = v ?? 'Fiction'),
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        initialValue: _tone,
                        decoration:
                            const InputDecoration(labelText: 'Default tone'),
                        items: const [
                          'Professional',
                          'Casual',
                          'Academic',
                          'Narrative',
                          'Inspirational',
                        ]
                            .map(
                              (t) =>
                                  DropdownMenuItem(value: t, child: Text(t)),
                            )
                            .toList(),
                        onChanged: (v) =>
                            setState(() => _tone = v ?? 'Professional'),
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        initialValue: _pov,
                        decoration:
                            const InputDecoration(labelText: 'Point of view'),
                        items: const [
                          DropdownMenuItem(
                              value: 'first', child: Text('First person')),
                          DropdownMenuItem(
                              value: 'second', child: Text('Second person')),
                          DropdownMenuItem(
                              value: 'third', child: Text('Third person')),
                        ],
                        onChanged: (v) => setState(() => _pov = v ?? 'third'),
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        initialValue: _tense,
                        decoration: const InputDecoration(labelText: 'Tense'),
                        items: const [
                          DropdownMenuItem(value: 'past', child: Text('Past')),
                          DropdownMenuItem(
                              value: 'present', child: Text('Present')),
                        ],
                        onChanged: (v) => setState(() => _tense = v ?? 'past'),
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        initialValue: _language,
                        decoration:
                            const InputDecoration(labelText: 'Language'),
                        items: const [
                          DropdownMenuItem(value: 'en', child: Text('English')),
                          DropdownMenuItem(value: 'es', child: Text('Spanish')),
                          DropdownMenuItem(value: 'fr', child: Text('French')),
                          DropdownMenuItem(value: 'de', child: Text('German')),
                        ],
                        onChanged: (v) =>
                            setState(() => _language = v ?? 'en'),
                      ),
                    ],
                  ),
                ),
                const MenuSectionLabel('Length & creativity'),
                StripeCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Default pages ${_targetPages.round()}',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      Slider(
                        value: _targetPages,
                        min: 5,
                        max: 500,
                        divisions: 48,
                        onChanged: (v) => setState(() => _targetPages = v),
                      ),
                      Text(
                        'Creativity ${_creativity.toStringAsFixed(1)}',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      Slider(
                        value: _creativity,
                        min: 0,
                        max: 1.5,
                        divisions: 15,
                        onChanged: (v) => setState(() => _creativity = v),
                      ),
                    ],
                  ),
                ),
                const MenuSectionLabel('Automation'),
                StripeCard(
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: [
                      SwitchListTile(
                        title: const Text('Auto-generate on create'),
                        subtitle: const Text(
                          'Start writing as soon as a book is created',
                          style: TextStyle(
                            fontSize: 12,
                            color: AppColors.textMuted,
                          ),
                        ),
                        value: _autoGenerate,
                        activeThumbColor: AppColors.primary,
                        onChanged: (v) => setState(() => _autoGenerate = v),
                      ),
                      const Divider(height: 1, indent: 16, endIndent: 16),
                      SwitchListTile(
                        title: const Text('Push notifications'),
                        subtitle: const Text(
                          'Alerts when a book is writing and when it finishes',
                          style: TextStyle(
                            fontSize: 12,
                            color: AppColors.textMuted,
                          ),
                        ),
                        value: _pushNotifications,
                        activeThumbColor: AppColors.primary,
                        onChanged: (v) =>
                            setState(() => _pushNotifications = v),
                      ),
                    ],
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
                      : const Text('Save defaults'),
                ),
              ],
            ),
    );
  }
}
