export type PageOutcome = "OK" | "ERROR" | "BLOCKED";

const CHALLENGE_MARKERS = [
  /\bcaptcha\b/i,
  /g-recaptcha|hcaptcha|cf-turnstile/i,
  /cf-chl-|challenge-platform|__cf_chl/i,
  /just a moment\.\.\./i,
  /checking (?:your|if the site connection is) (?:browser|secure)/i,
  /verify (?:you are|you're) (?:a )?human/i,
  /access denied|request blocked|unusual traffic/i,
  /enable javascript and cookies to continue/i,
];

export interface ClassifyInput {
  httpStatus: number | null;
  html: string;
  textLength: number;
}

/**
 * Outages and bot walls are status, never content changes: they never create
 * a snapshot, so they cannot produce a change alert.
 */
export function classifyPage({ httpStatus, html, textLength }: ClassifyInput): { outcome: PageOutcome; reason?: string } {
  const head = html.slice(0, 200_000);
  const challenge = CHALLENGE_MARKERS.find((re) => re.test(head));
  if (httpStatus === 429) return { outcome: "BLOCKED", reason: "Rate limited by site (429)" };
  if (challenge && (textLength < 3000 || (httpStatus !== null && httpStatus >= 400))) {
    return { outcome: "BLOCKED", reason: "CAPTCHA or bot challenge detected" };
  }
  if (httpStatus === 401 || httpStatus === 403) return { outcome: "BLOCKED", reason: `Access denied (${httpStatus})` };
  if (httpStatus !== null && httpStatus >= 400) return { outcome: "ERROR", reason: `HTTP ${httpStatus}` };
  if (textLength === 0) return { outcome: "ERROR", reason: "Page rendered empty" };
  return { outcome: "OK" };
}

/** Exponential backoff for a target after repeated failures or rate limiting, capped at 6 h. */
export function backoffMs(failureStreak: number, retryAfterSeconds?: number | null): number {
  const exp = Math.min(6 * 60, 15 * 2 ** Math.max(0, failureStreak - 1)) * 60_000;
  const retryAfter = retryAfterSeconds ? retryAfterSeconds * 1000 : 0;
  return Math.max(exp, retryAfter);
}
