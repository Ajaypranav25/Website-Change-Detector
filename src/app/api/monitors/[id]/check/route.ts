import { apiUser, jsonError, jsonOk } from "@/lib/auth";
import { db } from "@/lib/db";
import { findOwnedMonitor } from "@/lib/monitors";
import { enqueueFetch } from "@/lib/queue";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const monitor = await findOwnedMonitor(auth.userId, id);
  if (!monitor) return jsonError("Monitor not found", 404);
  // Manual checks are still polite: at most one per monitor every 2 minutes.
  if (!(await rateLimit(`check:${id}`, 1, 120))) return jsonError("A check was requested recently, try again in a couple of minutes", 429);
  if (monitor.target.backoffUntil && monitor.target.backoffUntil > new Date()) {
    return jsonError(`Site is backing off until ${monitor.target.backoffUntil.toLocaleTimeString("en-US")}`, 409);
  }
  // Marking it due also covers the case where a render for this target is already queued.
  await db.monitor.update({ where: { id }, data: { nextCheckAt: new Date() } });
  try {
    await enqueueFetch({ targetId: monitor.targetId, forceMonitorId: monitor.id });
  } catch {
    // The scheduler will still pick it up because the monitor is now due.
    return jsonOk({ queued: false, detail: "Queue unavailable; the scheduler will run it shortly" }, 202);
  }
  return jsonOk({ queued: true }, 202);
}
