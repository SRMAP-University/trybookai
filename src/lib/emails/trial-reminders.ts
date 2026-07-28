import { db } from "@/lib/db";
import { sendTrialEndingReminderEmail } from "@/lib/emails/transactional";

const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function sendDueTrialReminders() {
  const now = Date.now();
  const windowEnd = new Date(now + REMINDER_WINDOW_MS);

  const users = await db.user.findMany({
    where: {
      emailNotifications: true,
      trialEndsAt: {
        gt: new Date(now),
        lte: windowEnd,
      },
      trialReminderSentAt: null,
      plan: "ENTERPRISE",
    },
    select: {
      id: true,
      email: true,
      name: true,
      trialEndsAt: true,
    },
  });

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const user of users) {
    if (!user.trialEndsAt) continue;

    try {
      const result = await sendTrialEndingReminderEmail({
        to: user.email,
        name: user.name,
        trialEndsAt: user.trialEndsAt,
        interval: "month",
      });

      if (result.ok) {
        await db.user.update({
          where: { id: user.id },
          data: { trialReminderSentAt: new Date() },
        });
        sent += 1;
      } else {
        skipped += 1;
      }
    } catch (error) {
      errors.push(
        `${user.email}: ${error instanceof Error ? error.message : "send failed"}`
      );
    }
  }

  return { checked: users.length, sent, skipped, errors };
}
