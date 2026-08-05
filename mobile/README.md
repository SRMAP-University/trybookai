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
- Billing (Stripe Checkout / portal in browser)
- Account, usage, writing defaults

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
