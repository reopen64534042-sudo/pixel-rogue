# S4-D2-0：敌人攻击属性来源与接口审计

状态：D2-0 已通过独立设计复审，D2-A 已完成代码与验收复审；D2-B 尚未实施，其接口和行为差异仍需独立审批。权威约束和完整矩阵见 [D0 冻结契约 v1.0](pixel-rogue-S4D-D0-contract-v1.md)，尤其 §2、§4.6、§8.3、§10.6；本文不修改契约。下文保留 D2-0 设计时的建议与审批边界，不代表 D2-B 已获授权。

## 1. 基线与来源

2026-10-27 fetch 后 `upstream/main` 为 `2cd1a51572dfbbdebf44b6ea00fdf020da2c17b9`，PR #114 已合并 D1。D1 在生成时通过 `EnemyStatSources.resolveEnemyDefense` 解析 defense、resistances、tough，仅配置非 undefined 才写实体，抗性映射复制；`StatSheets` 的敌人 shadow 不进入运行时。四个攻击增伤仍由 `EnemySystem.spawnEnemy` 从配置条件展开，映射浅拷贝。五类现有配置均不声明这些增伤字段；这不是未来映射的空操作依据。

| 字段 | 来源与写入 | 消费与生命周期 |
|---|---|---|
| maxhp | `T.hp * hpScale * lvlPow * (elite ? 8 : 1)`，生成时写一次 | 精英血条分母；生成属性，不在帧循环重算 |
| hp | 与上式各自计算并初始化 | `CombatSystem` 普通/灼烧扣血、自爆设 0；死亡判定、目标选择及血条读取；运行状态，绝不能被重解析恢复 |
| dmg | `T.dmg * dmgScale * (elite ? 1.5 : 1)`，生成时写一次 | `getEnemyCombatStats().attack`、射手弹丸、自爆与接触 rawAmount；等级不参与 |
| speed | `T.speed * (elite ? 0.8 : 1) * (0.9 + random * 0.2)`，生成时写一次 | 敌人移动时按当前 slow 状态乘因子，不写回 speed |
| r | `T.r * (elite ? 1.8 : 1)` | 碰撞、近战及表现读取；保持原式，不入模型 |
| xp | `elite ? 25 : T.xp` | 普通怪击杀读取 `e.xp` 并参与幸运双倍判定；精英击杀使用独立的 `25 + (waveN-1)*ELITE_XP_STEP`，不读取 `e.xp`；保持原式，不入模型 |
| 四类增伤 | `EnemyConfig` 同名可选字段，生成时按非 undefined 写入；映射复制 | 实体 → `getEnemyCombatStats` 再复制 → `DamageSystem` 分别乘算；不随波次、等级、精英缩放 |

`hpScale = 1 + (wave-1)*0.18 + over*over*0.06`、`dmgScale = 1 + (wave-1)*0.05 + over*over*0.012`，`over = max(0,wave-15)`，`lvlPow = pow(1.03,floor(playerLevel/5))`。系数来自当前生成代码，并非 `combatBalance.ts` 中新的平衡来源。五类配置的基础 HP/攻击/速度依次为 slime 14/8/30、bat 9/6/62、brute 65/15/20、shooter 16/10/38、bomber 12/16/72。

射手发射时保存 dmg 和战斗快照，弹丸命中使用该快照；自爆在引爆时取快照；接触传 `src: e`，伤害调用时读取当前实体。`CombatStats` 快照与配置、实体映射分别隔离，不修改其接口。

## 2. D2-A 候选接口

```ts
interface EnemySpawnContext {
  readonly wave: number;
  readonly playerLevel: number;
  readonly elite: boolean;
  readonly speedJitter: number;
}
interface EnemySpawnStats {
  readonly maxHp: number;
  readonly attack: number;
  readonly moveSpeed: number;
}
function resolveEnemySpawnStats(cfg: EnemyConfig, ctx: EnemySpawnContext): EnemySpawnStats;
```

建议增量放在 `EnemyStatSources.ts`：分别以 `cfg.hp/dmg/speed` 为 base，final 数组依次为 `[hpScale,lvlPow,elite?8:1]`、`[dmgScale,elite?1.5:1]`、`[elite?0.8:1,speedJitter]`。`spawnEnemy` 仍在位置抽样之后、seed 之前抽一次 jitter，再传值；解析器不使用随机数。生成新实体时 `hp` 和 `maxhp` 均取该次 `maxHp`，`dmg` 取 `attack`、`speed` 取 `moveSpeed`；不向接口加入当前 HP、r、xp，不接入每帧或旧实体。StatModel 的 base 非负、final 必须正且有限；异常上下文/配置导致的新失败行为须先评审，不能以默认值掩盖。

保持原左结合次序，不预乘 final，不转 percent。独立 Node 数值探针：wave 3、brute、lvl 10、精英 HP 原序为 `750.2684799999998`，预组合为 `750.26848`；速度 `(30*0.8)*0.95` 为 `22.799999999999997`，`30*(0.8*0.95)` 为 `22.8`。自然抽样 jitter `0.9+0.25*0.2` 得速度 `28.500000000000004`。这是数值探针，不是运行时迁移验证。

## 3. D2-B：攻击来源接口与方案

```ts
interface EnemyAttackBonusStats {
  readonly globalDamageBonus?: number;
  readonly typeDamageBonus?: Readonly<Partial<Record<DamageTypeId, number>>>;
  readonly formDamageBonus?: Readonly<Partial<Record<AttackForm, number>>>;
  readonly skillDamageBonus?: Readonly<Record<string, number>>;
}
function resolveEnemyAttackBonuses(cfg: EnemyConfig): EnemyAttackBonusStats;
```

推荐 **A：扩展通用键控族**，增加 `formDamageBonus`、`skillDamageBonus`，并增加独立标量槽 `globalDamageBonus`；三种映射复用逐 key 的 `resolveKeyedMap` / `resolveStats`。公共族的类型联合与运行时白名单需同步扩展；在攻击侧提供 `DamageTypeId`、`AttackForm`、自由字符串各自的类型边界，而非把所有调用方降为无约束字符串。现有玩家 type/resistance 调用与 S4-C 来源实现保持不变，需专门验证旧调用和白名单行为。扩展本身是 D0 §10.6 明确要求先审查的公共接口变化，待批准后才能实现；若判断触及冻结条目，先修订并升版契约。

**B：攻击侧独立映射适配器**可将每个 key 的值包装为已有标量再组装，避免改公共白名单，却会借用与攻击增伤语义无关的槽位，或自行复制逐 key 聚合与校验，产生难以追溯的语义混淆和两套规则。若新增专用标量槽又重复了 A 的白名单变更。故不推荐并行保留两套。

全局增伤是独立 bonus 数值，绝不加到 `attack` 或预乘 `dmg`；`DamageSystem` 只在 rawAmount 后乘一次 `(1+global)`。类型映射的键空间为 `DamageTypeId`，形态映射为 `AttackForm`，技能映射为自由字符串。配置未声明的可选字段不输出；显式空映射输出独立空映射，显式零保留。现有生成路径只复制配置自有可枚举键；未来 modifier-only 来源可按解析器现有规则产出该来源实际声明的键，但不得预填其他键。保持普通对象、键形状与单层数值拷贝隔离，不写实体侧车。

### 3.1 数值编码与冻结的错误时机

对每个显式有限数字，以对应族槽或 global 标量槽编码：**正值、+0 和 -0 使用 base=value、无 flat**；仅当 `value < 0` 时使用 base=0、单条有序 `flat=value`。`-0 < 0` 为假，所以不会进入 flat；`0 + (-0)` 会变成 +0，禁止用这种编码。不能使用负 base 或以 percent 代替 bonus。此规则不改变玩家 S4-C 来源。

遵守 D0 §6 P-5：来源侧不复制 `DamageSystem.requireZone` 的范围检查，不裁剪；有限的 -1.1 经来源解析后仍为 -1.1，只有实际消费该乘区时才由 `DamageSystem` 抛 `RangeError`，未消费的映射键不会因此提前失败。-1 合法，乘区为零。Q3 的易伤/破甲（例如负抗性放大受击伤害）是另需立项的防御机制，与 DamageSystem 已支持的负攻击增伤是不同概念；不以 Q3 为由禁止合法负攻击增伤。

StatModel 对非有限数必然抛 `TypeError`（有限输入聚合溢出抛 `RangeError`），原生成路径只复制这些值，`DamageSystem` 对实际消费的非有限值抛 `RangeError`；接入后可能更早失败、异常类型不同，甚至原本未消费的键也失败。这一可观察差异须先获用户批准，不能通过 fallback 或重复范围检查掩盖。字段缺省和字段显式 `undefined` 按旧 `!== undefined` 省略；映射内显式 undefined/null、字符串等非数值，以及 null、数组等非映射容器，现有 spread/消费行为与严格来源检查不同，须逐项确定并审批，不能将它们静默归零。实际旧路径有时仅在消费时失败，不能统一描述为已有生成期错误。

### 3.2 自由键的两个边界

**解析阶段**：`resolveKeyedMap` 对 modifier-only 键须用 `Object.hasOwn(base, key)` 决定 base 是否存在；没有自有 base 时使用 0，不能直接 `base[key] ?? 0` 误读继承的 `constructor` 或 `toString`。有自有键时读取其值并按明确的非法值政策处理。输出使用普通对象的自有数据属性，保留 `constructor` / `toString` 等字符串键与独立拷贝。此处是通用解析器修正，需验证既有玩家调用不变。

**消费阶段**：`DamageSystem` 当前对未声明的 `constructor` / `toString` 用普通属性读取，可能取得继承函数而在消费时失败。建议另行评审最小自有键读取补丁（缺少自有键时取 0），并单独确认对所有映射和攻击场景的影响；不夹带进本次 D2-B 权威迁移。该补丁改变现有可观察错误，且触及 D0 预计禁止修改的 `DamageSystem`，须先审批、必要时修订契约。

`__proto__` 与一般自由 skillId 分开处理：暂沿用 `resolveKeyedMap` 的显式 `TypeError` 拒绝策略，不静默吞键；旧对象展开可保留自有 `__proto__`，生成期拒绝属于待用户批准差异。空字符串、符号键、继承属性及运行时未知类型/形态键是否保持旧 spread/消费行为，不能未经评审收紧；普通自由字符串不得一概拒绝。

### 3.3 候选测试及精确预期

下表是 D2-B 实施后的候选测试，**本次未新增或运行这些生产测试**；范围错误仍在消费点。每个数值在适用的 global、type、form、skill 槽分别验证，映射断言自有键与拷贝隔离，预期由独立输入和旧行为给出。

| 输入或来源 | 来源解析预期 | 消费预期 |
|---|---|---|
| `0.5` | base=0.5，结果 `Object.is(value, 0.5)` | 该区倍率 1.5 |
| `-0.5` | base=0、flat=-0.5，结果 `Object.is(value, -0.5)` | 该区倍率 0.5 |
| `-1` | base=0、flat=-1，结果 -1 | 倍率 0，结算 0，不执行正伤害保底 |
| `-1.1` | base=0、flat=-1.1，生成期成功且原值保留 | 该键被实际消费时 `RangeError`；未消费时不因范围而抛错 |
| `+0` / `-0` | 各自作 base；分别 `Object.is(value, +0)` / `Object.is(value, -0)` | 两者倍率均为 1；映射键保持存在 |
| modifier-only `constructor` / `toString` | 空普通 base、各 flat=0.5；结果各为自有键且值 0.5，互不受原型影响 | 自有数值可正常消费；缺省同名键的消费端修复须单独实施和验证 |
| 普通 skillId `fireball` | 自有 `fireball: 0.5` 原样解析为新映射 | 匹配 skillId 的倍率 1.5；其他正常缺省键为 1 |
| 自有 `__proto__` | 沿用拒绝建议：`TypeError`；这是待批准差异 | 不进入消费阶段；须以旧 spread 可保留自有键为对照 |

对 NaN、±Infinity 的候选用例须明确记录新生成期 `TypeError` 与旧路径仅实际消费时 `RangeError` 的差异；实现依批准结果决定。使用 `Object.is` 检验零符号，不用 JSON 序列化当基准。

## 4. 实施分批、独立基准与验收

| 批次 | 拟修改 | 验收与独立旧基准 |
|---|---|---|
| D2-A | `EnemyStatSources.ts`、`EnemySystem.ts`；对应 D2 测试 | 五类 × 普通/精英 × wave 1/3/4/5/8/15/16，等级 4/5、9/10、14/15、19/20、24/25 先设后生成；对照冻结 §2.3 表与测试内独立旧式左结合公式，`Object.is` 比较 HP、攻击、速度；r/xp 同时核对。禁止用新解析器生成预期 |
| D2-A RNG | 同上 | D2-08/08b/09/09b/09c/10 的固定随机序列与精确字段；自然/强制分别验证，角落五次重试及首试成功反证；次数、序列和 seed/shootCd 均对照冻结 §2.2/§8.3 |
| D2-A 状态与路径 | 对应 D2 测试 | D2-11 至 D2-28 与已有 parity 原样保留；受伤后生成新敌人不改旧 HP/maxhp；真实发弹、自爆、接触与 DoT 等对照冻结数值和原路径，不能仅比较解析器自身；相关 Vitest、类型检查、构建与规定的全量检查分别记录 |
| D2-B | `EnemyStatSources.ts`、`EnemySystem.ts`；方案 A 还需 `StatModel.ts`、`StatKeyedMap.ts` 及类型声明；对应测试 | 使用独立配置样本和旧条件展开/浅拷贝行为作形状及值基准；按 §3.3 验证缺省、空映射、两种零、正负值、范围边界及已批准的非法值差异；配置→实体→快照各层拷贝隔离；不同类型、形式、skill 不串扰；独立手算 rawAmount 乘区，证明 attack/global 不重复；发弹后修改及移除实体不回溯，自爆取引爆时值，接触读取当前实体。玩家 S4-C 与现有键控调用回归 |

测试中若注入配置，须在 `finally` 中还原；数值预期来自旧公式、冻结表或独立手算，不引用新来源解析结果。现有 parity 不改变排除项或目标。所有矩阵、失败行为及 D0 其余适用项目须逐项记录；D2-A/D2-B 分别评审与授权，失败停止，不以构建代替真实路径证据。

## 5. 风险、审批与回退

| 项目 | 分类 | 处理和风险 |
|---|---|---|
| final 顺序、RNG 预算、受伤 HP、r/xp、快照时机 | 已冻结规则 | 保持原样；任何偏离先修订、升版并获批 |
| bonus 范围与错误位置 | 已冻结规则 | P-5 保留消费点 `requireZone`，来源不重复检查或裁剪 |
| 非负值/负值及 -0 编码、modifier-only 自有键读取 | 纯技术实现建议 | 保持数值及形状，须验证旧玩家调用；不代表实施授权 |
| 公共族及 global 槽扩展 | 待评审接口 | 方案 A 获技术方向认可，D2-B 仍须修订完成与审批；如偏离冻结契约先修订升版 |
| 非有限数、非数字、异常容器和显式 undefined | 待用户批准差异 | StatModel 可能生成期失败并改变异常类型或未消费键行为；逐项审定，不自行批准 |
| 自有 `__proto__` 拒绝 | 待用户批准差异 | 与旧 spread 兼容性和失败时机不同；单独审定 |
| 缺失原型同名键的消费端修复 | 待用户批准差异 | 独立修复，不夹带 D2-B；修改 `DamageSystem` 须先评审契约边界 |
| 键过滤、符号/继承/未知键策略 | 待用户批准政策 | 任何偏离旧字段形状或消费行为的变动均先审定 |

禁止改平衡系数、r/xp、实体字段集、玩家 S4-C、随机预算或增加每帧解析。D2-A 可独立于 D2-B 的映射审批实施，但须另获 D2-A 实施授权；本轮两批均不实施。

实施回退以独立批次的可审阅逆向补丁或后续经授权的 revert 为单位：D2-A 恢复原生成表达式及 RNG 位置，D2-B 恢复原条件展开与浅拷贝；保留 D1 防御链与所有原有测试。回退后重跑对应矩阵及 parity，核对实体形状和快照；不使用 reset/clean，不在本审计执行回退。
