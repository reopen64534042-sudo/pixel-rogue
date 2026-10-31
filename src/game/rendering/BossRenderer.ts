import { BOSS, BOSS_ATTACKS, BOSS_PHASES } from "../data/boss";
import { W } from "../data/constants";
import { drawBossWorld } from "./BossVfx";
import type { GameCore } from "../core/GameCore";
import type { PixelPainter } from "./PixelPainter";
import { spriteEntry } from "./assetRegistry";

function ring(ctx: PixelPainter, x: number, y: number, r: number, color: string, alpha = 0.6): void {
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(Math.round(x), Math.round(y), r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** 正式 Boss 世界层与离线素材预览共用同一套绘制函数。 */
export function drawBossGround(core: GameCore, ctx: PixelPainter): void {
  drawBossWorld(core, ctx);
}

/** 外部阶段变体缺失时退回基础图；基础图本身由程序化贴图保底。 */
export function bossSpriteKey(core: GameCore): string {
  const s = core.bossState;
  if (!s) return "boss_three";
  const key = BOSS_PHASES[s.phase].sprite;
  return spriteEntry(key) ? key : "boss_three";
}

export function drawBossHead(core: GameCore, ctx: PixelPainter): void {
  const s = core.bossState;
  if (!s || s.enemy.dead) return;
  const e = s.enemy, phase = BOSS_PHASES[s.phase];
  const x = e.x + (s.phase - 2) * 12;
  ring(ctx, x, e.y - 7, 7, phase.color, 0.65);
  ctx.fillStyle = phase.color;
  ctx.globalAlpha = 0.8;
  ctx.fillRect(Math.round(x - 3), Math.round(e.y - 8), 2, 1);
  ctx.fillRect(Math.round(x + 2), Math.round(e.y - 8), 2, 1);
  ctx.globalAlpha = 1;
  if (s.action === "stagger") {
    const font = ctx.font, align = ctx.textAlign;
    ctx.fillStyle = "#ffd24a";
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.fillText("易伤 +15%", e.x, e.y - 24);
    ctx.textAlign = align;
    ctx.font = font;
  } else if (s.action === "windup" && s.attack) {
    const font = ctx.font, align = ctx.textAlign;
    ctx.fillStyle = phase.color;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.fillText(BOSS_ATTACKS[s.attack].name, e.x, e.y - 24);
    ctx.textAlign = align;
    ctx.font = font;
  }
}

export function drawBossHud(core: GameCore, ctx: PixelPainter): void {
  const s = core.bossState;
  if (!s || s.enemy.dead || core.wavePhase !== "fight" || core.state === "start" || core.state === "over") return;
  const font = ctx.font, align = ctx.textAlign;
  const phase = BOSS_PHASES[s.phase], x = Math.round(W / 2 - 120), y = 48;
  ctx.globalAlpha = s.action === "intro" ? Math.min(1, (BOSS.intro - s.actionT) / 0.4) : 1;
  if (s.action === "transition") ctx.globalAlpha = 0.65 + Math.sin(core.time * 16) * 0.15;
  ctx.fillStyle = "#10131f";
  ctx.fillRect(x - 1, y - 1, 242, 8);
  ctx.fillStyle = "#342a36";
  ctx.fillRect(x, y, 240, 6);
  ctx.fillStyle = s.enemy.flash > 0 ? "#e8e8f0" : phase.color;
  ctx.fillRect(x, y, Math.round(240 * Math.max(0, s.enemy.hp / s.enemy.maxhp)), 6);
  ctx.fillStyle = "#10131f";
  for (const threshold of BOSS.thresholds) ctx.fillRect(x + Math.round(240 * threshold), y, 1, 6);
  ctx.font = '10px "Press Start 2P", monospace';
  ctx.textAlign = "center";
  ctx.fillStyle = phase.color;
  ctx.fillText(`${BOSS.name} · ${phase.name}`, W / 2, y - 6);
  const hudAlpha = ctx.globalAlpha;
  for (const i of [1, 2, 3] as const) {
    ring(ctx, x + 218 + (i - 1) * 8, y - 10, i === s.phase ? 2.5 : 1.5,
      i <= s.phase ? BOSS_PHASES[i].color : "#525266", hudAlpha);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = align;
  ctx.font = font;
}
