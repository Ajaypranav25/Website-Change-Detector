import { describe, expect, test } from "vitest";
import { extractText, isValidSelector, sanitizeForPicker } from "@/lib/extract";
import { DEFAULT_NOISE_RULES } from "@/lib/noise";

const html = `<html><head><style>.x{}</style></head><body>
  <header><h1>Shop</h1></header>
  <div class="carousel"><p>Slide 1</p></div>
  <ins class="adsbygoogle">AD</ins>
  <main id="price"><p>Price: <b>$10</b></p><p>In stock</p></main>
  <footer class="foot">© footer</footer>
  <script>var x = 1</script>
</body></html>`;

const base = { watchSelectors: [], ignoreSelectors: [], rules: DEFAULT_NOISE_RULES };

describe("extractText", () => {
  test("produces block-separated text without scripts, ads and carousels", () => {
    expect(extractText(html, base)).toBe("Shop\nPrice: $10\nIn stock\n© footer");
  });
  test("keeps ads and banners when those rules are off", () => {
    const out = extractText(html, { ...base, rules: { ...DEFAULT_NOISE_RULES, ads: false, banners: false } });
    expect(out).toContain("Slide 1");
    expect(out).toContain("AD");
  });
  test("watch selectors restrict to regions, ignore selectors remove them", () => {
    expect(extractText(html, { ...base, watchSelectors: ["#price"] })).toBe("Price: $10\nIn stock");
    expect(extractText(html, { ...base, ignoreSelectors: [".foot", "header"] })).toBe("Price: $10\nIn stock");
  });
  test("invalid selectors are ignored rather than crashing", () => {
    expect(extractText(html, { ...base, watchSelectors: ["[[bad"], ignoreSelectors: ["::nope("] })).toBe("");
  });
});

describe("isValidSelector", () => {
  test("accepts normal selectors and rejects broken ones", () => {
    expect(isValidSelector("main > p:nth-of-type(2)")).toBe(true);
    expect(isValidSelector("[[bad")).toBe(false);
    expect(isValidSelector("  ")).toBe(false);
  });
});

describe("sanitizeForPicker", () => {
  test("removes scripts and inline handlers and adds a base href", () => {
    const out = sanitizeForPicker(
      '<html><head></head><body><a href="javascript:alert(1)" onclick="x()">a</a><script>evil()</script><img src="/a.png" onerror="x()"></body></html>',
      "https://example.com/p",
    );
    expect(out).not.toMatch(/<script|onclick|onerror|javascript:/i);
    expect(out).toContain('<base href="https://example.com/p">');
    expect(out).toContain("script-src 'none'");
  });
});
