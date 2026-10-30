import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:bookai_mobile/models/reel.dart';
import 'package:bookai_mobile/services/api_client.dart';

/// A narrator for reels.
typedef ReelVoice = ({String id, String name, String description});

/// Story Reels endpoints (the same ones the website uses). Calls throw an
/// [Exception] with a readable message on failure.
class ReelsApi {
  ReelsApi(this._api);

  final ApiClient _api;

  Exception _fail(Object e) => Exception(_api.extractError(e));

  /// A book's reels and this month's allowance.
  Future<({List<ReelView> reels, ReelAllowance? allowance})> list(
    String bookId,
  ) async {
    try {
      final res = await _api.dio.get(
        '/api/reels',
        queryParameters: {'bookId': bookId},
      );
      final data = res.data as Map<String, dynamic>;
      return (
        reels: ((data['reels'] as List?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(ReelView.fromJson)
            .toList(),
        allowance: data['allowance'] is Map<String, dynamic>
            ? ReelAllowance.fromJson(data['allowance'] as Map<String, dynamic>)
            : null,
      );
    } catch (e) {
      throw _fail(e);
    }
  }

  Future<ReelView> get(String id) async {
    try {
      final res = await _api.dio.get('/api/reels/$id');
      return ReelView.fromJson(
        (res.data as Map<String, dynamic>)['reel'] as Map<String, dynamic>,
      );
    } catch (e) {
      throw _fail(e);
    }
  }

  Future<ReelView> create({
    required String bookId,
    required String format,
    List<String>? chapterIds,
    required String stylePreset,
    required String pacing,
    ReelVoice? voice,
    required String music,
  }) async {
    try {
      final res = await _api.dio.post(
        '/api/reels',
        data: {
          'bookId': bookId,
          'format': format,
          'chapterIds': ?chapterIds,
          'stylePreset': stylePreset,
          'pacing': pacing,
          if (voice != null) ...{'voiceId': voice.id, 'voiceName': voice.name},
          'voiceSettings': {'backgroundMusic': music},
        },
        options: Options(receiveTimeout: const Duration(minutes: 2)),
      );
      return ReelView.fromJson(
        (res.data as Map<String, dynamic>)['reel'] as Map<String, dynamic>,
      );
    } catch (e) {
      throw _fail(e);
    }
  }

  /// Turns the share link on and returns it.
  Future<({String token, String url})> share(String id) async {
    try {
      final res = await _api.dio.post('/api/reels/$id/share');
      final data = res.data as Map<String, dynamic>;
      return (token: data['shareToken'] as String, url: data['url'] as String);
    } catch (e) {
      throw _fail(e);
    }
  }

  Future<void> unshare(String id) async {
    try {
      await _api.dio.delete('/api/reels/$id/share');
    } catch (e) {
      throw _fail(e);
    }
  }

  Future<void> delete(String id) async {
    try {
      await _api.dio.delete('/api/reels/$id');
    } catch (e) {
      throw _fail(e);
    }
  }

  /// Keeps a reel's generation running and reports its progress, the way
  /// the website watches it. Returns a function that stops watching.
  void Function() watch(
    String id, {
    bool retry = false,
    required void Function(String type, Map<String, dynamic> data) onEvent,
    void Function()? onDone,
  }) {
    final cancel = CancelToken();
    var stopped = false;
    () async {
      try {
        final res = await _api.dio.post<ResponseBody>(
          '/api/reels/$id/stream',
          data: {'retry': retry},
          options: Options(
            responseType: ResponseType.stream,
            headers: {'Accept': 'text/event-stream'},
            receiveTimeout: const Duration(minutes: 10),
          ),
          cancelToken: cancel,
        );
        final stream = res.data?.stream;
        if (stream == null) return;
        var buffer = '';
        await for (final Uint8List chunk in stream) {
          if (stopped) break;
          buffer += utf8.decode(chunk, allowMalformed: true);
          while (true) {
            final sep = buffer.indexOf('\n\n');
            if (sep < 0) break;
            final block = buffer.substring(0, sep);
            buffer = buffer.substring(sep + 2);
            for (final line in block.split('\n')) {
              if (!line.startsWith('data:')) continue;
              try {
                final data = jsonDecode(line.substring(5).trim());
                if (data is Map<String, dynamic> && !stopped) {
                  onEvent('${data['type'] ?? ''}', data);
                }
              } catch (_) {}
            }
          }
        }
      } catch (_) {
        // Polling the reel keeps the screen current if the stream drops.
      } finally {
        if (!stopped) onDone?.call();
      }
    }();
    return () {
      stopped = true;
      cancel.cancel('stopped');
    };
  }

  /// Narrators to choose from, and the default one.
  Future<({List<ReelVoice> voices, String? defaultId})> voices() async {
    try {
      final res = await _api.dio.get('/api/audio/voices');
      final data = res.data as Map<String, dynamic>;
      final voices = <ReelVoice>[
        for (final v in (data['voices'] as List?) ?? const [])
          if (v is Map && v['id'] is String)
            (
              id: v['id'] as String,
              name: v['name'] as String? ?? 'Narrator',
              description: v['description'] as String? ?? '',
            ),
      ];
      return (voices: voices, defaultId: data['defaultVoiceId'] as String?);
    } catch (e) {
      throw _fail(e);
    }
  }

  /// A page of the public reel feed.
  Future<({List<ReelFeedItem> items, String? nextCursor})> feed({
    String? cursor,
  }) async {
    try {
      final res = await _api.dio.get(
        '/api/public/reel-feed',
        queryParameters: {'cursor': ?cursor},
      );
      final data = res.data as Map<String, dynamic>;
      return (
        items: ((data['items'] as List?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(ReelFeedItem.fromJson)
            .toList(),
        nextCursor: data['nextCursor'] as String?,
      );
    } catch (e) {
      throw _fail(e);
    }
  }
}
