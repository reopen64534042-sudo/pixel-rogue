import type { PixelPainter } from "../../PixelPainter";
import { LASER_ATLAS_KEY, LASER_CLIPS, laserSpriteCrop } from "./laserAssets";
import type { LaserVfxCommand } from "./LaserVfxPlayer";

/** Consume the approved animation commands at the existing world draw position.
 * PixelPainter owns pooling/depth/camera state, so effects cannot jump above HUD
 * or leave crop/scale state on an enemy sprite reused on the next frame. */
export function drawLaserVfxPainter(ctx: PixelPainter, commands: readonly LaserVfxCommand[]): boolean {
  if (!ctx.hasTexture(LASER_ATLAS_KEY)) return false;
  const alpha = ctx.globalAlpha;
  for (const command of commands) {
    ctx.globalAlpha = command.alpha;
    if (command.kind === "sprite") {
      const clip = LASER_CLIPS[command.clip];
      const crop = laserSpriteCrop(command.clip, command.cropX, command.cropWidth);
      if (crop.width <= 0) continue;
      // Phaser crop coordinates retain their local offset in the source frame.
      const offset = crop.x * command.scaleX;
      ctx.spriteFrame(LASER_ATLAS_KEY, clip.frames[command.frame], {
        x: command.x - Math.cos(command.angle) * offset,
        y: command.y - Math.sin(command.angle) * offset,
        angle: command.angle, scaleX: command.scaleX, scaleY: command.scaleY,
        originX: clip.anchor[0] / clip.width, originY: clip.anchor[1] / clip.height,
        crop: { x: crop.x, y: 0, width: crop.width, height: clip.height },
      });
    } else if (command.kind === "beam") {
      ctx.beam(command.x, command.y, command.x2, command.y2, command.width, command.color, command.alpha);
    } else if (command.kind === "arc") {
      ctx.strokeStyle = command.color;
      ctx.beginPath();
      ctx.arc(command.x, command.y, command.radius, command.start, command.end);
      ctx.stroke();
    } else {
      ctx.fillStyle = command.color;
      ctx.fillRect(command.x, command.y, 1, 1);
    }
  }
  ctx.globalAlpha = alpha;
  return true;
}
