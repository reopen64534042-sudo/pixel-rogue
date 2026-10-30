/**
 * 击退数值（实际位移 px）。
 *
 * 近战走 `MeleeSystem` 的速度衰减（初速 = px × KNOCK_DAMP，按 12/s 衰减）；
 * 远程/爆炸/剑气走 `hurtEnemy` 的瞬时位移。两种机制都按“实际推开多少 px”
 * 登记，C 面板只显示弱/中/强等级。
 */
export const KNOCK_DAMP = 12;

export const KNOCK = {
  shooter: {
    bolt: 4,
    charged: 6,
    missile: 10,
    laser: 0,
    reflect: 4,
  },
  mage: {
    cast: 0,
    meteor: 4,
  },
  warrior: {
    leap: 12,
    dash: 0,
    /** 剑气：瞬时位移 px（原先写在 warriorBalance.swordQiKnock）。 */
    qi: 14,
    /** 裂地：重斩后地裂爆裂的击退。 */
    fissure: 14,
  },
  orbit: 3,
  /** 护盾破碎反震（CombatSystem），原先硬编码 *6。 */
  shock: 6,
  /** 荆棘受击反伤（CombatSystem），原先硬编码 *4。 */
  thorns: 4,
} as const;

/** C 面板等级：— = 不击退，弱 < 5px，中 5–10px，强 > 10px。 */
export type KnockLevel = "—" | "弱" | "中" | "强";

export function knockLevel(px: number): KnockLevel {
  if (px <= 0) return "—";
  if (px < 5) return "弱";
  if (px <= 10) return "中";
  return "强";
}
