import type { Prisma } from "@prisma/client";
import { apiUser, jsonError, jsonOk } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateMonitorSchema } from "@/lib/monitorInput";
import { findOwnedMonitor } from "@/lib/monitors";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await apiUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const monitor = await findOwnedMonitor(auth.userId, id);
  if (!monitor) return jsonError("Monitor not found", 404);

  const parsed = updateMonitorSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const { noiseRules, ...rest } = parsed.data;
  const extractionChanged =
    rest.watchSelectors !== undefined ||
    rest.ignoreSelectors !== undefined ||
    noiseRules !== undefined ||
    (rest.sensitivity !== undefined && rest.sensitivity !== monitor.sensitivity);

  const updated = await db.monitor.update({
    where: { id },
    data: {
      ...rest,
      ...(noiseRules ? { noiseRules: noiseRules as Prisma.InputJsonValue } : {}),
      // New regions or rules make old text incomparable: forget learned noise and
      // re-baseline on the next check instead of alerting on the difference.
      ...(extractionChanged ? { volatileLines: [], needsBaseline: true } : {}),
      ...(rest.intervalMinutes ? { nextCheckAt: new Date(Date.now() + rest.intervalMinutes * 60_000) } : {}),
    },
  });
  return jsonOk({ id: updated.id });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const auth = await apiUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const monitor = await findOwnedMonitor(auth.userId, id);
  if (!monitor) return jsonError("Monitor not found", 404);
  await db.monitor.delete({ where: { id } });
  return jsonOk(null);
}
