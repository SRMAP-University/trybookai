import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:purchases_flutter/purchases_flutter.dart';
import 'package:bookai_mobile/config/revenuecat_config.dart';

class RevenueCatService extends ChangeNotifier {
  bool _configured = false;
  Offerings? _offerings;
  String? _lastError;

  bool get isConfigured => _configured;
  Offerings? get offerings => _offerings;
  String? get lastError => _lastError;

  List<Package> get availablePackages {
    final current = _offerings?.current?.availablePackages;
    if (current != null && current.isNotEmpty) return current;
    final all = <Package>[];
    for (final offering in _offerings?.all.values ?? const <Offering>[]) {
      all.addAll(offering.availablePackages);
    }
    return all;
  }

  bool get hasPackages => availablePackages.isNotEmpty;

  Future<void> configure({String? appUserId}) async {
    if (_configured) {
      if (appUserId != null && appUserId.isNotEmpty) {
        await logIn(appUserId);
      }
      return;
    }

    if (!RevenueCatConfig.canConfigure) {
      // Avoid fatal: Test Store keys crash release builds by design.
      _lastError =
          'RevenueCat skipped: set REVENUECAT_API_KEY to a goog_/appl_ public key for release builds.';
      debugPrint('[RevenueCat] $_lastError');
      notifyListeners();
      return;
    }

    try {
      await Purchases.setLogLevel(
        kDebugMode ? LogLevel.debug : LogLevel.info,
      );
      final config = PurchasesConfiguration(RevenueCatConfig.apiKey);
      if (appUserId != null && appUserId.isNotEmpty) {
        config.appUserID = appUserId;
      }
      await Purchases.configure(config);
      _configured = true;
      await refreshOfferings();
      notifyListeners();
    } catch (e, st) {
      _lastError = e.toString();
      debugPrint('RevenueCat configure failed: $e\n$st');
      notifyListeners();
    }
  }

  Future<void> logIn(String appUserId) async {
    if (!_configured || appUserId.isEmpty) return;
    try {
      await Purchases.logIn(appUserId);
      await refreshOfferings();
    } catch (e) {
      debugPrint('RevenueCat logIn failed: $e');
    }
  }

  Future<void> logOut() async {
    if (!_configured) return;
    try {
      await Purchases.logOut();
    } catch (e) {
      debugPrint('RevenueCat logOut failed: $e');
    }
  }

  Future<Offerings?> refreshOfferings() async {
    if (!_configured) return null;
    try {
      _offerings = await Purchases.getOfferings();
      _lastError = null;
      if (kDebugMode) {
        final pkgs = availablePackages
            .map((p) => '${p.identifier}|${p.storeProduct.identifier}|${p.packageType}')
            .join(', ');
        debugPrint('RevenueCat packages: ${pkgs.isEmpty ? '(none)' : pkgs}');
      }
      notifyListeners();
      return _offerings;
    } catch (e) {
      _lastError = e.toString();
      debugPrint('RevenueCat getOfferings failed: $e');
      notifyListeners();
      return null;
    }
  }

  Future<List<String>> activeEntitlements() async {
    if (!_configured) return [];
    try {
      final info = await Purchases.getCustomerInfo();
      return info.entitlements.active.keys.toList();
    } catch (_) {
      return [];
    }
  }

  bool _isLifetime(Package p) {
    final text = _packageText(p);
    return p.packageType == PackageType.lifetime ||
        text.contains('lifetime') ||
        text.contains(r'$rc_lifetime');
  }

  bool _matchesInterval(Package p, {required bool wantAnnual}) {
    // Lifetime is not a monthly/yearly sub — keep it out of those pools.
    if (_isLifetime(p)) return false;

    final id = _packageText(p);
    final type = p.packageType;
    if (wantAnnual) {
      return type == PackageType.annual ||
          id.contains('year') ||
          id.contains('annual') ||
          id.contains('_yr') ||
          id.contains('-yr');
    }
    if (type == PackageType.annual) {
      return false;
    }
    return type == PackageType.monthly ||
        type == PackageType.weekly ||
        type == PackageType.threeMonth ||
        type == PackageType.sixMonth ||
        id.contains('month') ||
        id.contains('_mo');
  }

  String _packageText(Package p) =>
      '${p.identifier} ${p.storeProduct.identifier} ${p.storeProduct.title}'
          .toLowerCase();

  /// Words in ids like "bookai_pro:monthly" → {bookai, pro, monthly}.
  /// (`\b` treats `_` as part of a word, so "bookai_pro" never matched it.)
  static Set<String> _words(String text) => text
      .toLowerCase()
      .split(RegExp(r'[^a-z0-9]+'))
      .where((w) => w.isNotEmpty)
      .toSet();

  static String? _planFromWords(Set<String> words) {
    if (words.contains('unlimited')) return 'UNLIMITED';
    if (words.contains('premium') || words.contains('enterprise')) {
      return 'ENTERPRISE';
    }
    if (words.contains('pro')) return 'PRO';
    return null;
  }

  /// Which BookAI plan a package belongs to, or null if unknown.
  /// Product ids decide first; the store title is only a fallback.
  String? _planIdForPackage(Package p) {
    if (_isLifetime(p)) return 'UNLIMITED';

    final fromIds = _planFromWords(
      _words('${p.identifier} ${p.storeProduct.identifier}'),
    );
    if (fromIds != null) return fromIds;
    final fromTitle = _planFromWords(_words(p.storeProduct.title));
    if (fromTitle != null) return fromTitle;

    // Default Test Store: monthly + annual → Pro only.
    final text = _packageText(p);
    if (p.packageType == PackageType.annual ||
        text.contains(r'$rc_annual') ||
        RegExp(r'\byearly\b').hasMatch(text) ||
        text.contains('annual')) {
      return 'PRO';
    }
    if (p.packageType == PackageType.monthly ||
        text.contains(r'$rc_monthly') ||
        RegExp(r'\bmonthly\b').hasMatch(text)) {
      return 'PRO';
    }
    return null;
  }

  /// One-time "1 month" plans (Play prepaid base plans): no auto-renew, and
  /// Google accepts Play balance / gift cards for them.
  bool isPrepaid(Package p) =>
      p.storeProduct.defaultOption?.isPrepaid == true ||
      _words(_packageText(p)).contains('prepaid');

  /// Resolve a package for a BookAI plan. Unlimited is a subscription like
  /// the others, or a lifetime purchase when that's what the store sells.
  /// [prepaid] picks the one-time version instead of the auto-renewing one.
  Package? packageForPlan(
    String plan, {
    required String interval,
    bool prepaid = false,
  }) {
    final packages = availablePackages;
    if (packages.isEmpty) return null;

    final wantAnnual = interval == 'year';
    final intervalPkgs = packages
        .where(
          (p) =>
              _matchesInterval(p, wantAnnual: wantAnnual) &&
              isPrepaid(p) == prepaid,
        )
        .toList();

    for (final p in intervalPkgs) {
      if (_planIdForPackage(p) == plan) return p;
    }
    if (prepaid) return null;

    if (plan == 'UNLIMITED') {
      for (final p in packages) {
        if (_isLifetime(p)) return p;
      }
      return null;
    }

    // Only auto-tier unnamed products when there are 3+ for this interval.
    final unnamed = intervalPkgs
        .where((p) => _planIdForPackage(p) == null)
        .toList()
      ..sort((a, b) => a.storeProduct.price.compareTo(b.storeProduct.price));

    if (unnamed.length >= 3) {
      return switch (plan) {
        'PRO' => unnamed[0],
        'ENTERPRISE' => unnamed[1],
        _ => null,
      };
    }

    return null;
  }

  Future<CustomerInfo?> purchasePlan(
    String plan, {
    required String interval,
    bool prepaid = false,
  }) async {
    if (!_configured) {
      throw Exception(
        'In-app purchases are not available right now. Try again in a moment.',
      );
    }
    if (!hasPackages) {
      await refreshOfferings();
    }
    final package = packageForPlan(plan, interval: interval, prepaid: prepaid);
    if (package == null) {
      throw Exception(
        plan == 'UNLIMITED'
            ? 'Unlimited is not available as an in-app purchase on this device.'
            : 'This plan is not available as an in-app purchase on this device.',
      );
    }
    // A one-time month can't replace (or be replaced by) a subscription.
    final change = prepaid ? null : await _playPlanChange(package);
    if (kDebugMode) {
      debugPrint(
        'RevenueCat purchase plan=$plan → ${package.identifier} / '
        '${package.storeProduct.identifier} (${package.packageType})'
        '${change == null ? '' : ' replacing ${change.oldProductIdentifier}'}',
      );
    }
    return purchasePackage(package, productChangeInfo: change);
  }

  /// On Google Play a plan switch must replace the current subscription,
  /// otherwise the user is billed for both.
  Future<StoreProductChangeInfo?> _playPlanChange(Package target) async {
    if (defaultTargetPlatform != TargetPlatform.android ||
        target.storeProduct.productCategory != ProductCategory.subscription) {
      return null;
    }
    final info = await Purchases.getCustomerInfo();
    final targetId = target.storeProduct.identifier;
    for (final e in info.entitlements.active.values) {
      if (e.store != Store.playStore || e.productIdentifier.isEmpty) continue;
      final plan = e.productPlanIdentifier;
      if (plan != null && plan.contains('prepaid')) continue;
      final currentId = plan == null || plan.isEmpty
          ? e.productIdentifier
          : '${e.productIdentifier}:$plan';
      if (currentId == targetId) continue;
      return StoreProductChangeInfo(
        e.productIdentifier,
        replacementMode: StoreReplacementMode.withTimeProration,
      );
    }
    return null;
  }

  Future<CustomerInfo?> purchasePackage(
    Package package, {
    StoreProductChangeInfo? productChangeInfo,
  }) async {
    try {
      final result = await Purchases.purchase(
        PurchaseParams.package(package, productChangeInfo: productChangeInfo),
      );
      return result.customerInfo;
    } on PlatformException catch (e) {
      final code = PurchasesErrorHelper.getErrorCode(e);
      if (code == PurchasesErrorCode.purchaseCancelledError) {
        return null;
      }
      rethrow;
    }
  }

  Future<CustomerInfo> restore() async {
    return Purchases.restorePurchases();
  }

  Future<CustomerInfo?> customerInfo() async {
    if (!_configured) return null;
    try {
      return await Purchases.getCustomerInfo();
    } catch (e) {
      debugPrint('RevenueCat getCustomerInfo failed: $e');
      return null;
    }
  }

  String? priceLabelForPlan(
    String plan, {
    required String interval,
    bool prepaid = false,
  }) {
    final package = packageForPlan(plan, interval: interval, prepaid: prepaid);
    return package?.storeProduct.priceString;
  }
}

String friendlyPurchaseError(Object error) {
  if (error is PlatformException) {
    final code = PurchasesErrorHelper.getErrorCode(error);
    if (code == PurchasesErrorCode.purchaseCancelledError) {
      return '';
    }
    if (code == PurchasesErrorCode.productNotAvailableForPurchaseError ||
        code == PurchasesErrorCode.productAlreadyPurchasedError) {
      return error.message ?? 'This purchase is not available.';
    }
    final msg = error.message ?? '';
    if (RegExp(r'revenuecat|offering|test store', caseSensitive: false)
        .hasMatch(msg)) {
      return 'This plan is not available on the store right now.';
    }
    return msg.isEmpty ? 'Purchase failed' : msg;
  }
  final raw = error.toString().replaceFirst(RegExp(r'^Exception:\s*'), '');
  if (RegExp(r'revenuecat|offering|test store', caseSensitive: false)
      .hasMatch(raw)) {
    return 'This plan is not available on the store right now.';
  }
  return raw;
}
