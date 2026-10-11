import { lineDiff } from "./lineDiff";

export type DiffRow = { kind: "add" | "del" | "ctx"; text: string } | { kind: "gap"; hidden: number };

export interface SplitRow {
  left: { kind: "del" | "ctx"; text: string } | null;
  right: { kind: "add" | "ctx"; text: string } | null;
  gap?: number;
}

const CONTEXT_LINES = 3;

function toLines(value: string): string[] {
  const lines = value.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Unified diff rows with long unchanged runs collapsed to `gap` markers. */
export function unifiedRows(before: string, after: string, context = CONTEXT_LINES): DiffRow[] {
  const raw: DiffRow[] = [];
  for (const part of lineDiff(before, after)) {
    const kind = part.added ? "add" : part.removed ? "del" : "ctx";
    for (const text of toLines(part.value)) raw.push({ kind, text });
  }
  const keep = raw.map((row, i) => {
    if (row.kind !== "ctx") return true;
    for (let d = -context; d <= context; d++) {
      const near = raw[i + d];
      if (near && near.kind !== "ctx") return true;
    }
    return false;
  });
  const rows: DiffRow[] = [];
  let hidden = 0;
  raw.forEach((row, i) => {
    if (keep[i]) {
      if (hidden) rows.push({ kind: "gap", hidden });
      hidden = 0;
      rows.push(row);
    } else {
      hidden++;
    }
  });
  if (hidden) rows.push({ kind: "gap", hidden });
  return rows;
}

/** Side-by-side rows: removed lines on the left aligned with added lines on the right. */
export function splitRows(before: string, after: string, context = CONTEXT_LINES): SplitRow[] {
  const rows: SplitRow[] = [];
  const unified = unifiedRows(before, after, context);
  let dels: string[] = [];
  let adds: string[] = [];
  const flush = () => {
    const n = Math.max(dels.length, adds.length);
    for (let i = 0; i < n; i++) {
      rows.push({
        left: i < dels.length ? { kind: "del", text: dels[i] } : null,
        right: i < adds.length ? { kind: "add", text: adds[i] } : null,
      });
    }
    dels = [];
    adds = [];
  };
  for (const row of unified) {
    if (row.kind === "del") dels.push(row.text);
    else if (row.kind === "add") adds.push(row.text);
    else {
      flush();
      if (row.kind === "gap") rows.push({ left: null, right: null, gap: row.hidden });
      else rows.push({ left: { kind: "ctx", text: row.text }, right: { kind: "ctx", text: row.text } });
    }
  }
  flush();
  return rows;
}
