import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { db } from "./db";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, verifySession } from "./session";

export async function currentUserId(): Promise<string | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/** For server components: redirect to /login when signed out. */
export async function requireUser() {
  const userId = await currentUserId();
  const user = userId ? await db.user.findUnique({ where: { id: userId } }) : null;
  if (!user) redirect("/login");
  return user;
}

export async function startSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, data: null, error: message }, { status });
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data, error: null }, { status });
}

/** For route handlers: returns the user id or a 401 response. */
export async function apiUser(): Promise<{ userId: string } | { response: NextResponse }> {
  const userId = await currentUserId();
  return userId ? { userId } : { response: jsonError("Not signed in", 401) };
}
