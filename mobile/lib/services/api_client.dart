import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:bookai_mobile/config/api_config.dart';

class ApiClient {
  ApiClient() {
    _dio = Dio(
      BaseOptions(
        baseUrl: ApiConfig.baseUrl,
        connectTimeout: const Duration(seconds: 30),
        receiveTimeout: const Duration(seconds: 60),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-BookAI-Client': _clientPlatform,
          'X-BookAI-App-Version': ApiConfig.appVersion,
        },
      ),
    );

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _readToken();
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          // Ensure client headers survive any per-request overrides.
          options.headers['X-BookAI-Client'] ??= _clientPlatform;
          options.headers['X-BookAI-App-Version'] ??= ApiConfig.appVersion;
          handler.next(options);
        },
        onError: (error, handler) {
          handler.next(error);
        },
      ),
    );
  }

  static String get _clientPlatform {
    if (Platform.isIOS) return 'ios';
    if (Platform.isAndroid) return 'android';
    return 'unknown';
  }

  static const _tokenKey = 'bookai_mobile_token';
  final _storage = const FlutterSecureStorage();
  late final Dio _dio;
  String? _cachedToken;

  Dio get dio => _dio;

  Future<String?> _readToken() async {
    if (_cachedToken != null && _cachedToken!.isNotEmpty) {
      return _cachedToken;
    }
    final token = await _storage.read(key: _tokenKey);
    _cachedToken = token;
    return token;
  }

  Future<void> setToken(String? token) async {
    _cachedToken = token;
    if (token == null || token.isEmpty) {
      _cachedToken = null;
      await _storage.delete(key: _tokenKey);
    } else {
      await _storage.write(key: _tokenKey, value: token);
    }
  }

  Future<String?> getToken() => _readToken();

  Future<bool> get hasToken async {
    final t = await getToken();
    return t != null && t.isNotEmpty;
  }

  String extractError(Object error) {
    if (error is DioException) {
      final data = error.response?.data;
      if (data is Map && data['error'] is String) {
        return data['error'] as String;
      }
      return error.message ?? 'Network error';
    }
    return error.toString();
  }
}
