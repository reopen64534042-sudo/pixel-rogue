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
  if (!mx && !my) {
    mx =
      (this.keys["d"] || this.keys["arrowright"] ? 1 : 0) -
      (this.keys["a"] || this.keys["arrowleft"] ? 1 : 0);
    my =
      (this.keys["s"] || this.keys["arrowdown"] ? 1 : 0) -
      (this.keys["w"] || this.keys["arrowup"] ? 1 : 0);
  }
  if (mx && my) {
    mx *= 0.7071;
    my *= 0.7071;
  }
  if (mx || my) {
    p.dx = mx;
    p.dy = my;
  }
  p.dashT -= dt;
  // 冲刺充能制 (二段冲刺增加上限)
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
    (this.keys[" "] || this.dashHeld) &&
    p.dashCharges > 0 &&
    p.dashT <= -0.1
  ) {
    p.dashT = 0.16;
    p.dashCharges--;
    if (p.dashCharges === dchMax - 1 && p.dashRe <= 0) p.dashRe = p.dashMax;
    this.audio.beep(300, 0.1, "sine", 0.06, 500);
  }
  if (p.dashT > 0) {
    p.x += p.dx * 280 * dt;
    p.y += p.dy * 280 * dt;
    this.parts.push({
      x: p.x,
      y: p.y + 2,
      vx: 0,
      vy: 0,
      life: 0.25,
      c: "#57e6ff",
    });
  } else {
    p.x += mx * p.speed * dt;
    p.y += my * p.speed * dt;
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
  this.chainCd -= dt;
}
