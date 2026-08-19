import 'dart:async';

import 'package:bookai_mobile/config/api_config.dart';
import 'package:bookai_mobile/models/models.dart';
import 'package:bookai_mobile/services/api_client.dart';
import 'package:bookai_mobile/services/google_auth_service.dart';
import 'package:bookai_mobile/services/push_notifications.dart';
import 'package:bookai_mobile/services/revenuecat_service.dart';
import 'package:flutter/foundation.dart';

class AuthProvider extends ChangeNotifier {
  AuthProvider(
    this._api, {
    PushNotificationService? push,
    RevenueCatService? revenueCat,
    GoogleAuthService? google,
  })  : _push = push,
        _revenueCat = revenueCat,
        _google = google ?? GoogleAuthService();

  final ApiClient _api;
  final PushNotificationService? _push;
  final RevenueCatService? _revenueCat;
  final GoogleAuthService _google;
  UserModel? user;
  /// True only during cold-start session restore (not login/register submits).
  bool booting = true;
  /// Token found in secure storage — enough to open the app shell without BootScreen.
  bool hasStoredSession = false;
  /// True during login / register / Google sign-in network calls.
  bool loading = false;
  String? error;
  /// New account — send them to create-book instead of an empty home.
  bool pendingOnboarding = false;

  bool get isAuthenticated => user != null;

  /// Shell / router: allow app while `/me` is still in flight if a token exists.
  bool get canEnterApp => user != null || hasStoredSession;

  void primeStoredSession(bool value) {
    hasStoredSession = value;
    // No token → skip BootScreen entirely and open login on first frame.
    if (!value) booting = false;
  }

  void finishLoading() {
    if (!booting) return;
    booting = false;
    notifyListeners();
  }

  /// Never await from UI-critical paths — Purchases.configure can hang.
  void _linkRevenueCat(String userId) {
    final rc = _revenueCat;
    if (rc == null) return;
    unawaited(() async {
      try {
        if (!rc.isConfigured) {
          await rc.configure(appUserId: userId).timeout(const Duration(seconds: 8));
        } else {
          await rc.logIn(userId).timeout(const Duration(seconds: 8));
        }
      } catch (e) {
        debugPrint('[auth] RevenueCat link failed: $e');
      }
    }());
  }

  Future<void> bootstrap() async {
    try {
      if (!await _api.hasToken) {
        user = null;
        hasStoredSession = false;
        return;
      }
      hasStoredSession = true;
      final res = await _api.dio.get(ApiConfig.me);
      user = UserModel.fromJson(res.data['user'] as Map<String, dynamic>);
      hasStoredSession = true;
      _linkRevenueCat(user!.id);
      // Push init may finish after bootstrap — retry registration.
      unawaited(() async {
        await Future<void>.delayed(const Duration(seconds: 2));
        await _push?.registerToken();
      }());
    } catch (_) {
      await _api.setToken(null);
      user = null;
      hasStoredSession = false;
    } finally {
      booting = false;
      notifyListeners();
    }
  }

  Future<bool> login(String email, String password) async {
    error = null;
    loading = true;
    notifyListeners();
    try {
      final res = await _api.dio.post(
        ApiConfig.login,
        data: {'email': email.trim(), 'password': password},
      );
      final token = res.data['token'] as String;
      await _api.setToken(token);
      user = UserModel.fromJson(res.data['user'] as Map<String, dynamic>);
      hasStoredSession = true;
      pendingOnboarding = false;
      _linkRevenueCat(user!.id);
      unawaited(_push?.registerToken() ?? Future.value());
      return true;
    } catch (e) {
      error = _api.extractError(e);
      user = null;
      return false;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<bool> register({
    required String name,
    required String email,
    required String password,
  }) async {
    error = null;
    loading = true;
    notifyListeners();
    try {
      final res = await _api.dio.post(
        ApiConfig.register,
        data: {
          'name': name.trim(),
          'email': email.trim(),
          'password': password,
          'acceptedTerms': true,
        },
      );
      final token = res.data['token'] as String;
      await _api.setToken(token);
      user = UserModel.fromJson(res.data['user'] as Map<String, dynamic>);
      hasStoredSession = true;
      pendingOnboarding = true;
      _linkRevenueCat(user!.id);
      unawaited(_push?.registerToken() ?? Future.value());
      return true;
    } catch (e) {
      error = _api.extractError(e);
      user = null;
      return false;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<bool> loginWithGoogle() async {
    error = null;
    loading = true;
    notifyListeners();
    try {
      final idToken = await _google.signInForIdToken();
      if (idToken == null) {
        return false;
      }
      final res = await _api.dio.post(
        ApiConfig.google,
        data: {'idToken': idToken},
      );
      final token = res.data['token'] as String;
      await _api.setToken(token);
      user = UserModel.fromJson(res.data['user'] as Map<String, dynamic>);
      hasStoredSession = true;
      pendingOnboarding = res.data['isNew'] == true;
      _linkRevenueCat(user!.id);
      unawaited(_push?.registerToken() ?? Future.value());
      return true;
    } catch (e) {
      error = _friendlyGoogleError(e);
      user = null;
      return false;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  String _friendlyGoogleError(Object e) {
    final raw = _api.extractError(e);
    final text = raw.startsWith('Exception: ')
        ? raw.substring('Exception: '.length)
        : raw;
    if (text.contains('Missing Web OAuth') ||
        text.contains('Developer console is not set up') ||
        text.contains('clientConfigurationError')) {
      return 'Create a Web OAuth client in Google Cloud project 603877706963 '
          '(same project as your Android client), then paste that Client ID '
          'into the app. The Android client ID cannot be used here.';
    }
    return text;
  }

  Future<void> refreshUser() async {
    try {
      final res = await _api.dio.get(ApiConfig.me);
      user = UserModel.fromJson(res.data['user'] as Map<String, dynamic>);
      notifyListeners();
    } catch (_) {}
  }

  Future<void> logout() async {
    await _push?.unregisterToken();
    await _revenueCat?.logOut();
    await _google.signOut();
    await _api.setToken(null);
    user = null;
    hasStoredSession = false;
    pendingOnboarding = false;
    notifyListeners();
  }

  Future<bool> deleteAccount() async {
    error = null;
    try {
      await _api.dio.delete(ApiConfig.account);
      await logout();
      return true;
    } catch (e) {
      error = _api.extractError(e);
      notifyListeners();
      return false;
    }
  }
}
