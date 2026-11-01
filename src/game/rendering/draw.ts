import { drawAnimatedBoss } from "./BossVfx";
import { bossSpriteKey, drawBossGround, drawBossHead, drawBossHud } from "./BossRenderer";
import { drawLaser, drawLaserResources } from "./LaserRenderer";
import { drawMissile, drawMissileGround, drawMissileResources } from "./MissileRenderer";
import type { GameCore } from "../core/GameCore";
import { drawIaiSpinSlash } from "./vfx/iaiSpinSlash";
import type { FloatingText } from "../core/types";
import type { PixelPainter } from "./PixelPainter";
import type { ShooterEchoDrawing } from "./characters/ShooterCharacter";
import type { MageVfx } from "./vfx/MageVfx";
import { W, H, VIEW, WORLD, fmtTime, fmtHp } from "../data/constants";
import { isBrittle, isFrostLocked, isFrozen, isParalyzed, isShocked } from "../core/ElementMath";
import { mageCircleRadius, mageWindup } from "../core/MageSystem";
import { ELEMENTAL_MAGE, MAGE_CASTS_PER_ELEMENT, MAGE_ELEMENTS, STAFF_LEVELS } from "../data/elementalMage";
import type { MageReactionId } from "../data/elementalMage";
import { warriorIaiStep } from "../core/WarriorSystem";
import { MAGE_BALANCE as MB } from "../data/mageBalance";
import {
  WARRIOR_BALANCE as WB,
  shieldRebuildSeconds,
  warriorTriDashCd,
} from "../data/warriorBalance";
import { getSpecialLevelStats } from "../data/specialShot";
import { TRUE_DAMAGE_OUTLINE } from "../core/CombatSystem";
import {
  BURROWER,
  CHARGER_CHARGE,
  DRUMMER_AURA,
  ELITE_AFFIX_INFO,
  ELITE_NOVA,
  WEB_ZONE,
} from "../data/enemies";
import { spriteEntry } from "./assetRegistry";
import { drawGreatswordSlash } from "./vfx/greatswordSlash";
import {
  drawGreatswordDashSlash,
  drawGreatswordWave,
} from "./vfx/greatswordEnergy";
import { drawGreatswordLeapImpact } from "./vfx/greatswordLeapImpact";
import {
  drawGreatswordLeapDescent,
  drawGreatswordLeapTelegraph,
  greatswordLeapPose,
} from "./vfx/greatswordLeapMotion";
import { drawKatanaDash, KATANA_DASH } from "./vfx/katanaDash";
function hash(x: number, y: number) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

interface FloatingTextSlotState {
  /** 每条飘字绑定的固定 label 槽位组；普通 2 层、真实 1 层、真实暴击 3 层 */
  slots: Map<FloatingText, number[]>;
  free: number[];
  next: number;
}
const FLOAT_TEXT_SLOTS = new WeakMap<GameCore, FloatingTextSlotState>();

function floatingTextSlots(core: GameCore): FloatingTextSlotState {
  let state = FLOAT_TEXT_SLOTS.get(core);
  if (!state) {
    state = { slots: new Map(), free: [], next: 0 };
    FLOAT_TEXT_SLOTS.set(core, state);
  }
  return state;
}

/**
 * 以逻辑贴图名取「纹理键 + 居中后的整数坐标 + 绘制尺寸」。
 *
 * 尺寸一律从贴图条目推导，不再硬编码偏移：程序化贴图与外部 PNG 尺寸不同时，
 * 硬编码的 -2 / -4 会直接错位。scale 用于精英的放大需求（有独立贴图时传 1）。
 */
function spriteRect(key: string, cx: number, cy: number, scale = 1) {
  const entry = spriteEntry(key);
  if (!entry) return null;
  const w = Math.round(entry.w * scale);
  const h = Math.round(entry.h * scale);
  return {
    tex: entry.tex,
    x: Math.round(cx - w / 2),
    y: Math.round(cy - h / 2),
    w,
    h,
  };
}

type CharacterDrawing = (x: number, y: number) => boolean;

/** 六反应飘字配色：前元素外圈 → 反应强调色内圈 → 后元素主体。 */
const REACTION_TEXT: Record<
  MageReactionId,
  { outer: string; accent: string; top: string }
> = {
  quench: { outer: "#ff9a3d", accent: "#e8f7ff", top: "#9fe1ff" },
  melt: { outer: "#9fe1ff", accent: "#ffd24a", top: "#ff9a3d" },
  overload: { outer: "#ff9a3d", accent: "#ffd24a", top: "#c07bff" },
  blaze: { outer: "#c07bff", accent: "#ffd24a", top: "#ff6a2b" },
  superconduct: { outer: "#9fe1ff", accent: "#e8f7ff", top: "#c07bff" },
  frostbind: { outer: "#c07bff", accent: "#e8f7ff", top: "#57e6ff" },
};

function drawPlayerSprite(ctx: PixelPainter, character: CharacterDrawing | undefined, x: number, y: number) {
  if (character?.(x, y)) return;
  const rect = spriteRect("player", x, y);
  if (rect) ctx.sprite(rect.tex, rect.x, rect.y, rect.w, rect.h);
}

/**
 * 冻结冰壳：低饱和青蓝冰面 + 顶部冷光 + 底部冰棱 + 侧面霜点。
 *
 * 不用整圈矩形描边与折线裂纹——小怪会被框成一个 UI 方框，很像“选中框”。
 * 冻结状态靠冰面染色、底部冰棱和霜点表达，保留贴图轮廓。
 */
function drawFrozenOverlay(
  ctx: PixelPainter,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  // 冰面：低透明度，保留贴图细节
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = "#9fe1ff";
  ctx.fillRect(x, y, w, h);
  // 顶部冷光：一条细高光 + 左上小霜点
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = "#e8f7ff";
  ctx.fillRect(x + 1, y, Math.max(1, w - 2), 1);
  ctx.fillRect(x + 2, y + 2, 2, 1);
  // 底部冰棱：三根短刺，中间略高
  const mid = x + Math.floor(w / 2);
  const baseY = y + h;
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = "#bfeaff";
  ctx.fillRect(x + 1, baseY, 1, 2);
  ctx.fillRect(mid, baseY, 1, 3);
  ctx.fillRect(x + w - 2, baseY, 1, 2);
  ctx.fillStyle = "#e8f7ff";
  ctx.fillRect(x + 1, baseY, 1, 1);
  ctx.fillRect(mid, baseY, 1, 1);
  ctx.fillRect(x + w - 2, baseY, 1, 1);
  // 两侧霜点
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = "#e8f7ff";
  ctx.fillRect(x, y + Math.floor(h / 2), 1, 1);
  ctx.fillRect(x + w - 1, y + Math.floor(h / 2) - 1, 1, 1);
  ctx.globalAlpha = 1;
}
/**
 * 战士「流 / 势」的分段充能条：固定 3 段，每段代表 5 层。
 *
 * 为什么固定 3 段而不是按当前上限画：只解锁 L1（上限 5 层）时也要保持 3 段，
 * 未解锁的段压暗——这样升级是「点亮下一段」，布局不跳动，
 * 玩家也一眼能看出还有几段没解锁。
 *
 * 段内按 5 层等分填充（每层 = 20% 段宽），所以流的每次命中、势的每段移动
 * 都表现为「条子在长」，而不是离散地跳一格。
 */
const CHARGE_SEG_W = 10;
const CHARGE_SEG_H = 3;
const CHARGE_SEG_GAP = 2;
const CHARGE_SEG_COUNT = 3;
const CHARGE_PER_SEG = 5;
const CHARGE_BAR_W =
  CHARGE_SEG_COUNT * CHARGE_SEG_W + (CHARGE_SEG_COUNT - 1) * CHARGE_SEG_GAP;

function drawChargeBar(
  ctx: PixelPainter,
  cx: number,
  y: number,
  cap: number,
  value: number,
  fill: string,
  fillFull: string,
  perSeg = CHARGE_PER_SEG,
  dimLocked = true,
) {
  const left = Math.round(cx - CHARGE_BAR_W / 2);
  for (let i = 0; i < CHARGE_SEG_COUNT; i++) {
    const x = left + i * (CHARGE_SEG_W + CHARGE_SEG_GAP);
    const segFloor = i * perSeg;
    const unlocked = !dimLocked || cap > segFloor;
    // 槽底：已解锁的段明显一档；未解锁的压暗但保留轮廓，
    // 让玩家能看出「还有几段没解锁」（初版 #0e1220 几乎融进背景，看不出形状）
    ctx.fillStyle = unlocked ? "#2b3a66" : "#171d30";
    ctx.fillRect(x, y, CHARGE_SEG_W, CHARGE_SEG_H);
    if (!unlocked) continue;
    const filled = Math.max(0, Math.min(perSeg, value - segFloor));
    if (filled <= 0) continue;
    const w = Math.max(1, Math.round((CHARGE_SEG_W * filled) / perSeg));
    ctx.fillStyle = filled >= perSeg - 1e-9 ? fillFull : fill;
    ctx.fillRect(x, y, w, CHARGE_SEG_H);
  }
}

export function draw(this: GameCore, ctx: PixelPainter, laserAnimation?: () => boolean, character?: CharacterDrawing,
  shooterWeapon?: () => void, shooterEcho?: ShooterEchoDrawing, mageVfx?: MageVfx) {
  const TS = 16,
    tw = WORLD.w / TS,
    th = WORLD.h / TS;

  const cx = this.cam.x,
    cy = this.cam.y;

  // 虚空背景 (边界外)
  ctx.fillStyle = "#07080f";
  ctx.fillRect(cx - 8, cy - 8, VIEW.w + 16, VIEW.h + 16);

  // 地面
  const t0x = Math.floor(cx / TS),
    t0y = Math.floor(cy / TS);
  for (
    let ty = Math.max(0, t0y);
    ty <= Math.min(th - 1, t0y + VIEW.h / TS + 1);
    ty++
  ) {
    for (
      let tx = Math.max(0, t0x);
      tx <= Math.min(tw - 1, t0x + VIEW.w / TS + 1);
      tx++
    ) {
      const px = tx * TS,
        py = ty * TS;
      // 边界墙 (最外圈是砖墙)
      if (tx < 1 || ty < 1 || tx >= tw - 1 || ty >= th - 1) {
        ctx.fillStyle = "#232842";
        ctx.fillRect(px, py, TS, TS);
        ctx.fillStyle = "#181c30";
        ctx.fillRect(px, py + 7, TS, 2);
        ctx.fillRect(px + (ty % 2 === 0 ? 7 : 11), py, 2, 7);
        ctx.fillRect(px + (ty % 2 === 0 ? 11 : 7), py + 9, 2, 7);
        ctx.fillStyle = "#343b58";
        ctx.fillRect(px, py, TS, 1);
        continue;
      }
      ctx.fillStyle = (tx + ty) % 2 === 0 ? "#1a1c2c" : "#1d2033";
      ctx.fillRect(px, py, TS, TS);
      const h = hash(tx, ty);
      if (h < 0.05) {
        ctx.fillStyle = "#2a3a52";
        ctx.fillRect(px + 5, py + 11, 1, 3);
        ctx.fillRect(px + 8, py + 10, 1, 4);
        ctx.fillRect(px + 11, py + 12, 1, 2);
      } else if (h > 0.985) {
        ctx.fillStyle = "#343b58";
        ctx.fillRect(px + 6, py + 7, 4, 3);
        ctx.fillStyle = "#3f4768";
        ctx.fillRect(px + 7, py + 7, 2, 1);
      }
    }
  }

  // 宝石 & 药水
  for (const g of this.gems) {
    const bob = Math.sin(this.time * 5 + g.x) * 1;
    // 精英宝石: 金色大颗
    const rect = spriteRect(g.e ? "gemE" : "gem", g.x, g.y + bob, g.e ? 1.8 : 1);
    if (rect) ctx.sprite(rect.tex, rect.x, rect.y, rect.w, rect.h);
  }
  for (const o of this.potions) {
    const rect = spriteRect("potion", o.x, o.y);
    if (rect) ctx.sprite(rect.tex, rect.x, rect.y, rect.w, rect.h);
  }
  // 成长徽记 / 普通宝箱（波次结束后会自动飞向玩家）
  for (const b of this.boxes) {
    const bob = Math.sin(this.time * 4 + b.x) * 1.2;
    const token = b.kind === "token";
    const rect = spriteRect(token ? "sigil" : "box", b.x, b.y + bob);
    if (rect) ctx.sprite(rect.tex, rect.x, rect.y, rect.w, rect.h);
  }

  drawMissileGround(this, ctx);
  // Issue #45：焦土燃烧地带
  for (const z of this.burnZones) {
    ctx.globalAlpha = 0.22 + Math.sin(this.time * 6) * 0.08;
    ctx.fillStyle = "#ff6a2b";
    ctx.beginPath();
    ctx.arc(Math.round(z.x), Math.round(z.y), z.R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillRect(Math.round(z.x - 3), Math.round(z.y - 3), 6, 6);
    ctx.globalAlpha = 1;
  }

  // 织网蛛蛛网：预警时金色圈收缩，生效后画白色网纹；网只减速，不造成伤害。
  drawBossGround(this, ctx);
  for (const z of this.webZones) {
    if (z.arm > 0) {
      const k = 1 - z.arm / WEB_ZONE.arm;
      ctx.globalAlpha = 0.45 + Math.sin(this.time * 18) * 0.2;
      ctx.strokeStyle = "#ffd24a";
      ctx.beginPath();
      ctx.arc(Math.round(z.x), Math.round(z.y), z.R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(
        Math.round(z.x),
        Math.round(z.y),
        Math.max(2, z.R * k),
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      // 生效后的网压低对比：多张网叠加时不能盖住角色和弹幕，
      // 外圈 + 内圈负责读出减速范围，辐条只画外段避免中心糊成一团。
      const pulse = Math.sin(this.time * 3 + z.x) * 0.02;
      ctx.globalAlpha = 0.16 + pulse;
      ctx.strokeStyle = "#8ea6cc";
      ctx.beginPath();
      ctx.arc(Math.round(z.x), Math.round(z.y), z.R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.1 + pulse;
      ctx.beginPath();
      ctx.arc(
        Math.round(z.x),
        Math.round(z.y),
        Math.round(z.R * 0.55),
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.moveTo(
          Math.round(z.x + Math.cos(a) * z.R * 0.3),
          Math.round(z.y + Math.sin(a) * z.R * 0.3),
        );
        ctx.lineTo(
          Math.round(z.x + Math.cos(a) * z.R * 0.92),
          Math.round(z.y + Math.sin(a) * z.R * 0.92),
        );
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // 陨星预告（#112）：圆环与十字合并为一次 lineStyle + strokePath。
  // 原先每个陨石要 2 次 beginPath + 2 次 strokePath，多个陨石时反复打断批次。
  if (this.meteors.length) {
    const rings: number[] = [];
    for (const m of this.meteors)
      rings.push(
        Math.round(m.x),
        Math.round(m.y),
        Math.round((m.R * m.t) / 0.8 + 8),
      );
    ctx.meteorRing(rings, "#ff5b5b", 0.5 + Math.sin(this.time * 20) * 0.3);
    // 坠落中的陨星小块
    for (const m of this.meteors) {
      if (m.t >= 0.3) continue;
      ctx.fillStyle = "#ff9a3d";
      ctx.fillRect(m.x + m.t * 120, m.y - m.t * 300 - 40, 3, 6);
    }
  }

  // ---- S3 法师：法阵（施法落点）----
  // 抬手段是半透明圆环（可被打断），收束段更亮（已经成形、不可打断）。
  // v163 移除站定后圆环保持紫色，不再随移动状态变色。
  if (
    this.prof === "mage" &&
    (this.castPhase === "windup" || this.castPhase === "cast")
  ) {
    // 预览圈与实际半径一致（法阵扩幅/广域符印都在 mageCircleRadius 内结算）。
    const R = Math.round(mageCircleRadius(this));
    const total = Math.max(0.001, mageWindup(this));
    const castPart = total * (1 - MB.castWindupInterruptible / MB.castWindup);
    const remain =
      this.castPhase === "windup" ? this.castT + castPart : this.castT;
    const prog = Math.max(0, Math.min(1, 1 - remain / total));
    // v80：法阵预览从中心缓动扩大，避免整圈突然出现；结束时正好等于实际半径。
    const grow = 1 - (1 - prog) * (1 - prog);
    const drawR = Math.max(1, Math.round(R * grow));
    const castEl = this.mageElements.length
      ? this.mageElements[this.mageWheelIndex % this.mageElements.length]
      : null;
    // 新素材法阵贴图垫在程序化范围圈下方；缺图时 MageVfx 内部返回 false。
    mageVfx?.drawCast(ctx, this.castX, this.castY, R, prog, castEl);
    // 透明度随进度缓慢加深，避免 windup→cast 切换时整圈闪一下。
    ctx.globalAlpha = 0.2 + 0.3 * prog;
    ctx.strokeStyle = "#c07bff";
    ctx.beginPath();
    ctx.arc(
      Math.round(this.castX),
      Math.round(this.castY),
      drawR,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.fillStyle = "#7a4fd0";
    ctx.fillRect(Math.round(this.castX - 2), Math.round(this.castY - 2), 4, 4);
    ctx.globalAlpha = 1;
  }
  // 法师：脚下施法条（常驻，18px 与法杖经验条等长，3px 高度沿用原读条）。
  // 顺序（自上而下）：冲刺点 → 施法条 → 法杖经验条 → 三格元素轮盘。
  // v163 移除站定后不再画急停线，条只表示本次施法进度。
  if (
    this.prof === "mage" &&
    this.state === "play" &&
    this.wavePhase === "fight"
  ) {
    const casting = this.castPhase === "windup" || this.castPhase === "cast";
    let prog = 0;
    if (casting) {
      const total = Math.max(0.001, mageWindup(this));
      const castPart = total * (1 - MB.castWindupInterruptible / MB.castWindup);
      const remain =
        this.castPhase === "windup" ? this.castT + castPart : this.castT;
      prog = Math.max(0, Math.min(1, 1 - remain / total));
    }
    const bw = 18;
    // 与经验条同一取整基准（偶数宽，不会出现半像素横移抖动）。
    const bx = Math.round(this.player.x - bw / 2);
    const by = Math.round(this.player.y) + 16;
    // v165：去掉 3px 半透明外框，只留 1px 底槽与进度线。
    ctx.fillStyle = "#1d2440";
    ctx.fillRect(bx, by, bw, 1);
    if (prog > 0) {
      ctx.fillStyle = "#57e6ff";
      ctx.fillRect(bx, by, Math.max(1, Math.round(bw * prog)), 1);
    }
  }
  // ---- 法师：镜像残影（吸引仇恨的诱饵）----
  // 用玩家的贴图半透明绘制，读作「一个假体」；缺贴图时退回紫色方块。
  for (const d of this.mageDecoys) {
    const r = spriteRect("player", d.x, d.y);
    ctx.globalAlpha = 0.45;
    if (r) ctx.sprite(r.tex, r.x, r.y, r.w, r.h);
    else {
      ctx.fillStyle = "#c07bff";
      ctx.fillRect(Math.round(d.x - 4), Math.round(d.y - 6), 8, 10);
    }
    ctx.globalAlpha = 1;
  }

  // 大剑落地尘环贴地，置于敌人与玩家下层；缺图时沿用扩散环。
  if (this.warriorLeapState) drawGreatswordLeapTelegraph(ctx, this.warriorLeapState);
  for (const s of this.slashes) {
    if (s.weapon !== "greatsword" || !s.impact) continue;
    if (drawGreatswordLeapImpact(ctx, s)) continue;
    const k = Math.max(0, s.life / s.max);
    const grow = 1 + (1 - k) * 0.18;
    for (let i = 0; i < 3; i++) {
      const r = (s.r - i * 4) * grow;
      if (r <= 2) continue;
      ctx.globalAlpha = k * (i === 0 ? 0.9 : i === 1 ? 0.5 : 0.28);
      ctx.strokeStyle = i === 0 ? "#ffffff" : s.c;
      ctx.beginPath();
      ctx.arc(Math.round(s.x), Math.round(s.y), r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // 法师：回响法阵的延迟第二击（地面淡环，出伤前提示）
  for (const echo of this.mageEchoes) {
    const k = Math.max(0, Math.min(1, 1 - echo.t / echo.maxT));
    ctx.globalAlpha = 0.16 + k * 0.28;
    ctx.strokeStyle = MAGE_ELEMENTS[echo.element].color;
    ctx.beginPath();
    ctx.arc(
      Math.round(echo.x),
      Math.round(echo.y),
      Math.max(1, Math.round(echo.R * (0.55 + 0.45 * k))),
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 法师：棱镜折射的纯表现光束（先画在角色/敌人下层）
  // A 套装两条（分裂到两个目标点），B 套装一条（集中主落点），让特化一眼可辨。
  // 外圈用棱镜记录的旧元素、内芯用本次施法元素：水晶记的是「冰」，
  // 折射结算的是「火」时，冰色外晕 + 火色核心直接读作「冰→火」。
  for (const beam of this.magePrismBeams) {
    const k = Math.max(0, Math.min(1, beam.t / beam.maxT));
    const color = MAGE_ELEMENTS[beam.element].color;
    const storedColor = MAGE_ELEMENTS[beam.stored].color;
    const bx = Math.round(beam.x);
    const by = Math.round(beam.y) - 24;
    for (const point of beam.points) {
      const tx = Math.round(point.x);
      const ty = Math.round(point.y);
      // 外圈旧元素占主导，内芯当前元素较细：冰→火时先读成冰蓝光束、再看到火色核心
      ctx.beam(bx, by, tx, ty, 4, storedColor, 0.3 + k * 0.35);
      ctx.beam(bx, by, tx, ty, 2, color, 0.22 + k * 0.38);
      ctx.beam(bx, by, tx, ty, 1, "#f4fbff", 0.25 + k * 0.55);
      // 棱镜处的记录元素环：说明光束的来源元素
      ctx.globalAlpha = 0.25 + k * 0.35;

      ctx.strokeStyle = storedColor;
      ctx.beginPath();
      ctx.arc(bx, by, Math.round(5 + (1 - k) * 6), 0, Math.PI * 2);
      ctx.stroke();
      // 命中闪光：扩张环 + 十字（按本次结算元素）
      ctx.globalAlpha = 0.35 + k * 0.65;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(tx, ty, Math.round(3 + (1 - k) * 9), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(tx - 2, ty, 4, 1);
      ctx.fillRect(tx, ty - 2, 1, 4);
      ctx.fillRect(tx - 1, ty - 1, 2, 2);
      ctx.globalAlpha = 1;
    }
  }

  // 法师：元素棱镜（新素材垫底；缺图时由下方程序化水晶回退）
  if (this.magePrism) {
    const prism = this.magePrism;
    const assetPrism = mageVfx?.drawPrism(ctx, prism) ?? false;
    const color = MAGE_ELEMENTS[prism.element].color;
    const px = Math.round(prism.x);
    const py = Math.round(prism.y);
    const bob = Math.round(Math.sin(this.time * 3 + prism.x * 0.05));
    const pulse = 0.5 + Math.sin(this.time * 5) * 0.5;
    // 地面法环：短刻线随剩余时间缩短，避免整圈圆形读成敌方预警圈
    const life = Math.max(0, prism.t / prism.maxT);
    ctx.globalAlpha = 0.1 + pulse * 0.05;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.4;
    const rot = this.time * 1.8;
    for (let i = 0; i < 3; i++) {
      const a0 = rot + (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(px, py, 8, a0, a0 + 0.9 * life);
      ctx.stroke();
    }

    // 悬浮水晶（12×12）：暗轮廓 + 元素色晶面 + 左上高光 + 右下暗面 + 白芯
    const cx = px;
    const cy = py - 16 + bob;
    const rows = [
      [-6, 2],
      [-5, 4],
      [-4, 6],
      [-3, 8],
      [-2, 10],
      [-1, 12],
      [0, 12],
      [1, 10],
      [2, 8],
      [3, 6],
      [4, 4],
      [5, 2],
    ] as const;
    // 地面投影与悬浮光柱
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = "#10131f";
    ctx.fillRect(px - 2, py + 2, 5, 1);
    ctx.globalAlpha = 0.14 + pulse * 0.06;
    ctx.fillStyle = color;
    ctx.fillRect(cx, cy + 6, 1, py - cy - 5);
    ctx.globalAlpha = 0.12 + pulse * 0.08;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.stroke();
    // 新素材已画出水晶时不再叠程序化水晶；缺图才回退。
    if (!assetPrism) {
      // 外轮廓
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = "#0b0e18";
      for (const [dy, w] of rows)
        ctx.fillRect(cx - Math.floor(w / 2), cy + dy, w, 1);
      // 元素色晶面
      ctx.fillStyle = color;
      for (const [dy, w] of rows)
        if (w > 2) ctx.fillRect(cx - Math.floor(w / 2) + 1, cy + dy, w - 2, 1);
      // 左上高光
      ctx.fillStyle = "#f4fbff";
      ctx.globalAlpha = 0.9;
      ctx.fillRect(cx - 1, cy - 5, 1, 1);
      ctx.fillRect(cx - 2, cy - 4, 1, 1);
      ctx.fillRect(cx - 3, cy - 3, 1, 1);
      ctx.fillRect(cx - 4, cy - 2, 1, 1);
      ctx.fillRect(cx - 5, cy - 1, 1, 1);
      // 右下暗面
      ctx.fillStyle = "#0b0e18";
      ctx.globalAlpha = 0.32;
      ctx.fillRect(cx + 2, cy - 1, 4, 2);
      ctx.fillRect(cx + 1, cy + 1, 3, 1);
      // 白芯
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = 0.7 + pulse * 0.3;
      ctx.fillRect(cx - 1, cy, 2, 1);
      // 环绕的星点
      const sparkX = cx + Math.round(Math.cos(this.time * 2.2) * 8);
      const sparkY = cy + Math.round(Math.sin(this.time * 2.2) * 7);
      ctx.fillRect(sparkX, sparkY, 1, 1);
      ctx.globalAlpha = 0.25 + pulse * 0.25;
      ctx.fillRect(sparkX - 1, sparkY, 3, 1);
      ctx.fillRect(sparkX, sparkY - 1, 1, 3);
    }
    // 剩余折射次数
    const pipX = px - Math.floor((prism.charges * 4 - 2) / 2);
    for (let i = 0; i < prism.charges; i++) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#10131f";
      ctx.fillRect(pipX + i * 4 - 1, py + 4, 4, 4);
      ctx.fillStyle = color;
      ctx.fillRect(pipX + i * 4, py + 5, 2, 2);
    }
    ctx.globalAlpha = 1;
  }
  mageVfx?.drawImpacts(ctx);

  // 法师：分影齐射的左右残影（半透明本体 + 元素色环，不参与碰撞）
  for (const shadow of this.mageShadows) {
    const sx = Math.round(
      this.player.x + shadow.side * ELEMENTAL_MAGE.shadow.offset,
    );
    const sy = Math.round(this.player.y);
    const r = spriteRect("player", sx, sy);
    ctx.globalAlpha = 0.32 + (shadow.t / shadow.maxT) * 0.18;
    if (r) ctx.sprite(r.tex, r.x, r.y, r.w, r.h);
    else {
      ctx.fillStyle = MAGE_ELEMENTS[shadow.element].color;
      ctx.fillRect(sx - 4, sy - 6, 8, 10);
    }
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = MAGE_ELEMENTS[shadow.element].color;
    ctx.beginPath();
    ctx.arc(sx, sy, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // 敌人
  for (const e of this.enemies) {
    if (e.boss && drawAnimatedBoss(this, ctx)) continue;
    // 精英优先用独立贴图；没有时退回「同系列贴图 ×1.8」。
    // 命名统一为 `${spr}_elite`，与 sprites.ts 的注册键一致（如 brute_elite）。
    const eliteKey = `${e.spr}_elite`;
    const eliteEntry = e.elite ? spriteEntry(eliteKey) : undefined;
    // 火囊虫引爆时胀大，是「要炸了」的第一重信号
    const puff = e.type === "bomber" && e.fuse > 0 ? 1.35 : 1;
    const rect = eliteEntry
      ? spriteRect(eliteKey, e.x, e.y, puff)
      : spriteRect(e.boss ? bossSpriteKey(this) : e.spr, e.x, e.y, (e.elite ? 1.8 : 1) * puff);
    if (!rect) continue;
    const { x, y, w, h } = rect;
    const burrowHidden =
      e.type === "burrower" && e.burrowState === "under";
    // 冰冻染色
    if (e.slowT > 0) ctx.globalAlpha = 0.9;
    if (e.type === "burrower" && e.burrowState === "dive") ctx.globalAlpha = 0.55;
    if (burrowHidden) {
      // 地下只剩土丘、两只前爪与复眼；贴图不画，但敌人实体仍在场上（可被范围伤害命中）。
      ctx.fillStyle = "#5a3a20";
      ctx.fillRect(Math.round(e.x - 8), Math.round(e.y - 3), 16, 6);
      ctx.fillStyle = "#3a1a0a";
      ctx.fillRect(Math.round(e.x - 5), Math.round(e.y - 2), 10, 2);
      ctx.fillStyle = "#e8e8f0";
      ctx.fillRect(Math.round(e.x - 8), Math.round(e.y + 1), 3, 2);
      ctx.fillRect(Math.round(e.x + 5), Math.round(e.y + 1), 3, 2);
      ctx.fillStyle = "#ffd24a";
      ctx.fillRect(Math.round(e.x - 2), Math.round(e.y - 1), 2, 2);
      ctx.fillRect(Math.round(e.x + 2), Math.round(e.y - 1), 2, 2);
      ctx.globalAlpha = 0.35 + Math.sin(this.time * 8 + e.seed) * 0.12;
      ctx.strokeStyle = "#8a5a30";
      ctx.beginPath();
      ctx.arc(Math.round(e.x), Math.round(e.y), 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      ctx.sprite(rect.tex, x, y, w, h);
      if (e.boss) drawBossHead(this, ctx);
    }
    if (e.type === "burrower" && e.burrowState === "dive")
      ctx.globalAlpha = 1;

    if (e.slowT > 0) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#57e6ff";
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    }
    // Issue #38：冰冻泛蓝（旧表 frozenT 与法师冻结统一由下方冰壳表现）
    // S3 法师：元素印记染色。层数只体现在浓度上（§3.6：不做逐层特效，
    // 只在关键节点给反馈），冰/雷/火三色互斥，先判定顺序即显示优先级。
    if (e.elemFire?.length) {
      ctx.globalAlpha = Math.min(0.55, 0.18 + e.elemFire.length * 0.1);
      ctx.fillStyle = "#ff6a2b";
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    }
    if (e.elemFrost?.length) {
      ctx.globalAlpha = Math.min(0.5, 0.16 + e.elemFrost.length * 0.11);
      ctx.fillStyle = "#9fe1ff";
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    }
    // 冻结冰壳（旧 frozenT 与法师冻结共用，替代「冻结」飘字）
    if (e.frozenT > 0 || isFrozen(e))
      drawFrozenOverlay(ctx, x, y, w, h);
    // 霜牢：比冻结更重的冰壳 + 深蓝外框，表示锚定且优先级更高。
    if (isFrostLocked(e)) {
      drawFrozenOverlay(ctx, x, y, w, h);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "#57e6ff";
      ctx.fillRect(x - 1, y - 1, w + 2, 1);
      ctx.fillRect(x - 1, y + h, w + 2, 1);
      ctx.fillRect(x - 1, y, 1, h);
      ctx.fillRect(x + w, y, 1, h);
      ctx.globalAlpha = 1;
    }
    if (isParalyzed(e)) {
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = "#c07bff";
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    }
    // 雷印：紫色电弧点；脆化：淡金裂纹色。都只做低强度提示，不遮挡血条。
    if (isShocked(e)) {
      ctx.globalAlpha = 0.35 + Math.sin(this.time * 18 + e.seed) * 0.12;
      ctx.fillStyle = "#d9a6ff";
      ctx.fillRect(x + 1, y - 1, Math.max(1, w - 2), 1);
      ctx.globalAlpha = 1;
    }
    if (isBrittle(e)) {
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#ffd24a";
      ctx.fillRect(x, y, w, 1);
      ctx.fillRect(x, y + h - 1, w, 1);
      ctx.globalAlpha = 1;
    }
    mageVfx?.drawEnemy(ctx, e, w, h);
    if (e.flash > 0) {
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    }
    // 火囊虫引爆预警：本体泛白高频交替（约 10Hz）+ 地面红色范围圈
    if (e.type === "bomber" && e.fuse > 0) {
      if (Math.sin(this.time * 62) > 0) {
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = "#ffb3ab";
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 1;
      }
      // 圈半径从 0 扩张到真实爆炸半径（与结算判定 38 + player.r 一致）
      const blast = 38 + this.player.r;
      const grow = 1 - Math.max(0, e.fuse) / 0.5;
      ctx.globalAlpha = 0.4 + Math.sin(this.time * 30) * 0.2;
      ctx.strokeStyle = "#ff3b30";
      ctx.beginPath();
      ctx.arc(
        Math.round(e.x),
        Math.round(e.y),
        Math.max(2, blast * grow),
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 战鼓手光环：外圈只画细线表示 120px 生效范围，近身脉冲圈表示鼓点。
    if (e.type === "drummer") {
      ctx.globalAlpha = 0.06 + (Math.sin(this.time * 4 + e.seed * 9) + 1) * 0.02;
      ctx.strokeStyle = "#ffd24a";
      ctx.beginPath();
      ctx.arc(
        Math.round(e.x),
        Math.round(e.y),
        DRUMMER_AURA.radius,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.globalAlpha = 0.35 + Math.sin(this.time * 6 + e.seed) * 0.15;
      ctx.beginPath();
      ctx.arc(
        Math.round(e.x),
        Math.round(e.y),
        12 + Math.sin(this.time * 6 + e.seed) * 2,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 掘地虫钻出预警：地面收缩圈，结束后才恢复接触伤害。
    if (e.type === "burrower" && e.burrowState === "surface") {
      const k = 1 - (e.burrowT ?? 0) / BURROWER.surface;
      ctx.globalAlpha = 0.5 + Math.sin(this.time * 20) * 0.2;
      ctx.strokeStyle = "#ffd24a";
      ctx.beginPath();
      ctx.arc(Math.round(e.x), Math.round(e.y), 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(
        Math.round(e.x),
        Math.round(e.y),
        Math.max(2, 24 * k),
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 角兽冲锋表现：预警线锁定方向，冲刺时留金色速度线，撞墙后头顶转星。
    if (e.type === "charger" && e.chargeState) {
      const dx = e.chargeDx ?? 0;
      const dy = e.chargeDy ?? 0;
      if (e.chargeState === "windup") {
        const len = CHARGER_CHARGE.distance;
        const tipX = e.x + dx * len;
        const tipY = e.y + dy * len;
        ctx.globalAlpha = 0.35 + Math.sin(this.time * 18) * 0.15;
        ctx.strokeStyle = "#ff3b30";
        ctx.beginPath();
        ctx.moveTo(Math.round(e.x), Math.round(e.y));
        ctx.lineTo(Math.round(tipX), Math.round(tipY));
        ctx.stroke();
        const px = -dy;
        const py = dx;
        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = "#ff3b30";
        ctx.beginPath();
        ctx.moveTo(Math.round(tipX), Math.round(tipY));
        ctx.lineTo(
          Math.round(tipX - dx * 7 + px * 3),
          Math.round(tipY - dy * 7 + py * 3),
        );
        ctx.moveTo(Math.round(tipX), Math.round(tipY));
        ctx.lineTo(
          Math.round(tipX - dx * 7 - px * 3),
          Math.round(tipY - dy * 7 - py * 3),
        );
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (e.chargeState === "dash") {
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = "#ffd24a";
        for (let i = 1; i <= 3; i++) {
          ctx.beginPath();
          ctx.moveTo(
            Math.round(e.x - dx * i * 5),
            Math.round(e.y - dy * i * 5),
          );
          ctx.lineTo(
            Math.round(e.x - dx * (i * 5 + 4)),
            Math.round(e.y - dy * (i * 5 + 4)),
          );
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else if (e.chargeState === "stun") {
        ctx.fillStyle = "#ffd24a";
        for (let i = 0; i < 3; i++) {
          const a = this.time * 4 + (i * Math.PI * 2) / 3;
          ctx.fillRect(
            Math.round(e.x + Math.cos(a) * 7),
            Math.round(e.y - e.r - 8 + Math.sin(a) * 2),
            2,
            2,
          );
        }
      }
    }
    // v128 三段斩震地眩晕：与角兽撞墙共用转星读法。
    if ((e.stunT ?? 0) > 0 && e.chargeState !== "stun") {
      ctx.fillStyle = "#ffd24a";
      for (let i = 0; i < 3; i++) {
        const a = this.time * 4 + (i * Math.PI * 2) / 3;
        ctx.fillRect(
          Math.round(e.x + Math.cos(a) * 7),
          Math.round(e.y - e.r - 8 + Math.sin(a) * 2),
          2,
          2,
        );
      }
    }
    if (e.elite) {
      ctx.fillStyle = "#3a0d0d";
      ctx.fillRect(x, y - 4, w, 2);
      ctx.fillStyle = "#ff5b5b";
      ctx.fillRect(x, y - 4, (w * e.hp) / e.maxhp, 2);
    }
    if (e.elite && e.affix) {
      ctx.fillStyle = ELITE_AFFIX_INFO[e.affix].color;
      const mx = Math.round(e.x);
      const my = Math.round(y - 8);
      ctx.fillRect(mx - 2, my, 5, 2);
      ctx.fillRect(mx, my - 2, 2, 5);
    }
    if (e.elite && e.affix === "nova" && (e.novaT ?? 0) > 0) {
      const cx = Math.round(e.x);
      const cy = Math.round(e.y);
      const k = 1 - (e.novaT ?? 0) / ELITE_NOVA.windup;
      const urgent = (e.novaT ?? 0) < 0.18;
      // 只保留两层低饱和蓝灰线：外圈固定为真实命中半径，内圈随蓄力扩张；
      // 不填充、不用白色高亮，保证看得清但不抢战场。
      ctx.globalAlpha = urgent ? 0.8 : 0.55 + Math.sin(this.time * 20) * 0.08;
      ctx.strokeStyle = urgent ? "#bcd8e6" : "#7fa8c0";
      ctx.beginPath();
      ctx.arc(cx, cy, ELITE_NOVA.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, ELITE_NOVA.radius - 1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = urgent ? 0.65 : 0.32 + k * 0.25;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(2, ELITE_NOVA.radius * k), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // 剑气/裂地：脱离角色的移动波面（素材由 GameScene 预载）。
  if (this.warriorWaves.length) {
    for (const w of this.warriorWaves) {
      drawGreatswordWave(ctx, {
        kind: w.kind,
        x: w.x,
        y: w.y,
        angle: w.angle,
        progress: 1 - w.t / w.max,
        scale: w.scale,
      });
    }
  }

  // 太刀斩浪：残影与刀光置于玩家下层，避免盖住角色和脚下资源条。
  // 这套素材只属于「斩浪」；只学「连闪」时保留冲刺机制，但不借用月牙/残影。
  if (
    this.prof === "warrior" &&
    this.warriorStyle === "katana" &&
    (this.player.upCounts["斩浪"] || 0) > 0
  ) {
    const fromX = this.warriorDashFromX;
    const fromY = this.warriorDashFromY;
    if (this.player.dashT > 0 && fromX !== null && fromY !== null) {
      const dx = this.player.x - fromX;
      const dy = this.player.y - fromY;
      const length = Math.hypot(dx, dy);
      // 三个固定间距的淡残影；短冲刺不把残影画到实际起点后面。
      for (let i = 3; i >= 1; i--) {
        const distance = i * 11;
        if (length <= distance) continue;
        ctx.globalAlpha = (4 - i) * 0.08;
        drawPlayerSprite(ctx, character,
          this.player.x - dx / length * distance,
          this.player.y - dy / length * distance);
      }
      ctx.globalAlpha = 1;
      drawKatanaDash(ctx, {
        x1: fromX, y1: fromY,
        x2: this.player.x, y2: this.player.y,
        phase: "rush",
        progress: Math.max(0, 1 - this.player.dashT / KATANA_DASH.rushDurationSeconds),
      });
    }
    for (const q of this.warriorQi) {
      if (q.kind !== "dash") continue;
      drawKatanaDash(ctx, {
        x1: q.x1, y1: q.y1, x2: q.x2, y2: q.y2,
        phase: "release", progress: 1 - q.t / q.max,
      });
    }
  }

  // 玩家 (冲刺时半透明残影感)
  const leapPose = greatswordLeapPose(this.warriorLeapState);
  if (this.warriorLeapState)
    drawGreatswordLeapDescent(ctx, this.warriorLeapState, this.player.x, this.player.y);
  // S3 法师「镜像」虚影：半透明 + 紫色调（不可受击的状态要看得见）
  let playerAlpha =
    this.magePhaseT > 0 ? 0.4 : this.player.dashT > 0 ? 0.6 : 1;
  playerAlpha *= leapPose.alpha;
  // v128：三段斩第三段的无敌用半隐身表示，不再额外画光环。
  if (
    this.warriorLeapInvulnT > 0 ||
    this.warriorLeapState?.triStage3
  )
    playerAlpha = Math.min(playerAlpha, 0.5);
  ctx.globalAlpha = playerAlpha;
  if (playerAlpha > 0.02)
    drawPlayerSprite(ctx, character, this.player.x, this.player.y - leapPose.height);
  ctx.globalAlpha = 1;
  // 护盾层数 + 充能环：每层一段圆弧，亮青=可用、暗蓝=空层。
  // 下一层按恢复进度从段首填亮，恢复中的一段用更浅的青色。
  if (this.player.shieldMax > 0) {
    const sx = Math.round(this.player.x);
    const sy = Math.round(this.player.y);
    const max = Math.max(1, Math.round(this.player.shieldMax));
    const filled = Math.max(
      0,
      Math.min(max, Math.round(this.player.shield)),
    );
    const recharging = filled < max && this.player.shieldCd > 0;
    const rebuild = shieldRebuildSeconds(this.player.upCounts);
    const progress = recharging
      ? Math.max(0, Math.min(1, 1 - this.player.shieldCd / rebuild))
      : 0;
    const gap = max > 1 ? 0.45 : 0;
    const span = (Math.PI * 2) / max;
    const radius = 9;
    const pulse = 0.68 + Math.sin(this.time * 6) * 0.12;
    for (let i = 0; i < max; i++) {
      const start = -Math.PI / 2 + i * span + gap / 2;
      const end = -Math.PI / 2 + (i + 1) * span - gap / 2;
      ctx.strokeStyle = i < filled ? "#57e6ff" : "#3f6b93";
      ctx.globalAlpha = i < filled ? pulse : 0.7;
      ctx.beginPath();
      ctx.arc(sx, sy, radius, start, end);
      ctx.stroke();
      if (i === filled && progress > 0) {
        // 正在恢复的那一层用更浅的青色，和已就绪层区分。
        ctx.strokeStyle = "#b9f7ff";
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(sx, sy, radius, start, start + (end - start) * progress);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  // 壁垒临时护盾光环
  if (this.player.tempShield > 0) {
    ctx.globalAlpha = 0.4 + Math.sin(this.time * 8) * 0.2;
    ctx.strokeStyle = "#ff9a3d";
    ctx.beginPath();
    ctx.arc(
      Math.round(this.player.x),
      Math.round(this.player.y),
      11,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // S3 法师：值型限时护盾光环（与上面的层数制护盾是两种表现）
  // 呼吸底环只表示「护盾存在」；亮色弧从 12 点顺时针绘制，长度 = 剩余时间比例。
  // 用户要求「直接从护盾本身看还剩多久」，不新增下方状态条。
  if (this.mageShield > 0) {
    const sx = Math.round(this.player.x);
    const sy = Math.round(this.player.y);
    const pulse = Math.sin(this.time * 7);
    const k =
      this.mageShieldMaxT > 0
        ? Math.max(0, Math.min(1, this.mageShieldT / this.mageShieldMaxT))
        : 1;
    ctx.globalAlpha = 0.16 + pulse * 0.05;
    ctx.strokeStyle = "#c07bff";
    ctx.beginPath();
    ctx.arc(sx, sy, 13, 0, Math.PI * 2);
    ctx.stroke();
    if (k > 0) {
      ctx.globalAlpha = 0.75 + pulse * 0.1;
      ctx.strokeStyle = "#d9a6ff";
      ctx.beginPath();
      ctx.arc(sx, sy, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // 冲刺充能格（#51 重做）：小格条替代原来的菱形小点。
  // 每格是**无边框的实心块**：亮青=可用，暗色=冷却中，下一格按充能进度从左填充。
  // 不画上下边框与内凹线——用户明确要求去掉；格子之间靠 2px 间距分隔。
  // v63 减薄到 2px 高；v64 宽度 5→4：格数为奇数时总宽为奇数，无法在整数像素上
  // 沿角色中轴线轴对称，改成偶数宽后 1/2/3/4 格都能精确居中。
  if (this.player.dashLv > 0) {
    const py = Math.round(this.player.y) + 12;
    if ((this.player.upCounts["三段斩"] || 0) > 0) {
      // v128 三段斩专属：3 格 = 3 个独立冲刺槽，每格单独记录充能进度。
      // 亮金=可用，暗金=充能中；白色 2px 亮点标出当前段/下一个被消费的槽。
      const total = 3;
      const cw = 6;
      const chh = 3;
      const gap = 3;
      const pw = total * cw + (total - 1) * gap;
      const px = Math.round(this.player.x) - Math.floor(pw / 2);
      const stage = this.warriorTriDashStage;
      const leapOwned = (this.player.upCounts["跃击"] || 0) > 0;
      const triCd = warriorTriDashCd(this.player.dashMax, this.player.lvl);
      for (let i = 0; i < total; i++) {
        const x = px + i * (cw + gap);
        ctx.fillStyle = "#1d2440";
        ctx.fillRect(x, py, cw, chh);
        const left = this.warriorTriSlotRe[i];
        const progress =
          left <= 0
            ? 1
            : Math.max(0, 1 - left / triCd);
        if (progress <= 0) continue;
        ctx.fillStyle = left <= 0 ? "#ffd24a" : "#7a5a20";
        ctx.fillRect(x, py, Math.max(1, Math.round(cw * progress)), chh);
      }
      // 下一段标记：2×1，紧贴当前段格子上方。
      const tickX = px + stage * (cw + gap) + Math.floor((cw - 2) / 2);
      ctx.fillStyle = stage === 2 && leapOwned ? "#fff3b0" : "#ffffff";
      ctx.fillRect(tickX, py - 2, 2, 1);
    } else {
      const dchMax = 1 + this.player.dashChargeLv;
      const cw = 4;
      const chh = 2;
      const gap = 2;
      const pw = dchMax * cw + (dchMax - 1) * gap;
      // 同读条：整数偏移居中，避免奇数宽度导致横移时左右抖动
      const px = Math.round(this.player.x) - Math.floor(pw / 2);
      const recharge =
        this.player.dashCharges < dchMax && this.player.dashRe > 0
          ? Math.min(
              1,
              Math.max(0, 1 - this.player.dashRe / this.player.dashMax),
            )
          : 0;
      for (let i = 0; i < dchMax; i++) {
        const x = px + i * (cw + gap);
        ctx.fillStyle = "#1d2440";
        ctx.fillRect(x, py, cw, chh);
        if (i < this.player.dashCharges) {
          ctx.fillStyle = "#57e6ff";
          ctx.fillRect(x, py, cw, chh);
        } else if (i === this.player.dashCharges && recharge > 0) {
          ctx.fillStyle = "#2f8fae";
          ctx.fillRect(x, py, Math.max(1, Math.round(cw * recharge)), chh);
        }
      }
    }
  }
  // 法师：法杖经验条（角色脚下 18×1，与激光/导弹经验条同细度）。
  // 位于常驻施法条下方；成功本体施法 +1，满级或满经验整条金色。
  if (
    this.prof === "mage" &&
    this.state === "play" &&
    this.wavePhase === "fight"
  ) {
    const need = STAFF_LEVELS[this.mageStaffLevel - 1]?.xpToNext ?? null;
    const ratio = need
      ? Math.min(1, this.mageStaffXp / need)
      : 1;
    const sw = 18;
    const sx = Math.round(this.player.x - sw / 2);
    const sy = Math.round(this.player.y) + 20;
    ctx.fillStyle = "#1d2440";
    ctx.fillRect(sx, sy, sw, 1);
    ctx.fillStyle = "#ffd24a";
    ctx.fillRect(sx, sy, Math.round(sw * ratio), 1);
  }
  // 法师：元素轮盘（经验条下方 3 格，颜色 = 当前元素；实心 = 本阶段已完成施法）。
  // 每 3 次成功施法切换元素，格数归零并换色，给玩家“下一次换元素”的节奏提示。
  if (
    this.prof === "mage" &&
    this.state === "play" &&
    this.wavePhase === "fight" &&
    this.mageElements.length > 0
  ) {
    const el = this.mageElements[this.mageWheelIndex % this.mageElements.length];
    const color = MAGE_ELEMENTS[el].color;
    const total = MAGE_CASTS_PER_ELEMENT;
    const cw = 2;
    const chh = 2;
    const gap = 3;
    const pw = total * cw + (total - 1) * gap;
    const px = Math.round(this.player.x) - Math.floor(pw / 2);
    const py = Math.round(this.player.y) + 22;
    for (let i = 0; i < total; i++) {
      ctx.globalAlpha = i < this.mageCastsInPhase ? 1 : 0.32;
      ctx.fillStyle = color;
      ctx.fillRect(px + i * (cw + gap), py, cw, chh);
    }
    ctx.globalAlpha = 1;
  }
  // 战士「流 / 势」两条分段充能条（角色脚下，紧贴排列）。
  // 各 3 段、每段 5 层；未解锁的段压暗保留，升级后自然点亮。
  if (this.prof === "warrior") {
    const cx = Math.round(this.player.x);
    const py = Math.round(this.player.y);
    // 上：势。value 带未满一层的移动余量，因此是**平滑**增长而非跳格；
    // 满层时整条亮白＝下一刀必是居合斩。
    // 势核心 8 层，居合·迅作为可选增幅 +4；三条按 cap/3 均分，满层全亮。
    if (this.player.upCounts["居合"]) {
      const lv2 = (this.player.upCounts["居合·迅"] || 0) > 0;
      const cap = WB.iai.cap + (lv2 ? WB.iai.capBonus : 0);
      const step = warriorIaiStep(this);
      const value = Math.min(
        cap,
        this.warriorIaiStacks + this.warriorIaiDist / step,
      );
      drawChargeBar(
        ctx,
        cx,
        py + 16,
        cap,
        value,
        "#5ea8c8",
        "#e8ffff",
        cap / CHARGE_SEG_COUNT,
        false,
      );
    }
    // 下：流（只增幅居合，不再有爆发态）
    if (this.player.upCounts["流·初"]) {
      const cap = this.player.upCounts["流·极"]
        ? WB.flow.cap3
        : this.player.upCounts["流·续"]
          ? WB.flow.cap2
          : WB.flow.cap1;
      drawChargeBar(
        ctx,
        cx,
        py + 20,
        cap,
        this.warriorFlowStacks,
        "#36e0c0",
        "#7cf5dd",
      );
    }
  }

  drawLaserResources(this, ctx);
  drawMissileResources(this, ctx);
  // 强化弹经验条（角色脚下；满级或满经验时整条金色）
  // 强化弹是射手专属系统；法师不显示，否则空条会压在充能点（y+17）上。
  if (this.prof === "shooter" && this.shooterWeapon === "charged") {
    const stats = getSpecialLevelStats(this.specialLevel);
    const ratio = stats.xpToNext
      ? Math.min(1, this.specialXp / stats.xpToNext)
      : 1;
    const sw = 18;
    const sx = Math.round(this.player.x - sw / 2);
    const sy = Math.round(this.player.y + 16);
    ctx.fillStyle = "#1d2440";
    ctx.fillRect(sx, sy, sw, 2);
    ctx.fillStyle = "#ffd24a";
    ctx.fillRect(sx, sy, Math.round(sw * ratio), 2);
  }

  // 近战刀光：太刀碧水扫击、大剑金白宽刃；未加载时大剑回退同心弧。
  for (const s of this.slashes) {
    if (s.weapon === "greatsword" && s.impact) continue;
    const k = Math.max(0, s.life / s.max);
    const sx = Math.round(s.x),
      sy = Math.round(s.y);
    if (s.weapon === "katana") {
      // 素材 PR #172：10 帧 32×32 刀光。右侧半圆用顺时针表，左侧用逆时针表；
      // 中心固定在角色前方 26px（#180：太刀射程 34 → 42，中心同步 22 → 26，
      // 让素材外缘跟得上判定半径），出现/消失与透明度已烘焙进帧。
      const prog = 1 - Math.max(0, Math.min(1, s.life / s.max));
      // 居合·极：全向回旋斩素材以玩家为中心，不吃普通刀光的前方 26px 偏移。
      // 2× 整数放大让环外缘对齐 52px 命中半径（素材原环半径约 29px）。
      if (s.spin && drawIaiSpinSlash(ctx, s.x, s.y, prog, 2)) continue;
      const frame = Math.min(9, Math.floor(prog * 10));
      const angle = Math.atan2(Math.sin(s.a), Math.cos(s.a));
      const rightHalf = angle >= -Math.PI / 2 && angle < Math.PI / 2;
      const key = `taidao-slash-${rightHalf ? "" : "ccw-"}${frame}`;
      if (ctx.hasTexture(key)) {
        ctx.globalAlpha = 1;
        ctx.spriteRot(
          key,
          Math.round(sx + Math.cos(angle) * 26),
          Math.round(sy + Math.sin(angle) * 26),
          rightHalf ? angle : angle - Math.PI,
        );
      }
      continue;
    }
    if (s.weapon === "greatsword") {
      if (s.spin) {
        // 大剑 360° 回旋斩：用三把 130° 金白刀光绕中心铺满一圈，
        // 比三层同心圆弧更像「回旋」，同时继续复用已加载的扫击素材。
        let drew = false;
        for (let i = 0; i < 3; i++) {
          drew =
            drawGreatswordSlash(ctx, {
              ...s,
              a: s.a + (i * Math.PI * 2) / 3,
              arc: WB.styles.greatsword.spread,
            }) || drew;
        }
        if (drew) continue;
      } else if (s.dashSlash) {
        // v133：专用薄刃与风痕，按本次冲刺扇斩快照选帧。
        if (drawGreatswordDashSlash(ctx, s)) continue;
        // 素材尚未就绪时沿用普通大剑刀光。
        if (drawGreatswordSlash(ctx, s)) continue;
      } else if (drawGreatswordSlash(ctx, s)) continue;
    }
    const grow = 1 + (1 - k) * 0.18;
    const half = s.arc / 2;
    for (let i = 0; i < 3; i++) {
      const r = (s.r - i * 4) * grow;
      if (r <= 2) continue;
      ctx.globalAlpha = k * (i === 0 ? 0.9 : i === 1 ? 0.5 : 0.28);
      ctx.strokeStyle = i === 0 ? "#ffffff" : s.c;
      ctx.beginPath();
      ctx.arc(sx, sy, r, s.a - half, s.a + half);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // 环绕飞刃（Issue #3：刀形精灵，刃尖朝外）
  if (this.player.orbit > 0) {
    const warriorBlades =
      this.prof === "warrior" &&
      (this.player.upCounts["护刃"] || 0) > 0;
    const orbitR = warriorBlades ? WB.antiRanged.orbitRadius : 26;
    const bladeScale =
      warriorBlades && (this.player.upCounts["刃轮"] || 0) > 0
        ? 1.25
        : 1;
    for (let i = 0; i < this.player.orbit; i++) {
      const a = this.player.orbA + (i * Math.PI * 2) / this.player.orbit;
      const bx = this.player.x + Math.cos(a) * orbitR;
      const by = this.player.y + Math.sin(a) * orbitR;
      ctx.spriteRot("blade", bx, by, a + Math.PI / 2, bladeScale);
    }
  }

  // 战士剑气 / 斩浪路径（短寿命表现层）
  if (this.warriorQi.length) {
    for (const q of this.warriorQi) {
      // 太刀斩浪已在玩家下层绘制，不再叠旧版光束与终点三层弧。
      if (q.kind === "dash" && this.warriorStyle === "katana") continue;
      const alpha = Math.max(0, Math.min(1, q.t / q.max));
      const x1 = Math.round(q.x1);
      const y1 = Math.round(q.y1);
      const x2 = Math.round(q.x2);
      const y2 = Math.round(q.y2);
      if (q.kind === "dash") {
        const dx = q.x2 - q.x1;
        const dy = q.y2 - q.y1;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        // 11px 外辉 + 5px 中层 + 白热芯，一次折线批量画完。
        const glow: number[] = [];
        const mid: number[] = [];
        for (let off = -5; off <= 5; off++) {
          glow.push(
            Math.round(x1 + nx * off),
            Math.round(y1 + ny * off),
            Math.round(mx + nx * off),
            Math.round(my + ny * off),
            Math.round(x2 + nx * off),
            Math.round(y2 + ny * off),
          );
        }
        for (let off = -2; off <= 2; off++) {
          mid.push(
            Math.round(x1 + nx * off),
            Math.round(y1 + ny * off),
            Math.round(mx + nx * off),
            Math.round(my + ny * off),
            Math.round(x2 + nx * off),
            Math.round(y2 + ny * off),
          );
        }
        ctx.polyline3(glow, q.c, alpha * 0.18);
        ctx.polyline3(mid, q.c, alpha * 0.45);
        ctx.polyline3(
          [x1, y1, Math.round(mx), Math.round(my), x2, y2],
          "#ffffff",
          alpha * 0.85,
        );
        // 末端斩击弧：前移到角色前方，收窄张角，读作一道向前劈出的刀光。
        const tipX = Math.round(x2 + (dx / len) * 10);
        const tipY = Math.round(y2 + (dy / len) * 10);
        const angle = Math.atan2(dy, dx);
        const span = 1.0;
        ctx.globalAlpha = alpha * 0.35;
        ctx.strokeStyle = q.c;
        ctx.beginPath();
        ctx.arc(tipX, tipY, 17, angle - span, angle + span);
        ctx.stroke();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = q.c;
        ctx.beginPath();
        ctx.arc(tipX, tipY, 13, angle - span, angle + span);
        ctx.stroke();
        ctx.strokeStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(tipX, tipY, 9, angle - span * 0.9, angle + span * 0.9);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (q.kind === "slam") {
        // 跃击落地冲击波：外环扩散 + 内侧白环，读作一次震地。
        const k = 1 - alpha;
        const r = 8 + 48 * k;
        ctx.globalAlpha = alpha * 0.75;
        ctx.strokeStyle = q.c;
        ctx.beginPath();
        ctx.arc(x1, y1, Math.round(r), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = alpha * 0.4;
        ctx.strokeStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(x1, y1, Math.max(2, Math.round(r - 6)), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        ctx.polyline3(
          [
            x1,
            y1,
            Math.round((x1 + x2) / 2),
            Math.round((y1 + y2) / 2),
            x2,
            y2,
          ],
          q.c,
          alpha,
        );
      }
    }
  }

  // 闪电链（#112）：所有链合并成一次 lineStyle + 一次 strokePath。
  // 原先每条链都走一遍 beginPath/lineStyle/strokePath，每条都会打断 Image 批次；
  // 实测 40 条链时 p95 从 4.9ms 涨到 17.2ms。合并后（含单桶 alpha）降到 8.1ms。
  // 链寿命仅 0.15s，统一不透明度后视觉上分辨不出与原渐隐的差异。
  // 抖动改用确定性相位，不再用 Math.random（表现层约定）。
  if (this.bolts.length) {
    const pts: number[] = [];
    for (const bo of this.bolts) {
      const seed = bo.x1 * 0.7 + bo.y1 * 1.3;
      const mx1 = (bo.x1 + bo.x2) / 2 + Math.sin(this.time * 37 + seed) * 5;
      const my1 = (bo.y1 + bo.y2) / 2 + Math.cos(this.time * 41 + seed) * 5;
      pts.push(
        Math.round(bo.x1),
        Math.round(bo.y1),
        Math.round(mx1),
        Math.round(my1),
        Math.round(bo.x2),
        Math.round(bo.y2),
      );
    }
    ctx.polyline3(pts, "#aef1ff", 0.9);
  }

  drawLaser(this, ctx, laserAnimation, shooterEcho);
  drawMissile(this, ctx);

  // 强化弹激光（短寿命表现层；与电弧同为一次折线批量绘制）
  if (this.lasers.length) {
    for (const l of this.lasers) {
      const alpha = Math.max(0, Math.min(1, l.t / 0.12));
      ctx.polyline3(
        [
          l.x1,
          l.y1,
          (l.x1 + l.x2) / 2,
          (l.y1 + l.y2) / 2,
          l.x2,
          l.y2,
        ],
        "#9fe1ff",
        alpha * 0.9,
      );
    }
  }

  // 导弹（独立追踪弹；弹体与尾迹和强化弹分开绘制）
  for (const m of this.missiles) {
    const x = Math.round(m.x);
    const y = Math.round(m.y);
    const tx = Math.round(m.x - m.vx * 0.04);
    const ty = Math.round(m.y - m.vy * 0.04);
    ctx.polyline3(
      [tx, ty, (tx + x) / 2, (ty + y) / 2, x, y],
      "#ff9a3d",
      0.65,
    );
    ctx.fillStyle = "#ffd24a";
    ctx.fillRect(x - 2, y - 2, 4, 4);
    ctx.fillStyle = "#fff4c2";
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }

  // 子弹
  for (const b of this.bullets) {
    const x = Math.round(b.x),
      y = Math.round(b.y),
      s = b.size;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = b.special ? "#ffd24a" : "#57e6ff";
    ctx.fillRect(x - s, y - s, s * 2, s * 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = b.special ? "#fff4c2" : "#e8fbff";
    ctx.fillRect(
      x - s + 1,
      y - s + 1,
      Math.max(1, s * 2 - 2),
      Math.max(1, s * 2 - 2),
    );
  }

  // 敌方弹幕
  for (const b of this.ebullets) {
    const x = Math.round(b.x),
      y = Math.round(b.y);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = b.reflected ? "#9fe1ff" : "#ff5b5b";
    ctx.fillRect(x - 2, y - 2, 4, 4);
    ctx.globalAlpha = 1;
    ctx.fillStyle = b.reflected ? "#e0f6ff" : "#ffd0c0";
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }

  // 粒子
  for (const q of this.parts) {
    ctx.globalAlpha = Math.min(1, q.life * 2.5);
    ctx.fillStyle = q.c;
    ctx.fillRect(Math.round(q.x), Math.round(q.y), 2, 2);
  }
  ctx.globalAlpha = 1;

  shooterWeapon?.();
  // 飘字：每条文字在生命周期内绑定固定 label 槽位，只更新坐标/透明度，
  // 避免文字过期后槽位整体前移导致的每帧纹理重建。
  ctx.textAlign = "center";
  const slotState = floatingTextSlots(this);
  const activeTexts = new Set(this.texts);
  for (const [text, slots] of slotState.slots) {
    if (!activeTexts.has(text)) {
      slotState.slots.delete(text);
      slotState.free.push(...slots);
    }
  }
  for (const t of this.texts) {
    const layers = t.reactionName
      ? 3
      : t.reactionId
        ? 4
        : t.iaiDmg || t.triDmg
          ? 4
        : t.trueDmg
          ? t.big
            ? 4
            : 3
          : t.specialDmg
            ? t.critDmg
              ? 4
              : 3
            : t.critDmg
              ? 3
              : 2;
    let slots = slotState.slots.get(t);
    if (!slots || slots.length !== layers) {
      if (slots) slotState.free.push(...slots);
      slots = [];
      for (let i = 0; i < layers; i++)
        slots.push(slotState.free.pop() ?? slotState.next++);
      slotState.slots.set(t, slots);
    }
    ctx.globalAlpha = Math.min(1, t.life * 3);
    const x = Math.round(t.x);
    const y = Math.round(t.y);
    if (t.reactionName) {
      // 反应名与六反应伤害数字同套配色：前元素外圈 → 深色落影 → 后元素主体。
      // 比旧版缩小一号（12/11px），中文回退字形额外留 4px 底部内边距。
      const style = t.reactionId ? REACTION_TEXT[t.reactionId] : null;
      ctx.textPaddingBottom = 4;
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.fillStyle = style?.outer ?? "#10131f";
      ctx.fillTextSlot(slots[0], t.s, x, y);
      ctx.font = '11px "Press Start 2P", monospace';
      ctx.fillStyle = "#10131f";
      ctx.fillTextSlot(slots[1], t.s, x + 1, y + 1);
      ctx.fillStyle = style?.top ?? t.c;
      ctx.fillTextSlot(slots[2], t.s, x, y);
      ctx.textPaddingBottom = 0;
    } else if (t.reactionId) {
      // 六反应伤害数字：16px 前元素外圈 → 14px 反应强调色 → 12px 落影 →
      // 12px 后元素主体，和居合/三段斩同级但配色按反应区分。
      const style = REACTION_TEXT[t.reactionId];
      ctx.font = '16px "Press Start 2P", monospace';
      ctx.fillStyle = style.outer;
      ctx.fillTextSlot(slots[0], t.s, x, y);
      ctx.font = '14px "Press Start 2P", monospace';
      ctx.fillStyle = style.accent;
      ctx.fillTextSlot(slots[1], t.s, x, y);
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.fillStyle = "#10131f";
      ctx.fillTextSlot(slots[2], t.s, x + 1, y + 1);
      ctx.fillStyle = style.top;
      ctx.fillTextSlot(slots[3], t.s, x, y);
    } else if (t.iaiDmg) {
      // 居合斩：全场最大字号 + 冰白主体。四层从外到内：
      // 深青粗外圈（16px）→ 亮青细边（14px）→ 深色落影 → 冰白主体（12px）。
      // 两层描边必须都比主体大一圈，同字号会被主体完全盖住。
      // 居合每波只出 2–6 次，数字必须能从满屏白字里一眼认出来。
      ctx.font = '16px "Press Start 2P", monospace';
      ctx.fillStyle = "#0a3a4a";
      ctx.fillTextSlot(slots[0], t.s, x, y);
      ctx.font = '14px "Press Start 2P", monospace';
      ctx.fillStyle = "#57e6ff";
      ctx.fillTextSlot(slots[1], t.s, x, y);
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.fillStyle = "#10131f";
      ctx.fillTextSlot(slots[2], t.s, x + 1, y + 1);
      ctx.fillStyle = t.c;
      ctx.fillTextSlot(slots[3], t.s, x, y);
    } else if (t.triDmg) {
      // 三段斩：与居合同级四层，但换成大剑的暗金/暖白。
      // 16px 深褐外圈 → 14px 熔金边 → 12px 落影 → 12px 暖白主体。
      ctx.font = '16px "Press Start 2P", monospace';
      ctx.fillStyle = "#3a2108";
      ctx.fillTextSlot(slots[0], t.s, x, y);
      ctx.font = '14px "Press Start 2P", monospace';
      ctx.fillStyle = "#ffb02e";
      ctx.fillTextSlot(slots[1], t.s, x, y);
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.fillStyle = "#10131f";
      ctx.fillTextSlot(slots[2], t.s, x + 1, y + 1);
      ctx.fillStyle = t.c;
      ctx.fillTextSlot(slots[3], t.s, x, y);
    } else if (t.trueDmg) {
      // 真实伤害：冷蓝外圈 + 深色落影 + 银白主体；暴击再叠金色外圈并放大。
      if (t.small) {
        // 附带真实伤害的补充数字：比常规真实伤害小一圈，跟在主伤害右侧。
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.fillStyle = TRUE_DAMAGE_OUTLINE;
        ctx.fillTextSlot(slots[0], t.s, x, y);
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillStyle = "#10131f";
        ctx.fillTextSlot(slots[1], t.s, x + 1, y + 1);
        ctx.fillStyle = t.c;
        ctx.fillTextSlot(slots[2], t.s, x, y);
      } else if (t.big) {
        ctx.font = '16px "Press Start 2P", monospace';
        ctx.fillStyle = "#ffd24a";
        ctx.fillTextSlot(slots[0], t.s, x, y);
        ctx.font = '14px "Press Start 2P", monospace';
        ctx.fillStyle = TRUE_DAMAGE_OUTLINE;
        ctx.fillTextSlot(slots[1], t.s, x, y);
        ctx.font = '12px "Press Start 2P", monospace';
        ctx.fillStyle = "#10131f";
        ctx.fillTextSlot(slots[2], t.s, x + 1, y + 1);
        ctx.fillStyle = "#ffffff";
        ctx.fillTextSlot(slots[3], t.s, x, y);
      } else {
        ctx.font = '12px "Press Start 2P", monospace';
        ctx.fillStyle = TRUE_DAMAGE_OUTLINE;
        ctx.fillTextSlot(slots[0], t.s, x, y);
        ctx.font = '10px "Press Start 2P", monospace';
        ctx.fillStyle = "#10131f";
        ctx.fillTextSlot(slots[1], t.s, x + 1, y + 1);
        ctx.fillStyle = t.c;
        ctx.fillTextSlot(slots[2], t.s, x, y);
      }
    } else if (t.specialDmg) {
      // 强化弹：金色主体 + 青色外圈；暴击再叠橙红外圈，和普通暴击区分。
      if (t.critDmg) {
        ctx.font = '11px "Press Start 2P", monospace';
        ctx.fillStyle = "#ff8a3d";
        ctx.fillTextSlot(slots[0], t.s, x, y);
        ctx.font = '10px "Press Start 2P", monospace';
        ctx.fillStyle = "#57e6ff";
        ctx.fillTextSlot(slots[1], t.s, x, y);
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.fillStyle = "#10131f";
        ctx.fillTextSlot(slots[2], t.s, x + 1, y + 1);
        ctx.fillStyle = t.c;
        ctx.fillTextSlot(slots[3], t.s, x, y);
      } else {
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.fillStyle = "#57e6ff";
        ctx.fillTextSlot(slots[0], t.s, x, y);
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillStyle = "#10131f";
        ctx.fillTextSlot(slots[1], t.s, x + 1, y + 1);
        ctx.fillStyle = t.c;
        ctx.fillTextSlot(slots[2], t.s, x, y);
      }
    } else if (t.critDmg) {
      // 普通暴击：8px 金色主体 + 9px 橙红外圈。
      ctx.font = '9px "Press Start 2P", monospace';
      ctx.fillStyle = "#ff8a3d";
      ctx.fillTextSlot(slots[0], t.s, x, y);
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillStyle = "#10131f";
      ctx.fillTextSlot(slots[1], t.s, x + 1, y + 1);
      ctx.fillStyle = t.c;
      ctx.fillTextSlot(slots[2], t.s, x, y);
    } else {
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillStyle = "#10131f";
      ctx.fillTextSlot(slots[0], t.s, x + 1, y + 1);
      ctx.fillStyle = t.c;
      ctx.fillTextSlot(slots[1], t.s, x, y);
    }
  }
  ctx.globalAlpha = 1;

  ctx.screen(); // 结束镜头缩放，以下 HUD 用全分辨率绘制

  // ---- HUD (整数坐标保证清晰) ----
  ctx.fillStyle = "#10131f";
  ctx.fillRect(0, 0, W, 3);
  ctx.fillStyle = "#57e6ff";
  ctx.fillRect(
    0,
    0,
    Math.round(W * Math.min(1, this.player.xp / this.player.xpNext)),
    3,
  );
  // HP
  ctx.fillStyle = "#10131f";
  ctx.fillRect(6, 8, 84, 7);
  ctx.fillStyle = "#3a0d0d";
  ctx.fillRect(7, 9, 82, 5);
  ctx.fillStyle =
    this.player.hp / this.player.maxhp < 0.45 ? "#ff5b5b" : "#ff4d6d";
  ctx.fillRect(
    7,
    9,
    Math.round(82 * Math.max(0, this.player.hp / this.player.maxhp)),
    5,
  );
  ctx.font = '16px "Press Start 2P", monospace';
  ctx.fillStyle = "#e8e8f0";
  ctx.textAlign = "left";
  ctx.fillText("Lv" + this.player.lvl, 6, 34);
  ctx.fillText(fmtHp(this.player.hp, this.player.maxhp), 6, 56); // 血量数值 (与计时同规格)
  // 护盾层数改到角色护盾环（见玩家绘制段）；HUD 不再显示小格。
  // Issue #51：冲刺充能格已移至角色脚下（见玩家绘制段），不再占用 HUD
  // 时间 (带波次号, 16px 像素字体)
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd24a";
  ctx.font = '16px "Press Start 2P", monospace';
  ctx.fillText(
    "W" +
      this.waveN +
      " " +
      (this.wavePhase === "rest" ? "REST" : fmtTime(this.time)),
    W / 2,
    24,
  );
  drawBossHud(this, ctx);
  // 击杀
  ctx.textAlign = "right";
  ctx.fillStyle = "#9aa3c7";
  ctx.fillText("x" + this.kills, W - 6, 22);
  ctx.textAlign = "left";

  // 受伤红闪
  if (this.hurtFlash > 0) {
    ctx.globalAlpha = this.hurtFlash * 0.9;
    ctx.fillStyle = "#ff2030";
    ctx.fillRect(0, 0, W, 2);
    ctx.fillRect(0, H - 2, W, 2);
    ctx.fillRect(0, 0, 2, H);
    ctx.fillRect(W - 2, 0, 2, H);
    ctx.globalAlpha = 1;
  }
}
