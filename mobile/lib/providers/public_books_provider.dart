import 'package:flutter/foundation.dart';
import 'package:bookai_mobile/config/api_config.dart';
import 'package:bookai_mobile/models/models.dart';
import 'package:bookai_mobile/services/api_client.dart';

class PublicBooksProvider extends ChangeNotifier {
  PublicBooksProvider(this._api);

  final ApiClient _api;
  List<PublicBookModel> books = [];
  bool loading = false;
  String? error;

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final res = await _api.dio.get(ApiConfig.publicBooks);
      final list = res.data['books'] as List? ?? [];
      books = list
          .map((e) => PublicBookModel.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      error = _api.extractError(e);
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<PublicBookDetail?> fetch(String slug) async {
    try {
      final res = await _api.dio.get('${ApiConfig.publicBooks}/$slug');
      return PublicBookDetail.fromJson(res.data as Map<String, dynamic>);
    } catch (e) {
      error = _api.extractError(e);
      notifyListeners();
      return null;
    }
  }
}
