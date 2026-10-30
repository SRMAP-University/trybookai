import 'dart:convert';
import 'dart:math';

import 'package:bookai_mobile/config/api_config.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';

/// What the website hands back after signing in: a short-lived code, and the
/// secret only this app knows, to trade together for a session token.
typedef WebSignInResult = ({String code, String verifier});

/// Google sign-in done by the website, not the app: the app opens BookAI's
/// own Google login in the browser, and the website sends the browser back to
/// the app with a code that only this app can redeem (PKCE).
class WebSignIn {
  /// The return link's scheme. The dev build installs beside the Play app,
  /// so it has its own (set per build type in the Android manifest).
  static String get _scheme => kReleaseMode ? 'trybookai' : 'trybookai-dev';

  /// Signs in with Google on the website. Null if the person closed it.
  static Future<WebSignInResult?> google() async {
    final verifier = _random(48);
    final challenge = base64Url
        .encode(sha256.convert(ascii.encode(verifier)).bytes)
        .replaceAll('=', '');
    final state = _random(16);
    final url = Uri.parse('${ApiConfig.baseUrl}${ApiConfig.webSignIn}').replace(
      queryParameters: {'app': _scheme, 'challenge': challenge, 'state': state},
    );

    final String result;
    try {
      result = await FlutterWebAuth2.authenticate(
        url: url.toString(),
        callbackUrlScheme: _scheme,
      );
    } on PlatformException catch (e) {
      if (e.code == 'CANCELED') return null;
      rethrow;
    }

    final reply = Uri.parse(result).queryParameters;
    if (reply['state'] != state) {
      throw const WebSignInException('Sign-in did not complete. Try again.');
    }
    final code = reply['code'];
    if (code == null || code.isEmpty) {
      throw WebSignInException(switch (reply['error']) {
        'not_signed_in' => 'Google sign-in did not finish. Try again.',
        _ => 'Could not sign in with Google. Try again.',
      });
    }
    return (code: code, verifier: verifier);
  }

  /// URL-safe random text from [bytes] random bytes, without padding.
  static String _random(int bytes) {
    final rng = Random.secure();
    return base64Url
        .encode(List<int>.generate(bytes, (_) => rng.nextInt(256)))
        .replaceAll('=', '');
  }
}

class WebSignInException implements Exception {
  const WebSignInException(this.message);

  final String message;

  @override
  String toString() => message;
}
