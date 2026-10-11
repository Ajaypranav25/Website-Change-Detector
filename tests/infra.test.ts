import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { config } from "@/lib/config";
import { diffScreenshots } from "@/lib/imageDiff";
import { signSession, verifySession } from "@/lib/session";
import { dataPath, loadFile, saveFile } from "@/lib/storage";

function solidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = rgb[0];
    png.data[i + 1] = rgb[1];
    png.data[i + 2] = rgb[2];
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

describe("session tokens", () => {
  beforeAll(() => vi.stubEnv("AUTH_SECRET", "x".repeat(40)));
  afterAll(() => vi.unstubAllEnvs());

  test("round-trips the user id", async () => {
    expect(await verifySession(await signSession("user-1"))).toBe("user-1");
  });
  test("rejects missing, garbage and foreign-key tokens", async () => {
    expect(await verifySession(undefined)).toBeNull();
    expect(await verifySession("not.a.jwt")).toBeNull();
    const token = await signSession("user-1");
    vi.stubEnv("AUTH_SECRET", "y".repeat(40));
    expect(await verifySession(token)).toBeNull();
  });
  test("refuses short secrets", async () => {
    vi.stubEnv("AUTH_SECRET", "short");
    await expect(signSession("u")).rejects.toThrow(/AUTH_SECRET/);
  });
});

describe("config", () => {
  afterEach(() => vi.unstubAllEnvs());
  test("required values throw with a helpful message", () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(() => config.databaseUrl).toThrow(/DATABASE_URL/);
    vi.stubEnv("AUTH_SECRET", "short");
    expect(() => config.authSecret).toThrow(/32 characters/);
  });
  test("optional values have defaults", () => {
    vi.stubEnv("APP_URL", "https://app.example.com/");
    vi.stubEnv("SMTP_URL", "");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    vi.stubEnv("SMTP_FROM", "");
    vi.stubEnv("AUTH_SECRET", "z".repeat(32));
    vi.stubEnv("DATABASE_URL", "postgres://x");
    expect(config.appUrl).toBe("https://app.example.com");
    expect(config.smtpUrl).toBeNull();
    expect(config.telegramBotToken).toBeNull();
    expect(config.smtpFrom).toContain("Driftwatch");
    expect(config.authSecret).toHaveLength(32);
    expect(config.databaseUrl).toBe("postgres://x");
    expect(config.redisUrl).toMatch(/^redis:/);
  });
});

describe("storage", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "dw-"));
    vi.stubEnv("DATA_DIR", dir);
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await rm(dir, { recursive: true, force: true });
  });

  test("saves and loads files inside DATA_DIR", async () => {
    await saveFile("captures", "abc.html", "<p>hi</p>");
    expect((await loadFile("captures", "abc.html"))?.toString()).toBe("<p>hi</p>");
    expect(await loadFile("captures", "missing.html")).toBeNull();
  });
  test("refuses path traversal", () => {
    expect(() => dataPath("captures", "../secret")).toThrow();
    expect(() => dataPath("captures", "a/b.png")).toThrow();
  });
});

describe("diffScreenshots", () => {
  test("identical images have no changed pixels", () => {
    const img = solidPng(10, 10, [255, 255, 255]);
    expect(diffScreenshots(img, img).changedPixels).toBe(0);
  });
  test("different and differently sized images are padded and compared", () => {
    const result = diffScreenshots(solidPng(10, 10, [255, 255, 255]), solidPng(10, 20, [0, 0, 0]));
    expect(result.changedPixels).toBeGreaterThan(0);
    expect(PNG.sync.read(result.png).height).toBe(20);
    expect(result.ratio).toBeGreaterThan(0.4);
  });
});
