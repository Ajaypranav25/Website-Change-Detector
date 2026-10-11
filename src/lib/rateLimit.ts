import { redisConnection, redisReady } from "./queue";

/**
 * Fixed-window limiter backed by Redis. Returns true when the call is allowed.
 * Fails open if Redis is unreachable so an outage does not lock users out.
 */
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  if (!redisReady()) return true;
  try {
    const redis = redisConnection();
    const bucket = `rl:${key}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
    const count = await redis.incr(bucket);
    if (count === 1) await redis.expire(bucket, windowSeconds);
    return count <= max;
  } catch {
    return true;
  }
}

/**
 * Client address for rate limiting. X-Forwarded-For is client-controlled, so
 * it is only used behind a trusted proxy (TRUST_PROXY=1), taking the hop the
 * proxy appended (the rightmost one).
 */
export function clientIp(headers: Headers): string {
  if (process.env.TRUST_PROXY !== "1") return "direct";
  const hops = headers.get("x-forwarded-for")?.split(",").map((h) => h.trim()).filter(Boolean) ?? [];
  return hops.at(-1) || headers.get("x-real-ip") || "direct";
}
