import { apiUser, jsonError, jsonOk } from "@/lib/auth";
import { db } from "@/lib/db";
import { settingsSchema } from "@/lib/monitorInput";

export async function PUT(request: Request) {
  const auth = await apiUser();
  if ("response" in auth) return auth.response;
  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const { discordWebhook, telegramChatId, ...flags } = parsed.data;
  await db.user.update({
    where: { id: auth.userId },
    data: { ...flags, discordWebhook: discordWebhook || null, telegramChatId: telegramChatId || null },
  });
  return jsonOk(null);
}
