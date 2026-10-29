/**
 * Combat Foundation S4-C（C1 + C2-A + C2-B + C3-A + C3-B + C3-C）：二十二张天赋的属性权威来源表。
 *
 * 职责（任务书 §4-S4-C「全链路权威来源唯一」）：
 * - C1 五张纯 flat：「磐石/铁布衫/致命一击/会心深渊/元素亲和」的属性贡献
 *   在此**声明一次**，由 StatModel 从 picks 序列解析；C2-A 三张逐次乘算：
 *   「磨刃/狂怒/毁灭本能」的 attack final 倍率同样在此声明。C2-B 五张乘法
 *   属性：「强化弹丸/疾速扳机/疾风之靴/磁力护符/广域法印」的
 *   boltDmgMul/fireRate/moveSpeed/magnet/area final 倍率在此声明。
 *   C3-A 两张生命 flat：「生命之泉/巨人血脉」的 maxHp flat +20/+30 在此声明，
 *   并新增实例级持久来源 PersistentStatSources（血包永久成长 potionMaxHpGrow，
 *   作为 maxHp 的 base 增量参与解析——只计一次，不做 flat 修饰符）。
 *   C3-B 一张护盾 flat：「能量护盾」的 shieldMax flat +1/级 在此声明（StatId
 *   白名单新增 shieldMax）；「当前护盾 +1」是获得时效果，分离至
 *   core/OnAcquireEffects.ts——本表不声明 shield/shieldCd（RuntimeState，
 *   D-C3-02/04：重算保留现值、绝不重放赠层）。
 *   C3-C 六张等级型机制卡：「击杀狂热」hasteLv flat +1/级、「疾影步」dashLv
 *   flat +1/级 且 dashMax 有序 flat −0.4/级（每级一条独立修饰符，base 2.4
 *   逐次累加逐位复现旧 f 序列 2.0/1.6/1.2000000000000002，B16 验证；**禁止**
 *   折叠式 2.4−0.4×lv）、「双段疾冲」dashChargeLv flat +1/级、「壁垒」
 *   barrierLv flat +1/级、「不屈」nd flat +1（max=1，保持数字 0/1 与旧 f
 *   `p.nd = 1` 一致）、「战意沸腾」rageLv flat +1/级。对应运行状态
 *   （haste/hasteT、rageT、dashT/dashCharges/dashRe、tempShield、ndUsed）
 *   由 RuntimeStateProtection 快照保留；击杀狂热的「首级 Buff」是获得时
 *   效果（OnAcquireEffects，lvBefore===0 判定），recompute 绝不重放。
 *   data/talents.ts 中这二十二张卡的 `f` 不再写入属性字段（C1/C2 卡无获得时
 *   即时效果，f 为空操作；生命两卡的治疗、能量护盾的赠层分离至
 *   core/OnAcquireEffects.ts，仅在 learnTalent 成功获得时执行、recompute
 *   绝不重放）。旧 `Talent.f`
 *   累加/乘算与新 Modifier 不并行生效——learnTalent/recompute/melt 统一收敛
 *   到 applyTalentStatProjection 写出的投影值。
 * - Player 上的 `defense/tough/crit/critMul/typeDamageBonus/damage/maxhp` 是
 *   兼容投影：字段保留（消费点 CombatStats/UI/pv·cur 不变），但唯一来源是本表
 *   解析。damage 的 base = statBase().damage（数据层初始值），映射到
 *   StatModel 的既有 `attack` StatId——projected 值仍写回既有 `p.damage`
 *   字段，不新增 Player 可枚举字段、不引入第二套累加缓存；伤害管线侧
 *   rawAmount 已含该值（CombatStats.attack = p.damage），DamageSystem 的
 *   globalDamageBonus 等乘区不重复乘 attack。C2-B 五字段同理写回既有
 *   `boltDmgMul/fireRate/speed/magnet/area` 字段（speed ↔ moveSpeed 仅是
 *   Player 字段名与 StatId 的历史命名差，语义一致）。C3-A 的 maxHp 写回
 *   既有 `p.maxhp` 字段，base = statBase().maxhp + 实例级 potionMaxHpGrow
 *   （持久成长仅计入一次）。
 * - 来源所有权（C2-A/C2-B 审计定界）：`p.damage` 的运行期写入者**只有**
 *   三张伤害卡的旧 f（C2-A 已取消）+ 本投影；`boltDmgMul/fireRate/speed/
 *   magnet/area` 的运行期写入者**只有**对应单张卡的旧 f（本批取消）+ 本
 *   投影；五者基础值唯一来自 `statBase()`（recompute 经 Object.assign 重置）。
 *   **五字段各自只有一张天赋来源**（与 attack 的三卡不同），若未来出现
 *   卡外的合法写入者，不得被本投影以 picks 结果直接覆盖——须先在来源表
 *   登记为独立来源并设计兼容方案（任务书 §二.7）。
 * - 来源所有权（C3-A 审计定界）：`p.maxhp` 的运行期写入者**只有**两张生命
 *   卡的旧 f（本批取消）+ 本投影 + 满血血包转化的即时兼容双写
 *   （ProgressionSystem——权威为实例级 potionMaxHpGrow 持久来源，双写仅为
 *   保持当帧满血判定/治疗读取行为，不构成第二来源）；maxhp 基础值唯一来自
 *   `statBase()`（recompute 经 Object.assign 重置后由投影重建）。
 * - 来源所有权（C3-B 审计定界）：`p.shieldMax` 的运行期写入者**只有**能量
 *   护盾的旧 f（本批取消）+ 本投影；基础值唯一来自 `statBase()`（recompute
 *   经 Object.assign 重置后由投影重建）。`p.shield`/`p.shieldCd` 是
 *   RuntimeState：写入者为恢复逻辑（PlayerSystem）、破盾消耗（CombatSystem）
 *   与获得时赠层（OnAcquireEffects，仅 learnTalent 路径）——本表与投影
 *   **不声明、不写回**这两个字段，recompute 侧由 core/RuntimeStateProtection
 *   快照保留（D-C3-02/04）。
 * - 来源所有权（C3-C 审计定界）：`hasteLv/dashLv/dashMax/dashChargeLv/
 *   barrierLv/nd/rageLv` 的运行期写入者**只有**对应六张卡的旧 f（本批
 *   取消）+ 本投影；基础值唯一来自 `statBase()`（dashMax base=2.4，其余
 *   base=0）。对应运行状态写入者不变：haste/hasteT（killEnemy 叠层/受伤
 *   扣层/衰减 + OnAcquire 首级 Buff）、rageT（受击触发/衰减）、dashT/
 *   dashCharges/dashRe（PlayerSystem 充能/消耗/倒计时）、tempShield
 *   （startNextWave 重建/受击消耗）、ndUsed（不屈触发/换波重置）——本表
 *   与投影**不声明、不写回**这些字段。击杀狂热的 haste/hasteT 获得时效果
 *   归 OnAcquireEffects；上限协调（haste 降级夹紧/末级清除、dashCharges
 *   夹紧）归 RuntimeStateProtection.reconcileRuntimeToCaps。
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
import type { Player, Profession } from "./types";

/** 十三张已迁移卡（C1/C2）+ 两张生命卡（C3-A）的来源贡献：标量区（含 attack 与五字段 final）+ 类型化火雷增伤区 */
export interface TalentStatContribution {
  scalars: StatModifier[];
  typeDamageBonus: TypeDamageBonusModifier[];
}

/**
 * C3-A：GameCore 实例级持久属性来源（契约 v1.2 §5.1/§10.8）。
 * 非 Player 字段（不进实体序列化，先例 GameCore.potionGrow）；
 * resetGame 重置、startNextWave 保留；满血血包成功转化时累计。
 * 作为 maxHp 解析的 **base 增量**（statBase().maxhp + potionMaxHpGrow）参与
 * StatModel——只计入一次，绝不重复作为 flat 修饰符（变异④的咬合点）。
 */
export interface PersistentStatSources {
  readonly potionMaxHpGrow: number;
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
 *
 * C3-A（契约 v1.2 §5.1/§10.8）：persistent 为**必传参数**（编译期防线）——
 * 漏传可选参数会让 maxHp 静默按 0 重建（R-1 复活路径），不得用默认值掩盖；
 * 三个生产接入点（learnTalent/recompute/melt→learnTalent）均为 GameCore 方法，
 * 就地取用当前实例的 potionMaxHpGrow。
 */
export function talentStatModifiers(
  picks: readonly string[],
  persistent: PersistentStatSources,
): TalentStatContribution {
  if (persistent.potionMaxHpGrow < 0)
    throw new RangeError(
      `potionMaxHpGrow 不能为负，收到 ${persistent.potionMaxHpGrow}`,
    );
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
      // S5：闪避本能迁入权威来源。旧 f 直接写 p.dodge，属性池加入「闪避」
      // 后必须由投影重建，否则 recompute 的 base 写回会把它抹成 0。
      case "闪避本能": // legacy.ts：dodge +0.08/级（max 4）
        scalars.push({
          sourceId: "天赋:闪避本能",
          stat: "dodge",
          stage: "flat",
          value: 0.08,
        });
        break;
      // ---- S2 射手池：核心链（强化弹）/ 距离链 / 机动链 ----
      // 基础链：全局 pierceFalloff 0.85，射手职业被动 −0.35 → 0.5（第二目标 50%）。
      // 下面两张卡按有序 flat 继续改这个值，语义是「设为」，不是「乘以」。
      case "快速装填": // 强化弹每 4→3 发；穿透 +1，穿透伤害 50% → 80%
        scalars.push(
          {
            sourceId: "天赋:快速装填",
            stat: "pierce",
            stage: "flat",
            value: 1,
          },
          {
            sourceId: "天赋:快速装填",
            stat: "pierceFalloff",
            stage: "flat",
            value: 0.3,
          },
        );
        break;
      case "超载装填": // 强化弹每 3→2 发；穿透 +1，穿透后不再衰减（100%）
        scalars.push(
          {
            sourceId: "天赋:超载装填",
            stat: "pierce",
            stage: "flat",
            value: 1,
          },
          {
            sourceId: "天赋:超载装填",
            stat: "pierceFalloff",
            stage: "flat",
            value: 0.2,
          },
        );
        break;
      case "长弓": // 射程 +15%
        scalars.push({
          sourceId: "天赋:长弓",
          stat: "attackRange",
          stage: "final",
          value: 1.15,
        });
        break;
      case "短弓": // 射程 −10%，攻速 +20%
        scalars.push(
          {
            sourceId: "天赋:短弓",
            stat: "attackRange",
            stage: "final",
            value: 0.9,
          },
          {
            sourceId: "天赋:短弓",
            stat: "fireRate",
            stage: "final",
            value: 1.2,
          },
        );
        break;
      case "距离即收益": // 开关：发射时按目标距离占射程比例追加伤害
        scalars.push({
          sourceId: "天赋:距离即收益",
          stat: "distanceDmg",
          stage: "flat",
          value: 1,
        });
        break;
      // 「双段疾冲」（射手机动槽）的声明在下方 C3-C 段
      case "疾行": // 冲刺距离 +25%；冲刺后的射速窗口是运行时状态
        scalars.push({
          sourceId: "天赋:疾行",
          stat: "dashDistMul",
          stage: "final",
          value: 1.25,
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
      // ---- C3-A：生命 flat（maxHp StatId，复用既有白名单；flat 区 base 起始
      // 逐次累加，整数贡献无浮点歧义）。获得时治疗分离至 OnAcquireEffects，
      // 本表只承载属性贡献，不含 hp 写入。----
      case "生命之泉": // data/talents.ts：p.maxhp += 20/级（max 99）
        scalars.push({
          sourceId: "天赋:生命之泉",
          stat: "maxHp",
          stage: "flat",
          value: 20,
        });
        break;
      case "巨人血脉": // data/talents.ts：p.maxhp += 30/级（max 99）
        scalars.push({
          sourceId: "天赋:巨人血脉",
          stat: "maxHp",
          stage: "flat",
          value: 30,
        });
        break;
      // ---- C3-B：护盾容量 flat（shieldMax StatId，C3-B 新增白名单；整数
      // 贡献无浮点歧义）。「当前护盾 +1」为获得时效果（OnAcquireEffects），
      // 本表只承载容量属性，不声明 shield/shieldCd（RuntimeState，D-C3-02）。----
      case "能量护盾": // data/talents.ts：p.shieldMax++（max 3）；旧 f 的
        // p.shield++（赠层）分离至 OnAcquireEffects，仅 learnTalent 执行
        scalars.push({
          sourceId: "天赋:能量护盾",
          stat: "shieldMax",
          stage: "flat",
          value: 1,
        });
        break;
      // ---- C3-C：六张等级型机制卡（等级属性 = flat 修饰符；对应运行状态
      // 不在此声明，由 RuntimeStateProtection 快照保留）。疾影步每级声明
      // 两条独立修饰符（dashLv +1、dashMax −0.4）——dashMax 走 StatModel
      // flat 区「base 起始、按修饰符顺序逐次累加」语义逐位复现旧 f 序列
      // 2.0/1.6/1.2000000000000002（B16 验证），禁止折叠式 2.4−0.4×lv
      //（先乘后减在 L2/L3 产生 1 ulp 级偏差，契约 §8.3）。----
      case "击杀狂热": // data/talents.ts：hasteLv++（max 5）；旧 f 的首级
        // Buff（haste=1/hasteT=3）分离至 OnAcquireEffects（lvBefore===0），
        // recompute 绝不重放（D-C3-03）
        scalars.push({
          sourceId: "天赋:击杀狂热",
          stat: "hasteLv",
          stage: "flat",
          value: 1,
        });
        break;
      case "疾影步": // data/talents.ts：首级 dashLv=1/dashMax=2.0，后续
        // dashLv++/dashMax−=0.4（max 3）；解锁等级 dashLv 与冷却时长
        // dashMax 是两个独立属性，各自声明
        scalars.push({
          sourceId: "天赋:疾影步",
          stat: "dashLv",
          stage: "flat",
          value: 1,
        });
        scalars.push({
          sourceId: "天赋:疾影步",
          stat: "dashMax",
          stage: "flat",
          value: -0.4,
        });
        break;
      // 机动槽「双段疾冲」：冲刺充能 +1 段。
      // 旧表的同名卡「二段冲刺」已随 S2 退役删除（名字与卡位都被本卡接管）。
      case "双段疾冲":
        scalars.push({
          sourceId: "天赋:冲刺充能+1",
          stat: "dashChargeLv",
          stage: "flat",
          value: 1,
        });
        break;
      case "壁垒": // data/talents.ts：barrierLv++（max 2）；tempShield
        // 每波重建属换波语义（WaveSystem），不在本表
        scalars.push({
          sourceId: "天赋:壁垒",
          stat: "barrierLv",
          stage: "flat",
          value: 1,
        });
        break;
      case "不屈": // data/talents.ts：p.nd = 1（max 1，hidden）；保持数字
        // 0/1 与旧 f 写入形状一致，不布尔化；ndUsed 属运行状态不在本表
        scalars.push({
          sourceId: "天赋:不屈",
          stat: "nd",
          stage: "flat",
          value: 1,
        });
        break;
      case "战意沸腾": // data/talents.ts：rageLv++（max 2）；rageT 属
        // 运行状态不在本表
        scalars.push({
          sourceId: "天赋:战意沸腾",
          stat: "rageLv",
          stage: "flat",
          value: 1,
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
 * 结果只取决于 picks 当前内容与 persistent 持久来源。写入点 = 旧 f 的全部生效点
 * （learnTalent / recompute / melt 经 learnTalent），不存在第二套累积来源。
 *
 * C3-A：persistent 为**必传参数**（与 talentStatModifiers 同理由，见其注释）；
 * maxHp 的 base = statBase().maxhp + persistent.potionMaxHpGrow——血包永久成长
 * 只在 base 计入一次，两张生命卡的贡献为 picks 展开的 flat 修饰符（+20/+30/级），
 * 有效 maxHp = 100 + 血包永久成长 + 按 picks 顺序叠加的生命天赋贡献。
 * p.maxhp 的运行期写入者自本批起**只有**：本投影 + 满血血包转化的即时兼容
 * 双写（ProgressionSystem，保持当帧满血判定/治疗行为；来源唯一权威为
 * potionMaxHpGrow，见该处注释）。
 *
 * 可选字段存在性沿用旧语义：磐石来源存在才写 `defense` 键，无来源删键。
 * typeDamageBonus 为**键级所有权**（第一轮评审 P2）：投影只管理 fire/lightning
 * 两键（ELEMENT_TDB_KEYS，即本表声明的全部映射键）——有来源时以解析结果
 * **绝对覆写**（每次从 picks 全量解析，不与旧值相加，无重复叠加），无来源
 * 时删除这两键（映射因此为空则连映射一并删除）；其余键（physical 等）属
 * 未知外部来源，不在所有权内，学习任何天赋都保持不动。
 *
 * `damage`（C2-A）、`boltDmgMul/fireRate/speed/magnet/area`（C2-B）与
 * `maxhp`（C3-A）、`shieldMax`（C3-B）、`hasteLv/dashLv/dashMax/dashChargeLv/
 * barrierLv/nd/rageLv`（C3-C）为必写字段：字段由 statBase 提供
 * （与 tough/crit/critMul 同类的必填投影），投影以对应 base 全量解析后
 * 覆写——无来源时写回 base 值（maxHp 无生命卡来源时 = 100 + 血包永久成长，
 * shieldMax 无能量护盾来源时 = 0，dashMax 无疾影步来源时 = 2.4，nd 保持
 * 数字 0/1）。来源所有权见模块头注：卡外写入者
 * 出现前不得以本投影覆盖。`p.shield`/`p.shieldCd`（C3-B）与 `p.haste`/
 * `p.hasteT`/`p.rageT`/`p.dashT`/`p.dashCharges`/`p.dashRe`/`p.tempShield`/
 * `p.ndUsed`（C3-C）**不在投影内**：RuntimeState 由 RuntimeStateProtection
 * 在 recompute 快照保留，获得时效果只发生在 OnAcquireEffects（learnTalent
 * 路径）。haste 的临时攻速增益（AttackSystem 消费点动态乘算）不进本投影、
 * 不烘焙进 fireRate（C2-B 纪律延续）。
 *
 * 兼容边界（明示，不猜测恢复）：
 * - 外部来源若也写 fire/lightning，与元素亲和贡献无法区分，投影覆写为
 *   权威值——当前无此类运行时写入者，外部写入者须避开这两键；
 * - recompute/melt 路径沿用历史行为：recompute 先整体删除 typeDamageBonus
 *   键再重放（S3-B 语义），外部键在该路径不保留——原有状态行为，本轮不动。
 */
export function applyTalentStatProjection(
  p: Player,
  persistent: PersistentStatSources,
  /**
   * S1：非天赋来源的修饰符（目前是属性强化，见 `core/AttributeSources.ts`）。
   * **必须在下述同一次 resolveStats 里合并**，不能另起一次投影——否则后写的
   * 一方会覆盖前一方算出的字段（recompute 先重置再投影，两次投影等于互相抹）。
   * 顺序上排在天赋修饰符之后：不同 stage 之间顺序无关（flat 求和、percent
   * 求和、final 连乘是分区计算），只有同 stage 的 final 连乘顺序会影响浮点
   * 末位，而属性设计上以 flat/percent 为主，不受影响。
   */
  externalModifiers: readonly StatModifier[] = [],
  /**
   * S3：职业基础形态。base 由 `statBase(prof)` 给出——法师的
   * fireRate（施法速度）与 attackRange（施法距离）与射手不同。
   * 省略时按射手，保持既有调用与测试的默认行为。
   */
  prof: Profession = "shooter",
): void {
  const base = statBase(prof);
  const { scalars, typeDamageBonus } = talentStatModifiers(p.picks, persistent);
  const resolved = resolveStats({
    base: {
      attack: base.damage,
      tough: base.tough,
      // S5：闪避 base = 0；来源为属性池「闪避」与旧卡「闪避本能」
      dodge: base.dodge,
      critChance: base.crit,
      critMultiplier: base.critMul,
      // S1：射程 base = 数据层 130（此前是 AttackSystem 硬编码；无来源时
      // 写回 130，与硬编码行为等价）
      attackRange: base.attackRange,
      // C3-A：maxHp base = 数据层初始值 + 实例级血包永久成长（持久来源仅在此
      // 计入一次；生命卡贡献为 flat 修饰符，非 base）
      maxHp: base.maxhp + persistent.potionMaxHpGrow,
      // C3-B：护盾容量 base = 数据层初始值 0，recompute 经 Object.assign
      // 重置后由本投影全量解析，无来源时写回 base 值
      shieldMax: base.shieldMax,
      // C3-C：六张等级型机制卡的等级属性 base = 数据层初始值（dashMax
      // 2.4 为未解锁占位——消费点由 dashLv>0 门控，不消费该值；nd 保持
      // 数字与旧 f `p.nd = 1` 形状一致），recompute 重置后由本投影重建
      hasteLv: base.hasteLv,
      dashLv: base.dashLv,
      dashMax: base.dashMax,
      dashChargeLv: base.dashChargeLv,
      barrierLv: base.barrierLv,
      nd: base.nd,
      rageLv: base.rageLv,
      // C2-B：五字段 base = statBase 数据层初始值（fireRate 2.2 / speed 62 /
      // magnet 36 / boltDmgMul 1 / area 1），recompute 经 Object.assign 重置
      // 后由本投影全量解析，无来源时写回 base 值
      boltDmgMul: base.boltDmgMul,
      fireRate: base.fireRate,
      moveSpeed: base.speed,
      magnet: base.magnet,
      area: base.area,
      // S2：射手基础穿透衰减（0.5）与冲刺距离倍率（1）必须进 base，
      // 否则 final/flat 修饰符从 0 起算（0.5 被算成 0.3、1.25 被算成 0）。
      // 这两键没有任何旧卡写入，因此进 base 不会覆盖 f 的结果。
      pierceFalloff: base.pierceFalloff,
      dashDistMul: base.dashDistMul,
    },
    // S1：天赋修饰符在前、外部（属性）修饰符在后，同一次解析完成
    modifiers: externalModifiers.length
      ? [...scalars, ...externalModifiers]
      : scalars,
  });
  p.tough = resolved.tough ?? 0;
  p.dodge = resolved.dodge ?? base.dodge;
  p.crit = resolved.critChance ?? base.crit;
  // 不含觉醒：DamageMath.critMultiplier 在读取时按 upCounts 现值叠加 0.4
  p.critMul = resolved.critMultiplier ?? base.critMul;
  // C3-A：maxHp 解析结果写回既有 maxhp 字段（base 含血包永久成长 + 生命卡
  // flat；无生命来源时 = 100 + potionMaxHpGrow，与旧 f 无写入时的语义一致）
  p.maxhp = resolved.maxHp ?? base.maxhp + persistent.potionMaxHpGrow;
  // C3-B：shieldMax 解析结果写回既有字段（每级 flat +1，整数精确）；shield/
  // shieldCd 不在此写回（RuntimeState，见函数说明与 RuntimeStateProtection）
  p.shieldMax = resolved.shieldMax ?? base.shieldMax;
  // C3-C：六张等级型属性解析结果写回既有字段（整数 flat 精确；dashMax 走
  // 有序 flat 逐位复现旧 f 序列，见来源表疾影步 case 注释）；haste/hasteT/
  // rageT/dashT/dashCharges/dashRe/tempShield/ndUsed 不在此写回
  //（RuntimeState，见函数说明与 RuntimeStateProtection）
  p.hasteLv = resolved.hasteLv ?? base.hasteLv;
  p.dashLv = resolved.dashLv ?? base.dashLv;
  p.dashMax = resolved.dashMax ?? base.dashMax;
  p.dashChargeLv = resolved.dashChargeLv ?? base.dashChargeLv;
  p.barrierLv = resolved.barrierLv ?? base.barrierLv;
  p.nd = resolved.nd ?? base.nd;
  p.rageLv = resolved.rageLv ?? base.rageLv;
  // C2-A：attack 解析结果写回既有 damage 字段（base=statBase().damage，
  // final 区按 picks 顺序连乘——与旧 f 重放运算序列逐位一致）
  p.damage = resolved.attack ?? base.damage;
  // C2-B：五字段解析结果写回既有 Player 字段（speed 字段 = moveSpeed StatId）
  p.boltDmgMul = resolved.boltDmgMul ?? base.boltDmgMul;
  p.fireRate = resolved.fireRate ?? base.fireRate;
  p.speed = resolved.moveSpeed ?? base.speed;
  p.magnet = resolved.magnet ?? base.magnet;
  p.area = resolved.area ?? base.area;
  // S1：射程写回（base 130；属性/天赋都未改动时写回 130，与旧硬编码等价）
  p.attackRange = resolved.attackRange ?? base.attackRange;
  // S2 射手池：核心/距离/机动三个槽位的标量。
  // **只在有来源时才写**：旧表仍有卡靠 `f` 直接写
  // `p.pierce` / `p.multishot`，无条件写回会把它们的值覆盖成 base
  //（表现为「旧卡学了没用」，parity 的全天赋场景会立刻对不上）。
  // 这五个键不在上方 base 里，因此无来源时 resolved 中不存在 → 保留 f 的值。
  if (resolved.pierce !== undefined) p.pierce = resolved.pierce;
  if (resolved.pierceFalloff !== undefined)
    p.pierceFalloff = resolved.pierceFalloff;
  if (resolved.multishot !== undefined) p.multishot = resolved.multishot;
  if (resolved.distanceDmg !== undefined)
    p.distanceDmg = resolved.distanceDmg;
  if (resolved.dashDistMul !== undefined)
    p.dashDistMul = resolved.dashDistMul;
  // S2 续航（#135）：同样「有来源才写」——旧表吸血獠牙/修复微光仍靠 f 直写
  // 这两个字段，无条件写回会把它们抹成 0（parity 全天赋场景会立刻对不上）。
  // 两者都不在 base 里，所以属性 flat 从 0 起算，符合 statBase 的初始值。
  if (resolved.lifesteal !== undefined) p.lifesteal = resolved.lifesteal;
  if (resolved.regen !== undefined) p.regen = resolved.regen;
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
