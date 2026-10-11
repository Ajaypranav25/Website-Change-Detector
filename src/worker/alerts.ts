import { Prisma, type AlertStatus } from "@prisma/client";
import { composeChangeMessage, dedupeKey, renderDigest } from "@/lib/alerts/compose";
import { plainTextFor, sendDiscord, sendEmail, sendTelegram, type SendResult } from "@/lib/alerts/send";
import { config } from "@/lib/config";
import { db } from "@/lib/db";
import type { AlertJob } from "@/lib/queue";

type Channel = "email" | "discord" | "telegram";

function statusFor(result: SendResult): { status: AlertStatus; detail: string | null } {
  if (result.ok) return { status: "SENT", detail: null };
  return { status: result.skipped ? "SKIPPED" : "FAILED", detail: result.detail };
}

async function recordAlert(data: Prisma.AlertUncheckedCreateInput): Promise<void> {
  try {
    await db.alert.create({ data });
  } catch (err) {
    // Unique dedupeKey: another job already alerted on this exact content.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return;
    throw err;
  }
}

/** Sends one change alert per configured channel, never twice for the same content. */
export async function processChangeAlert({ snapshotId, previousSnapshotId }: AlertJob): Promise<void> {
  const [snapshot, previous] = await Promise.all([
    db.snapshot.findUnique({ where: { id: snapshotId }, include: { monitor: { include: { user: true, target: true } } } }),
    db.snapshot.findUnique({ where: { id: previousSnapshotId } }),
  ]);
  if (!snapshot || !previous) return;
  const { monitor } = snapshot;
  const { user } = monitor;
  const msg = composeChangeMessage({
    monitorName: monitor.name,
    url: monitor.target.url,
    prevText: previous.text,
    nextText: snapshot.text,
    compareUrl: `${config.appUrl}/monitors/${monitor.id}/compare?a=${previous.id}&b=${snapshot.id}`,
  });
  const text = plainTextFor(msg, monitor.target.url);

  const channels: { channel: Channel; send: () => Promise<SendResult> }[] = [];
  if (user.emailAlerts) channels.push({ channel: "email", send: () => sendEmail(user.email, msg.subject, text) });
  if (user.discordWebhook) {
    const webhook = user.discordWebhook;
    channels.push({ channel: "discord", send: () => sendDiscord(webhook, msg, monitor.target.url) });
  }
  if (user.telegramChatId) {
    const chatId = user.telegramChatId;
    channels.push({ channel: "telegram", send: () => sendTelegram(chatId, text) });
  }

  // Channels are independent: one failing transport must not block the others.
  // Sent channels are recorded, so a retry only re-attempts the ones that threw.
  const failures: string[] = [];
  for (const { channel, send } of channels) {
    const key = dedupeKey(monitor.id, snapshot.contentHash, channel, snapshot.createdAt);
    if (await db.alert.findUnique({ where: { dedupeKey: key } })) continue;
    const base = { monitorId: monitor.id, snapshotId: snapshot.id, channel, dedupeKey: key };
    if (channel === "email" && user.dailyDigest) {
      await recordAlert({ ...base, status: "QUEUED_DIGEST", detail: msg.summary });
      continue;
    }
    try {
      await recordAlert({ ...base, ...statusFor(await send()) });
    } catch (err) {
      failures.push(`${channel}: ${(err as Error).message}`);
    }
  }
  if (failures.length > 0) throw new Error(`Alert delivery failed (${failures.join("; ")})`);
}

/** Daily email digest of every change queued for users who opted in. */
export async function processDailyDigest(): Promise<void> {
  const queued = await db.alert.findMany({
    where: { status: "QUEUED_DIGEST", channel: "email" },
    include: { monitor: { include: { user: true } } },
    orderBy: { createdAt: "asc" },
  });
  const byUser = Map.groupBy(queued, (a) => a.monitor.userId);
  for (const alerts of byUser.values()) {
    const user = alerts[0].monitor.user;
    const body = renderDigest(
      alerts.map((a) => ({
        name: a.monitor.name,
        summary: a.detail ?? `${a.monitor.name} changed`,
        compareUrl: `${config.appUrl}/monitors/${a.monitorId}`,
      })),
    );
    const result = await sendEmail(user.email, `Driftwatch daily digest: ${alerts.length} change(s)`, body);
    await db.alert.updateMany({ where: { id: { in: alerts.map((a) => a.id) } }, data: statusFor(result) });
  }
}
