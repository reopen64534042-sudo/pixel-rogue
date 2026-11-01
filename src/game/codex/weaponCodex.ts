import type { CodexEntry } from "./codexData";
import { SPECIAL_LEVELS, SPECIAL_UPGRADES } from "../data/specialShot";
import { LASER, LASER_UPGRADES, LASER_XP } from "../data/laser";
import { MISSILE, MISSILE_UPGRADES, MISSILE_XP } from "../data/missile";
import { MAGE_ELEMENTS, MAGE_REACTIONS, MAGE_NORMAL_UPGRADES, MAGE_RARE_UPGRADES,
  MAGE_EPIC_UPGRADES, MAGE_ULTIMATE_UPGRADES, STAFF_LEVELS, MAGE_CASTS_PER_ELEMENT,
  reactionLabel } from "../data/elementalMage";
import { MAGE_BALANCE } from "../data/mageBalance";
import { WARRIOR_BALANCE as WB } from "../data/warriorBalance";

/** Shared weapon identities for references, talent grouping and presentation. */
export const CODEX_WEAPONS = {
  charged: { name: "强化弹", group: "射手", prof: "shooter", icon: "🏹", color: "#ffd24a" },
  laser: { name: "激光", group: "射手", prof: "shooter", icon: "🔆", color: "#57e6ff" },
  missile: { name: "导弹", group: "射手", prof: "shooter", icon: "🚀", color: "#ff9a3d" },
  arcane: { name: "元素使", group: "法师", prof: "mage", icon: "🔮", color: "#c07bff" },
  domain: { name: "坍缩领域", group: "法师", prof: "mage", icon: "✦", color: "#bda0ff" },
  katana: { name: "太刀", group: "战士", prof: "warrior", icon: "⚔️", color: "#9fe1ff" },
  greatsword: { name: "大剑", group: "战士", prof: "warrior", icon: "🗡️", color: "#ffd24a" },
} as const;
export type CodexWeaponId = keyof typeof CODEX_WEAPONS;
export type WeaponReferenceKind = "overview" | "upgrade" | "mechanic";

function reference(weapon: CodexWeaponId, suffix: string, name: string, desc: string,
  kind: WeaponReferenceKind = "mechanic", slot = "机制说明", icon?: string): CodexEntry {
  const meta = CODEX_WEAPONS[weapon];
  return { id: `w:${weapon}${suffix ? `-${suffix}` : ""}`, cat: "weapon", weapon,
    referenceKind: kind, name, desc, icon: icon ?? meta.icon, group: meta.group,
    prof: meta.prof, slot, status: "live" };
}

const xpText = (levels: readonly (number | null)[]) => levels.filter(n => n !== null).join(" / ");
const firstSpecialUpgradeLevel = SPECIAL_LEVELS.findIndex(level => level.grantsUpgrade) + 1;

/** Public reference data; these entries never become collectible talent save keys. */
export const OTHER_WEAPON_ENTRIES: readonly CodexEntry[] = [
  reference("charged", "", "强化弹",
    `射手开局可选主武器。普通自动攻击中每4发出现1发强化弹；强化弹命中积累独立武器经验。满级Lv.${SPECIAL_LEVELS.length}，Lv.${firstSpecialUpgradeLevel}起每级获得一项升级，穿透与伤害随等级提升。升级效果与强化弹专属天赋分别成长。`, "overview", "主武器"),
  reference("charged", "growth", "强化弹成长",
    `每级所需武器经验：${xpText(SPECIAL_LEVELS.map(l => l.xpToNext))}。Lv.3起无限飞行，穿透耗尽或越过世界边界消失；基础形态首抽开放，进阶效果第二抽开放，完全追踪与完全真实伤害第八抽起开放。`),
  ...SPECIAL_UPGRADES.map(u => reference("charged", `upgrade-${u.id}`, u.name, u.desc,
    "upgrade", `Lv.${firstSpecialUpgradeLevel + u.minPick - 1} 起进入升级池`)),

  reference("laser", "", "激光",
    `自动锁定并持续照射，可边移动边输出。基础照射${LASER.duration}秒、回充${LASER.recharge}秒；同一目标持续照射积累焦点，回充效率缩短回充。三联升级让三束各自索敌，目标不足时可集火。`, "overview", "主武器"),
  reference("laser", "growth", "激光成长",
    `武器经验按主束有效照射时间累计，每轮最多${LASER.xpPerCycle}经验，多目标与三束共用预算；余辉、残像与脉冲不加速成长。每级所需：${xpText(LASER_XP)}。Lv.4起每级获得一项升级。`),
  ...LASER_UPGRADES.map(u => reference("laser", `upgrade-${u.id}`, u.name, u.desc, "upgrade", `Lv.${u.minLevel} 起进入升级池`)),

  reference("missile", "", "导弹",
    `独立装填、出舱、制导与爆破的主武器，可移动发射。基础装填${MISSILE.reload}秒，每第${MISSILE.cycle}轮按持有天赋加入蜂群或离子机制。主弹、蜂群、电弧和余烬分别结算伤害，双联主弹共享每轮经验与派生预算。`, "overview", "主武器"),
  reference("missile", "growth", "导弹成长",
    `每轮主弹爆炸实际命中最多获得1点经验；蜂群、电弧、余烬与其他派生伤害不计。每级所需：${xpText(MISSILE_XP)}。Lv.4起每级获得一项硬件升级，专属天赋发展信标、蜂群与离子打法。`),
  ...MISSILE_UPGRADES.map(u => reference("missile", `upgrade-${u.id}`, u.name, u.desc, "upgrade", `Lv.${u.minLevel} 起进入升级池`)),

  reference("arcane", "", "元素使",
    `自动法阵攻击最近目标，移动也能施法；每${MAGE_CASTS_PER_ELEMENT}次成功施法轮换元素。Lv.1/3/6选择第一、第二、第三元素，元素顺序决定A/B套装与反应方向。法杖升级、人物升级和专属天赋分别成长。`, "overview", "主武器"),
  reference("arcane", "growth", "法杖成长与反应",
    `本体法阵实际命中至少一个敌人获得1点法杖经验，空放、打断、回响和派生攻击不给经验。每级所需：${xpText(STAFF_LEVELS.map(l => l.xpToNext))}。第二元素领悟第一条反应，第三元素随机领悟另一条；史诗成长补齐。反应需先领悟，只有本体施法触发，链与派生不递归。`),
  ...Object.values(MAGE_ELEMENTS).map(e => reference("arcane", `element-${e.id}`, `${e.name}元素 · ${e.statusName}`,
    `${e.desc}。上述元素倍率以完整元素基准为单位；本体法阵直伤另乘${MAGE_BALANCE.directDamageMul}，状态与链使用完整基准。`, "mechanic", "Lv.1 / 3 / 6 可选择", e.ico)),
  ...Object.values(MAGE_REACTIONS).map(r => reference("arcane", `reaction-${r.id}`, reactionLabel(r.id),
    `${r.desc}。所属套装：${r.suit}；先领悟此反应后，才可由本体对应元素命中触发。`, "mechanic", `元素反应 · 套装 ${r.suit}`, "☯️")),
  ...[
    { items: MAGE_NORMAL_UPGRADES, stage: "Lv.2 普通池随机1项" },
    { items: MAGE_RARE_UPGRADES, stage: "Lv.4–5 稀有池" },
    { items: MAGE_EPIC_UPGRADES, stage: "Lv.7–9 史诗池" },
    { items: MAGE_ULTIMATE_UPGRADES, stage: "Lv.10–12 终极池" },
  ].flatMap(pool => pool.items.map(u => reference("arcane", `upgrade-${u.id}`, u.name, u.desc, "upgrade", pool.stage, u.ico))),

  reference("katana", "", "太刀",
    `战士快速近战流派，基础攻击${WB.styles.katana.damage}、攻速${WB.styles.katana.fireRate}/秒、范围${WB.styles.katana.range}px。通过居合、斩浪与连闪天赋发展蓄势爆发和冲刺攻击；武器没有独立经验等级，能力来自天赋。`, "overview", "近战流派"),
  reference("katana", "style", "太刀 · 成长方式",
    "学习居合后通过移动和冲刺积势，释放旋斩；流链强化居合，斩浪提供冲刺路径伤害，连闪强化连续机动。未学习的天赋不会自动获得；具体效果与前置见职业分类中的专属天赋。"),
  reference("greatsword", "", "大剑",
    `战士重型近战流派，基础攻击${WB.styles.greatsword.damage}、攻速${WB.styles.greatsword.fireRate}/秒、范围${WB.styles.greatsword.range}px。自带重斩，破甲、剑气、裂地及三段斩等能力通过天赋获得；没有独立武器经验等级。`, "overview", "近战流派"),
  reference("greatsword", "heavy", "重斩",
    `每第${WB.heavyEvery}次普通挥砍触发重斩，基础伤害×${WB.heavyDamageMul}、攻击范围×${WB.heavyRangeMul}。破甲→剑气→裂地按天赋前置发展；三段斩与跃击另行强化冲刺入场，具体规则见专属天赋。`),
];
