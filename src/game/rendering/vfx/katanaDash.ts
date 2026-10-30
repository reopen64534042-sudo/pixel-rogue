import type Phaser from "phaser";
import type { PixelPainter } from "../PixelPainter";

/** Blade-head frames; the variable-length wake is drawn from the actual dash segment. */
export const KATANA_DASH = {
  image: "assets/vfx/katana-dash-32x32-10f.png",
  texturePrefix: "katana-dash-",
  frameSize: 32,
  columns: 5,
  rows: 2,
  frameCount: 10,
  rushDurationSeconds: 0.16,
} as const;

export interface KatanaDashView {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  phase: "rush" | "release";
  /** Simulation-owned phase progress in [0, 1); no independent animation clock. */
  progress: number;
}

export function registerKatanaDash(
  textures: Phaser.Textures.TextureManager,
  image: HTMLImageElement,
): void {
  const { frameSize, columns, rows, frameCount, texturePrefix } = KATANA_DASH;
  if (
    image.naturalWidth !== frameSize * columns ||
    image.naturalHeight !== frameSize * rows
  ) throw new Error("Katana dash sheet must be 160x64 pixels");
  for (let frame = 0; frame < frameCount; frame++) {
    const key = `${texturePrefix}${frame}`;
    if (textures.exists(key)) continue;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = frameSize;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Cannot create katana dash frame canvas");
    context.imageSmoothingEnabled = false;
    context.drawImage(
      image,
      (frame % columns) * frameSize,
      Math.floor(frame / columns) * frameSize,
      frameSize, frameSize, 0, 0, frameSize, frameSize,
    );
    if (!textures.addCanvas(key, canvas))
      throw new Error(`Cannot register katana dash texture: ${key}`);
  }
}

/** Pure presentation: clipped to the traveled segment, deterministic, and pause-safe. */
export function drawKatanaDash(painter: PixelPainter, dash: KatanaDashView): boolean {
  const { x1, y1, x2, y2, phase, progress } = dash;
  if (
    ![x1, y1, x2, y2, progress].every(Number.isFinite) ||
    progress < 0 || progress >= 1
  ) return false;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  // Dashing into a wall must not invent a full-length damage corridor.
  if (length < 0.5) return false;
  const ux = dx / length, uy = dy / length;
  const nx = -uy, ny = ux;
  const release = phase === "release";
  const alpha = release ? (1 - progress) ** 1.4 : 0.65 + progress * 0.25;
  const tail = release ? progress ** 0.7 * 0.92 : 0;
  const end = Math.max(tail, 1 - Math.min(4, length * 0.2) / length);
  const mid = (tail + end) / 2;
  const point = (along: number, across: number): [number, number] => [
    Math.round(x1 + dx * along + nx * across),
    Math.round(y1 + dy * along + ny * across),
  ];
  const previousAlpha = painter.globalAlpha;
  const previousFill = painter.fillStyle;
  try {
    // Narrow tapered ribbon: the leading crescent reads as a blade, not a beam.
    const outer: number[] = [], inner: number[] = [];
    for (let offset = -4; offset <= 4; offset++) {
      const line = [
        ...point(tail, offset * 0.15),
        ...point(mid, offset),
        ...point(end, offset * 0.5),
      ];
      outer.push(...line);
      if (Math.abs(offset) <= 1) inner.push(...line);
    }
    painter.polyline3(outer, "#57e6ff", alpha * 0.2);
    painter.polyline3(inner, "#d8f7ff", alpha * 0.55);
    painter.polyline3(
      [...point(tail, 0), ...point(mid, 0), ...point(end, 0)],
      "#ffffff",
      alpha * (release && progress < 0.12 ? 1 : 0.75),
    );
    // Paired slipstream cuts and sparse chips stay inside the 12px path half-width.
    for (const side of [-1, 1]) {
      painter.polyline3([
        ...point(tail + (end - tail) * 0.2, side * 7),
        ...point(tail + (end - tail) * 0.6, side * 6),
        ...point(end, side * 3),
      ], "#57e6ff", alpha * 0.55);
    }
    painter.globalAlpha = alpha * 0.8;
    for (let i = 0; i < 6; i++) {
      const along = (i + 1) / 7;
      if (along <= tail || along >= end) continue;
      const side = i % 2 === 0 ? 1 : -1;
      const [x, y] = point(along, side * (5 + (i % 3) + (release ? progress * 3 : 0)));
      painter.fillStyle = i % 3 === 0 ? "#ffffff" : "#57e6ff";
      painter.fillRect(x, y, 1, 1);
    }
    const frame = release
      ? 5 + Math.min(4, Math.floor(progress / 0.42 * 5))
      : Math.min(4, Math.floor(progress * 8));
    // Dissipation completes before the lingering path fades away.
    if (!release || progress < 0.42) {
      const key = `${KATANA_DASH.texturePrefix}${frame}`;
      painter.globalAlpha = 1;
      if (painter.hasTexture(key)) {
        painter.spriteRot(key, Math.round(x2), Math.round(y2), Math.atan2(dy, dx));
      } else {
        // Keep the rush readable while the optional sheet is still loading.
        const arc: number[] = [];
        for (let i = 0; i < 8; i += 2) {
          for (let j = 0; j < 3; j++) {
            const a = -1.2 + (i + j) * 0.3;
            arc.push(
              Math.round(x2 + ux * Math.cos(a) * 11 + nx * Math.sin(a) * 11),
              Math.round(y2 + uy * Math.cos(a) * 11 + ny * Math.sin(a) * 11),
            );
          }
        }
        painter.polyline3(arc, "#d8f7ff", alpha);
      }
    }
  } finally {
    painter.globalAlpha = previousAlpha;
    painter.fillStyle = previousFill;
  }
  return true;
}
