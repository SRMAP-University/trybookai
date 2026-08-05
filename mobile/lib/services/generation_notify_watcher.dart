import 'package:flutter/foundation.dart';
import 'package:bookai_mobile/models/models.dart';
import 'package:bookai_mobile/services/push_notifications.dart';

/// Shows local progress / completion notifications from active-job polling.
/// Covers the case where FCM token registration or server push is unavailable.
class GenerationNotifyWatcher {
  GenerationNotifyWatcher(this._push);

  final PushNotificationService _push;

  final Map<String, int> _lastMilestone = {};
  final Map<String, String> _lastStatus = {};
  final Set<String> _completed = {};
  final Set<String> _failed = {};
  final Map<String, String> _titles = {};

  static const _milestones = [25, 50, 75];

  void observe(ActiveJobs? jobs, {List<BookModel> library = const []}) {
    final active = jobs?.books ?? const <BookModel>[];
    final activeIds = <String>{};

    for (final book in active) {
      activeIds.add(book.id);
      _titles[book.id] = book.title;
      final prevStatus = _lastStatus[book.id];
      _lastStatus[book.id] = book.status;

      final progress = book.progress.round().clamp(0, 100);
      final prev = _lastMilestone[book.id] ?? 0;

      for (final m in _milestones) {
        if (progress >= m && prev < m) {
          _lastMilestone[book.id] = m;
          unawaitedLocal(
            title: 'Book in progress',
            body: '"${book.title}" is about $m% complete.',
            bookId: book.id,
            id: book.id.hashCode.abs() + m,
          );
          break;
        }
      }

      // Outline / early writing cue once status moves past pending.
      if (prevStatus != null &&
          prevStatus != book.status &&
          (book.status == 'OUTLINING' || book.status == 'GENERATING') &&
          prev < 5 &&
          progress < 25) {
        unawaitedLocal(
          title: 'Writing started',
          body: '"${book.title}" outline is underway.',
          bookId: book.id,
          id: book.id.hashCode.abs() + 5,
        );
        _lastMilestone[book.id] = 5;
      }
    }

    // Books that left the active list — check library for terminal status.
    for (final entry in _lastStatus.entries.toList()) {
      final id = entry.key;
      if (activeIds.contains(id)) continue;

      BookModel? match;
      for (final b in library) {
        if (b.id == id) {
          match = b;
          break;
        }
      }

      final title = match?.title ?? _titles[id] ?? 'Your book';
      final status = match?.status ?? entry.value;

      if (status == 'COMPLETED' && !_completed.contains(id)) {
        _completed.add(id);
        unawaitedLocal(
          title: 'Book ready',
          body: '"$title" finished generating.',
          bookId: id,
          id: id.hashCode.abs() + 100,
        );
      } else if (status == 'FAILED' && !_failed.contains(id)) {
        _failed.add(id);
        unawaitedLocal(
          title: 'Generation stopped',
          body: '"$title" could not finish. Open the app to retry.',
          bookId: id,
          id: id.hashCode.abs() + 101,
        );
      }

      _lastStatus.remove(id);
      _lastMilestone.remove(id);
    }

    // Also catch completed books still briefly in active jobs at 100%.
    for (final book in active) {
      if (book.status == 'COMPLETED' && !_completed.contains(book.id)) {
        _completed.add(book.id);
        unawaitedLocal(
          title: 'Book ready',
          body: '"${book.title}" finished generating.',
          bookId: book.id,
          id: book.id.hashCode.abs() + 100,
        );
      }
    }
  }

  void unawaitedLocal({
    required String title,
    required String body,
    String? bookId,
    int? id,
  }) {
    _push
        .showLocal(title: title, body: body, bookId: bookId, id: id)
        .catchError((Object e) {
      debugPrint('[gen-notify] local failed: $e');
    });
  }
}
