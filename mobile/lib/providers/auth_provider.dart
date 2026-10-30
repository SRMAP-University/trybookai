import 'dart:async';

import 'package:bookai_mobile/config/api_config.dart';
import 'package:bookai_mobile/config/app_billing.dart';
import 'package:bookai_mobile/models/models.dart';
import 'package:bookai_mobile/services/api_client.dart';
import 'package:bookai_mobile/services/push_notifications.dart';
import 'package:bookai_mobile/services/revenuecat_service.dart';
import 'package:bookai_mobile/services/web_sign_in.dart';
import 'package:flutter/foundation.dart';

class AuthProvider extends ChangeNotifier {
  AuthProvider(
    this._api, {
    PushNotificationService? push,
    RevenueCatService? revenueCat,
  }) : _push = push,
       _revenueCat = revenueCat;

  final ApiClient _api;
  final PushNotificationService? _push;
  final RevenueCatService? _revenueCat;
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

  /// Store billing, when wired up — source of store-localized prices.
  RevenueCatService? get revenueCat => _revenueCat;

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
    if (!AppBilling.iapEnabled) return;
    final rc = _revenueCat;
    if (rc == null) return;
    unawaited(() async {
      try {
        if (!rc.isConfigured) {
          await rc
              .configure(appUserId: userId)
              .timeout(const Duration(seconds: 8));
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

  /// Signs in with Google through the website, which does the Google part;
  /// the app only trades the code it hands back for a session.
  Future<bool> loginWithGoogle() async {
    error = null;
    loading = true;
    notifyListeners();
    try {
      final signedIn = await WebSignIn.google();
      if (signedIn == null) {
        return false;
      }
      final res = await _api.dio.post(
        ApiConfig.webSignInExchange,
        data: {'code': signedIn.code, 'verifier': signedIn.verifier},
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
      error = e is WebSignInException ? e.message : _api.extractError(e);
      user = null;
      return false;
    } finally {
      loading = false;
      notifyListeners();
    }
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
