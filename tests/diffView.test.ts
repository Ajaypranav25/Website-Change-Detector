import { describe, expect, test } from "vitest";
import { splitRows, unifiedRows } from "@/lib/diffView";
import { formatDateTime, timeAgo } from "@/lib/format";
import { safeNextPath } from "@/lib/api";

const before = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
const after = before.replace("line 10", "line ten");

describe("unifiedRows", () => {
  test("collapses unchanged runs into gaps around the change", () => {
    const rows = unifiedRows(before, after, 2);
    expect(rows[0]).toEqual({ kind: "gap", hidden: 8 });
    expect(rows).toContainEqual({ kind: "del", text: "line 10" });
    expect(rows).toContainEqual({ kind: "add", text: "line ten" });
    expect(rows.at(-1)).toEqual({ kind: "gap", hidden: 7 });
  });
});

describe("splitRows", () => {
  test("aligns removed and added lines on the same row", () => {
    const row = splitRows(before, after, 0).find((r) => r.left?.kind === "del");
    expect(row).toEqual({ left: { kind: "del", text: "line 10" }, right: { kind: "add", text: "line ten" } });
  });
  test("pads uneven blocks with empty cells", () => {
    const rows = splitRows("a\nb", "a\nx\ny\nb", 1);
    expect(rows.filter((r) => r.left === null && r.right?.kind === "add")).toHaveLength(2);
  });
});

describe("format helpers", () => {
  const now = new Date("2026-10-11T12:00:00Z");
  test("timeAgo", () => {
    expect(timeAgo(null)).toBe("never");
    expect(timeAgo(new Date("2026-10-11T11:59:50Z"), now)).toBe("just now");
    expect(timeAgo(new Date("2026-10-11T11:55:00Z"), now)).toBe("5 minutes ago");
    expect(timeAgo(new Date("2026-10-11T14:00:00Z"), now)).toBe("in 2 hours");
    expect(timeAgo(new Date("2026-10-10T12:00:00Z"), now)).toBe("yesterday");
  });
  test("formatDateTime includes the year", () => {
    expect(formatDateTime(now)).toContain("2026");
  });
});

describe("safeNextPath", () => {
  test("only allows same-site relative paths", () => {
    expect(safeNextPath("/monitors/new?url=x")).toBe("/monitors/new?url=x");
    expect(safeNextPath("//evil.com")).toBe("/dashboard");
    expect(safeNextPath("https://evil.com")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.com")).toBe("/dashboard");
    expect(safeNextPath(null)).toBe("/dashboard");
  });
});

describe("trailing-line handling", () => {
  test("a shared last line stays context", () => {
    expect(unifiedRows("Same\nGone", "Same", 3)).toEqual([
      { kind: "ctx", text: "Same" },
      { kind: "del", text: "Gone" },
    ]);
  });
});
