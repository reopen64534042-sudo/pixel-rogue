import type { GameCore } from "./GameCore";

export function updateProjectiles(this: GameCore, dt: number) {
  const p = this.player;
  // ---- 子弹 ----
  for (let i = this.bullets.length - 1; i >= 0; i--) {
    const b = this.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) {
      this.bullets.splice(i, 1);
      continue;
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
        this.hurtEnemy(e, b.dmg, kx, ky, {
          src: "bullet",
          type: "physical",
          form: "ranged",
          attackerStats: b.stats,
        });
        b.hitList.push(e);
        if (b.pierce > 0) {
          b.pierce--;
          b.dmg *= 0.85;
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
    if (remove) this.bullets.splice(i, 1);
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
