import { BOSS, BOSS_ATTACKS, BOSS_PHASES, BOSS_STOMP_RADIUS } from "../data/boss";
import { PALETTE_HEX as P } from "../data/palette";
import { bossLineContains } from "../core/BossSystem";
import type { GameCore } from "../core/GameCore";
import type { BossImpact, Point } from "../core/types";
import type { PixelPainter } from "./PixelPainter";
import { BOSS_ATLAS, BOSS_FRAME, bossPose } from "./BossAnimation";
import { generatedBossHeadPosition } from "./BossGeneratedAssets";
import { drawGeneratedBreath, drawGeneratedImpact } from "./BossGeneratedVfx";

export type BossView = Pick<GameCore, "bossState" | "bossHazards" | "bossStrikes" | "bossImpacts" | "time" | "state" | "player" | "enemies">;
const TAU = Math.PI * 2;
const sat = (n: number) => Math.max(0, Math.min(1, n));
const noise = (n: number) => Math.sin(n * 127.1 + 311.7) * 0.5 + 0.5;

function ring(ctx: PixelPainter, x: number, y: number, r: number, color: string, alpha: number, width = 1): void {
  // Adjacent fine rings retain pixel detail without a bright filled disk.
  ctx.strokeStyle = color; ctx.globalAlpha = sat(alpha);
  for (let i = 0; i < width; i++) {
    ctx.beginPath(); ctx.arc(Math.round(x), Math.round(y), Math.max(1, r - i), 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function shard(ctx: PixelPainter, x: number, y: number, width: number, height: number, angle: number, alpha: number, warm = false): void {
  const c = Math.cos(angle), s = Math.sin(angle);
  const point = (px: number, py: number) => [Math.round(x + px * c - py * s), Math.round(y + px * s + py * c)];
  const top = point(0, -height), left = point(-width, 0), right = point(width, 0), center = point(0, -2);
  ctx.polygon([...left, ...top, ...right, ...center], warm ? P.pBrown : P.iceDeep, alpha);
  ctx.polygon([...center, ...top, ...right], warm ? P.sand : P.iceCyan, alpha * 0.85);
  ctx.beam(top[0], top[1], center[0], center[1], 1, warm ? P.steelLight : P.bone, alpha * 0.8);
}

function bolt(ctx: PixelPainter, from: Point, to: Point, time: number, alpha: number, seed = 1): void {
  const dx = to.x - from.x, dy = to.y - from.y, d = Math.hypot(dx, dy) || 1;
  let x = from.x, y = from.y;
  for (let i = 1; i <= 9; i++) {
    const k = i / 9, offset = i === 9 ? 0 : Math.sin(i * 17 + Math.floor(time * 24) + seed * 11) * 7;
    const nx = Math.round(from.x + dx * k - dy / d * offset), ny = Math.round(from.y + dy * k + dx / d * offset);
    ctx.beam(x, y, nx, ny, 4, P.iceDeep, alpha * 0.35);
    ctx.beam(x, y, nx, ny, 2, P.iceCyan, alpha * 0.8);
    ctx.beam(x, y, nx, ny, 1, P.bone, alpha);
    if (i % 3 === 0) ctx.beam(nx, ny, nx + dy / d * 12, ny - dx / d * 12, 1, P.iceCyan, alpha * 0.6);
    x = nx; y = ny;
  }
}

function lane(ctx: PixelPainter, origin: Point, angle: number, length: number, width: number, alpha: number): void {
  const c = Math.cos(angle), s = Math.sin(angle);
  const x = origin.x + c * length, y = origin.y + s * length;
  ctx.polygon([origin.x - s * width / 2, origin.y + c * width / 2, x - s * width / 2, y + c * width / 2,
    x + s * width / 2, y - c * width / 2, origin.x + s * width / 2, origin.y - c * width / 2], P.danger, alpha * 0.08);
  for (const side of [-1, 1]) ctx.beam(origin.x + s * width / 2 * side, origin.y - c * width / 2 * side,
    x + s * width / 2 * side, y - c * width / 2 * side, 1, P.danger, alpha);
  for (let d = 22; d < length; d += 28) {
    const px = origin.x + c * d, py = origin.y + s * d;
    ctx.beam(px - c * 7 - s * 4, py - s * 7 + c * 4, px, py, 1, P.fireOrange, alpha);
    ctx.beam(px - c * 7 + s * 4, py - s * 7 - c * 4, px, py, 1, P.fireOrange, alpha);
  }
}

function cone(ctx: PixelPainter, origin: Point, angle: number, alpha: number): void {
  const a = angle - BOSS.breath.arc / 2, b = angle + BOSS.breath.arc / 2;
  const points = [origin.x, origin.y];
  for (let i = 0; i <= 16; i++) {
    const v = a + (b - a) * i / 16;
    points.push(origin.x + Math.cos(v) * BOSS.breath.radius, origin.y + Math.sin(v) * BOSS.breath.radius);
  }
  ctx.polygon(points, P.fireDeep, alpha * 0.1);
  ctx.strokeStyle = P.fireOrange; ctx.globalAlpha = alpha;
  ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.lineTo(points[2], points[3]);
  ctx.arc(origin.x, origin.y, BOSS.breath.radius, a, b); ctx.lineTo(origin.x, origin.y); ctx.stroke(); ctx.globalAlpha = 1;
}

function fireStream(ctx: PixelPainter, origin: Point, angle: number, time: number, alpha: number): void {
  if (drawGeneratedBreath(ctx, origin, angle, time, alpha)) return;
  const radius = BOSS.breath.radius;
  for (let ray = -4; ray <= 4; ray++) {
    const a = angle + ray / 4 * BOSS.breath.arc * 0.42, c = Math.cos(a), s = Math.sin(a);
    for (let i = 0; i < 7; i++) {
      const progress = (i / 7 + time * 1.25 + noise(ray + 10) * 0.2) % 1;
      const d = 12 + progress * (radius - 28), w = 3 + progress * 10, len = 12 + progress * 13;
      const x = origin.x + c * d, y = origin.y + s * d;
      const bend = Math.sin(i * 3 + ray + time * 12) * w * 0.45;
      const points = [];
      // Broad irregular tongues, with split tips and stepped lobes rather than repeated arrows.
      for (const [along, across] of [[-len * 0.6, 0], [-len * 0.3, -w], [len * 0.35, -w * 0.7],
        [len, -w * 0.5 + bend], [len * 0.55, 0], [len * 0.9, w * 0.7 + bend], [0, w], [-len * 0.4, w * 0.5]])
        points.push(Math.round(x + c * along - s * across), Math.round(y + s * along + c * across));
      ctx.polygon(points, P.fireDeep, alpha * (0.3 + progress * 0.25));
      ctx.beam(x - c * len * 0.25, y - s * len * 0.25, x + c * len * 0.45 - s * bend,
        y + s * len * 0.45 + c * bend, Math.max(2, w * 0.6), P.fireOrange, alpha * 0.6);
      if ((i + ray) % 3 === 0) ctx.beam(x, y, x + c * 5, y + s * 5, 1, P.gold, alpha * 0.8);
    }
  }
}

function impactGround(ctx: PixelPainter, v: BossImpact, time: number): void {
  if (drawGeneratedImpact(ctx, v)) return;
  const k = 1 - sat(v.t / v.max), fade = sat(v.t / (v.max * 0.65));
  if (v.attack === "stomp" || v.attack === "charge") {
    ring(ctx, v.x, v.y, v.r * (0.3 + k * 0.7), P.pBrown, fade * 0.7, 2);
    ring(ctx, v.x, v.y, v.r * (0.2 + k * 0.6), P.sand, fade * 0.5);
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * TAU + noise(i) * 0.18, d = v.r * (0.35 + k * 0.65);
      const x = v.x + Math.cos(a) * d, y = v.y + Math.sin(a) * d;
      ctx.beam(v.x + Math.cos(a) * 18, v.y + Math.sin(a) * 18, x, y, 1, P.ink2, fade * 0.9);
      shard(ctx, x, y - Math.sin(k * Math.PI) * 8, 2, 4 + noise(i) * 5, a, fade * 0.7, true);
    }
  } else if (v.attack === "nova") {
    const r = v.innerR + (v.r - v.innerR) * Math.min(1, k * 3);
    ring(ctx, v.x, v.y, r, P.iceDeep, fade * 0.6, 3);
    ring(ctx, v.x, v.y, r - 2, P.iceCyan, fade * 0.8);
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * TAU;
      shard(ctx, v.x + Math.cos(a) * r, v.y + Math.sin(a) * r, 2, 7 + noise(i) * 8, a + Math.PI / 2, fade);
    }
  } else if (v.attack === "spikes") {
    const rise = Math.min(1, k * 7), fadeIce = Math.min(1, v.t / 0.28);
    ring(ctx, v.x, v.y, v.r, P.iceDeep, fadeIce * 0.35);
    for (let i = -1; i <= 1; i++) {
      shard(ctx, v.x + i * 12, v.y + Math.abs(i) * 4, 7 - Math.abs(i), (i === 0 ? 45 : 27) * rise,
        i * 0.25, fadeIce);
    }
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU, d = k * 35;
      shard(ctx, v.x + Math.cos(a) * d, v.y + Math.sin(a) * d - Math.sin(k * Math.PI) * 12, 1.5, 4, a, fade);
    }
  } else if (v.attack === "marks") {
    ring(ctx, v.x, v.y, v.r * (0.2 + Math.min(1, k * 4) * 0.8), P.iceCyan, fade * 0.75, 2);
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU + 0.4;
      ctx.beam(v.x + Math.cos(a) * 5, v.y + Math.sin(a) * 5,
        v.x + Math.cos(a) * v.r * (0.5 + k * 0.7), v.y + Math.sin(a) * v.r * (0.5 + k * 0.7), 1, P.fireYellow, fade);
    }
    if (k < 0.65) bolt(ctx, { x: v.x - 12, y: v.y - 170 }, v, time, fade, v.x);
  } else if (v.attack === "chain") {
    const end = { x: v.x + Math.cos(v.angle) * v.r, y: v.y + Math.sin(v.angle) * v.r };
    bolt(ctx, v, end, time, fade);
    if (v.points.length === 2) bolt(ctx, v.points[0], v.points[1], time, fade, 7);
  } else if (v.attack === "breath") fireStream(ctx, v, v.angle, time, fade);
}

export function drawBossWorld(core: BossView, ctx: PixelPainter): void {
  const s = core.bossState;
  if (!s || s.enemy.dead || core.state === "start" || core.state === "over") return;
  const e = s.enemy, t = core.time;
  for (const h of core.bossHazards) {
    if (h.source && !h.source.boss) continue;
    const fade = sat(h.t / 0.6), fire = h.kind === "fire";
    ring(ctx, h.x, h.y, h.r, fire ? P.fireDeep : P.iceDeep, fade * 0.45, 2);
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4, r = Math.sqrt(noise(i + h.x)) * (h.r - 4);
      const x = h.x + Math.cos(a) * r, y = h.y + Math.sin(a) * r;
      if (fire) {
        const k = (t * 2 + noise(i)) % 1, height = 4 + (1 - k) * 9;
        ctx.polygon([x - 3, y + 2, x - 1, y - height * 0.4, x + 1, y - height, x + 3, y + 1], P.fireDeep, fade * 0.55);
        ctx.beam(x, y, x + 1, y - height * 0.6, 1, i % 3 ? P.fireOrange : P.gold, fade * (1 - k) * 0.8);
      } else shard(ctx, x, y, 2, 3 + noise(i) * 5, a, fade * 0.45);
    }
  }
  for (const z of core.bossStrikes) {
    const progress = sat(1 - z.t / z.windup), color = z.type === "lightning" ? P.fireYellow : P.iceCyan;
    ring(ctx, z.x, z.y, z.r, color, 0.45 + progress * 0.3);
    if (z.innerR > 0) {
      ring(ctx, z.x, z.y, z.innerR, P.iceDeep, 0.75);
      ring(ctx, z.x, z.y, z.innerR + (z.r - z.innerR) * progress, color, 0.3);
    } else {
      ring(ctx, z.x, z.y, Math.max(2, z.r * (1 - progress)), color, 0.7);
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        ctx.beam(z.x + Math.cos(a) * (z.r - 6), z.y + Math.sin(a) * (z.r - 6),
          z.x + Math.cos(a) * (z.r + 3), z.y + Math.sin(a) * (z.r + 3), 1, color, 0.8);
      }
    }
  }
  if (s.action === "intro" || s.action === "transition") {
    const k = sat(1 - s.actionT / (s.action === "intro" ? BOSS.intro : BOSS.transition));
    ring(ctx, e.x, e.y, 24 + k * 90, BOSS_PHASES[s.phase].color, (1 - k) * 0.45);
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * TAU, r = 26 + k * 80;
      shard(ctx, e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, 2, 5, a, (1 - k) * 0.4, s.phase === 1);
    }
  }
  if (s.action === "windup" && s.attack) {
    const progress = sat(1 - s.actionT / BOSS_ATTACKS[s.attack].windup), alpha = 0.35 + progress * 0.4;
    if (s.attack === "stomp") {
      ring(ctx, e.x, e.y, BOSS_STOMP_RADIUS, P.danger, alpha);
      ring(ctx, e.x, e.y, BOSS_STOMP_RADIUS * progress, P.sand, alpha * 0.45);
    } else if (s.attack === "charge") lane(ctx,
      { x: e.x - Math.cos(s.angle) * e.r, y: e.y - Math.sin(s.angle) * e.r }, s.angle,
      BOSS.charge.speed * BOSS.charge.duration + e.r * 2, (e.r + core.player.r) * 2, alpha);
    else if (s.attack === "breath") cone(ctx, e, s.angle, alpha);
    else if (s.attack === "nova") {
      ring(ctx, e.x, e.y, BOSS.nova.innerRadius, P.iceDeep, alpha);
      ring(ctx, e.x, e.y, BOSS.nova.radius, P.iceCyan, alpha);
      ring(ctx, e.x, e.y, BOSS.nova.innerRadius + (BOSS.nova.radius - BOSS.nova.innerRadius) * progress, P.iceCyan, alpha * 0.4);
    } else if (s.attack === "chain") {
      const end = { x: e.x + Math.cos(s.angle) * BOSS.chain.length, y: e.y + Math.sin(s.angle) * BOSS.chain.length };
      ctx.beam(e.x, e.y, end.x, end.y, BOSS.chain.width, P.iceDeep, alpha * 0.12);
      ctx.beam(e.x, e.y, end.x, end.y, 1, P.iceCyan, alpha);
      for (const o of core.enemies) if (!o.dead && o.bossSummon && bossLineContains(e, s.angle, o, BOSS.chain.length, BOSS.chain.width + o.r * 2))
        ring(ctx, o.x, o.y, BOSS.chain.jumpRange, P.iceDeep, 0.4);
    }
  }
  for (const v of core.bossImpacts) {
    if (v.attack !== "breath" || s.action !== "cast") impactGround(ctx, v, t);
  }
  if (s.action === "cast" && s.attack === "breath") fireStream(ctx, e, s.angle, t, Math.min(1, s.actionT / 0.15));
  ctx.globalAlpha = 1;
}

export function drawAnimatedBoss(core: BossView, ctx: PixelPainter): boolean {
  const s = core.bossState;
  if (!s || s.enemy.dead || !ctx.hasTexture(BOSS_ATLAS)) return false;
  const e = s.enemy, pose = bossPose(s, core.time), color = BOSS_PHASES[s.phase].color;
  // Fixed anchor and integer placement; never resize each pose independently.
  const y = Math.round(e.y + (s.action === "chase" ? Math.sin(core.time * 14) > 0 ? 1 : 0 : 0));
  ctx.polygon([e.x - 27, e.y + 19, e.x - 19, e.y + 15, e.x + 20, e.y + 15,
    e.x + 29, e.y + 21, e.x + 18, e.y + 25, e.x - 19, e.y + 25], P.ink0, 0.4);
  if (s.action === "dash") for (let i = 3; i >= 1; i--) {
    ctx.globalAlpha = 0.16 - i * 0.035;
    ctx.spriteFrame(BOSS_ATLAS, pose, { x: Math.round(e.x - Math.cos(s.angle) * i * 14),
      y: Math.round(y - Math.sin(s.angle) * i * 14), angle: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 });
  }
  ctx.globalAlpha = 1;
  ctx.spriteFrame(BOSS_ATLAS, pose, { x: Math.round(e.x), y, angle: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 });
  const head = generatedBossHeadPosition(pose, s.phase - 1);
  const headX = e.x + head.x, headY = y + head.y;
  for (let i = 0; i < 5; i++) {
    const k = (core.time * 1.8 + i / 5) % 1;
    const a = i * 2.4 + core.time * 0.7;
    const x = headX + Math.cos(a) * (3 + k * 7), py = headY - k * 10;
    if (s.phase === 1) ctx.beam(x, py, x + 1, py - 3, 1, P.fireOrange, (1 - k) * 0.7);
    else if (s.phase === 2) shard(ctx, x, py, 1, 3, a, (1 - k) * 0.6);
    else if (i % 2 === 0) ctx.beam(headX, headY, x, py, 1, P.fireYellow, (1 - k) * 0.8);
  }
  if (e.flash > 0) {
    ctx.beam(e.x - 17, y - 22, e.x + 10, y - 24, 1, P.bone, 0.65);
    ctx.beam(e.x - 22, y - 19, e.x - 26, y - 10, 1, P.bone, 0.5);
  }
  const font = ctx.font, align = ctx.textAlign;
  ctx.font = '8px "Press Start 2P", monospace'; ctx.textAlign = "center";
  if (s.action === "stagger") { ctx.fillStyle = P.gold; ctx.fillText("硬直 · 易伤 +15%", e.x, y - BOSS_FRAME.height / 2 - 6); }
  else if (s.action === "windup" && s.attack) { ctx.fillStyle = color; ctx.fillText(BOSS_ATTACKS[s.attack].name, e.x, y - BOSS_FRAME.height / 2 - 6); }
  ctx.font = font; ctx.textAlign = align; ctx.globalAlpha = 1;
  return true;
}
