import { describe, expect, test } from "vitest";
import { changeThreshold, contentHash, decideChange, diffStats } from "@/lib/detect";

describe("changeThreshold", () => {
  test("maps sensitivity to a change ratio and clamps", () => {
    expect(changeThreshold(100)).toBe(0);
    expect(changeThreshold(0)).toBeCloseTo(0.2);
    expect(changeThreshold(50)).toBeCloseTo(0.1);
    expect(changeThreshold(500)).toBe(0);
  });
});

describe("decideChange", () => {
  const prev = "Title\nPrice $10\nFooter";
  test("first capture is a baseline", () => {
    expect(decideChange({ prevText: null, nextText: prev, sensitivity: 50, volatile: [] }).kind).toBe("baseline");
  });
  test("identical content is unchanged", () => {
    const d = decideChange({ prevText: prev, nextText: prev, sensitivity: 100, volatile: [] });
    expect(d).toEqual({ kind: "unchanged", hash: contentHash(prev) });
  });
  test("a real change at high sensitivity is reported", () => {
    const d = decideChange({ prevText: prev, nextText: "Title\nPrice $12\nFooter", sensitivity: 100, volatile: [] });
    expect(d.kind).toBe("changed");
    if (d.kind === "changed") expect(d.stats).toMatchObject({ addedLines: 1, removedLines: 1 });
  });
  test("a small change below the sensitivity threshold is ignored", () => {
    const stable = "stable line\n".repeat(200);
    const d = decideChange({ prevText: `${stable}Price $10`, nextText: `${stable}Price $12`, sensitivity: 50, volatile: [] });
    expect(d.kind).toBe("below-threshold");
  });
  test("lines learned as volatile do not count as change", () => {
    const d = decideChange({ prevText: "A\nRandom: 1", nextText: "A\nRandom: 2", sensitivity: 100, volatile: ["Random: #"] });
    expect(d.kind).toBe("unchanged");
  });
});

describe("diffStats", () => {
  test("ratio is bounded to 1", () => {
    expect(diffStats("", "abc").ratio).toBe(1);
  });
});

describe("diffStats trailing-line handling", () => {
  test("an identical final line is not counted as changed", () => {
    const stats = diffStats("Same line\nOld tail", "Same line");
    expect(stats).toMatchObject({ addedLines: 0, removedLines: 1 });
  });
});
