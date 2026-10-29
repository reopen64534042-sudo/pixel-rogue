import type { Profession, WarriorStyle } from "./types";
import type { GameCore } from "./GameCore";
import { WORLD, clamp } from "../data/constants";
import { WARRIOR_BALANCE } from "../data/warriorBalance";

/** 教程经验球步骤：战士多一个核心演示步，所以整体后移一位。 */
export function tutorialGemStep(prof: string | null): number {
  return prof === "warrior" ? 5 : 4;
}

export function tutorialTotalSteps(prof: string | null): number {
  return tutorialGemStep(prof) + 1;
}

/**
 * 新手教程练习场（v83 / v89）。
 *
 * 不单独做模式切换：复用同一个 GameCore / 战斗画面，只把波次系统冻结、
 * 放几个 0 伤害高血量木桩。完成或跳过后直接 startGame(prof) 正式开局，
 * 练习场的经验/构筑不会带进正式局。
 *
 * 步骤：0 移动 → 1 冲刺 → 2 自动攻击命中 → 3 职业课 → 4 经验球 → 5 完成。
 * 敌人 0 伤害、无掉落；玩家不会在教程里死亡。
 *
 * 每步条件满足后**不自动推进**：HUD 出现「下一步」按钮，由玩家点击进入下一步。
 * 法师自动施法会让「命中 / 站定命中多个目标」瞬间达成，自动推进会让文字一闪而过。
 */
export function startTutorial(
  this: GameCore,
  prof: Profession,
  warriorStyle: WarriorStyle = "katana",
) {
  this.resetGame(prof, warriorStyle);
  this.tutorialMode = true;
  this.tutorialStep = 0;
  this.tutorialStepReady = false;
  this.tutorialProf = prof;
  this.tutorialStartX = this.player.x;
  this.tutorialStartY = this.player.y;
  this.tutorialDashed = false;
  this.tutorialHit = false;
  this.tutorialProfDone = false;
  this.tutorialSpecialHits = 0;
  this.tutorialMoved = false;
  this.tutorialHeavyDone = false;
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
  // 战士教程临时给本流派 L1 核心卡，用来演示流/重斩；正式开局会重置。
  if (prof === "warrior") {
    const core = warriorStyle === "katana" ? "流·初" : "重斩";
    this.player.upCounts[core] = 1;
    this.player.picks.push(core);
  }
  this.view.started();
  const p = this.player;
  if (prof === "mage") {
    // 三只木桩靠在一起，方便教「法阵自动落最密集处 + 站定」。
    spawnDummy.call(this, p.x + 60, p.y);
    spawnDummy.call(this, p.x + 55, p.y - 16);
    spawnDummy.call(this, p.x + 55, p.y + 16);
  } else if (prof === "warrior") {
    // 三只木桩围在近战范围边缘，方便教「扇形一次打多个」。
    spawnDummy.call(this, p.x + 26, p.y);
    spawnDummy.call(this, p.x + 16, p.y - 18);
    spawnDummy.call(this, p.x + 16, p.y + 18);
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
  e.noKnock = true;
  e.defense = 0;
  e.resistances = {};
}

/** 每帧检查教程条件；满足后置 ready，等玩家点「下一步」。 */
export function updateTutorial(this: GameCore, _dt: number) {
  if (!this.tutorialMode) return;
  const prof = this.tutorialProf ?? this.prof;
  const total = tutorialTotalSteps(prof);
  if (this.tutorialStep >= total || this.tutorialStepReady) return;
  const p = this.player;
  const step = this.tutorialStep;
  const gemStep = tutorialGemStep(prof);
  let done = false;

  if (step === 0) {
    done =
      this.tutorialMoved ||
      Math.hypot(p.x - this.tutorialStartX, p.y - this.tutorialStartY) >= 40;
  } else if (step === 1) {
    done = this.tutorialDashed;
  } else if (step === 2) {
    done = this.tutorialHit;
  } else if (step === 3) {
    if (this.tutorialProf === "shooter") {
      // 保持 60% 射程外，并打出 3 发强化弹（默认每 4 发自动替换 1 发；快速装填后 3 发）。
      const atRange = this.enemies.some(
        (e) =>
          !e.dead &&
          Math.hypot(e.x - p.x, e.y - p.y) >= p.attackRange * 0.6,
      );
      done = atRange && this.tutorialSpecialHits >= 3;
    } else {
      done = this.tutorialProfDone;
    }
  } else if (prof === "warrior" && step === 4) {
    // 核心演示：太刀叠满 L1 的 5 层；大剑打出一次重斩。
    done =
      this.warriorStyle === "katana"
        ? this.warriorFlowStacks >= WARRIOR_BALANCE.flow.cap1
        : this.tutorialHeavyDone;
  } else if (step === gemStep) {
    if (!this.tutorialGemSpawned) {
      this.tutorialGemSpawned = true;
      // 放在磁吸范围（36px）之外：让玩家真的走过去捡，而不是生成即被吸走。
      this.gems.push({
        x: clamp(p.x - 64, 16, WORLD.w - 16),
        y: clamp(p.y, 16, WORLD.h - 16),
        vx: 0,
        vy: 0,
        v: 0,
      });
    }
    done = this.tutorialGemPicked;
  }
  this.tutorialStepReady = done;
}

/** 玩家点击「下一步」：当前步骤就绪时推进，并重置下一步的判定标记。 */
export function advanceTutorial(this: GameCore) {
  if (!this.tutorialMode || !this.tutorialStepReady) return false;
  const prof = this.tutorialProf ?? this.prof;
  const total = tutorialTotalSteps(prof);
  if (this.tutorialStep >= total) return false;
  this.tutorialStep += 1;
  this.tutorialStepReady = false;
  const step = this.tutorialStep;
  if (step === 2) this.tutorialHit = false;
  if (step === 3) {
    this.tutorialProfDone = false;
    this.tutorialSpecialHits = 0;
  }
  if (prof === "warrior" && step === 4) {
    this.tutorialHeavyDone = false;
    this.warriorFlowStacks = 0;
    this.warriorFlowT = 0;
    this.warriorFlowBurstT = 0;
    this.warriorSwingCount = 0;
  }
  if (step === tutorialGemStep(prof)) this.tutorialGemPicked = false;
  return true;
}

/** 完成/跳过教程：直接正式开局（同一职业），练习场状态全部重建。 */
export function finishTutorial(this: GameCore) {
  if (!this.tutorialMode) return;
  const prof = this.tutorialProf ?? this.prof;
  this.startGame(prof, this.warriorStyle);
}
