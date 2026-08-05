import { createSign } from "crypto";
import { db } from "@/lib/db";

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function getServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      return null;
    }
    return {
      ...parsed,
      private_key: parsed.private_key.replace(/\\n/g, "\n"),
    };
  } catch (error) {
    console.error("[push] Invalid FIREBASE_SERVICE_ACCOUNT_JSON:", error);
    return null;
  }
}

function base64Url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function getAccessToken(sa: ServiceAccount): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60) {
    return cachedAccessToken.token;
  }

  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(sa.private_key);
  const jwt = `${unsigned}.${base64Url(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    console.error("[push] OAuth token failed:", await res.text());
    return null;
  }

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) return null;

  cachedAccessToken = {
    token: data.access_token,
    expiresAt: now + (data.expires_in ?? 3600),
  };
  return data.access_token;
}

async function sendFcm(
  sa: ServiceAccount,
  accessToken: string,
  token: string,
  payload: PushPayload
): Promise<"ok" | "gone" | "error"> {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          // All data values must be strings. Duplicate title/body so the app
          // can render when Android delivers a data-only foreground message.
          data: Object.fromEntries(
            Object.entries({
              title: payload.title,
              body: payload.body,
              ...(payload.data ?? {}),
            }).map(([k, v]) => [k, String(v ?? "")])
          ),
          android: {
            priority: "HIGH",
            notification: {
              channelId: "bookai_generation",
              notification_priority: "PRIORITY_HIGH",
            },
          },
          apns: {
            payload: {
              aps: {
                sound: "default",
                badge: 1,
              },
            },
          },
        },
      }),
    }
  );

  if (res.ok) return "ok";

  const text = await res.text();
  if (
    res.status === 404 ||
    /UNREGISTERED|NOT_FOUND|INVALID_ARGUMENT/i.test(text)
  ) {
    return "gone";
  }
  console.error("[push] FCM send failed:", res.status, text.slice(0, 400));
  return "error";
}

/** Send a push to all registered devices for a user (no-op if FCM unset / opted out). */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; skipped: string }> {
  const sa = getServiceAccount();
  if (!sa) {
    return { sent: 0, skipped: "firebase_not_configured" };
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      pushNotifications: true,
      pushTokens: { select: { id: true, token: true } },
    },
  });

  if (!user) return { sent: 0, skipped: "user_not_found" };
  if (!user.pushNotifications) return { sent: 0, skipped: "opted_out" };
  if (user.pushTokens.length === 0) return { sent: 0, skipped: "no_tokens" };

  const accessToken = await getAccessToken(sa);
  if (!accessToken) return { sent: 0, skipped: "auth_failed" };

  let sent = 0;
  for (const device of user.pushTokens) {
    const result = await sendFcm(sa, accessToken, device.token, payload);
    if (result === "ok") {
      sent += 1;
    } else if (result === "gone") {
      await db.devicePushToken
        .delete({ where: { id: device.id } })
        .catch(() => undefined);
    }
  }

  return { sent, skipped: sent === 0 ? "send_failed" : "" };
}

export async function notifyBookProgress(input: {
  userId: string;
  bookId: string;
  title: string;
  progress: number;
  phase: "started" | "outline" | "progress" | "completed" | "failed";
}) {
  const pct = Math.round(input.progress);
  if (input.phase === "started") {
    return sendPushToUser(input.userId, {
      title: "Generation started",
      body: `"${input.title}" is queued — building your outline now.`,
      data: {
        type: "book_started",
        bookId: input.bookId,
        progress: String(pct || 0),
      },
    });
  }
  if (input.phase === "completed") {
    return sendPushToUser(input.userId, {
      title: "Book ready",
      body: `"${input.title}" finished generating.`,
      data: {
        type: "book_completed",
        bookId: input.bookId,
        progress: String(pct),
      },
    });
  }
  if (input.phase === "failed") {
    return sendPushToUser(input.userId, {
      title: "Generation stopped",
      body: `"${input.title}" could not finish. Open the app to retry.`,
      data: {
        type: "book_failed",
        bookId: input.bookId,
      },
    });
  }
  if (input.phase === "outline") {
    return sendPushToUser(input.userId, {
      title: "Writing started",
      body: `"${input.title}" outline is ready — generating chapters now.`,
      data: {
        type: "book_progress",
        bookId: input.bookId,
        progress: String(pct || 5),
      },
    });
  }

  return sendPushToUser(input.userId, {
    title: "Book in progress",
    body: `"${input.title}" is about ${pct}% complete.`,
    data: {
      type: "book_progress",
      bookId: input.bookId,
      progress: String(pct),
    },
  });
}

/** Progress milestones that trigger a push (avoid per-section spam). */
export function nextPushMilestone(
  previous: number | null | undefined,
  progress: number
): number | null {
  const milestones = [25, 50, 75];
  const prev = previous ?? 0;
  for (const m of milestones) {
    if (progress >= m && prev < m) return m;
  }
  return null;
}
