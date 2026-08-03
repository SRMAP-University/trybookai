import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:bookai_mobile/services/api_client.dart';

class FileDownloadService {
  FileDownloadService(this._api);

  final ApiClient _api;

  static String safeFilename(String name, {required String extension}) {
    final base = name
        .replaceAll(RegExp(r'[^\w\s\-.]'), '')
        .trim()
        .replaceAll(RegExp(r'\s+'), '-');
    final cleaned = base.isEmpty ? 'bookai' : base;
    final ext = extension.startsWith('.') ? extension : '.$extension';
    return cleaned.toLowerCase().endsWith(ext.toLowerCase())
        ? cleaned
        : '$cleaned$ext';
  }

  Future<Directory> _targetDir() async {
    if (!kIsWeb && Platform.isAndroid) {
      final downloads = await getExternalStorageDirectory();
      if (downloads != null) return downloads;
    }
    return getTemporaryDirectory();
  }

  Future<File> _writeBytes(String filename, List<int> bytes) async {
    final dir = await _targetDir();
    final file = File(p.join(dir.path, filename));
    await file.writeAsBytes(bytes, flush: true);
    return file;
  }

  Future<void> _shareFiles(
    List<File> files, {
    String? subject,
    String? text,
  }) async {
    await SharePlus.instance.share(
      ShareParams(
        files: [
          for (final f in files) XFile(f.path, name: p.basename(f.path)),
        ],
        subject: subject,
        text: text,
      ),
    );
  }

  /// Download authenticated API bytes (e.g. book export) and open the share sheet.
  Future<File> downloadApiAndShare({
    required String path,
    required String filename,
    String? subject,
  }) async {
    final res = await _api.dio.get<List<int>>(
      path,
      options: Options(
        responseType: ResponseType.bytes,
        followRedirects: true,
        receiveTimeout: const Duration(minutes: 3),
        // Export returns markdown, not JSON.
        headers: {'Accept': '*/*'},
      ),
    );
    final bytes = res.data;
    if (bytes == null || bytes.isEmpty) {
      throw Exception('Empty download');
    }
    final file = await _writeBytes(filename, bytes);
    await _shareFiles([file], subject: subject, text: filename);
    return file;
  }

  /// Download a public/direct URL (e.g. R2 audiobook) and open the share sheet.
  Future<File> downloadUrlAndShare({
    required String url,
    required String filename,
    String? subject,
  }) async {
    final file = await downloadUrlToFile(url: url, filename: filename);
    await _shareFiles([file], subject: subject, text: filename);
    return file;
  }

  Future<File> downloadUrlToFile({
    required String url,
    required String filename,
  }) async {
    final res = await Dio().get<List<int>>(
      url,
      options: Options(
        responseType: ResponseType.bytes,
        followRedirects: true,
        receiveTimeout: const Duration(minutes: 10),
      ),
    );
    final bytes = res.data;
    if (bytes == null || bytes.isEmpty) {
      throw Exception('Empty download');
    }
    return _writeBytes(filename, bytes);
  }

  /// Download several URLs, then share all files together.
  Future<List<File>> downloadUrlsAndShare({
    required List<({String url, String filename})> items,
    String? subject,
    String? text,
  }) async {
    final files = <File>[];
    for (final item in items) {
      files.add(
        await downloadUrlToFile(url: item.url, filename: item.filename),
      );
    }
    if (files.isEmpty) throw Exception('Nothing to download');
    await _shareFiles(files, subject: subject, text: text);
    return files;
  }
}
