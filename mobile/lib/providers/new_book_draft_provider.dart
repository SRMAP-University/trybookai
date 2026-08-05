import 'package:flutter/foundation.dart';

/// In-memory draft for the new-book form so inputs survive back navigation.
class NewBookDraftProvider extends ChangeNotifier {
  String title = '';
  String description = '';
  String customInstructions = '';
  String characters = '';
  String genre = 'Fiction';
  double pages = 40;
  bool audiobookAfter = true;
  bool showAdvanced = false;

  bool get hasContent =>
      title.trim().isNotEmpty ||
      description.trim().isNotEmpty ||
      customInstructions.trim().isNotEmpty ||
      characters.trim().isNotEmpty;

  void save({
    required String title,
    required String description,
    required String customInstructions,
    required String characters,
    required String genre,
    required double pages,
    required bool audiobookAfter,
    required bool showAdvanced,
  }) {
    this.title = title;
    this.description = description;
    this.customInstructions = customInstructions;
    this.characters = characters;
    this.genre = genre;
    this.pages = pages;
    this.audiobookAfter = audiobookAfter;
    this.showAdvanced = showAdvanced;
  }

  void clear() {
    title = '';
    description = '';
    customInstructions = '';
    characters = '';
    genre = 'Fiction';
    pages = 40;
    audiobookAfter = true;
    showAdvanced = false;
    notifyListeners();
  }
}
