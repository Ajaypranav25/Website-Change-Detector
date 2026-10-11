import bcrypt from "bcryptjs";
import { z } from "zod";
import { jsonError, jsonOk, startSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rateLimit";

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export async function POST(request: Request) {
  if (!(await rateLimit(`signup:${clientIp(request.headers)}`, 10, 3600))) return jsonError("Too many attempts, try later", 429);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);

  const { email, password } = parsed.data;
  if (await db.user.findUnique({ where: { email } })) return jsonError("An account with this email already exists", 409);
  const user = await db.user.create({ data: { email, passwordHash: await bcrypt.hash(password, 12) } });
  await startSession(user.id);
  return jsonOk({ id: user.id }, 201);
}
