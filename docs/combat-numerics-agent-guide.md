# Pixel Rogue 数值系统开发指南（Coding Agent）

> **适用范围**：上游已合并 S4-D2-B（PR #116），并包含本次 DamageSystem 自有键读取修复。本文是面向后续开发 Agent 的真实代码接口图谱；面向玩家的图文讲解见 [combat-numerics-explained.md](combat-numerics-explained.md)。
>
> **用户当前工作方式**：优先快速完成底层；**暂停新增测试与主动执行完整测试/浏览器验收**，最终集中验证；不能未经验证宣称已通过，不能随意覆盖工作区、修改冻结公式或未经授权提交/推送。

## 1. 架构总图及最短阅读顺序

~~~mermaid
flowchart TD
  C["配置：data/stats / enemies / talents / combatBalance / damageTypes"] --> S["来源：TalentStatSources / EnemyStatSources"]
  S --> M["StatModel.resolveStats / StatKeyedMap.resolveKeyedMap"]
  M --> E["Player / Enemy 实体兼容字段"]
  E --> SNAP["CombatStats 快照：发射 / 引爆 / 实时接触"]
  A["Attack / Projectile / EnemySystem / DamageMath 形成 rawAmount"] --> SYS["CombatSystem 受击编排"]
  SNAP --> SYS
  SYS --> CALC["DamageSystem.calculateDamage"]
  CALC --> HP["CombatSystem 应用：HP/护盾/致死/掉落/飘字/报告"]
  R["RuntimeStateProtection：属性重算时保留运行态"] -.-> E
~~~

**修改前先找权威来源，而不是找到一个数值字段就直接赋值。**

## 2. 文件、接口、修改场景速查表

| 文件 | 关键入口 | 何时修改 / 限制 |
|---|---|---|
| src/game/data/stats.ts | statBase() | 玩家初始数值：damage、maxhp、speed、fireRate、crit、critMul 等 |
| src/game/data/enemies.ts | ETYPES: Record<string, EnemyConfig> | 怪物基本数值/解锁波次/生成权重/可选抗性增伤；不自动提供特殊 AI |
| src/game/data/talents.ts | UPGRADES / RAMP | 天赋配置、描述、旧机制卡的 f；**已迁移 22 张属性卡不得在 f 再加一次** |
| src/game/data/combatBalance.ts | COMBAT_BALANCE / CombatBalance | armorK=50、resistanceCap=0.75、resistanceFloor=-0.5、toughCap=0.6、技能系数集中配置 |
| src/game/data/damageTypes.ts | DAMAGE_TYPES / DamageTypeId | 伤害属性注册、mitigation（armor/resistance/none）和 label |
| src/game/core/StatModel.ts | STAT_IDS、KEYED_STAT_FAMILIES、StatSheet、StatModifier、resolveStats、modifierSources | 通用 base/flat/percent/final 模型和白名单 |
| src/game/core/StatKeyedMap.ts | resolveKeyedMap | 按键映射属性族；仅字符串 key；自有键优先，拒绝危险 __proto__ |
| src/game/core/TalentStatSources.ts | talentStatModifiers、applyTalentStatProjection | 已迁移玩家天赋属性权威来源，投影写回 Player 老字段 |
| src/game/core/TalentSystem.ts | learnTalent、recompute、chooseSlot | 获得、重算、置换编排；重算要保护运行状态 |
| src/game/core/OnAcquireEffects.ts | applyOnAcquireEffect | 仅获得时治疗/赠盾/首级 Buff，不可重算时重播 |
| src/game/core/RuntimeStateProtection.ts | captureRuntimeState、restoreRuntimeState、effectiveCaps、reconcileRuntimeToCaps | 当前 15 个运行态字段的保存/恢复/上限协调 |
| src/game/core/EnemyStatSources.ts | resolveEnemySpawnStats、resolveEnemyDefense、resolveEnemyAttackBonuses | 怪物生成时一次性缩放与解析，保持 RNG 次序 |
| src/game/core/EnemySystem.ts | spawnEnemy、updateEnemies | 怪物生成、AI、发弹、自爆、碰撞，特殊分支按 type |
| src/game/core/CombatStats.ts | getPlayerCombatStats、getEnemyCombatStats | 构建战斗属性快照、拷贝映射，防止发射后变化回溯 |
| src/game/core/types.ts | Player / Enemy / EnemyConfig / CombatStatsSnapshot / DamageRequest / DamageResult / HitOptions | 类型和消费者接口，新增字段必须全链路接通 |
| src/game/core/DamageSystem.ts | calculateDamage、typeMitigationFactor、generalMitigationFactor | 纯计算：四乘区、暴击、减伤和精度；不直接操作 HP/RNG |
| src/game/core/CombatSystem.ts | hurtEnemy、damagePlayer、applyBurnDot、applyBurnGroundDot、killEnemy | 闪避/护盾/暴击掷骰/应用伤害/死亡副作用 |
| src/game/core/DamageMath.ts | boltDamage、critMultiplier、meteorDamage、burnStackDps 等 | 纯技能公式；系数从 combatBalance 取 |
| src/game/core/AttackSystem.ts | updateAttacks | 玩家弹丸、攻速、陨星、环绕、焦土；形成 rawAmount 和快照 |
| src/game/core/ProjectileSystem.ts | updateProjectiles | 双方弹丸/碰撞/反弹，命中时委托 CombatSystem |
| src/game/core/PlayerSystem.ts | updatePlayer | 移动/冲刺/回血/护盾充能/临时计时 |
| src/game/core/WaveSystem.ts | waveQuota / updateWave / startNextWave | 波次配额与休整，修改波次行为 |
| src/game/core/StatSheets.ts | playerShadowFromEntity、playerShadowFromPicks、enemyShadow* | **影子对照工具，不是运行时权威来源** |

## 3. 关键接口和数学契约

~~~ts
type ModifierStage = "flat" | "percent" | "final";
interface StatModifier {
  readonly sourceId: string;
  readonly stat: StatId;
  readonly stage: ModifierStage;
  readonly value: number;
}
interface StatSheet {
  readonly base: Readonly<Partial<Record<StatId, number>>>;
  readonly modifiers: readonly StatModifier[];
}
function resolveStats(sheet: StatSheet): Readonly<Partial<Record<StatId, number>>>;
function resolveKeyedMap<F extends KeyedStatFamily>(
  family: F,
  base: Readonly<Partial<Record<string, number>>>,
  mods: readonly (StatModifier & { stat: F; key: string })[],
): Record<string, number>;
~~~

- **属性公式**：有效值 = [base 逐项 + flat] × [1 + sum(percent)] × final① × final② …；flat 和 final 必须保留原顺序（IEEE754）。
- **基本约束**：base 有限且非负；flat 可负；percent 单项 > −1；final 是倍率本身且 > 0；聚合溢出报错；缺省属性应保持 Partial 形状。
- **映射族**：typeDamageBonus、resistance、formDamageBonus、skillDamageBonus；各 key 独立走解析。EnemyStatSources 的负增伤转成 base=0 + flat；可解析 −1.1，但消费时 RangeError。
- **数据所有权**：Player.damage 对应 StatId attack；Player.maxhp 对应 maxHp；Player.speed 对应 moveSpeed。天赋投影直接写回原字段，不创建影子权威缓存。
- **不要双算 attack**：rawAmount 已含角色攻击值或技能倍率，calculateDamage 不再乘 CombatStatsSnapshot.attack。

~~~ts
interface CombatStatsSnapshot<T extends string = DamageTypeId> {
  attack: number; defense: number; tough: number;
  critChance: number; critMultiplier: number;
  resistances: Partial<Record<T, number>>;
  globalDamageBonus: number;
  typeDamageBonus: Partial<Record<T, number>>;
  formDamageBonus: Partial<Record<AttackForm, number>>;
  skillDamageBonus?: Readonly<Record<string, number>>;
}
interface DamageRequest<T extends string = DamageTypeId> {
  rawAmount: number;
  type: T; form: AttackForm;
  origin: string; kind: "hit" | "dot";
  precision: "round-min-one" | "preserve-float";
  skillId?: string; tags?: readonly string[];
  attackerStats: Readonly<CombatStatsSnapshot<T>>;
  defenderStats: Readonly<CombatStatsSnapshot<T>>;
  isCritical: boolean;
}
~~~

**伤害公式**（DamageSystem.ts，左结合次序不能无故重排）：

~~~text
D = rawAmount
 × (1 + globalDamageBonus)
 × (1 + typeDamageBonus[type])
 × (1 + formDamageBonus[form])
 × (1 + skillDamageBonus[skillId]，无 skillId 则 0)
 × (isCritical ? critMultiplier : 1)
 × typeMitigationFactor(registry,type,defender,balance)
 × generalMitigationFactor(registry,type,defender,balance)
~~~

| 策略 | 属性减伤 | 通用减伤 |
|---|---|---|
| armor | K / (K + max(0, defense)) | 1 − clamp(tough, 0, 0.6) |
| resistance | 1 − clamp(resistances[type], -0.5, 0.75) | 同上 |

负抗性表示弱点：res = -0.2 时对应元素伤害 ×1.2；弱点下限 -50%。
| none | 1 | 1 |

当前 physical=armor、fire/lightning=resistance、true=none。K=50。

**round-min-one**：仅正伤害在末尾 Math.max(1, Math.round(D))；0 伤害维持 0。**preserve-float**：原样浮点；玩家受击和 DoT 固定使用，DoT 不暴击。每个 bonus 必须有限且 ≥ −1。range 校验发生在 DamageSystem 消费点。

**DamageResult**：rawDamage、beforeMitigation、settledDamage、isCritical + effectiveHpLoss、dodged、shieldUsed、lethal、killed、preventedDeath。DoT 可以 lethal=true 但 killed=false，因为死亡在后续外层处理。

### 当前类型/接口的实际缺口

虽然 DamageRequest 和 CombatStatsSnapshot 支持 skillId / skillDamageBonus，**现有 HitOptions / PlayerHitOptions 没有 skillId，也未向 calculateDamage 透传**。只配置技能增伤并不会使普通 hit 生效。若将来开发专属技能增伤，应按下文 E 步骤接通，而不是误认为已支持完整调用链。

### 与原始伤害相关的其他函数

| DamageMath 函数 | 现有计算 |
|---|---|
| boltDamage | p.damage × p.boltDmgMul |
| critMultiplier | p.critMul + 达到 8 级致命一击觉醒时 +0.4 |
| meteorDamage | p.damage × 3 + p.meteor × 8 |
| shieldShockDamage | p.damage × 2 |
| burnStackDps | stacks × p.damage × 0.1 |
| burnGroundDps | p.damage × 0.2 |
| scorchVulnMultiplier | 1 + p.scorchVuln |
| frostFreezeDuration | 0.4 + 0.2 × p.frostLv |
| multishotSpread | 根据附近敌人数量插值 0.04～0.16 |

动态开火间隔在 AttackSystem：1 / [fireRate × (1 + haste×0.1 + 激活战意时 rageLv×0.2)]。敌人波次 HP、dmg 与速度缩放在 EnemyStatSources；waveQuota 在 WaveSystem。

## 4. 开发任务决策表（按需求找到修改位置）

| 要做的事 | 首选位置 | 需要联动 | 禁忌 |
|---|---|---|---|
| 改玩家基础攻击 / HP / 速度 / 暴击 | data/stats.ts | 检查投影和 UI 文本 | 不在 DamageSystem 添加初始值 |
| 改某张已迁移天赋属性 | TalentStatSources.talentStatModifiers | talents.ts 描述/pv/cur | 不在 talent.f 重复加 |
| 新天赋永久加成 | talents.ts + TalentStatSources（若纳入模型） | StatId/投影/消费点 | 不假定加了白名单就生效 |
| 新临时 Buff 或冷却 | OnAcquireEffects 或运行系统 | RuntimeStateProtection 如需重算保护 | 不把当前盾层等重算为永久属性 |
| 改怪物 HP/攻击/移速 | data/enemies.ts | EnemyStatSources 会自动缩放 | 不随意调换倍率顺序 |
| 改怪物抗性/护甲/增伤 | data/enemies.ts 可选字段 | 生成时解析 → 快照 → 消费 | 30% 应写 0.3，不是 30 |
| 改护甲 K/抗性上限/韧性上限 | data/combatBalance.ts | UI/说明、消费点 | 不复制新公式 |
| 改属性强化硬顶（吸血/回复/攻速/移速） | data/attributeBalance.ts | AttributeSystem 的 capped 过滤、TalentStatSources 的投影夹紧 | 不在属性卡或消费点复制上限 |
| 改射手 20 波后动态难度（DR/HP/护甲/攻击） | data/difficulty.ts | EnemyStatSources 生成、EnemySystem 写 `damageTakenMul`、CombatSystem / ElementSystem 最终乘区 | DR 不是抗性；它要压 true / 百分比生命 / DoT |
| 改魔弹/陨星/燃烧系数 | data/combatBalance.ts / DamageMath.ts | 技能调用及描述 | 不在多个攻击点写魔法常量 |
| 改精英/波次成长 | EnemyStatSources.ts / WaveSystem.ts | 生命、攻击、速度、配额 | 不改变无关 RNG |
| 改新技能攻击行为 | AttackSystem / MeleeSystem / EnemySystem / ProjectileSystem | CombatSystem、DamageRequest | 不另建伤害计算旁路 |
| 新伤害来源统计 | types.ts DamageSource + GameCore.dmgBy | 报告、对应 hurtEnemy.src | DamageSource ≠ DamageTypeId |

## 5. 新增伤害类型（frost 为例）

1. 在 data/damageTypes.ts 注册 frost，配置减伤策略及展示名。DamageTypeId 从注册表 keyof 推导，不需要在 DamageSystem 写针对 frost 的 switch。
2. 在技能/攻击发起端明确 type:"frost"、form:"ranged" 等；只有注册表不会自动制造一个新技能。
3. 怪物或玩家的 resistances.frost（例如 0.25）和 typeDamageBonus.frost 可通过对应来源进入快照。若天赋新增元素修正，在 TalentStatSources 声明带 key:"frost" 的映射 Modifier，确保投影拥有此 key 的所有权，不要破坏现有 fire/lightning 所有权规则。
4. 需要冻结、减速或特效时，在受击编排/效果模块实现，不能塞进 DamageSystem 的纯数值逻辑。
5. 检查 Player/Enemy/HitOptions 的类型与新的 UI、来源统计、展示是否打通。DamageSource（攻击来源）独立于 DamageTypeId（元素属性）。
6. 记入最终集中验收清单（目前不新增测试）。

~~~ts
// 以下仅示例注册表扩展；必须一并完成实际攻击调用和显示适配
frost: { mitigation: "resistance", label: "冰霜" }
~~~

## 6. 新增怪物（frostling 为例）

在 data/enemies.ts 的 ETYPES 配：

~~~ts
// 示例数值只用于说明字段格式，不是已经批准的平衡配置
frostling: {
  hp: 24, speed: 36, dmg: 9, r: 4, xp: 2,
  spr: "frostling", w0: 9, wt: 12,
  defense: 5,
  resistances: { frost: 0.25 },
  typeDamageBonus: { frost: 0.15 },
}
~~~

注意顺序：若 frost 类型尚未注册，先加类型。EnemyConfig 必填 hp / speed / dmg / r / xp / spr / w0 / wt，可选 defense / resistances / tough / 四类攻击增伤。缺字段保持缺省，不能无差别物化中性值。

| 入口 | 实际职责 | 新怪物相关事项 |
|---|---|---|
| spawnEnemy | 类型选取、出生坐标、speedJitter、创建实体 | 调用三类 EnemyStatSources 解析，不随便新增 RNG |
| resolveEnemySpawnStats | hp × 波次 × 精英；dmg × 波次 × 精英；speed × 精英 × jitter（v46 起 hp 不再乘等级） | 不在 enemies.ts 预先重复乘这些倍率 |
| resolveEnemyDefense | 护甲、抗性、韧性；已配置护甲按生成波次叠加 flat 成长，上限 +24 | 可选字段缺省时不写入实体 |
| resolveEnemyAttackBonuses | global/type/form/skill | 有限负值、±0、Symbol、自有原型键策略参见源码 |
| updateEnemies | AI 移动、射击、引爆、接触 | shooter/bomber/bat 是硬编码特殊分支，其他默认追逐 |
| CombatStats | getEnemyCombatStats | 发射时/引爆时拍快照；接触时实时读取 |

- 只在 ETYPES 加新键，**默认行为是追逐与接触攻击**；额外的远程技能、召唤、冰冻等需要 AI 分支或独立系统（现有特殊分支：shooter / bomber / charger / drummer / spinner / burrower；splitter 的死亡分裂在 `CombatSystem.killEnemy`；精英词缀由 `Enemy.affix` 驱动）。
- spr 指向纹理/渲染资源，还要处理视觉、图鉴、击杀统计、波次主题权重和精英特殊表现。
- w0 为解锁波次；**实际刷新权重来自 `WAVE_THEMES` 的主题表，不再直接读 `wt`**。新增怪物必须加入对应波次的主题 `weights`，否则即使 w0 达到也不会刷新；`wt` 仅作为图鉴里的初始权重说明。`signature` 指定主题首次出现时保底刷出的怪（只消费一次）。
- 隐藏子体（如 `splitling`）用 w0 999 且不加入主题表，避免进入随机刷新池；击杀日志对未登记图鉴的类型安全忽略。

## 7. 新增 StatId、天赋或 skillDamageBonus 的完整链路

**新标量 StatId**：StatModel.STAT_IDS → statBase/来源声明 → resolveStats → Player/Enemy 字段投影 → 消费点；必要时调整 types.ts 和 UI。StatModel 只负责求值，不会自动更新实体。

**新的映射族**：StatModel.KEYED_STAT_FAMILIES → 结构化 key 及 resolveKeyedMap → 来源适配 → CombatStats / 自定义消费者。区分 stat 族与具体 key。

**已迁移天赋**：先在 TalentStatSources 的 switch 写 Modifier，以 picks 顺序重建；数据层 talents.ts 负责卡名、描述/展示。其 f 对迁移的属性应该继续空操作。只有首次获得才发生的治疗、护盾/首级 Buff 放 OnAcquireEffects，recompute 不能重复触发。

**skillDamageBonus 生效需补的调用链**：
1. types.ts 的对应 HitOptions / PlayerHitOptions 新增可选 skillId 字段；
2. CombatSystem.hurtEnemy / damagePlayer 构造 DamageRequest 时把 opts.skillId 透传；
3. 对应技能调用明确 skillId（例如 bolt），同一套键名贯穿配置、快照和请求；
4. 通过 TalentStatSources/EnemyStatSources 或其他合法来源产生 skillDamageBonus，并由 CombatStats 拷贝；
5. 保持 type/form/origin/skillId 语义独立：type=伤害属性，form=攻击方式，origin=来源标签，skillId=额外技能增伤的精确键。

## 8. 不变式、风险与提交边界

| 风险 | 必须保持 |
|---|---|
| 伤害自有键安全 | DamageSystem 按 Object.hasOwn 读取 resistances、type/form/skill 增伤；缺失键中性 0，不能把原型链 constructor/toString 读为数值 |
| 注册表 | DamageSystem.requireRegistryEntry 也做 Object.hasOwn；未注册伤害 type 抛错 |
| 精度 | float 顺序严格保持；0 伤害不能被 min-one 复活 |
| RNG | 敌人生成类型/位置/jitter/seed/shootCd 原序与次数保持 |
| 可选字段形状 | 没有配置的增伤/抗性/DEF 不被物化为 0 |
| 三层映射隔离 | 配置 → Enemy → CombatStatsSnapshot 要复制映射 |
| 临时状态 | recompute 捕获 → 清键/重建 → 投影 → 恢复 → 仅上限降低方向协调 |
| 三种快照 | 发射固化、引爆时固化、接触实时读取 |
| 真实伤害 | 忽略护甲/抗性/韧性，但仍应用其余合法伤害参数 |
| 已知边界 | 22 张天赋已权威迁移，其他旧机制仍存在；Shadow Stats 是对照而非消费权威 |

**快速开发流程**：检查工作区 → 明确权威来源与消费点 → 小范围实现 → 记录代码差异与待集中验收风险。用户已要求暂不新增测试与主动整套验收，不得把“未验证”说成“测试通过”；提交、推送、PR、合并须另行授权。

### 更多文档

- 面向非开发者、含公式示例和 Mermaid 图：[combat-numerics-explained.md](combat-numerics-explained.md)
- 原始战斗契约：docs/pixel-rogue-combat-foundation-v1.md
- D0 行为冻结：docs/pixel-rogue-S4D-D0-contract-v1.md
- 玩家运行态契约：docs/pixel-rogue-S4C-C3-contract-v1.md
- 历史迁移日志：docs/migration.md
