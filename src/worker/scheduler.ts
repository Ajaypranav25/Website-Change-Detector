import { unlink } from "node:fs/promises";
import { WORKER } from "@/lib/config";
import { db } from "@/lib/db";
import { enqueueFetch } from "@/lib/queue";
import { dataPath } from "@/lib/storage";
import { enqueuePendingAlert } from "./processor";

const SWEEP_BATCH = 100;
const PRUNE_BATCH = 500;

/**
 * Finds targets with at least one due monitor and enqueues one render per
 * target. Targets in backoff (rate limited, blocked, failing) are skipped.
 */
export async function scheduleDueTargets(now = new Date()): Promise<number> {
  const due = await db.monitor.findMany({
    where: {
      paused: false,
      nextCheckAt: { lte: now },
      target: { OR: [{ backoffUntil: null }, { backoffUntil: { lte: now } }] },
    },
    select: { targetId: true },
    distinct: ["targetId"],
    take: 500,
  });
  for (const { targetId } of due) await enqueueFetch({ targetId });
  return due.length;
}

/** Outbox sweep: re-enqueues alerts whose snapshot committed but whose enqueue failed. */
export async function sweepPendingAlerts(): Promise<number> {
  const pending = await db.snapshot.findMany({
    where: { alertPending: true },
    select: { id: true, previousId: true },
    take: SWEEP_BATCH,
  });
  for (const s of pending) await enqueuePendingAlert(s.id, s.previousId);
  return pending.length;
}

async function removeFile(name: string | null): Promise<void> {
  if (!name) return;
  await unlink(dataPath("captures", name)).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== "ENOENT") throw err;
  });
}

/**
 * Deletes captures no snapshot references (unchanged checks and failures),
 * keeping the latest successful capture per target for the picker and status view.
 */
export async function pruneCaptures(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - WORKER.orphanCaptureMaxAgeMs);
  const candidates = await db.capture.findMany({
    where: { fetchedAt: { lt: cutoff }, snapshots: { none: {} } },
    select: { id: true, targetId: true, htmlPath: true, screenshotPath: true },
    take: PRUNE_BATCH,
  });
  if (candidates.length === 0) return 0;
  const targetIds = [...new Set(candidates.map((c) => c.targetId))];
  const latest = await Promise.all(
    targetIds.map((targetId) =>
      db.capture.findFirst({ where: { targetId, outcome: "OK" }, orderBy: { fetchedAt: "desc" }, select: { id: true } }),
    ),
  );
  const keep = new Set(latest.flatMap((c) => (c ? [c.id] : [])));
  const doomed = candidates.filter((c) => !keep.has(c.id));
  for (const c of doomed) {
    await Promise.all([removeFile(c.htmlPath), removeFile(c.screenshotPath)]);
  }
  await db.capture.deleteMany({ where: { id: { in: doomed.map((c) => c.id) } } });
  return doomed.length;
}
