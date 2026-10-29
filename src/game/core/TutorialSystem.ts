import type { Profession } from "./types";
import type { GameCore } from "./GameCore";

/**
 * 新手教程练习场（v83）。
 *
 * 不单独做模式切换：复用同一个 GameCore / 战斗画面，只把波次系统冻结、
 * 放几个 0 伤害高血量木桩。完成或跳过后直接 startGame(prof) 正式开局，
 * 练习场的经验/构筑不会带进正式局。
 *
 * 步骤：0 移动 → 1 冲刺 → 2 自动攻击命中 → 3 职业课 → 4 经验球 → 5 完成。
 * 敌人 0 伤害、无掉落；玩家不会在教程里死亡。
 */
export function startTutorial(this: GameCore, prof: Profession) {
  this.resetGame(prof);
  this.tutorialMode = true;
  this.tutorialStep = 0;
  this.tutorialProf = prof;
  this.tutorialStartX = this.player.x;
  this.tutorialStartY = this.player.y;
  this.tutorialDashed = false;
  this.tutorialHit = false;
  this.tutorialProfDone = false;
  this.tutorialGemPicked = false;
  this.tutorialGemSpawned = false;
  // 教程不弹初始天赋/属性面板，使用职业基础形态教学。
  this.pendingLevels = 0;
  this.startTalentPending = false;
  this.bpMode = null;
  this.slots = [];
  this.attrPicks = 0;
  this.attrGrantedThisWave = 0;
  this.attrChoices = [];
  this.state = "play";
  this.wavePhase = "fight";
  this.quota = 0;
  this.spawnedThisWave = 0;
  this.enemies = [];
  this.gems = [];
  this.boxes = [];
  this.potions = [];
  this.view.started();
  const p = this.player;
  if (prof === "mage") {
    // 三只木桩靠在一起，方便教「法阵自动落最密集处 + 站定」。
    spawnDummy.call(this, p.x + 60, p.y);
    spawnDummy.call(this, p.x + 55, p.y - 16);
    spawnDummy.call(this, p.x + 55, p.y + 16);
  } else {
    // 射手：目标放在远距离，先教「保持距离」。
    spawnDummy.call(this, p.x + 90, p.y);
  }
}

function spawnDummy(this: GameCore, x: number, y: number) {
  this.spawnEnemy("slime");
  const e = this.enemies[this.enemies.length - 1];
  e.x = x;
  e.y = y;
  e.hp = e.maxhp = 9999;
  e.speed = 0;
  e.dmg = 0;
  e.r = 5;
  e.xp = 0;
  e.noDrop = true;
  e.defense = 0;
  e.resistances = {};
}

/** 每帧推进教程步骤；在 Simulation 末尾调用。 */
export function updateTutorial(this: GameCore, _dt: number) {
  if (!this.tutorialMode) return;
  const p = this.player;
  const step = this.tutorialStep;
  let next = step;

  if (step === 0) {
    if (
      Math.hypot(p.x - this.tutorialStartX, p.y - this.tutorialStartY) >= 40
    )
      next = 1;
  } else if (step === 1) {
    if (this.tutorialDashed) next = 2;
  } else if (step === 2) {
    if (this.tutorialHit) next = 3;
  } else if (step === 3) {
    if (this.tutorialProf === "shooter") {
      // 让目标保持在射程的 60% 以外即可；不要求目标死亡。
      this.tutorialProfDone = this.enemies.some(
        (e) =>
          !e.dead &&
          Math.hypot(e.x - p.x, e.y - p.y) >= p.attackRange * 0.6,
      );
    }
    if (this.tutorialProfDone) next = 4;
  } else if (step === 4) {
    if (!this.tutorialGemSpawned) {
      this.tutorialGemSpawned = true;
      this.gems.push({ x: p.x + 24, y: p.y, vx: 0, vy: 0, v: 0 });
    }
    if (this.tutorialGemPicked) next = 5;
  }

  if (next !== step) {
    this.tutorialStep = next;
    if (next === 2) this.tutorialHit = false;
    if (next === 3) this.tutorialProfDone = false;
    if (next === 4) this.tutorialGemPicked = false;
  }
}

/** 完成/跳过教程：直接正式开局（同一职业），练习场状态全部重建。 */
export function finishTutorial(this: GameCore) {
  if (!this.tutorialMode) return;
  const prof = this.tutorialProf ?? this.prof;
  this.startGame(prof);
}
