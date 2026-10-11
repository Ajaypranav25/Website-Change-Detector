import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const sendMail = vi.fn();
vi.mock("nodemailer", () => ({ default: { createTransport: vi.fn(() => ({ sendMail })) } }));

const redisStore = new Map<string, number>();
vi.mock("@/lib/queue", () => ({
  redisReady: () => true,
  redisConnection: () => ({
    incr: async (k: string) => {
      const n = (redisStore.get(k) ?? 0) + 1;
      redisStore.set(k, n);
      return n;
    },
    expire: async () => 1,
  }),
}));

const { sendDiscord, sendEmail, sendTelegram, plainTextFor } = await import("@/lib/alerts/send");
const { clientIp, rateLimit } = await import("@/lib/rateLimit");
const { apiRequest } = await import("@/lib/api");

const msg = { subject: "Change detected: A", summary: "A changed", excerpt: ["+ x"], compareUrl: "http://app/c" };

describe("alert senders", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test("email is skipped without SMTP and sent with it", async () => {
    vi.stubEnv("SMTP_URL", "");
    expect(await sendEmail("a@b.c", "s", "t")).toMatchObject({ ok: false, skipped: true });
    vi.stubEnv("SMTP_URL", "smtp://localhost:2525");
    expect(await sendEmail("a@b.c", "s", "t")).toEqual({ ok: true });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "a@b.c", subject: "s" }));
  });

  test("discord posts an embed with the diff link", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    expect(await sendDiscord("https://discord.com/api/webhooks/1/x", msg, "https://site")).toEqual({ ok: true });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.embeds[0].url).toBe("http://app/c");
  });

  test("4xx is a permanent failure, 5xx throws so the queue retries", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await sendDiscord("https://discord.com/api/webhooks/1/x", msg, "u")).toMatchObject({ ok: false, skipped: false });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(sendDiscord("https://discord.com/api/webhooks/1/x", msg, "u")).rejects.toThrow(/503/);
  });

  test("telegram needs a bot token", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    expect(await sendTelegram("1", "hi")).toMatchObject({ skipped: true });
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "abc");
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    expect(await sendTelegram("1", "hi")).toEqual({ ok: true });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.telegram.org/botabc/sendMessage");
  });

  test("plain text includes the link", () => {
    expect(plainTextFor(msg, "https://site")).toContain("See the diff: http://app/c");
  });
});

describe("rateLimit", () => {
  test("allows up to max calls per window", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit("t", 3, 60));
    expect(results).toEqual([true, true, true, false]);
  });
  test("clientIp ignores forwarded headers unless TRUST_PROXY is set, then uses the proxy-appended hop", () => {
    const headers = new Headers({ "x-forwarded-for": "spoofed, 5.6.7.8" });
    expect(clientIp(headers)).toBe("direct");
    vi.stubEnv("TRUST_PROXY", "1");
    expect(clientIp(headers)).toBe("5.6.7.8");
    expect(clientIp(new Headers())).toBe("direct");
    vi.unstubAllEnvs();
  });
});

describe("apiRequest", () => {
  afterEach(() => vi.unstubAllGlobals());
  test("unwraps the envelope and surfaces errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ success: true, data: { id: 1 }, error: null })));
    expect(await apiRequest("/x")).toEqual({ id: 1 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ success: false, data: null, error: "Nope" }, { status: 400 })));
    await expect(apiRequest("/x")).rejects.toThrow("Nope");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new TypeError("offline")));
    await expect(apiRequest("/x")).rejects.toThrow(/Network error/);
  });
});
