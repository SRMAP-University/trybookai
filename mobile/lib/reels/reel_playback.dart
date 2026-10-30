/// Playing a reel: the narration is the only clock; the shot on screen, its
/// camera move, the highlighted caption word and the mood music all follow
/// its position, so pausing, seeking and buffering stay in sync. Same model
/// as the website's player.
library;

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:just_audio/just_audio.dart';
import 'package:bookai_mobile/models/reel.dart';

/// Crossfade between scene moods; fade when music stops; how far ahead the
/// next mood is looked up (as on the website).
const _crossfadeSeconds = 2.5;
const _stopFadeSeconds = 0.6;
const _leadMs = 800;

class _Cue {
  _Cue() : player = AudioPlayer();
  final AudioPlayer player;
  String? mood;
  double volume = 0;
  double target = 0;
  double rate = 1;
}

/// Mood music mixed under the narration: one looped cue per mood, faded
/// from one to the next as the scenes change.
class ReelMusic {
  ReelMusic();

  MusicScore? _score;
  final _cues = [_Cue(), _Cue()];
  Timer? _ticker;
  bool enabled = true;

  set score(MusicScore? value) {
    if (identical(value, _score)) return;
    _score = value;
    _fadeTo(null, _stopFadeSeconds);
  }

  void sync(int track, int ms, bool playing) {
    final score = _score;
    if (score == null || !enabled || !playing) {
      _fadeTo(null, _stopFadeSeconds);
      return;
    }
    final mood = score.moodAt(track, ms + _leadMs) ?? score.moodAt(track, ms);
    _fadeTo(
      mood != null && score.cues.containsKey(mood) ? mood : null,
      _crossfadeSeconds,
    );
  }

  void _fadeTo(String? mood, double seconds) {
    final gain = _score?.gain ?? 0.12;
    if (mood == null) {
      for (final c in _cues) {
        c.target = 0;
        c.rate = gain / seconds;
      }
      _run();
      return;
    }
    final live = _cues.where((c) => c.mood == mood && c.target > 0);
    if (live.isNotEmpty) {
      for (final c in _cues) {
        c.target = identical(c, live.first) ? gain : 0;
        c.rate = gain / seconds;
      }
      _run();
      return;
    }
    // Bring the quieter player in with the new mood; fade the other out.
    final next = _cues[0].volume <= _cues[1].volume ? _cues[0] : _cues[1];
    final url = _score?.cues[mood];
    if (url == null) return;
    next.mood = mood;
    next.volume = 0;
    next.player.setVolume(0);
    unawaited(() async {
      try {
        await next.player.setUrl(url);
        await next.player.setLoopMode(LoopMode.one);
        if (next.mood == mood) unawaited(next.player.play());
      } catch (_) {}
    }());
    for (final c in _cues) {
      c.target = identical(c, next) ? gain : 0;
      c.rate = gain / seconds;
    }
    _run();
  }

  void _run() {
    _ticker ??= Timer.periodic(const Duration(milliseconds: 50), (_) {
      var moving = false;
      for (final c in _cues) {
        if (c.volume == c.target) continue;
        final step = c.rate * 0.05;
        c.volume = c.volume < c.target
            ? (c.volume + step).clamp(0, c.target)
            : (c.volume - step).clamp(c.target, 1);
        c.player.setVolume(c.volume);
        if (c.volume == 0 && c.target == 0) {
          c.player.pause();
          c.mood = null;
        }
        moving = true;
      }
      if (!moving) {
        _ticker?.cancel();
        _ticker = null;
      }
    });
  }

  void dispose() {
    _ticker?.cancel();
    for (final c in _cues) {
      c.player.dispose();
    }
  }
}

/// One narration player for a screen of reels.
class ReelController extends ChangeNotifier {
  ReelController() {
    _subs.add(
      narration.playerStateStream.listen((state) {
        if (state.processingState == ProcessingState.completed &&
            !_endedFired) {
          _endedFired = true;
          onEnded?.call();
        }
        notifyListeners();
      }),
    );
    _sync = Timer.periodic(const Duration(milliseconds: 250), (_) {
      final e = episode;
      if (e != null) music.sync(e.number, ms, playing);
    });
  }

  final narration = AudioPlayer();
  final music = ReelMusic();
  final _subs = <StreamSubscription<Object?>>[];
  late final Timer _sync;
  bool _endedFired = false;

  ReelEpisode? episode;
  bool captionsOn = true;

  /// Called when the current episode finishes.
  VoidCallback? onEnded;

  bool get playing =>
      narration.playing &&
      narration.processingState != ProcessingState.completed;

  int get ms => narration.position.inMilliseconds;

  int get durationMs =>
      episode?.durationMs ?? narration.duration?.inMilliseconds ?? 0;

  bool get musicOn => music.enabled;
  set musicOn(bool on) {
    music.enabled = on;
    notifyListeners();
  }

  void toggleCaptions() {
    captionsOn = !captionsOn;
    notifyListeners();
  }

  /// Loads [e] (with its reel's [score]) and plays it from the start.
  Future<void> open(
    ReelEpisode e, {
    MusicScore? score,
    bool autoplay = true,
  }) async {
    episode = e;
    music.score = score;
    _endedFired = false;
    notifyListeners();
    final url = e.audioUrl;
    if (url == null) return;
    try {
      await narration.setUrl(url);
      if (autoplay && identical(episode, e)) unawaited(narration.play());
    } catch (_) {}
  }

  void toggle() {
    if (playing) {
      narration.pause();
    } else {
      if (narration.processingState == ProcessingState.completed) {
        narration.seek(Duration.zero);
        _endedFired = false;
      }
      narration.play();
    }
  }

  void pause() => narration.pause();

  void seek(int toMs) {
    _endedFired = false;
    narration.seek(Duration(milliseconds: toMs));
  }

  @override
  void dispose() {
    _sync.cancel();
    for (final s in _subs) {
      s.cancel();
    }
    narration.dispose();
    music.dispose();
    super.dispose();
  }
}
