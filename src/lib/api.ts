/** Client-side helper for the `{ success, data, error }` API envelope. */
export async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new Error("Network error, check your connection and try again");
  }
  const body = (await res.json().catch(() => null)) as { success: boolean; data: T; error: string | null } | null;
  if (!res.ok || !body?.success) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body.data;
}

/** Only same-site relative paths are allowed as post-login destinations. */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
