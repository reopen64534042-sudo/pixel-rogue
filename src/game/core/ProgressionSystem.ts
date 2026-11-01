import { CHEST_HEAL, potionHealAmount } from "../data/constants";
import { levelGrowthFor, levelGrowthSummary } from "../data/levelGrowth";
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
          tutorialGemStep(this.tutorialProf ?? this.prof, this.mageWeapon)
      )
        this.tutorialGemPicked = true;
      p.xp += g.v;
      this.gems.splice(i, 1);
      this.audio.beep(920 + Math.random() * 120, 0.05, "sine", 0.04);
      let gained = 0;
      while (p.xp >= p.xpNext) {
        p.xp -= p.xpNext;
        p.lvl++;
        p.xpNext = Math.ceil(p.xpNext * 1.13);
        gained++;
        // v139：等级是属性点来源，但只在休整期消费；升级不打断战斗。
        this.attributePoints += 2;
      }
      if (gained > 0) {
        // v149：等级自动成长走权威属性投影；重算后把本次升级的生命成长
        // 同步加到当前生命，保持「上限 +1、当前生命 +1」。
        this.recompute();
        p.hp = Math.min(
          p.maxhp,
          p.hp + (levelGrowthFor(this.prof, this.mageWeapon)?.maxHp ?? 0) * gained,
        );
        this.addText(
          p.x,
          p.y - 20,
          `升级 · 属性点 +${gained * 2}`,
          "#ffd24a",
        );
        this.addText(
          p.x,
          p.y - 34,
          `等级成长 · ${levelGrowthSummary(this.prof, gained, this.mageWeapon)}`,
          "#57e6ff",
          false,
          false,
          true,
        );
      }
    }
  }
  // v148：满血时不吸附，但踩上去仍会拾取并消耗，回复 0 且不显示数字——随意走位会浪费血瓶。
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
      const before = p.hp;
      p.hp = Math.min(p.maxhp, p.hp + potionHealAmount(this.waveN));
      const healed = Math.round(p.hp - before);
      if (healed > 0) {
        this.addText(p.x, p.y - 10, "+" + healed, "#4dff88");
        this.audio.beep(700, 0.12, "triangle", 0.06, 200);
      }
      this.potions.splice(i, 1);
    }
  }
  // 成长徽记 / 普通宝箱：平时留在原地等玩家踩上去；波次结束（auto）后像经验球一样飞过来。
  // 波末自动飞行**不看血量**：收球阶段要等 boxes 清空才开属性面板，
  // 满血不飞会让面板一直卡住（v91 修复）。
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
      // 取整：p.hp 可能是小数（生命汲取、生命回复都走浮点），直接相减会得到
      // 4.63000000000001 这类值并被原样拼进飘字（用户反馈「宝箱弹出一串小数」）。
      if (b.kind === "token") {
        const granted = this.grantAttrPicks(1);
        if (granted > 0)
          this.addText(
            p.x,
            p.y - 14,
            "成长徽记 · 属性额度 +1",
            "#57e6ff",
          );
        else {
          this.player.xp += 8;
          this.potions.push({ x: p.x, y: p.y });
          this.addText(
            p.x,
            p.y - 14,
            "本波额度已满 · 转经验 + 血包",
            "#9aa3c7",
          );
        }
      } else {
        const healed = Math.round(
          Math.min(CHEST_HEAL, Math.max(0, p.maxhp - p.hp)),
        );
        if (healed > 0) p.hp = Math.min(p.maxhp, p.hp + healed);
        const healText = healed > 0 ? ` · 生命 +${healed}` : "";
        if (this.attrQualityBoosts < 2) {
          this.attrQualityBoosts++;
          this.addText(
            p.x,
            p.y - 14,
            `普通宝箱 · 品质祝福 +1${healText}`,
            "#ffd24a",
          );
        } else {
          this.player.xp += 8;
          this.potions.push({ x: p.x, y: p.y });
          this.addText(
            p.x,
            p.y - 14,
            `宝箱祝福已满 · 转经验 + 血包${healText}`,
            "#9aa3c7",
          );
        }
      }
      this.audio.beep(1046, 0.1, "triangle", 0.05, 200);
    }
  }
}
