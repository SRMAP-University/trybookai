/// BookAI production website — all API calls go here.
class ApiConfig {
  /// Product site. Override only for local debugging:
  /// `--dart-define=API_BASE=http://10.0.2.2:3000`
  static const String baseUrl = String.fromEnvironment(
    'API_BASE',
    defaultValue: 'https://www.trybookai.com',
  );

  static const String login = '/api/mobile/auth/login';
  static const String register = '/api/mobile/auth/register';
  static const String me = '/api/mobile/auth/me';
  static const String devices = '/api/mobile/devices';
  static const String books = '/api/books';
  static const String settings = '/api/settings';
  static const String branding = '/api/branding';
  static const String jobsActive = '/api/jobs/active';
  static const String analytics = '/api/analytics';
  static const String billingCheckout = '/api/billing/checkout';
  static const String billingTrial = '/api/billing/trial';
  static const String billingSync = '/api/billing/sync';
  static const String billingRevenueCatSync = '/api/billing/revenuecat/sync';
  static const String studioAudio = '/api/studio/audio';
  static const String audio = '/api/audio';
  static const String publicBooks = '/api/public/books';

  static String bookExport(String bookId) => '/api/books/$bookId/export';

  static String coverUrl(String? coverImage, String? slug) {
    if (coverImage != null &&
        (coverImage.startsWith('http://') ||
            coverImage.startsWith('https://'))) {
      return coverImage;
    }
    if (slug != null && slug.isNotEmpty) {
      return '$baseUrl/api/books/cover/$slug';
    }
    return '';
  }
}
