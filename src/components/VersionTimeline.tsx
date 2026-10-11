"use client";

import Link from "next/link";
import { useState } from "react";

export interface TimelineItem {
  id: string;
  label: string;
  ago: string;
  added: number;
  removed: number;
  isBaseline: boolean;
  previousId: string | null;
}

export function VersionTimeline({ monitorId, items }: { monitorId: string; items: TimelineItem[] }) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur.slice(-1), id]));

  // Older version first, whatever order they were ticked in
  const ordered = [...selected].sort((x, y) => items.findIndex((i) => i.id === y) - items.findIndex((i) => i.id === x));
  const compareHref = ordered.length === 2 ? `/monitors/${monitorId}/compare?a=${ordered[0]}&b=${ordered[1]}` : null;

  if (items.length === 0) return <p className="dim">No versions yet. The first check will create the baseline.</p>;

  return (
    <div className="stack">
      <div className="row spread">
        <p className="form-note">Tick any two versions to compare them side by side.</p>
        {compareHref ? (
          <Link className="btn btn-primary btn-sm" href={compareHref}>Compare selected</Link>
        ) : (
          <button className="btn btn-ghost btn-sm" disabled>Compare selected</button>
        )}
      </div>
      <ol className="timeline">
        {items.map((item) => (
          <li key={item.id} className={item.isBaseline ? "is-baseline" : undefined}>
            <div className="row spread" style={{ gap: 8 }}>
              <label className="toggle">
                <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} />
                <span className="when" style={{ color: "var(--fg)" }}>{item.label}</span>
              </label>
              {item.previousId && (
                <Link className="dim" style={{ fontSize: 12, textDecoration: "underline" }} href={`/monitors/${monitorId}/compare?a=${item.previousId}&b=${item.id}`}>
                  view diff →
                </Link>
              )}
            </div>
            <div className="delta">
              {item.ago} ·{" "}
              {item.isBaseline ? (
                "baseline"
              ) : (
                <>
                  <span className="plus">+{item.added}</span> <span className="minus">−{item.removed}</span> lines
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
