/// Google Sign-In OAuth client IDs.
///
/// [serverClientId] must be the **Web** client ID from Google Cloud Console
/// (same value as server `GOOGLE_CLIENT_ID`). Android uses it to mint an ID
/// token your API can verify.
///
/// For iOS, also create an iOS OAuth client and pass it via
/// `--dart-define=GOOGLE_IOS_CLIENT_ID=…` (and add the reversed client ID
/// URL scheme in `ios/Runner/Info.plist`).
class GoogleAuthConfig {
  static const String serverClientId = String.fromEnvironment(
    'GOOGLE_SERVER_CLIENT_ID',
    defaultValue:
        '603877706963-h1dtpvdql77anmghevncpjeodsp630m4.apps.googleusercontent.com',
  );

  /// Optional iOS OAuth client ID (required for Google Sign-In on iOS).
  static const String iosClientId = String.fromEnvironment(
    'GOOGLE_IOS_CLIENT_ID',
  );
}
