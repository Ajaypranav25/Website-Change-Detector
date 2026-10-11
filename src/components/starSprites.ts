import { ARMS, type ArmId, armLength, sparkleArmPath, type StarShape } from "./starGeometry";

/** Sprites are drawn in a 2000×2000 unit box centred on the star (1000 units = hero height). */
const VIEWBOX = "-1000 -1000 2000 2000";

interface ArmPalette {
  /** Colour at the centre of the star. */
  inner: string;
  mid: string;
  /** Colour at the tip of the point. */
  tip: string;
  halo: string;
}

/** Warm amber top, silver sides, indigo bottom, echoing the reference artwork. */
const PALETTES: Record<ArmId, ArmPalette> = {
  up: { inner: "#fff4dc", mid: "#ffb547", tip: "#ff6a1f", halo: "#ff8a2b" },
  right: { inner: "#ffffff", mid: "#e4e9ff", tip: "#a9b8ff", halo: "#c9d3ff" },
  down: { inner: "#f1e8ff", mid: "#8b5cff", tip: "#4527ff", halo: "#5b3bff" },
  left: { inner: "#ffffff", mid: "#e4e9ff", tip: "#a9b8ff", halo: "#c9d3ff" },
};

function armSvg(shape: StarShape, id: ArmId): string {
  const { angle } = ARMS.find((a) => a.id === id)!;
  const length = armLength(shape, id);
  const width = shape.baseWidth;
  const p = PALETTES[id];
  const tipX = (Math.cos(angle) * length).toFixed(1);
  const tipY = (Math.sin(angle) * length).toFixed(1);
  const body = sparkleArmPath(length, width, angle);
  const halo = sparkleArmPath(length * 1.08, width * 1.9, angle);
  const core = sparkleArmPath(length * 0.98, width * 0.2, angle);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX}" width="2000" height="2000">
    <defs>
      <linearGradient id="body" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${tipX}" y2="${tipY}">
        <stop offset="0" stop-color="${p.inner}"/>
        <stop offset="0.35" stop-color="${p.mid}"/>
        <stop offset="1" stop-color="${p.tip}" stop-opacity="0.85"/>
      </linearGradient>
      <linearGradient id="core" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${tipX}" y2="${tipY}">
        <stop offset="0" stop-color="#ffffff"/>
        <stop offset="0.7" stop-color="#ffffff" stop-opacity="0.75"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
      </linearGradient>
      <radialGradient id="bloom" cx="0" cy="0" r="260" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="${p.inner}" stop-opacity="0.32"/>
        <stop offset="0.45" stop-color="${p.halo}" stop-opacity="0.12"/>
        <stop offset="1" stop-color="${p.halo}" stop-opacity="0"/>
      </radialGradient>
      <filter id="haloBlur" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="46"/></filter>
      <filter id="bodyBlur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
      <filter id="coreBlur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.5"/></filter>
    </defs>
    <circle r="260" fill="url(#bloom)"/>
    <path d="${halo}" fill="${p.halo}" opacity="0.42" filter="url(#haloBlur)"/>
    <path d="${body}" fill="url(#body)" filter="url(#bodyBlur)"/>
    <path d="${core}" fill="url(#core)" filter="url(#coreBlur)"/>
  </svg>`;
}

export function armSvgs(shape: StarShape): Record<ArmId, string> {
  return Object.fromEntries(ARMS.map(({ id }) => [id, armSvg(shape, id)])) as Record<ArmId, string>;
}

/** Rasterises an SVG string into a square canvas of the given pixel size. */
export async function rasterize(markup: string, size: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    canvas.getContext("2d")?.drawImage(img, 0, 0, size, size);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}
