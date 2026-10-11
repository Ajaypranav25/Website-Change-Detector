/** Geometry for the four-pointed sparkle star, in units where 1000 = hero height. */

export type ArmId = "up" | "right" | "down" | "left";

/** Arm directions (screen coordinates, y down). */
export const ARMS: { id: ArmId; angle: number }[] = [
  { id: "up", angle: -Math.PI / 2 },
  { id: "right", angle: 0 },
  { id: "down", angle: Math.PI / 2 },
  { id: "left", angle: Math.PI },
];

export interface StarShape {
  /** Tip distance of the left/right points. */
  horizontal: number;
  /** Tip distance of the up/down points. */
  vertical: number;
  /** Half-width of each point where it leaves the centre. */
  baseWidth: number;
}

/** Star proportions for a hero of the given pixel size; narrow screens get a taller, slimmer star. */
export function shapeFor(width: number, height: number): StarShape {
  const aspect = width / Math.max(height, 1);
  if (aspect < 0.9) {
    return { horizontal: Math.min(aspect * 480, 540), vertical: 340, baseWidth: 90 };
  }
  return { horizontal: Math.min(aspect * 370, 720), vertical: 385, baseWidth: 130 };
}

export function armLength(shape: StarShape, id: ArmId): number {
  return id === "left" || id === "right" ? shape.horizontal : shape.vertical;
}

/**
 * Concave sparkle point: half-width falls off as (1 - t)^CONCAVITY, so the sides
 * curve inward and meet in a needle-sharp tip.
 */
const CONCAVITY = 2.4;

/** Closed SVG path for one point of the star, pointing along `angle` from the origin. */
export function sparkleArmPath(length: number, halfWidth: number, angle: number, steps = 48): string {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const toScreen = (along: number, across: number): string =>
    `${(along * cos - across * sin).toFixed(1)},${(along * sin + across * cos).toFixed(1)}`;
  const side: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    side.push([t * length, halfWidth * Math.pow(1 - t, CONCAVITY)]);
  }
  const outward = side.map(([a, w]) => toScreen(a, w));
  const back = [...side].reverse().map(([a, w]) => toScreen(a, -w));
  return `M${outward.join(" L")} L${back.slice(1).join(" L")} Z`;
}

/**
 * Influence of the cursor on each arm: the nearest arm by angle takes almost
 * all of it, fading with distance beyond the star's reach.
 * dx/dy are in star units relative to the centre (y down).
 */
export function armInfluence(dx: number, dy: number, shape: StarShape): Record<ArmId, number> {
  const qx = dx / shape.horizontal;
  const qy = dy / shape.vertical;
  const angle = Math.atan2(qy, qx);
  const reach = Math.hypot(qx, qy);
  const proximity = Math.exp(-Math.max(0, reach - 1.05) * 1.6) * Math.min(1, reach * 2.2);
  const weights = ARMS.map(({ angle: a }) => Math.pow(Math.max(0, Math.cos(angle - a)), 6));
  const total = weights.reduce((s, w) => s + w, 0) || 1;
  return Object.fromEntries(ARMS.map(({ id }, i) => [id, (weights[i] / total) * proximity])) as Record<ArmId, number>;
}
