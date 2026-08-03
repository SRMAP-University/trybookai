import 'package:bookai_mobile/config/google_auth_config.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';

/// Thin wrapper around [GoogleSignIn] for BookAI mobile auth.
class GoogleAuthService {
  GoogleAuthService();

  bool _ready = false;

  Future<void> ensureInitialized() async {
    if (_ready) return;
    await GoogleSignIn.instance.initialize(
      serverClientId: GoogleAuthConfig.serverClientId,
      clientId: defaultTargetPlatform == TargetPlatform.iOS ||
              defaultTargetPlatform == TargetPlatform.macOS
          ? (GoogleAuthConfig.iosClientId.isEmpty
              ? null
              : GoogleAuthConfig.iosClientId)
          : null,
    );
    _ready = true;
  }

  /// Returns a Google ID token for backend verification, or null if canceled.
  Future<String?> signInForIdToken() async {
    await ensureInitialized();
    try {
      final account = await GoogleSignIn.instance.authenticate(
        scopeHint: const ['email', 'profile'],
      );
      final idToken = account.authentication.idToken;
      if (idToken == null || idToken.isEmpty) {
        throw StateError(
          'Google did not return an ID token. Check that the Web client ID '
          'is configured as serverClientId and Android SHA-1 is registered.',
        );
      }
      return idToken;
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled) {
        return null;
      }
      rethrow;
    }
  }

  Future<void> signOut() async {
    if (!_ready) return;
    try {
      await GoogleSignIn.instance.signOut();
    } catch (_) {}
  }
}
