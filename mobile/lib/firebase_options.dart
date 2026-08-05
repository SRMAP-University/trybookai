import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

/// Firebase options from `android/app/google-services.json`.
/// Override any value with `--dart-define=FIREBASE_*=...` if needed.
class DefaultFirebaseOptions {
  static const _apiKey = String.fromEnvironment(
    'FIREBASE_API_KEY',
    defaultValue: 'AIzaSyDSNZDyDlDt0sjlDVYZUQ3_neGbEJ3hXWM',
  );
  static const _appId = String.fromEnvironment(
    'FIREBASE_APP_ID',
    defaultValue: '1:675692627606:android:823e56eba2670cafe7a4b7',
  );
  static const _androidAppId = String.fromEnvironment(
    'FIREBASE_ANDROID_APP_ID',
    defaultValue: '1:675692627606:android:823e56eba2670cafe7a4b7',
  );
  static const _iosAppId = String.fromEnvironment('FIREBASE_IOS_APP_ID');
  static const _iosApiKey = String.fromEnvironment('FIREBASE_IOS_API_KEY');
  static const _senderId = String.fromEnvironment(
    'FIREBASE_MESSAGING_SENDER_ID',
    defaultValue: '675692627606',
  );
  static const _projectId = String.fromEnvironment(
    'FIREBASE_PROJECT_ID',
    defaultValue: 'bookai-eedf3',
  );
  static const _storageBucket = String.fromEnvironment(
    'FIREBASE_STORAGE_BUCKET',
    defaultValue: 'bookai-eedf3.firebasestorage.app',
  );

  static bool get isConfigured =>
      _projectId.isNotEmpty && _apiKey.isNotEmpty && _appId.isNotEmpty;

  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      throw UnsupportedError('Web push is not configured for BookAI mobile.');
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      default:
        throw UnsupportedError(
          'Firebase is not supported on this platform for BookAI.',
        );
    }
  }

  static FirebaseOptions get android => FirebaseOptions(
        apiKey: _apiKey,
        appId: _androidAppId.isNotEmpty ? _androidAppId : _appId,
        messagingSenderId: _senderId,
        projectId: _projectId,
        storageBucket: _storageBucket,
      );

  static FirebaseOptions get ios => FirebaseOptions(
        apiKey: _iosApiKey.isNotEmpty ? _iosApiKey : _apiKey,
        appId: _iosAppId.isNotEmpty ? _iosAppId : _appId,
        messagingSenderId: _senderId,
        projectId: _projectId,
        storageBucket: _storageBucket,
        iosBundleId: 'com.trybookai.bookaiMobile',
      );
}
