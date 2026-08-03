/// Google Sign-In OAuth client IDs.
///
/// Same GCP project (603877706963):
/// - Android client (package + SHA-1) — registered in Console only
/// - Web client — [serverClientId] below (ID tokens for the API)
class GoogleAuthConfig {
  static const String serverClientId = String.fromEnvironment(
    'GOOGLE_SERVER_CLIENT_ID',
    defaultValue:
        '603877706963-7p5tcqja0ms1ma6g6doj2g8gjpoo46cd.apps.googleusercontent.com',
  );

  /// Optional iOS OAuth client ID (required for Google Sign-In on iOS).
  static const String iosClientId = String.fromEnvironment(
    'GOOGLE_IOS_CLIENT_ID',
  );

  static bool get hasServerClientId => serverClientId.trim().isNotEmpty;
}
