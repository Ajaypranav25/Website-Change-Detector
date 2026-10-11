import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { StatusPill } from "@/components/StatusPill";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { formatInterval } from "@/lib/intervals";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const monitors = await db.monitor.findMany({
    where: { userId: user.id },
    include: { target: true, _count: { select: { snapshots: true } } },
    orderBy: [{ lastChangedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
  });

  const counts = {
    ok: monitors.filter((m) => m.status === "OK" && !m.paused).length,
    failing: monitors.filter((m) => (m.status === "ERROR" || m.status === "BLOCKED") && !m.paused).length,
    changedToday: monitors.filter((m) => m.lastChangedAt && Date.now() - m.lastChangedAt.getTime() < 86_400_000).length,
  };

  return (
    <AppShell current="/dashboard">
      <div className="page-head">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1 className="page-title">Watched pages</h1>
        </div>
        <Link className="btn btn-primary" href="/monitors/new">
          + New Monitor
        </Link>
      </div>

      <div className="stats">
        <div className="stat"><div className="num">{monitors.length}</div><div className="lbl">Monitors</div></div>
        <div className="stat"><div className="num" style={{ color: "var(--ok)" }}>{counts.ok}</div><div className="lbl">Healthy</div></div>
        <div className="stat"><div className="num" style={{ color: counts.failing ? "var(--err)" : undefined }}>{counts.failing}</div><div className="lbl">Error / Blocked</div></div>
        <div className="stat"><div className="num" style={{ color: "var(--amber)" }}>{counts.changedToday}</div><div className="lbl">Changed · 24 h</div></div>
      </div>

      {monitors.length === 0 ? (
        <div className="empty-state">
          <p>No pages watched yet.</p>
          <Link className="btn btn-primary" href="/monitors/new">Watch your first page</Link>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Page</th>
                <th>Status</th>
                <th>Last checked</th>
                <th>Last changed</th>
                <th>Interval</th>
                <th>Versions</th>
              </tr>
            </thead>
            <tbody>
              {monitors.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="cell-name">
                      <Link href={`/monitors/${m.id}`}>{m.name}</Link>
                      <span className="cell-url" title={m.target.url}>{m.target.url}</span>
                    </div>
                  </td>
                  <td><StatusPill status={m.status} paused={m.paused} title={m.statusDetail} /></td>
                  <td className="dim">{timeAgo(m.lastCheckedAt)}</td>
                  <td>{m.lastChangedAt ? timeAgo(m.lastChangedAt) : <span className="dim">no changes yet</span>}</td>
                  <td className="dim">{formatInterval(m.intervalMinutes)}</td>
                  <td className="dim">{m._count.snapshots}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
