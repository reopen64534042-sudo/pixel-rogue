import type { GameCore } from "../core/GameCore";
import type { PixelPainter } from "./PixelPainter";
import { W, H, VIEW, WORLD, fmtTime } from "../data/constants";
import { spriteEntry } from "./assetRegistry";
function hash(x: number, y: number) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
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
export function draw(this: GameCore, ctx: PixelPainter) {
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
  // 宝箱（波次结束后会自动飞向玩家）
  for (const b of this.boxes) {
    const bob = Math.sin(this.time * 4 + b.x) * 1.2;
    const rect = spriteRect("box", b.x, b.y + bob);
    if (rect) ctx.sprite(rect.tex, rect.x, rect.y, rect.w, rect.h);
    // Issue #48：特殊宝箱金色皇冠标记
    if (b.special) {
      const gx = Math.round(b.x - 5);
      const gy = Math.round(b.y - 12 + bob);
      ctx.fillStyle = "#ffd24a";
      ctx.fillRect(gx, gy, 10, 2);
      ctx.fillRect(gx + 1, gy + 2, 2, 2);
      ctx.fillRect(gx + 7, gy + 2, 2, 2);
    }
  }

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

  // 陨星预告
  for (const m of this.meteors) {
    const x = Math.round(m.x),
      y = Math.round(m.y);
    ctx.globalAlpha = 0.5 + Math.sin(this.time * 20) * 0.3;
    ctx.strokeStyle = "#ff5b5b";
    ctx.beginPath();
    ctx.arc(x, y, (m.R * m.t) / 0.8 + 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 6, y);
    ctx.lineTo(x + 6, y);
    ctx.moveTo(x, y - 6);
    ctx.lineTo(x, y + 6);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (m.t < 0.3) {
      // 坠落中的陨星
      ctx.fillStyle = "#ff9a3d";
      ctx.fillRect(x + m.t * 120, y - m.t * 300 - 40, 3, 6);
    }
  }

  // 敌人
  for (const e of this.enemies) {
    // 精英优先用独立贴图；没有时退回「同系列贴图 ×1.8」。
    // 命名统一为 `${spr}_elite`，与 sprites.ts 的注册键一致（如 brute_elite）。
    const eliteKey = `${e.spr}_elite`;
    const eliteEntry = e.elite ? spriteEntry(eliteKey) : undefined;
    // 火囊虫引爆时胀大，是「要炸了」的第一重信号
    const puff = e.type === "bomber" && e.fuse > 0 ? 1.35 : 1;
    const rect = eliteEntry
      ? spriteRect(eliteKey, e.x, e.y, puff)
      : spriteRect(e.spr, e.x, e.y, (e.elite ? 1.8 : 1) * puff);
    if (!rect) continue;
    const { x, y, w, h } = rect;
    // 冰冻染色
    if (e.slowT > 0) ctx.globalAlpha = 0.9;
    ctx.sprite(rect.tex, x, y, w, h);
    if (e.slowT > 0) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#57e6ff";
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    }
    // Issue #38：冰冻泛蓝
    if (e.frozenT > 0) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "#9fe1ff";
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    }
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
    if (e.elite) {
      ctx.fillStyle = "#3a0d0d";
      ctx.fillRect(x, y - 4, w, 2);
      ctx.fillStyle = "#ff5b5b";
      ctx.fillRect(x, y - 4, (w * e.hp) / e.maxhp, 2);
    }
  }

  // 玩家 (冲刺时半透明残影感)
  ctx.globalAlpha = this.player.dashT > 0 ? 0.6 : 1;
  const playerRect = spriteRect("player", this.player.x, this.player.y);
  if (playerRect)
    ctx.sprite(
      playerRect.tex,
      playerRect.x,
      playerRect.y,
      playerRect.w,
      playerRect.h,
    );
  ctx.globalAlpha = 1;
  // 护盾光环
  if (this.player.shield > 0) {
    ctx.globalAlpha = 0.4 + Math.sin(this.time * 6) * 0.2;
    ctx.strokeStyle = "#57e6ff";
    ctx.beginPath();
    ctx.arc(
      Math.round(this.player.x),
      Math.round(this.player.y),
      8,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
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
  // Issue #51：冲刺充能菱形格（角色脚下，跟随玩家；满充能脉冲高亮）
  if (this.player.dashLv > 0) {
    const dchMax = 1 + this.player.dashChargeLv;
    const full = this.player.dashCharges >= dchMax;
    const pw = dchMax * 7 - 2;
    const px = Math.round(this.player.x - pw / 2);
    const py = Math.round(this.player.y + 10);
    for (let i = 0; i < dchMax; i++) {
      const charged = i < this.player.dashCharges;
      const x = px + i * 7;
      ctx.fillStyle = charged ? "#57e6ff" : "#1d2440";
      ctx.fillRect(x + 1, py, 3, 1);
      ctx.fillRect(x, py + 1, 5, 3);
      ctx.fillRect(x + 1, py + 4, 3, 1);
      if (charged && full) {
        ctx.globalAlpha = 0.4 + Math.sin(this.time * 8) * 0.25;
        ctx.fillStyle = "#9fe1ff";
        ctx.fillRect(x + 2, py + 1, 1, 3);
        ctx.globalAlpha = 1;
      }
    }
  }

  // 近战刀光（三层同心弧：外缘最亮，向内渐淡）
  for (const s of this.slashes) {
    const k = Math.max(0, s.life / s.max);
    const grow = 1 + (1 - k) * 0.18;
    const sx = Math.round(s.x),
      sy = Math.round(s.y);
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
    for (let i = 0; i < this.player.orbit; i++) {
      const a = this.player.orbA + (i * Math.PI * 2) / this.player.orbit;
      const bx = this.player.x + Math.cos(a) * 26;
      const by = this.player.y + Math.sin(a) * 26;
      ctx.spriteRot("blade", bx, by, a + Math.PI / 2);
    }
  }

  // 闪电链
  for (const bo of this.bolts) {
    ctx.globalAlpha = Math.min(1, bo.life * 7);
    ctx.strokeStyle = "#aef1ff";
    ctx.beginPath();
    const mx1 = (bo.x1 + bo.x2) / 2 + (Math.random() - 0.5) * 10;
    const my1 = (bo.y1 + bo.y2) / 2 + (Math.random() - 0.5) * 10;
    ctx.moveTo(Math.round(bo.x1), Math.round(bo.y1));
    ctx.lineTo(Math.round(mx1), Math.round(my1));
    ctx.lineTo(Math.round(bo.x2), Math.round(bo.y2));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // 子弹
  for (const b of this.bullets) {
    const x = Math.round(b.x),
      y = Math.round(b.y),
      s = b.size;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#57e6ff";
    ctx.fillRect(x - s, y - s, s * 2, s * 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#e8fbff";
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

  // 飘字
  ctx.textAlign = "center";
  for (const t of this.texts) {
    ctx.globalAlpha = Math.min(1, t.life * 3);
    ctx.fillStyle = "#10131f";
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillText(t.s, Math.round(t.x) + 1, Math.round(t.y) + 1);
    ctx.fillStyle = t.c;
    ctx.fillText(t.s, Math.round(t.x), Math.round(t.y));
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
    this.player.hp / this.player.maxhp < 0.3 ? "#ff5b5b" : "#ff4d6d";
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
  ctx.fillText(Math.ceil(this.player.hp) + "/" + this.player.maxhp, 6, 56); // 血量数值 (与计时同规格)
  // 护盾格 (Lv 右侧)
  for (let i = 0; i < this.player.shield; i++) {
    ctx.fillStyle = "#57e6ff";
    ctx.fillRect(90 + i * 7, 24, 5, 5);
  }
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
