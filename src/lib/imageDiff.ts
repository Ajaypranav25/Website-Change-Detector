import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

/** Pads a PNG onto a white canvas of the given size so differently sized screenshots can be compared. */
function padTo(img: PNG, width: number, height: number): PNG {
  if (img.width === width && img.height === height) return img;
  const out = new PNG({ width, height });
  out.data.fill(255);
  PNG.bitblt(img, out, 0, 0, img.width, img.height, 0, 0);
  return out;
}

export interface ImageDiffResult {
  png: Buffer;
  changedPixels: number;
  ratio: number;
}

/** Renders the newer screenshot dimmed with changed pixels highlighted in red. */
export function diffScreenshots(before: Buffer, after: Buffer): ImageDiffResult {
  const a = PNG.sync.read(before);
  const b = PNG.sync.read(after);
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const out = new PNG({ width, height });
  const changedPixels = pixelmatch(padTo(a, width, height).data, padTo(b, width, height).data, out.data, width, height, {
    threshold: 0.15,
    alpha: 0.25,
    diffColor: [255, 60, 40],
    diffColorAlt: [60, 120, 255],
  });
  return { png: PNG.sync.write(out), changedPixels, ratio: changedPixels / (width * height) };
}
