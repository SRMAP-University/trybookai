import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:bookai_mobile/providers/books_provider.dart';
import 'package:bookai_mobile/theme/app_theme.dart';

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
  String _genre = 'Fiction';
  double _pages = 100;
  bool _starting = false;
  bool _audiobookAfter = true;

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    super.dispose();
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
    setState(() => _starting = true);
    final books = context.read<BooksProvider>();
    final book = await books.createBook(
      title: _title.text.trim(),
      description: _description.text.trim(),
      genre: _genre,
      targetPages: _pages.round(),
      startGeneration: true,
      generateAudiobookOnComplete: _audiobookAfter,
    );
    if (!mounted) return;
    setState(() => _starting = false);
    if (book != null) {
      context.go('/books/${book.id}');
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(books.error ?? 'Could not create book')),
      );
    }
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
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _description,
            decoration: const InputDecoration(
              labelText: 'Description',
              hintText: 'What is this book about?',
              alignLabelWithHint: true,
            ),
            minLines: 4,
            maxLines: 8,
            maxLength: 5000,
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
                onSelected: (_) => setState(() => _genre = g),
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
            min: 20,
            max: 500,
            divisions: 48,
            label: '${_pages.round()} pages',
            onChanged: (v) => setState(() => _pages = v),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Audiobook after complete'),
            subtitle: const Text(
              'Convert to audiobook when generation finishes',
              style: TextStyle(fontSize: 12, color: AppColors.textMuted),
            ),
            value: _audiobookAfter,
            activeThumbColor: AppColors.primary,
            onChanged: (v) => setState(() => _audiobookAfter = v),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _starting ? null : _create,
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
