import { BOSS_PIXEL_COLORS, BOSS_PIXEL_SIZE, bossPixelRows } from "./BossPixelArt";

/** Simplified loading-failure fallback; the normal path uses the generated pose atlas. */
export function makeBossSprite(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const { width, height, scale } = BOSS_PIXEL_SIZE;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Boss texture context unavailable");
  const rows = bossPixelRows("idle");
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const color = BOSS_PIXEL_COLORS[rows[y][x]];
    if (!color) continue;
    ctx.fillStyle = color;
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }
  return canvas;
}
