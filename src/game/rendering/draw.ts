import type { GameCore } from "../core/GameCore";
import type { PixelPainter } from "./PixelPainter";
import { W, H, VIEW, WORLD, fmtTime } from "../data/constants";
import { isFrozen, isParalyzed } from "../core/ElementMath";
import { mageCircleRadius, mageIsSteady, mageWindup } from "../core/MageSystem";
import { MAGE_BALANCE as MB } from "../data/mageBalance";
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
  // 站定时圆环变青、半径按 +20% 预览；走动时保持紫色原半径。
  if (
    this.prof === "mage" &&
    (this.castPhase === "windup" || this.castPhase === "cast")
  ) {
    const steady = mageIsSteady(this);
    // 预览圈按「下一次施法会不会满充能」取半径，与 detonate 的实际半径一致
    //（三连聚爆会让满充能发半径 +50%，预览偏小会让玩家误判落点）。
    const R = Math.round(
      mageCircleRadius(this, this.mageCharge + 1 >= MB.chargeFull, steady),
    );
    ctx.globalAlpha = this.castPhase === "cast" ? 0.5 : 0.25;
    ctx.strokeStyle = steady ? "#57e6ff" : "#c07bff";
    ctx.beginPath();
    ctx.arc(Math.round(this.castX), Math.round(this.castY), R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#7a4fd0";
    ctx.fillRect(Math.round(this.castX - 2), Math.round(this.castY - 2), 4, 4);
    ctx.globalAlpha = 1;
    // 玩家脚下的吟唱读条：**横条**，不是环。
    // 环会和法阵落点圈、护盾圈、冲刺格挤在角色周围（用户实机反馈「很花」）；
    // 横条只占角色下方 3px，放在冲刺充能格（y+10）上方，互不重叠。
    const total = Math.max(0.001, mageWindup(this));
    const castPart = total * (1 - MB.castWindupInterruptible / MB.castWindup);
    const remain =
      this.castPhase === "windup" ? this.castT + castPart : this.castT;
    const prog = Math.max(0, Math.min(1, 1 - remain / total));
    const bw = 22;
    // 取整基准必须与角色贴图一致：先 round 玩家坐标、再减一个**整数**偏移。
    // 之前写 round(x - bw/2)，bw 为奇数时（冲刺格 5px）偏移是 ±2.5，
    // 相邻帧会在 -2/-3 之间跳，表现为横移时小方块左右摆动。
    const bx = Math.round(this.player.x) - Math.floor(bw / 2);
    const by = Math.round(this.player.y) + 6;
    // 外框（深蓝）+ 底槽（更亮的蓝灰）+ 进度（青/橙）：空槽时也看得见形状，
    // 只画一条纯色会随进度缩成一个点，看不出「正在读条」。
    // 不做任何闪烁/高亮——实机反馈「锁定闪光太晃眼，看不清急停线到没到」；
    // 读条只保留静态信息：急停线 + 填充颜色。
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#3a4a7a";
    ctx.fillRect(bx - 1, by, bw + 2, 5);
    ctx.fillStyle = "#2a3560";
    ctx.fillRect(bx, by + 1, bw, 3);
    ctx.globalAlpha = 1;
    ctx.fillStyle = steady ? "#57e6ff" : "#ff9a3d";
    ctx.fillRect(bx, by + 1, Math.max(1, Math.round(bw * prog)), 3);
    // 急停线：前摇 60%（= 1 - steadyHoldRatio）。**常驻**——玩家需要从起手
    // 就看见「最晚停在这里」，而不是过了某条线之后才被提醒（实测来不及）。
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = "#c8a06a";
    ctx.fillRect(
      bx + Math.round(bw * (1 - MB.steadyHoldRatio)),
      by + 1,
      1,
      3,
    );
    ctx.globalAlpha = 1;
  } else if (
    // 星陨路线整体替换主施法：没有前摇，所以没有施法读条。
    // 但玩家的节奏感知不能丢——同一条位置改为显示「下一次陨星」的冷却，
    // 填满即落星（落点有独立的预警圈），紫色与施法读条区分。
    // 只在战斗阶段显示：休整/收球/暂停/结算时隐藏（休整里一直充能是噪音）。
    this.prof === "mage" &&
    this.state === "play" &&
    this.wavePhase === "fight" &&
    (this.player.upCounts["星陨"] || 0) > 0
  ) {
    const prog = Math.max(
      0,
      Math.min(1, 1 - this.mageMeteorT / MB.meteorInterval),
    );
    const bw = 22;
    // 取整基准必须与角色贴图一致：先 round 玩家坐标、再减一个**整数**偏移。
    // 之前写 round(x - bw/2)，bw 为奇数时（冲刺格 5px）偏移是 ±2.5，
    // 相邻帧会在 -2/-3 之间跳，表现为横移时小方块左右摆动。
    const bx = Math.round(this.player.x) - Math.floor(bw / 2);
    const by = Math.round(this.player.y) + 6;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#3a4a7a";
    ctx.fillRect(bx - 1, by, bw + 2, 5);
    ctx.fillStyle = "#2a3560";
    ctx.fillRect(bx, by + 1, bw, 3);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#c07bff";
    ctx.fillRect(bx, by + 1, Math.max(1, Math.round(bw * prog)), 3);
  }
  // ---- S3 法师：元素残域（持续伤害领域）----
  for (const d of this.mageDomains) {
    ctx.globalAlpha = 0.22 + Math.sin(this.time * 6) * 0.08;
    ctx.strokeStyle =
      d.element === "frost"
        ? "#9fe1ff"
        : d.element === "lightning"
          ? "#c07bff"
          : "#ff6a2b";
    ctx.beginPath();
    ctx.arc(Math.round(d.x), Math.round(d.y), d.R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // ---- S3 法师：陨星预告（路线B）----
  if (this.mageMeteors.length) {
    const rings: number[] = [];
    for (const m of this.mageMeteors)
      rings.push(
        Math.round(m.x),
        Math.round(m.y),
        Math.round((m.R * m.t) / MB.meteorFall + 8),
      );
    ctx.meteorRing(rings, "#c07bff", 0.5 + Math.sin(this.time * 20) * 0.3);
  }
  // ---- S3 法师：镜像残影（吸引仇恨的诱饵）----
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
    if (isFrozen(e)) {
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = "#cfefff";
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    }
    if (isParalyzed(e)) {
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = "#c07bff";
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
  // S3 法师「镜像」虚影：半透明 + 紫色调（不可受击的状态要看得见）
  ctx.globalAlpha =
    this.magePhaseT > 0 ? 0.4 : this.player.dashT > 0 ? 0.6 : 1;
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
  // S3 法师：值型限时护盾光环（与上面的层数制护盾是两种表现）
  if (this.mageShield > 0) {
    ctx.globalAlpha = 0.4 + Math.sin(this.time * 7) * 0.2;
    ctx.strokeStyle = "#c07bff";
    ctx.beginPath();
    ctx.arc(
      Math.round(this.player.x),
      Math.round(this.player.y),
      13,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // 冲刺充能格（#51 重做）：小格条替代原来的菱形小点。
  // 每格是**无边框的实心块**：亮青=可用，暗色=冷却中，下一格按充能进度从左填充。
  // 不画上下边框与内凹线——用户明确要求去掉；格子之间靠 2px 间距分隔。
  if (this.player.dashLv > 0) {
    const dchMax = 1 + this.player.dashChargeLv;
    const cw = 5;
    const chh = 3;
    const gap = 2;
    const pw = dchMax * cw + (dchMax - 1) * gap;
    // 同读条：整数偏移居中，避免奇数宽度导致横移时左右抖动
    const px = Math.round(this.player.x) - Math.floor(pw / 2);
    const py = Math.round(this.player.y) + 12;
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
