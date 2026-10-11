import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { DEFAULT_NOISE_RULES } from "./noise";
import { enqueueFetch } from "./queue";
import { assertPublicUrl, normalizeUrl, UnsafeUrlError } from "./url";

export const MAX_MONITORS_PER_USER = 100;

export class MonitorInputError extends Error {}

export async function createMonitorForUser(
  userId: string,
  input: { url: string; name: string; intervalMinutes: number; sensitivity: number },
) {
  const count = await db.monitor.count({ where: { userId } });
  if (count >= MAX_MONITORS_PER_USER) throw new MonitorInputError(`Limit of ${MAX_MONITORS_PER_USER} monitors reached`);

  let url: string;
  try {
    url = normalizeUrl(input.url);
    await assertPublicUrl(url);
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw new MonitorInputError(err.message);
    if (err instanceof TypeError) throw new MonitorInputError("That does not look like a valid URL");
    throw new MonitorInputError("Could not resolve that hostname. Check the address and try again");
  }

  const host = new URL(url).hostname;
  const target = await db.target.upsert({ where: { url }, create: { url, host }, update: {} });
  const monitor = await db.monitor.create({
    data: {
      userId,
      targetId: target.id,
      name: input.name,
      intervalMinutes: input.intervalMinutes,
      sensitivity: input.sensitivity,
      noiseRules: DEFAULT_NOISE_RULES as Prisma.InputJsonValue,
      watchSelectors: [],
      ignoreSelectors: [],
      volatileLines: [],
    },
  });
  await enqueueFetch({ targetId: target.id, forceMonitorId: monitor.id }).catch(() => undefined);
  return monitor;
}

export function findOwnedMonitor(userId: string, id: string) {
  return db.monitor.findFirst({ where: { id, userId }, include: { target: true } });
}

/** A capture is visible to a user only if one of their monitors watches its target. */
export async function canViewCapture(userId: string, captureId: string): Promise<boolean> {
  const capture = await db.capture.findUnique({ where: { id: captureId }, select: { targetId: true } });
  if (!capture) return false;
  const owned = await db.monitor.count({ where: { userId, targetId: capture.targetId } });
  return owned > 0;
}
