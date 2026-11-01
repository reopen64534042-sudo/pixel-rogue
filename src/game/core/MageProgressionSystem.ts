import {
  ELEMENTAL_MAGE,
  MAGE_ELEMENTS,
  MAGE_ELEMENT_CHOICES,
  MAGE_SPECIALIZATIONS,
  MAGE_REACTIONS,
  STAFF_LEVELS,
  STAFF_XP_PER_CAST,
  elementOfChoice,
  mageUpgradeName,
  reactionForPair,
  reactionLabel,
} from "../data/elementalMage";
import type {
  MageElement,
  MageReactionId,
  MageSuit,
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

/** 玩家三选一构筑卡是否已持有；以卡名为 upCounts 键。 */
export function hasMageCard(core: GameCore, name: string): boolean {
  return (core.player.upCounts[name] ?? 0) > 0;
}

/** 元素凝聚已移出法杖成长；保留函数供既有状态调用，P1 不再提供额外持续。 */
export function mageStatusDurationBonus(_core: GameCore): number {
  return 0;
}

/** 咏唱调律：法阵范围倍率。 */
export function mageCircleRangeMul(core: GameCore): number {
  return hasMageUpgrade(core, "tempo")
    ? 1 + ELEMENTAL_MAGE.tempo.circleRange
    : 1;
}

/** Lv12 占位：全元素伤害 +5%，P2 由大法师替换。 */
export function mageGrandmasterElementMul(core: GameCore): number {
  return hasMageUpgrade(core, "grandmasterPlaceholder")
    ? 1 + ELEMENTAL_MAGE.grandmasterPlaceholder.elementDamageBonus
    : 1;
}

/** 咏唱调律：法阵直伤倍率（P1 调律只给施法速度与范围）。 */
export function mageDirectDamageMul(_core: GameCore): number {
  return 1;
}

/** 咏唱调律：施法速度倍率。 */
export function mageCastSpeedMul(core: GameCore): number {
  return hasMageUpgrade(core, "tempo")
    ? 1 + ELEMENTAL_MAGE.tempo.castSpeed
    : 1;
}

/** 棱镜档位：0 无 / 1 基础 / 2 史诗。 */
export function magePrismTier(core: GameCore): 0 | 1 | 2 {
  if (hasMageUpgrade(core, "prismEpic")) return 2;
  if (hasMageUpgrade(core, "prismRare")) return 1;
  return 0;
}

/** 反应伤害倍率（P1 无通用反应倍率卡）。 */
export function mageReactionDamageMul(_core: GameCore): number {
  return 1;
}

/** 每只敌人两次普通反应之间的基础间隔。 */
export function mageReactionIcd(_core: GameCore): number {
  return ELEMENTAL_MAGE.reaction.icdBase;
}

/** 元素选择面板的候选卡：只列尚未持有的元素，并附上套装/反应预览。 */
export function mageElementPickSlots(core: GameCore): Slot[] {
  return MAGE_ELEMENT_CHOICES.filter((card) => {
    const el = elementOfChoice(card.n);
    return !!el && !core.mageElements.includes(el);
  }).map((card) => {
    const el = elementOfChoice(card.n);
    const preview = el ? mageElementPreview(core, el) : "";
    return {
      u: {
        ...card,
        d: `${card.d}；【选择预览】${preview}`,
      },
      used: true,
    };
  });
}

/** 元素选择卡上的即时预览：A/B 套装、首条反应与轮盘路径。 */
function mageElementPreview(core: GameCore, el: MageElement): string {
  const name = (e: MageElement) => MAGE_ELEMENTS[e].name;
  const pending = core.mageElementPickPending;
  if (pending === "first") {
    return "第一元素起手；第二元素将决定 A/B 套装与首条反应";
  }
  if (pending === "second") {
    const first = core.mageElements[0];
    if (!first) return "";
    const r = reactionForPair(first, el);
    if (!r) return `轮盘 ${name(first)} → ${name(el)} → ${name(first)}`;
    const suit = MAGE_REACTIONS[r].suit;
    const rest = Object.values(MAGE_REACTIONS)
      .filter((x) => x.suit === suit && x.id !== r)
      .map((x) => x.name)
      .join("/");
    return `${suit} 套装；首条 ${reactionLabel(r)}；轮盘 ${name(first)} → ${name(el)} → ${name(first)}；第三元素补齐 ${rest}`;
  }
  const [a, b] = core.mageElements;
  if (!a || !b) return "";
  const r1 = reactionForPair(b, el);
  const r2 = reactionForPair(el, a);
  const candidates = [r1, r2]
    .filter((r): r is MageReactionId => !!r)
    .map((r) => reactionLabel(r))
    .join(" / ");
  const suit = core.mageSuit ?? suitOfPair(a, b) ?? "A";
  return `${suit} 套装；轮盘 ${name(a)} → ${name(b)} → ${name(el)} → ${name(a)}；补齐反应 ${candidates}`;
}

/**
 * 玩家在面板中选择一个元素。
 *
 * - 第一元素：建立轮盘起点；
 * - 第二元素：确定 A/B 套装并领悟 A+B 反应；
 * - 第三元素：补齐该套装剩余两条反应。
 */
export function chooseMageElement(
  core: GameCore,
  cardName: string,
): boolean {
  const pending = core.mageElementPickPending;
  if (core.prof !== "mage" || core.mageWeapon === "domain" || !pending) return false;
  const el = elementOfChoice(cardName);
  if (!el || core.mageElements.includes(el)) return false;
  core.mageElements.push(el);
  core.mageElementPickLevels.push(core.mageStaffLevel);
  // 一波内连升触发的下一次元素选择已排队 → 选完当前这个立刻接着选。
  core.mageElementPickPending = core.mageElementPickQueue.shift() ?? null;

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
      core.mageReactionUnlockLevels.push(core.mageStaffLevel);
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
    ensureSpecializationCount(core, core.mageStaffLevel);
  } else {
    // 第三元素：补齐该套装剩余两条反应；Lv8/9 专精随后按等级补齐。
    const a = core.mageElements[0];
    const b = core.mageElements[1];
    const c = core.mageElements[2];
    const candidates = [reactionForPair(b, c), reactionForPair(c, a)].filter(
      (id): id is MageReactionId =>
        !!id && !core.mageReactionIds.includes(id),
    );
    for (const extra of candidates) {
      core.mageReactionIds.push(extra);
      core.mageReactionUnlockLevels.push(core.mageStaffLevel);
      core.addText(
        core.player.x,
        core.player.y - 44,
        `领悟：${reactionLabel(extra)}`,
        MAGE_REACTIONS[extra].color,
      );
    }
    ensureSpecializationCount(core, core.mageStaffLevel);
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
  if (core.prof !== "mage" || core.mageWeapon === "domain" || !core.mageElements.length) return;
  // 教程只教基础施法，不推进法杖等级（避免练习场弹出成长提示/待选面板）。
  if (core.tutorialMode) return;
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
  }
  if (core.mageStaffLevel >= STAFF_LEVELS.length) core.mageStaffXp = 0;
}

/** 请求元素选择；已有待选时排队，休整时依次处理，避免覆盖。 */
function requestElementPick(core: GameCore, kind: "second" | "third"): void {
  if (!core.mageElementPickPending) {
    core.mageElementPickPending = kind;
    return;
  }
  if (!core.mageElementPickQueue.includes(kind))
    core.mageElementPickQueue.push(kind);
}

/** 到达新法杖等级时发放对应奖励。 */
function applyStaffLevelGrant(core: GameCore, level: number): void {
  const p = core.player;
  const add = (id: MageUpgradeId, color = "#ffd24a") => {
    if (core.mageUpgrades.includes(id)) return;
    core.mageUpgrades.push(id);
    core.addText(
      p.x,
      p.y - 30,
      `法杖 Lv.${level} · 领悟：${mageUpgradeName(id)}`,
      color,
    );
  };
  if (level === 2) {
    add("tempo");
    return;
  }
  if (level === 3) {
    add("prismRare", "#57e6ff");
    return;
  }
  if (level === 4) {
    requestElementPick(core, "second");
    core.addText(p.x, p.y - 30, "法杖 Lv.4 · 第二元素待领悟", "#57e6ff");
    return;
  }
  if (level === 5) {
    ensureSpecializationCount(core, level);
    return;
  }
  if (level === 6) {
    add("prismEpic", "#c07bff");
    return;
  }
  if (level === 7) {
    requestElementPick(core, "third");
    core.addText(p.x, p.y - 30, "法杖 Lv.7 · 第三元素待领悟", "#57e6ff");
    return;
  }
  if (level === 8 || level === 9) {
    ensureSpecializationCount(core, level);
    return;
  }
  if (level === 10) {
    add("splitShadow");
    return;
  }
  if (level === 11) {
    add("splitShadowPlus");
    return;
  }
  if (level === 12) {
    add("grandmasterPlaceholder");
    return;
  }
  core.addText(p.x, p.y - 30, `法杖 Lv.${level}`, "#9aa3c7", false, false, true);
}

/** Lv5/8/9 目标专精数量；元素未选时先发能发的，选元素后再补齐。 */
function specializationTarget(level: number): number {
  if (level >= 9) return 3;
  if (level >= 8) return 2;
  if (level >= 5) return 1;
  return 0;
}

function specIdForReaction(reaction: MageReactionId): MageUpgradeId {
  return MAGE_SPECIALIZATIONS[reaction].id;
}

function ensureSpecializationCount(core: GameCore, level: number): void {
  const target = specializationTarget(level);
  const owned = core.mageReactionIds.filter((r) =>
    core.mageUpgrades.includes(specIdForReaction(r)),
  ).length;
  let need = Math.max(0, target - owned);
  const candidates = core.mageReactionIds.filter(
    (r) => !core.mageUpgrades.includes(specIdForReaction(r)),
  );
  const grant = (reaction: MageReactionId) => {
    const id = specIdForReaction(reaction);
    if (core.mageUpgrades.includes(id)) return;
    core.mageUpgrades.push(id);
    core.addText(
      core.player.x,
      core.player.y - 30,
      `法杖 Lv.${level} · 领悟：${mageUpgradeName(id)}`,
      MAGE_REACTIONS[reaction].color,
    );
    need--;
  };
  // 第一专精固定给 R1；Lv8/9 的剩余专精随机。
  if (need > 0 && owned === 0 && candidates.length) {
    const first = core.mageReactionIds[0];
    if (candidates.includes(first)) {
      grant(first);
      candidates.splice(candidates.indexOf(first), 1);
    }
  }
  while (need > 0 && candidates.length) {
    const idx = Math.floor(Math.random() * candidates.length);
    grant(candidates.splice(idx, 1)[0]);
  }
}

/**
 * DEV：直接配置元素法师成长，供受控冒烟使用。
 *
 * 与正常流程的区别：一次给满传入的元素与**全部**三条反应，
 * 便于逐条验证六反应；不写玩家天赋/属性。
 */
export function devConfigureElementalMage(
  this: GameCore,
  elements: readonly MageElement[],
  level = 12,
): void {
  const core = this;
  if (core.prof !== "mage" || core.mageWeapon === "domain") return;
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
  core.mageElementPickQueue = [];
  core.mageUpgrades = [];
  core.mageReactionIds = [];
  core.mageReactionUnlockLevels = [];
  core.mageElementPickLevels = [];
  core.mageSuit = unique.length >= 2 ? suitOfPair(unique[0], unique[1]) : null;
  for (let i = 0; i < unique.length; i++) {
    const from = unique[(i - 1 + unique.length) % unique.length];
    const to = unique[i];
    if (i === 0 && unique.length < 3) continue;
    const r = reactionForPair(from, to);
    if (r && !core.mageReactionIds.includes(r)) core.mageReactionIds.push(r);
  }
}

/** DEV：把法杖设到指定等级，并按默认 火→冰→雷 重建成长与对应强化。 */
export function devSetStaffLevel(this: GameCore, level: number): void {
  const core = this;
  if (core.prof !== "mage" || core.mageWeapon === "domain") return;
  const target = Math.max(
    1,
    Math.min(STAFF_LEVELS.length, Math.floor(level) || 1),
  );
  const elements: MageElement[] =
    target >= 7
      ? ["fire", "frost", "lightning"]
      : target >= 4
        ? ["fire", "frost"]
        : ["fire"];
  devConfigureElementalMage.call(core, elements, target);
  // 作弊服要能直接测试“这个等级应有的能力”，所以按等级补齐强化；
  // 正式成长仍按等级节点发放，不经过这里。
  const upgrades: MageUpgradeId[] = [];
  if (target >= 2) upgrades.push("tempo");
  if (target >= 3) upgrades.push("prismRare");
  if (target >= 6) upgrades.push("prismEpic");
  if (target >= 10) upgrades.push("splitShadow");
  if (target >= 11) upgrades.push("splitShadowPlus");
  if (target >= 12) upgrades.push("grandmasterPlaceholder");
  core.mageUpgrades = upgrades;
  ensureSpecializationCount(core, target);
  // 切等级时清掉旧等级的瞬态表现，避免残留棱镜/分影/护盾。
  core.magePrism = null;
  core.magePrismBeams = [];
  core.mageShadows = [];
  core.mageCharge = 0;
  core.mageChargeFlashT = 0;
  core.mageShield = 0;
  core.mageShieldT = 0;
  core.mageShieldMaxT = 0;
  core.mageDecoys = [];
  core.mageVisualEvents = [];
  core.castPhase = "idle";
  core.castT = 0;
  core.castCd = 0;
}
