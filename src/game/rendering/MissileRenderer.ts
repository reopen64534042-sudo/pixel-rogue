import type { GameCore } from "../core/GameCore";
import type { PixelPainter } from "./PixelPainter";
import { MISSILE as M, MISSILE_XP } from "../data/missile";
import { PALETTE_HEX as C } from "../data/palette";
import { captureMissileVfx } from "./vfx/missile/MissileVfxBridge";
import { missileVfxCommands } from "./vfx/missile/MissileVfxPlayer";
import { drawMissileVfxPainter } from "./vfx/missile/MissileVfxPainter";

const active = (core: GameCore) => core.prof === "shooter" && core.shooterWeapon === "missile";
export function drawMissile(core: GameCore, ctx: PixelPainter) {
  if (!active(core)) return;
  drawMissileVfxPainter(ctx, missileVfxCommands(captureMissileVfx(core)));
  const alpha = ctx.globalAlpha;
  for (const e of core.missile.escapes) {
    const u = (core.time - e.at) / 0.25;
    if (u < 0 || u >= 1) continue;
    ctx.globalAlpha = 1 - u; ctx.strokeStyle = C.gold;
    ctx.beginPath(); ctx.arc(e.x, e.y, M.escapeRange * u, e.angle - M.escapeArc / 2, e.angle + M.escapeArc / 2); ctx.stroke();
  }
  ctx.globalAlpha = alpha;
}

/** Burn grounds are below actors; their quiet boundary matches the actual radius. */
export function drawMissileGround(core: GameCore, ctx: PixelPainter) {
  if (!active(core)) return;
  const alpha = ctx.globalAlpha;
  for (const ground of core.missile.grounds) {
    const age = core.time - ground.born, fade = Math.min(1, (ground.until - core.time) / 0.25);
    ctx.globalAlpha = fade * 0.18; ctx.strokeStyle = C.fireDeep;
    ctx.beginPath(); ctx.arc(ground.x, ground.y, ground.radius, 0, Math.PI * 2); ctx.stroke();
    drawMissileVfxPainter(ctx, [{ kind: "sprite", clip: "debris", frame: 2 + Math.floor(age * 16) % 4,
      x: ground.x, y: ground.y, angle: age * 0.25, scaleX: ground.radius / 16, scaleY: ground.radius / 16, alpha: fade * 0.55 }]);
  }
  ctx.globalAlpha = alpha;
}

export function drawMissileResources(core: GameCore, ctx: PixelPainter) {
  if (!active(core)) return;
  // Dash cells occupy rounded player Y + 12..13; keep two clear rows before missile HUD.
  const s = core.missile, p = core.player, x = Math.round(p.x - 10), y = Math.round(p.y) + 16, alpha = ctx.globalAlpha;
  ctx.globalAlpha = 1; ctx.fillStyle = C.ink1; ctx.fillRect(x, y, 20, 3);
  const loaded = s.reloadTotal > 0 ? 1 - s.reload / s.reloadTotal : 1;
  ctx.fillStyle = core.time < s.armorUntil && s.reload > 0 ? C.iceCyan : C.pGold;
  ctx.fillRect(x, y, Math.max(0, Math.min(20, Math.round(20 * loaded))), 2);
  for (let i = 0; i < M.cycle; i++) {
    const flash = s.rounds > 0 && s.rounds % M.cycle === 0 && loaded < 0.15;
    ctx.fillStyle = flash && s.lastVolley?.ion ? C.iceCyan : flash || i < s.rounds % M.cycle ? C.gold : C.steelDark;
    ctx.fillRect(x + 4 + i * 5, y + 4, 3, 1);
  }
  const need = MISSILE_XP[s.level - 1];
  ctx.fillStyle = C.ink1; ctx.fillRect(x, y + 7, 20, 2);
  ctx.fillStyle = C.gold; ctx.fillRect(x, y + 7, Math.round(20 * (need === null ? 1 : Math.min(1, s.xp / need))), 1);
  for (let i = 0; i < s.ammo; i++) { ctx.fillStyle = C.bone; ctx.fillRect(x + 3 + i * 6, y + 10, 2, 2); }
  if (s.beacon && !s.beacon.dead) {
    const e = s.beacon; ctx.strokeStyle = C.gold;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 3, -Math.PI / 2, Math.PI * 1.5); ctx.stroke();
    for (let i = 0; i < s.decode; i++) { ctx.fillStyle = C.bone; ctx.fillRect(Math.round(e.x - 3 + i * 4), Math.round(e.y - e.r - 6), 2, 1); }
  }
  ctx.globalAlpha = alpha;
}
