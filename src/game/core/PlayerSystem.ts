import { WORLD, clamp } from "../data/constants";
import { WEB_ZONE } from "../data/enemies";
import { WARRIOR_BALANCE as WB } from "../data/warriorBalance";
import { warriorIaiCap, warriorIaiStep } from "./WarriorSystem";
import type { GameCore } from "./GameCore";

export function updatePlayer(this: GameCore, dt: number) {
  const p = this.player;
  // ---- 玩家移动 ----
  // ---- 移动 & 冲刺 ----
  // Issue #95：触控八向向量优先；无触控输入时退回键盘分支，两种来源互不覆盖。
  // 摇杆已把方向吸附成 -1/0/1，因此下面的对角归一与移动规则保持不变。
  let mx = this.moveX;
  let my = this.moveY;
  const kb = this.keybinds;
  if (!mx && !my) {
    mx =
      (this.keys[kb.right] || this.keys["arrowright"] ? 1 : 0) -
      (this.keys[kb.left] || this.keys["arrowleft"] ? 1 : 0);
    my =
      (this.keys[kb.down] || this.keys["arrowdown"] ? 1 : 0) -
      (this.keys[kb.up] || this.keys["arrowup"] ? 1 : 0);
  }
  if (mx && my) {
    mx *= 0.7071;
    my *= 0.7071;
  }
  if (this.tutorialMode && (mx || my)) this.tutorialMoved = true;
  if (mx || my) {
    p.dx = mx;
    p.dy = my;
  }
  const dashingBefore = p.dashT > 0;
  p.dashT -= dt;
  if (dashingBefore && p.dashT <= 0) {
    // S2「疾行」：冲刺刚结束的那一帧开一个 0.5 秒射速窗口，并装填下一发强化弹
    if ((p.upCounts["疾行"] || 0) > 0) {
      this.dashFireBoostT = 0.5;
      this.specialLoaded = true;
    }
    // 「双段疾冲」：每次冲刺让强化弹装填计数前进一步
    if ((p.upCounts["双段疾冲"] || 0) > 0) this.shotCounter++;
    // 战士疾冲：在冲刺结束帧结算路径伤害；残心开启下一刀窗口。
    if (this.prof === "warrior") {
      if (this.warriorDashFromX !== null && this.warriorDashFromY !== null)
        this.warriorDashDamage(
          this.warriorDashFromX,
          this.warriorDashFromY,
        );
      this.warriorDashFromX = null;
      this.warriorDashFromY = null;
      // 残心窗口改为读配置（原来写死 1 秒，warriorBalance.resolveWindow 是死字段）
      if ((p.upCounts["残心"] || 0) > 0)
        this.warriorResolveT = WB.resolveWindow;
      // 冲刺后移速爆发：每次冲刺结束都给，不占卡位（机动链的基础层）
      this.warriorDashBoostT = WB.dashBoostWindow;
    }
  }
  // 冲刺后移速爆发的倒计时
  if (this.warriorDashBoostT > 0)
    this.warriorDashBoostT = Math.max(0, this.warriorDashBoostT - dt);
  if (this.dashFireBoostT > 0) this.dashFireBoostT -= dt;
  // 冲刺充能制（「双段疾冲」增加上限）
  const dchMax = 1 + p.dashChargeLv;
  if (p.dashLv && p.dashCharges < dchMax) {
    p.dashRe -= dt;
    if (p.dashRe <= 0) {
      p.dashCharges++;
      if (p.dashCharges < dchMax) p.dashRe = p.dashMax;
    }
  }
  if (
    p.dashLv &&
    (this.keys[kb.dash] || this.dashHeld) &&
    p.dashCharges > 0 &&
    p.dashT <= -0.1
  ) {
    // 战士跃击：冲刺改为跳向密集敌群；成功时不进入普通冲刺。
    const leap =
      this.prof === "warrior" &&
      (p.upCounts["跃击"] || 0) > 0 &&
      this.warriorLeap();
    if (!leap) {
      p.dashT = 0.16;
      p.dashCharges--;
      if (p.dashCharges === dchMax - 1 && p.dashRe <= 0)
        p.dashRe = p.dashMax;
      if (this.tutorialMode) this.tutorialDashed = true;
      this.warriorDashFromX = null;
      this.warriorDashFromY = null;
      if (this.prof === "warrior" && (p.upCounts["疾冲"] || 0) > 0) {
        this.warriorDashFromX = p.x;
        this.warriorDashFromY = p.y;
      }
    }
    // S3 法师：冲刺中断施法（设计：施法前摇可被冲刺打断）。
    // 只打断「抬手」段；收束段（法阵已经成形）不可打断。
    this.interruptMageCast();
    if (!leap) this.audio.beep(300, 0.1, "sine", 0.06, 500);
  }
  if (p.dashT > 0) {
    // S2：冲刺位移按 dashDistMul 缩放（疾行 +25%；疾冲再 +30%）
    // #180：战士额外吃职业基础倍率（baseDashMul 1.5），与「疾冲」卡的 1.3 独立相乘。
    const dashSpeed =
      280 *
      p.dashDistMul *
      (this.prof === "warrior" ? WB.baseDashMul : 1) *
      (this.prof === "warrior" && (p.upCounts["疾冲"] || 0) > 0
        ? WB.dashDistMul
        : 1);
    p.x += p.dx * dashSpeed * dt;
    p.y += p.dy * dashSpeed * dt;
    this.parts.push({
      x: p.x,
      y: p.y + 2,
      vx: 0,
      vy: 0,
      life: 0.25,
      c:
        this.prof === "warrior"
          ? WB.styles[this.warriorStyle].trail
          : "#57e6ff",
    });
  } else {
    // S2「滞空」：闪避成功后 0.5 秒的移速加成
    // 机动链基础层：冲刺后 dashBoostWindow 秒内线性衰减的移速爆发
    const dashBoost =
      this.warriorDashBoostT > 0
        ? 1 + WB.dashBoostMul * (this.warriorDashBoostT / WB.dashBoostWindow)
        : 1;
    const boost = (this.dodgeBoostT > 0 ? 1.2 : 1) * dashBoost;
    const webSlow = this.webZones.some((z) => {
      if (z.arm > 0) return false;
      const dx = p.x - z.x;
      const dy = p.y - z.y;
      return dx * dx + dy * dy < z.R * z.R;
    })
      ? WEB_ZONE.slow
      : 1;
    p.x += mx * p.speed * boost * webSlow * dt;
    p.y += my * p.speed * boost * webSlow * dt;

    // 「居合」积势：走路攒层，满层后停攒等下一刀（见 warriorBalance.iai）。
    // 势只增不减——挥砍不清空，只有满层触发的居合斩才会归零。
    const iaiCap = warriorIaiCap(this);
    if (iaiCap > 0 && this.warriorIaiStacks < iaiCap) {
      const moved = Math.hypot(mx, my) * p.speed * boost * webSlow * dt;
      const step = warriorIaiStep(this);
      this.warriorIaiDist += moved;
      while (this.warriorIaiDist >= step && this.warriorIaiStacks < iaiCap) {
        this.warriorIaiDist -= step;
        this.warriorIaiStacks++;
      }
      // 满层后余量归零，避免触发后立刻又攒出一层
      if (this.warriorIaiStacks >= iaiCap) this.warriorIaiDist = 0;
    }
  }
  // 世界边界
  p.x = clamp(p.x, 24, WORLD.w - 24);
  p.y = clamp(p.y, 24, WORLD.h - 24);
  p.hurtCd -= dt;
  if (p.regen) p.hp = Math.min(p.maxhp, p.hp + p.regen * dt);
  // 护盾回复
  if (p.shieldMax && p.shield < p.shieldMax) {
    p.shieldCd -= dt;
    if (p.shieldCd <= 0) {
      p.shield++;
      p.shieldCd = 10;
      this.audio.beep(760, 0.1, "sine", 0.05, 150);
    }
  }
  // 狂热衰减
  if (p.haste > 0) {
    p.hasteT -= dt;
    if (p.hasteT <= 0) p.haste = 0;
  }
  if (p.rageT > 0) p.rageT -= dt;
  // S2 闪避窗口递减（冷读/余韵是一次性标记，不在这里递减）
  if (this.dodgeProcT > 0) this.dodgeProcT -= dt;
  if (this.dodgeBoostT > 0) this.dodgeBoostT -= dt;
  // S2「惊弓 / 逆矢」冷却
  if (this.contactKnockCd > 0) this.contactKnockCd -= dt;
  if (this.counterCd > 0) this.counterCd -= dt;
  this.chainCd -= dt;
}
