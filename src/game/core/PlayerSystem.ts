import { WORLD, clamp } from "../data/constants";
import { WEB_ZONE } from "../data/enemies";
import {
  WARRIOR_BALANCE as WB,
  shieldRebuildSeconds,
  warriorTriDashCd,
} from "../data/warriorBalance";
import {
  finishWarriorTriDash,
  updateWarriorLeapMotion,
  warriorIaiCap,
  warriorIaiStep,
} from "./WarriorSystem";
import type { GameCore } from "./GameCore";

/**
 * 当前实际移动速度：基础移速 × 闪避/冲刺加成 × 蛛网减速。
 * 移动与 C 面板共用，避免面板显示基础值、实战却按加成跑。
 */
export function playerMoveSpeed(core: GameCore): number {
  const p = core.player;
  const dashBoost =
    core.warriorDashBoostT > 0
      ? 1 + WB.dashBoostMul * (core.warriorDashBoostT / WB.dashBoostWindow)
      : 1;
  const boost = (core.dodgeBoostT > 0 ? 1.2 : 1) * dashBoost;
  const webSlow = core.webZones.some((z) => {
    if (z.arm > 0) return false;
    const dx = p.x - z.x;
    const dy = p.y - z.y;
    return dx * dx + dy * dy < z.R * z.R;
  })
    ? WEB_ZONE.slow
    : 1;
  return p.speed * boost * webSlow;
}

/** 走路与冲刺共用的「势」积累；满层后清空余量，避免触发后立刻又攒一层。 */
function addIaiDistance(core: GameCore, moved: number) {
  const cap = warriorIaiCap(core);
  if (cap <= 0 || core.warriorIaiStacks >= cap) return;
  const step = warriorIaiStep(core);
  core.warriorIaiDist += moved;
  while (core.warriorIaiDist >= step && core.warriorIaiStacks < cap) {
    core.warriorIaiDist -= step;
    core.warriorIaiStacks++;
  }
  if (core.warriorIaiStacks >= cap) core.warriorIaiDist = 0;
}

export function updatePlayer(this: GameCore, dt: number) {
  const p = this.player;
  // v131：跃击起手/坠落由 WarriorSystem 统一推进；先于移动和相机。
  updateWarriorLeapMotion.call(this, dt);
  // 三段斩使用 3 个独立冲刺槽：各自倒计时，当前段对应的槽才可消费。
  const triOwned =
    this.prof === "warrior" &&
    this.warriorStyle === "greatsword" &&
    (p.upCounts["三段斩"] || 0) > 0;
  if (triOwned) {
    for (let i = 0; i < 3; i++)
      if (this.warriorTriSlotRe[i] > 0)
        this.warriorTriSlotRe[i] = Math.max(0, this.warriorTriSlotRe[i] - dt);
    // 触摸冲刺键/兼容旧 UI：当前段可用显示 1，否则 0；三格进度由脚底 UI 单独画。
    p.dashCharges =
      this.warriorTriSlotRe[this.warriorTriDashStage] <= 0 ? 1 : 0;
    p.dashRe = 0;
  } else if (this.warriorTriSlotRe.some((t) => t > 0)) {
    this.warriorTriSlotRe = [0, 0, 0];
  }
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
  if (dashingBefore && p.dashT <= 0 && !this.warriorLeapState) {
    // S2「疾行」：冲刺刚结束的那一帧开一个 0.5 秒射速窗口，并装填下一发强化弹
    if ((p.upCounts["疾行"] || 0) > 0) {
      this.dashFireBoostT = 0.5;
      this.specialLoaded = true;
    }
    // 「双段疾冲」：每次冲刺让强化弹装填计数前进一步
    if ((p.upCounts["双段疾冲"] || 0) > 0) this.shotCounter++;
    // 战士斩浪：在冲刺结束帧结算路径伤害；残心开启下一刀窗口。
    if (this.prof === "warrior") {
      if (this.warriorDashFromX !== null && this.warriorDashFromY !== null) {
        this.warriorDashDamage(
          this.warriorDashFromX,
          this.warriorDashFromY,
        );
        this.warriorLianShanDash(
          this.warriorDashFromX,
          this.warriorDashFromY,
        );
      }
      // 三段斩第 1/2 段末尾攻击；第 3 段已在跃击落地时结算。
      if (this.warriorTriDashActive) finishWarriorTriDash.call(this);
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
  if (!triOwned && p.dashLv && p.dashCharges < dchMax) {
    p.dashRe -= dt;
    if (p.dashRe <= 0) {
      p.dashCharges++;
      if (p.dashCharges < dchMax) p.dashRe = p.dashMax;
    }
  }
  const triSlotReady =
    triOwned && this.warriorTriSlotRe[this.warriorTriDashStage] <= 0;
  const hasCharge = triOwned ? triSlotReady : p.dashCharges > 0;
  if (
    p.dashLv &&
    !this.warriorLeapState &&
    (this.keys[kb.dash] || this.dashHeld) &&
    hasCharge &&
    p.dashT <= -0.1
  ) {
    // 大剑三段斩：第三段改走跃击状态机；其余段先按普通冲刺起手。
    const leapOwned = (p.upCounts["跃击"] || 0) > 0;
    const triStage3 = triOwned && this.warriorTriDashStage === 2;
    // warriorLeap 内部要能识别「三段斩第三段」，因此先写 active 再调用。
    this.warriorTriDashActive = triOwned;
    // 战士跃击：冲刺改为跳向密集敌群；成功时不进入普通冲刺。
    // 三段斩第三段只有在持有跃击时才替换为跃击；否则正常冲刺出旋斩。
    const leap =
      this.prof === "warrior" &&
      leapOwned &&
      (triOwned ? triStage3 : true) &&
      this.warriorLeap(triStage3 ? { triStage3: true } : undefined);
    if (!leap) {
      p.dashT = 0.16;
      if (triOwned) {
        this.warriorTriSlotRe[this.warriorTriDashStage] =
          warriorTriDashCd(p.dashMax, p.lvl);
        p.dashCharges = 0;
        p.dashRe = 0;
      } else {
        p.dashCharges--;
        if (p.dashCharges === dchMax - 1 && p.dashRe <= 0)
          p.dashRe = p.dashMax;
      }
      if (this.tutorialMode) this.tutorialDashed = true;
      this.warriorTriDashActive = triOwned;
      this.warriorDashFromX = null;
      this.warriorDashFromY = null;
      if (this.prof === "warrior") {
        if (
          triOwned ||
          (p.upCounts["斩浪"] || 0) > 0 ||
          (p.upCounts["连闪"] || 0) > 0
        ) {
          this.warriorDashFromX = p.x;
          this.warriorDashFromY = p.y;
        }
      }
    }
    // S3 法师：冲刺中断施法（设计：施法前摇可被冲刺打断）。
    // 只打断「抬手」段；收束段（法阵已经成形）不可打断。
    this.interruptMageCast();
    if (!leap) this.audio.beep(300, 0.1, "sine", 0.06, 500);
  }
  // Dedicated leap motion owns position until its landing hit settles.
  if (!this.warriorLeapState && p.dashT > 0) {
    // S2：冲刺位移按 dashDistMul 缩放（疾行 +25%；斩浪再 +30%）
    // #180：战士额外吃职业基础倍率（baseDashMul 1.5），与「斩浪」卡的 1.3 独立相乘。
    const triMul = this.warriorTriDashActive
      ? this.warriorTriDashStage === 0
        ? WB.triDash.distMul1
        : this.warriorTriDashStage === 1
          ? WB.triDash.distMul2
          : WB.triDash.distMul3
      : 1;
    const dashSpeed =
      280 *
      p.dashDistMul *
      (this.prof === "warrior" ? WB.baseDashMul : 1) *
      (this.prof === "warrior" && (p.upCounts["斩浪"] || 0) > 0
        ? WB.dashDistMul
        : 1) *
      triMul;
    const dashFromX = p.x;
    const dashFromY = p.y;
    p.x += p.dx * dashSpeed * dt;
    p.y += p.dy * dashSpeed * dt;
    // 冲刺位移也计入「势」：原来只算走路，冲刺经过的距离被漏掉。
    addIaiDistance(this, Math.hypot(p.x - dashFromX, p.y - dashFromY));
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
  } else if (!this.warriorLeapState) {
    // S2「滞空」：闪避成功后 0.5 秒的移速加成
    // 机动链基础层：冲刺后 dashBoostWindow 秒内线性衰减的移速爆发
    const moveSpeed = playerMoveSpeed(this);
    p.x += mx * moveSpeed * dt;
    p.y += my * moveSpeed * dt;

    // 「居合」积势：走路攒层，满层后停攒等下一刀（见 warriorBalance.iai）。
    // 势只增不减——挥砍不清空，只有满层触发的居合斩才会归零。
    addIaiDistance(this, Math.hypot(mx, my) * moveSpeed * dt);
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
      p.shieldCd = shieldRebuildSeconds(p.upCounts);
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
