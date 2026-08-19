import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:bookai_mobile/services/api_client.dart';

class GenerationStreamEvent {
  GenerationStreamEvent({required this.type, required this.data});

  final String type;
  final Map<String, dynamic> data;
}

/// Subscribes to POST /api/generate/:id/stream (SSE).
class GenerationStream {
  GenerationStream(this._api);

  final ApiClient _api;
  CancelToken? _cancel;
  bool _stopped = false;

  Future<void> listen(
    String bookId, {
    required void Function(GenerationStreamEvent event) onEvent,
    void Function()? onDone,
    void Function(Object error)? onError,
    bool resume = false,
    bool watchOnly = true,
  }) async {
    _stopped = false;
    _cancel?.cancel('replaced');
    _cancel = CancelToken();

    try {
      final params = <String>[
        if (resume) 'resume=1',
        if (watchOnly) 'watch=1',
      ];
      final qs = params.isEmpty ? '' : '?${params.join('&')}';

      final res = await _api.dio.post<ResponseBody>(
        '/api/generate/$bookId/stream$qs',
        options: Options(
          responseType: ResponseType.stream,
          headers: {
            'Accept': 'text/event-stream',
            'Cache-Control': 'no-cache',
          },
          receiveTimeout: const Duration(minutes: 8),
          sendTimeout: const Duration(seconds: 30),
        ),
        cancelToken: _cancel,
      );

      final stream = res.data?.stream;
      if (stream == null) {
        onDone?.call();
        return;
      }

      var buffer = '';
      String? eventType;
      var chunks = 0;

      await for (final Uint8List chunk in stream) {
        if (_stopped) break;
        chunks += 1;
        if (chunks % 6 == 0) {
          // Let the UI isolate handle frames / taps (prevents ANR).
          await Future<void>.delayed(Duration.zero);
          if (_stopped) break;
        }

        buffer += utf8.decode(chunk, allowMalformed: true);
        if (buffer.length > 256 * 1024) {
          buffer = buffer.substring(buffer.length - 64 * 1024);
        }

        while (true) {
          final sep = buffer.indexOf('\n\n');
          if (sep < 0) break;
          final block = buffer.substring(0, sep);
          buffer = buffer.substring(sep + 2);

          for (final line in block.split('\n')) {
            if (line.startsWith('event:')) {
              eventType = line.substring(6).trim();
            } else if (line.startsWith('data:')) {
              final raw = line.substring(5).trim();
              Map<String, dynamic> data = {};
              if (raw.length < 20000) {
                try {
                  final decoded = jsonDecode(raw);
                  if (decoded is Map<String, dynamic>) data = decoded;
                } catch (_) {}
              }
              if (_stopped) break;
              onEvent(
                GenerationStreamEvent(
                  type: eventType ?? data['type'] as String? ?? 'message',
                  data: data,
                ),
              );
              eventType = null;
            }
          }
        }
      }
      onDone?.call();
    } on DioException catch (e) {
      if (CancelToken.isCancel(e) || _stopped) {
        onDone?.call();
        return;
      }
      onError?.call(e);
    } catch (e) {
      if (!_stopped) onError?.call(e);
    }
  }

  void stop() {
    _stopped = true;
    _cancel?.cancel('stopped');
  }
}
