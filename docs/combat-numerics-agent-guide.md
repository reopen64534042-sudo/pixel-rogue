# Pixel Rogue 战斗内容接入指南（Coding Agent）

> 当前入口：基于 `upstream/main@6c269e2` 的 v173 整理（2026-11-01）。已收拢敌方伤害应用、接通技能增伤及玩家映射来源；基础属性、抗性、系数和既有分类保持原值。
>
> 先读 [伤害与防御总览](combat-system-current.md)，再使用仓库 skill [pixel-rogue-combat](../.agents/skills/pixel-rogue-combat/SKILL.md)；新增内容按其 [契约模板](../.agents/skills/pixel-rogue-combat/references/content-contract.md) 明确语义。历史 Foundation / S4 阶段文档不作为当前完整接线表。

> [现有覆盖清单](combat-coverage.md) 从源码生成，包含全部攻击声明/实际受击调用，以及 17 份怪物配置与 18 条图鉴的防御对应。先从该清单定位复用路径，避免全文猜测。

## 1. 新增前必须闭合的链路

```text
来源配置 → 来源适配/StatModel解析 → 实体投影
        → 攻击生成/raw公式 → 战斗快照 → 受击编排/门禁/护盾
        → 纯计算/属性防御 → 最终倍率/HP应用/死亡 → 统计/表现/重置
```

不是每项都需要新增文件；每项都需要说明“复用哪个入口 / 改哪里 / 为什么不适用”。仅加类型、常量或 UI 不能视为完成。

新增武器必须逐攻击/分量明确伤害属性与攻击形式；新增怪物必须明确护甲、各适用元素的抗性/弱点（含明确中性）、通用减伤与独立控制规则。填写项见 [契约 §0](../.agents/skills/pixel-rogue-combat/references/content-contract.md#0-新武器--新怪物的必填声明)。设计中明确中性不等于要求实体新增全部 0 值键。

## 2. 所有权与阅读入口

路径以仓库根目录为准：表中的 core / data 简写位于 src/game/ 下，ui / game/codex 简写位于 src/ 下。按任务读相关行/函数，无需每次全文搜索整个项目。

| 责任 | 权威文件 / 函数 | 消费与联动 |
|---|---|---|
| 公共接口与归属 | core/types.ts：Profession、各武器/流派、Player、Enemy、HitOptions、PlayerHitOptions | 新 ID 接启动、池过滤、重置、UI；DamageSource 独立于 DamageTypeId |
| 玩家基础 | data/stats.ts：statBase(prof, warriorStyle, mageWeapon)；warriorBalance / mageBalance / domain | GameCore.resetGame 与重算投影都要保留正确职业/武器上下文 |
| 人物等级成长 | data/levelGrowth.ts：levelGrowthFor / levelGrowthSteps | TalentStatSources 同次解析；ProgressionSystem 负责升级当次 HP 等效果；区别武器经验 |
| 属性点 | core/AttributeSystem.ts：ATTR_DEFS / rollAttrChoices；AttributeSources.attributeStatSources | 开面板、刷新、连选的职业/武器上下文；候选过滤和投影硬顶都核对 |
| 玩家键控来源 | core/AttributeSources.ts：attributeStatSources；core/PlayerCombatSources.ts：applyPlayerCombatSources | 属性选择携带 stat+key；标量/映射同次重建；独立来源声明 ownedKeys，失效时清空 modifiers |
| 属性上限 | data/attributeBalance.ts：ATTRIBUTE_CAPS / lifestealCap | TalentStatSources 投影夹紧；暴击/闪避目前主要为 AttributeSystem 候选过滤，勿谎称所有来源都全局硬顶 |
| 属性求值 | core/StatModel.ts / StatKeyedMap.ts | base / flat / percent / final；标量白名单与键控映射族；不自动投影实体 |
| 玩家来源/投影 | core/TalentStatSources.ts：talentStatModifiers / applyTalentStatProjection | 合并天赋、属性点、人物成长与实例持久来源，同一次解析；映射键需所有权 |
| 天赋配置与抽取 | data/talents/index.ts 及职业子表；core/TalentSystem.ts | 外部从 data/talents 导入；UPGRADES 总表、canOffer、learnTalent、recompute |
| 获得时效果 / 运行状态 | core/OnAcquireEffects.ts / RuntimeStateProtection.ts | 永久属性、一次性效果、冷却/当前盾层分开；重算不可重播治疗/Buff |
| 伤害属性 | data/damageTypes.ts：DAMAGE_TYPES | DamageTypeId 自动推导；只有策略/标签，不自动赋予状态、来源或 UI |
| 数值公式 | data/combatBalance.ts；core/DamageMath.ts | 新增/修改伤害系数与纯公式在此；各系统负责何时调用、打谁、应用状态 |
| 技能分类声明 | data/attackProfiles.ts：PLAYER / ENEMY / BOSS / HOSTILE_ATTACK_PROFILES | 七武器/派生、怪物技能、旧弹丸/接触/地面全部登记；type/form/skillId 独立，时变 type 用 withDamageType |
| 静态覆盖核对 | scripts/audit-combat-contracts.mjs；docs/combat-coverage.md | TypeScript AST/类型核对实际入口必填字段、HP扣除和图鉴引用；--write 刷新清单，不执行战斗 |
| 战斗快照 | core/CombatStats.ts：getPlayerCombatStats / getEnemyCombatStats | 发射/引爆/接触/每跳时机；映射复制；破甲与 armorPen 在敌方防守快照生效 |
| 纯伤害计算 | core/DamageSystem.ts：calculateDamage | 四增伤区、暴击、armor/resistance/none、tough、精度；不碰 HP/RNG/Phaser |
| 通用受击/死亡 | core/CombatSystem.ts：hurtEnemy / damagePlayer / killEnemy / applyFireDot | 盾/闪避/无敌、最终倍率、Boss 同步、击杀掉落、实际损失、统计 |
| 敌方伤害应用 | core/EnemyDamageApplication.ts：resolveEnemyHitDamage / applyEnemyDotDamage / applyEnemyHpDamage | 公共最终承伤与 HP 写入；DoT 包含 Boss 门禁/同步与记账，死亡仍由调用侧处理 |
| 元素状态与反应 | core/ElementSystem.ts / ElementMath.ts；data/elementalMage.ts | 配对元素增伤、冻结/麻痹/DoT；状态不由伤害 type 自动触发 |
| 怪物基础与生成 | data/enemies.ts：ETYPES；core/EnemyStatSources.ts / EnemySystem.spawnEnemy | HP/攻击/速度、防御和攻击增伤三类解析；波次与难度；保留 RNG 顺序 |
| 怪物刷新与精英 | data/enemies.ts：WAVE_THEMES / enemyWeight / ELITE_SPECIES；core/WaveSystem.ts | w0、主题权重、signature、精英槽位、词缀、Boss 波次替代 |
| 怪物行为与危险区 | core/EnemyBehaviors.ts / EnemySystem.ts / HostileHazards.ts | behavior、发弹、接触、自爆、行动门禁、危险区所有者与快照；仅配置 dmg 不会创造技能 |
| 难度与 Boss | data/difficulty.ts / boss.ts；core/BossSystem.ts | 射手最终承伤倍率；Boss 转阶段无敌/硬直易伤；独立生命曲线 |
| 统计与存储 | core/types.ts：DamageSource / DamageTotals；GameCore.dmgBy / resetGame / 报告 | 全局与本波、武器分项口径；保留旧战绩读取兼容，不改历史数据 |
| 显示与图鉴 | ui/GameUI.ts / DomainStats.ts / CodexUI.ts；game/codex/weaponCodex.ts / codexData.ts / CodexSystem.ts | 伤害/防御/成长/技能说明；稳定 ID、记录与解锁；不让 UI 成为战斗来源 |
| 模拟与清理 | core/Simulation.ts / GameCore.resetGame；对应系统清理函数 | 新状态更新、暂停、换波/重开清理；Scene/Renderer 只读表现 |
| 对照工具 | core/StatSheets.ts | shadow 对照，不作为运行时属性权威来源 |

## 3. 根据任务缩小修改范围

### A. 新职业 / 新武器 / 新流派

1. 在 types 和启动/重置路径声明归属；先决定复用职业还是增加 Profession，不根据外观创建伤害类型。
2. 明确人物基础、人物成长、属性点与武器等级成长分别归谁。基础值进入 statBase；持久数值进入来源投影；技能系数进入 combatBalance / DamageMath。
3. 在相关武器系统形成 rawAmount，逐项声明主攻击、附伤、地面效果、反击/召唤等派生攻击的 type / form / kind / 精度。
4. 明确快照、暴击/命中/吸血/XP 共享预算；复用 CombatSystem 的 HP 应用，避免新建扣血旁路。
5. 接入 Simulation、GameCore 实例状态与重置；武器私有状态不要偷偷放进 Player 永久属性表。
6. 接池过滤、属性候选上下文、面板/报告、weaponCodex、教程与表现生命周期；只更改此次能力需要的部分。

已有系统入口：

| 玩法 | 数据 / 系统 |
|---|---|
| 强化弹 | data/specialShot.ts；AttackSystem / ProjectileSystem / SpecialSystem |
| 激光 | data/laser.ts、talents/laser.ts；LaserSystem；公式 LASER_DAMAGE / DamageMath |
| 导弹 | data/missile.ts、talents/missile.ts；MissileSystem / MissileCombat |
| 元素使 | data/elementalMage.ts、mageBalance.ts、talents/mage.ts；MageSystem / MageProgressionSystem / ElementSystem |
| 领域 | data/domain.ts、talents/domain.ts；DomainSystem；DomainSnapshot 与 DOMAIN_DAMAGE |
| 太刀 / 大剑 | data/warriorBalance.ts、talents/warrior.ts；MeleeSystem / WarriorSystem |

优先复用对应生命周期和消费者；不要为“统一”把七套玩法全部改写。

### B. 新怪物 / 精英 / Boss

1. ETYPES 明确 hp / dmg / speed / r / xp / spr / w0 / wt，以及护甲、三元素抗性/弱点、tough。缺省可保持中性，但契约中应写明“未配置=0”而不是遗漏设计。
2. 通过 resolveEnemySpawnStats / resolveEnemyDefense / resolveEnemyAttackBonuses 生成实体；映射要复制。基础 dmg 不等于技能最终伤害；每个技能仍需形成 rawAmount。
3. 普通怪加入 WAVE_THEMES.weights 并检查 w0 / signature；wt 只用于初始权重说明。专属子体/精英不进入普通随机池；精英物种与词缀是两回事。
4. 行为按 EnemySystem 既有类型分支、EnemyBehaviors 的 behavior 或独立系统接入；明确接触、发弹、爆炸、地面 tick 各自的 type / form / cause / 快照。
5. 对应行动在 attackProfiles 显式声明 type / form / skillId；技能、发弹、接触和地面帮助函数都消费该目录，能表达“雷电近战”等组合。新增弹丸/地面携带 attackProfile，防止派生身份丢失；旧手工构造的兼容缺省仍保留。
6. 核对受击门禁、方向格挡 origin、控制免疫/递减、死亡分裂/召唤、XP/掉落/配额、图鉴/击杀键与素材。
7. Boss 复用波次替代、BossState、转阶段无敌、每次扣血后的 syncBossPhase、独立 HP 成长；不在生成后再次覆盖一份冲突公式。

数值成长与完整怪物清单见 [monster-numerics.md](monster-numerics.md)。不在此重复维护随版本变化的基础值。

### C. 新伤害属性 / 新抗性 / 新防御机制

- 新元素：DAMAGE_TYPES 注册既有策略 → 来源配置/键控解析 → 实体/快照 → 实际攻击 type → 防守方对应抗性 → 面板/图鉴/飘字。frost 和 gravity **已经存在**，不可重新按示例重复注册。
- 抗性是键控映射，不是每元素一个 StatId；family 为 `resistance`，实体字段为 `resistances`，勿混淆单复数。
- 新类型如果仍用 armor/resistance/none，不在 DamageSystem 加具体类型 switch；若确需第四种策略，需先明确公式及适用对象，再扩展纯计算契约。
- 护盾、闪避、无敌、方向格挡和控制抗性属于编排/状态规则；不能只给 resistances 添加一个键。
- AttributePoint 与 AttrDef 现支持 key：键控候选明确 stat / key / stage，toAttributePoint → attributeStatSources → TalentSystem → PlayerCombatSources 完成投影。来源与显示均需核对，本轮没有新增抗性候选或数值。
- 明确上/下限在哪里执行。当前注册表策略为 armor 的物理/引力不读取 resistances.physical / gravity。

### D. 新属性 / 天赋 / Buff

- 标量：StatId → base / 来源修饰符 → resolveStats → 实体投影 → CombatStats 或专属消费者 → UI；白名单新增不等于自动生效。
- 映射：family + key → resolveKeyedMap → 适配器投影/键所有权 → 快照 → 消费者；不要把火/冰/雷分别硬编码成标量属性。
- 属性选择用 attributeStatSources 同时返回 scalars / keyed，不能用仅保留标量的历史 attributeModifiers 接新键控来源。其他来源通过 applyTalentStatProjection 的 keyedSources 或来源表内的公共映射投影接入；学习、重算及来源移除路径都要提供同一权威来源。
- PlayerCombatSources 的 ownedKeys 是稳定所有权声明：来源失效时保留声明、传空 modifiers 才会删旧投影；多个来源同键先合并，未接管的外部键保留。不允许为 armor/none 类型声明无消费的独立抗性。
- 永久来源与属性点、等级成长在同一次投影合成。不要另投影一次覆盖已有来源，也不要在 f 与 Modifier 同时修改相同属性。
- 天赋先确认是“来源表投影”“机制开关由 upCounts/picks 读取”还是现有 f 路径；f 为空不意味着天赋缺实现，必须看消费者。
- 已删除的 legacy 卡仅有兼容空导出，不能因为 TalentStatSources 仍有历史分支就恢复入池。
- 只在获得时发生的治疗/赠盾/Buff 放获得时路径；计时/当前盾/充能放实例运行状态。若重算会清除，补 RuntimeStateProtection；若独立系统持有，核对自身重置。
- 暂时无来源的已声明字段不能向玩家描述为当前可获得能力。

### E. 新 skillDamageBonus

当前包装层已经接通，新增技能按以下链路使用：

```text
合法来源产生 skillDamageBonus[key]
→ 玩家/敌人投影与快照复制
→ 攻击点在 HitOptions / PlayerHitOptions 传 skillId
→ CombatSystem 构造 DamageRequest 自动透传
→ calculateDamage 按 key 消费
```

只声明映射不生效；src / request.origin / tags 不会自动变成 skillId。trueFraction 继承主攻击技能键；components 在 inheritBonuses=true 时默认继承，也可用分量 skillId 覆盖，为 false 时关闭全部增伤。公共 DoT 入口也可明确传入 skillId，不自动按 src 选择技能键。

## 4. 请求与应用必须保留的规则

| 项目 | 当前约束 |
|---|---|
| 属性解析 | base 有限非负；flat 可负；percent 每项 > -1；final 是倍率且 >0；保留有序运算与聚合溢出报错 |
| 原始伤害 | 有限且 ≥0；已含攻击力的 raw 不再次乘 attack |
| 增伤区 | 每个 bonus 有限且 ≥-1；同一键来源先合成、不同区相乘 |
| 类型与键 | 未注册 type 抛错；读取自有键，拒绝原型链误读；保持缺省映射/可选字段形状 |
| 精度 | 普通敌方离散命中默认 round-min-one，仅正伤害保底1；continuous 和玩家受击保留浮点 |
| DoT | kind=dot、preserve-float、不暴击；通过 hurtEnemy 时同时明确 noCrit / noOnHit / noChain / noLifesteal 等权限 |
| 多分量 | 主伤/真实/生命压缩声明 raw 来源、继承区、暴击、穿透；同次应用不能递归命中重复触发死亡/掉落 |
| 方向格挡 | HitOptions.origin 是坐标；DamageRequest.origin 是来源字符串，两者不同；爆炸等应提供真实中心 |
| 最终倍率 | Enemy.damageTakenMul 与 Boss 状态倍率在应用层；真实/百分比生命/DoT 不得漏乘或重复乘 |
| 无敌与死亡 | 玩家部分门禁在调用方；Boss 转阶段门禁及每次 HP 应用后的阶段同步必须覆盖 |
| 统计 | settledDamage 与 effectiveHpLoss 分开；总伤害只记一次；保留战绩兼容 |
| 重算/重置 | 来源重建幂等；保留运行态；新局清理本局专属状态，不重播获得效果 |
| 随机/取样 | 不无故改变 RNG 次数/顺序，不静默改变发射/引爆/命中/每跳取样时机 |

旧燃烧 / 焦土 / 元素 DoT 现在共同委托 applyEnemyDotDamage；激光、导弹余烬和领域继续使用 hurtEnemy 的连续路径，保留各自触发/浮点预算。不要机械合并两类语义；独立 DoT 的死亡仍由调用侧处理。

## 5. 完成记录与验证

- 在对应设计文档或 docs/migration.md 留下契约/差异：来源、消费者、攻击分量、防御、快照/触发预算、重算/重置、显示，以及明确不适用项。小改动记录受影响行即可，不要求复制整张模板。
- 生产实现按当前 AGENTS.md 执行 `npm run typecheck`、`npm run build`、`git diff --check`。这证明编译/构建状态，不能当作自然玩法、性能或平衡验收。
- 战斗路径修改先执行 `node scripts/audit-combat-contracts.mjs`；`--write` 刷新覆盖文档。工具不加载 GameCore、不运行模拟、不生成测试数据；检查当前受击调用是否显式提供非可选且非空的 type/form/skillId，以及 HP 扣除和图鉴引用。它不证明所有运行时机制正确。
- 默认不新增/扩展测试，不运行 Vitest / Playwright；若既有断言因规则变更过期，在迁移记录和获授权的提交说明留痕，等待用户授权的测试批次。此规则覆盖旧文档“必须补测试/基线”的要求。
- 更新拥有该数值的文档，避免 UI、图鉴和说明继续引用旧值；skill 保留接入规则，具体数值留在源码及对应数值文档。
- 生产功能合并前同步 CHANGELOG.md 与 data/changelog.ts；仅文档/skill 整理不制造游戏版本号。
- 提交、推送、PR 与合并按用户对应授权；创建任务分支不代表获准这些操作。
