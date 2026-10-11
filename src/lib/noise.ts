import { z } from "zod";

export const noiseRulesSchema = z.object({
  timestamps: z.boolean().default(true),
  counters: z.boolean().default(true),
  tokens: z.boolean().default(true),
  ads: z.boolean().default(true),
  banners: z.boolean().default(true),
});

export type NoiseRules = z.infer<typeof noiseRulesSchema>;

export const DEFAULT_NOISE_RULES: NoiseRules = noiseRulesSchema.parse({});

export function parseNoiseRules(value: unknown): NoiseRules {
  const parsed = noiseRulesSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : DEFAULT_NOISE_RULES;
}

/** DOM regions removed before text extraction when the matching rule is on. */
export const AD_SELECTORS = [
  "ins.adsbygoogle",
  "[id^='google_ads']",
  "[id*='-ad-']",
  "[class~='ad']",
  "[class~='ads']",
  "[class*='advert']",
  "[class*='sponsor']",
  "[data-ad]",
  "[data-ad-slot]",
  "iframe[src*='doubleclick']",
  "[id*='cookie-banner']",
  "[class*='cookie-consent']",
];

export const BANNER_SELECTORS = [
  "[aria-roledescription='carousel']",
  "[class*='carousel']",
  "[class*='slider']",
  "[class*='marquee']",
  "[class*='ticker']",
  ".swiper",
  ".slick-slider",
  "marquee",
];

const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

const TIMESTAMP_PATTERNS: RegExp[] = [
  /\b\d{4}-\d{2}-\d{2}(?:[t ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:z|[+-]\d{2}:?\d{2})?)?\b/gi,
  /\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b/g,
  new RegExp(`\\b(?:${MONTHS})\\.? \\d{1,2}(?:st|nd|rd|th)?,? \\d{4}\\b`, "gi"),
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)? (?:${MONTHS})\\.?,? \\d{4}\\b`, "gi"),
  /\b\d{1,2}:\d{2}(?::\d{2})?\s?(?:am|pm)?\b/gi,
  /\b(?:\d+|an?|one)\s+(?:sec(?:ond)?s?|min(?:ute)?s?|h(?:ou)?rs?|days?|weeks?|months?|years?)\s+ago\b/gi,
  /\b(?:just now|yesterday|today|moments ago)\b/gi,
];

const COUNTER_PATTERN =
  /\b\d[\d,.\s]*\s?[km]?\+?\s+(?=(?:views?|likes?|comments?|shares?|followers?|subscribers?|visitors?|online|reads?|watching|replies|reviews?|stars?|downloads?)\b)/gi;

const TOKEN_PATTERNS: RegExp[] = [
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
  /\b(?=[a-z0-9_-]*\d)(?=[a-z0-9_-]*[a-z])[a-z0-9_-]{24,}\b/gi,
  /\b[0-9a-f]{16,}\b/gi,
];

/** Masks text-level noise so harmless churn does not change the content hash. */
export function normalizeText(text: string, rules: NoiseRules, sensitivity = 50): string {
  let out = text;
  if (rules.tokens) for (const re of TOKEN_PATTERNS) out = out.replace(re, "⟨token⟩");
  if (rules.timestamps) for (const re of TIMESTAMP_PATTERNS) out = out.replace(re, "⟨time⟩");
  if (rules.counters) out = out.replace(COUNTER_PATTERN, "⟨n⟩ ");
  // Low sensitivity: every number is treated as noise.
  if (sensitivity < 25) out = out.replace(/\d[\d,.]*/g, "⟨n⟩");
  return out
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** Shape of a line with digits masked, used to recognise lines that churn on every load. */
export function lineSignature(line: string): string {
  return line.replace(/\d+/g, "#").slice(0, 160);
}

export function stripVolatile(text: string, volatile: readonly string[]): string {
  if (volatile.length === 0) return text;
  const set = new Set(volatile);
  return text
    .split("\n")
    .filter((line) => !set.has(lineSignature(line)))
    .join("\n");
}

/** Above this share of differing lines the second render is treated as broken, not as noise. */
const MAX_VOLATILE_SHARE = 0.3;

/** Lines present in only one of two back-to-back renders are noise for this page. */
export function learnVolatileLines(a: string, b: string): string[] {
  const linesA = new Set(a.split("\n"));
  const linesB = new Set(b.split("\n"));
  const differing = [...linesA].filter((l) => !linesB.has(l)).concat([...linesB].filter((l) => !linesA.has(l)));
  // A partial or failed render differs almost everywhere; learning from it would mute real changes.
  if (differing.length > Math.max(2, Math.max(linesA.size, linesB.size) * MAX_VOLATILE_SHARE)) return [];
  return [...new Set(differing.map(lineSignature))];
}

export const MAX_VOLATILE_LINES = 200;

export function mergeVolatile(existing: readonly string[], learned: readonly string[]): string[] {
  return [...new Set([...existing, ...learned])].slice(-MAX_VOLATILE_LINES);
}
