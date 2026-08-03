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

  bool _matchesInterval(Package p, {required bool wantAnnual}) {
    final id =
        '${p.identifier} ${p.storeProduct.identifier} ${p.storeProduct.title}'
            .toLowerCase();
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
        id.contains('_mo') ||
        (!id.contains('year') && !id.contains('annual'));
  }

  int? _planRankFromText(String text) {
    final t = text.toLowerCase();
    if (t.contains('unlimited')) return 3;
    if (t.contains('premium') || t.contains('enterprise')) return 2;
    if (t.contains('pro') && !t.contains('premium')) return 1;
    return null;
  }

  int? _planRank(String plan) {
    return switch (plan) {
      'PRO' => 1,
      'ENTERPRISE' => 2,
      'UNLIMITED' => 3,
      _ => null,
    };
  }

  /// Resolve a package for a BookAI plan. Matching order:
  /// 1) product/package id contains plan name
  /// 2) same-interval packages sorted by price → pro < premium < unlimited
  /// 3) any same-interval package if only one exists
  Package? packageForPlan(String plan, {required String interval}) {
    final packages = availablePackages;
    if (packages.isEmpty) return null;

    final wantAnnual = interval == 'year';
    final intervalPkgs =
        packages.where((p) => _matchesInterval(p, wantAnnual: wantAnnual)).toList();
    final pool = intervalPkgs.isNotEmpty ? intervalPkgs : packages;

    final wantRank = _planRank(plan);
    if (wantRank == null) return null;

    // Explicit name match.
    for (final p in pool) {
      final text =
          '${p.identifier} ${p.storeProduct.identifier} ${p.storeProduct.title}';
      if (_planRankFromText(text) == wantRank) return p;
    }

    // Price-tier mapping when products aren't named after plans.
    final sorted = [...pool]
      ..sort(
        (a, b) => a.storeProduct.price.compareTo(b.storeProduct.price),
      );
    if (sorted.length >= 3) {
      return switch (plan) {
        'PRO' => sorted[0],
        'ENTERPRISE' => sorted[1],
        'UNLIMITED' => sorted[sorted.length - 1],
        _ => null,
      };
    }
    if (sorted.length == 2) {
      return switch (plan) {
        'PRO' => sorted[0],
        'ENTERPRISE' || 'UNLIMITED' => sorted[1],
        _ => null,
      };
    }
    if (sorted.length == 1) {
      // Single product offering — use it for every upgrade button.
      return sorted.first;
    }
    return null;
  }

  Future<CustomerInfo?> purchasePlan(
    String plan, {
    required String interval,
  }) async {
    if (!_configured) {
      throw Exception('RevenueCat is not configured yet. Restart the app.');
    }
    if (!hasPackages) {
      await refreshOfferings();
    }
    final package = packageForPlan(plan, interval: interval);
    if (package == null) {
      throw Exception(
        'No RevenueCat packages found. In the RevenueCat dashboard, create '
        'Test Store products, attach entitlements (pro / premium / unlimited), '
        'and add them to the current Offering.',
      );
    }
    return purchasePackage(package);
  }

  Future<CustomerInfo?> purchasePackage(Package package) async {
    try {
      final result = await Purchases.purchase(PurchaseParams.package(package));
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

  String? priceLabelForPlan(String plan, {required String interval}) {
    final package = packageForPlan(plan, interval: interval);
    return package?.storeProduct.priceString;
  }
}
