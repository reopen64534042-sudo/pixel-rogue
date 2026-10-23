import { UPGRADES } from "../data/talents";
import type { GameCore } from "./GameCore";

export function openSwap(this: GameCore) {
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
  if (
    this.state !== "play" ||
    this.wavePhase !== "rest" ||
    !this.swapOpen ||
    !this.swTarget ||
    !u ||
    u.t !== this.swTarget - 1 ||
    !lv
  )
    return false;
  if (current < lv && this.selectedCount() < 2) this.swSel[name] = current + 1;
  else delete this.swSel[name];
  return true;
}
export function melt(this: GameCore) {
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
  output.f(this.player);
  this.player.upCounts[output.n] = (this.player.upCounts[output.n] || 0) + 1;
  this.player.picks.push(output.n);
  this.swSel = {};
  this.swTarget = 0;
  this.swapOpen = false;
  this.swapUsedThisRest = true;
  this.view.rest();
  this.audio.beep(300, 0.25, "sawtooth", 0.07, 500);
  return output;
}
