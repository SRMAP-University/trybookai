import 'package:flutter/foundation.dart';
import 'package:bookai_mobile/config/api_config.dart';
import 'package:bookai_mobile/models/models.dart';
import 'package:bookai_mobile/services/api_client.dart';

class BooksProvider extends ChangeNotifier {
  BooksProvider(this._api);

  final ApiClient _api;
  List<BookModel> books = [];
  ActiveJobs? activeJobs;
  bool loading = false;
  String? error;

  List<BookModel> get generating =>
      books.where((b) => b.isGenerating).toList();

  List<BookModel> get completed =>
      books.where((b) => b.status == 'COMPLETED').toList();

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final res = await _api.dio.get(ApiConfig.books);
      final list = res.data is List
          ? res.data as List
          : (res.data['books'] as List? ?? []);
      books = list
          .map((e) => BookModel.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      error = _api.extractError(e);
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> loadActiveJobs() async {
    try {
      final prevActiveIds = {
        for (final b in activeJobs?.books ?? const <BookModel>[]) b.id,
      };
      final res = await _api.dio.get(ApiConfig.jobsActive);
      activeJobs = ActiveJobs.fromJson(res.data as Map<String, dynamic>);
      if (activeJobs != null) {
        final byId = {for (final b in activeJobs!.books) b.id: b};
        books = books.map((b) {
          final live = byId[b.id];
          if (live == null) return b;
          return b.copyWith(
            status: live.status,
            progress: live.progress,
            currentPages: live.currentPages,
            targetPages: live.targetPages,
          );
        }).toList();

        // Books that left the active queue — refresh so completion notifies fire.
        final nextIds = byId.keys.toSet();
        for (final id in prevActiveIds.difference(nextIds)) {
          final fresh = await fetchBook(id);
          if (fresh != null) {
            books = books.map((b) => b.id == id ? fresh : b).toList();
          }
        }
      }
      notifyListeners();
    } catch (_) {}
  }

  Future<BookModel?> createBook({
    required String title,
    required String description,
    required String genre,
    required int targetPages,
    bool startGeneration = true,
    bool generateAudiobookOnComplete = true,
    String? customInstructions,
    String? characters,
  }) async {
    try {
      final characterList = (characters ?? '')
          .split(RegExp(r'[\n,]'))
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toList();
      final res = await _api.dio.post(
        ApiConfig.books,
        data: {
          'title': title,
          'description': description,
          'genre': genre,
          'targetPages': targetPages,
          'startGeneration': startGeneration,
          'generateAudiobookOnComplete': generateAudiobookOnComplete,
          'tone': 'Professional',
          'audience': 'General readers',
          'pov': 'third',
          'tense': 'past',
          'language': 'en',
          if (customInstructions != null && customInstructions.isNotEmpty)
            'customInstructions': customInstructions,
          if (characterList.isNotEmpty) 'characters': characterList,
        },
      );
      final book = BookModel.fromJson(res.data as Map<String, dynamic>);
      books = [book, ...books];
      notifyListeners();
      return book;
    } catch (e) {
      error = _api.extractError(e);
      notifyListeners();
      return null;
    }
  }

  Future<BookModel?> fetchBook(String id, {bool summary = true}) async {
    try {
      final res = await _api.dio.get(
        '${ApiConfig.books}/$id',
        queryParameters: summary ? {'summary': '1'} : null,
      );
      return BookModel.fromJson(res.data as Map<String, dynamic>);
    } catch (e) {
      error = _api.extractError(e);
      notifyListeners();
      return null;
    }
  }

  Future<BookModel?> setPublic(String id, bool isPublic) async {
    try {
      final res = await _api.dio.patch(
        '${ApiConfig.books}/$id',
        data: {'isPublic': isPublic},
      );
      final book = BookModel.fromJson(res.data as Map<String, dynamic>);
      books = books.map((b) => b.id == id ? book : b).toList();
      notifyListeners();
      return book;
    } catch (e) {
      error = _api.extractError(e);
      notifyListeners();
      return null;
    }
  }

  Future<bool> startGeneration(
    String id, {
    bool resume = true,
    String? speed,
  }) async {
    try {
      await _api.dio.post(
        '/api/generate/$id${resume ? '?resume=1' : ''}',
        data: speed == null ? null : {'speed': speed},
      );
      return true;
    } catch (e) {
      error = _api.extractError(e);
      notifyListeners();
      return false;
    }
  }

  Future<void> cancelGeneration(String id) async {
    try {
      await _api.dio.post('/api/generate/$id/cancel');
      await load();
    } catch (e) {
      error = _api.extractError(e);
      notifyListeners();
    }
  }

  /// Start audiobook conversion for a completed book.
  Future<String?> startAudiobook(String bookId, {bool regenerate = false}) async {
    try {
      final res = await _api.dio.post(
        ApiConfig.audio,
        data: {
          'bookId': bookId,
          'type': 'AUDIOBOOK',
          'regenerate': regenerate,
        },
      );
      await loadActiveJobs();
      final audio = res.data['audio'];
      return audio is Map ? audio['id'] as String? : null;
    } catch (e) {
      error = _api.extractError(e);
      notifyListeners();
      return null;
    }
  }

  Future<List<Map<String, dynamic>>> fetchAudios(String bookId) async {
    // Prefer /api/audio; fall back to book detail which also embeds audios+tracks.
    try {
      final res = await _api.dio.get(
        ApiConfig.audio,
        queryParameters: {'bookId': bookId},
      );
      final fromAudioApi = _asMapList(res.data['audios']);
      if (fromAudioApi.isNotEmpty) return fromAudioApi;
    } catch (_) {}

    try {
      final res = await _api.dio.get('${ApiConfig.books}/$bookId');
      return _asMapList(res.data is Map ? res.data['audios'] : null);
    } catch (_) {
      return [];
    }
  }

  static List<Map<String, dynamic>> _asMapList(dynamic raw) {
    if (raw is! List) return [];
    final out = <Map<String, dynamic>>[];
    for (final item in raw) {
      if (item is Map) {
        out.add(Map<String, dynamic>.from(item));
      }
    }
    return out;
  }
}
