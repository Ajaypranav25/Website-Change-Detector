import { describe, expect, test } from "vitest";
import { backoffMs, classifyPage } from "@/lib/blocked";

describe("classifyPage", () => {
  test("normal pages are OK", () => {
    expect(classifyPage({ httpStatus: 200, html: "<p>hello</p>", textLength: 5 })).toEqual({ outcome: "OK" });
  });
  test("CAPTCHA and Cloudflare challenges are BLOCKED, not changes", () => {
    expect(classifyPage({ httpStatus: 403, html: "<title>Just a moment...</title>", textLength: 20 }).outcome).toBe("BLOCKED");
    expect(classifyPage({ httpStatus: 200, html: '<div class="g-recaptcha"></div>', textLength: 40 }).outcome).toBe("BLOCKED");
  });
  test("a long article that merely mentions captcha is still OK", () => {
    expect(classifyPage({ httpStatus: 200, html: "what is a captcha?", textLength: 9000 }).outcome).toBe("OK");
  });
  test("429, 401 and 403 are blocked; 5xx and empty pages are errors", () => {
    expect(classifyPage({ httpStatus: 429, html: "", textLength: 0 }).outcome).toBe("BLOCKED");
    expect(classifyPage({ httpStatus: 401, html: "x", textLength: 1 }).outcome).toBe("BLOCKED");
    expect(classifyPage({ httpStatus: 403, html: "x", textLength: 1 }).outcome).toBe("BLOCKED");
    expect(classifyPage({ httpStatus: 503, html: "down", textLength: 4 }).outcome).toBe("ERROR");
    expect(classifyPage({ httpStatus: 200, html: "", textLength: 0 }).outcome).toBe("ERROR");
  });
});

describe("backoffMs", () => {
  test("grows exponentially, caps at 6h and honours Retry-After", () => {
    expect(backoffMs(1)).toBe(15 * 60_000);
    expect(backoffMs(2)).toBe(30 * 60_000);
    expect(backoffMs(20)).toBe(6 * 60 * 60_000);
    expect(backoffMs(1, 7200)).toBe(7_200_000);
  });
});
