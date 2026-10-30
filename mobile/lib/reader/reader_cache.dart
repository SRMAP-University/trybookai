import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// The last opened copy of a book and its page layout, kept on the phone so
/// reopening shows your page straight away (and works offline). Lives in the
/// cache directory, so the system may clear it; everything here is optional.
class ReaderCache {
  static Future<File> _file(String name) async {
    final base = await getApplicationCacheDirectory();
    final dir = Directory('${base.path}/reader');
    if (!await dir.exists()) await dir.create(recursive: true);
    return File('${dir.path}/$name.json');
  }

  static Future<Map<String, dynamic>?> _read(String name) async {
    try {
      final file = await _file(name);
      if (!await file.exists()) return null;
      final data = jsonDecode(await file.readAsString());
      return data is Map<String, dynamic> ? data : null;
    } catch (_) {
      return null;
    }
  }

  static Future<void> _write(String name, Map<String, dynamic> data) async {
    try {
      final file = await _file(name);
      await file.writeAsString(jsonEncode(data));
    } catch (_) {}
  }

  static Future<Map<String, dynamic>?> book(String id) => _read('book_$id');

  static Future<void> saveBook(String id, Map<String, dynamic> json) =>
      _write('book_$id', json);

  /// Saved pages for [id], only if they were laid out under [key].
  static Future<List<dynamic>?> layout(String id, String key) async {
    final data = await _read('layout_$id');
    if (data == null || data['key'] != key) return null;
    return data['pages'] as List<dynamic>?;
  }

  static Future<void> saveLayout(String id, String key, List<Object> pages) =>
      _write('layout_$id', {'key': key, 'pages': pages});
}
