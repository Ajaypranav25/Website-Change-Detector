import { type Browser, chromium } from "playwright";
import { classifyPage, type PageOutcome } from "@/lib/blocked";
import { WORKER } from "@/lib/config";
import { redisConnection } from "@/lib/queue";
import { BOT_USER_AGENT, isAllowedByRobots } from "@/lib/robots";
import { assertPublicUrl, isPrivateIp, UnsafeUrlError } from "@/lib/url";
import net from "node:net";

export interface RenderResult {
  outcome: PageOutcome;
  reason?: string;
  httpStatus: number | null;
  html: string;
  screenshot: Buffer | null;
  retryAfterSeconds: number | null;
}

const USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 ${BOT_USER_AGENT}`;
const ROBOTS_CACHE_SECONDS = 24 * 60 * 60;

let browserPromise: Promise<Browser> | null = null;

function browser(): Promise<Browser> {
  browserPromise ??= chromium
    .launch({ headless: true })
    .then((b) => {
      b.on("disconnected", () => {
        browserPromise = null;
      });
      return b;
    })
    .catch((err: unknown) => {
      // Never cache a failed launch: the next job should try again.
      browserPromise = null;
      throw err;
    });
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) await (await browserPromise).close();
}

async function robotsAllows(url: URL): Promise<boolean> {
  const cacheKey = `robots:${url.origin}`;
  const redis = redisConnection();
  let body = await redis.get(cacheKey);
  if (body === null) {
    try {
      const res = await fetch(`${url.origin}/robots.txt`, {
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(5_000),
        // Never follow redirects: a public host could bounce this server-side fetch to an internal address.
        redirect: "manual",
      });
      body = res.ok ? (await res.text()).slice(0, 500_000) : "";
    } catch {
      body = "";
    }
    await redis.set(cacheKey, body, "EX", ROBOTS_CACHE_SECONDS);
  }
  return isAllowedByRobots(body, url.toString());
}

/**
 * Every request host (subresources and iframes too) must resolve to a public
 * address. Lookups are cached for the duration of one render.
 */
function publicHostChecker(): (hostname: string) => Promise<boolean> {
  const cache = new Map<string, Promise<boolean>>();
  return (hostname) => {
    const host = hostname.replace(/^\[|\]$/g, "").replace(/\.+$/, "");
    if (net.isIP(host)) return Promise.resolve(!isPrivateIp(host));
    let verdict = cache.get(host);
    if (!verdict) {
      verdict = assertPublicUrl(`http://${host}/`).then(
        () => true,
        () => false,
      );
      cache.set(host, verdict);
    }
    return verdict;
  };
}

/** Renders a public page in headless Chromium and returns its HTML and a screenshot. */
export async function renderPage(rawUrl: string): Promise<RenderResult> {
  const empty = { httpStatus: null, html: "", screenshot: null, retryAfterSeconds: null };
  let url: URL;
  try {
    url = await assertPublicUrl(rawUrl);
  } catch (err) {
    if (err instanceof UnsafeUrlError) return { ...empty, outcome: "BLOCKED", reason: err.message };
    return { ...empty, outcome: "ERROR", reason: `DNS lookup failed: ${(err as Error).message}` };
  }
  if (!(await robotsAllows(url))) return { ...empty, outcome: "BLOCKED", reason: "Disallowed by robots.txt" };

  const context = await (await browser()).newContext({
    userAgent: USER_AGENT,
    viewport: WORKER.viewport,
    serviceWorkers: "block",
    acceptDownloads: false,
  });
  const isPublicHost = publicHostChecker();
  try {
    await context.route("**/*", async (route) => {
      const request = route.request();
      const reqUrl = new URL(request.url());
      if (reqUrl.protocol === "data:" || reqUrl.protocol === "blob:") return route.continue();
      if (reqUrl.protocol !== "http:" && reqUrl.protocol !== "https:") return route.abort();
      if (request.resourceType() === "media") return route.abort();
      return (await isPublicHost(reqUrl.hostname)) ? route.continue() : route.abort();
    });
    // WebSockets bypass context.route; the page never needs them for a snapshot.
    await context.routeWebSocket(/.*/, (ws) => ws.close());

    const page = await context.newPage();
    const response = await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: WORKER.navigationTimeoutMs });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);

    const httpStatus = response?.status() ?? null;
    const retryAfter = Number(response?.headers()["retry-after"]);
    const html = await page.content();
    const textLength = await page.evaluate(() => document.body?.innerText?.trim().length ?? 0);
    const verdict = classifyPage({ httpStatus, html, textLength });

    let screenshot: Buffer | null = null;
    if (verdict.outcome === "OK") {
      const fullHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      screenshot = await page.screenshot({
        type: "png",
        fullPage: true,
        clip: { x: 0, y: 0, width: WORKER.viewport.width, height: Math.min(Math.max(fullHeight, 1), WORKER.maxScreenshotHeight) },
        animations: "disabled",
      });
    }
    return {
      outcome: verdict.outcome,
      reason: verdict.reason,
      httpStatus,
      html,
      screenshot,
      retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : null,
    };
  } finally {
    await context.close();
  }
}
