# Pixel Rogue · Combat Foundation S3 实施任务书 v1

> 状态：**S3-A/S3-B/S3-C 已实施（方案甲，见 docs/migration.md D-07/D-08）；S4 未开始**  
> 基准：`reopen64534042-sudo/pixel-rogue` `main` @ `5d85c46e612e138deab4c4c97256295c0157559b`（PR #63 合并）  
> 总任务：[上游 Issue #32](https://github.com/reopen64534042-sudo/pixel-rogue/issues/32)  
> 既有规范：`docs/pixel-rogue-combat-foundation-v1.md`  
> 本任务书聚焦 **S3**（属性映射、玩法启用、UI、平衡回归），S4 的 Modifier 框架不纳入本阶段。

## 1. 当前代码基线

- `DamageSystem.calculateDamage()` 已处理全局、属性、攻击方式、技能专属四个乘区；支持 `physical/fire/lightning/true` 以及 `armor/resistance/none` 策略、`DamagePrecision` 和 `DamageResult`。
- `CombatSystem.playerCombatStats()` 和导出的 `enemyCombatStats()` 目前固定 `defense: 0`、`resistances: {}`、`globalDamageBonus: 0`、`typeDamageBonus: {}`、`formDamageBonus: {}`。
- `Player` 在 `types.ts`、基础属性在 `data/stats.ts`；怪物配置在 `data/enemies.ts`，`EnemySystem.spawnEnemy()` 负责血量、伤害和精英/波次缩放；`EnemyBullet.stats` 在发射时保存攻击者快照；近战/投射物/DoT 路径已明确传递属性和方式。
- `GameUI.buildStats()` 当前显示 `p.damage` 为“全局伤害”，但在新的正式乘区语义里它实际上是原始攻击/技能系数基线，不是 `globalDamageBonus`；此外 `p.critMul` 可能与 `DamageMath.critMultiplier(p)` 的“致命一击满层觉醒”有效值不同。
- 上游 v11 新增/重做：冰冻/冰霜叠层、灼烧叠层、灼热易伤、烈焰蔓延、反震、暴击觉醒、陨星/焦土；`DamageMath.ts` 是技能数值纯函数层，`combatBalance.ts` 同时存 S1 的防御参数与 v11 技能系数。
- 保护：`tests/parity.test.ts` 以 v8 原版及批准的显式差异作为回归基线；生产版本与旧战绩不可破坏。

## 2. 本阶段冻结的规则

1. 伤害属性 `DamageType`、攻击方式 `AttackForm`、来源 `Origin`、机制标签 `Tags` 独立。物理/火焰/雷电/真实均能与近战、远程、other 组合。
2. 增伤仍是 `raw × M_global × M_type × M_form × M_skill × M_crit × M_typeMitigation × M_generalMitigation`；同乘区来源先加算。**现有天赋对 `player.damage` 的强化已经算入 `raw`，绝对不能再次转换成 globalDamageBonus 加一遍。**
3. 防御/抗性按 S1 规则：物理 `K/(K+max(0, DEF))`（候选 `K=50`），元素 `1-clamp(RES, 0, 0.75)`，通用减伤 `1-clamp(tough, 0, 0.6)` 与物理/元素减伤相乘，真实伤害忽略这三者而不自动绕过盾/闪避/不屈。
4. 玩家受击 `preserve-float`、敌人离散命中 `round-min-one`、DoT `DPS×dt` 保留浮点；`0` 结算保持 `0`。不改变随机数调用次数/顺序、死亡/掉落触发顺序、连锁与爆炸防递归。
5. 敌方弹丸以**发射时**快照为准；玩家弹丸已存 `dmg` 快照，避免以后重复对其 `player.damage` 计算。保留原有射程、伤害衰减、冷却。
6. S3 启用属性不等于 S4 完整的 Base/Modifier/Effective 系统。不得此时重写 34+ 天赋或 `TalentSystem.recompute()`。

## 3. 开发拆分与顺序

### S3-A：非零属性的可配置接线与测试（首个独立 PR，默认数值中性）

- 提供一处明确的**实体战斗属性适配层**（可用 `core/CombatStats.ts` 或既有 CombatSystem 的内部适配器，避免相互运行时循环），`getPlayerCombatStats()` / `getEnemyCombatStats()` 负责只读快照。无特殊需要不复制整个 `Player`/`Enemy` 类。
- 在玩家/怪物数值数据模型中，以可配置、可按伤害类型索引的形式接入 DEF、`resistances`、全局/属性/攻击方式加成；需要时支持 `skillDamageBonus`。字段命名与 `CombatStatsSnapshot` 一致，避免一个来源多种命名。**不要在 S3-A 将 `p.damage` 转为 `globalDamageBonus`**。
- 为保护原版 parity，新增数值**默认中性**；玩家和怪物新增字段如影响实体可序列化形状，则考虑可选字段在有数值来源时才写入，或按仓库批准先例做**逐字段、带不变量断言**的结构归一化。不能删除 parity 断言，也不能靠更新原版快照掩盖分叉。
- 把 `EnemyConfig`（怪物基础数值）→ `spawnEnemy()` → `Enemy` → `enemyCombatStats()` 的传递链打通；说明 DEF/RES 是否随波次和精英变化。首个 PR 先设“默认不缩放”，到 S3-B 再审议具体成长。
- `EnemyBullet.stats` 始终在发射时读取完整的新快照；接触和自爆伤害分别按命中时/引爆时读取。手工构造的旧弹丸不带 `stats` 时沿用中性回退。
- 测试：程序化赋予敌人 DEF=50 后，100 点非暴击物理命中应结算 50；物理不受元素抗性影响，火焰抗性 20% 时 100 伤→80；`tough=0.2` 与 DEF=50 对 100 物理命中→40；真实伤害对这三项都忽略；`fire/ranged`、`lightning/melee` 实测对应 type/form 乘区；玩家保持浮点受击精度；发射后改变/删除敌人不会改变原弹丸属性结果。
- 注意 `hurtEnemy` 会掷骰，测试要 mock 成非暴击；`round-min-one` 的示例要选计算后是整数的值以便断言明确。
- 首 PR 不新增玩家可抽取天赋、不改怪物正式难度、不启用新的平衡值，避免把 S3-A 与平衡验收混在一起。

### S3-B：小范围可玩数值试点（第二个 PR，**需先批准具体数值**）

- 只选择少量既有敌人或一个明确来源进行 DEF/RES 验证，先测量实际玩家击杀耗时、受击压力；与 S2、v11 基准比对。
- 任何怪物 DEF/RES、精英成长/波次成长、玩家初始 DEF 或额外天赋获得方式必须列出：数据值、应用范围、伤害前后对照、玩家体验预期与回退方法；经授权后再写入。
- 建议先让不同怪物形成明确弱点，而不是所有怪物均匀加护甲；**暂不把建议例值当作已确认的平衡配置**。
- 需要玩家具有可玩的非零增伤来源时，优先用最少数量的显式、可观察机制验证 `typeDamageBonus` 和 `formDamageBonus`；新增天赋、卡池权重和最大层数均为独立平衡决策。
- 重点回归 v11 机制：燃烧叠层、灼热易伤、暴击觉醒、反震、连锁与陨星。明确连锁使用前一击的**已结算**伤害作为下一跳原始值，在新护甲/抗性存在时可能构成连续减伤，不得静默更改链路数学语义。
- 明确 DoT 的新乘区生效时刻：目前 `burnDps` 来源在施加时更新，而 DamageSystem 的进攻方快照在每帧 DoT 计算时读取；若启用临时增伤 Buff，需设计快照或动态结算政策并测试，禁止无意引入半快照/半动态。

### S3-C：UI 与实际平衡验收（可与 S3-B 同 PR 或另拆）

- 在 `GameUI.buildStats()` 中读**和战斗系统一致的有效值**，展示：攻击基线、DEF、火焰/雷电抗性、通用减伤、暴击率与**实际生效**的 `critMultiplier(p)`、全局/物理/火焰/雷电增伤、近战/远程加成（可隐藏空白条目，但已存在且为 0 的关键属性宜解释清楚）。
- 将旧文案“⚔️ 全局伤害”改为能与 `globalDamageBonus` 区分的“攻击力/基础攻击”，**只改文案不改 `p.damage` 计算**。魔弹实际伤害读 `DamageMath.boltDamage(p)`，避免 UI 又实现一份公式。
- 测试 UI 数值与 DamageRequest 的映射一致；无值显示 0 或 — 的策略稳定；符合既有 DOM 布局和尺寸。
- 有意改变 v8/v11 数值的地方必须单独列入 `docs/migration.md` 的批准差异；本地行为测试 + Playwright/生产试玩，同时保留 `pixelrogue_records` 的旧格式。

## 4. 需单独确定的平衡问题（S3-B 开始前）

1. **玩家 DEF 来源**：玩家初始 DEF、现有天赋派生，还是新天赋？“铁布衫”继续作为 `tough`，不能未经确认改成 DEF。
2. **怪物防御分布**：哪些类型天然有护甲/火抗/雷抗？是否精英额外强化？波次成长是否影响 DEF 而非仅 HP/dmg？
3. **增伤来源**：是新增一两张“物理增伤”“近战增伤”卡，还是先从现有机制显式提供？不得让“磨刃/狂怒/毁灭本能”双重生效。
4. **已存在的特殊机制**：灼热易伤的语义与 DamageType、DoT 是否相互作用；连锁二次减伤是否符合预期；无敌帧和真实伤害保护不变。
5. **参数**：`armorK=50`、元素抗性上限75%先作为试验基准，实际击杀/存活体验后再批准变更。

## 5. 验收矩阵

| 场景 | 必须验证 |
| --- | --- |
| DEF=0、RES=0、Bonus=0 | S2 旧玩法与 RNG / parity 全绿；不改历史报告 |
| DEF=50、K=50 | 物理100→50（非暴击，无 other 减伤） |
| RES.fire=0.2 | 火100→80，物理/雷电不受 fire RES 影响 |
| DEF=50、tough=0.2 | 物理100→40 |
| `true` | 无视 DEF/RES/tough，仍可被次数盾/闪避拦截 |
| 增伤维度 | 原始100，全局+20%、雷电+30%、近战+40%→218.4（减伤前） |
| 远程发射后调整敌人/击杀敌人 | 弹丸按发射时属性快照结算 |
| DoT | DPS×dt 保留浮点，不触发普通命中效果；无双加算 |
| 上游 v11 天赋 | 冰霜、灼烧、觉醒、易伤、反震、陨星均保留既有机制 |
| UI | 展示有效暴伤与真实计算一致、攻击基线和独立增伤不混淆 |
| CI/验收 | typecheck、全部 Vitest/parity、build、Prettier；UI 变动运行 Playwright + 实机生产流程 |

## 6. 协作与发布纪律

- 以 fork 的**最新上游 main** 创建独立功能分支，先检查 `git status`、现有工作区以及其他会话正在进行的更改。多会话并行需单独 worktree；严格遵守项目 `AGENTS.md`。
- 首先完成 S3-A 并进行评审；然后单独批准 S3-B 平衡数值，不提前扩展 S4。
- 不自行提交、推送、创建 PR、合并，也不改动上游 main；这些操作按独立授权执行。
- 如果主线在此期间发生变化，先重新取最新 main 并检查重叠点；尤其保留 `DamageMath.ts` 与 `combatBalance.ts` 的现存关系。
- 每个 PR 合并前按 #55 同步 `CHANGELOG.md` 与 `src/game/data/changelog.ts`，版本不得与上游重复。

## 7. 首批工程任务的完成定义（S3-A）

- [x] 玩家和敌人属性映射不再仅固定中性占位，并能在测试中配置 DEF/RES/全局/属性/方式增伤。
- [x] 近战、远程弹丸、DoT 至少分别通过一个真实 CombatSystem 调用的属性测试；已有 S2 行为零变化。
- [x] 实体与敌方弹丸属性快照的来源和时间语义清晰。
- [x] 既有天赋不双加、真实伤害语义不变，新增属性可向以后扩展。
- [x] 回归、构建、类型检查通过；对 parity 新增字段有明确断言和书面依据。
- [x] 文档记录“仅接线，无正式数值平衡变更”，等待 S3-B 的具体值批准。

> S3-A 完成记录（2026-10-25）：`core/CombatStats.ts` 适配层 + Player/Enemy/EnemyConfig 可选属性（默认不写入，parity 形状不变无需归一化）；`tests/combat-stats.test.ts` 11 项验收、全套 113 项全绿。详见 `docs/migration.md` D-07。
