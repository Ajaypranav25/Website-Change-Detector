import bcrypt from "bcryptjs";
import { z } from "zod";
import { jsonError, jsonOk, startSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rateLimit";

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

// Compared against when the email is unknown so response timing does not reveal accounts.
const DUMMY_HASH = bcrypt.hashSync("timing-equaliser", 12);

export async function POST(request: Request) {
  if (!(await rateLimit(`login:${clientIp(request.headers)}`, 20, 900))) return jsonError("Too many attempts, try later", 429);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Enter a valid email and password", 400);

  if (!(await rateLimit(`login-account:${parsed.data.email}`, 10, 900))) return jsonError("Too many attempts, try later", 429);
  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  const valid = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) return jsonError("Incorrect email or password", 401);
  await startSession(user.id);
  return jsonOk({ id: user.id });
}
