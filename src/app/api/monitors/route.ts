import { apiUser, jsonError, jsonOk } from "@/lib/auth";
import { createMonitorSchema } from "@/lib/monitorInput";
import { createMonitorForUser, MonitorInputError } from "@/lib/monitors";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(request: Request) {
  const auth = await apiUser();
  if ("response" in auth) return auth.response;
  if (!(await rateLimit(`create-monitor:${auth.userId}`, 30, 3600))) return jsonError("Too many monitors created, try later", 429);

  const parsed = createMonitorSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  try {
    const monitor = await createMonitorForUser(auth.userId, parsed.data);
    return jsonOk({ id: monitor.id }, 201);
  } catch (err) {
    if (err instanceof MonitorInputError) return jsonError(err.message, 400);
    throw err;
  }
}
