import type Phaser from "phaser";
import type { PixelPainter } from "../PixelPainter";

/** Shared frame geometry for the shipped 5x2 sheet and the PixelPainter adapter. */
export const IAI_SPIN_SLASH = {
  image: "assets/vfx/iai-spin-slash-64x64-10f.png",
  texturePrefix: "iai-spin-slash-",
  frameSize: 64,
  columns: 5,
  rows: 2,
  frameCount: 10,
  frameRate: 60,
  durationSeconds: 10 / 60,
} as const;

/** Register once after image decoding; repeat calls reuse existing textures. */
export function registerIaiSpinSlash(
  textures: Phaser.Textures.TextureManager,
  image: HTMLImageElement,
): void {
  const { frameSize, columns, rows, frameCount, texturePrefix } = IAI_SPIN_SLASH;
  if (
    image.naturalWidth !== columns * frameSize ||
    image.naturalHeight !== rows * frameSize
  ) {
    throw new Error("Iai spin slash sheet must be 320x128 pixels");
  }
  for (let frame = 0; frame < frameCount; frame++) {
    const key = `${texturePrefix}${frame}`;
    if (textures.exists(key)) continue;
    const canvas = document.createElement("canvas");
    canvas.width = frameSize;
    canvas.height = frameSize;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Cannot create iai spin slash frame canvas");
    context.imageSmoothingEnabled = false;
    context.drawImage(
      image,
      (frame % columns) * frameSize,
      Math.floor(frame / columns) * frameSize,
      frameSize,
      frameSize,
      0,
      0,
      frameSize,
      frameSize,
    );
    if (!textures.addCanvas(key, canvas)) {
      throw new Error(`Cannot register iai spin slash texture: ${key}`);
    }
  }
}

/**
 * Draw at the effect center with simulation-owned progress in [0, 1).
 * No animation timer: the caller's pause, expiry and reset control playback.
 * `scale` is an integer upscale for aligning the ring with the hit radius
 * (the shipped L3 uses 2×). Returns false before loading or outside the
 * lifetime so callers can fall back.
 */
export function drawIaiSpinSlash(
  painter: PixelPainter,
  centerX: number,
  centerY: number,
  progress: number,
  scale = 1,
): boolean {
  if (
    !Number.isFinite(centerX) ||
    !Number.isFinite(centerY) ||
    !Number.isFinite(progress) ||
    progress < 0 ||
    progress >= 1
  ) return false;
  const frame = Math.floor(progress * IAI_SPIN_SLASH.frameCount);
  const key = `${IAI_SPIN_SLASH.texturePrefix}${frame}`;
  if (!painter.hasTexture(key)) return false;
  const previousAlpha = painter.globalAlpha;
  painter.globalAlpha = 1;
  try {
    painter.spriteRot(key, Math.round(centerX), Math.round(centerY), 0, scale);
  } finally {
    painter.globalAlpha = previousAlpha;
  }
  return true;
}
