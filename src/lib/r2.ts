import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const COVER_PREFIX = "covers";
const AUDIO_PREFIX = "audio";

function getR2Config() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const endpoint =
    process.env.R2_ENDPOINT ??
    (accountId
      ? `https://${accountId}.r2.cloudflarestorage.com`
      : undefined);
  const bucket = process.env.R2_BUCKET ?? "bookai";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");
  const apiToken =
    process.env.R2_ACCOUNT_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN;

  return {
    accountId,
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl,
    apiToken,
  };
}

/** True when S3-compatible R2 credentials are present. */
export function isR2Configured(): boolean {
  const { accessKeyId, secretAccessKey, endpoint } = getR2Config();
  return Boolean(accessKeyId && secretAccessKey && endpoint);
}

/** True when we can upload via Cloudflare REST API (Account token with R2 edit). */
export function isR2RestConfigured(): boolean {
  const { accountId, apiToken, bucket } = getR2Config();
  return Boolean(accountId && apiToken && bucket);
}

export function canUploadCoversToR2(): boolean {
  return isR2Configured() || isR2RestConfigured();
}

let client: S3Client | null = null;

function getR2Client(): S3Client {
  if (client) return client;

  const { endpoint, accessKeyId, secretAccessKey } = getR2Config();
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_ENDPOINT (or CLOUDFLARE_ACCOUNT_ID) must be set for R2 uploads."
    );
  }

  client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  return client;
}

export function coverObjectKey(bookId: string): string {
  return `${COVER_PREFIX}/${bookId}.jpg`;
}

async function uploadCoverViaRestApi(
  bookId: string,
  imageBytes: Buffer
): Promise<{ key: string; publicUrl: string | null }> {
  const { accountId, apiToken, bucket, publicBaseUrl } = getR2Config();
  if (!accountId || !apiToken) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN required for R2 REST upload.");
  }

  const key = coverObjectKey(bookId);
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects/${key}`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "image/jpeg",
    },
    body: new Uint8Array(imageBytes),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `R2 REST upload failed (${res.status}): ${body.slice(0, 300)}`
    );
  }

  return {
    key,
    publicUrl: publicBaseUrl ? `${publicBaseUrl}/${key}` : null,
  };
}

async function uploadCoverViaS3(
  bookId: string,
  imageBytes: Buffer
): Promise<{ key: string; publicUrl: string | null }> {
  const { bucket, publicBaseUrl } = getR2Config();
  const key = coverObjectKey(bookId);

  await getR2Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: imageBytes,
      ContentType: "image/jpeg",
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  return {
    key,
    publicUrl: publicBaseUrl ? `${publicBaseUrl}/${key}` : null,
  };
}

export async function uploadCoverToR2(
  bookId: string,
  imageBytes: Buffer
): Promise<{ key: string; publicUrl: string | null }> {
  if (isR2Configured()) {
    return uploadCoverViaS3(bookId, imageBytes);
  }

  if (isR2RestConfigured()) {
    return uploadCoverViaRestApi(bookId, imageBytes);
  }

  throw new Error(
    "R2 is not configured. Set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY (from Cloudflare → R2 → Manage R2 API Tokens)."
  );
}

export function audioObjectKey(
  bookId: string,
  audioId: string,
  trackNumber: number
): string {
  return `${AUDIO_PREFIX}/${bookId}/${audioId}/track-${String(trackNumber).padStart(3, "0")}.mp3`;
}

export function fullAudioObjectKey(bookId: string, audioId: string): string {
  return `${AUDIO_PREFIX}/${bookId}/${audioId}/full.mp3`;
}

async function uploadAudioBytes(
  key: string,
  audioBytes: Buffer,
  filename?: string
): Promise<{ key: string; publicUrl: string | null }> {
  const contentDisposition = filename
    ? `inline; filename="${filename.replace(/"/g, "")}"`
    : undefined;

  if (isR2Configured()) {
    const { bucket, publicBaseUrl } = getR2Config();
    await getR2Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: audioBytes,
        ContentType: "audio/mpeg",
        CacheControl: "public, max-age=31536000, immutable",
        ...(contentDisposition
          ? { ContentDisposition: contentDisposition }
          : {}),
      })
    );
    return {
      key,
      publicUrl: publicBaseUrl ? `${publicBaseUrl}/${key}` : null,
    };
  }

  if (isR2RestConfigured()) {
    const { accountId, apiToken, bucket, publicBaseUrl } = getR2Config();
    if (!accountId || !apiToken) {
      throw new Error(
        "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN required for R2 REST upload."
      );
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects/${key}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "audio/mpeg",
        ...(contentDisposition
          ? { "Content-Disposition": contentDisposition }
          : {}),
      },
      body: new Uint8Array(audioBytes),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `R2 REST audio upload failed (${res.status}): ${body.slice(0, 300)}`
      );
    }

    return {
      key,
      publicUrl: publicBaseUrl ? `${publicBaseUrl}/${key}` : null,
    };
  }

  throw new Error(
    "R2 is not configured. Set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY for audio uploads."
  );
}

export async function uploadAudioToR2(
  bookId: string,
  audioId: string,
  trackNumber: number,
  audioBytes: Buffer
): Promise<{ key: string; publicUrl: string }> {
  const key = audioObjectKey(bookId, audioId, trackNumber);
  const result = await uploadAudioBytes(
    key,
    audioBytes,
    `track-${trackNumber}.mp3`
  );

  if (!result.publicUrl) {
    throw new Error(
      "R2_PUBLIC_BASE_URL must be set so generated audio can be played."
    );
  }

  console.log(
    `[r2] uploaded audiobook track ${result.publicUrl} (${audioBytes.length} bytes)`
  );
  return { key: result.key, publicUrl: result.publicUrl };
}

/** Upload the full concatenated audiobook / podcast / music file. */
export async function uploadFullAudioToR2(
  bookId: string,
  audioId: string,
  audioBytes: Buffer,
  filename = "audiobook.mp3"
): Promise<{ key: string; publicUrl: string }> {
  const key = fullAudioObjectKey(bookId, audioId);
  const result = await uploadAudioBytes(key, audioBytes, filename);

  if (!result.publicUrl) {
    throw new Error(
      "R2_PUBLIC_BASE_URL must be set so generated audio can be played."
    );
  }

  console.log(
    `[r2] uploaded full audio ${result.publicUrl} (${audioBytes.length} bytes)`
  );
  return { key: result.key, publicUrl: result.publicUrl };
}

export async function getCoverFromR2(bookId: string): Promise<Buffer | null> {
  if (isR2Configured()) {
    const { bucket } = getR2Config();
    try {
      const res = await getR2Client().send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: coverObjectKey(bookId),
        })
      );
      if (!res.Body) return null;
      return Buffer.from(await res.Body.transformToByteArray());
    } catch {
      return null;
    }
  }

  if (isR2RestConfigured()) {
    const { accountId, apiToken, bucket } = getR2Config();
    const key = coverObjectKey(bookId);
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects/${key}`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiToken}` },
      });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  return null;
}
