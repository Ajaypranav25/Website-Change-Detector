import { lineDiff } from "../lineDiff";

export interface ChangeSummaryInput {
  monitorName: string;
  url: string;
  prevText: string;
  nextText: string;
  compareUrl: string;
}

export interface ChangeMessage {
  subject: string;
  summary: string;
  excerpt: string[];
  compareUrl: string;
}

const MAX_EXCERPT_LINES = 6;
const MAX_LINE_LENGTH = 140;

function clip(line: string): string {
  return line.length > MAX_LINE_LENGTH ? `${line.slice(0, MAX_LINE_LENGTH - 1)}…` : line;
}

export function composeChangeMessage(input: ChangeSummaryInput): ChangeMessage {
  let added = 0;
  let removed = 0;
  const excerpt: string[] = [];
  for (const part of lineDiff(input.prevText, input.nextText)) {
    if (!part.added && !part.removed) continue;
    const lines = part.value.split("\n").filter(Boolean);
    if (part.added) added += lines.length;
    else removed += lines.length;
    for (const line of lines) {
      if (excerpt.length < MAX_EXCERPT_LINES) excerpt.push(`${part.added ? "+" : "-"} ${clip(line)}`);
    }
  }
  return {
    subject: `Change detected: ${input.monitorName}`,
    summary: `${input.monitorName} changed: ${added} line${added === 1 ? "" : "s"} added, ${removed} removed.`,
    excerpt,
    compareUrl: input.compareUrl,
  };
}

export function renderPlainText(msg: ChangeMessage, url: string): string {
  return [msg.summary, url, "", ...msg.excerpt, "", `See the diff: ${msg.compareUrl}`].join("\n");
}

export function renderDigest(items: { name: string; summary: string; compareUrl: string }[]): string {
  if (items.length === 0) return "No changes in the last 24 hours.";
  return [
    `${items.length} change${items.length === 1 ? "" : "s"} in the last 24 hours:`,
    "",
    ...items.map((i) => `• ${i.summary}\n  ${i.compareUrl}`),
  ].join("\n");
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The same content alerts at most once per channel per UTC day. A page that
 * flips between two states every load cannot spam, but a genuine
 * back-and-forth (in stock / out of stock) still alerts on later days.
 */
export function dedupeKey(monitorId: string, contentHash: string, channel: string, at: Date = new Date()): string {
  return `${monitorId}:${contentHash}:${channel}:${Math.floor(at.getTime() / DAY_MS)}`;
}
