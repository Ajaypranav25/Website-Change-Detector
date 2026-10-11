import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { RegionPicker } from "@/components/RegionPicker";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PickerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const monitor = await db.monitor.findFirst({ where: { id, userId: user.id }, include: { target: true } });
  if (!monitor) notFound();
  const capture = await db.capture.findFirst({
    where: { targetId: monitor.targetId, outcome: "OK", htmlPath: { not: null } },
    orderBy: { fetchedAt: "desc" },
  });

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <p className="eyebrow">
            <Link href={`/monitors/${monitor.id}`}>{monitor.name}</Link> / Regions
          </p>
          <h1 className="page-title">Visual region picker</h1>
          <p className="sub">This is the last capture with scripts removed. Selections are saved as CSS selectors.</p>
        </div>
      </div>
      {capture ? (
        <RegionPicker monitorId={monitor.id} captureId={capture.id} initialWatch={monitor.watchSelectors} initialIgnore={monitor.ignoreSelectors} />
      ) : (
        <div className="empty-state">No successful capture yet. Run a check first, then come back to pick regions.</div>
      )}
    </AppShell>
  );
}
