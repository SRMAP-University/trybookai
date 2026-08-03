import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:bookai_mobile/config/api_config.dart';
import 'package:bookai_mobile/providers/auth_provider.dart';
import 'package:bookai_mobile/services/api_client.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/common.dart';
import 'package:go_router/go_router.dart';

class AudioStudioScreen extends StatefulWidget {
  const AudioStudioScreen({super.key});

  @override
  State<AudioStudioScreen> createState() => _AudioStudioScreenState();
}

class _AudioStudioScreenState extends State<AudioStudioScreen> {
  final _title = TextEditingController();
  final _text = TextEditingController();
  String _type = 'AUDIOBOOK';
  PlatformFile? _pdf;
  bool _busy = false;

  @override
  void dispose() {
    _title.dispose();
    _text.dispose();
    super.dispose();
  }

  Future<void> _pickPdf() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf'],
      withData: true,
    );
    if (result == null || result.files.isEmpty) return;
    setState(() => _pdf = result.files.first);
    if (_title.text.trim().isEmpty) {
      _title.text = _pdf!.name.replaceAll(RegExp(r'\.pdf$', caseSensitive: false), '');
    }
  }

  Future<void> _generate() async {
    final auth = context.read<AuthProvider>();
    if (auth.user?.plan == 'FREE' && !(auth.user?.onTrial ?? false)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Audio requires Pro, Premium, or a trial.')),
      );
      context.go('/billing');
      return;
    }
    if (_title.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Add a title')),
      );
      return;
    }
    if (_pdf == null && _text.text.trim().split(RegExp(r'\s+')).length < 40) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Paste ~40+ words or upload a PDF')),
      );
      return;
    }

    setState(() => _busy = true);
    try {
      final api = context.read<ApiClient>();
      final form = FormData.fromMap({
        'title': _title.text.trim(),
        'type': _type,
        if (_text.text.trim().isNotEmpty) 'text': _text.text.trim(),
        if (_pdf?.bytes != null)
          'file': MultipartFile.fromBytes(
            _pdf!.bytes!,
            filename: _pdf!.name,
          ),
      });
      await api.dio.post(ApiConfig.studioAudio, data: form);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Audio job started')),
      );
      _text.clear();
      setState(() => _pdf = null);
      await auth.refreshUser();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.read<ApiClient>().extractError(e))),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;

    return Scaffold(
      appBar: AppBar(title: const Text('Audio Studio')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          if (user != null)
            StripeCard(
              padding: const EdgeInsets.all(14),
              child: ProgressRow(
                label: 'Audio left this month',
                value: (user.audioMinutesLimit - user.audioMinutesUsed)
                    .clamp(0, user.audioMinutesLimit),
                total: user.audioMinutesLimit,
                unit: ' min',
              ),
            ),
          const SizedBox(height: 16),
          TextField(
            controller: _title,
            decoration: const InputDecoration(labelText: 'Title'),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _text,
            enabled: _pdf == null,
            minLines: 6,
            maxLines: 12,
            decoration: const InputDecoration(
              labelText: 'Paste script',
              alignLabelWithHint: true,
              hintText: 'Paste chapters or show notes…',
            ),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: _pickPdf,
            icon: const Icon(Icons.upload_file_outlined),
            label: Text(_pdf == null ? 'Or upload PDF' : _pdf!.name),
          ),
          if (_pdf != null)
            TextButton(
              onPressed: () => setState(() => _pdf = null),
              child: const Text('Remove PDF'),
            ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(child: _typeChip('AUDIOBOOK', 'Audiobook', Icons.headphones)),
              const SizedBox(width: 10),
              Expanded(child: _typeChip('PODCAST', 'Podcast', Icons.mic_none_rounded)),
            ],
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _busy ? null : _generate,
            child: _busy
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : Text('Generate ${_type == 'PODCAST' ? 'podcast' : 'audiobook'}'),
          ),
        ],
      ),
    );
  }

  Widget _typeChip(String id, String label, IconData icon) {
    final selected = _type == id;
    return InkWell(
      onTap: () => setState(() => _type = id),
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: selected ? AppColors.primary : AppColors.border,
          ),
          color: selected ? AppColors.primarySoft : AppColors.white,
        ),
        child: Row(
          children: [
            Icon(icon, size: 18, color: selected ? AppColors.primary : AppColors.textMuted),
            const SizedBox(width: 8),
            Text(
              label,
              style: TextStyle(
                fontWeight: FontWeight.w600,
                color: selected ? AppColors.primary : AppColors.navy,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
