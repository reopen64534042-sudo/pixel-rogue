import type { GameCore } from "./GameCore";

export function updateProjectiles(this: GameCore, dt: number) {
  const p = this.player;
  // ---- 子弹 ----
  for (let i = this.bullets.length - 1; i >= 0; i--) {
    const b = this.bullets[i];
    // 最后一帧只走剩余寿命内的距离，仍检查端点碰撞。
    const travelTime = Math.min(dt, Math.max(0, b.life));
    if (travelTime <= 0) {
      this.bullets.splice(i, 1);
      continue;
    }
    b.x += b.vx * travelTime;
    b.y += b.vy * travelTime;
    b.life -= travelTime;
    // S2「贯穿轨迹」：沿路径投放能量线节点（节流 0.05s，寿命 0.6s）。
    // 用节点而不是连续几何，是为了让结算保持 O(节点数 × 敌人数) 的简单上界。
    if (b.trail && b.trail > 0) {
      b.trailT = (b.trailT ?? 0) - travelTime;
      if (b.trailT <= 0) {
        b.trailT = 0.05;
        this.trailZones.push({
          x: b.x,
          y: b.y,
          R: 7,
          t: 0.6,
          dmg: b.dmg * 0.15,
          hit: [],
        });
      }
    }
    let remove = false;
    for (const e of this.enemies) {
      if (e.dead || b.hitList.includes(e)) continue;
      const dx = e.x - b.x,
        dy = e.y - b.y;
      const rr = e.r + b.size;
      if (dx * dx + dy * dy < rr * rr) {
        const kx = (b.vx / p.projSpeed) * 4,
          ky = (b.vy / p.projSpeed) * 4;
        // S2「距离即收益」满档：发射时固化的暴击加成，在命中这一刻并入快照。
        // 用浅拷贝而不是改 b.stats（快照是只读的，且多发子弹可能共享同一对象）。
        const stats =
          b.critBonus && b.stats
            ? { ...b.stats, critChance: b.stats.critChance + b.critBonus }
            : b.stats;
        this.hurtEnemy(e, b.dmg, kx, ky, {
          src: "bullet",
          type: "physical",
          form: "ranged",
          attackerStats: stats,
        });
        b.hitList.push(e);
        if (b.pierce > 0) {
          b.pierce--;
          // S2：衰减系数从硬编码 0.85 改为发射时固化的属性值
          //（射手职业 0.5、破甲箭 0.8、弹道贯穿 1.0）
          b.dmg *= b.falloff;
        } else if (b.jumps > 0) {
          // 弹射: 转向最近的未命中敌人
          const t = this.nearestEnemy(b.x, b.y, 95, e);
          if (t) {
            const a = Math.atan2(t.y - b.y, t.x - b.x);
            const sp = Math.hypot(b.vx, b.vy);
            b.vx = Math.cos(a) * sp;
            b.vy = Math.sin(a) * sp;
            b.dmg *= 0.85;
            b.jumps--;
            b.life = 1.1;
            this.audio.beep(900, 0.04, "square", 0.02, 200);
          } else {
            remove = true;
          }
        } else remove = true;
        if (remove) break;
      }
    }
    if (remove || b.life <= 0) this.bullets.splice(i, 1);
  }

  // ---- S2「贯穿轨迹」能量线结算 ----
  // 每个节点对同一个敌人只结算一次（hit 记录），所以「穿过其间」的敌人
  // 无论停留多久都只吃一次 15%，符合「擦过即受伤」的直觉且有明确上界。
  for (let i = this.trailZones.length - 1; i >= 0; i--) {
    const z = this.trailZones[i];
    z.t -= dt;
    if (z.t <= 0) {
      this.trailZones.splice(i, 1);
      continue;
    }
    for (const e of this.enemies) {
      if (e.dead || z.hit.includes(e)) continue;
      const dx = e.x - z.x,
        dy = e.y - z.y;
      const rr = z.R + e.r;
      if (dx * dx + dy * dy < rr * rr) {
        z.hit.push(e);
        this.hurtEnemy(e, z.dmg, 0, 0, {
          src: "bullet",
          type: "physical",
          form: "ranged",
        });
      }
    }
  }

  // ---- 敌方弹幕 ----
  for (let i = this.ebullets.length - 1; i >= 0; i--) {
    const b = this.ebullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) {
      this.ebullets.splice(i, 1);
      continue;
    }
    // Issue #49：环绕飞刃反弹敌方弹幕（碰到即反弹，伤害不衰减，无冷却）
    if (p.bladeReflect && !b.reflected && p.orbit > 0) {
      const hitR = b.r + 5;
      for (let i = 0; i < p.orbit; i++) {
        const ba = p.orbA + (i * Math.PI * 2) / p.orbit;
        const bx = p.x + Math.cos(ba) * 26;
        const by = p.y + Math.sin(ba) * 26;
        const rdx = b.x - bx,
          rdy = b.y - by;
        if (rdx * rdx + rdy * rdy < hitR * hitR) {
          b.vx = -b.vx;
          b.vy = -b.vy;
          b.reflected = true;
          b.life = Math.max(b.life, 3);
          this.addText(b.x, b.y - 6, "反弹", "#9fe1ff");
          this.audio.beep(1200, 0.05, "square", 0.03, 250);
          break;
        }
      }
    }
    // 反弹后的弹幕对敌人结算（不衰减；不再伤害玩家）
    if (b.reflected) {
      let hit = false;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const edx = e.x - b.x,
          edy = e.y - b.y;
        const err = e.r + b.r;
        if (edx * edx + edy * edy < err * err) {
          const kx = (b.vx / 200) * 4,
            ky = (b.vy / 200) * 4;
          this.hurtEnemy(e, b.dmg, kx, ky, {
            src: "reflect",
            type: "physical",
            form: "ranged",
          });
          hit = true;
          break;
        }
      }
      if (hit) {
        this.ebullets.splice(i, 1);
        continue;
      }
      continue;
    }
    const dx = p.x - b.x,
      dy = p.y - b.y,
      rr = p.r + b.r;
    if (dx * dx + dy * dy < rr * rr && p.hurtCd <= 0 && p.dashT <= 0) {
      this.ebullets.splice(i, 1);
      const hit = this.damagePlayer(b.dmg, {
        type: "physical",
        form: "ranged",
        attackerStats: b.stats,
      });
      if (hit.killed) return true;
    }
  }
}
