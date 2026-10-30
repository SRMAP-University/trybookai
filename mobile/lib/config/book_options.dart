/// Book option lists, kept identical to the website's
/// (`BOOK_GENRES`, `BOOK_TONES`, `BOOK_POVS`, `BOOK_TENSES`,
/// `BOOK_LANGUAGES` in `src/lib/constants.ts`).
class BookOptions {
  static const genres = [
    'Fiction',
    'Non-Fiction',
    'Self-Help',
    'Business',
    'Science Fiction',
    'Fantasy',
    'Romance',
    'Thriller',
    'Mystery',
    'Horror',
    'Biography',
    'Memoir',
    'History',
    'Technology',
    'Education',
    'Health & Wellness',
    'Philosophy',
    'Poetry',
    'Young Adult',
    "Children's",
  ];

  static const tones = [
    'Professional',
    'Conversational',
    'Academic',
    'Humorous',
    'Inspirational',
    'Dramatic',
    'Poetic',
    'Authoritative',
    'Warm',
    'Dark',
    'Satirical',
    'Neutral',
  ];

  /// value → label
  static const povs = {
    'first': 'First person (I / we)',
    'second': 'Second person (you)',
    'third': 'Third person limited',
    'omniscient': 'Third person omniscient',
  };

  static const tenses = {'past': 'Past', 'present': 'Present'};

  static const languages = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'pt': 'Portuguese',
    'it': 'Italian',
    'hi': 'Hindi',
    'ja': 'Japanese',
    'zh': 'Chinese',
    'ar': 'Arabic',
  };

  /// [options] plus [current] when the saved value isn't in the list, so a
  /// dropdown never starts on a value it can't show (that asserts).
  static List<String> withCurrent(List<String> options, String current) =>
      options.contains(current) ? options : [...options, current];

  static Map<String, String> withCurrentKey(
    Map<String, String> options,
    String current,
  ) =>
      options.containsKey(current) ? options : {...options, current: current};
}
