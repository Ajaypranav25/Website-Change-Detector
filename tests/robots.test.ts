import { describe, expect, test } from "vitest";
import { isAllowedByRobots } from "@/lib/robots";

const generic = `
User-agent: *
Disallow: /private
Allow: /private/public
Disallow: /*.pdf$
`;

const withOwnGroup = `${generic}
User-agent: DriftwatchBot
User-agent: OtherBot
Disallow: /nobots
`;

describe("isAllowedByRobots", () => {
  test("uses our specific group when present", () => {
    expect(isAllowedByRobots(withOwnGroup, "https://a.com/nobots")).toBe(false);
    expect(isAllowedByRobots(withOwnGroup, "https://a.com/private")).toBe(true);
  });
  test("falls back to * group with longest match and wildcards", () => {
    expect(isAllowedByRobots(generic, "https://a.com/private/x")).toBe(false);
    expect(isAllowedByRobots(generic, "https://a.com/private/public/x")).toBe(true);
    expect(isAllowedByRobots(generic, "https://a.com/doc.pdf")).toBe(false);
    expect(isAllowedByRobots(generic, "https://a.com/doc.pdf?x")).toBe(true);
  });
  test("empty robots allows everything", () => {
    expect(isAllowedByRobots("", "https://a.com/x")).toBe(true);
  });
});
