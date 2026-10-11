"use client";

import { type RefObject, useEffect, useRef } from "react";
import { ARMS, type ArmId, armInfluence, shapeFor, type StarShape } from "./starGeometry";
import { armSvgs, rasterize } from "./starSprites";

/** Hue rotation (degrees) per hero-height of cursor travel over an arm. */
const HUE_PER_TRAVEL = 420;
/** Per-frame decay of hue back to the resting palette. */
const HUE_RELAX = 0.985;
const BOOST_EASE = 0.1;
const SETTLE_EPSILON = 0.05;
/** Backing resolution of the star canvas. The art is soft, so it is upscaled by CSS cheaply. */
const CANVAS_PX = 768;

interface Props {
  /** Element whose centre the star is anchored to (the glass card). */
  anchorRef: RefObject<HTMLElement | null>;
}

interface Layout {
  cx: number;
  cy: number;
  size: number;
  shape: StarShape;
}

type ArmState = Record<ArmId, number>;

/** Canvas filter for an arm: hue-rotated and brightened by the cursor. White ring halves get tinted first. */
function armFilter(id: ArmId, hue: number, boost: number): string {
  const light = `brightness(${(1 + boost * 0.55).toFixed(3)})`;
  if (id === "left" || id === "right") {
    const tint = Math.min(1, Math.abs(hue) / 60);
    return `sepia(${tint.toFixed(3)}) saturate(${(1 + tint * 5).toFixed(2)}) hue-rotate(${(hue * 1.4).toFixed(1)}deg) ${light}`;
  }
  return `hue-rotate(${hue.toFixed(1)}deg) saturate(${(1 + boost * 0.4).toFixed(3)}) ${light}`;
}

export function StarField({ anchorRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !host || !ctx) return;

    const hue: ArmState = { up: 0, right: 0, down: 0, left: 0 };
    const boost: ArmState = { up: 0, right: 0, down: 0, left: 0 };
    const target: ArmState = { up: 0, right: 0, down: 0, left: 0 };
    let sprites: Partial<Record<ArmId, HTMLCanvasElement>> = {};
    let layout: Layout | null = null;
    let shapeKey = "";
    let last: { x: number; y: number } | null = null;
    let frame = 0;
    let disposed = false;

    // Filtering is the expensive step, so each arm is re-tinted only when its own filter changes;
    // the per-frame work is then four plain drawImage calls.
    const tinted: Partial<Record<ArmId, { canvas: HTMLCanvasElement; filter: string }>> = {};
    const tint = (id: ArmId, sprite: HTMLCanvasElement): HTMLCanvasElement => {
      const filter = armFilter(id, hue[id], boost[id]);
      let entry = tinted[id];
      if (!entry) {
        const canvas = document.createElement("canvas");
        canvas.width = CANVAS_PX;
        canvas.height = CANVAS_PX;
        entry = { canvas, filter: "" };
        tinted[id] = entry;
      }
      if (entry.filter !== filter) {
        const tctx = entry.canvas.getContext("2d");
        if (tctx) {
          tctx.clearRect(0, 0, CANVAS_PX, CANVAS_PX);
          tctx.filter = filter;
          tctx.drawImage(sprite, 0, 0);
          tctx.filter = "none";
        }
        entry.filter = filter;
      }
      return entry.canvas;
    };

    const draw = () => {
      ctx.clearRect(0, 0, CANVAS_PX, CANVAS_PX);
      ctx.globalCompositeOperation = "lighter";
      for (const { id } of ARMS) {
        const sprite = sprites[id];
        if (sprite) ctx.drawImage(tint(id, sprite), 0, 0);
      }
    };

    const tick = () => {
      let moving = false;
      for (const { id } of ARMS) {
        boost[id] += (target[id] - boost[id]) * BOOST_EASE;
        hue[id] *= HUE_RELAX;
        if (Math.abs(hue[id]) > SETTLE_EPSILON || Math.abs(target[id] - boost[id]) > 0.002) moving = true;
      }
      draw();
      frame = moving ? requestAnimationFrame(tick) : 0;
    };
    const wake = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const measure = async () => {
      const rect = host.getBoundingClientRect();
      const anchor = anchorRef.current?.getBoundingClientRect();
      const next: Layout = {
        cx: anchor ? anchor.left + anchor.width / 2 - rect.left : rect.width / 2,
        cy: anchor ? anchor.top + anchor.height / 2 - rect.top : rect.height * 0.36,
        size: rect.height,
        shape: shapeFor(rect.width, rect.height),
      };
      layout = next;
      Object.assign(canvas.style, {
        left: `${next.cx - next.size}px`,
        top: `${next.cy - next.size}px`,
        width: `${next.size * 2}px`,
        height: `${next.size * 2}px`,
      });
      const key = JSON.stringify(next.shape);
      if (key === shapeKey) return;
      shapeKey = key;
      try {
        const svgs = armSvgs(next.shape);
        const entries = await Promise.all(ARMS.map(async ({ id }) => [id, await rasterize(svgs[id], CANVAS_PX)] as const));
        if (disposed || key !== shapeKey) return;
        sprites = Object.fromEntries(entries);
        for (const entry of Object.values(tinted)) if (entry) entry.filter = "";
        draw();
        canvas.dataset.ready = "true";
      } catch (err) {
        console.error("[StarField] could not rasterise star", err);
      }
    };

    const onMove = (event: PointerEvent) => {
      if (!layout) return;
      const rect = host.getBoundingClientRect();
      const scale = 1000 / layout.size;
      const dx = (event.clientX - rect.left - layout.cx) * scale;
      const dy = (event.clientY - rect.top - layout.cy) * scale;
      const travel = last ? Math.hypot(event.clientX - last.x, event.clientY - last.y) / layout.size : 0;
      last = { x: event.clientX, y: event.clientY };
      const influence = armInfluence(dx, dy, layout.shape);
      for (const { id } of ARMS) {
        hue[id] += travel * influence[id] * HUE_PER_TRAVEL;
        target[id] = influence[id];
      }
      wake();
    };
    const onLeave = () => {
      last = null;
      for (const { id } of ARMS) target[id] = 0;
      wake();
    };

    canvas.width = CANVAS_PX;
    canvas.height = CANVAS_PX;
    const observer = new ResizeObserver(() => void measure());
    observer.observe(host);
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, [anchorRef]);

  return <canvas ref={canvasRef} className="star-canvas" aria-hidden="true" />;
}
