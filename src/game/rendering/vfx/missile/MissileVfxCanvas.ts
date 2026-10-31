import { MISSILE_CLIPS } from "./missileAssets";
import type { MissileVfxCommand } from "./MissileVfxPlayer";

export interface MissileAtlasData {
  frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
}
export function drawMissileVfxCanvas(ctx: CanvasRenderingContext2D, image: CanvasImageSource,
  atlas: MissileAtlasData, commands: readonly MissileVfxCommand[]) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  for (const command of commands) {
    ctx.globalAlpha = command.alpha;
    if (command.kind === "line") {
      ctx.strokeStyle = command.color; ctx.lineWidth = command.width;
      ctx.beginPath(); ctx.moveTo(command.x, command.y); ctx.lineTo(command.x2, command.y2); ctx.stroke();
      continue;
    }
    const c = MISSILE_CLIPS[command.clip], rect = atlas.frames[c.frames[command.frame]]?.frame;
    if (!rect) throw new Error(`Missing missile frame ${command.clip}-${command.frame}`);
    ctx.save(); ctx.translate(command.x, command.y); ctx.rotate(command.angle); ctx.scale(command.scaleX, command.scaleY);
    ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h, -c.anchor[0], -c.anchor[1], rect.w, rect.h);
    ctx.restore();
  }
  ctx.restore();
}
