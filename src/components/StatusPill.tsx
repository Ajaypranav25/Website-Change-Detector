import type { MonitorStatus } from "@prisma/client";

const LABELS: Record<MonitorStatus, string> = { OK: "OK", ERROR: "Error", BLOCKED: "Blocked", PENDING: "Pending" };

export function StatusPill({ status, paused, title }: { status: MonitorStatus; paused?: boolean; title?: string | null }) {
  if (paused) return <span className="pill pill-paused">Paused</span>;
  return (
    <span className={`pill pill-${status.toLowerCase()}`} title={title ?? undefined}>
      {LABELS[status]}
    </span>
  );
}
