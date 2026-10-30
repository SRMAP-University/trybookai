/// Story Reels: vertical narrated videos made from a book, one AI picture
/// per shot, word captions and mood music. A port of the website's
/// `src/lib/reel-generator/types.ts`.
library;

import 'package:flutter/painting.dart';

/// Camera moves a shot can make.
const reelMotions = [
  'push-in',
  'pull-out',
  'pan-left',
  'pan-right',
  'rise',
  'tilt-down',
  'drift',
  'punch-in',
];

/// Music moods.
const reelMoods = [
  'suspense',
  'action',
  'dark',
  'mystery',
  'calm',
  'warm',
  'sad',
  'wonder',
  'triumph',
  'neutral',
];

/// One caption word: text, start and end in ms.
typedef ReelCaption = ({String word, int start, int end});

class ReelShot {
  ReelShot({
    required this.id,
    required this.number,
    required this.text,
    required this.startMs,
    required this.endMs,
    required this.imageUrl,
    required this.motion,
    required this.mood,
    required this.status,
  });

  final String id;
  final int number;
  final String text;
  final int? startMs;
  final int? endMs;
  final String? imageUrl;
  final String motion;
  final String mood;
  final String status;

  factory ReelShot.fromJson(Map<String, dynamic> j) {
    final motion = '${j['motion'] ?? ''}'.toLowerCase().trim();
    final mood = '${j['mood'] ?? ''}'.toLowerCase().trim();
    return ReelShot(
      id: j['id'] as String,
      number: (j['number'] as num?)?.toInt() ?? 0,
      text: j['text'] as String? ?? '',
      startMs: (j['startMs'] as num?)?.toInt(),
      endMs: (j['endMs'] as num?)?.toInt(),
      imageUrl: j['imageUrl'] as String?,
      motion: reelMotions.contains(motion) ? motion : 'push-in',
      mood: reelMoods.contains(mood) ? mood : 'neutral',
      status: j['status'] as String? ?? 'PENDING',
    );
  }
}

class ReelEpisode {
  ReelEpisode({
    required this.id,
    required this.number,
    required this.title,
    required this.status,
    required this.audioUrl,
    required this.durationMs,
    required this.captions,
    required this.videoUrl,
    required this.shots,
  });

  final String id;
  final int number;
  final String title;
  final String status;
  final String? audioUrl;
  final int? durationMs;
  final List<ReelCaption> captions;

  /// A rendered MP4, once the server has made one.
  final String? videoUrl;
  final List<ReelShot> shots;

  bool get playable => status == 'COMPLETED' && (audioUrl ?? '').isNotEmpty;

  /// The first drawn picture, for posters.
  String? get poster {
    for (final s in shots) {
      if ((s.imageUrl ?? '').isNotEmpty) return s.imageUrl;
    }
    return null;
  }

  factory ReelEpisode.fromJson(Map<String, dynamic> j) {
    final captions = <ReelCaption>[];
    for (final c in (j['captions'] as List?) ?? const []) {
      if (c is List && c.length >= 3) {
        captions.add((
          word: '${c[0]}',
          start: (c[1] as num).toInt(),
          end: (c[2] as num).toInt(),
        ));
      }
    }
    final shots =
        ((j['shots'] as List?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(ReelShot.fromJson)
            .toList()
          ..sort((a, b) => (a.startMs ?? 0).compareTo(b.startMs ?? 0));
    return ReelEpisode(
      id: j['id'] as String,
      number: (j['number'] as num?)?.toInt() ?? 0,
      title: j['title'] as String? ?? '',
      status: j['status'] as String? ?? 'PENDING',
      audioUrl: j['audioUrl'] as String?,
      durationMs: (j['durationMs'] as num?)?.toInt(),
      captions: captions,
      videoUrl: j['videoUrl'] as String?,
      shots: shots,
    );
  }
}

/// A scene in a music track: start, end and mood.
typedef ScoreSpan = ({int start, int end, String mood});

/// Mood music under the narration: one looped cue per mood, and per track
/// (episode number) the scenes in order.
class MusicScore {
  MusicScore({required this.level, required this.cues, required this.tracks});

  final String level;
  final Map<String, String> cues;
  final Map<int, List<ScoreSpan>> tracks;

  /// Music volume relative to the narration.
  double get gain => level == 'cinematic' ? 0.22 : 0.12;

  static MusicScore? fromJson(Object? raw) {
    if (raw is! Map<String, dynamic>) return null;
    final level = raw['level'] as String?;
    if (level != 'subtle' && level != 'cinematic') return null;
    final cues = <String, String>{};
    final rawCues = raw['cues'];
    if (rawCues is Map) {
      rawCues.forEach((k, v) {
        if (v is String && v.isNotEmpty) cues['$k'] = v;
      });
    }
    final tracks = <int, List<ScoreSpan>>{};
    final rawTracks = raw['tracks'];
    if (rawTracks is Map) {
      rawTracks.forEach((k, v) {
        final n = int.tryParse('$k');
        if (n == null || v is! List) return;
        tracks[n] = [
          for (final s in v)
            if (s is List && s.length >= 3)
              (
                start: (s[0] as num).toInt(),
                end: (s[1] as num).toInt(),
                mood: '${s[2]}',
              ),
        ];
      });
    }
    if (cues.isEmpty) return null;
    return MusicScore(level: level!, cues: cues, tracks: tracks);
  }

  /// The mood playing at [ms] in [track], if any.
  String? moodAt(int track, int ms) {
    for (final s in tracks[track] ?? const <ScoreSpan>[]) {
      if (ms >= s.start && ms < s.end) return s.mood;
    }
    return null;
  }
}

class ReelView {
  ReelView({
    required this.id,
    required this.bookId,
    required this.title,
    required this.format,
    required this.status,
    required this.progress,
    required this.phase,
    required this.stylePreset,
    required this.voiceName,
    required this.errorMessage,
    required this.shareToken,
    required this.music,
    required this.episodes,
  });

  final String id;
  final String bookId;
  final String title;
  final String format;
  final String status;
  final double progress;
  final String? phase;
  final String stylePreset;
  final String? voiceName;
  final String? errorMessage;
  final String? shareToken;
  final MusicScore? music;
  final List<ReelEpisode> episodes;

  bool get running => status == 'PENDING' || status == 'GENERATING';
  List<ReelEpisode> get playable => episodes.where((e) => e.playable).toList();
  int get shotsTotal => episodes.fold(0, (n, e) => n + e.shots.length);
  int get shotsDrawn => episodes.fold(
    0,
    (n, e) => n + e.shots.where((s) => (s.imageUrl ?? '').isNotEmpty).length,
  );

  ReelView copyWith({
    String? status,
    double? progress,
    String? phase,
    String? errorMessage,
    String? shareToken,
    bool clearShare = false,
  }) => ReelView(
    id: id,
    bookId: bookId,
    title: title,
    format: format,
    status: status ?? this.status,
    progress: progress ?? this.progress,
    phase: phase ?? this.phase,
    stylePreset: stylePreset,
    voiceName: voiceName,
    errorMessage: errorMessage ?? this.errorMessage,
    shareToken: clearShare ? null : (shareToken ?? this.shareToken),
    music: music,
    episodes: episodes,
  );

  factory ReelView.fromJson(Map<String, dynamic> j) => ReelView(
    id: j['id'] as String,
    bookId: j['bookId'] as String? ?? '',
    title: j['title'] as String? ?? 'Story reel',
    format: j['format'] as String? ?? 'SHORTS',
    status: j['status'] as String? ?? 'PENDING',
    progress: (j['progress'] as num?)?.toDouble() ?? 0,
    phase: j['phase'] as String?,
    stylePreset: j['stylePreset'] as String? ?? 'cinematic',
    voiceName: j['voiceName'] as String?,
    errorMessage: j['errorMessage'] as String?,
    shareToken: j['shareToken'] as String?,
    music: MusicScore.fromJson(j['music']),
    episodes: ((j['episodes'] as List?) ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(ReelEpisode.fromJson)
        .toList(),
  );
}

/// This month's reel time.
class ReelAllowance {
  ReelAllowance({
    required this.limitSeconds,
    required this.remainingSeconds,
    required this.shortWords,
    required this.isFree,
  });

  final int limitSeconds;
  final int remainingSeconds;
  final int shortWords;
  final bool isFree;

  factory ReelAllowance.fromJson(Map<String, dynamic> j) => ReelAllowance(
    limitSeconds: (j['limitSeconds'] as num?)?.toInt() ?? 0,
    remainingSeconds: (j['remainingSeconds'] as num?)?.toInt() ?? 0,
    shortWords: (j['shortWords'] as num?)?.toInt() ?? 190,
    isFree: j['isFree'] as bool? ?? false,
  );
}

/// One reel in the public feed, with the book it came from.
class ReelFeedItem {
  ReelFeedItem({
    required this.reel,
    required this.bookTitle,
    required this.bookSlug,
    required this.author,
  });

  final ReelView reel;
  final String bookTitle;
  final String bookSlug;
  final String author;

  factory ReelFeedItem.fromJson(Map<String, dynamic> j) {
    final book = (j['book'] as Map?)?.cast<String, dynamic>() ?? const {};
    return ReelFeedItem(
      reel: ReelView.fromJson(j['reel'] as Map<String, dynamic>),
      bookTitle: book['title'] as String? ?? '',
      bookSlug: book['slug'] as String? ?? '',
      author: book['author'] as String? ?? 'BookAI author',
    );
  }
}

/// An art style choice, with the two colours of its swatch.
typedef ReelStyle = ({String id, String label, Color from, Color to});

const reelStyles = <ReelStyle>[
  (
    id: 'cinematic',
    label: 'Cinematic',
    from: Color(0xFF1D2B4F),
    to: Color(0xFFC27A3A),
  ),
  (id: 'anime', label: 'Anime', from: Color(0xFFFF9AB3), to: Color(0xFF5A6DFF)),
  (
    id: 'watercolor',
    label: 'Watercolor',
    from: Color(0xFFCFE6DC),
    to: Color(0xFFE8B4A0),
  ),
  (
    id: 'graphic-novel',
    label: 'Graphic novel',
    from: Color(0xFFF5D547),
    to: Color(0xFFD1263B),
  ),
  (id: 'noir', label: 'Noir', from: Color(0xFFE9E9E9), to: Color(0xFF1B1B1B)),
  (
    id: 'storybook',
    label: 'Storybook',
    from: Color(0xFFFFE3A3),
    to: Color(0xFF6FAE8A),
  ),
];

ReelStyle reelStyle(String? id) =>
    reelStyles.firstWhere((s) => s.id == id, orElse: () => reelStyles.first);

/// Words in a book trailer (~60 s); narration pace for estimates.
const trailerTargetWords = 150;
const reelWordsPerMinute = 150;

int estimateReelSeconds(int words) => (words / reelWordsPerMinute * 60).round();

String formatReelSeconds(int seconds) {
  final s = seconds < 0 ? 0 : seconds;
  if (s < 60) return '$s s';
  final m = s ~/ 60;
  final rem = s % 60;
  return rem == 0 ? '$m min' : '$m min $rem s';
}

String formatReelTime(int ms) {
  final total = (ms < 0 ? 0 : ms) ~/ 1000;
  return '${total ~/ 60}:${(total % 60).toString().padLeft(2, '0')}';
}

/// Index of the shot playing at [ms] (shots sorted by start).
int shotIndexAt(List<ReelShot> shots, int ms) {
  var lo = 0;
  var hi = shots.length - 1;
  var found = 0;
  while (lo <= hi) {
    final mid = (lo + hi) >> 1;
    if ((shots[mid].startMs ?? 0) <= ms) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/// Caption words grouped into on-screen chunks of two to four words,
/// breaking after punctuation, the way short-video captions read.
typedef CaptionChunk = ({int start, int end, int first, int last});

final _softBreak = RegExp(r'[,.!?;:…"”]$');
final _hardBreak = RegExp(r'[.!?…]["”’)]*$');

List<CaptionChunk> captionChunks(List<ReelCaption> captions) {
  final chunks = <CaptionChunk>[];
  var first = 0;
  var chars = 0;
  for (var i = 0; i < captions.length; i++) {
    final word = captions[i].word;
    chars += word.length + 1;
    final count = i - first + 1;
    final breakHere =
        i == captions.length - 1 ||
        count >= 4 ||
        chars >= 22 ||
        (count >= 2 && _softBreak.hasMatch(word)) ||
        _hardBreak.hasMatch(word);
    if (breakHere) {
      chunks.add((
        start: captions[first].start,
        end: captions[i].end,
        first: first,
        last: i,
      ));
      first = i + 1;
      chars = 0;
    }
  }
  return chunks;
}

/// Index of the caption chunk showing at [ms], or -1 between chunks.
int chunkIndexAt(List<CaptionChunk> chunks, int ms) {
  var lo = 0;
  var hi = chunks.length - 1;
  while (lo <= hi) {
    final mid = (lo + hi) >> 1;
    final nextStart = mid + 1 < chunks.length ? chunks[mid + 1].start : 1 << 30;
    if (ms < chunks[mid].start) {
      hi = mid - 1;
    } else if (ms >= nextStart) {
      lo = mid + 1;
    } else {
      return ms <= chunks[mid].end + 600 ? mid : -1;
    }
  }
  return -1;
}
