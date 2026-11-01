import type { MageWeapon, Profession } from "../core/types";

/**
 * v149：等级自动成长。
 *
 * 每升 1 级固定增加的属性，与现有「每级 +2 属性点」叠加。25 波约 Lv40，
 * 相对旧 30 波约 Lv42 少 6 次属性选择；本组数值按这 6 次选择的等效价值标定。
 * - 生命成长同时增加上限与当前生命（ProgressionSystem 负责当次同步）。
 * - fireRate 为百分比乘区，与属性/天赋的施法速度同区加算。
 */
export interface LevelGrowth {
  readonly maxHp: number;
  readonly attack?: number;
  readonly critChance?: number;
  readonly fireRate?: number;
  readonly defense?: number;
  readonly lifesteal?: number;
  readonly domainValue?: number;
}

export type LevelGrowthProfession = Exclude<Profession, "common">;

export const LEVEL_GROWTH: Record<LevelGrowthProfession, LevelGrowth> = {
  shooter: { maxHp: 0.5, attack: 0.3, critChance: 0.002 },
  mage: { maxHp: 0.5, attack: 0.3, fireRate: 0.002 },
  warrior: { maxHp: 0.5, defense: 0.3, lifesteal: 0.0015 },
};

/** Domain character growth is separate from both weapon levels and elemental mage growth. */
export const DOMAIN_LEVEL_GROWTH: LevelGrowth = { maxHp: 0.5, attack: 0.4, fireRate: 0.002, domainValue: 0.5 };

export function levelGrowthFor(prof: Profession, mageWeapon: MageWeapon = 'arcane'): LevelGrowth | undefined {
  if (prof === 'mage' && mageWeapon === 'domain') return DOMAIN_LEVEL_GROWTH;
  return prof === "common" ? undefined : LEVEL_GROWTH[prof];
}

/** 已获得的升级次数：Lv1 = 0 次。 */
export function levelGrowthSteps(lvl: number): number {
  return Math.max(0, Math.floor(lvl) - 1);
}

/** 面向飘字与 C 面板的每 steps 级成长摘要。 */
export function levelGrowthSummary(prof: Profession, steps: number, mageWeapon: MageWeapon = 'arcane'): string {
  const growth = levelGrowthFor(prof, mageWeapon);
  if (!growth) return "—";
  const amount = (value: number) => {
    const rounded = Math.round(value * 100) / 100;
    return String(rounded);
  };
  const percent = (value: number) => `${amount(value * 100)}%`;
  const parts = [`生命 +${amount(growth.maxHp * steps)}`];
  if (growth.attack !== undefined)
    parts.push(`${prof === "mage" ? (mageWeapon === 'domain' ? '基础伤害' : '元素伤害') : "攻击"} +${amount(growth.attack * steps)}`);
  if (growth.domainValue !== undefined)
    parts.push(`领域值 +${amount(growth.domainValue * steps)}`);
  if (growth.critChance !== undefined)
    parts.push(`暴击 +${percent(growth.critChance * steps)}`);
  if (growth.fireRate !== undefined)
    parts.push(`施法速度 +${percent(growth.fireRate * steps)}`);
  if (growth.defense !== undefined)
    parts.push(`护甲 +${amount(growth.defense * steps)}`);
  if (growth.lifesteal !== undefined)
    parts.push(`吸血 +${percent(growth.lifesteal * steps)}`);
  return parts.join(" · ");
}
