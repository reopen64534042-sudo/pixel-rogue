# Pixel Rogue 底层数值系统：从属性到伤害（原 Markdown 文字版）

> **现已改为更容易理解的离线交互网页：** [打开交互数值图解](combat-numerics-explained.html)。这个 Markdown 文件作为旧文字版保留，建议优先阅读 HTML。

> 适用代码：S4-D2-B 已合并后的战斗底层，以及本次 DamageSystem 自有键读取修复。这里介绍**当前实际实现**，不是未来计划。纯计算、已有天赋系统和技能特例同时存在；不能把所有数值都理解成一个公式。代码入口参见末尾索引。
>
> 阅读路径：先看 §1 总图，再看 §2 属性公式、§3 伤害公式；需要调平衡时看 §6、§7；需要开发操作请看同目录的 **combat-numerics-agent-guide.md**。

## 1. 这套底层可以分成哪几层？

可以把一次战斗想成四步：**出厂属性 → 加成重算 → 攻击/防守快照 → 扣血与副作用**。同时还有独立的运行状态（当前 HP、护盾层数、冷却、Buff 时间），它们不是永久属性。

~~~mermaid
flowchart TD
    A["数据表：stats.ts / enemies.ts / talents.ts"] --> B["属性来源：TalentStatSources / EnemyStatSources"]
    B --> C["StatModel.resolveStats：基础 + flat / percent / final"]
    C --> D["Player / Enemy：兼容字段与当前状态"]
    D --> E["CombatStats：生成攻防快照"]
    F["技能与攻击系统：选目标、命中、计算 rawAmount"] --> G["CombatSystem：闪避/护盾/暴击判定和流程"]
    E --> G
    G --> H["DamageSystem.calculateDamage：增伤 × 暴击 × 减伤"]
    H --> I["CombatSystem：扣血、吸血、击杀、掉落、报告"]
    J["RuntimeStateProtection：重算前保存盾层、冲刺与计时等"] -.-> D
    K["DamageMath：魔弹、陨星、灼烧、攻速相关特例"] --> F
~~~

| 层 | 主要职责 | 直觉解释 |
|---|---|---|
| 数据 | 给出初始攻击力、怪物基础 HP、系数、天赋定义 | 配方与原材料 |
| 属性模型 | 把各种来源合成为有效属性 | 把装备和升级加到人物面板 |
| 快照 | 从实体取出本次攻防相关数值，复制映射 | 在合适时刻“拍一张属性照片” |
| 伤害计算器 | 纯算术：增伤、暴击、护甲、抗性、通用减伤 | 算这一击应该造成多少 |
| 战斗编排 | 闪避、护盾、实际扣血、死亡、掉落、音效 | 把算出的伤害应用到游戏 |
| 运行状态 | 当前生命、临时护盾、冲刺、Buff、冷却 | 战斗中不断变化的实时进度 |

**重要：** 玩家 Player 的 attack 在实体中叫 **damage**，敌人 Enemy 叫 **dmg**；伤害管线快照统一叫 **attack**。攻击基础值通常已经算进 rawAmount，不能在伤害计算器里再乘一次 attack。

## 2. 属性是怎么算出来的？不只有伤害

通用属性解析器是 **core/StatModel.ts → resolveStats(StatSheet)**，公式可概括为：

**有效属性 =（base 按顺序加上所有 flat）×（1 + 所有 percent 之和）×（依次相乘的 final）**

~~~mermaid
flowchart LR
    A["base 初始值"] --> B["+ flat① + flat② … 按顺序"]
    B --> C["× (1 + percent① + percent② + …)"]
    C --> D["× final① × final② … 按顺序"]
    D --> E["effective 有效属性"]
~~~

| 修正阶段 | 输入示例 | 计算规则 | 常见用途 |
|---|---|---|---|
| base | 基础攻击 100 | 从初始值开始 | stats.ts、EnemyConfig |
| flat（固定增减） | +20、-5 | 一条一条按顺序加 | 磐石 +15 护甲、生命之泉加 HP |
| percent（同区百分比） | +10% 和 +20% | 合为 1 + 0.1 + 0.2 = 1.3 | 通用 StatModel 支持，**不等于伤害四乘区** |
| final（独立倍率） | ×1.1、×1.2 | 依顺序连续相乘 | 磨刃、狂怒、部分成长系天赋 |

**算一个例子：** 基础攻击 100，固定加 20 和 10，百分比 +10% 与 +20%，最终倍率 ×1.5、×1.1。结果为 (100+20+10) × 1.3 × 1.5 × 1.1 = **278.85**。

注意 JavaScript 浮点数的运算顺序：实际实现是从 base 开始逐次加 flat、percent 汇总后乘一次、final 按原序连乘；为保持历史游戏一致性，不能随意把多次乘法化简或改变分组。

**这里的 StatModel 既用于攻击，也用于**：物理护甲 defense、最大生命 maxHp、移动速度 moveSpeed、攻速 fireRate、暴击率 critChance、暴伤 critMultiplier、韧性 tough、弹丸特化倍率、拾取半径、范围倍率、护盾容量、冲刺/狂热等等级属性。四张键控映射族是 typeDamageBonus（属性伤害加成）、resistance（抗性）、formDamageBonus（攻击方式增伤）、skillDamageBonus（技能增伤），每个键按一张小属性表解析。

### 天赋怎样进入面板？

~~~mermaid
flowchart TD
  A["learnTalent：获得天赋，记录 picks"] --> B["TalentStatSources.talentStatModifiers"]
  B --> C["resolveStats / resolveKeyedMap"]
  C --> D["applyTalentStatProjection：写回 Player 兼容字段"]
  A --> E["OnAcquireEffects：仅在获得时发生的回血/赠盾/Buff"]
  F["recompute：置换或重建"] --> G["保存 RuntimeState 快照"]
  G --> H["statBase 重建 + 重放旧卡 + 属性投影"]
  H --> I["恢复 RuntimeState + 上限协调 + HP 夹紧"]
~~~

已经迁移的 22 张天赋由 TalentStatSources 提供属性贡献，未迁移卡仍可在 talents.ts 的 f 中直接应用原有机制。属性重算 **不会再给你额外发一次护盾、治疗或首级 Buff**；这类获得时效果独立于属性模型。

### 属性 ≠ 运行状态

- maxHp（最大血量）是属性；hp（当前血量）是运行状态，重算不能凭空回满。
- shieldMax 是护盾容量；shield、shieldCd 是现有盾层和恢复时间。
- hasteLv 是狂热等级；haste、hasteT 是当前 Buff 层数和剩余时间。
- dashLv、dashMax 等定义能力；dashT、dashCharges、dashRe 是实战中的冲刺状态。

RuntimeStateProtection 专门避免重算属性时清掉这些状态。满血血包的**永久最大生命成长**另存在每局 GameCore.potionMaxHpGrow 中，参与后续投影。

## 3. 一次伤害有哪些乘区？

真正的通用计算入口是 **core/DamageSystem.ts → calculateDamage()**。

计算顺序是：

**原始伤害 × 全局增伤 × 属性增伤 × 攻击方式增伤 × 技能增伤 × 暴击倍率 × 属性减伤 × 通用减伤**。

~~~mermaid
flowchart TD
    A["技能先算 rawAmount（已包含玩家/敌人攻击基线）"] --> B["× 1 + globalDamageBonus"]
    B --> C["× 1 + typeDamageBonus[伤害属性]"]
    C --> D["× 1 + formDamageBonus[攻击方式]"]
    D --> E["× 1 + skillDamageBonus[skillId]，未指定则 ×1"]
    E --> F["暴击？× critMultiplier : ×1"]
    F --> G{"类型对应什么减伤策略？"}
    G -- physical/armor --> H["× K/(K+max(0,DEF))"]
    G -- fire/lightning/resistance --> I["× 1-clamp(对应抗性,0,75%)"]
    G -- true/none --> J["× 1"]
    H --> K["× 1-clamp(tough,0,60%)"]
    I --> K
    J --> L["真实伤害：跳过通用减伤"]
    K --> M["最后：精度处理"]
    L --> M
    M --> N["返回 settledDamage；战斗编排再扣血"]
~~~

四个增伤维度要分开理解：

| 乘区 | 键 / 数值示例 | 适用对象 |
|---|---|---|
| Global 全局 | globalDamageBonus = 0.20 | 当前攻击者的所有伤害，+20% |
| Type 属性 | typeDamageBonus.fire = 0.30 | **火焰伤害**才 +30% |
| Form 方式 | formDamageBonus.ranged = 0.10 | 标记为 **ranged** 才 +10% |
| Skill 技能 | skillDamageBonus.bolt = 0.25 | 伤害请求明确给了 skillId = bolt 才 +25% |

它们是**跨区乘算**，而不是把 20%+30%+10%+25% 加成一个 85%。同一键的多个来源先由属性模型合成，伤害管线只拿合成后的值乘一次。

**特别注意：** 技能倍率（例如魔弹基础倍率 boltDmgMul）通常已经用于生成 rawAmount；skillDamageBonus 是另一个额外乘区。当前通用 DamageRequest 支持 skillId，但现有常规 hurtEnemy/damagePlayer 包装调用没有普遍传递 skillId，因此**在未接线的普通攻击中，skill 乘区实际上为中性 ×1**，不能仅配置 skillDamageBonus 就假定它生效。

### 实际算一刀：为什么显示伤害与攻击力不同？

假设某次伤害的 rawAmount 已是 100，攻击者有全局 +20%、**物理属性 +30%**、远程 +10%、指定技能 +25%，触发暴击倍率 2；本次请求 type=physical（走护甲），目标 DEF=50，韧性 tough=0.2，K=50。

| 计算步骤 | 计算 | 当前值 |
|---|---|---:|
| raw | 100 | 100 |
| 全局增伤 | ×1.2 | 120 |
| 属性增伤 | ×1.3 | 156 |
| 方式增伤 | ×1.1 | 171.6 |
| 技能增伤 | ×1.25 | 214.5 |
| 暴击 | ×2 | 429 |
| 护甲 | ×50/(50+50) | 214.5 |
| 韧性 | ×(1−0.2) | 171.6 |
| 末尾取整（打怪 hit） | Math.round(171.6) | **172** |

这是按当前 physical → armor 策略成立的演算例；如果改为 fire，减伤侧就必须使用火抗而不是 DEF。这里将 skillId 视为调用方已传入，用来展示完整四乘区，当前普通命中包装尚未普遍透传 skillId。

再看攻击产生的前一步：玩家基础 damage=11，魔弹倍率 boltDmgMul=1.25 时，boltDamage() 先得到 rawAmount=13.75，再进入上述乘区；**不会再乘 11**。

## 4. 防御、抗性与韧性有什么不同？

| 防御项 | 对应函数 | 公式或规则 | 是否对真实伤害有效 |
|---|---|---|---|
| 护甲 DEF | typeMitigationFactor | 50 / (50 + max(0, DEF)) | 否 |
| 元素抗性 | typeMitigationFactor | 1 − clamp(相应 res, 0, 0.75) | 否 |
| 韧性 tough | generalMitigationFactor | 1 − clamp(tough, 0, 0.6) | 否 |
| 无减伤（true） | 两函数 | 系数都是 1 | 不适用 |

**当前四种伤害属性：**

| type | 名称 | 使用的防御 |
|---|---|---|
| physical | 物理 | 护甲 + 韧性 |
| fire | 火焰 | 火抗 + 韧性 |
| lightning | 雷电 | 雷抗 + 韧性 |
| true | 真实 | 不吃护甲、抗性或韧性 |

### 护甲的非线性特性（K=50）

| DEF | 伤害保留比例 | 实际护甲减伤 |
|---:|---:|---:|
| 0 | 100% | 0% |
| 25 | 66.7% | 33.3% |
| 50 | 50% | 50% |
| 100 | 33.3% | 66.7% |
| 200 | 20% | 80% |

DEF 每增加相同数值，边际收益会变化；它不是“50 点 DEF 直接减 50 点伤害”。元素抗性 0.3 则是该属性伤害保留 70%，再乘韧性减伤。元素抗性上限 75%，韧性上限 60%，但**这两个上限只在伤害消费时夹紧**，不是改写实体配置。负抗性表示弱点（如 -20% → 伤害 ×1.2），下限 -50%；负护甲在伤害计算时按 0 防御处理。

## 5. 伤害算出来之后还发生什么？

### 命中不等于真的扣血

~~~mermaid
flowchart TD
    A["攻击碰撞 / DoT 到达"] --> B{"受击前的门控 / 闪避 / 护盾"}
    B -- "闪避或次数盾挡住" --> C["伤害应用=0；可执行反震等特殊效果"]
    B -- "正常通过" --> D["calculateDamage"]
    D --> E["settledDamage"]
    E --> F["扣 HP、击退、吸血、状态、伤害统计"]
    F --> G{"HP ≤ 0？"}
    G -- 否 --> H["仍然存活"]
    G -- 是 --> I["不屈等保命或死亡处理"]
    I --> J["掉落 / 击杀统计 / 特效"]
~~~

- **round-min-one**：玩家打怪的离散 hit，若结算结果是正数，末尾四舍五入并保底 1 点；真正 0 伤害仍是 0。
- **preserve-float**：玩家受击和持续伤害直接保留浮点；UI 显示取整不代表内部已经取整。
- **DoT**（燃烧/焦土）禁止暴击，不按帧取整，不触发普通命中的吸血、击退、连锁等完整副作用链。
- 返回的 **settledDamage** 是结算伤害；**effectiveHpLoss** 是最多不超过受击前 HP 的实际扣血口径；**lethal** 表示到了致死阈值；**killed** 表示死亡流程确实执行；**preventedDeath** 可区分不屈免死。
- 自爆虫自毁无常规掉落；爆炸、击杀、反伤与持续伤害还有各自的上层流程，不能直接用 DamageSystem 替代。

### 三种“属性照片”时机

| 攻击来源 | 何时拍攻击快照 | 为什么 |
|---|---|---|
| 玩家 / 射手弹丸 | **发射时**，由 CombatStats 复制攻击者映射 | 飞行中属性变了，已发弹丸不回溯 |
| 自爆虫 | **引爆时**读取敌人 | 引爆前的属性变动可以影响爆炸 |
| 敌人接触伤害 | **每次接触时**读取当前实体 | 实时生效，不保存弹丸式快照 |

## 6. 游戏里其他数字怎么算？函数导航图

伤害计算只是整个数值体系的一部分。以下为源码里的主要**计算或更新**入口（部分是纯函数，部分会修改游戏状态）。

~~~mermaid
flowchart TD
    A["数值系统"] --> B["属性计算"]
    A --> C["战斗计算"]
    A --> D["技能系数"]
    A --> E["成长与运行"]
    B --> B1["resolveStats / resolveKeyedMap"]
    B --> B2["talentStatModifiers / applyTalentStatProjection"]
    B --> B3["resolveEnemySpawnStats / resolveEnemyDefense"]
    C --> C1["calculateDamage"]
    C --> C2["typeMitigationFactor / generalMitigationFactor"]
    C --> C3["hurtEnemy / damagePlayer / applyBurnDot"]
    D --> D1["boltDamage / meteorDamage / shieldShockDamage"]
    D --> D2["burnStackDps / burnGroundDps / scorchVulnMultiplier"]
    D --> D3["critMultiplier / frostFreezeDuration / multishotSpread"]
    E --> E1["updateAttacks：射速与伤害来源"]
    E --> E2["updatePlayer：移动/冲刺/恢复"]
    E --> E3["waveQuota / spawnEnemy / updateWave"]
    E --> E4["captureRuntimeState / reconcileRuntimeToCaps"]
~~~

| 领域 | 公式/行为（以当前源码为准） | 主要入口 |
|---|---|---|
| 敌人波次 HP | 基础 HP × [1+(wave−1)×0.18+max(0,wave−15)²×0.06] × 1.03^floor(playerLevel/5) × 精英倍率(8或1) | resolveEnemySpawnStats |
| 敌人攻击 | 基础 dmg × [1+(wave−1)×0.05+max(0,wave−15)²×0.012] × 精英倍率(1.5或1) | resolveEnemySpawnStats |
| 敌人速度 | 基础 speed × 精英倍率(0.8或1) × 随机速度系数(0.9～1.1) | resolveEnemySpawnStats |
| 波次刷怪配额 | min(150,20+(wave−1)×10) | waveQuota |
| 角色移动 | 普通移动使用 p.speed；冲刺以 280 px/s、剩余时间 0.16s 控制 | updatePlayer |
| 开火间隔 | 1 / [fireRate × (1 + 0.1×haste + 0.2×rageLv(战意激活时))] | updateAttacks |
| 魔弹伤害 | p.damage × p.boltDmgMul | boltDamage |
| 有效暴伤倍率 | p.critMul + 满层致命一击觉醒时的额外 0.4 | critMultiplier |
| 陨星单发 | p.damage × 3 + meteor等级 × 8 | meteorDamage |
| 护盾反震 | p.damage × 2 | shieldShockDamage |
| 灼烧每层 DPS | 层数 × p.damage × 0.1 | burnStackDps |
| 焦土地面 DPS | p.damage × 0.2 | burnGroundDps |
| 灼热易伤 | 1 + p.scorchVuln | scorchVulnMultiplier |
| 冰冻时长 | 0.4 + 0.2 × frostLv（秒） | frostFreezeDuration |
| 多弹道散布 | 根据附近敌人数量，在 0.04～0.16 间变化 | multishotSpread |
| 受击恢复、护盾充能 | regen × dt、每次恢复一层盾及 10 秒充能 | updatePlayer |

这些技能特例的常量主要来自 **data/combatBalance.ts**，不要以为全部由 StatModel 直接计算。它们往往在技能入口先生成 rawAmount 或控制冷却，再把伤害送到 DamageSystem。

## 7. 最常见的调整：到底该改哪里？

| 目标 | 优先位置 | 不应该做的事 |
|---|---|---|
| 玩家初始攻击、速度、暴击 | data/stats.ts | 在 DamageSystem 硬写玩家初始值 |
| 一张已迁移天赋的属性加成 | core/TalentStatSources.ts | 同时在 talents.ts 的 f 再加一次 |
| 一张未迁移天赋的专属行为 | data/talents.ts 和实际消费系统 | 假定修改 StatModel 白名单就能自动生效 |
| 怪物 HP、基础伤害、速度、护甲、抗性 | data/enemies.ts | 把抗性写成 30（正确的 30% 是 0.3） |
| 护甲系数、抗性/韧性上限 | data/combatBalance.ts | 在 EnemySystem 里改减伤公式 |
| 魔弹、陨星、燃烧等技能系数 | data/combatBalance.ts + core/DamageMath.ts | 在各个命中点重复复制公式 |
| 多个乘区的计算规则 | core/DamageSystem.ts | 在 hurtEnemy 之外再自建平行伤害管线 |
| 怪物随波次成长 | core/EnemyStatSources.ts | 随意调换倍率相乘顺序 |
| 怪物怎么发弹、靠近玩家、何时自爆 | core/EnemySystem.ts | 仅新增 enemies.ts 配置就期望自动获得全新 AI |
| 当前 HP、护盾、冲刺、状态 | 相应运行系统和 RuntimeStateProtection | 当作永久 StatModifier 来重放 |

### 一个值得记住的区别

- **“攻击力 +20%”**：如果设计为增加基础 attack，就是修改原始伤害生成链路。
- **“所有伤害 +20%”**：globalDamageBonus=0.2，会对这次伤害乘区额外 ×1.2。
- **“火焰伤害 +20%”**：typeDamageBonus.fire=0.2；非火焰攻击不受益。
- **“远程攻击 +20%”**：formDamageBonus.ranged=0.2；是否远程依赖调用方明确设置 form，不按视觉表现推断。
- **“某技能 +20%”**：要配置 skillDamageBonus 并保证请求真正携带匹配的 skillId。

## 8. 当前实现的边界

1. **不是所有天赋都完成数据驱动迁移。** 22 张属性权威迁移卡在 TalentStatSources；其他旧机制仍由 talents.ts 的 f 和对应系统处理，这是当前真实架构。
2. **不是配置一个新 damage type 就自动有一种新技能。** 注册表决定减伤策略，具体攻击还要在技能调用点提供 type/form/效果。
3. **不是所有“技能增伤配置”都会立即生效。** skillId 传递当前尚未全面打通。
4. **已有的 S4-D2-B 合并后曾存在原型链读取风险，本次修复让映射查找只看自有键**，不把缺失的 toString/constructor 当成增伤或抗性。
5. **本次采用“先开发，后统一验收”**：修复和本文均基于静态源码分析形成，尚未运行测试；文档的示例属于讲解，不等于最终平衡验证。

## 9. 实际代码入口索引

- 核心属性模型：src/game/core/StatModel.ts、StatKeyedMap.ts
- 玩家属性来源/状态保护：TalentStatSources.ts、TalentSystem.ts、OnAcquireEffects.ts、RuntimeStateProtection.ts
- 敌人来源/生成：EnemyStatSources.ts、EnemySystem.ts、data/enemies.ts
- 战斗快照/纯伤害计算：CombatStats.ts、DamageSystem.ts、data/damageTypes.ts、data/combatBalance.ts
- 实际扣血/状态：CombatSystem.ts、AttackSystem.ts、ProjectileSystem.ts、PlayerSystem.ts、WaveSystem.ts、DamageMath.ts
- 基础属性与类型接口：data/stats.ts、core/types.ts
- **开发操作手册：docs/combat-numerics-agent-guide.md**
