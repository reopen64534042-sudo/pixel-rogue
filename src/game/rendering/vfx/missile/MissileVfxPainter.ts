import type { PixelPainter } from "../../PixelPainter";
import { MISSILE_ATLAS_KEY, MISSILE_CLIPS } from "./missileAssets";
import type { MissileVfxCommand } from "./MissileVfxPlayer";
import { PALETTE_HEX as C } from "../../../data/palette";

/** PixelPainter owns pooling, depth and scroll state, shared with all world effects. */
export function drawMissileVfxPainter(ctx: PixelPainter, commands: readonly MissileVfxCommand[]): boolean {
  const ready = ctx.hasTexture(MISSILE_ATLAS_KEY), alpha = ctx.globalAlpha;
  for (const command of commands) {
    ctx.globalAlpha = command.alpha;
    if (command.kind === "line") {
      ctx.beam(command.x, command.y, command.x2, command.y2, command.width, command.color, command.alpha);
      continue;
    }
    const c = MISSILE_CLIPS[command.clip];
    if (ready) ctx.spriteFrame(MISSILE_ATLAS_KEY, c.frames[command.frame], {
      x: command.x, y: command.y, angle: command.angle, scaleX: command.scaleX, scaleY: command.scaleY,
      originX: c.anchor[0] / c.width, originY: c.anchor[1] / c.height,
    });
    else if (command.clip === "body" || command.clip === "micro-body") {
      const size = command.clip === "body" ? 5 : 3, co = Math.cos(command.angle), si = Math.sin(command.angle);
      const at = (x: number, y: number) => [command.x + co * x - si * y, command.y + si * x + co * y];
      ctx.polygon([...at(size, 0), ...at(-size, -2), ...at(-size, 2)], C.steelLight, command.alpha);
    } else if (command.clip.includes("blast")) {
      ctx.strokeStyle = command.clip === "ion-blast" ? C.iceCyan : C.fireOrange;
      ctx.beginPath(); ctx.arc(command.x, command.y, Math.max(1, 28 * command.scaleY * (command.frame + 1) / 8), 0, Math.PI * 2); ctx.stroke();
    }
  }
  ctx.globalAlpha = alpha;
  return ready;
}
