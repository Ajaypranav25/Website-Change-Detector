import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { TextDiff } from "@/components/TextDiff";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { diffStats } from "@/lib/detect";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

type Search = { a?: string; b?: string; view?: string };

export default async function ComparePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const monitor = await db.monitor.findFirst({
    where: { id, userId: user.id },
    include: { snapshots: { orderBy: { createdAt: "desc" }, take: 200, include: { capture: { select: { screenshotPath: true } } } } },
  });
  if (!monitor) notFound();

  const versions = monitor.snapshots;
  const after = versions.find((s) => s.id === query.b) ?? versions[0];
  const before = versions.find((s) => s.id === query.a) ?? versions[versions.indexOf(after) + 1] ?? after;
  const view = query.view === "split" ? "split" : "unified";

  if (!after) {
    return (
      <AppShell>
        <div className="empty-state">No versions captured yet.</div>
      </AppShell>
    );
  }

  const stats = diffStats(before.text, after.text);
  const href = (patch: Partial<Search>) => {
    const p = new URLSearchParams({ a: before.id, b: after.id, view, ...patch });
    return `/monitors/${monitor.id}/compare?${p.toString()}`;
  };
  const hasShots = Boolean(before.capture.screenshotPath && after.capture.screenshotPath);

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <p className="eyebrow">
            <Link href={`/monitors/${monitor.id}`}>{monitor.name}</Link> / Compare
          </p>
          <h1 className="page-title">Compare versions</h1>
          <p className="sub">
            <span className="plus">+{stats.addedLines}</span> <span className="minus">−{stats.removedLines}</span> lines ·{" "}
            {(stats.ratio * 100).toFixed(1)}% of text changed
          </p>
        </div>
        <form className="row" action={`/monitors/${monitor.id}/compare`}>
          <input type="hidden" name="view" value={view} />
          <label className="field">
            <span>Older</span>
            <select className="select" name="a" defaultValue={before.id}>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>{formatDateTime(v.createdAt)}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Newer</span>
            <select className="select" name="b" defaultValue={after.id}>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>{formatDateTime(v.createdAt)}</option>
              ))}
            </select>
          </label>
          <button className="btn btn-ghost" type="submit" style={{ alignSelf: "flex-end" }}>Compare</button>
        </form>
      </div>

      <section className="stack" style={{ marginBottom: 32 }}>
        <div className="row spread">
          <h2 className="panel-title" style={{ margin: 0 }}>Text diff</h2>
          <div className="tabs">
            <Link href={href({ view: "unified" })} aria-current={view === "unified"}>Unified</Link>
            <Link href={href({ view: "split" })} aria-current={view === "split"}>Side by side</Link>
          </div>
        </div>
        <TextDiff before={before.text} after={after.text} view={view} />
      </section>

      <section className="stack">
        <h2 className="panel-title" style={{ margin: 0 }}>Screenshots</h2>
        {hasShots ? (
          <div className="shots">
            {/* eslint-disable @next/next/no-img-element */}
            <figure className="shot" style={{ margin: 0 }}>
              <header>Before · {formatDateTime(before.createdAt)}</header>
              <div className="shot-body"><img src={`/api/captures/${before.captureId}/screenshot`} alt="Older version screenshot" loading="lazy" /></div>
            </figure>
            <figure className="shot" style={{ margin: 0 }}>
              <header>Highlighted changes</header>
              <div className="shot-body"><img src={`/api/diff?a=${before.id}&b=${after.id}`} alt="Screenshot diff with changed pixels highlighted" loading="lazy" /></div>
            </figure>
            <figure className="shot" style={{ margin: 0 }}>
              <header>After · {formatDateTime(after.createdAt)}</header>
              <div className="shot-body"><img src={`/api/captures/${after.captureId}/screenshot`} alt="Newer version screenshot" loading="lazy" /></div>
            </figure>
          </div>
        ) : (
          <div className="empty-state">Screenshots are not available for one of these versions.</div>
        )}
      </section>
    </AppShell>
  );
}
