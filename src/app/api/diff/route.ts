import { apiUser, jsonError } from "@/lib/auth";
import { db } from "@/lib/db";
import { diffScreenshots } from "@/lib/imageDiff";
import { loadFile, saveFile } from "@/lib/storage";

/** Highlighted screenshot diff between two snapshots of a monitor the user owns. */
export async function GET(request: Request) {
  const auth = await apiUser();
  if ("response" in auth) return auth.response;
  const params = new URL(request.url).searchParams;
  const a = params.get("a");
  const b = params.get("b");
  if (!a || !b) return jsonError("Both a and b snapshot ids are required", 400);

  const snapshots = await db.snapshot.findMany({
    where: { id: { in: [a, b] }, monitor: { userId: auth.userId } },
    include: { capture: true },
  });
  const before = snapshots.find((s) => s.id === a);
  const after = snapshots.find((s) => s.id === b);
  if (!before?.capture.screenshotPath || !after?.capture.screenshotPath) return jsonError("Screenshots not available", 404);

  const cacheName = `${before.captureId}_${after.captureId}.png`;
  let png = await loadFile("diffs", cacheName);
  if (!png) {
    const [imgA, imgB] = await Promise.all([loadFile("captures", before.capture.screenshotPath), loadFile("captures", after.capture.screenshotPath)]);
    if (!imgA || !imgB) return jsonError("Screenshot files missing", 404);
    png = diffScreenshots(imgA, imgB).png;
    await saveFile("diffs", cacheName, png);
  }
  return new Response(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": "private, max-age=31536000, immutable" },
  });
}
