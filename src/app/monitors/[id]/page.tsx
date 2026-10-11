import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { MonitorSettings } from "@/components/MonitorSettings";
import { StatusPill } from "@/components/StatusPill";
import { type TimelineItem, VersionTimeline } from "@/components/VersionTimeline";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime, timeAgo } from "@/lib/format";
import { formatInterval } from "@/lib/intervals";
import { parseNoiseRules } from "@/lib/noise";

export const dynamic = "force-dynamic";

const TIMELINE_LIMIT = 100;

export default async function MonitorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const monitor = await db.monitor.findFirst({
    where: { id, userId: user.id },
    include: {
      target: true,
      snapshots: { orderBy: { createdAt: "desc" }, take: TIMELINE_LIMIT, select: { id: true, createdAt: true, addedLines: true, removedLines: true, captureId: true } },
      alerts: { orderBy: { createdAt: "desc" }, take: 8 },
    },
  });
  if (!monitor) notFound();

  const lastCapture = await db.capture.findFirst({ where: { targetId: monitor.targetId }, orderBy: { fetchedAt: "desc" } });
  const latest = monitor.snapshots[0];
  const items: TimelineItem[] = monitor.snapshots.map((s, i) => ({
    id: s.id,
    label: formatDateTime(s.createdAt),
    ago: timeAgo(s.createdAt),
    added: s.addedLines,
    removed: s.removedLines,
    isBaseline: i === monitor.snapshots.length - 1 && monitor.snapshots.length < TIMELINE_LIMIT,
    previousId: monitor.snapshots[i + 1]?.id ?? null,
  }));

  return (
    <AppShell>
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <p className="eyebrow">
            <Link href="/dashboard">Dashboard</Link> / Monitor
          </p>
          <div className="row">
            <h1 className="page-title">{monitor.name}</h1>
            <StatusPill status={monitor.status} paused={monitor.paused} />
          </div>
          <p className="sub">
            <a href={monitor.target.url} target="_blank" rel="noopener noreferrer nofollow" style={{ textDecoration: "underline" }}>
              {monitor.target.url}
            </a>
          </p>
        </div>
        <Link className="btn btn-ghost" href={`/monitors/${monitor.id}/picker`}>
          ◎ Pick Regions
        </Link>
      </div>

      <div className="cols-2">
        <div className="stack">
          <section className="panel panel-pad">
            <h2 className="panel-title">Version timeline</h2>
            <VersionTimeline monitorId={monitor.id} items={items} />
          </section>
          {latest && lastCapture?.screenshotPath && (
            <section className="shot">
              <header>Latest render · {timeAgo(lastCapture.fetchedAt)}</header>
              <div className="shot-body" style={{ maxHeight: 480 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/captures/${lastCapture.id}/screenshot`} alt={`Latest screenshot of ${monitor.name}`} loading="lazy" />
              </div>
            </section>
          )}
        </div>

        <div className="stack">
          <section className="panel panel-pad">
            <h2 className="panel-title">Status</h2>
            <dl className="kv">
              <dt>Last checked</dt>
              <dd>{timeAgo(monitor.lastCheckedAt)}</dd>
              <dt>Last changed</dt>
              <dd>{monitor.lastChangedAt ? timeAgo(monitor.lastChangedAt) : "no changes yet"}</dd>
              <dt>Next check</dt>
              <dd>{monitor.paused ? "paused" : timeAgo(monitor.nextCheckAt)}</dd>
              <dt>Interval</dt>
              <dd>{formatInterval(monitor.intervalMinutes)}</dd>
              {monitor.statusDetail && (
                <>
                  <dt>Detail</dt>
                  <dd>{monitor.statusDetail}</dd>
                </>
              )}
              <dt>Regions</dt>
              <dd>
                {monitor.watchSelectors.length ? `${monitor.watchSelectors.length} watched` : "whole page"}
                {monitor.ignoreSelectors.length ? ` · ${monitor.ignoreSelectors.length} ignored` : ""}
              </dd>
              <dt>Learned noise</dt>
              <dd>{monitor.volatileLines.length} line pattern{monitor.volatileLines.length === 1 ? "" : "s"}</dd>
            </dl>
          </section>

          <section className="panel panel-pad">
            <h2 className="panel-title">Settings</h2>
            <MonitorSettings
              monitorId={monitor.id}
              name={monitor.name}
              intervalMinutes={monitor.intervalMinutes}
              sensitivity={monitor.sensitivity}
              noiseRules={parseNoiseRules(monitor.noiseRules)}
              paused={monitor.paused}
            />
          </section>

          <section className="panel panel-pad">
            <h2 className="panel-title">Recent alerts</h2>
            {monitor.alerts.length === 0 ? (
              <p className="dim">None yet. Configure channels in <Link href="/settings" style={{ textDecoration: "underline" }}>Alerts</Link>.</p>
            ) : (
              <dl className="kv">
                {monitor.alerts.map((a) => (
                  <div key={a.id} style={{ display: "contents" }}>
                    <dt>{timeAgo(a.createdAt)}</dt>
                    <dd>
                      {a.channel} · {a.status.toLowerCase().replace("_", " ")}
                      {a.detail && a.status !== "QUEUED_DIGEST" ? <span className="dim"> ({a.detail})</span> : null}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
