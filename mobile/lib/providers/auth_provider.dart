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
  bool loading = true;
  String? error;

  bool get isAuthenticated => user != null;

  Future<void> _linkRevenueCat(String userId) async {
    final rc = _revenueCat;
    if (rc == null) return;
    if (!rc.isConfigured) {
      await rc.configure(appUserId: userId);
    } else {
      await rc.logIn(userId);
    }
  }

  Future<void> bootstrap() async {
    loading = true;
    notifyListeners();
    try {
      if (!await _api.hasToken) {
        user = null;
        return;
      }
      final res = await _api.dio.get(ApiConfig.me);
      user = UserModel.fromJson(res.data['user'] as Map<String, dynamic>);
      await _linkRevenueCat(user!.id);
      await _push?.registerToken();
    } catch (_) {
      await _api.setToken(null);
      user = null;
    } finally {
      loading = false;
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
      await _linkRevenueCat(user!.id);
      await _push?.registerToken();
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
      await _linkRevenueCat(user!.id);
      await _push?.registerToken();
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
      await _linkRevenueCat(user!.id);
      await _push?.registerToken();
      return true;
    } catch (e) {
      final message = _api.extractError(e);
      error = message.startsWith('Exception: ')
          ? message.substring('Exception: '.length)
          : message;
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
    await _google.signOut();
    await _api.setToken(null);
    user = null;
    notifyListeners();
  }
}
