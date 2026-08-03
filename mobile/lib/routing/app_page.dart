import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Shared page transitions for BookAI navigation.
class AppPage {
  static const Duration duration = Duration(milliseconds: 280);

  /// Detail / push routes — slide in from the right with a light fade.
  static CustomTransitionPage<void> slide(GoRouterState state, Widget child) {
    return CustomTransitionPage<void>(
      key: state.pageKey,
      name: state.name,
      child: child,
      transitionDuration: duration,
      reverseTransitionDuration: duration,
      transitionsBuilder: (context, animation, secondaryAnimation, child) {
        final curved = CurvedAnimation(
          parent: animation,
          curve: Curves.easeOutCubic,
          reverseCurve: Curves.easeInCubic,
        );
        return FadeTransition(
          opacity: curved,
          child: SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(0.06, 0),
              end: Offset.zero,
            ).animate(curved),
            child: child,
          ),
        );
      },
    );
  }

  /// Auth / soft entry — fade + slight rise.
  static CustomTransitionPage<void> fadeUp(GoRouterState state, Widget child) {
    return CustomTransitionPage<void>(
      key: state.pageKey,
      name: state.name,
      child: child,
      transitionDuration: duration,
      reverseTransitionDuration: duration,
      transitionsBuilder: (context, animation, secondaryAnimation, child) {
        final curved = CurvedAnimation(
          parent: animation,
          curve: Curves.easeOutCubic,
          reverseCurve: Curves.easeInCubic,
        );
        return FadeTransition(
          opacity: curved,
          child: SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(0, 0.04),
              end: Offset.zero,
            ).animate(curved),
            child: child,
          ),
        );
      },
    );
  }

  /// Bottom-tab roots stay instant (shell uses indexed stack).
  static NoTransitionPage<void> none(GoRouterState state, Widget child) {
    return NoTransitionPage<void>(
      key: state.pageKey,
      name: state.name,
      child: child,
    );
  }
}
