import { POTION_GROW_CAP } from "../data/constants";
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
  // 满血也吸附：满血拾取会转化为最大生命，不再是废品
  const pullR = p.magnet * 0.4; // 血瓶吸附范围 ≤ 经验球的一半
  for (let i = this.potions.length - 1; i >= 0; i--) {
    const o = this.potions[i];
    const dx = p.x - o.x,
      dy = p.y - o.y;
    const d = Math.hypot(dx, dy);
    if (d >= 6 && d < pullR) {
      const s = 140;
      o.x += (dx / d) * s * dt;
      o.y += (dy / d) * s * dt;
    }
    if (dx * dx + dy * dy < 36) {
      if (p.hp >= p.maxhp) {
        // 满血转化：每波最多 +POTION_GROW_CAP 点最大生命，加成本身永久保留
        if (this.potionGrow < POTION_GROW_CAP) {
          this.potionGrow++;
          p.maxhp += 1;
          p.hp += 1;
          this.addText(p.x, p.y - 10, "生命上限+1", "#ffd24a");
        } else {
          this.addText(p.x, p.y - 10, "本波已满", "#8a93b0");
        }
      } else {
        p.hp = Math.min(p.maxhp, p.hp + 20);
        this.addText(p.x, p.y - 10, "+20", "#4dff88");
      }
      this.potions.splice(i, 1);
      this.audio.beep(700, 0.12, "triangle", 0.06, 200);
    }
  }
  // 宝箱：平时留在原地等玩家踩上去；波次结束（auto）后像经验球一样飞过来
  for (let i = this.boxes.length - 1; i >= 0; i--) {
    const b = this.boxes[i];
    const dx = p.x - b.x,
      dy = p.y - b.y;
    const d = Math.hypot(dx, dy);
    if (b.auto && d > 0.01) {
      b.x += (dx / d) * 300 * dt;
      b.y += (dy / d) * 300 * dt;
    }
    if (dx * dx + dy * dy < 64) {
      this.boxPicks++;
      this.boxes.splice(i, 1);
      this.addText(p.x, p.y - 14, "宝箱 +1", "#ffc23d");
      this.audio.beep(1046, 0.1, "triangle", 0.05, 200);
    }
  }
}
