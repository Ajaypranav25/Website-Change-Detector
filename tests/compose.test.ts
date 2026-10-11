import { describe, expect, test } from "vitest";
import { composeChangeMessage, dedupeKey, renderDigest, renderPlainText } from "@/lib/alerts/compose";
import { createMonitorSchema, formatInterval, settingsSchema, updateMonitorSchema } from "@/lib/monitorInput";

describe("composeChangeMessage", () => {
  test("summarises added and removed lines with an excerpt and link", () => {
    const msg = composeChangeMessage({
      monitorName: "Pricing",
      url: "https://a.com",
      prevText: "a\nb",
      nextText: "a\nc\nd",
      compareUrl: "http://app/c",
    });
    expect(msg.summary).toBe("Pricing changed: 2 lines added, 1 removed.");
    expect(msg.excerpt).toEqual(["- b", "+ c", "+ d"]);
    expect(renderPlainText(msg, "https://a.com")).toContain("See the diff: http://app/c");
  });
  test("clips long lines and limits excerpt length", () => {
    const next = Array.from({ length: 10 }, () => "x".repeat(300)).join("\n");
    const msg = composeChangeMessage({ monitorName: "M", url: "u", prevText: "", nextText: next, compareUrl: "c" });
    expect(msg.excerpt).toHaveLength(6);
    expect(msg.excerpt[0].length).toBeLessThanOrEqual(142);
    expect(msg.summary).toContain("10 lines added, 0 removed");
  });
});

describe("digest and dedupe", () => {
  test("renders digest lists and empty state", () => {
    expect(renderDigest([])).toMatch(/No changes/);
    expect(renderDigest([{ name: "A", summary: "A changed", compareUrl: "x" }])).toContain("1 change in the last 24 hours");
  });
  test("dedupe key is per monitor, content, channel and UTC day", () => {
    const morning = new Date("2026-10-11T01:00:00Z");
    const evening = new Date("2026-10-11T23:00:00Z");
    const nextDay = new Date("2026-10-12T01:00:00Z");
    expect(dedupeKey("m", "h", "email", morning)).toBe(dedupeKey("m", "h", "email", evening));
    expect(dedupeKey("m", "h", "email", morning)).not.toBe(dedupeKey("m", "h", "email", nextDay));
    expect(dedupeKey("m", "h", "email", morning)).not.toBe(dedupeKey("m", "h", "discord", morning));
  });
});

describe("input schemas", () => {
  test("interval must be between 15 min and 24 h", () => {
    expect(createMonitorSchema.safeParse({ url: "a.com", name: "A", intervalMinutes: 10 }).success).toBe(false);
    expect(createMonitorSchema.safeParse({ url: "a.com", name: "A", intervalMinutes: 1441 }).success).toBe(false);
    expect(createMonitorSchema.parse({ url: "a.com", name: "A", intervalMinutes: "60" })).toMatchObject({
      intervalMinutes: 60,
      sensitivity: 50,
    });
  });
  test("selectors are deduped and validated", () => {
    expect(updateMonitorSchema.parse({ watchSelectors: ["#a", "#a", ""] }).watchSelectors).toEqual(["#a"]);
    expect(updateMonitorSchema.safeParse({ ignoreSelectors: ["[[x"] }).success).toBe(false);
  });
  test("settings accept only discord webhooks and numeric chat ids", () => {
    const ok = {
      emailAlerts: true,
      dailyDigest: false,
      discordWebhook: "https://discord.com/api/webhooks/123/abc-DEF",
      telegramChatId: "-100123",
    };
    expect(settingsSchema.safeParse(ok).success).toBe(true);
    expect(settingsSchema.safeParse({ ...ok, discordWebhook: "http://169.254.169.254/" }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...ok, telegramChatId: "abc" }).success).toBe(false);
  });
  test("formatInterval", () => {
    expect(formatInterval(15)).toBe("15 min");
    expect(formatInterval(180)).toBe("3 h");
    expect(formatInterval(1440)).toBe("24 h");
    expect(formatInterval(90)).toBe("1.5 h");
  });
});
