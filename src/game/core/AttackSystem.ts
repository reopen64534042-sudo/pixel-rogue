import type { GameCore } from "./GameCore";
import { getPlayerCombatStats } from "./CombatStats";
import { professionPierce } from "./AttributeSources";
import {
  boltDamage,
  meteorDamage,
  multishotSpread,
  burnGroundDps,
} from "./DamageMath";

export function updateAttacks(this: GameCore, dt: number) {
  const p = this.player;
  // ---- 自动攻击 ----
  p.fireCd -= dt;
  if (p.fireCd <= 0) {
    // S1：射程改为玩家属性（base 130）；索敌半径与弹道 life 共用同一值
    const tgt = this.nearestEnemy(p.x, p.y, p.attackRange);
    if (tgt) {
      p.fireCd =
        1 /
        (p.fireRate * (1 + p.haste * 0.1 + (p.rageT > 0 ? 0.2 * p.rageLv : 0)));
      const base = Math.atan2(tgt.y - (p.y - 3), tgt.x - p.x);
      // S2「距离即收益」：按目标距离占射程的比例分档，发射时固化到这一发。
      // 为什么按比例而不是固定 px：射程会随长弓/属性成长，固定 px 档位在后期
      // 会退化成「贴身档」，同一句描述的语义就崩了。
      const dist = Math.hypot(tgt.x - p.x, tgt.y - p.y);
      let distMul = 1;
      let critBonus = 0;
      if (p.distanceDmg > 0) {
        const ratio = dist / p.attackRange;
        if (ratio >= 0.92) {
          distMul = 1.25;
          critBonus = 0.1;
        } else if (ratio >= 0.75) distMul = 1.15;
        else if (ratio >= 0.5) distMul = 1.05;
      }
      // S2「贯穿轨迹」：弹道留下 0.6 秒能量线（机制在 ProjectileSystem 结算）
      const hasTrail = (p.upCounts["贯穿轨迹"] || 0) > 0;
      for (let i = 0; i < p.multishot; i++) {
        // Issue #36 动态散布：目标附近敌人越少，弹道越收拢（孤立目标近平行）
        const near = this.enemies.reduce(
          (n, e) =>
            (e.x - tgt.x) ** 2 + (e.y - tgt.y) ** 2 < 110 * 110 ? n + 1 : n,
          0,
        );
        const a = base + (i - (p.multishot - 1) / 2) * multishotSpread(near);
        this.bullets.push({
          x: p.x,
          y: p.y - 3,
          vx: Math.cos(a) * p.projSpeed,
          vy: Math.sin(a) * p.projSpeed,
          dmg: boltDamage(p) * distMul,
          // S2：穿透次数 = 天赋写入值 + 职业基础（射手 +1）。
          // 职业基础不进 Player 字段：旧表穿透之矢靠 f 写同一字段，
          // 写进去会互相覆盖（见 core/AttributeSources.ts 的说明）。
          pierce: p.pierce + professionPierce(this.prof),
          falloff: p.pierceFalloff,
          life: p.attackRange / p.projSpeed,
          size: 2 * p.area,
          jumps: p.ricochet,
          hitList: [],
          trail: hasTrail ? 0.6 : 0,
          critBonus,
          // S3-B 定稿接口：攻击方属性发射时固化，与敌方弹丸快照对称
          stats: getPlayerCombatStats(p),
        });
      }
      this.audio.beep(620, 0.05, "square", 0.02, -250);
    } else p.fireCd = 0.06;
  }

  // ---- 环绕飞刃 ----
  if (p.orbit > 0) {
    p.orbA += 4 * dt;
    for (let i = 0; i < p.orbit; i++) {
      const a = p.orbA + (i * Math.PI * 2) / p.orbit;
      const bx = p.x + Math.cos(a) * 26 * p.area,
        by = p.y + Math.sin(a) * 26 * p.area;
      for (const e of this.enemies) {
        if (e.dead || e.orbCd > 0) continue;
        const dx = e.x - bx,
          dy = e.y - by;
        const orbR = e.r + 3 + 3 * p.area;
        if (dx * dx + dy * dy < orbR * orbR) {
          e.orbCd = 0.35;
          const kd = Math.hypot(e.x - p.x, e.y - p.y) || 1;
          this.hurtEnemy(
            e,
            p.orbitDmg + p.damage * 0.3,
            ((e.x - p.x) / kd) * 3,
            ((e.y - p.y) / kd) * 3,
            { src: "orbit", type: "physical", form: "other" },
          );
        }
      }
    }
  }

  // ---- 焦土燃烧地带（Issue #45） ----
  for (let i = this.burnZones.length - 1; i >= 0; i--) {
    const z = this.burnZones[i];
    z.t -= dt;
    if (z.t <= 0) {
      this.burnZones.splice(i, 1);
      continue;
    }
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - z.x,
        dy = e.y - z.y;
      if (dx * dx + dy * dy < z.R * z.R) {
        // PR #4 评审 P1：经 fire/dot/preserve-float 管线结算（吃火抗与火系增伤），
        // 死亡/掉落顺序与旧直算一致；中性敌人数值逐位不变
        this.applyBurnGroundDot(e, burnGroundDps(p), dt);
        if (e.hp <= 0) this.killEnemy(e);
      }
    }
  }

  // ---- 陨星 ----
  if (p.meteor > 0) {
    p.meteorT -= dt;
    if (p.meteorT <= 0) {
      p.meteorT = Math.max(2.2, 4.6 - p.meteor * 0.4);
      const tgt = this.enemies.filter((e) => !e.dead);
      if (tgt.length) {
        let t = tgt[Math.floor(Math.random() * tgt.length)];
        // Issue #45 天眼制导：砸向敌人最密集处
        if (p.meteorGuided) {
          let best = -1;
          for (const c of tgt) {
            const n = tgt.filter(
              (o) => (o.x - c.x) ** 2 + (o.y - c.y) ** 2 < 90 * 90,
            ).length;
            if (n > best) {
              best = n;
              t = c;
            }
          }
        }
        this.meteors.push({ x: t.x, y: t.y, t: 0.8, R: 34 * p.area });
      }
    }
  }
  for (let i = this.meteors.length - 1; i >= 0; i--) {
    const m = this.meteors[i];
    m.t -= dt;
    if (m.t <= 0) {
      this.meteors.splice(i, 1);
      const R = m.R;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dx = e.x - m.x,
          dy = e.y - m.y;
        if (dx * dx + dy * dy < R * R)
          this.hurtEnemy(e, meteorDamage(p), 0, 0, {
            noChain: true,
            fromExplode: true,
            src: "meteor",
            type: "fire",
            form: "other",
          });
      }
      // Issue #45 焦土燃烧：陨星落点燃烧地带
      if (p.burnGround) this.burnZones.push({ x: m.x, y: m.y, R: m.R, t: 5 });
      for (let j = 0; j < 14; j++) {
        const a = Math.random() * Math.PI * 2;
        this.parts.push({
          x: m.x,
          y: m.y,
          vx: Math.cos(a) * 140,
          vy: Math.sin(a) * 140,
          life: 0.4,
          c: Math.random() < 0.5 ? "#ff9a3d" : "#ffe14a",
        });
      }
      this.shake = Math.min(this.shake + 3, 6);
      this.audio.beep(90, 0.25, "sawtooth", 0.07, -40);
    }
  }
}
