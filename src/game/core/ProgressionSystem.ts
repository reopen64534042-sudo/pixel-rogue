import type { GameCore } from "./GameCore";

export function updateProgression(this: GameCore, dt: number) {
  const p = this.player;
  // ---- 宝石 & 药水 ----
  for (let i = this.gems.length - 1; i >= 0; i--) {
    const g = this.gems[i];
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    g.vx *= 0.9;
    g.vy *= 0.9;
    const dx = p.x - g.x,
      dy = p.y - g.y,
      d = Math.hypot(dx, dy);
    if (g.auto) {
      g.x += (dx / d) * 260 * dt;
      g.y += (dy / d) * 260 * dt;
    } // 休整清场后自动飞向玩家
    else if (d < p.magnet) {
      const s = 160 + (p.magnet - d) * 4;
      g.x += (dx / d) * s * dt;
      g.y += (dy / d) * s * dt;
    }
    if (d < 6) {
      p.xp += g.v;
      this.gems.splice(i, 1);
      this.audio.beep(920 + Math.random() * 120, 0.05, "sine", 0.04);
      while (p.xp >= p.xpNext) {
        p.xp -= p.xpNext;
        p.lvl++;
        p.xpNext = Math.ceil(p.xpNext * 1.13);
        this.pendingLevels++;
      }
      if (this.pendingLevels > 0) this.openLevelPanel();
    }
  }
  const canPull = p.hp < p.maxhp; // 满血时血瓶不吸附
  const pullR = p.magnet * 0.4; // 血瓶吸附范围 ≤ 经验球的一半
  for (let i = this.potions.length - 1; i >= 0; i--) {
    const o = this.potions[i];
    const dx = p.x - o.x,
      dy = p.y - o.y;
    const d = Math.hypot(dx, dy);
    if (canPull && d >= 6 && d < pullR) {
      const s = 140;
      o.x += (dx / d) * s * dt;
      o.y += (dy / d) * s * dt;
    }
    if (dx * dx + dy * dy < 36) {
      p.hp = Math.min(p.maxhp, p.hp + 20);
      this.addText(p.x, p.y - 10, "+20", "#4dff88");
      this.potions.splice(i, 1);
      this.audio.beep(700, 0.12, "triangle", 0.06, 200);
    }
  }
}
