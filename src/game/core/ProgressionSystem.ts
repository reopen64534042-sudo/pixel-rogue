import {
  CHEST_HEAL,
  ELITE_BOX_GAIN,
  ELITE_BOX_POINT_CAP,
  POTION_GROW_CAP,
} from "../data/constants";
import type { GameCore } from "./GameCore";
import { tutorialGemStep } from "./TutorialSystem";

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
      if (
        this.tutorialMode &&
        this.tutorialStep ===
          tutorialGemStep(this.tutorialProf ?? this.prof)
      )
        this.tutorialGemPicked = true;
      p.xp += g.v;
      this.gems.splice(i, 1);
      this.audio.beep(920 + Math.random() * 120, 0.05, "sine", 0.04);
      while (p.xp >= p.xpNext) {
        p.xp -= p.xpNext;
        p.lvl++;
        p.xpNext = Math.ceil(p.xpNext * 1.13);
        // S2：**升级不再发放天赋**。天赋改由「每 4 波节点精英 + 终局」发放
        //（一局 8 次），属性强化由波末结算发放。v46 起等级也不再参与怪物生命
        //（lvlPow 已移除），只保留两个职责：属性稀有度档位（AttributeSystem
        // 的 rarityChances）与 HUD 显示。
      }
    }
  }
  // 满血时不再吸附：满血血包会转最大生命，但让玩家自己决定何时踩上去；
  // 手动接触仍保留满血转化（不再自动把血包吸走）。
  const pullR = p.magnet * 0.4; // 血瓶吸附范围 ≤ 经验球的一半
  for (let i = this.potions.length - 1; i >= 0; i--) {
    const o = this.potions[i];
    const dx = p.x - o.x,
      dy = p.y - o.y;
    const d = Math.hypot(dx, dy);
    if (p.hp < p.maxhp && d >= 6 && d < pullR) {
      const s = 140;
      o.x += (dx / d) * s * dt;
      o.y += (dy / d) * s * dt;
    }
    if (dx * dx + dy * dy < 36) {
      if (p.hp >= p.maxhp) {
        // 满血转化：每波最多 +POTION_GROW_CAP 点最大生命，加成本身永久保留
        if (this.potionGrow < POTION_GROW_CAP) {
          this.potionGrow++;
          // C3-A（D-C3-01）：先累计实例级持久来源（权威），再即时双写实体
          // 兼容投影——保持本帧 regen/满血判定/治疗读取行为不变；实体字段
          // 不构成第二来源，recompute 由投影以 potionMaxHpGrow 重建（契约 §8.2）
          this.potionMaxHpGrow++;
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
  // 宝箱：平时留在原地等玩家踩上去；波次结束（auto）后像经验球一样飞过来。
  // 波末自动飞行**不看血量**：收球阶段要等 boxes 清空才开属性面板，
  // 满血不飞会让面板一直卡住（v91 修复）。「满血不吸附」只保留给血瓶。
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
      this.boxes.splice(i, 1);
      // v79：普通/精英宝箱拾取回血相同；满血时回复 0，但属性/经验照常。
      const healed = Math.min(CHEST_HEAL, Math.max(0, p.maxhp - p.hp));
      if (healed > 0) p.hp += healed;
      const healText = healed > 0 ? ` · 生命 +${healed}` : "";
      if (!b.special) {
        // 普通宝箱：固定 1 点，不受精英上限约束
        this.boxPicks += 1;
        this.addText(p.x, p.y - 14, `宝箱 +1${healText}`, "#ffc23d");
      } else {
        // Issue #87（用户批准的平衡变更）：特殊宝箱 1 点 + 每波精英点数上限 2，
        // 超出部分转为经验 + 血包（沿用 Issue #71 的兜底口径），避免后期多精英导致数值膨胀。
        const room = Math.max(
          0,
          ELITE_BOX_POINT_CAP - this.eliteBoxPointsThisWave,
        );
        const gain = Math.min(ELITE_BOX_GAIN, room);
        if (gain > 0) {
          this.eliteBoxPointsThisWave += gain;
          this.boxPicks += gain;
          this.addText(p.x, p.y - 14, `特殊宝箱 +${gain}${healText}`, "#ffd24a");
        } else {
          this.player.xp += 8;
          this.potions.push({ x: p.x, y: p.y });
          this.addText(
            p.x,
            p.y - 14,
            `精英宝箱已满 · 转经验 + 血包${healText}`,
            "#9aa3c7",
          );
        }
      }
      this.audio.beep(1046, 0.1, "triangle", 0.05, 200);
    }
  }
}
