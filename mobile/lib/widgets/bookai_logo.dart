import 'package:flutter/material.dart';
import 'package:bookai_mobile/theme/app_theme.dart';

class BookAiLogo extends StatelessWidget {
  const BookAiLogo({
    super.key,
    this.height = 36,
    this.showWordmark = true,
  });

  final double height;
  final bool showWordmark;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Image.asset(
          'assets/images/logo.png',
          height: height,
          width: height,
          filterQuality: FilterQuality.high,
          // Force dark mark on light UI (asset is black; tint keeps it crisp).
          color: Colors.black,
          colorBlendMode: BlendMode.srcIn,
        ),
        if (showWordmark) ...[
          const SizedBox(width: 10),
          Text(
            'BookAI',
            style: TextStyle(
              fontSize: height * 0.72,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.8,
              color: AppColors.navy,
              height: 1,
            ),
          ),
        ],
      ],
    );
  }
}
