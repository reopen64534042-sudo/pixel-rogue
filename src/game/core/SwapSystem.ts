import { UPGRADES } from "../data/talents";
import type { GameCore } from "./GameCore";

export function openSwap(this: GameCore) {
  this.ensurePlay(); // Issue #34
  if (
    this.state !== "play" ||
    this.wavePhase !== "rest" ||
    this.swapUsedThisRest
  )
    return false;
  this.swapOpen = true;
  this.swTarget = 0;
  this.swSel = {};
  return true;
}
export function setSwapTarget(this: GameCore, t: number) {
  this.ensurePlay(); // Issue #34
  if (
    !this.swapOpen ||
    this.state !== "play" ||
    ![1, 2, 3].includes(t) ||
    this.cardsOfTier(t - 1) < 2
  )
    return false;
  this.swTarget = t;
  this.swSel = {};
  return true;
}
export function selectedCount(this: GameCore) {
  return Object.values(this.swSel).reduce((a, b) => a + b, 0);
}
/** Cycle 0 → 1 → 2 → 0 for a two-level stack; never select more than two cards. */
export function selectMaterial(this: GameCore, name: string) {
  const u = UPGRADES.find((u) => u.n === name),
    lv = this.player.upCounts[name] || 0,
    current = this.swSel[name] || 0;
  this.ensurePlay(); // Issue #34
  if (
    this.state !== "play" ||
    this.wavePhase !== "rest" ||
    !this.swapOpen ||
    !u ||
    u.t > 2 ||
    !lv
  )
    return false;
  // Issue #74：两步式——目标档位由首选材料自动推导（材料档+1），
  // 后续材料必须与已选材料同稀有度；选空后回退目标档，允许改选其他档位。
  if (this.swTarget && u.t !== this.swTarget - 1) return false;
  if (current < lv && this.selectedCount() < 2) {
    this.swSel[name] = current + 1;
    this.swTarget = u.t + 1;
  } else {
    delete this.swSel[name];
    if (!this.selectedCount()) this.swTarget = 0;
  }
  return true;
}
export function melt(this: GameCore) {
  this.ensurePlay(); // Issue #34
  if (
    this.state !== "play" ||
    this.wavePhase !== "rest" ||
    !this.swapOpen ||
    this.swapUsedThisRest ||
    !this.swTarget ||
    this.selectedCount() !== 2
  )
    return null;
  for (const [name, count] of Object.entries(this.swSel)) {
    const u = UPGRADES.find((u) => u.n === name);
    if (
      !u ||
      u.t !== this.swTarget - 1 ||
      !Number.isInteger(count) ||
      count < 1 ||
      (this.player.upCounts[name] || 0) < count ||
      this.player.picks.filter((n) => n === name).length < count
    )
      return null;
  }
  // Preserve original output-pool timing, including prerequisite checks before consumption.
  const pool = this.availTalents(this.swTarget);
  if (!pool.length) return null;
  const output = pool[Math.floor(Math.random() * pool.length)];
  for (const [name, count] of Object.entries(this.swSel)) {
    for (let i = 0; i < count; i++)
      this.player.picks.splice(this.player.picks.lastIndexOf(name), 1);
    this.player.upCounts[name] -= count;
    if (!this.player.upCounts[name]) delete this.player.upCounts[name];
  }
  this.recompute();
  // S4-C C1：输出卡应用改经 learnTalent——与原三行（f → upCounts → picks）
  // 逐语句等价（f 先执行、记录顺序不变、无随机消耗），且 max 前置条件已由
  // availTalents→canOffer 在抽池时保证（选池与学习之间无状态变更）；学习
  // 后由 learnTalent 统一同步已迁移卡（C1/C2-A/C2-B 共十三张）的权威属性投影。
  this.learnTalent(output);
  this.swSel = {};
  this.swTarget = 0;
  this.swapOpen = false;
  this.swapUsedThisRest = true;
  this.view.rest();
  this.audio.beep(300, 0.25, "sawtooth", 0.07, 500);
  return output;
}
