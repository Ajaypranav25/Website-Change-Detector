import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { AD_SELECTORS, BANNER_SELECTORS, type NoiseRules } from "./noise";

const BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "br", "dd", "div", "dl", "dt", "fieldset", "figcaption",
  "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav",
  "ol", "p", "pre", "section", "table", "tbody", "td", "th", "thead", "tr", "ul",
]);

const ALWAYS_REMOVED = "script, style, noscript, template, svg, iframe, link, meta, [hidden], [aria-hidden='true']";

export interface ExtractOptions {
  watchSelectors: readonly string[];
  ignoreSelectors: readonly string[];
  rules: NoiseRules;
}

function safeRemove($: cheerio.CheerioAPI, selector: string): void {
  try {
    $(selector).remove();
  } catch {
    // Invalid user selector: ignored here, validated when saved.
  }
}

function collectText(node: AnyNode, out: string[]): void {
  if (node.type === "text") {
    out.push((node as unknown as { data: string }).data);
    return;
  }
  if (node.type !== "tag") return;
  const el = node as Element;
  const isBlock = BLOCK_TAGS.has(el.name);
  if (isBlock) out.push("\n");
  for (const child of el.children) collectText(child, out);
  if (isBlock) out.push("\n");
}

/** Converts a rendered page to readable text, honouring watch and ignore regions. */
export function extractText(html: string, opts: ExtractOptions): string {
  const $ = cheerio.load(html);
  $(ALWAYS_REMOVED).remove();
  if (opts.rules.ads) AD_SELECTORS.forEach((s) => safeRemove($, s));
  if (opts.rules.banners) BANNER_SELECTORS.forEach((s) => safeRemove($, s));
  opts.ignoreSelectors.forEach((s) => safeRemove($, s));

  let roots: AnyNode[] = $("body").toArray();
  if (roots.length === 0) roots = $.root().toArray();
  if (opts.watchSelectors.length > 0) {
    roots = opts.watchSelectors.flatMap((s) => {
      try {
        return $(s).toArray();
      } catch {
        return [];
      }
    });
  }

  const parts: string[] = [];
  for (const root of roots) {
    collectText(root, parts);
    parts.push("\n");
  }
  return parts
    .join("")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** Basic syntax check for user-supplied CSS selectors. */
export function isValidSelector(selector: string): boolean {
  if (!selector.trim() || selector.length > 300) return false;
  try {
    cheerio.load("<div></div>")(selector);
    return true;
  } catch {
    return false;
  }
}

/** Strips scripts, handlers and refreshes so a capture can be shown inert in the visual picker. */
export function sanitizeForPicker(html: string, baseUrl: string): string {
  const $ = cheerio.load(html);
  $("script, noscript, iframe, object, embed, meta[http-equiv], base").remove();
  $("*").each((_, el) => {
    for (const name of Object.keys((el as Element).attribs ?? {})) {
      if (/^on/i.test(name)) $(el).removeAttr(name);
    }
  });
  $("a[href^='javascript:'], [src^='javascript:']").removeAttr("href").removeAttr("src");
  $("head").prepend(
    `<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'">`,
    `<base href="${encodeURI(baseUrl)}">`,
  );
  return $.html();
}
