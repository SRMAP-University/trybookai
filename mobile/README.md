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
