import { ELITE_DRUMMER_AURA, MONSTER_SKILLS as S } from "../data/enemies";
import { WORLD, clamp } from "../data/constants";
import { isFrozen, isFrostLocked } from "../core/ElementMath";
import type { GameCore } from "../core/GameCore";
import type { EnemyAction } from "../core/types";
import type { PixelPainter } from "./PixelPainter";

function ring(ctx: PixelPainter, x: number, y: number, r: number, color: string, alpha: number): void {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.beginPath(); ctx.arc(x, y, Math.max(1, r), 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
}
function corridor(ctx: PixelPainter, a: EnemyAction, length: number, width: number, color: string, active: boolean): void {
  const dx = Math.cos(a.angle), dy = Math.sin(a.angle);
  const x = a.x + dx * length, y = a.y + dy * length;
  const nx = -dy * width / 2, ny = dx * width / 2;
  ctx.polygon([a.x + nx, a.y + ny, x + nx, y + ny, x - nx, y - ny, a.x - nx, a.y - ny], color, active ? 0.18 : 0.05);
  ctx.beam(a.x + nx, a.y + ny, x + nx, y + ny, 1, color, 0.7);
  ctx.beam(a.x - nx, a.y - ny, x - nx, y - ny, 1, color, 0.7);
  // The simulation uses point-to-segment distance: show its round end caps too.
  ctx.strokeStyle = color; ctx.globalAlpha = 0.7;
  ctx.beginPath(); ctx.arc(a.x, a.y, width / 2, a.angle + Math.PI / 2, a.angle + Math.PI * 1.5); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, width / 2, a.angle - Math.PI / 2, a.angle + Math.PI / 2); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.beam(a.x, a.y, x, y, active ? 3 : 1, color, active ? 0.85 : 0.25);
}

/** Read-only rendering of exact simulation geometry, underneath units and player. */
export function drawEnemySkills(core: GameCore, ctx: PixelPainter): void {
  for (const h of core.hazards) {
    // Boss ground keeps its approved detailed VFX; normal ground shares this same pool.
    if (h.source?.boss) continue;
    const color = h.kind === "fire" ? "#ff8a2b" : h.kind === "frost" ? "#57e6ff" : "#bca6ff";
    const fade = Math.min(1, h.t / 0.5);
    ring(ctx, h.x, h.y, h.r, color, 0.65 * fade);
    for (let i = 0; i < 8; i++) {
      const angle = i * 2.4, r = h.r * Math.sqrt((i + 1) / 10);
      const x = h.x + Math.cos(angle) * r, y = h.y + Math.sin(angle) * r;
      ctx.beam(x, y, x, y - 3 - (Math.sin(core.time * 6 + i) + 1) * 2, 2, color, 0.4 * fade);
    }
  }
  for (const e of core.enemies) {
    if (e.dead || e.boss) continue;
    if (e.guard) {
      ctx.strokeStyle = e.guard.downT > 0 ? "#4a5062" : "#57e6ff";
      ctx.globalAlpha = e.guard.downT > 0 ? 0.35 : 0.8;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r + 5, e.guard.angle - e.guard.arc / 2, e.guard.angle + e.guard.arc / 2);
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (e.type === "drummer_elite" && e.frozenT <= 0 && (e.stunT ?? 0) <= 0 && !isFrozen(e) && !isFrostLocked(e) && (e.domainStunUntil ?? 0) <= core.time)
      ring(ctx, e.x, e.y, ELITE_DRUMMER_AURA.radius, "#b89a57", 0.16);
    const a = e.action;
    if (!a) continue;
    const active = a.phase === "active", progress = Math.max(0, Math.min(1, 1 - a.t / a.max));
    if (a.kind === "tether" || a.kind === "gaze" || a.kind === "thrust") {
      const config = S[a.kind];
      corridor(ctx, a, config.length, config.width, a.kind === "thrust" ? "#ebae73" : "#aabfe8", active);
    } else if (a.kind === "blink") {
      const x = clamp(a.x + Math.cos(a.angle) * S.blink.distance, 20, WORLD.w - 20);
      const y = clamp(a.y + Math.sin(a.angle) * S.blink.distance, 20, WORLD.h - 20);
      ring(ctx, x, y, 9, "#bca6ff", active ? 0.8 : 0.4);
    } else {
      const radius = a.kind === "lob" ? S.lob.radius : a.kind === "stomp" ? S.stomp.radius : a.kind === "collapse" ? S.collapse.radius : S.sonic.radius;
      const color = a.kind === "lob" ? "#e8a06f" : a.kind === "collapse" ? "#bca6ff" : "#d8b277";
      ring(ctx, a.x, a.y, radius, color, active ? 0.4 * (1 - progress) : 0.7);
      ring(ctx, a.x, a.y, radius * (a.kind === "sonic" && active ? progress : 1 - progress), color, 0.5);
      if (!active) {
        ctx.beam(a.x - 4, a.y, a.x + 4, a.y, 1, color, 0.7);
        ctx.beam(a.x, a.y - 4, a.x, a.y + 4, 1, color, 0.7);
      }
    }
  }
}
