import { splitRows, unifiedRows } from "@/lib/diffView";

const SIGN = { add: "+", del: "−", ctx: " " } as const;

export function TextDiff({ before, after, view }: { before: string; after: string; view: "unified" | "split" }) {
  if (before === after) return <div className="empty-state">These two versions have identical filtered text.</div>;

  if (view === "unified") {
    return (
      <div className="diff" role="table" aria-label="Unified text diff">
        {unifiedRows(before, after).map((row, i) =>
          row.kind === "gap" ? (
            <div key={i} className="diff-gap">⋯ {row.hidden} unchanged line{row.hidden === 1 ? "" : "s"}</div>
          ) : (
            <div key={i} className={`diff-line ${row.kind}`}>
              <span aria-hidden="true">{SIGN[row.kind]}</span>
              <span>{row.text || " "}</span>
            </div>
          ),
        )}
      </div>
    );
  }

  const rows = splitRows(before, after);
  const column = (side: "left" | "right") =>
    rows.map((row, i) => {
      if (row.gap) return <div key={i} className="diff-gap">⋯ {row.gap}</div>;
      const cell = row[side];
      return cell ? (
        <div key={i} className={`diff-line ${cell.kind}`}>
          <span>{cell.text || " "}</span>
        </div>
      ) : (
        <div key={i} className="diff-line empty" />
      );
    });

  return (
    <div className="diff diff-split" aria-label="Side-by-side text diff">
      <div>{column("left")}</div>
      <div>{column("right")}</div>
    </div>
  );
}
