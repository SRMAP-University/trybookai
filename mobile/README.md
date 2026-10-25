# BookAI Mobile (Flutter)

Flutter client for [www.trybookai.com](https://www.trybookai.com).  
**API base URL defaults to the product website** (`https://www.trybookai.com`).

## Setup

```bash
cd mobile
flutter pub get
```

## Run (uses production API)

```bash
flutter run
```

No extra flags needed — login, books, billing, and studio all call `https://www.trybookai.com/api/...`.

## Optional: local API (dev only)

```bash
flutter run --dart-define=API_BASE=http://10.0.2.2:3000
```

## Features

- Email/password auth via `/api/mobile/auth/*` (JWT)
- Home, books, generation progress
- Audio studio
- Billing through Google Play / App Store subscriptions (RevenueCat)
- Account, usage, writing defaults

## Google Play Billing

Subscriptions go through Play Billing via RevenueCat - Play doesn't allow
website checkout from the app. Android release builds use the RevenueCat
public Google key baked into `lib/config/revenuecat_config.dart` (public by
design; override with `--dart-define=REVENUECAT_API_KEY=goog_...`). Debug
builds use the RevenueCat Test Store key.

- `android/app/src/main/AndroidManifest.xml` must keep
  `<uses-permission android:name="com.android.vending.BILLING"/>`
  (a `tools:node="remove"` on it disables billing).
- Play product ids should contain the plan word: `bookai_pro`,
  `bookai_premium`, `bookai_unlimited` (base plan `monthly`). The app and
  server map plans from those words.
- Purchases only work in builds installed from a Play testing track, not the
  sideloaded APK.

## Shorebird (OTA updates)

```bash
cd mobile
shorebird init          # once
shorebird release android --artifact apk --build-name 1.0.1 --build-number 2
```

Then upload the APK to R2 and refresh the website download page:

```bash
# from repo root
node scripts/upload-android-apk.mjs
```

Stable public URL: `{R2_PUBLIC_BASE_URL}/apps/bookai-android.apk`  
Website QR / download: https://www.trybookai.com/download

Push a Dart-only OTA patch later (same release version):

```bash
cd mobile
shorebird patch android
```
