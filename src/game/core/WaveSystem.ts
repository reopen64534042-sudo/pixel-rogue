import { UPGRADES } from "../data/talents";
import type { GameCore } from "./GameCore";
export function waveQuota(this: GameCore, n: number) {
  return Math.min(150, 20 + (n - 1) * 10);
}

export function startNextWave(this: GameCore) {
  if (
    this.state !== "play" ||
    this.wavePhase !== "rest" ||
    this.pendingLevels > 0
  )
    return false;
  this.bpMode = null;
  this.swapOpen = false;
  this.swTarget = 0;
  this.swSel = {};
  this.waveN++;
  this.beginWaveReport();
  this.quota = this.waveQuota(this.waveN);
  this.spawnedThisWave = 0;
  this.potionGrow = 0; // 血包转化计数每波重置，已获得的生命上限永久保留
  this.boxDropsThisWave = 0; // 宝箱掉落名额每波重置
  this.spawnCd = 1.2;
  this.wavePhase = "fight";
  this.state = "play";
  this.player.tempShield = this.player.barrierLv; // 壁垒: 每波临时护盾
  this.player.ndUsed = false; // 不屈: 每波重置
  this.swapUsedThisRest = false;
  this.addText(
    this.player.x,
    this.player.y - 18,
    "WAVE " + this.waveN,
    "#ff5b5b",
    true,
  );
  this.audio.beep(160, 0.25, "sawtooth", 0.07, 60);
  return true;
}

export function cardsOfTier(this: GameCore, t: number) {
  let v = 0;
  for (const [n, lv] of Object.entries(this.player.upCounts)) {
    const u = UPGRADES.find((u) => u.n === n);
    if (u && u.t === t) v += lv;
  }
  return v;
}

export function enterRest(this: GameCore) {
  this.wavePhase = "rest";
  this.bpMode = "rest";
  this.swapUsedThisRest = false;
  this.showRestBar();
}

export function updateWave(this: GameCore, dt: number) {
  // ---- 波次推进: 刷满配额且全部清空才算过波 ----
  if (this.wavePhase === "fight") {
    if (this.spawnedThisWave < this.quota) {
      this.spawnCd -= dt;
      if (this.spawnCd <= 0 && this.enemies.length < 160) {
        this.spawnCd = Math.max(0.35, 1.2 - this.waveN * 0.07);
        // Issue #48：12 波起每波 2 只 BOSS，20 波起 3 只（此前每 4 波 1 只）
        const eliteQuota =
          this.waveN >= 20 ? 3 : this.waveN >= 12 ? 2 : this.waveN % 4 === 0 ? 1 : 0;
        const isElite = this.spawnedThisWave < eliteQuota;
        if (isElite) {
          this.spawnEnemy("brute", true);
          this.spawnedThisWave++;
        } else {
          const batch = this.waveN >= 5 ? 2 : 1;
          for (let i = 0; i < batch && this.spawnedThisWave < this.quota; i++) {
            this.spawnEnemy();
            this.spawnedThisWave++;
          }
        }
      }
    } else if (this.enemies.length === 0) {
      // 本波怪清空 → 收尾: 先吸经验球、选完升级，再收宝箱，最后休整
      this.wavePhase = "collect";
      this.gems.forEach((g) => (g.auto = true));
      this.boxes.forEach((b) => (b.auto = true)); // 未拾取的宝箱自动飞向玩家
      this.audio.beep(520, 0.2, "triangle", 0.06, 180);
    }
  } else if (this.wavePhase === "collect") {
    // 经验球吸完、升级选完、宝箱全部收齐 → 依次开箱，开完才进休整
    if (
      this.gems.length === 0 &&
      this.pendingLevels === 0 &&
      this.boxes.length === 0
    ) {
      if (this.boxPicks > 0) {
        if (this.bpMode !== "box") this.openBoxPanel();
      } else this.enterRest();
    }
  }
}
