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
    const dx = p.x - b.x,
      dy = p.y - b.y,
      rr = p.r + b.r;
    if (dx * dx + dy * dy < rr * rr && p.hurtCd <= 0 && p.dashT <= 0) {
      this.ebullets.splice(i, 1);
      if (this.damagePlayer(b.dmg, { type: "physical", form: "ranged" }))
        return true;
    }
  }
}
