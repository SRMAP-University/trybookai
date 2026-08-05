/**
 * Upload a Shorebird/Flutter release APK to R2.
 *
 * Usage:
 *   node scripts/upload-android-apk.mjs [path-to-apk]
 *
 * Defaults to mobile/build/app/outputs/flutter-apk/app-release.apk
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const require = createRequire(import.meta.url);
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const apkPath = resolve(
  process.argv[2] ||
    "mobile/build/app/outputs/flutter-apk/app-release.apk"
);

if (!existsSync(apkPath)) {
  console.error(`APK not found: ${apkPath}`);
  process.exit(1);
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const endpoint =
  process.env.R2_ENDPOINT?.trim() ||
  (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
const bucket = process.env.R2_BUCKET?.trim() || "bookai";
const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");

if (!endpoint || !accessKeyId || !secretAccessKey) {
  console.error(
    "Missing R2 credentials. Need R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_ENDPOINT (or CLOUDFLARE_ACCOUNT_ID)."
  );
  process.exit(1);
}

const body = readFileSync(apkPath);
const version =
  process.env.ANDROID_APP_VERSION?.trim() ||
  process.env.NEXT_PUBLIC_ANDROID_APP_VERSION?.trim() ||
  "1.0.1";

const keys = [
  "apps/bookai-android.apk",
  `apps/bookai-android-${version}.apk`,
];

const client = new S3Client({
  region: "auto",
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
});

for (const key of keys) {
  process.stdout.write(`Uploading ${key} (${(body.length / 1024 / 1024).toFixed(1)} MB)… `);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "application/vnd.android.package-archive",
      ContentDisposition: 'attachment; filename="bookai.apk"',
      CacheControl:
        key === "apps/bookai-android.apk"
          ? "public, max-age=300"
          : "public, max-age=31536000, immutable",
    })
  );
  console.log("ok");
  if (publicBaseUrl) {
    console.log(`  ${publicBaseUrl}/${key}`);
  }
}

console.log("\nDone. Stable download URL:");
console.log(
  publicBaseUrl
    ? `${publicBaseUrl}/apps/bookai-android.apk`
    : "(set R2_PUBLIC_BASE_URL for a public link)"
);
