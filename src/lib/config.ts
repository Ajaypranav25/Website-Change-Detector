import path from "node:path";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name} (see .env.example)`);
  return value;
}

export const config = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get redisUrl() {
    return process.env.REDIS_URL ?? "redis://localhost:6379";
  },
  get authSecret() {
    const secret = required("AUTH_SECRET");
    if (secret.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters");
    return secret;
  },
  get appUrl() {
    return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get dataDir() {
    return path.resolve(process.env.DATA_DIR ?? "./data");
  },
  get smtpUrl() {
    return process.env.SMTP_URL || null;
  },
  get smtpFrom() {
    return process.env.SMTP_FROM || "Driftwatch <alerts@localhost>";
  },
  get telegramBotToken() {
    return process.env.TELEGRAM_BOT_TOKEN || null;
  },
};

/** Worker tuning. */
export const WORKER = {
  fetchConcurrency: 3,
  /** Minimum gap between two renders of the same host. */
  perHostGapMs: 10_000,
  navigationTimeoutMs: 30_000,
  /** Above the worst case: robots + navigation + idle + screenshot + confirmation render. */
  jobTimeoutMs: 150_000,
  attempts: 3,
  schedulerTickMs: 30_000,
  /** Captures not referenced by any snapshot are deleted after this age. */
  orphanCaptureMaxAgeMs: 60 * 60_000,
  maxScreenshotHeight: 6000,
  viewport: { width: 1280, height: 800 },
  /** Delay before the confirmation re-render that weeds out per-load noise. */
  confirmDelayMs: 3_000,
} as const;
