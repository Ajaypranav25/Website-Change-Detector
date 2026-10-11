import { apiUser, jsonError, jsonOk } from "@/lib/auth";
import { db } from "@/lib/db";
import { sanitizeForPicker } from "@/lib/extract";
import { canViewCapture } from "@/lib/monitors";
import { loadFile } from "@/lib/storage";

/** Inert (script-free) copy of a captured page for the visual region picker. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!(await canViewCapture(auth.userId, id))) return jsonError("Not found", 404);
  const capture = await db.capture.findUnique({ where: { id }, include: { target: true } });
  const html = capture?.htmlPath ? await loadFile("captures", capture.htmlPath) : null;
  if (!capture || !html) return jsonError("Page capture not available", 404);
  return jsonOk({ html: sanitizeForPicker(html.toString("utf8"), capture.target.url) });
}
