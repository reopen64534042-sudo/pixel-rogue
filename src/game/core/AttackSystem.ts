import type { GameCore } from "./GameCore";

export function updateAttacks(this: GameCore, dt: number) {
  const p = this.player;
  // ---- 自动攻击 ----
  p.fireCd -= dt;
  if (p.fireCd <= 0) {
    const tgt = this.nearestEnemy(p.x, p.y, 230);
    if (tgt) {
      p.fireCd =
        1 /
        (p.fireRate * (1 + p.haste * 0.1 + (p.rageT > 0 ? 0.2 * p.rageLv : 0)));
      const base = Math.atan2(tgt.y - p.y, tgt.x - p.x);
      for (let i = 0; i < p.multishot; i++) {
        // Issue #36 动态散布：目标附近敌人越少，弹道越收拢（孤立目标近平行）
        const near = this.enemies.reduce(
          (n, e) =>
            (e.x - tgt.x) ** 2 + (e.y - tgt.y) ** 2 < 110 * 110 ? n + 1 : n,
          0,
        );
        const spread = 0.04 + 0.12 * Math.min(1, (near - 1) / 4);
        const a = base + (i - (p.multishot - 1) / 2) * spread;
        this.bullets.push({
          x: p.x,
          y: p.y - 3,
          vx: Math.cos(a) * p.projSpeed,
          vy: Math.sin(a) * p.projSpeed,
          dmg: p.damage * p.boltDmgMul,
          pierce: p.pierce,
          life: 1.4,
          size: 2 * p.area,
          jumps: p.ricochet,
          hitList: [],
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
            { src: "orbit" },
          );
        }
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
        const t = tgt[Math.floor(Math.random() * tgt.length)];
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
          this.hurtEnemy(e, p.damage * 2 + p.meteor * 5, 0, 0, {
            noChain: true,
            fromExplode: true,
            src: "meteor",
          });
      }
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
