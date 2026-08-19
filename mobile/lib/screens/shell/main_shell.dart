import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:bookai_mobile/providers/books_provider.dart';
import 'package:bookai_mobile/services/generation_notify_watcher.dart';
import 'package:bookai_mobile/services/push_notifications.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/global_generation_widget.dart';

class MainShell extends StatefulWidget {
  const MainShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  Timer? _jobsPoll;
  Timer? _tokenRetry;
  GenerationNotifyWatcher? _notifyWatcher;
  BooksProvider? _books;

  static const _mainTabs = <_NavItem>[
    _NavItem(Icons.home_outlined, Icons.home_rounded, 'Home'),
    _NavItem(Icons.menu_book_outlined, Icons.menu_book_rounded, 'Books'),
    _NavItem(Icons.public_outlined, Icons.public_rounded, 'Discover'),
    _NavItem(Icons.headphones_outlined, Icons.headphones_rounded, 'Studio'),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final books = context.read<BooksProvider>();
      final push = context.read<PushNotificationService>();
      _books = books;
      _notifyWatcher = GenerationNotifyWatcher(push);
      books.addListener(_onBooksChanged);
      books.loadActiveJobs();
      unawaited(push.registerToken());
      _jobsPoll = Timer.periodic(const Duration(seconds: 10), (_) {
        if (!mounted) return;
        context.read<BooksProvider>().loadActiveJobs();
      });
      // Retry FCM registration a few times — getToken can fail on first launch.
      var tries = 0;
      _tokenRetry = Timer.periodic(const Duration(seconds: 20), (t) {
        tries += 1;
        unawaited(push.registerToken());
        if (tries >= 6 || push.token != null) t.cancel();
      });
    });
  }

  void _onBooksChanged() {
    final books = _books;
    final watcher = _notifyWatcher;
    if (books == null || watcher == null) return;
    watcher.observe(books.activeJobs, library: books.books);
  }

  @override
  void dispose() {
    _jobsPoll?.cancel();
    _tokenRetry?.cancel();
    _books?.removeListener(_onBooksChanged);
    super.dispose();
  }

  void _onTap(int index) {
    widget.navigationShell.goBranch(
      index,
      initialLocation: index == widget.navigationShell.currentIndex,
    );
  }

  @override
  Widget build(BuildContext context) {
    final index = widget.navigationShell.currentIndex;
    final bottomInset = MediaQuery.paddingOf(context).bottom;
    final accountSelected = index == 4;

    return Scaffold(
      extendBody: true,
      body: Stack(
        children: [
          widget.navigationShell,
          Positioned(
            left: 0,
            right: 0,
            bottom: 78 + bottomInset,
            child: const GlobalGenerationWidget(),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(14, 0, 14, 10),
        child: Row(
          children: [
            Expanded(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: AppColors.white,
                  borderRadius: BorderRadius.circular(28),
                  border: Border.all(color: AppColors.border),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.navy.withValues(alpha: 0.10),
                      blurRadius: 24,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: SizedBox(
                  height: 64,
                  child: Row(
                    children: [
                      for (var i = 0; i < _mainTabs.length; i++)
                        Expanded(
                          child: _NavButton(
                            item: _mainTabs[i],
                            selected: index == i,
                            onTap: () => _onTap(i),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(width: 10),
            // Account — separate floating circle from the main menu.
            Material(
              color: accountSelected ? AppColors.primary : AppColors.white,
              shape: const CircleBorder(),
              elevation: 6,
              shadowColor: AppColors.navy.withValues(alpha: 0.18),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: () => _onTap(4),
                child: Ink(
                  width: 58,
                  height: 58,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: accountSelected
                        ? null
                        : Border.all(color: AppColors.border),
                  ),
                  child: Icon(
                    accountSelected
                        ? Icons.person_rounded
                        : Icons.person_outline_rounded,
                    color: accountSelected ? Colors.white : AppColors.navy,
                    size: 26,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: index == 1
          ? Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: FloatingActionButton.extended(
                onPressed: () => context.push('/books/new'),
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                icon: const Icon(Icons.add),
                label: const Text('New book'),
              ),
            )
          : null,
    );
  }
}

class _NavItem {
  const _NavItem(this.icon, this.selectedIcon, this.label);
  final IconData icon;
  final IconData selectedIcon;
  final String label;
}

class _NavButton extends StatelessWidget {
  const _NavButton({
    required this.item,
    required this.selected,
    required this.onTap,
  });

  final _NavItem item;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected ? AppColors.primary : AppColors.textMuted;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            selected ? item.selectedIcon : item.icon,
            color: color,
            size: 22,
          ),
          const SizedBox(height: 2),
          Text(
            item.label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 10,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}
