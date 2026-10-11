import { Queue } from "bullmq";
import IORedis from "ioredis";
import { config, WORKER } from "./config";

export const FETCH_QUEUE = "fetch";
export const ALERT_QUEUE = "alerts";

export interface FetchJob {
  targetId: string;
  /** Monitor that asked for an immediate check ("Check now"). */
  forceMonitorId?: string;
}

export interface AlertJob {
  snapshotId: string;
  previousSnapshotId: string;
}

/** Alert queue carries change alerts plus the data-less daily digest job. */
export type AlertQueueData = AlertJob | Record<string, never>;

const globalForQueue = globalThis as unknown as {
  redis?: IORedis;
  fetchQueue?: Queue<FetchJob>;
  alertQueue?: Queue<AlertQueueData>;
};

export function redisConnection(): IORedis {
  if (!globalForQueue.redis) {
    const redis = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
    let lastLogged = 0;
    redis.on("error", (err) => {
      // ioredis reconnects on its own; log at most once a minute instead of on every retry.
      if (Date.now() - lastLogged < 60_000) return;
      lastLogged = Date.now();
      process.stderr.write(`[redis] connection error: ${err.message || err.name}
`);
    });
    globalForQueue.redis = redis;
  }
  return globalForQueue.redis;
}

/** True when Redis is connected; web requests use it to fail fast instead of queueing commands. */
export function redisReady(): boolean {
  return redisConnection().status === "ready";
}

export function fetchQueue(): Queue<FetchJob> {
  globalForQueue.fetchQueue ??= new Queue<FetchJob>(FETCH_QUEUE, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: WORKER.attempts,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  });
  return globalForQueue.fetchQueue;
}

export function alertQueue(): Queue<AlertQueueData> {
  globalForQueue.alertQueue ??= new Queue<AlertQueueData>(ALERT_QUEUE, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 4,
      backoff: { type: "exponential", delay: 60_000 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  });
  return globalForQueue.alertQueue;
}

/**
 * One pending job per target: the jobId makes BullMQ ignore duplicates, so
 * 200 monitors on one URL still produce a single render.
 */
export async function enqueueFetch(job: FetchJob): Promise<void> {
  if (!redisReady()) throw new Error("Job queue is unavailable");
  await fetchQueue().add("render", job, { jobId: `target-${job.targetId}` });
}
