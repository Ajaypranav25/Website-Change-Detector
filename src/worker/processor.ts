import type { Monitor, Snapshot, Target } from "@prisma/client";
import { backoffMs } from "@/lib/blocked";
import { WORKER } from "@/lib/config";
import { db } from "@/lib/db";
import { decideChange } from "@/lib/detect";
import { extractText } from "@/lib/extract";
import { learnVolatileLines, mergeVolatile, normalizeText, parseNoiseRules } from "@/lib/noise";
import { alertQueue } from "@/lib/queue";
import { saveFile } from "@/lib/storage";
import { type RenderResult, renderPage } from "./renderer";

/** Monitors due within this window ride along with a fetch triggered by another monitor. */
const DUE_GRACE_MS = 60_000;

export class RetryableRenderError extends Error {}

type MonitorWithLatest = Monitor & { snapshots: Snapshot[] };

function monitorText(html: string, monitor: Monitor): string {
  const rules = parseNoiseRules(monitor.noiseRules);
  const raw = extractText(html, { watchSelectors: monitor.watchSelectors, ignoreSelectors: monitor.ignoreSelectors, rules });
  return normalizeText(raw, rules, monitor.sensitivity);
}

function nextCheck(monitor: Monitor, now: Date): Date {
  return new Date(now.getTime() + monitor.intervalMinutes * 60_000);
}

async function recordFailure(target: Target, monitors: Monitor[], result: RenderResult, now: Date): Promise<void> {
  const streak = target.failureStreak + 1;
  const shouldBackOff = result.outcome === "BLOCKED" || streak >= 3;
  await db.$transaction([
    db.capture.create({
      data: { targetId: target.id, outcome: result.outcome, httpStatus: result.httpStatus, error: result.reason ?? "Unknown error" },
    }),
    db.target.update({
      where: { id: target.id },
      data: {
        lastFetchedAt: now,
        failureStreak: streak,
        backoffUntil: shouldBackOff ? new Date(now.getTime() + backoffMs(streak, result.retryAfterSeconds)) : null,
      },
    }),
    ...monitors.map((m) =>
      db.monitor.update({
        where: { id: m.id },
        data: { status: result.outcome === "BLOCKED" ? "BLOCKED" : "ERROR", statusDetail: result.reason, lastCheckedAt: now, nextCheckAt: nextCheck(m, now) },
      }),
    ),
  ]);
}

/**
 * Evaluates one monitor against a shared capture. A change must survive a
 * second, independent render: anything that differs between the two renders
 * is learned as per-load noise for this monitor.
 */
async function evaluateMonitor(
  monitor: MonitorWithLatest,
  captureId: string,
  html: string,
  confirmHtml: () => Promise<string | null>,
  now: Date,
): Promise<void> {
  const latest = monitor.snapshots[0] ?? null;
  const text = monitorText(html, monitor);
  // After regions or rules change, old text is not comparable: re-baseline silently.
  const prevText = monitor.needsBaseline ? null : (latest?.text ?? null);
  let volatile = monitor.volatileLines;
  let decision = decideChange({ prevText, nextText: text, sensitivity: monitor.sensitivity, volatile });

  if (decision.kind === "changed") {
    const second = await confirmHtml();
    if (second !== null) {
      volatile = mergeVolatile(volatile, learnVolatileLines(text, monitorText(second, monitor)));
      decision = decideChange({ prevText, nextText: text, sensitivity: monitor.sensitivity, volatile });
    }
  }

  const changed = decision.kind === "changed";
  const monitorUpdate = db.monitor.update({
    where: { id: monitor.id },
    data: {
      status: "OK",
      statusDetail: decision.kind === "below-threshold" ? "Minor change below sensitivity threshold" : null,
      lastCheckedAt: now,
      nextCheckAt: nextCheck(monitor, now),
      volatileLines: volatile,
      needsBaseline: false,
      ...(changed ? { lastChangedAt: now } : {}),
    },
  });
  if (decision.kind !== "changed" && decision.kind !== "baseline") {
    await monitorUpdate;
    return;
  }

  // Snapshot, monitor state and the alert outbox flag commit together, so a crash
  // or Redis outage can never drop an alert: the scheduler sweeps pending flags.
  const [snapshot] = await db.$transaction([
    db.snapshot.create({
      data: {
        monitorId: monitor.id,
        captureId,
        contentHash: decision.hash,
        text,
        addedLines: decision.stats.addedLines,
        removedLines: decision.stats.removedLines,
        previousId: latest?.id ?? null,
        alertPending: changed && latest !== null,
      },
    }),
    monitorUpdate,
  ]);
  if (snapshot.alertPending) await enqueuePendingAlert(snapshot.id, snapshot.previousId).catch(() => undefined);
}

/** Enqueues the alert for a snapshot and clears its outbox flag (idempotent via jobId). */
export async function enqueuePendingAlert(snapshotId: string, previousId: string | null): Promise<void> {
  if (previousId) {
    await alertQueue().add("change", { snapshotId, previousSnapshotId: previousId }, { jobId: `alert-${snapshotId}` });
  }
  await db.snapshot.update({ where: { id: snapshotId }, data: { alertPending: false } });
}

async function safeRender(url: string): Promise<RenderResult> {
  try {
    return await renderPage(url);
  } catch (err) {
    // Timeouts, net::ERR_* and launch failures become an ERROR result so failure bookkeeping always runs.
    const reason = (err as Error).message.split("\n")[0].slice(0, 300);
    return { outcome: "ERROR", reason, httpStatus: null, html: "", screenshot: null, retryAfterSeconds: null };
  }
}

/** Renders a target once and evaluates every monitor that is due on it. */
export async function processTarget(targetId: string, forceMonitorId: string | undefined, isFinalAttempt: boolean): Promise<void> {
  const now = new Date();
  const target = await db.target.findUnique({
    where: { id: targetId },
    include: {
      monitors: {
        where: { paused: false },
        include: { snapshots: { orderBy: { createdAt: "desc" }, take: 1 } },
      },
    },
  });
  if (!target) return;
  const due = target.monitors.filter((m) => m.id === forceMonitorId || m.nextCheckAt.getTime() <= now.getTime() + DUE_GRACE_MS);
  if (due.length === 0) return;

  const result = await safeRender(target.url);
  if (result.outcome === "ERROR" && !isFinalAttempt) throw new RetryableRenderError(result.reason ?? "Render failed");
  if (result.outcome !== "OK") return recordFailure(target, due, result, now);

  const capture = await db.capture.create({ data: { targetId, outcome: "OK", httpStatus: result.httpStatus } });
  const [htmlPath, screenshotPath] = await Promise.all([
    saveFile("captures", `${capture.id}.html`, result.html),
    result.screenshot ? saveFile("captures", `${capture.id}.png`, result.screenshot) : Promise.resolve(null),
  ]);
  await db.capture.update({ where: { id: capture.id }, data: { htmlPath, screenshotPath } });
  await db.target.update({ where: { id: targetId }, data: { lastFetchedAt: now, failureStreak: 0, backoffUntil: null } });

  let confirmation: Promise<string | null> | null = null;
  const confirmHtml = () => {
    confirmation ??= new Promise<void>((r) => setTimeout(r, WORKER.confirmDelayMs))
      .then(() => safeRender(target.url))
      .then((r) => (r.outcome === "OK" ? r.html : null));
    return confirmation;
  };

  for (const monitor of due) {
    await evaluateMonitor(monitor, capture.id, result.html, confirmHtml, now);
  }
}
