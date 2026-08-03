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
  bool _ready = false;
  String? _token;
  NotificationTapCallback? onNotificationTap;

  bool get isReady => _ready;
  String? get token => _token;

  Future<void> initialize() async {
    if (_ready || kIsWeb || !DefaultFirebaseOptions.isConfigured) {
      return;
    }

    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp(
          options: DefaultFirebaseOptions.currentPlatform,
        );
      }

      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

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

      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission(alert: true, badge: true, sound: true);
      await messaging.setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );

      FirebaseMessaging.onMessage.listen(_showForeground);
      FirebaseMessaging.onMessageOpenedApp.listen(_handleOpen);

      final initial = await messaging.getInitialMessage();
      if (initial != null) {
        _handleOpen(initial);
      }

      _token = await messaging.getToken();
      messaging.onTokenRefresh.listen((token) async {
        _token = token;
        await registerToken();
      });

      _ready = true;
    } catch (e, st) {
      debugPrint('[push] init failed: $e\n$st');
      _ready = false;
    }
  }

  Future<void> registerToken() async {
    if (!_ready) return;
    final token = _token ?? await FirebaseMessaging.instance.getToken();
    if (token == null || token.isEmpty) return;
    _token = token;

    if (!await _api.hasToken) return;

    final platform = Platform.isIOS ? 'ios' : 'android';
    try {
      await _api.dio.post(
        ApiConfig.devices,
        data: {'token': token, 'platform': platform},
      );
    } catch (e) {
      debugPrint('[push] register failed: $e');
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

  void _showForeground(RemoteMessage message) {
    final notification = message.notification;
    if (notification == null) return;
    final bookId = message.data['bookId'] as String?;

    _local.show(
      notification.hashCode,
      notification.title,
      notification.body,
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

  void _handleOpen(RemoteMessage message) {
    final bookId = message.data['bookId'] as String?;
    if (bookId != null && bookId.isNotEmpty) {
      onNotificationTap?.call(bookId);
    }
  }
}
