import { lookup } from "node:dns/promises";
import net from "node:net";

const TRACKING_PARAMS = /^(utm_\w+|fbclid|gclid|mc_cid|mc_eid|ref|_hsenc|_hsmi)$/i;

export class UnsafeUrlError extends Error {}

/**
 * Canonical form used to share one fetch between every user watching the
 * same page: lowercase host, no fragment, no default port, no tracking
 * params, sorted query string.
 */
export function normalizeUrl(input: string): string {
  const raw = input.trim();
  const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http and https URLs can be monitored");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("URLs with credentials are not allowed (public pages only)");
  }
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  const kept = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMS.test(key))
    .sort(([a], [b]) => a.localeCompare(b));
  url.search = new URLSearchParams(kept).toString();
  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  return url.toString();
}

const BLOCKED_V4: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 3],
];

const BLOCKED_V6: [string, number][] = [
  ["::", 96], // unspecified, loopback and deprecated IPv4-compatible
  ["::ffff:0:0", 96], // IPv4-mapped
  ["64:ff9b::", 96], // NAT64
  ["64:ff9b:1::", 48], // local NAT64
  ["100::", 64], // discard
  ["2001::", 32], // Teredo
  ["2002::", 16], // 6to4 (can embed private IPv4)
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
];

// Separate lists: Node matches IPv4 addresses against IPv4-mapped IPv6 rules.
const blockedV4 = new net.BlockList();
const blockedV6 = new net.BlockList();
for (const [addr, prefix] of BLOCKED_V4) blockedV4.addSubnet(addr, prefix, "ipv4");
for (const [addr, prefix] of BLOCKED_V6) blockedV6.addSubnet(addr, prefix, "ipv6");

/** True for any address that is not plain public unicast. Unparseable input counts as private. */
export function isPrivateIp(raw: string): boolean {
  const ip = raw.replace(/^\[|\]$/g, "");
  if (net.isIPv4(ip)) return blockedV4.check(ip, "ipv4");
  if (net.isIPv6(ip)) return blockedV6.check(ip, "ipv6");
  return true;
}

const BLOCKED_HOSTNAMES = /^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i;

/** Rejects URLs that resolve to loopback, private or link-local addresses (SSRF guard). */
export async function assertPublicUrl(
  input: string,
  resolve: (host: string) => Promise<{ address: string }[]> = (host) => lookup(host, { all: true }),
): Promise<URL> {
  const url = new URL(input);
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.+$/, "");
  if (BLOCKED_HOSTNAMES.test(host)) throw new UnsafeUrlError("Local hostnames are not allowed");
  const addresses = net.isIP(host) ? [{ address: host }] : await resolve(host);
  if (addresses.length === 0) throw new UnsafeUrlError("Hostname did not resolve");
  if (addresses.some(({ address }) => isPrivateIp(address))) {
    throw new UnsafeUrlError("Private or internal network addresses are not allowed");
  }
  return url;
}
