import { createHash } from "node:crypto";
import { lineDiff } from "./lineDiff";
import { stripVolatile } from "./noise";

export function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Minimum share of changed characters needed to count as a change: 0% at 100, 20% at 0. */
export function changeThreshold(sensitivity: number): number {
  const s = Math.min(100, Math.max(0, sensitivity));
  return ((100 - s) / 100) * 0.2;
}

export interface DiffStats {
  addedLines: number;
  removedLines: number;
  changedChars: number;
  ratio: number;
}

export function diffStats(prev: string, next: string): DiffStats {
  let addedLines = 0;
  let removedLines = 0;
  let changedChars = 0;
  for (const part of lineDiff(prev, next)) {
    if (part.added) {
      addedLines += part.count ?? 0;
      changedChars += part.value.length;
    } else if (part.removed) {
      removedLines += part.count ?? 0;
      changedChars += part.value.length;
    }
  }
  const base = Math.max(prev.length, next.length, 1);
  return { addedLines, removedLines, changedChars, ratio: Math.min(1, changedChars / base) };
}

export interface ChangeInput {
  prevText: string | null;
  nextText: string;
  sensitivity: number;
  volatile: readonly string[];
}

export type ChangeDecision =
  | { kind: "baseline"; hash: string; stats: DiffStats }
  | { kind: "unchanged"; hash: string }
  | { kind: "below-threshold"; hash: string; stats: DiffStats }
  | { kind: "changed"; hash: string; stats: DiffStats };

export function decideChange({ prevText, nextText, sensitivity, volatile }: ChangeInput): ChangeDecision {
  const next = stripVolatile(nextText, volatile);
  const hash = contentHash(next);
  if (prevText === null) {
    return { kind: "baseline", hash, stats: { addedLines: next.split("\n").length, removedLines: 0, changedChars: next.length, ratio: 1 } };
  }
  const prev = stripVolatile(prevText, volatile);
  if (contentHash(prev) === hash) return { kind: "unchanged", hash };
  const stats = diffStats(prev, next);
  if (stats.ratio < changeThreshold(sensitivity)) return { kind: "below-threshold", hash, stats };
  return { kind: "changed", hash, stats };
}
