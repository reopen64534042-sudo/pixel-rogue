# S4-D2-B / B0：敌人攻击增伤接口与行为政策

状态：**B0 独立设计复审通过（P1=0、P2=0、P3=0）；用户已批准 §3.1 政策，B1 已按批准政策实施并复审通过。** D0 冻结契约未修改。审计基线为 2026-10-27 fetch 后 `upstream/main` 的 `d2fa35cc43dce6b9c41cf00627dd61c69a24c7c7`，其合并 PR #115，包含 D2-A 提交 `24aad95238cbc2cb703f0a85846cda4f4b9cbaa0`。工作区起始干净，无 stash；原分支 `feat/combat-foundation-s4d-d2` 是该合并提交的祖先。

**最终决策记录（2026-10-27）：** 首轮复审有条件通过，P2×2 / P3×2 修订后复审通过；随后用户正式批准 §3.1 政策并授权 B1，B1 补足一项 P2 测试覆盖后复审通过。下文保留审计时的“待批准”“候选”等历史标签，用于说明当时识别的差异和决策缘由；它们不表示当前政策仍待批准。消费端原型同名键问题仍是独立后续事项。

## 1. 实际调用链与边界

`spawnEnemy` 先解析 D1 防御，抽位置和速度抖动，调用 D2-A `resolveEnemySpawnStats`，随后构造对象，抽 seed / shootCd，最后对四个攻击增伤字段执行 `!== undefined` 条件展开；三个映射用对象 spread。对象构造成功后才 `push`。`CombatStats.getEnemyCombatStats` 再复制映射；射手发射时保存 `dmg` 和快照，弹丸命中使用它；自爆引爆时创建快照；接触调用以 `src` 传实体，`damagePlayer` 在调用时取快照。`DamageSystem` 依次验证并乘 global、type、form、skill，保持原顺序。`StatSheets` 是玩家来源及 shadow，不能改造成敌人运行时入口。

独立旧基准定义：以本基线 `EnemySystem.ts` 的四段条件展开为准，直接在测试夹具中手写 `field !== undefined ? {field: ...} : {}` 和 `{...map}`，不调用新解析器；消费期另用现有 `getEnemyCombatStats` 与 `calculateDamage` 实际路径。下面的旧行为按普通数据属性描述；getter、Proxy 可抛异常或有副作用，须分别观察读取次数和时机，不能假设纯对象结论覆盖它们。配置字段本身采用普通属性读取，因此继承的字段也会被读取；映射 spread 只复制自有可枚举字符串和符号属性，读取 getter 并创建普通数据属性，忽略继承和不可枚举属性。

## 2. 最终候选接口与实现规则

```ts
interface EnemyAttackBonusStats {
  readonly globalDamageBonus?: number;
  readonly typeDamageBonus?: Readonly<Partial<Record<DamageTypeId, number>>>;
  readonly formDamageBonus?: Readonly<Partial<Record<AttackForm, number>>>;
  readonly skillDamageBonus?: Readonly<Record<string, number>>;
}
function resolveEnemyAttackBonuses(cfg: EnemyConfig): EnemyAttackBonusStats;
```

在 `STAT_IDS` 增加独立 `globalDamageBonus`，在 `KEYED_STAT_FAMILIES` 增加 `formDamageBonus`、`skillDamageBonus`；`StatId`、`KeyedStatFamily`、运行时集合和 `resolveStats` 均由同一常量推导。三个映射依各自族解析，不把 key 变成固定 StatId；调用边界保留上述类型，运行时不据类型联合过滤字符串。现有玩家 S4-C 来源与投影不改。`attack`、四个乘区和伤害公式保持独立；不得把 global 预乘 attack。

每个有限值：`value < 0` 才以 base=0、单条 flat=value 编码；正数、+0、-0 以 base=value、无 flat 编码。不得额外加零，使用 `Object.is` 核验。不能预检 `< -1`：-1 合法、-1.1 解析成功，只有对应乘区实际消费时 `requireZone` 抛 `RangeError`，未消费键不因该范围失败。绝不静默归零、裁剪或过滤非法值。有限数多来源聚合溢出仍遵循 StatModel `RangeError`；本配置单值映射无此聚合需求。

`resolveKeyedMap` 当前 `base[key] ?? 0` 对 modifier-only 的 `constructor` / `toString` 读取 Object.prototype 函数，进入 StatModel 触发 `TypeError`。候选采用分层处理：

```ts
const ownValue = Object.hasOwn(base, key) ? base[key] : undefined;
const baseValue = ownValue ?? 0;
```

公共解析器不读取继承值，保留显式自有 null/undefined 归零的既有语义；modifier-only 原型同名键由原来的异常改为正常解析，是有意修复且须验证的公共行为变化。敌人攻击来源适配层在调用公共解析器前单独严格校验显式值，拒绝 null/undefined，不得依靠 nullish fallback 静默归零。输出保留普通对象和允许的自有数据键，拒绝自有 `__proto__` 作为待批准差异。现有玩家 type/resistance 调用及 shadow 均需回归验证。

候选保留 spread 的符号键：枚举自有可枚举符号，逐值用对应族的单槽 `resolveStats` 解析并以数据属性写入普通输出对象；符号不强行转字符串，也不交给只接受字符串 key 的 `resolveKeyedMap`。这只是适配层处理，不改变公共键控 API。字符串及符号均需校验，非法值不得静默丢弃。若复审认为符号不属于受支持契约，必须明确批准收紧，不能无声过滤。各字段缺省省略、空映射保留；配置、实体及战斗快照分别为独立单层映射，符号也参与隔离。

合法普通数据配置的字段值、形状及 RNG 序列必须与旧实现一致。B1 优先在对象字面量现有攻击增伤展开位置使用 `...resolveEnemyAttackBonuses(T)`，必须位于 `seed` 和 `shootCd` 求值之后；不得在对象构造之前预先调用解析器。解析器固定依 global → type → form → skill 的顺序逐字段读取、校验和解析，失败即传播，不预读后续字段。若实现无法维持该位置，须停止并重新评审。异常配置及带副作用的 getter/Proxy 不保证与旧实现完整等价：读取次数、次序和异常类型可不同，其支持边界及差异待批准；仍须实测异常时已消耗 RNG、读取计数和是否 push，不能以“RNG 总数不变”掩盖失败路径差异。

## 3. 行为差异政策表

列中“形状”指实体成功生成后的可观察自有字段及映射；“新”是上述严格候选，非已批准行为。消费时 `?? 0` 可将映射项 null/undefined 中性化，global 快照同样 `?? 0`；其他非数值由 `requireZone` 的 `Number.isFinite` 拒绝。按真实流程，先验证 global、type、form，只有提供 skillId 才验证对应 skill。非法请求类型还可能先被注册表拒绝。

| 输入 | 独立旧生成与消费 | 新预期、异常/时机和实体形状 | 分类、政策与测试 |
|---|---|---|---|
| 正有限、负有限（≥ -1）、+0、-0 | 原样复制；消费倍率 `1+值`；零符号保留在实体/快照 | 同值同键，`Object.is` 保号；消费公式不变，无新异常 | 保持；四槽逐个比旧 spread，核对属性描述及 Object.is |
| -1 | 原样复制；实际消费倍率 0、结算 0 | 同上 | 保持；各槽独立真实消费，检查零伤害不保底 |
| 有限 < -1，例如 -1.1 | 原样复制；实际使用该区才 `RangeError`，未使用键不失败 | 解析成功、原值和形状保持；同一消费点抛相同类型 | 冻结 P-5；各映射选中/未选中和 global 用例 |
| NaN、±Infinity | 生成成功并保留；实际消费时 `RangeError`，未消费键不抛 | 生成期 `TypeError`，无实体；错误类型、时间和 RNG 消耗可能变化 | **待批准差异**；各槽、选中/未选中、随机计数与无 push 对照 |
| 非数字，包括字符串、布尔、对象、bigint、symbol | 原样复制；消费通常 `RangeError`；错误消息插值遇 symbol 等可能自身 `TypeError` | 显式有限数字验证，生成期 `TypeError`，无实体 | **待批准差异**；覆盖消息插值可抛情形，分别记录实际类型与时机 |
| 字段缺失、显式字段 undefined | `!== undefined` 均省略；继承字段另见下行 | 均省略，无异常，字段形状同旧 | 保持；区分 `hasOwn`、`in` 和显式 undefined |
| 映射自有项 undefined 或 null | 原样复制并保留键；消费时 `?? 0`，未消费亦无错 | 生成期 `TypeError`、无实体；禁止通过 `??` 归零 | **待批准差异**；分别测三族及 global null（旧实体保留 null，快照变 0） |
| 显式空映射 | 生成自有空普通对象；快照亦新建映射（skill 为真值，故亦为空对象） | 同形状与独立引用 | 保持；分别对三族检查 `Reflect.ownKeys` 和引用 |
| 映射容器 null、数字、布尔 | 对象 spread 将 null 和这些原始值转为空对象；生成字段存在；skill 快照空对象 | 拒绝非对象容器，生成期 `TypeError`、无实体 | **待批准差异**；每族独立比较 |
| 字符串容器 | spread 复制字符索引，字符串值保留；使用相应键时常为 `RangeError` | 生成期 `TypeError`，无实体 | **待批准差异**；含空和非空字符串 |
| 数组、函数、日期等异常容器 | spread 复制各自可枚举自有键（数组索引、函数附加属性等），不验证容器 | 候选仅接受非 null、非数组对象；数组/函数拒绝；日期等对象按自身可枚举数据处理，不擅自以原型过滤 | 数组/函数 **待批准差异**；测试空、稀疏、有附加键数组与函数；对象 getter/Proxy 异常另计 |
| 映射继承键、不可枚举键 | spread 忽略；实体不含；配置字段本身若继承且非 undefined 则照常处理 | 同样只取自有可枚举键；字段使用普通读取；无新增实体键 | 保持；分别测继承字段、映射继承键及不可枚举键，getter 读取次数另审 |
| 自有 enumerable `constructor`、`toString` | spread 成为普通对象自有数据键，数值原样保留并可消费 | 保留且逐值解析；modifier-only 必须基于自有性，不读取继承函数；公共自有 nullish 仍为 0，敌人来源先严格拒绝 | 保持合法配置；公共 modifier-only 修复与分层 nullish 行为分别验证 |
| 自有 enumerable `__proto__` | spread 创建自有数据属性，不改变原型；快照 spread 也保留 | 字符串键解析器生成期 `TypeError`、无实体 | **待批准差异**；用 `Object.defineProperty` 或 JSON 构造，不用对象字面量原型语法 |
| 空字符串键 | spread 保留；skillId 为 `""` 时可消费；未知 type 先受注册表限制 | 保留且解析；不做非空过滤 | 保持；skill 空串实际消费及形状验证 |
| 自有 enumerable 符号键 | spread 保留；快照也复制；常规类型签名不能直接表达，运行时属性可观察 | 候选以单槽解析后保留合法数值及符号身份；非法符号值生成期 TypeError | 合法值保持；非法值提前失败 **待批准**；测试 `Reflect.ownKeys`、不可枚举符号与隔离 |
| 未知 type / form / skill 字符串 | spread 全部保留；type 请求需先通过 registry 自有键；form 运行时可查对应字符串；skill 自由查找 | 不过滤；有限值和形状保持，非法值仍按严格候选提前失败 | 合法值保持；运行时强制类型夹具覆盖实际消费，未知 type 注册表拒绝顺序不变 |
| getter、Proxy、抛错枚举及访问 | 旧条件判断和展开可能多次读取字段；spread 按自身键顺序取值，异常在构造期间传播，push 不发生 | 检查/解析可能改变读取次数、顺序、异常类型与 RNG 时机 | **待批准差异或独立后续问题**；B1 前固定对受支持输入的政策，不吞异常；记录冻结契约是否需先修订 |

### 3.1 复审后的政策建议与审批状态

下表保留设计复审时的建议与历史审批状态；这些政策随后已获用户正式批准，见文件开头的最终决策记录。普通合法输入的行为保持和 D0 P-5 不因此放宽。

| 政策 | 修订后建议 | 状态 |
|---|---|---|
| 非有限、非数字增伤及映射项 null/undefined | 敌人来源生成期抛 `TypeError`，不静默归零 | 待批准差异 |
| 非法映射容器 | 拒绝 null、数组、函数及原始值容器；其他对象按表中自有可枚举属性处理 | 待批准差异 |
| 自有 `__proto__` | 拒绝并抛 `TypeError` | 推荐批准，尚未批准 |
| 合法自有可枚举 Symbol 键 | 保留身份、数值及各层隔离 | 候选方案待批准 |
| 公共解析器显式自有 nullish | 维持 nullish → 0；敌人来源严格校验 | 修订后的设计候选，需验证；不再提议收紧 |
| getter / Proxy | 不保证完整副作用等价；不改变普通合法数据配置契约，记录读序、异常和 RNG | 支持边界及差异待批准 |
| 有限增伤 < -1 | 来源解析成功，实际消费时 `RangeError` | D0 P-5 已冻结，沿用；未消费键不提前失败 |

消费端另有独立问题：`DamageSystem` 对缺失的 `constructor` / `toString` 使用普通属性读取，可能取到继承函数并抛错；自有数值则覆盖原型。此问题不在 B1 顺带修复；须单独评审、批准并检查 D0 契约影响。`__proto__` 的拒绝与此不同。

## 4. B1/B2 验收矩阵

预期仅来自独立旧展开、D0 冻结数值或手算，不调用候选解析器计算预期。配置注入使用 `finally` 还原；不更改 parity 排除项或验收目标。

| 编号 | 验证内容与可观测结果 |
|---|---|
| B-01 | 每槽正、负、±0、-1、-1.1；`Object.is` 比较配置、实体、快照，比较属性存在性与所有自有键；-1.1 选中才消费期 RangeError。 |
| B-02 | 缺字段、字段 undefined、显式空对象、每个映射项 undefined/null，分别对照表中政策与批准状态；绝不通过新解析器计算期望。 |
| B-03 | NaN、±Infinity、各类非数字、null/数组/函数/字符串容器；旧生成/消费与新异常类型、调用时机、RNG 计数、是否入队分开断言；多个字段同时非法时断言 global → type → form → skill 的首错及后续字段未读取；用 getter/Proxy 事件日志对照旧路径读取计数、顺序与失败时 RNG；未批准项不能实施。 |
| B-04 | 自有/继承、不可枚举、getter、符号、空串、未知键、constructor/toString、定义为自有数据属性的 __proto__；分别检查 `Object.hasOwn`、`Reflect.ownKeys`、原型和属性描述；错误政策按审批结果。 |
| B-05 | 通用键控空普通 base + modifier-only constructor/toString，值 0.5 为自有数据键；自有合法 base、显式 undefined/null 均验证公共 nullish → 0；敌人来源对同样的显式映射项单独抛 TypeError；覆盖 __proto__、玩家 type/resistance 及 shadow 旧用例，记录 modifier-only 的公共修复。 |
| B-06 | 四乘区各自独立及组合：例如 raw=100、global=.1、type=.2、form=.3、skill=.4，在无减伤条件下按 `(((100*1.1)*1.2)*1.3)*1.4` 手算逐位；attack 不受 global 预乘；错配类型、方式、技能各仅影响自己的区。 |
| B-07 | 配置→实体→快照三层映射互不共享：逐层修改、增删字符串和符号键，检查其他层不变；空映射也检查引用。 |
| B-08 | 实际射手发弹后修改实体映射及 dmg、移除实体，再命中；仍按发射时的 dmg/快照结算。自爆在引爆前修改字段，以引爆时值手算；接触连续调用以每次当前实体值手算。两次实际接触前均保证相交、`player.hurtCd <= 0` 且 `player.dashT <= 0`：推进足够模拟时间或明确重设测试前置状态，断言两次均进入伤害管线及实际结算，排除冷却或冲刺门控。 |
| B-09 | D1 防御权威/非法值及独立拷贝，D2-A 生成值、hp 状态、r/xp 和公式顺序，S4-C 玩家来源/重算及 type/resistance 回归；现有测试保持。 |
| B-10 | D0 D2-08/08b、09/09b/09c、10 固定随机序列、4/5/6/8/9 次及值→消费映射；6 次使用自然抽取、玩家角落 `(30,30)`，类型随机后位置依次取 `0.6`（失败）、`0.125`（通过），再依次消耗速度、seed、shootCd，断言 1+2+3=6 及位置和各值的映射。D2-12 等原预算；合法路径验证攻击字段读取发生在 seed/shootCd 后，失败路径另记录各步骤 RNG、getter 日志及是否 push。浮点左结合以 Object.is 对照独立旧式。 |
| B-11 | 原 parity 保持原目标；按冻结契约运行相关及规定全量检查、类型检查和构建。Browser 验收区分受控状态、自然生产试玩及截图证据；构建或单测不能替代浏览器玩法验证。记录未验证项。 |

## 5. B1 最小文件与批准门槛

生产候选：`src/game/core/StatModel.ts`（标量/族及一致性）、`StatKeyedMap.ts`（自有键基值）、`EnemyStatSources.ts`（接口、编码与解析）、`EnemySystem.ts`（只替换四段来源写入，保持字段和快照）。`types.ts` 与 `StatSheets.ts` 先审查是否需要类型或兼容导出；没有实际需要不改。`CombatStats.ts`、`DamageSystem.ts`、伤害公式和玩家来源不在生产改动范围。B1/B2 按矩阵另行新增或调整相关测试；此处不预设测试文件名。若实施改变结构或命令，按项目规则同步必要文档；功能 PR 合并前按 Issue #55 更新双份 changelog，均不属于本 B0。

**设计阶段审批门槛（历史记录）：** 非有限/非数字及显式映射 null/undefined 的生成期 TypeError；异常容器限制；自有 `__proto__` 拒绝；getter/Proxy 支持边界、次序与失败时 RNG 差异；符号适配方案及接口扩展，当时均须批准。现已按开头决策记录获批并实施。公共 keyed parser 的自有 null/undefined 保持旧行为；modifier-only 原型同名键的修复已实施并验证。任何与 D0 冻结条目冲突的变化须先修订契约、升版并获批准，不能由本文自行覆盖。消费端继承属性修复独立立项。

风险：公共族扩展影响所有调用者；错误提前使本来未消费的配置无法生成；普通对象原型键与符号易漏；位置移动可能改变失败路径 RNG；过早解析或重复拷贝可能改变 getter 次序。回退使用经授权的独立逆向补丁或 revert，恢复旧四段条件展开和浅拷贝、移除本批专属族/标量与适配，保留 D1/D2-A 和其他工作；重跑矩阵与 parity，不使用 reset/clean。B0 不执行回退。

## 6. 本阶段验证状态

以上保留 B0 当时的源码审计与设计结论；当时尚未实施 B1 或执行 B2。后续 B1、B2 的实现与验证见独立验收报告，本次 B3 收口不修改 D0。
