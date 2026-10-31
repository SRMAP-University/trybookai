import 'package:bookai_mobile/screens/home/home_stats.dart';
import 'package:bookai_mobile/widgets/bookai_logo.dart';
import 'package:flutter/material.dart';

/// Shown while restoring the session so logged-in users never flash Login.
/// It picks up from the launch splash: Home's navy with the white mark in
/// the same place, plus a small spinner.
class BootScreen extends StatelessWidget {
  const BootScreen({super.key});

  @override
  Widget build(BuildContext context) {
    const dock = DockTheme.navy;
    return AnnotatedRegion(
      value: dock.overlay,
      child: Scaffold(
        backgroundColor: dock.base,
        body: Stack(
          children: [
            Center(
              child: BookAiLogo(
                height: 128,
                showWordmark: false,
                color: dock.ink,
              ),
            ),
            Align(
              alignment: const Alignment(0, 0.32),
              child: SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(
                  strokeWidth: 2.5,
                  color: dock.accent,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
