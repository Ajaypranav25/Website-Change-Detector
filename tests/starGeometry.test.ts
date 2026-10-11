import { describe, expect, test } from "vitest";
import { armInfluence, armLength, shapeFor, sparkleArmPath } from "@/components/starGeometry";

function points(path: string): [number, number][] {
  return path
    .replace(/[MLZ]/g, " ")
    .trim()
    .split(/\s+/)
    .map((p) => p.split(",").map(Number) as [number, number]);
}

describe("sparkleArmPath", () => {
  test("an upward point reaches its tip straight above the centre", () => {
    const pts = points(sparkleArmPath(300, 100, -Math.PI / 2));
    const tip = pts.reduce((best, p) => (p[1] < best[1] ? p : best));
    expect(tip[0]).toBeCloseTo(0, 5);
    expect(tip[1]).toBeCloseTo(-300, 5);
  });

  test("sides are concave: halfway out the point is far narrower than half the base", () => {
    const pts = points(sparkleArmPath(400, 100, 0));
    const mid = pts.filter(([x]) => Math.abs(x - 200) < 5);
    const halfWidth = Math.max(...mid.map(([, y]) => Math.abs(y)));
    expect(halfWidth).toBeLessThan(25);
  });
});

describe("shapeFor", () => {
  test("wide screens get a wider star than narrow ones", () => {
    expect(shapeFor(1600, 900).horizontal).toBeGreaterThan(shapeFor(390, 800).horizontal);
    expect(armLength(shapeFor(1600, 900), "up")).toBe(385);
  });
});

describe("armInfluence", () => {
  const shape = shapeFor(1600, 900);
  test("the arm under the cursor takes almost all the influence", () => {
    const inf = armInfluence(shape.horizontal * 0.8, 0, shape);
    expect(inf.right).toBeGreaterThan(0.9);
    expect(inf.left).toBe(0);
    expect(inf.up).toBeLessThan(0.05);
  });
  test("influence fades far from the star", () => {
    expect(armInfluence(0, -shape.vertical * 5, shape).up).toBeLessThan(0.01);
  });
});
