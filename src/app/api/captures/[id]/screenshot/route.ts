import { apiUser, jsonError } from "@/lib/auth";
import { db } from "@/lib/db";
import { canViewCapture } from "@/lib/monitors";
import { loadFile } from "@/lib/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!(await canViewCapture(auth.userId, id))) return jsonError("Not found", 404);
  const capture = await db.capture.findUnique({ where: { id }, select: { screenshotPath: true } });
  const png = capture?.screenshotPath ? await loadFile("captures", capture.screenshotPath) : null;
  if (!png) return jsonError("Screenshot not available", 404);
  return new Response(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": "private, max-age=31536000, immutable" },
  });
}
