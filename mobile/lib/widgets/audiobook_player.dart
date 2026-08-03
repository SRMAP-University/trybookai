import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:just_audio/just_audio.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:bookai_mobile/theme/app_theme.dart';

class AudioTrackData {
  const AudioTrackData({
    required this.id,
    required this.number,
    required this.title,
    required this.audioUrl,
    this.durationMs,
  });

  final String id;
  final int number;
  final String title;
  final String audioUrl;
  final int? durationMs;

  factory AudioTrackData.fromJson(Map<String, dynamic> json) {
    return AudioTrackData(
      id: json['id'] as String? ?? UniqueKey().toString(),
      number: (json['number'] as num?)?.toInt() ?? 0,
      title: (json['title'] as String?)?.trim().isNotEmpty == true
          ? json['title'] as String
          : 'Track ${(json['number'] as num?)?.toInt() ?? 0}',
      audioUrl: json['audioUrl'] as String? ?? '',
      durationMs: (json['durationMs'] as num?)?.toInt(),
    );
  }
}

/// Compact audiobook controls — play, scrub, optional chapter picker.
class AudiobookPlayer extends StatefulWidget {
  const AudiobookPlayer({
    super.key,
    required this.tracks,
    this.onDownload,
    this.downloading = false,
  });

  final List<AudioTrackData> tracks;
  final VoidCallback? onDownload;
  final bool downloading;

  @override
  State<AudiobookPlayer> createState() => _AudiobookPlayerState();
}

class _AudiobookPlayerState extends State<AudiobookPlayer> {
  AudioPlayer? _player;
  int _index = 0;
  Duration _position = Duration.zero;
  Duration _duration = Duration.zero;
  bool _loading = true;
  bool _playing = false;
  bool _nativeUnavailable = false;

  List<AudioTrackData> get _tracks =>
      widget.tracks.where((t) => t.audioUrl.startsWith('http')).toList();

  @override
  void initState() {
    super.initState();
    _initPlayer();
  }

  @override
  void didUpdateWidget(covariant AudiobookPlayer oldWidget) {
    super.didUpdateWidget(oldWidget);
    final oldIds = oldWidget.tracks.map((t) => '${t.id}:${t.audioUrl}').join('|');
    final newIds = widget.tracks.map((t) => '${t.id}:${t.audioUrl}').join('|');
    if (oldIds != newIds) {
      _reload();
    }
  }

  Future<void> _reload() async {
    await _disposePlayer();
    if (mounted) {
      setState(() {
        _loading = true;
        _nativeUnavailable = false;
        _index = 0;
      });
    }
    await _initPlayer();
  }

  Future<void> _disposePlayer() async {
    final player = _player;
    _player = null;
    if (player == null) return;
    try {
      await player.dispose();
    } catch (_) {}
  }

  Future<void> _initPlayer() async {
    final tracks = _tracks;
    if (tracks.isEmpty) {
      if (mounted) setState(() => _loading = false);
      return;
    }

    try {
      final player = AudioPlayer();
      _player = player;

      player.positionStream.listen((p) {
        if (mounted) setState(() => _position = p);
      });
      player.durationStream.listen((d) {
        if (mounted && d != null) setState(() => _duration = d);
      });
      player.currentIndexStream.listen((i) {
        if (!mounted || i == null || i < 0 || i >= _tracks.length) return;
        setState(() {
          _index = i;
          final ms = _tracks[i].durationMs;
          if (ms != null && ms > 0) {
            _duration = Duration(milliseconds: ms);
          }
        });
      });
      player.playerStateStream.listen((state) {
        if (mounted) setState(() => _playing = state.playing);
      });
      player.processingStateStream.listen((state) {
        if (state == ProcessingState.completed && mounted) {
          setState(() => _playing = false);
        }
      });

      if (tracks.length == 1) {
        await player.setUrl(tracks.first.audioUrl);
      } else {
        await player.setAudioSources(
          tracks
              .map((t) => AudioSource.uri(Uri.parse(t.audioUrl), tag: t.id))
              .toList(),
        );
      }

      final ms = tracks.first.durationMs;
      if (!mounted) return;
      setState(() {
        _loading = false;
        _nativeUnavailable = false;
        if (ms != null && ms > 0) {
          _duration = Duration(milliseconds: ms);
        }
      });
    } on MissingPluginException {
      await _markUnavailable();
    } catch (_) {
      await _markUnavailable();
    }
  }

  Future<void> _markUnavailable() async {
    await _disposePlayer();
    if (!mounted) return;
    setState(() {
      _loading = false;
      _nativeUnavailable = true;
    });
  }

  @override
  void dispose() {
    // ignore: discarded_futures
    _disposePlayer();
    super.dispose();
  }

  String _fmt(Duration d) {
    final total = d.inSeconds.clamp(0, 24 * 3600);
    final m = total ~/ 60;
    final s = total % 60;
    return '$m:${s.toString().padLeft(2, '0')}';
  }

  Future<void> _toggle() async {
    final player = _player;
    final tracks = _tracks;
    if (tracks.isEmpty) return;

    if (_nativeUnavailable || player == null) {
      await _openExternal(tracks[_index].audioUrl);
      return;
    }

    try {
      if (player.playing) {
        await player.pause();
      } else {
        await player.play();
      }
    } catch (_) {
      await _openExternal(tracks[_index].audioUrl);
    }
  }

  Future<void> _selectTrack(int i) async {
    if (i < 0 || i >= _tracks.length) return;
    setState(() => _index = i);
    final player = _player;
    if (_nativeUnavailable || player == null) return;
    try {
      if (_tracks.length == 1) {
        await player.setUrl(_tracks[i].audioUrl);
      } else {
        await player.seek(Duration.zero, index: i);
      }
      await player.play();
    } catch (_) {}
  }

  Future<void> _openExternal(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final tracks = _tracks;
    if (tracks.isEmpty) {
      return const Text(
        'No playable audio yet',
        style: TextStyle(color: AppColors.textMuted, fontSize: 13),
      );
    }

    final track = tracks[_index.clamp(0, tracks.length - 1)];
    final maxMs =
        _duration.inMilliseconds > 0 ? _duration.inMilliseconds.toDouble() : 1.0;
    final posMs =
        _position.inMilliseconds.clamp(0, maxMs.round()).toDouble();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Material(
              color: AppColors.primary,
              shape: const CircleBorder(),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: _loading ? null : _toggle,
                child: SizedBox(
                  width: 48,
                  height: 48,
                  child: _loading
                      ? const Padding(
                          padding: EdgeInsets.all(14),
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : Icon(
                          _playing
                              ? Icons.pause_rounded
                              : Icons.play_arrow_rounded,
                          color: Colors.white,
                          size: 28,
                        ),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    track.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    tracks.length > 1
                        ? 'Chapter ${track.number} of ${tracks.length}'
                        : 'Audiobook',
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textMuted,
                    ),
                  ),
                ],
              ),
            ),
            if (widget.onDownload != null)
              IconButton(
                onPressed: widget.downloading ? null : widget.onDownload,
                tooltip: 'Download audiobook',
                icon: widget.downloading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.download_rounded),
              ),
          ],
        ),
        const SizedBox(height: 8),
        SliderTheme(
          data: SliderTheme.of(context).copyWith(
            trackHeight: 3,
            thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
            overlayShape: const RoundSliderOverlayShape(overlayRadius: 12),
            activeTrackColor: AppColors.primary,
            inactiveTrackColor: AppColors.border,
            thumbColor: AppColors.primary,
          ),
          child: Slider(
            value: posMs,
            max: maxMs,
            onChanged: (_loading || _nativeUnavailable || _player == null)
                ? null
                : (v) {
                    setState(
                      () => _position = Duration(milliseconds: v.round()),
                    );
                  },
            onChangeEnd: (v) {
              _player?.seek(Duration(milliseconds: v.round()));
            },
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Row(
            children: [
              Text(
                _fmt(_position),
                style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
              ),
              const Spacer(),
              Text(
                _fmt(_duration),
                style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
              ),
            ],
          ),
        ),
        if (tracks.length > 1) ...[
          const SizedBox(height: 8),
          DropdownButtonFormField<int>(
            // ignore: deprecated_member_use
            value: _index.clamp(0, tracks.length - 1),
            decoration: const InputDecoration(
              labelText: 'Chapter',
              isDense: true,
              contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            ),
            items: [
              for (var i = 0; i < tracks.length; i++)
                DropdownMenuItem(
                  value: i,
                  child: Text(
                    '${tracks[i].number}. ${tracks[i].title}',
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
            ],
            onChanged: (i) {
              if (i != null) _selectTrack(i);
            },
          ),
        ],
        if (_nativeUnavailable) ...[
          const SizedBox(height: 8),
          TextButton(
            onPressed: () => _openExternal(track.audioUrl),
            child: const Text('Open in system player'),
          ),
        ],
      ],
    );
  }
}
