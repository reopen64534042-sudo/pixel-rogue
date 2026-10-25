/**
 * Combat Foundation S4-C（C1 + C2-A + C2-B）：十三张天赋的属性权威来源表。
 *
 * 职责（任务书 §4-S4-C「全链路权威来源唯一」）：
 * - C1 五张纯 flat：「磐石/铁布衫/致命一击/会心深渊/元素亲和」的属性贡献
 *   在此**声明一次**，由 StatModel 从 picks 序列解析；C2-A 三张逐次乘算：
 *   「磨刃/狂怒/毁灭本能」的 attack final 倍率同样在此声明。C2-B 五张乘法
 *   属性：「强化弹丸/疾速扳机/疾风之靴/磁力护符/广域法印」的
 *   boltDmgMul/fireRate/moveSpeed/magnet/area final 倍率在此声明。
 *   data/talents.ts 中这十三张卡的 `f` 不再写入属性字段（无获得时即时效果，
 *   f 为空操作）。旧 `Talent.f` 累加/乘算与新 Modifier 不并行生效——
 *   learnTalent/recompute/melt 统一收敛到 applyTalentStatProjection 写出的
 *   投影值。
 * - Player 上的 `defense/tough/crit/critMul/typeDamageBonus/damage` 是兼容
 *   投影：字段保留（消费点 CombatStats/UI/pv·cur 不变），但唯一来源是本表
 *   解析。damage 的 base = statBase().damage（数据层初始值），映射到
 *   StatModel 的既有 `attack` StatId——projected 值仍写回既有 `p.damage`
 *   字段，不新增 Player 可枚举字段、不引入第二套累加缓存；伤害管线侧
 *   rawAmount 已含该值（CombatStats.attack = p.damage），DamageSystem 的
 *   globalDamageBonus 等乘区不重复乘 attack。C2-B 五字段同理写回既有
 *   `boltDmgMul/fireRate/speed/magnet/area` 字段（speed ↔ moveSpeed 仅是
 *   Player 字段名与 StatId 的历史命名差，语义一致）。
 * - 来源所有权（C2-A/C2-B 审计定界）：`p.damage` 的运行期写入者**只有**
 *   三张伤害卡的旧 f（C2-A 已取消）+ 本投影；`boltDmgMul/fireRate/speed/
 *   magnet/area` 的运行期写入者**只有**对应单张卡的旧 f（本批取消）+ 本
 *   投影；五者基础值唯一来自 `statBase()`（recompute 经 Object.assign 重置）。
 *   **五字段各自只有一张天赋来源**（与 attack 的三卡不同），若未来出现
 *   卡外的合法写入者，不得被本投影以 picks 结果直接覆盖——须先在来源表
 *   登记为独立来源并设计兼容方案（任务书 §二.7）。
 * - 「致命一击」觉醒（upCounts ≥ critMaxLevel → 有效暴伤 +0.4）是**条件
 *   来源**：判定时机保持读时进行（DamageMath.critMultiplier 按 upCounts
 *   现值叠加），不烘焙进 p.critMul 字段——与旧语义逐位一致，置换移除层级
 *   后觉醒自动失效。
 * - 动态攻速（击杀狂热 haste / 战意沸腾 rageT）是**运行状态**：仍在原消费
 *   点（AttackSystem 开火公式）实时乘算，不进属性模型、不烘焙进 p.fireRate。
 *
 * final 语义（C2-A/C2-B）：StatModel 的 final 区按修饰符数组顺序（=picks
 * 顺序）对 base 连乘、IEEE-754 左结合——与旧 `p.X *= m` 逐次学习/重放的
 * 运算序列逐位一致（多级 = ×1.1² 的逐次乘算，不得折叠成 percent +0.2，
 * 见 StatModel 头注）。同 percent 区不同：final 无分组求和步骤，不存在
 * 浮点分组歧义。
 *
 * flat 语义：resolveStats 的 flat 区为 base 起始、按修饰符顺序（即 picks
 * 顺序）逐次累加，与旧 recompute 重放的 IEEE-754 运算序列逐位一致
 * （S4-B 定论）。负区因子政策未批准，本表全部来源为正 flat / >1 final，
 * 不涉及。
 *
 * 纯函数：不引用 talent.f / GameCore / DOM / Phaser、不掷随机数、无持久
 * 缓存。值与 data/talents.ts 的历史 f 语义逐字一致；漂移由基线钉子测试
 * （磐石 45 / tough 0.4 / 暴击 0.8499999999999999 / 火雷 0.30000000000000004
 * / 磨刃×2 13.310000000000002）与 S4-B shadow 独立重述
 * （playerShadowFromPicks，flat 五卡）双重暴露。
 */
import { statBase } from "../data/stats";
import { resolveStats, type StatModifier } from "./StatModel";
import { resolveKeyedMap, type TypeDamageBonusModifier } from "./StatSheets";
import type { Player } from "./types";

/** 十三张已迁移卡的来源贡献：标量区（含 attack 与五字段 final）+ 类型化火雷增伤区 */
export interface TalentStatContribution {
  scalars: StatModifier[];
  typeDamageBonus: TypeDamageBonusModifier[];
}

/**
 * 「元素亲和」贡献的 typeDamageBonus 键 = C1 投影对类型化映射的**全部所有权
 * 范围**（第一轮评审 P2 定界）：投影只写/删这两个键；physical 等其余键属
 * 未知外部来源，不在所有权内，学习无关天赋时保持不动（见投影函数说明）。
 */
const ELEMENT_TDB_KEYS = ["fire", "lightning"] as const;

/**
 * 把 picks 序列翻译为修饰符（未迁移批次的 pick 忽略）。
 * 顺序即 picks 顺序——同一张卡重复学习按次数展开，与旧重放逐位一致。
 */
export function talentStatModifiers(
  picks: readonly string[],
): TalentStatContribution {
  const scalars: StatModifier[] = [];
  const typeDamageBonus: TypeDamageBonusModifier[] = [];
  for (const name of picks) {
    switch (name) {
      case "磐石": // data/talents.ts：defense +15/级
        scalars.push({
          sourceId: "天赋:磐石",
          stat: "defense",
          stage: "flat",
          value: 15,
        });
        break;
      case "铁布衫": // data/talents.ts：tough +0.1/级（0.6 上限在消费点）
        scalars.push({
          sourceId: "天赋:铁布衫",
          stat: "tough",
          stage: "flat",
          value: 0.1,
        });
        break;
      case "致命一击": // data/talents.ts：crit +0.1/级（max 8）
        scalars.push({
          sourceId: "天赋:致命一击",
          stat: "critChance",
          stage: "flat",
          value: 0.1,
        });
        break;
      case "会心深渊": // data/talents.ts：critMul +0.5/级（0.5 可精确表示）
        scalars.push({
          sourceId: "天赋:会心深渊",
          stat: "critMultiplier",
          stage: "flat",
          value: 0.5,
        });
        break;
      case "元素亲和": // data/talents.ts：火/雷 typeDamageBonus 各 +0.1/级
        for (const key of ELEMENT_TDB_KEYS)
          typeDamageBonus.push({
            sourceId: "天赋:元素亲和",
            stat: "typeDamageBonus",
            stage: "flat",
            value: 0.1,
            key,
          });
        break;
      // ---- C2-A：全局基础伤害乘法（final 逐次连乘，非 percent 加算）----
      case "磨刃": // data/talents.ts：p.damage *= 1.1/级（max 99）
        scalars.push({
          sourceId: "天赋:磨刃",
          stat: "attack",
          stage: "final",
          value: 1.1,
        });
        break;
      case "狂怒": // data/talents.ts：p.damage *= 1.2/级（max 5）
        scalars.push({
          sourceId: "天赋:狂怒",
          stat: "attack",
          stage: "final",
          value: 1.2,
        });
        break;
      case "毁灭本能": // data/talents.ts：p.damage *= 1.3/级（max 3）
        scalars.push({
          sourceId: "天赋:毁灭本能",
          stat: "attack",
          stage: "final",
          value: 1.3,
        });
        break;
      // ---- C2-B：五张乘法属性天赋（各字段单一天赋来源，final 逐次连乘）----
      case "强化弹丸": // data/talents.ts：p.boltDmgMul *= 1.25/级（max 30）
        scalars.push({
          sourceId: "天赋:强化弹丸",
          stat: "boltDmgMul",
          stage: "final",
          value: 1.25,
        });
        break;
      case "疾速扳机": // data/talents.ts：p.fireRate *= 1.18/级（max 8）
        scalars.push({
          sourceId: "天赋:疾速扳机",
          stat: "fireRate",
          stage: "final",
          value: 1.18,
        });
        break;
      case "疾风之靴": // data/talents.ts：p.speed *= 1.1/级（max 6）；StatId
        // moveSpeed 与 Player 字段 speed 的命名差是历史现状，语义一致
        scalars.push({
          sourceId: "天赋:疾风之靴",
          stat: "moveSpeed",
          stage: "final",
          value: 1.1,
        });
        break;
      case "磁力护符": // data/talents.ts：p.magnet *= 1.4/级（max 5）
        scalars.push({
          sourceId: "天赋:磁力护符",
          stat: "magnet",
          stage: "final",
          value: 1.4,
        });
        break;
      case "广域法印": // data/talents.ts：p.area *= 1.2/级（max 4）
        scalars.push({
          sourceId: "天赋:广域法印",
          stat: "area",
          stage: "final",
          value: 1.2,
        });
        break;
      default: // 未迁移批次的天赋不进属性表（仍由 talent.f 重放，不在此维护张数）
        break;
    }
  }
  return { scalars, typeDamageBonus };
}

/**
 * 把已迁移卡的权威解析结果写回 Player 兼容投影。幂等：可重复调用，
 * 结果只取决于 picks 当前内容。写入点 = 旧 f 的全部生效点
 * （learnTalent / recompute / melt 经 learnTalent），不存在第二套累积来源。
 *
 * 可选字段存在性沿用旧语义：磐石来源存在才写 `defense` 键，无来源删键。
 * typeDamageBonus 为**键级所有权**（第一轮评审 P2）：投影只管理 fire/lightning
 * 两键（ELEMENT_TDB_KEYS，即本表声明的全部映射键）——有来源时以解析结果
 * **绝对覆写**（每次从 picks 全量解析，不与旧值相加，无重复叠加），无来源
 * 时删除这两键（映射因此为空则连映射一并删除）；其余键（physical 等）属
 * 未知外部来源，不在所有权内，学习任何天赋都保持不动。
 *
 * `damage`（C2-A）与 `boltDmgMul/fireRate/speed/magnet/area`（C2-B）为必写
 * 字段：字段由 statBase 提供（与 tough/crit/critMul 同类的必填投影），投影
 * 以对应 statBase 字段为 base 全量解析后覆写——无来源时写回 base 值（与
 * 旧 f 无乘算时的字段值一致）。来源所有权见模块头注：卡外写入者出现前
 * 不得以本投影覆盖。
 *
 * 兼容边界（明示，不猜测恢复）：
 * - 外部来源若也写 fire/lightning，与元素亲和贡献无法区分，投影覆写为
 *   权威值——当前无此类运行时写入者，外部写入者须避开这两键；
 * - recompute/melt 路径沿用历史行为：recompute 先整体删除 typeDamageBonus
 *   键再重放（S3-B 语义），外部键在该路径不保留——原有状态行为，本轮不动。
 */
export function applyTalentStatProjection(p: Player): void {
  const base = statBase();
  const { scalars, typeDamageBonus } = talentStatModifiers(p.picks);
  const resolved = resolveStats({
    base: {
      attack: base.damage,
      tough: base.tough,
      critChance: base.crit,
      critMultiplier: base.critMul,
      // C2-B：五字段 base = statBase 数据层初始值（fireRate 2.2 / speed 62 /
      // magnet 36 / boltDmgMul 1 / area 1），recompute 经 Object.assign 重置
      // 后由本投影全量解析，无来源时写回 base 值
      boltDmgMul: base.boltDmgMul,
      fireRate: base.fireRate,
      moveSpeed: base.speed,
      magnet: base.magnet,
      area: base.area,
    },
    modifiers: scalars,
  });
  p.tough = resolved.tough ?? 0;
  p.crit = resolved.critChance ?? base.crit;
  // 不含觉醒：DamageMath.critMultiplier 在读取时按 upCounts 现值叠加 0.4
  p.critMul = resolved.critMultiplier ?? base.critMul;
  // C2-A：attack 解析结果写回既有 damage 字段（base=statBase().damage，
  // final 区按 picks 顺序连乘——与旧 f 重放运算序列逐位一致）
  p.damage = resolved.attack ?? base.damage;
  // C2-B：五字段解析结果写回既有 Player 字段（speed 字段 = moveSpeed StatId）
  p.boltDmgMul = resolved.boltDmgMul ?? base.boltDmgMul;
  p.fireRate = resolved.fireRate ?? base.fireRate;
  p.speed = resolved.moveSpeed ?? base.speed;
  p.magnet = resolved.magnet ?? base.magnet;
  p.area = resolved.area ?? base.area;
  // defense 无 base（键缺席 = 0），有来源才出现——与旧 f 的键存在性一致
  if (resolved.defense !== undefined) p.defense = resolved.defense;
  else delete p.defense;
  // typeDamageBonus 键级所有权（见函数说明与 ELEMENT_TDB_KEYS）
  const element = resolveKeyedMap("typeDamageBonus", {}, typeDamageBonus);
  if (typeDamageBonus.length > 0) {
    const map = p.typeDamageBonus ?? (p.typeDamageBonus = {});
    for (const key of ELEMENT_TDB_KEYS) {
      const v = element[key];
      if (v !== undefined) map[key] = v;
      else delete map[key];
    }
  } else if (p.typeDamageBonus) {
    for (const key of ELEMENT_TDB_KEYS) delete p.typeDamageBonus[key];
    if (Object.keys(p.typeDamageBonus).length === 0) delete p.typeDamageBonus;
  }
}
