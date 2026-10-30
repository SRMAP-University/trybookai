import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// The book and chapter last open in the reader.
typedef LastRead = ({String bookId, int chapter, int total});

/// Remembers where the reader left off, for "Continue reading" on Home.
class ReaderMemory {
  static const _storage = FlutterSecureStorage();
  static const _key = 'reader_last';
  static final last = ValueNotifier<LastRead?>(null);
  static bool _loaded = false;

  static Future<void> load() async {
    if (_loaded) return;
    _loaded = true;
    try {
      final parts = (await _storage.read(key: _key))?.split('|');
      if (parts == null || parts.length != 3) return;
      final chapter = int.tryParse(parts[1]);
      final total = int.tryParse(parts[2]);
      if (chapter == null || total == null) return;
      last.value ??= (bookId: parts[0], chapter: chapter, total: total);
    } catch (_) {}
  }

  static void remember(String bookId, int chapter, int total) {
    last.value = (bookId: bookId, chapter: chapter, total: total);
    _storage
        .write(key: _key, value: '$bookId|$chapter|$total')
        .catchError((_) {});
  }
}
