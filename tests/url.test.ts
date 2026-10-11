import { describe, expect, test } from "vitest";
import { assertPublicUrl, isPrivateIp, normalizeUrl, UnsafeUrlError } from "@/lib/url";

describe("normalizeUrl", () => {
  test("adds https, lowercases host, drops hash, tracking params and trailing slash", () => {
    expect(normalizeUrl("Example.COM/Path/?utm_source=x&b=2&a=1#top")).toBe("https://example.com/Path?a=1&b=2");
  });
  test("treats equivalent URLs as the same target", () => {
    expect(normalizeUrl("https://example.com/?b=1&a=2")).toBe(normalizeUrl("https://EXAMPLE.com?a=2&b=1&fbclid=z"));
  });
  test("rejects credentials and non-http schemes", () => {
    expect(() => normalizeUrl("https://user:pw@example.com")).toThrow(UnsafeUrlError);
    expect(() => normalizeUrl("ftp://example.com")).toThrow(UnsafeUrlError);
  });
});

describe("isPrivateIp", () => {
  test.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1", "100.64.0.1"])(
    "%s is private",
    (ip) => expect(isPrivateIp(ip)).toBe(true),
  );
  test.each(["::ffff:7f00:1", "[::ffff:a9fe:a9fe]", "::7f00:1", "64:ff9b::a9fe:a9fe", "fe90::1", "2002:7f00:1::1", "not-an-ip"])(
    "%s (mapped, NAT64, 6to4, link-local or garbage) is blocked",
    (ip) => expect(isPrivateIp(ip)).toBe(true),
  );
  test.each(["93.184.216.34", "8.8.8.8", "2606:4700::1111"])("%s is public", (ip) => expect(isPrivateIp(ip)).toBe(false));
});

describe("assertPublicUrl", () => {
  test("blocks hosts resolving to private addresses", async () => {
    await expect(assertPublicUrl("https://evil.test", async () => [{ address: "127.0.0.1" }])).rejects.toThrow(UnsafeUrlError);
  });
  test("blocks localhost names and literal private IPs", async () => {
    await expect(assertPublicUrl("http://localhost:3000")).rejects.toThrow(UnsafeUrlError);
    await expect(assertPublicUrl("http://169.254.169.254/latest")).rejects.toThrow(UnsafeUrlError);
  });
  test("blocks bracketed mapped IPv6 and trailing-dot localhost", async () => {
    await expect(assertPublicUrl("http://[::ffff:127.0.0.1]/")).rejects.toThrow(UnsafeUrlError);
    await expect(assertPublicUrl("http://localhost./")).rejects.toThrow(UnsafeUrlError);
  });
  test("allows public hosts", async () => {
    const url = await assertPublicUrl("https://example.com/x", async () => [{ address: "93.184.216.34" }]);
    expect(url.hostname).toBe("example.com");
  });
  test("fails when a host does not resolve", async () => {
    await expect(assertPublicUrl("https://nothing.test", async () => [])).rejects.toThrow(UnsafeUrlError);
  });
});
