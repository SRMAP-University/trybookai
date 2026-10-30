import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:bookai_mobile/config/api_config.dart';
import 'package:bookai_mobile/theme/app_theme.dart';

/// A cover drawn as a physical book: spine shading on the left, page edges
/// peeking out at the bottom, a ribbon bookmark and a soft drop shadow.
/// Falls back to a coloured cover with the title when there's no image.
///
/// On a dark stage ([onDark]) it's drawn like the website's hero cover
/// instead: no page edges, a deep black shadow and a faint light outline.
class BookCover3D extends StatelessWidget {
  const BookCover3D({
    super.key,
    required this.title,
    this.coverImage,
    this.slug,
    this.width = 110,
    this.ribbon = true,
    this.onDark = false,
  });

  final String title;
  final String? coverImage;
  final String? slug;
  final double width;
  final bool ribbon;
  final bool onDark;

  /// The space a cover of [width] takes, page edges and ribbon included.
  static Size sizeFor(double width, {bool ribbon = true, bool onDark = false}) {
    final height = width * _aspect;
    final pages = onDark ? 0.0 : width * 0.035;
    return Size(width + pages, height + pages + (ribbon ? height * 0.07 : 0));
  }

  static const _aspect = 1.45;
  // Cool tones around the brand indigo, so placeholders sit with the UI.
  static const _palette = [
    Color(0xFF4B44D6),
    Color(0xFF0A2540),
    Color(0xFF2D6CA8),
    Color(0xFF0E6245),
    Color(0xFF6E4FD8),
    Color(0xFF1F6F8B),
  ];

  @override
  Widget build(BuildContext context) {
    final height = width * _aspect;
    final url = ApiConfig.coverUrl(coverImage, slug);
    final pages = onDark ? 0.0 : width * 0.035;
    const radius = BorderRadius.only(
      topLeft: Radius.circular(4),
      bottomLeft: Radius.circular(4),
      topRight: Radius.circular(9),
      bottomRight: Radius.circular(9),
    );

    return SizedBox(
      width: width + pages,
      height: height + pages + (ribbon ? height * 0.07 : 0),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          // Page block, visible below and to the right of the cover.
          if (!onDark)
            Positioned(
              left: width * 0.06,
              top: pages,
              width: width - width * 0.04,
              height: height,
              child: Container(
                decoration: BoxDecoration(
                  color: const Color(0xFFF7F8FA),
                  borderRadius: radius,
                  border: Border.all(color: const Color(0xFFE3E7EE)),
                ),
              ),
            ),
          Container(
            width: width,
            height: height,
            decoration: BoxDecoration(
              borderRadius: radius,
              border: onDark
                  ? Border.all(color: Colors.white.withValues(alpha: 0.1))
                  : null,
              boxShadow: onDark
                  // The website's hero cover shadow.
                  ? [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.3),
                        blurRadius: 6,
                        offset: const Offset(0, 2),
                      ),
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.85),
                        blurRadius: 60,
                        spreadRadius: -24,
                        offset: const Offset(0, 34),
                      ),
                    ]
                  // A thin contact edge where the book meets the page, and a
                  // short soft glow straight below; no sideways smear.
                  : [
                      BoxShadow(
                        color: AppColors.navy.withValues(alpha: 0.16),
                        blurRadius: (width * 0.02).clamp(1.0, 3.0),
                        offset: Offset(0, (width * 0.01).clamp(0.5, 2.0)),
                      ),
                      BoxShadow(
                        color: AppColors.navy.withValues(alpha: 0.10),
                        blurRadius: width * 0.12,
                        spreadRadius: -width * 0.04,
                        offset: Offset(0, width * 0.07),
                      ),
                    ],
            ),
            child: ClipRRect(
              borderRadius: radius,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (url.isEmpty)
                    _placeholder()
                  else
                    CachedNetworkImage(
                      imageUrl: url,
                      fit: BoxFit.cover,
                      placeholder: (_, _) => _placeholder(),
                      errorWidget: (_, _, _) => _placeholder(),
                    ),
                  // Spine: dark fold, then a thin highlight.
                  Positioned(
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: width * 0.11,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [
                            Colors.black.withValues(alpha: 0.32),
                            Colors.black.withValues(alpha: 0.08),
                            Colors.white.withValues(alpha: 0.18),
                            Colors.transparent,
                          ],
                          stops: const [0, 0.45, 0.6, 1],
                        ),
                      ),
                    ),
                  ),
                  // Soft sheen across the cover.
                  DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [
                          Colors.white.withValues(alpha: 0.10),
                          Colors.transparent,
                          Colors.black.withValues(alpha: 0.08),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (ribbon)
            Positioned(
              right: width * 0.16,
              top: height - height * 0.03,
              child: CustomPaint(
                size: Size(width * 0.12, height * 0.11),
                painter: _RibbonPainter(AppColors.ribbon),
              ),
            ),
        ],
      ),
    );
  }

  Widget _placeholder() {
    final color = _palette[title.hashCode.abs() % _palette.length];
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [color, Color.lerp(color, Colors.black, 0.25)!],
        ),
      ),
      padding: EdgeInsets.fromLTRB(width * 0.16, width * 0.14, width * 0.08, 0),
      alignment: Alignment.topLeft,
      child: Text(
        title,
        maxLines: 4,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w800,
          fontSize: width * 0.11,
          height: 1.15,
        ),
      ),
    );
  }
}

class _RibbonPainter extends CustomPainter {
  _RibbonPainter(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()
      ..moveTo(0, 0)
      ..lineTo(size.width, 0)
      ..lineTo(size.width, size.height)
      ..lineTo(size.width / 2, size.height * 0.74)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(path, Paint()..color = color);
    canvas.drawRect(
      Rect.fromLTWH(0, 0, size.width, size.height * 0.12),
      Paint()..color = Colors.black.withValues(alpha: 0.12),
    );
  }

  @override
  bool shouldRepaint(_RibbonPainter old) => old.color != color;
}
