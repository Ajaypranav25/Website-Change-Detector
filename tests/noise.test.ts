import { describe, expect, test } from "vitest";
import {
  DEFAULT_NOISE_RULES,
  learnVolatileLines,
  lineSignature,
  MAX_VOLATILE_LINES,
  mergeVolatile,
  normalizeText,
  parseNoiseRules,
  stripVolatile,
} from "@/lib/noise";

const all = DEFAULT_NOISE_RULES;
const none = { timestamps: false, counters: false, tokens: false, ads: false, banners: false };

describe("normalizeText", () => {
  test("masks timestamps in many formats", () => {
    const text = "Updated 2026-10-11T16:34:00Z\nPosted Oct 11, 2026 at 4:34 PM\n5 minutes ago\n11/10/2026\n3 Oct 2026";
    const out = normalizeText(text, all);
    expect(out).not.toMatch(/\d/);
    expect(out).toContain("⟨time⟩");
  });
  test("masks view and like counters but keeps prices", () => {
    expect(normalizeText("1,234 views · 56 likes\nPrice $19.99", all)).toBe("⟨n⟩ views · ⟨n⟩ likes\nPrice $19.99");
  });
  test("masks random tokens and uuids", () => {
    const out = normalizeText("csrf a8f3c9d2e1b04f6a9c7d nonce 123e4567-e89b-12d3-a456-426614174000", all);
    expect(out).toBe("csrf ⟨token⟩ nonce ⟨token⟩");
  });
  test("leaves text alone when rules are off but still collapses whitespace", () => {
    expect(normalizeText("  1,234 views  \n\n 2026-10-11 ", none)).toBe("1,234 views\n2026-10-11");
  });
  test("low sensitivity masks every number", () => {
    expect(normalizeText("Price $19.99", none, 10)).toBe("Price $⟨n⟩");
  });
});

describe("volatile line learning", () => {
  test("learns lines that differ between two immediate renders", () => {
    const learned = learnVolatileLines("Title\nQuote of the day: A\nFooter", "Title\nQuote of the day: B\nFooter");
    expect(learned).toEqual(["Quote of the day: A", "Quote of the day: B"]);
    expect(stripVolatile("Title\nQuote of the day: A\nFooter", learned)).toBe("Title\nFooter");
  });
  test("learns nothing when the renders differ wholesale (partial or broken render)", () => {
    const a = Array.from({ length: 10 }, (_, i) => `line ${String.fromCharCode(97 + i)}`).join("\n");
    expect(learnVolatileLines(a, "Loading…")).toEqual([]);
  });
  test("signatures mask digits so changing counters match", () => {
    expect(lineSignature("Visitors online: 42")).toBe(lineSignature("Visitors online: 97"));
  });
  test("merge dedupes and caps size", () => {
    const many = Array.from({ length: MAX_VOLATILE_LINES + 10 }, (_, i) => `l${"x".repeat(i)}`);
    expect(mergeVolatile(["a"], ["a", "b"])).toEqual(["a", "b"]);
    expect(mergeVolatile([], many)).toHaveLength(MAX_VOLATILE_LINES);
  });
  test("stripVolatile with no signatures is identity", () => {
    expect(stripVolatile("a\nb", [])).toBe("a\nb");
  });
});

describe("parseNoiseRules", () => {
  test("fills defaults and falls back on garbage", () => {
    expect(parseNoiseRules({ ads: false })).toEqual({ ...all, ads: false });
    expect(parseNoiseRules("nope")).toEqual(all);
    expect(parseNoiseRules(null)).toEqual(all);
  });
});
