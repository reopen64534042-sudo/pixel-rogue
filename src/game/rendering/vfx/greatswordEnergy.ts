import type { Slash } from "../../core/types";
import type { PixelPainter } from "../PixelPainter";
import { WARRIOR_BALANCE } from "../../data/warriorBalance";

/** Shipped sheets; radius is a visual scaling reference, not a hitbox. */
export const GREATSWORD_ENERGY = {
  qi: { image: "assets/vfx/greatsword-sword-qi-64x64-10f.png", prefix: "greatsword-sword-qi-", size: 64, radius: 27 },
  qiLeft: { image: "assets/vfx/greatsword-sword-qi-left-64x64-10f.png", prefix: "greatsword-sword-qi-left-", size: 64, radius: 27 },
  fissure: { image: "assets/vfx/greatsword-fissure-96x96-10f.png", prefix: "greatsword-fissure-", size: 96, radius: 43 },
  dash: { image: "assets/vfx/greatsword-dash-slash-96x96-10f.png", prefix: "greatsword-dash-slash-", size: 96, radius: 39 },
  dashLeft: { image: "assets/vfx/greatsword-dash-slash-left-96x96-10f.png", prefix: "greatsword-dash-slash-left-", size: 96, radius: 39 },
} as const;

export const GREATSWORD_ENERGY_SHEETS = Object.freeze(Object.values(GREATSWORD_ENERGY));
export const GREATSWORD_ENERGY_FRAME_STARTS = [0, 0.06, 0.12, 0.19, 0.27, 0.38, 0.50, 0.64, 0.78, 0.91] as const;

/** Shared by PixelPainter and standard Phaser consumers; -1 means expired/invalid. */
export function greatswordEnergyFrame(progress: number): number {
  if (!Number.isFinite(progress) || progress < 0 || progress >= 1) return -1;
  let frame = 0;
  while (frame + 1 < GREATSWORD_ENERGY_FRAME_STARTS.length &&
    progress >= GREATSWORD_ENERGY_FRAME_STARTS[frame + 1]) frame++;
  return frame;
}

export interface GreatswordWaveView {
  kind: "qi" | "fissure";
  /** Current wave center in world coordinates; never the player's current position. */
  x: number;
  y: number;
  /** Travel direction in radians: 0 right, PI/2 down. */
  angle: number;
  /** Simulation-owned animation progress in [0,1); this function never moves the wave. */
  progress: number;
  /** Uniform visual scale, default 1; nominal heights are 42px / 64px. */
  scale?: number;
  /** Explicit opacity, default 1. The caller's previous alpha is restored. */
  alpha?: number;
}

type EnergySheet = (typeof GREATSWORD_ENERGY_SHEETS)[number];

function drawFrame(
  painter: PixelPainter, sheet: EnergySheet, frame: number,
  x: number, y: number, angle: number, scale: number, alpha: number,
): boolean {
  const key = `${sheet.prefix}${frame}`;
  if (!painter.hasTexture(key)) return false;
  const previousAlpha = painter.globalAlpha;
  painter.globalAlpha = alpha;
  try {
    painter.spriteRot(key, Math.round(x), Math.round(y), angle, scale);
  } finally {
    painter.globalAlpha = previousAlpha;
  }
  return true;
}

/** Pure view adapter: one moving wave per call, false keeps the caller's fallback. */
export function drawGreatswordWave(painter: PixelPainter, wave: GreatswordWaveView): boolean {
  const { x, y, progress } = wave;
  const scale = wave.scale ?? 1, alpha = wave.alpha ?? 1;
  const frame = greatswordEnergyFrame(progress);
  if (frame < 0 || ![x, y, wave.angle, scale, alpha].every(Number.isFinite) ||
    scale <= 0 || alpha < 0 || alpha > 1 ||
    (wave.kind !== "qi" && wave.kind !== "fissure")) return false;
  const angle = Math.atan2(Math.sin(wave.angle), Math.cos(wave.angle));
  const left = angle < -Math.PI / 2 || angle >= Math.PI / 2;
  const sheet = wave.kind === "fissure" ? GREATSWORD_ENERGY.fissure :
    left ? GREATSWORD_ENERGY.qiLeft : GREATSWORD_ENERGY.qi;
  return drawFrame(painter, sheet, frame, x, y,
    wave.kind === "qi" && left ? angle - Math.PI : angle, scale, alpha);
}

/** Call only for a saved dash-cut Slash; ordinary swings keep their existing view.
 * 360-degree spins and landing impacts return false and retain their own renderer. */
export function drawGreatswordDashSlash(painter: PixelPainter, slash: Slash, alpha = 1): boolean {
  if (slash.weapon !== "greatsword" || slash.impact || slash.spin ||
    ![slash.x, slash.y, slash.a, slash.arc, slash.r, slash.life, slash.max, alpha].every(Number.isFinite) ||
    Math.abs(slash.arc - WARRIOR_BALANCE.styles.greatsword.spread) > 1e-6 ||
    slash.r <= 0 || slash.life <= 0 || slash.max <= 0 || slash.life > slash.max ||
    alpha < 0 || alpha > 1) return false;
  const frame = greatswordEnergyFrame(1 - slash.life / slash.max);
  if (frame < 0) return false;
  const angle = Math.atan2(Math.sin(slash.a), Math.cos(slash.a));
  const left = angle < -Math.PI / 2 || angle >= Math.PI / 2;
  const sheet = left ? GREATSWORD_ENERGY.dashLeft : GREATSWORD_ENERGY.dash;
  return drawFrame(painter, sheet, frame, slash.x, slash.y,
    left ? angle - Math.PI : angle, slash.r / sheet.radius, alpha);
}
