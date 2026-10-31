import { BOSS } from "../data/boss";
import type { BossImpact, Point } from "../core/types";
import type { PixelPainter } from "./PixelPainter";
import { BOSS_FX_ATLAS, BOSS_FX_CLIPS, BOSS_FX_FRAME_SIZE, type BossFxClip } from "./BossGeneratedAssets";

function sprite(ctx: PixelPainter, clip: BossFxClip, frame: number, at: Point, scaleX: number, scaleY: number,
  angle: number, alpha: number): boolean {
  if (!ctx.hasTexture(BOSS_FX_ATLAS)) return false;
  const config = BOSS_FX_CLIPS[clip];
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.spriteFrame(BOSS_FX_ATLAS, clip + "-" + Math.max(0, Math.min(5, Math.floor(frame))), {
    x: Math.round(at.x), y: Math.round(at.y), angle, scaleX, scaleY,
    originX: config.anchor[0] / BOSS_FX_FRAME_SIZE, originY: config.anchor[1] / BOSS_FX_FRAME_SIZE,
  });
  ctx.globalAlpha = 1;
  return true;
}

export function drawGeneratedBreath(ctx: PixelPainter, at: Point, angle: number, time: number, alpha: number): boolean {
  const frame = ([2, 3, 4, 3] as const)[Math.floor(time * 16) % 4];
  const scale = BOSS.breath.radius / BOSS_FX_CLIPS.fire.extent;
  return sprite(ctx, "fire", frame, at, scale, scale, angle, alpha * 0.9);
}

function chain(ctx: PixelPainter, from: Point, to: Point, frame: number, alpha: number): boolean {
  return sprite(ctx, "chain", frame, from, Math.hypot(to.x - from.x, to.y - from.y) / BOSS_FX_CLIPS.chain.extent,
    BOSS.chain.width / 24, Math.atan2(to.y - from.y, to.x - from.x), alpha);
}

export function drawGeneratedImpact(ctx: PixelPainter, v: BossImpact): boolean {
  if (!ctx.hasTexture(BOSS_FX_ATLAS)) return false;
  const progress = 1 - Math.max(0, Math.min(1, v.t / v.max)), frame = Math.min(5, Math.floor(progress * 6));
  const alpha = Math.min(1, v.t / 0.12);
  if (v.attack === "chain") {
    chain(ctx, v, { x: v.x + Math.cos(v.angle) * v.r, y: v.y + Math.sin(v.angle) * v.r }, frame, alpha);
    if (v.points.length === 2) chain(ctx, v.points[0], v.points[1], frame, alpha);
    return true;
  }
  const clip: BossFxClip = v.attack === "charge" ? "stomp" : v.attack === "breath" ? "fire" : v.attack;
  const scale = v.r / BOSS_FX_CLIPS[clip].extent;
  return sprite(ctx, clip, frame, v, scale, scale, clip === "fire" ? v.angle : 0, alpha);
}
