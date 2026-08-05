# Mobile push notifications (FCM)

BookAI sends push notifications when a book is generating and when it finishes.

## What users receive

| Event | Notification |
|---|---|
| Job claimed / generation begins | “Generation started” |
| Outline ready | “Writing started” |
| Progress ~25% / 50% / 75% | “Book in progress” |
| Completed | “Book ready” |
| Failed | “Generation stopped” |

> **Required:** `FIREBASE_SERVICE_ACCOUNT_JSON` on Vercel (Firebase project `bookai-eedf3`). Without it, server pushes are no-ops (`firebase_not_configured`). The app still shows a local “Generation started” banner when you create a book.

Tap opens the book detail screen. Users can disable pushes in **Account → Settings → Push notifications**.

## Server setup (Vercel)

1. Create a Firebase project → Project settings → Service accounts → Generate new private key.
2. Set Vercel env (Production + Preview):

```bash
# Single-line JSON string
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"..."}'
```

`GENERATION_WORKER_SECRET` must already be set so the Cloudflare worker can call `POST /api/internal/push`.

3. Apply the DB migration (`DevicePushToken` + `User.pushNotifications`):

```bash
npx prisma migrate deploy
# or locally: npx prisma db push
```

4. Redeploy the Next.js app.

## Cloudflare worker

`APP_NOTIFY_URL` defaults to `https://www.trybookai.com` in `wrangler.toml`. Redeploy after changing it:

```bash
cd workers/book-generation && npm run deploy
```

## Mobile app (Flutter)

1. Add an Android app in Firebase (`com.trybookai.bookai_mobile`) and download `google-services.json` into `mobile/android/app/`.
2. For iOS, add the app + `GoogleService-Info.plist`, enable Push Notifications + Background Modes.
3. Run with Firebase dart-defines (or use FlutterFire CLI to generate options):

```bash
cd mobile
flutter pub get
flutter run \
  --dart-define=FIREBASE_API_KEY=... \
  --dart-define=FIREBASE_APP_ID=... \
  --dart-define=FIREBASE_MESSAGING_SENDER_ID=... \
  --dart-define=FIREBASE_PROJECT_ID=... \
  --dart-define=FIREBASE_STORAGE_BUCKET=...
```

Without Firebase config, the app still runs; push registration is skipped.

## APIs

- `POST /api/mobile/devices` `{ token, platform: "ios"|"android" }` — register FCM token (Bearer mobile JWT)
- `DELETE /api/mobile/devices` `{ token }` — unregister on logout
- `POST /api/internal/push` — worker → FCM (Bearer `GENERATION_WORKER_SECRET`)
