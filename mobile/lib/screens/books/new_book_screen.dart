import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:bookai_mobile/config/api_config.dart';
import 'package:bookai_mobile/config/app_billing.dart';
import 'package:bookai_mobile/providers/auth_provider.dart';
import 'package:bookai_mobile/providers/books_provider.dart';
import 'package:bookai_mobile/providers/new_book_draft_provider.dart';
import 'package:bookai_mobile/services/api_client.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/common.dart';
import 'package:bookai_mobile/widgets/premium_upgrade_sheet.dart';

const _genres = [
  'Fiction',
  'Non-Fiction',
  'Self-Help',
  'Business',
  'Science Fiction',
  'Fantasy',
  'Romance',
  'Thriller',
  'Mystery',
  'Technology',
];

class NewBookScreen extends StatefulWidget {
  const NewBookScreen({super.key});

  @override
  State<NewBookScreen> createState() => _NewBookScreenState();
}

class _NewBookScreenState extends State<NewBookScreen> {
  final _title = TextEditingController();
  final _description = TextEditingController();
  final _customInstructions = TextEditingController();
  final _characters = TextEditingController();
  String _genre = 'Fiction';
  double _pages = 40;
  bool _starting = false;
  bool _audiobookAfter = false;
  bool _showAdvanced = false;
  String? _enhancing;
  bool _restored = false;
  NewBookDraftProvider? _draft;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _draft = context.read<NewBookDraftProvider>();
    if (_restored) return;
    _restored = true;
    final draft = _draft!;
    _title.text = draft.title;
    _description.text = draft.description;
    _customInstructions.text = draft.customInstructions;
    _characters.text = draft.characters;
    _genre = draft.genre;
    _pages = draft.pages.clamp(5, AppBilling.iapEnabled ? 500 : 50);
    _audiobookAfter = AppBilling.iapEnabled && draft.audiobookAfter;
    _showAdvanced = draft.showAdvanced;
  }

  void _persistDraft() {
    _draft?.save(
      title: _title.text,
      description: _description.text,
      customInstructions: _customInstructions.text,
      characters: _characters.text,
      genre: _genre,
      pages: _pages,
      audiobookAfter: _audiobookAfter,
      showAdvanced: _showAdvanced,
    );
  }

  @override
  void dispose() {
    _persistDraft();
    _title.dispose();
    _description.dispose();
    _customInstructions.dispose();
    _characters.dispose();
    super.dispose();
  }

  Future<void> _enhance(String field, TextEditingController controller) async {
    if (_enhancing != null) return;
    if (controller.text.trim().length < 3 &&
        _title.text.trim().isEmpty &&
        _genre.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Add a title or a short draft first.'),
        ),
      );
      return;
    }

    setState(() => _enhancing = field);
    final api = context.read<ApiClient>();
    try {
      final res = await api.dio.post(
        ApiConfig.enhancePrompt,
        data: {
          'field': field,
          'text': controller.text,
          'title': _title.text.trim(),
          'genre': _genre,
          'tone': 'Professional',
        },
      );
      final text = res.data['text'] as String?;
      if (text != null && text.isNotEmpty) {
        controller.text = text;
        controller.selection = TextSelection.collapsed(offset: text.length);
        _persistDraft();
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Prompt enhanced')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(api.extractError(e))),
      );
    } finally {
      if (mounted) setState(() => _enhancing = null);
    }
  }

  Future<void> _create() async {
    if (_title.text.trim().isEmpty || _description.text.trim().length < 20) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Add a title and a short description (20+ chars).'),
        ),
      );
      return;
    }

    final auth = context.read<AuthProvider>();
    await auth.refreshUser();
    if (!mounted) return;
    final remaining = auth.user?.pagesRemaining;
    final target = _pages.round();
    if (remaining != null && target > remaining) {
      await showPremiumUpgradeSheet(
        context,
        featureLabel:
            'Insufficient page credits — you have $remaining pages remaining, but this book needs $target. Upgrade for more monthly pages.',
      );
      return;
    }

    setState(() => _starting = true);
    _persistDraft();
    final books = context.read<BooksProvider>();
    final book = await books.createBook(
      title: _title.text.trim(),
      description: _description.text.trim(),
      genre: _genre,
      targetPages: target,
      // API defers enqueue; book detail shows Normal / Super Fast first.
      startGeneration: true,
      generateAudiobookOnComplete: _audiobookAfter,
      customInstructions: _customInstructions.text.trim().isEmpty
          ? null
          : _customInstructions.text.trim(),
      characters: _characters.text.trim().isEmpty
          ? null
          : _characters.text.trim(),
    );
    if (!mounted) return;
    setState(() => _starting = false);
    if (book != null) {
      _draft?.clear();
      context.go('/books/${book.id}?generate=1');
    } else {
      final err = books.error ?? 'Could not create book';
      if (RegExp(
        r'insufficient page credits|pages remaining|allows up to .* pages',
        caseSensitive: false,
      ).hasMatch(err)) {
        await showPremiumUpgradeSheet(context, featureLabel: err);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(err)),
        );
      }
    }
  }

  Widget _enhanceButton(String field, TextEditingController controller) {
    final loading = _enhancing == field;
    return TextButton.icon(
      onPressed: _enhancing != null
          ? null
          : () => _enhance(field, controller),
      icon: loading
          ? const SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : const Icon(Icons.auto_awesome, size: 16),
      label: Text(loading ? 'Enhancing…' : 'Enhance'),
      style: TextButton.styleFrom(
        foregroundColor: AppColors.primary,
        visualDensity: VisualDensity.compact,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('New book')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          const Text(
            'Title & premise',
            style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _title,
            decoration: const InputDecoration(
              labelText: 'Title',
              hintText: 'The Quiet Algorithm',
            ),
            maxLength: 200,
            onChanged: (_) => _persistDraft(),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Description',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: AppColors.textBody,
                  ),
                ),
              ),
              _enhanceButton('description', _description),
            ],
          ),
          const SizedBox(height: 6),
          TextField(
            controller: _description,
            decoration: const InputDecoration(
              hintText: 'What is this book about?',
              alignLabelWithHint: true,
            ),
            minLines: 4,
            maxLines: 8,
            maxLength: 5000,
            onChanged: (_) => _persistDraft(),
          ),
          const SizedBox(height: 20),
          const Text(
            'Genre',
            style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _genres.map((g) {
              final selected = g == _genre;
              return ChoiceChip(
                label: Text(g),
                selected: selected,
                onSelected: (_) {
                  setState(() => _genre = g);
                  _persistDraft();
                },
                selectedColor: AppColors.primarySoft,
                labelStyle: TextStyle(
                  color: selected ? AppColors.primary : AppColors.textBody,
                  fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                  fontSize: 13,
                ),
                side: BorderSide(
                  color: selected ? AppColors.primary : AppColors.border,
                ),
                backgroundColor: AppColors.white,
              );
            }).toList(),
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              const Text(
                'Target pages',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
              ),
              const Spacer(),
              Text(
                '${_pages.round()}',
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  color: AppColors.primary,
                  fontSize: 16,
                ),
              ),
            ],
          ),
          Slider(
            value: _pages,
            min: 5,
            max: AppBilling.iapEnabled ? 500 : 50,
            divisions: AppBilling.iapEnabled ? 48 : 9,
            label: '${_pages.round()} pages',
            onChanged: (v) {
              setState(() => _pages = v);
              _persistDraft();
            },
          ),
          if (AppBilling.iapEnabled)
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Audiobook after complete'),
              subtitle: const Text(
                'Convert to audiobook when generation finishes',
                style: TextStyle(fontSize: 12, color: AppColors.textMuted),
              ),
              value: _audiobookAfter,
              activeThumbColor: AppColors.primary,
              onChanged: (v) {
                setState(() => _audiobookAfter = v);
                _persistDraft();
              },
            ),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: () {
              setState(() => _showAdvanced = !_showAdvanced);
              _persistDraft();
            },
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(_showAdvanced ? 'Hide advanced' : 'Advanced settings'),
                const SizedBox(width: 6),
                Icon(
                  _showAdvanced
                      ? Icons.expand_less_rounded
                      : Icons.expand_more_rounded,
                  size: 18,
                ),
              ],
            ),
          ),
          if (_showAdvanced) ...[
            const SizedBox(height: 12),
            StripeCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Characters',
                          style: TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ),
                      _enhanceButton('characters', _characters),
                    ],
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _characters,
                    minLines: 3,
                    maxLines: 6,
                    decoration: const InputDecoration(
                      hintText: 'One character per line',
                    ),
                    onChanged: (_) => _persistDraft(),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Custom instructions',
                          style: TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ),
                      _enhanceButton(
                        'customInstructions',
                        _customInstructions,
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _customInstructions,
                    minLines: 3,
                    maxLines: 6,
                    decoration: const InputDecoration(
                      hintText:
                          'Pacing, chapter endings, voice notes…',
                    ),
                    onChanged: (_) => _persistDraft(),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _starting || _enhancing != null ? null : _create,
            child: _starting
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Text('Create & generate'),
          ),
        ],
      ),
    );
  }
}
