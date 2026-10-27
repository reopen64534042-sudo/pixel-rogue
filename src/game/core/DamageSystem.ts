import { COMBAT_BALANCE } from "../data/combatBalance";
import type { CombatBalance } from "../data/combatBalance";
import type { DamageTypeInfo, DamageTypeRegistry } from "../data/damageTypes";
import type {
  CombatStatsSnapshot,
  DamageCalculation,
  DamageRequest,
} from "./types";

/**
 * Combat Foundation v1 · S1 纯数值计算器。
 * 契约：docs/pixel-rogue-combat-foundation-v1.md §3。
 * 约束：不读 GameCore、不调 Math.random、不改任何 HP/掉落/UI；增伤与减伤
 * 全部来自请求参数、属性快照与注册表配置，不含任何具体伤害属性分支
 * （物理/火焰/雷电/真实的差异只体现在注册表的减伤策略上）。
 */

function requireRegistryEntry(
  registry: DamageTypeRegistry,
  type: string,
): DamageTypeInfo {
  // 必须校验自有键：registry["__proto__"]/["toString"] 等原型链成员是对象/函数，
  // 真值判断会让未注册类型通过并产生 NaN 或继承来的伪策略
  if (!Object.hasOwn(registry, type)) {
    throw new Error(
      `DamageSystem: 未注册的伤害属性 ${JSON.stringify(type)}（可用: ${Object.keys(registry).join(", ")}）`,
    );
  }
  return registry[type];
}

function requireFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(
      `DamageSystem: ${field} 必须是有限数字，得到 ${value}`,
    );
  }
}

/** 单个增伤乘区须为有限数字且 ≥ -100%（倍率非负）。逐区校验，防止两个
 * 低于 -100% 的乘区相乘互相抵消后以正值结算绕过终值检查。 */
function requireZone(field: string, bonus: number): void {
  if (!Number.isFinite(bonus) || bonus < -1) {
    throw new RangeError(
      `DamageSystem: ${field} 非法（须为有限数字且 ≥ -1），得到 ${bonus}`,
    );
  }
}

const clampMin0 = (v: number, max: number) => Math.max(0, Math.min(max, v));

/** 只读取映射自有键。缺失键为中性 0，不能意外消费 Object.prototype 的
 * constructor/toString/__proto__ 等成员。显式 nullish 仍沿用旧的 ?? 0 语义。 */
function ownValueOrZero<K extends string>(
  values: Readonly<Partial<Record<K, number>>> | undefined,
  key: K,
): number {
  return values && Object.hasOwn(values, key) ? values[key] ?? 0 : 0;
}

/** §3.2 属性减伤系数：armor=K/(K+max(0,DEF))；resistance=1-clamp(res,0,上限)；none=1 */
export function typeMitigationFactor(
  registry: DamageTypeRegistry,
  type: string,
  defender: Readonly<CombatStatsSnapshot<string>>,
  balance: CombatBalance = COMBAT_BALANCE,
): number {
  const info = requireRegistryEntry(registry, type);
  switch (info.mitigation) {
    case "armor": {
      requireFinite(defender.defense, "defenderStats.defense");
      return balance.armorK / (balance.armorK + Math.max(0, defender.defense));
    }
    case "resistance": {
      const res = ownValueOrZero(defender.resistances, type);
      requireFinite(res, `defenderStats.resistances[${type}]`);
      return 1 - clampMin0(res, balance.resistanceCap);
    }
    case "none":
      return 1;
  }
}

/** §3.2 通用减伤系数：非真实属性应用 1-clamp(tough,0,上限)；真实伤害无视 */
export function generalMitigationFactor(
  registry: DamageTypeRegistry,
  type: string,
  defender: Readonly<CombatStatsSnapshot<string>>,
  balance: CombatBalance = COMBAT_BALANCE,
): number {
  const info = requireRegistryEntry(registry, type);
  if (info.mitigation === "none") return 1;
  requireFinite(defender.tough, "defenderStats.tough");
  return 1 - clampMin0(defender.tough, balance.toughCap);
}

/**
 * §3.1 伤害计算：
 *   D = rawAmount × M_global × M_type × M_form × M_skill × M_crit
 *       × 属性减伤 × 通用减伤
 * 同乘区的多个来源由适配器先行加算，跨乘区相乘；暴击在减伤前应用。
 * 结算精度由 request.precision 显式声明（§3.3）：round-min-one 在末尾一次
 * 取整并对正伤害保底 1 点（对应既有 hurtEnemy 的 Math.max(1, Math.round)，
 * 用于敌方离散命中）；preserve-float 保留浮点（对应既有 damagePlayer 的
 * 玩家浮点扣血习惯，dot 固定此值）。结算为 0 的命中（rawAmount=0，或乘区
 * 倍率恰为 0，如 -100% 增伤、0 暴击倍率）是合法零伤害，保持为 0——保底
 * 1 点只作用于结算为正的命中，不得把零倍率复活成 1 点。
 * NaN/负数等非法输入显式抛错，绝不静默变成 1 点。dot 禁止暴击与取整精度
 * （§3.3），由本函数运行时拒绝非法组合；暴击判定本身由编排层负责。
 */
export function calculateDamage<R extends DamageTypeRegistry>(
  registry: R,
  request: DamageRequest<Extract<keyof R, string>>,
  balance: CombatBalance = COMBAT_BALANCE,
): DamageCalculation {
  const type = request.type;
  requireRegistryEntry(registry, type);
  if (!Number.isFinite(request.rawAmount) || request.rawAmount < 0) {
    throw new RangeError(
      `DamageSystem: rawAmount 必须是 ≥0 的有限数字，得到 ${request.rawAmount}`,
    );
  }
  if (request.kind === "dot") {
    if (request.isCritical) {
      throw new Error(
        "DamageSystem: dot 不允许暴击（§3.3：持续伤害不触发普通命中的暴击）",
      );
    }
    if (request.precision !== "preserve-float") {
      throw new Error(
        "DamageSystem: dot 固定使用 preserve-float 精度（§3.3：不逐帧取整、不保底）",
      );
    }
  }

  const a = request.attackerStats;
  requireZone("attackerStats.globalDamageBonus", a.globalDamageBonus);
  const typeBonus = ownValueOrZero(a.typeDamageBonus, type);
  requireZone(`attackerStats.typeDamageBonus[${type}]`, typeBonus);
  const formBonus = ownValueOrZero(a.formDamageBonus, request.form);
  requireZone(`attackerStats.formDamageBonus[${request.form}]`, formBonus);
  let skillBonus = 0;
  if (request.skillId !== undefined) {
    skillBonus = ownValueOrZero(a.skillDamageBonus, request.skillId);
    requireZone(
      `attackerStats.skillDamageBonus[${request.skillId}]`,
      skillBonus,
    );
  }

  const beforeCrit =
    request.rawAmount *
    (1 + a.globalDamageBonus) *
    (1 + typeBonus) *
    (1 + formBonus) *
    (1 + skillBonus);
  const critMultiplier = request.isCritical ? a.critMultiplier : 1;
  if (request.isCritical) {
    requireFinite(critMultiplier, "attackerStats.critMultiplier");
    if (critMultiplier < 0) {
      throw new RangeError(
        `DamageSystem: attackerStats.critMultiplier 不得为负，得到 ${critMultiplier}`,
      );
    }
  }
  const beforeMitigation = beforeCrit * critMultiplier;

  const settled =
    beforeMitigation *
    typeMitigationFactor(registry, type, request.defenderStats, balance) *
    generalMitigationFactor(registry, type, request.defenderStats, balance);
  requireFinite(settled, "settledDamage");
  if (settled < 0) {
    throw new RangeError(
      `DamageSystem: 增伤配置使伤害为负（${settled}），请检查乘区数值`,
    );
  }

  const settledDamage =
    request.precision === "round-min-one" && settled > 0
      ? Math.max(1, Math.round(settled))
      : settled;
  return {
    rawDamage: request.rawAmount,
    beforeMitigation,
    settledDamage,
    isCritical: request.isCritical,
  };
}
