import { LASER_CLIPS, laserSpriteCrop } from "./laserAssets";
import type { LaserVfxCommand } from "./LaserVfxPlayer";

export interface LaserAtlasData {
  frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
}

/** The offline preview and browser demo consume exactly these production commands/assets. */
export function drawLaserVfxCanvas(ctx: CanvasRenderingContext2D, image: CanvasImageSource,
  atlas: LaserAtlasData, commands: readonly LaserVfxCommand[]) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  for (const command of commands) {
    ctx.globalAlpha = command.alpha;
    if (command.kind === "sprite") {
      const clip = LASER_CLIPS[command.clip], name = clip.frames[command.frame];
      const rect = atlas.frames[name]?.frame;
      if (!rect) throw new Error(`Missing laser atlas frame: ${name}`);
      const crop = laserSpriteCrop(command.clip, command.cropX, command.cropWidth);
      if (crop.width <= 0) continue;
      ctx.save();
      ctx.translate(command.x, command.y);
      ctx.rotate(command.angle);
      ctx.scale(command.scaleX, command.scaleY);
      ctx.drawImage(image, rect.x + crop.x, rect.y, crop.width, rect.h,
        -clip.anchor[0], -clip.anchor[1], crop.width, rect.h);
      ctx.restore();
    } else if (command.kind === "beam") {
      ctx.strokeStyle = command.color; ctx.lineWidth = command.width; ctx.lineCap = "butt";
      ctx.beginPath(); ctx.moveTo(command.x, command.y); ctx.lineTo(command.x2, command.y2); ctx.stroke();
    } else if (command.kind === "arc") {
      ctx.strokeStyle = command.color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(command.x, command.y, command.radius, command.start, command.end); ctx.stroke();
    } else {
      ctx.fillStyle = command.color; ctx.fillRect(command.x, command.y, 1, 1);
    }
  }
  ctx.restore();
}
