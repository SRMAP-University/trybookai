import 'dart:async';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:bookai_mobile/config/api_config.dart';
import 'package:bookai_mobile/firebase_options.dart';
import 'package:bookai_mobile/services/api_client.dart';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  if (Firebase.apps.isEmpty && DefaultFirebaseOptions.isConfigured) {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  }
}

typedef NotificationTapCallback = void Function(String? bookId);

/// Registers FCM tokens with the BookAI API and shows foreground notifications.
class PushNotificationService {
  PushNotificationService(this._api);

  final ApiClient _api;
  final _local = FlutterLocalNotificationsPlugin();
  bool _localReady = false;
  bool _fcmReady = false;
  String? _token;
  bool _registering = false;
  NotificationTapCallback? onNotificationTap;

  /// True once Firebase Messaging is usable (token may still be pending).
  bool get isReady => _fcmReady;
  bool get localReady => _localReady;
  String? get token => _token;

  Future<void> initialize() async {
    if (kIsWeb) return;

    try {
      await _ensureLocalReady();
    } catch (e, st) {
      debugPrint('[push] local init failed: $e\n$st');
    }

    if (!DefaultFirebaseOptions.isConfigured) return;
    if (_fcmReady) {
      await registerToken();
      return;
    }

    try {
      await _initializeFcm();
      _fcmReady = true;
      await registerToken();
    } catch (e, st) {
      debugPrint('[push] FCM init failed: $e\n$st');
    }
  }

  Future<void> _ensureLocalReady() async {
    if (_localReady) return;

    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosInit = DarwinInitializationSettings();
    await _local.initialize(
      const InitializationSettings(android: androidInit, iOS: iosInit),
      onDidReceiveNotificationResponse: (response) {
        final bookId = response.payload;
        if (bookId != null && bookId.isNotEmpty) {
          onNotificationTap?.call(bookId);
        }
      },
    );

    final androidPlugin = _local.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    await androidPlugin?.createNotificationChannel(
      const AndroidNotificationChannel(
        'bookai_generation',
        'Book generation',
        description: 'Progress and completion updates for your books',
        importance: Importance.high,
      ),
    );
    await androidPlugin?.requestNotificationsPermission();

    _localReady = true;
  }

  Future<void> _initializeFcm() async {
    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp(
        options: DefaultFirebaseOptions.currentPlatform,
      ).timeout(const Duration(seconds: 10));
    }

    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

    final messaging = FirebaseMessaging.instance;
    try {
      await messaging
          .requestPermission(alert: true, badge: true, sound: true)
          .timeout(const Duration(seconds: 5));
    } on TimeoutException {
      debugPrint('[push] permission request timed out');
    }

    await messaging.setForegroundNotificationPresentationOptions(
      alert: true,
      badge: true,
      sound: true,
    );

    FirebaseMessaging.onMessage.listen(_showForeground);
    FirebaseMessaging.onMessageOpenedApp.listen(_handleOpen);

    try {
      final initial = await messaging
          .getInitialMessage()
          .timeout(const Duration(seconds: 3));
      if (initial != null) {
        _handleOpen(initial);
      }
    } on TimeoutException {
      // optional
    }

    messaging.onTokenRefresh.listen((token) async {
      _token = token;
      await registerToken();
    });

    try {
      _token = await messaging.getToken().timeout(const Duration(seconds: 12));
      debugPrint(
        '[push] FCM token: ${_token == null ? "null" : "${_token!.substring(0, 16)}…"}',
      );
    } on TimeoutException {
      debugPrint('[push] getToken timed out — will retry on register');
      _token = null;
    }
  }

  Future<void> registerToken() async {
    if (!_fcmReady || _registering) return;
    _registering = true;
    try {
      String? token = _token;
      if (token == null || token.isEmpty) {
        try {
          token = await FirebaseMessaging.instance
              .getToken()
              .timeout(const Duration(seconds: 12));
        } on TimeoutException {
          debugPrint('[push] registerToken getToken timed out');
          return;
        }
      }
      if (token == null || token.isEmpty) return;
      _token = token;

      if (!await _api.hasToken) {
        debugPrint('[push] skip register — no auth token yet');
        return;
      }

      final platform = Platform.isIOS ? 'ios' : 'android';
      await _api.dio.post(
        ApiConfig.devices,
        data: {'token': token, 'platform': platform},
      );
      debugPrint('[push] device token registered ($platform)');
    } catch (e) {
      debugPrint('[push] register failed: $e');
    } finally {
      _registering = false;
    }
  }

  Future<void> unregisterToken() async {
    final token = _token;
    if (token == null || token.isEmpty) return;
    try {
      if (await _api.hasToken) {
        await _api.dio.delete(
          ApiConfig.devices,
          data: {'token': token},
        );
      }
    } catch (e) {
      debugPrint('[push] unregister failed: $e');
    }
  }

  /// Immediate on-device notification (works without server FCM).
  Future<void> showLocal({
    required String title,
    required String body,
    String? bookId,
    int? id,
  }) async {
    try {
      await _ensureLocalReady();
    } catch (_) {
      return;
    }
    if (!_localReady) return;

    await _local.show(
      id ?? (Object.hash(title, body, bookId).abs() % 100000),
      title,
      body,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'bookai_generation',
          'Book generation',
          channelDescription:
              'Progress and completion updates for your books',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
      ),
      payload: bookId,
    );
  }

  void _showForeground(RemoteMessage message) {
    final notification = message.notification;
    final data = message.data;
    final title = notification?.title ?? data['title'] ?? data['notificationTitle'];
    final body = notification?.body ?? data['body'] ?? data['notificationBody'];
    if (title == null && body == null) return;

    final bookId = data['bookId'] as String?;
    unawaited(
      showLocal(
        title: title?.toString() ?? 'BookAI',
        body: body?.toString() ?? '',
        bookId: bookId,
        id: bookId?.hashCode.abs() ?? title.hashCode.abs(),
      ),
    );
  }

  void _handleOpen(RemoteMessage message) {
    final bookId = message.data['bookId'] as String?;
    if (bookId != null && bookId.isNotEmpty) {
      onNotificationTap?.call(bookId);
    }
  }
}
