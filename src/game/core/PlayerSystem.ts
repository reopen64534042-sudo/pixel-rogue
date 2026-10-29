import { WORLD, clamp } from "../data/constants";
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
  }
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
    p.dashT = 0.16;
    p.dashCharges--;
    if (p.dashCharges === dchMax - 1 && p.dashRe <= 0) p.dashRe = p.dashMax;
    if (this.tutorialMode) this.tutorialDashed = true;
    // S3 法师：冲刺中断施法（设计：施法前摇可被冲刺打断）。
    // 只打断「抬手」段；收束段（法阵已经成形）不可打断。
    this.interruptMageCast();
    this.audio.beep(300, 0.1, "sine", 0.06, 500);
  }
  if (p.dashT > 0) {
    // S2：冲刺位移按 dashDistMul 缩放（疾行 +25%）
    const dashSpeed = 280 * p.dashDistMul;
    p.x += p.dx * dashSpeed * dt;
    p.y += p.dy * dashSpeed * dt;
    this.parts.push({
      x: p.x,
      y: p.y + 2,
      vx: 0,
      vy: 0,
      life: 0.25,
      c: "#57e6ff",
    });
  } else {
    // S2「滞空」：闪避成功后 0.5 秒的移速加成
    const boost = this.dodgeBoostT > 0 ? 1.2 : 1;
    p.x += mx * p.speed * boost * dt;
    p.y += my * p.speed * boost * dt;
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
