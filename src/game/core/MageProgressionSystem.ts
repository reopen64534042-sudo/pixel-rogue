import {
  ELEMENTAL_MAGE,
  MAGE_ELEMENTS,
  MAGE_ELEMENT_CHOICES,
  MAGE_NORMAL_UPGRADES,
  MAGE_RARE_UPGRADES,
  MAGE_REACTIONS,
  MAGE_ULTIMATE_UPGRADES,
  STAFF_LEVELS,
  STAFF_XP_PER_CAST,
  elementOfChoice,
  mageUpgradeName,
  reactionForPair,
  reactionLabel,
} from "../data/elementalMage";
import type {
  MageElement,
  MageEpicUpgradeId,
  MageReactionId,
  MageSuit,
  MageUltimateUpgradeId,
  MageUpgradeId,
} from "../data/elementalMage";
import type { GameCore } from "./GameCore";
import type { Slot } from "./types";

/**
 * 元素法师 v2 的成长系统：法杖等级/经验、元素顺序、A/B 套装与反应领悟。
 *
 * 与施法/伤害解耦：这里只修改 GameCore 的成长状态并给出提示；
 * 轮盘推进在 MageSystem，反应结算在 ElementSystem。
 */

/** 当前轮盘元素。未选元素时返回 null（开局选择面板期间）。 */
export function mageCurrentElement(core: GameCore): MageElement | null {
  if (!core.mageElements.length) return null;
  const i = core.mageWheelIndex % core.mageElements.length;
  return core.mageElements[i];
}

/** 当前元素在轮盘上的前一个元素；不足两个元素时返回 null。 */
export function magePreviousElement(core: GameCore): MageElement | null {
  const n = core.mageElements.length;
  if (n < 2) return null;
  const i = (core.mageWheelIndex - 1 + n) % n;
  return core.mageElements[i];
}

export function hasMageUpgrade(
  core: GameCore,
  id: MageUpgradeId,
): boolean {
  return core.mageUpgrades.includes(id);
}

/** 元素凝聚 + 咏唱调律：元素状态持续时间加成（秒）。 */
export function mageStatusDurationBonus(core: GameCore): number {
  let bonus = 0;
  if (hasMageUpgrade(core, "elementFocus")) bonus += ELEMENTAL_MAGE.normal.elementFocusBonus;
  if (hasMageUpgrade(core, "tempo")) bonus += ELEMENTAL_MAGE.tempo.statusDuration;
  return bonus;
}

/** 咏唱调律：施法速度倍率。 */
export function mageCastSpeedMul(core: GameCore): number {
  return hasMageUpgrade(core, "tempo")
    ? 1 + ELEMENTAL_MAGE.tempo.castSpeed
    : 1;
}

/** 棱镜档位：0 无 / 1 稀有 / 2 史诗 / 3 史诗 + 终极碎裂。 */
export function magePrismTier(core: GameCore): 0 | 1 | 2 | 3 {
  if (hasMageUpgrade(core, "prismUltimate")) return 3;
  if (hasMageUpgrade(core, "prismEpic")) return 2;
  if (hasMageUpgrade(core, "prismRare")) return 1;
  return 0;
}

/** 反应精通 + 反应终章：反应伤害倍率。 */
export function mageReactionDamageMul(core: GameCore): number {
  let mul = 1;
  if (hasMageUpgrade(core, "reactionMastery"))
    mul += ELEMENTAL_MAGE.mastery.reactionDamage;
  if (hasMageUpgrade(core, "reactionFinale"))
    mul += ELEMENTAL_MAGE.finale.reactionDamage;
  return mul;
}

/** 法阵扩幅：法阵半径倍率。 */
export function mageCircleWidthMul(core: GameCore): number {
  return hasMageUpgrade(core, "circleWidth")
    ? ELEMENTAL_MAGE.normal.circleWidthMul
    : 1;
}

/** 元素选择面板的候选卡：只列尚未持有的元素。 */
export function mageElementPickSlots(core: GameCore): Slot[] {
  return MAGE_ELEMENT_CHOICES.filter((card) => {
    const el = elementOfChoice(card.n);
    return !!el && !core.mageElements.includes(el);
  }).map((u) => ({ u, used: true }));
}

/**
 * 玩家在面板中选择一个元素。
 *
 * - 第一元素：建立轮盘起点；
 * - 第二元素：确定 A/B 套装并领悟 A+B 反应；
 * - 第三元素：随机领悟 B+C 或 C+A 中一条。
 */
export function chooseMageElement(
  core: GameCore,
  cardName: string,
): boolean {
  const pending = core.mageElementPickPending;
  if (!pending) return false;
  const el = elementOfChoice(cardName);
  if (!el || core.mageElements.includes(el)) return false;
  core.mageElements.push(el);
  core.mageElementPickPending = null;

  if (pending === "first") {
    core.mageWheelIndex = 0;
    core.mageCastsInPhase = 0;
    core.addText(
      core.player.x,
      core.player.y - 26,
      `法杖 · 第一元素 ${MAGE_ELEMENTS[el].name}`,
      MAGE_ELEMENTS[el].color,
    );
    return true;
  }

  const first = core.mageElements[0];
  const prev = core.mageElements[core.mageElements.length - 2];

  if (pending === "second") {
    const reaction = reactionForPair(prev, el);
    if (reaction) {
      core.mageReactionIds.push(reaction);
      core.addText(
        core.player.x,
        core.player.y - 30,
        `领悟：${reactionLabel(reaction)}`,
        MAGE_REACTIONS[reaction].color,
      );
    }
    core.mageSuit = reaction
      ? MAGE_REACTIONS[reaction].suit
      : suitOfPair(first, el);
    const suit = core.mageSuit ?? "A";
    core.addText(
      core.player.x,
      core.player.y - 44,
      `元素套装 ${suit}`,
      suit === "A" ? "#c07bff" : "#ffd24a",
      false,
      false,
      true,
    );
  } else {
    // 第三元素：随机领悟 B+C / C+A 中的一条；另一条留给后续史诗池。
    const a = core.mageElements[0];
    const b = core.mageElements[1];
    const c = core.mageElements[2];
    const candidates = [reactionForPair(b, c), reactionForPair(c, a)].filter(
      (id): id is MageReactionId =>
        !!id && !core.mageReactionIds.includes(id),
    );
    const extra =
      candidates.length > 0
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : null;
    if (extra) {
      core.mageReactionIds.push(extra);
      core.addText(
        core.player.x,
        core.player.y - 44,
        `领悟：${reactionLabel(extra)}`,
        MAGE_REACTIONS[extra].color,
      );
    }
  }
  return true;
}

/** 由前两个元素推导套装（反应缺失时的兜底）。 */
function suitOfPair(a: MageElement, b: MageElement): MageSuit | null {
  const r = reactionForPair(a, b);
  return r ? MAGE_REACTIONS[r].suit : null;
}

/** 法杖升级：主施法成功命中后调用。 */
export function gainStaffXp(
  core: GameCore,
  amount = STAFF_XP_PER_CAST,
): void {
  if (core.prof !== "mage" || !core.mageElements.length) return;
  // 教程只教基础施法，不推进法杖等级（避免练习场弹出成长提示/待选面板）。
  if (core.tutorialMode) return;
  // 有元素待选时先暂停法杖经验：避免同一次等待里又升到 Lv6 覆盖待选项。
  if (core.mageElementPickPending) return;
  if (!Number.isFinite(amount) || amount <= 0) return;
  if (core.mageStaffLevel >= STAFF_LEVELS.length) {
    core.mageStaffXp = 0;
    return;
  }
  core.mageStaffXp += amount;
  while (core.mageStaffLevel < STAFF_LEVELS.length) {
    const need = STAFF_LEVELS[core.mageStaffLevel - 1].xpToNext;
    if (need === null || core.mageStaffXp < need) break;
    core.mageStaffXp -= need;
    core.mageStaffLevel++;
    applyStaffLevelGrant(core, core.mageStaffLevel);
    if (core.mageElementPickPending) break;
  }
  if (core.mageStaffLevel >= STAFF_LEVELS.length) core.mageStaffXp = 0;
}

/** 到达新法杖等级时发放对应池。 */
function applyStaffLevelGrant(core: GameCore, level: number): void {
  const p = core.player;
  if (level === 2) {
    const pool = MAGE_NORMAL_UPGRADES.filter(
      (u) => !core.mageUpgrades.includes(u.id),
    );
    if (pool.length) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      core.mageUpgrades.push(pick.id);
      core.addText(
        p.x,
        p.y - 30,
        `法杖 Lv.2 · 领悟：${pick.name}`,
        "#ffd24a",
      );
      return;
    }
  }
  if (level === 3) {
    core.mageElementPickPending = "second";
    core.addText(p.x, p.y - 30, "法杖 Lv.3 · 第二元素待领悟", "#57e6ff");
    return;
  }
  if (level === 4 || level === 5) {
    grantRareUpgrade(core, level);
    return;
  }
  if (level === 6) {
    core.mageElementPickPending = "third";
    core.addText(p.x, p.y - 30, "法杖 Lv.6 · 第三元素待领悟", "#57e6ff");
    return;
  }
  if (level === 7 || level === 8) {
    grantEpicRandom(core, level);
    return;
  }
  if (level === 9) {
    grantEpicRemaining(core, level);
    return;
  }
  if (level === 10 || level === 11) {
    grantUltimateRandom(core, level);
    return;
  }
  if (level === 12) {
    grantUltimateRemaining(core, level);
    return;
  }
  core.addText(p.x, p.y - 30, `法杖 Lv.${level}`, "#9aa3c7", false, false, true);
}

function grantRareUpgrade(core: GameCore, level: number): void {
  const p = core.player;
  if (magePrismTier(core) === 0) {
    core.mageUpgrades.push("prismRare");
    core.addText(
      p.x,
      p.y - 30,
      `法杖 Lv.${level} · 领悟：${mageUpgradeName("prismRare")}`,
      "#57e6ff",
    );
    return;
  }
  const pool = MAGE_RARE_UPGRADES.filter(
    (u) => u.id !== "prismRare" && !core.mageUpgrades.includes(u.id),
  );
  if (!pool.length) {
    core.addText(p.x, p.y - 30, `法杖 Lv.${level} · 稀有池已满`, "#9aa3c7", false, false, true);
    return;
  }
  const pick = pool[Math.floor(Math.random() * pool.length)];
  core.mageUpgrades.push(pick.id);
  core.addText(
    p.x,
    p.y - 30,
    `法杖 Lv.${level} · 领悟：${pick.name}`,
    "#4dff88",
  );
}

/** Lv6 未随机到的另一条反应；没有缺失时返回 null。 */
function missingReactionId(core: GameCore): MageReactionId | null {
  if (core.mageElements.length < 3) return null;
  const [, b, c] = core.mageElements;
  const a = core.mageElements[0];
  const candidates = [reactionForPair(b, c), reactionForPair(c, a)].filter(
    (id): id is MageReactionId =>
      !!id && !core.mageReactionIds.includes(id),
  );
  return candidates[0] ?? null;
}

function epicPool(core: GameCore): MageEpicUpgradeId[] {
  const pool: MageEpicUpgradeId[] = [];
  if (missingReactionId(core)) pool.push("missingReaction");
  if (!hasMageUpgrade(core, "prismEpic")) pool.push("prismEpic");
  if (!hasMageUpgrade(core, "reactionMastery")) pool.push("reactionMastery");
  return pool;
}

function grantEpicItem(
  core: GameCore,
  id: MageEpicUpgradeId,
  level: number,
): void {
  const p = core.player;
  if (id === "missingReaction") {
    const reaction = missingReactionId(core);
    if (!reaction) return;
    core.mageReactionIds.push(reaction);
    core.mageUpgrades.push("missingReaction");
    core.addText(
      p.x,
      p.y - 30,
      `法杖 Lv.${level} · 领悟：${reactionLabel(reaction)}`,
      MAGE_REACTIONS[reaction].color,
    );
    return;
  }
  core.mageUpgrades.push(id);
  core.addText(
    p.x,
    p.y - 30,
    `法杖 Lv.${level} · 领悟：${mageUpgradeName(id)}`,
    "#c07bff",
  );
}

function grantEpicRandom(core: GameCore, level: number): void {
  const pool = epicPool(core);
  if (!pool.length) {
    core.addText(core.player.x, core.player.y - 30, `法杖 Lv.${level} · 史诗池已满`, "#9aa3c7", false, false, true);
    return;
  }
  grantEpicItem(core, pool[Math.floor(Math.random() * pool.length)], level);
}

/** Lv9：优先补缺失反应，再补齐其余史诗项。 */
function grantEpicRemaining(core: GameCore, level: number): void {
  const missing = missingReactionId(core);
  if (missing) grantEpicItem(core, "missingReaction", level);
  for (const id of epicPool(core)) grantEpicItem(core, id, level);
}

function ultimatePool(core: GameCore): MageUltimateUpgradeId[] {
  return MAGE_ULTIMATE_UPGRADES.filter(
    (u) => !core.mageUpgrades.includes(u.id),
  ).map((u) => u.id);
}

function grantUltimateItem(
  core: GameCore,
  id: MageUltimateUpgradeId,
  level: number,
): void {
  core.mageUpgrades.push(id);
  core.addText(
    core.player.x,
    core.player.y - 30,
    `法杖 Lv.${level} · 领悟：${mageUpgradeName(id)}`,
    "#ffd24a",
  );
}

function grantUltimateRandom(core: GameCore, level: number): void {
  const pool = ultimatePool(core);
  if (!pool.length) {
    core.addText(core.player.x, core.player.y - 30, `法杖 Lv.${level} · 终极池已满`, "#9aa3c7", false, false, true);
    return;
  }
  grantUltimateItem(core, pool[Math.floor(Math.random() * pool.length)], level);
}

/** Lv12：补齐剩余终极项。 */
function grantUltimateRemaining(core: GameCore, level: number): void {
  for (const id of ultimatePool(core)) grantUltimateItem(core, id, level);
}

/**
 * DEV：直接配置元素法师成长，供受控冒烟使用。
 *
 * 与正常流程的区别：一次给满传入的元素与**全部**三条反应、普通池两项，
 * 便于逐条验证六反应；不写玩家天赋/属性。
 */
export function devConfigureElementalMage(
  this: GameCore,
  elements: readonly MageElement[],
  level = 12,
): void {
  const core = this;
  const unique = [...new Set(elements)].slice(0, 3);
  core.mageElements = unique;
  core.mageStaffLevel = Math.max(
    1,
    Math.min(STAFF_LEVELS.length, Math.floor(level) || 1),
  );
  core.mageStaffXp = 0;
  core.mageWheelIndex = 0;
  core.mageCastsInPhase = 0;
  core.mageElementPickPending = null;
  core.mageUpgrades = MAGE_NORMAL_UPGRADES.map((u) => u.id);
  core.mageReactionIds = [];
  core.mageSuit = unique.length >= 2 ? suitOfPair(unique[0], unique[1]) : null;
  for (let i = 0; i < unique.length; i++) {
    const from = unique[(i - 1 + unique.length) % unique.length];
    const to = unique[i];
    if (i === 0 && unique.length < 3) continue;
    const r = reactionForPair(from, to);
    if (r && !core.mageReactionIds.includes(r)) core.mageReactionIds.push(r);
  }
}

/** DEV：把法杖设到指定等级，并按默认 火→冰→雷 重建成长。 */
export function devSetStaffLevel(this: GameCore, level: number): void {
  const core = this;
  const target = Math.max(
    1,
    Math.min(STAFF_LEVELS.length, Math.floor(level) || 1),
  );
  const elements: MageElement[] =
    target >= 6
      ? ["fire", "frost", "lightning"]
      : target >= 3
        ? ["fire", "frost"]
        : ["fire"];
  devConfigureElementalMage.call(core, elements, target);
}
