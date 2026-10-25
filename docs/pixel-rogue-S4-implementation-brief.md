# Pixel Rogue · Combat Foundation S4 实施任务书 v1

> 生成基线：上游 `reopen64534042-sudo/pixel-rogue` 的 `main`，`cd9c8b6cac4df32ffd2c2612dab3aac812ace318`（已合并 PR #76，2026-10-25）。
> 来源：上游 Issue #32、`docs/pixel-rogue-combat-foundation-v1.md`、当前 `AGENTS.md` 及已合并的 S3 实现。
> 状态：**S4-A 已并入上游（#77）；S4-B 已并入上游（#89，记录见 docs/migration.md「D-17」）；S4-C 第一批 C0+C1 已实施并提上游 PR #91（记录见 docs/migration.md「D-19」）；S4-C 后续批次与 S4-D 未开始。**

## 1. 目标与禁止事项

S4 的目标是以最小、可验证增量建成：`BaseStats + FlatModifiers + PercentModifiers + FinalMultiplier -> EffectiveStats`，并把 `RuntimeState`（HP、当前护盾层数、CD/持续时间、临时效果状态等）与属性计算隔离。保留 Player/Enemy 现有接口作为渐进迁移兼容层，继续由 `CombatStats.ts` 输出 `CombatStatsSnapshot`，由 `DamageSystem` 纯结算伤害。

绝对不在此批重做装备/职业/武器、ECS、动态技能框架、全局事件总线、联机同步、完整存档、元素反应或新平衡；不改 41 张天赋的层数、卡池、数值、名称与抽取 RNG。不重定义 `player.damage`，不将现有 `damage` 系数再次计入 `globalDamageBonus`。不以“清理代码”为由改变流派 DPS、闪避、盾、伤害报告、死亡与波末时序。

## 2. 当前实现事实与风险清单

- `data/stats.ts::statBase()` 同时包含 `damage`、`speed`、`crit`、`maxhp` 等计算属性和 `meteorT`、`dashT`、`dashCharges`、`shield`、`shieldCd`、`hurtCd`、`hasteT`、`rageT`、`ndUsed`、`orbA` 等运行状态。
- `core/TalentSystem.ts::learnTalent()` 直接调用 `Talent.f(player)` 并记录 `upCounts/picks`；`recompute()` 目前调用 `Object.assign(player, statBase())`、删除六个 S3 可选属性键，逐条重放 `picks`，最后夹紧 HP。`SwapSystem.melt()` 和宝箱/升级链都依赖该行为。
- 41 张天赋并非统一修正值类型：`磨刃/狂怒/毁灭本能` 直接**乘** `player.damage`；`疾速扳机/迅捷步伐/磁力增幅/范围增幅` 含多级重复**乘法**；`磐石` 增加 DEF 固定值；`元素亲和` 增加火雷属性乘区；`巨人血脉/生命强化` 修改 `maxhp` **并有即时补血效果**；`坚固护盾` 同时提高 shieldMax **并赠送一层当前护盾**；`击杀狂热` 首次获取会设定当前层数/持续时间；`疾影步` 带解锁与 CD 语义。
- `ProgressionSystem` 中血包满血转化使 `p.maxhp` 与 `p.hp` 永久各加 1（受每波 `potionGrow` 上限约束）：这不是短期 Buff，也不是普通“当前 HP”，属性重算必须有持久来源，不能因 `recompute()` 丢失。
- `EnemySystem.spawnEnemy()` 的 `hp` 和 `dmg` 按波次/等级/精英分别缩放；护甲/抗性从 `EnemyConfig` 复制，S3 方案甲不随波次自动缩放。敌方弹丸快照需要在发射时保留独立数值；切忌将其改为命中时从发射者读取。
- `DamageMath.boltDamage()/meteorDamage()/burnStackDps()` 已消费 `player.damage`；`critMultiplier()` 还含“致命一击满层觉醒”的特殊条件。不可对这些调用再隐式乘 ATK。
- `tests/parity.test.ts` 的 v8 严格对照与 S3 属性中性化、波 8 复原、LF/CRLF 归一化全部保留。任何新增可枚举状态字段都会让序列化对照失败；不能为通过测试直接删对照字段。S3 并入上游的 123 项测试（26 parity）仅为前次验证记录，实际开发需重新跑。

## 3. 数据契约建议（先冻结）

定义**纯数值模块**（建议 `src/game/core/StatModel.ts`，可拆 `StatTypes.ts`），不依赖 GameCore、DOM、Phaser、实体运行时或 Math.random。

```ts
// 示意 API，正式 TS 命名可调整，但行为契约不可变。
type StatId = 'attack' | 'defense' | 'maxHp' | 'moveSpeed' | 'fireRate'
  | 'critChance' | 'critMultiplier' | 'tough' /* 逐步扩展白名单 */;
type ModifierStage = 'flat' | 'percent' | 'final';
interface StatModifier { readonly sourceId: string; readonly stat: StatId;
  readonly stage: ModifierStage; readonly value: number; }
interface StatSheet { readonly base: Readonly<Partial<Record<StatId, number>>>;
  readonly modifiers: readonly StatModifier[]; }
function resolveStats(sheet: Readonly<StatSheet>): Readonly<Partial<Record<StatId, number>>>;
```

默认通式：`effective = (base + Σflat) × (1 + Σpercent) × Π(final 倍率)`；同一 percent 区加算，final 连乘，顺序由契约明确。要求所有输入有限、值域合法；禁止 NaN 传播。`FinalMultiplier` 的 `value` 定义为**倍率本身**（如 1.1）而不是“+10%”，防止接口歧义。对暴击率、移速、生命等属性的上下限/夹紧必须与现有代码的实际生效点一致，不能无授权提前统一裁剪。

**重要兼容原则**：原卡多级 `p.damage *= 1.1` 形成 `11×1.1^n`，不能错把它映射成 `11×(1+0.1n)`；应将旧卡复合倍率明确归为 `final` 或保留 legacy 路径直到有充足逐级对照。`maxHp` 的基础值/天赋 flat/血包持久成长必须各有来源。

不要把 `DamageSystem` 内四个乘区与该**角色属性计算器**混为一谈：角色属性解析得到 `globalDamageBonus/typeDamageBonus/formDamageBonus/skillDamageBonus` 数值后，由原伤害管线**只乘一次**。DamageType/AttackForm 仍是正交维度。

模型按来源进行聚合，不必须一开始就建立庞大的类型层次。优先固定的 `StatId` 白名单和数组；不给每个实体创建动态 EventEmitter。临时状态可以将来作为有生命周期的来源参与计算，但 S4-A 不引入定时调度器。

## 4. 里程碑与交付边界

### S4-A（立即开始）：纯 StatModel + 单元测试，不接入运行时

1. 新建纯计算接口与聚合函数，明确 `flat/percent/final` 的验证、组合顺序和来源 ID 语义。
2. 证明 `base=100,flat=20,percent=0.25,final=1.2 => 180`；两项 percent +20%/+30% => ×1.5；两项 final=1.1/1.1 => ×1.21。分别测 `0`、合法负 percent（边界由契约明确）、非法 NaN/Infinity、非法乘区倍率、缺省属性、输入不被修改。
3. 额外提供 `resolveCombatStats` 的纯投影/桥接接口设计**但不得替换现有 `CombatStats.ts` 调用**。不可向 Player/Enemy 添加枚举字段；不可触碰天赋、敌人、波次、UI、changelog（除合并前文档必要更新）。
4. 完成 `npm run typecheck`, `npm test`, `npm run build`。所有旧 parity 逐字段保持原样。不因新增计算模块要求浏览器测试，但若触及场景须补。
5. 交付新模块+聚焦测试+准确文档。**在此阶段停止，不提前进入 S4-B。**

### S4-B：只读 shadow 计算与兼容层，零数值改变

1. 以现有 `getPlayerCombatStats/getEnemyCombatStats` 为唯一对外快照出口。实现**按需、无副作用**的属性解析，并选择少量数值字段（优先 DEF/抗性/增伤来源）作 shadow 计算，逐场景比较旧快照和新聚合值。
2. 不添加可枚举 `player.stats` / `enemy.stats`；若用 sidecar，必须实例局部、明确生命周期与清理，首选无持久缓存的纯函数派生。
3. 逐来源分别验证 `磐石`、`元素亲和`、brute/shooter/bomber、防御和暴击觉醒；弹丸发射时的快照与引用隔离不变。
4. Shadow 对照未通过不得切换权威读取路径。阶段末与 S4-A 独立审查。

### S4-C：渐进改造玩家属性来源与 Talent/recompute

1. 先完成“天赋变更影响清单”和基准差异矩阵，再迁移低风险的纯 flat 来源（例如 DEF、tough），后迁移 percent/final 来源；**任何一组迁移必须全链路权威来源唯一，禁止并行累加旧、新两套数值**。
2. `Talent.f(player)` 中有即时运行副作用的卡必须把**属性贡献**与**获得时效果**分开处理：生命上限+即时补血、护盾上限+当前护盾、狂热初次触发、冲刺解锁。重算时不得重放获得时效果；但当前历史语义若不同，应列出独立的批准差异清单。
3. `SwapSystem.melt()`、升级、宝箱、重算的先后顺序/随机消耗不变。`recompute()` 不能简单清空整个 Player 后重建。当前 HP/已消耗盾层/冷却时间/临时效果、血包永久 maxhp 成长要给出保存与恢复政策；旧行为若已有可观测缺陷，先用测试定界，再另行授权纠正。
4. 对 `player.damage` 的每层倍率、魔弹特化和各技能 `DamageMath`，执行逐级全组合输出/发射时快照测试，防止重复增伤。迁移输出与旧值逐位比对。

### S4-D：敌人模型与 RuntimeState 完整隔离/封口验收

1. 明确怪物基础数值 `EnemyConfig`、波次/lvl/精英缩放、EffectiveStats 与当前 HP/计时器的边界。不改精英 HP×8、伤害×1.5、波次/等级成长公式或 RNG。
2. 在 Player/Enemy 的**内部**逐步分离运行态，保持旧 API 的兼容适配与 parity 序列化约束；不一次重写 Simulation/全体 System。不新增 S3 未批准的怪物数值成长。
3. UI 与 `CombatStats` 仍应来源一致；各入口（子弹、反弹、DoT、陨星、近战、自爆、接触伤害）逐项验证。
4. 执行完整 typecheck/test/build/Playwright/自然游戏流程；核对历史战绩、RNG、波 1/3/4/5/8 parity、天赋/置换/箱子/盾/血包/临时效果。按 `AGENTS.md` 同步双 changelog，并向上游交付。

## 5. 必测情景（不可只写公式单测）

| 场景 | 必须不变/验证 |
|---|---|
| 同一种天赋 2/3/8 层、混合乘法卡不同先后顺序 | 旧有效属性的乘法叠层语义，不能错误替换为加算 |
| 「磐石」3 层 +「铁布衫」+ 物理/真实伤害 | 护甲与通用减伤正确；true 不受两者影响 |
| 「元素亲和」3 层 + 火抗 bomber + 焦土 DoT | 已批准的 fire 乘区和火抗不改变 |
| 玩家弹丸发射后再获取加成、暴击率/倍率变化 | 旧弹丸按发射时属性；其他实时伤害按已有时机 |
| 获得生命上限天赋/满血血包成长，再换卡/recompute | 当前 HP、永久 maxhp 来源不丢失；即时补血仅在获得时发生 |
| 护盾层已耗尽/冷却进行中时的置换、重算、升级 | 不能莫名恢复当前盾层/刷新倒计时（如构成既有行为改变，必须单列明确批准） |
| 冲刺 CD、狂热层数/倒计时、战意持续、免死标记 | 属性重算不误重置运行状态 |
| 精英、射手弹丸、反弹弹幕、自爆与 DoT | 敌人缩放/快照/触发顺序与 S3 一致 |
| 上游 Issue #67 波末统一执行、#74 置换重做、#49 魔刃回旋 | 集成无倒退 |
| RNG / parity / 战绩 | 不增加或重排随机调用；不改旧战绩存储格式 |

## 6. S4-A 开发 Agent 可直接执行的任务指令

任务：在 `reopen64534042-sudo/pixel-rogue` 最新主线的用户 Fork 中，完成 **Combat Foundation S4-A：纯 StatModel**。先 `git fetch`、`git status`、读 `AGENTS.md`，确认没有其他会话在同一目录写入，再创建独立分支或 worktree；不直接在 main 修改。上游当前参考点为 PR #76 合并的 `cd9c8b6`，若主线已前进以最新远端为基准。阅读 Issue #32、设计规范、`data/stats.ts`、`core/types.ts`、`CombatStats.ts`、`TalentSystem.ts`、`talents.ts`、`SwapSystem.ts`。

仅实现带 `sourceId` 的基础属性、flat/percent/final 纯计算器及单元测试；保持与 `CombatStatsSnapshot` 伤害乘区语义分离，禁止修改游戏运行时入口、41 张天赋、数值平衡、波次/RNG、v8 parity 测试内容。按既有实现允许字段的白名单设计，不做全属性大爆炸/事件系统/装备接口。重点验证同区加算、final 连乘、非法输入、纯函数不变性、零/负增益的明确边界。运行全部 Vitest、typecheck、build；说明未运行的测试。完成 S4-A 即停，提供 diff、测试日志、接口定义、下一阶段待决策项供审查。未经明确授权，不提交/推送/创建 PR/合并。

## 7. 协作策略

建议 S4-A、S4-B、S4-C、S4-D 各在 Fork 用独立审查里程碑推进；S4-A 的纯计算基建完成后可考虑先向上游提出**独立小型 PR**，后续玩家天赋迁移/RuntimeState 分离分 PR 交付，而不是机械拼成一个过大的上游 PR。最终分 PR 策略以维护者接受范围和实际差异量决定。

`docs/pixel-rogue-combat-foundation-v1.md` 文件头目前还写着「S3–S4 尚未实施」，已经过时，应在正式 S4 文档提交时改为 S1–S3 已完成/S4 进行中；历史段落可以保留，并明确 S4 实施状态。新增/变更旧数值不得绕过用户与上游单独批准。
