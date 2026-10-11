// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";
import { buildSelector } from "@/lib/selector";

function setup(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

describe("buildSelector", () => {
  test("uses a unique id when available", () => {
    const doc = setup('<div id="price"><span>1</span></div>');
    expect(buildSelector(doc.querySelector("#price")!)).toBe("#price");
  });

  test("anchors to the nearest id ancestor with nth-of-type for siblings", () => {
    const doc = setup('<ul><li>x</li><li>y</li></ul><ul id="list"><li>a</li><li>b</li><li>c</li></ul>');
    const sel = buildSelector(doc.querySelectorAll("#list li")[1]);
    expect(sel).toBe("#list > li:nth-of-type(2)");
    expect(doc.querySelector(sel)?.textContent).toBe("b");
  });

  test("uses stable classes and skips generated ones", () => {
    const doc = setup('<main><p class="lead css-1x2y3z">hi</p><p class="note">yo</p></main>');
    const sel = buildSelector(doc.querySelector(".lead")!);
    expect(sel).not.toContain("css-");
    expect(doc.querySelectorAll(sel)).toHaveLength(1);
    expect(doc.querySelector(sel)?.textContent).toBe("hi");
  });
});
