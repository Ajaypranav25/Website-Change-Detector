import { DelayedError, type Job, Worker } from "bullmq";
import { WORKER } from "@/lib/config";
import { db } from "@/lib/db";
import { ALERT_QUEUE, type AlertJob, alertQueue, type AlertQueueData, FETCH_QUEUE, type FetchJob, redisConnection } from "@/lib/queue";
import { processChangeAlert, processDailyDigest } from "./alerts";
import { processTarget } from "./processor";
import { closeBrowser } from "./renderer";
import { pruneCaptures, scheduleDueTargets, sweepPendingAlerts } from "./scheduler";

/** Scheduler ticks between capture-pruning runs (about once an hour). */
const PRUNE_EVERY_TICKS = 120;

function log(message: string, extra?: Record<string, unknown>): void {
  process.stdout.write(`${new Date().toISOString()} [worker] ${message}${extra ? ` ${JSON.stringify(extra)}` : ""}\n`);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function releaseHostSlot(targetId: string): Promise<void> {
  const target = await db.target.findUnique({ where: { id: targetId }, select: { host: true } });
  if (target) await redisConnection().set(`host-gap:${target.host}`, "1", "PX", WORKER.perHostGapMs);
}

/** Politeness: at most one render per host every perHostGapMs, across all workers. */
async function acquireHostSlot(job: Job<FetchJob>, token: string | undefined): Promise<void> {
  const target = await db.target.findUnique({ where: { id: job.data.targetId }, select: { host: true } });
  if (!target) return;
  const acquired = await redisConnection().set(`host-gap:${target.host}`, "1", "PX", WORKER.perHostGapMs, "NX");
  if (acquired) return;
  await job.moveToDelayed(Date.now() + WORKER.perHostGapMs, token);
  throw new DelayedError();
}

const fetchWorker = new Worker<FetchJob>(
  FETCH_QUEUE,
  async (job, token) => {
    await acquireHostSlot(job, token);
    const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    try {
      await withTimeout(processTarget(job.data.targetId, job.data.forceMonitorId, isFinalAttempt), WORKER.jobTimeoutMs, "Render job");
    } finally {
      // Measure the politeness gap from the end of the render, not its start.
      await releaseHostSlot(job.data.targetId);
    }
  },
  {
    connection: redisConnection(),
    concurrency: WORKER.fetchConcurrency,
  },
);

const alertWorker = new Worker<AlertQueueData>(
  ALERT_QUEUE,
  async (job) => {
    if (job.name === "digest") return processDailyDigest();
    return processChangeAlert(job.data as AlertJob);
  },
  { connection: redisConnection(), concurrency: 5 },
);

fetchWorker.on("failed", (job, err) => log("render failed", { targetId: job?.data.targetId, attempt: job?.attemptsMade, error: err.message }));
alertWorker.on("failed", (job, err) => log("alert failed", { job: job?.name, error: err.message }));

let ticks = 0;

async function runStep(name: string, step: () => Promise<number>): Promise<void> {
  try {
    const count = await step();
    if (count > 0) log(name, { count });
  } catch (err) {
    log(`${name} failed`, { error: (err as Error).message });
  }
}

async function tick(): Promise<void> {
  await runStep("scheduled renders", () => scheduleDueTargets());
  await runStep("re-enqueued pending alerts", sweepPendingAlerts);
  if (ticks++ % PRUNE_EVERY_TICKS === 0) await runStep("pruned captures", () => pruneCaptures());
}

async function main(): Promise<void> {
  await alertQueue().upsertJobScheduler("daily-digest", { pattern: "0 8 * * *" }, { name: "digest", data: {} });
  await tick();
  const interval = setInterval(tick, WORKER.schedulerTickMs);
  log("worker started", { concurrency: WORKER.fetchConcurrency });

  const shutdown = async (signal: string) => {
    log(`received ${signal}, shutting down`);
    clearInterval(interval);
    await Promise.allSettled([fetchWorker.close(), alertWorker.close()]);
    await Promise.allSettled([closeBrowser(), db.$disconnect()]);
    redisConnection().disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  log("fatal", { error: (err as Error).message });
  process.exit(1);
});
