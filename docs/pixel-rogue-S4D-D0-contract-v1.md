# Pixel Rogue · Combat Foundation S4-D0 契约 v1.0

> **状态：FROZEN v1.0 / 用户批准。**
> 本文档为 S4-D0 **冻结契约**（v1.0，2026-10-26 用户批准）：Q1–Q5 全部决策已定案（§10.2），§1～§9 的技术基线、公式与验收断言自 v0.3 起未变更。实施须按 §10.5 逐阶段独立审查与授权；任何偏离本文任何条目，必须先修订本文档、升版本并留修订记录（先例：`docs/pixel-rogue-S4C-C3-contract-v1.md` v1.0→v1.2）。
> 阶段定位：S4-D0 = 只读审计 + 契约冻结 + 验收矩阵。**D0 阶段不修改生产逻辑、不新增/修改测试、不进入 D1。**

## 修订记录

| 版本 | 日期 | 依据 | 变更 |
|---|---|---|---|
| v0.1 | 2026-10-26 | D0 首次交付 | 字段所有权表、生成公式/RNG 基线、D1/D2/D3 设计、负区因子政策草案、验收矩阵 |
| **v0.2** | 2026-10-26 | **独立复审（P1=0 / P2=4 / P3=3）修订，仅文档** | ① D2-08 改为真实 `GameCore.spawnEnemy()` 自然抽取路径 + 默认玩家位置 `(696,520)`，逐位预期修正为位置 `(996,520)`、`shootCd=2.125`，并单列强制类型路径的值→消费映射（P2-1）；② D2-09 增加可**必然触发 5 次位置重试**的角落前置状态，强制/自然两条路径分别固定 8/9 次（P2-2）；③ D2-12 击杀随机预算改为实测 25 次并拆解 4+21，补伤害入口/经验球/血包的附加随机（P2-3，原「粒子每颗 2 次」为误）；④ D1 范围定案为 DEF+RES+**tough**，四类增伤推迟到 D2，接口/矩阵/文件表三处同步（P2-4）；⑤ D1-10 区分 `settledDamage` 与 `effectiveHpLoss`（P3-1）；⑥ D2-24 灼烧到期改为实测「121 帧结算 / 第 122 帧清层」（P3-2）；⑦ 未跟踪文档改用真实空白/格式检查（`git diff --check` 不覆盖未跟踪文件），并记录检查项与结果（P3-3）；⑧ `EnemySpawnContext` 删除多余 `maxHp` 输入；可选映射「浅拷贝」表述精确化（值均为 `number` 基本类型，键与值均隔离、不递归） |
| **v0.3** | 2026-10-26 | **冻结前复审（P2×3 / P3×3）修订，仅文档** | ① **D2-04** 等级改为**生成前置条件**（先设 `player.lvl` 再 `spawnEnemy`），并补实测反证「先 spawn 后改 lvl 不回改已有实体」（P2-1）；② **D1-15** 物理与真实伤害改为**各自独立目标**（各 `hp=maxhp=999`），并记录实测：同一目标连续两次调用时第二次被 `hurtEnemy` 首行 `e.dead` 门控**返回 `undefined`**（P2-2）；③ **D2-24** 补齐完整初态（`hp=maxhp=1_000_000`、无火抗/无 `defense`/无 `tough` 键、`dmgBy.burn` 初值 0、`quota=0`/`spawnCd=1e9`/`player.fireCd=1e9`/`speed=0`）使 HP 损失逐位可复现（P2-3）；④ **D2-09** 删除「任意角度在角落都会近距离」的错误表述，只固定 `r=0.6`（第三象限双向 clamp），新增 **D2-09c** 用 `r=0.125` 反证 300px 首试通过（P3-1）；⑤ **D2-24** 删除「交换分支内递减/结算顺序会改变帧数」的错误论断，改为实测：**交换顺序结果完全相同**（121/122、`20.16666666666667`）；真正决定 121 的是「门控读递减前值且严格 `>`」+「无条件 `-= dt` 不夹紧」+「`else if` 清层分支」，而**门控移到递减后** → 120 帧/`20.000000000000004`/清层 121，**`Math.max(0,…)` 夹紧** → 帧数不变但序列化终值由 `-0.016666666666664564` 变 `0`（P3-2）；⑥ **§2.2** 修正强制类型路径的位置值下标区间为 **第 1..n 个值**（自然抽取为 **第 2..(n+1)**），并补 n=1/2/5 的调用数互证与 `n=2` 落点（P3-3） |
| **v1.0（冻结）** | 2026-10-26 | **用户批准冻结（Q1–Q5 全部推荐方案）** | **仅政策确认与版本冻结，不改动任何已通过复审的技术公式或验收断言**（§1 字段表、§2 生成公式/RNG 基线、§3～§5 设计与接口、§8 验收矩阵的数值与步骤均与 v0.3 逐字一致）。变更仅为：① 状态 `DRAFT v0.3` → **`FROZEN v1.0 / 用户批准`**；② 文件名 `…-D0-contract-draft.md` → **`…-D0-contract-v1.md`**（不保留两份互相竞争的契约）；③ §6/§7.2 的「待批准」改为**已批准结论**（Q1 负值边界 `RangeError`、Q2 上限仍消费点裁剪、Q3 未来负向机制另行审批、Q4 `r`/`xp` 不入模型）；④ §10.2 增补「批准结论」列与 Q5 正式定案；⑤ 新增 §10.6 **实施期注意事项**（D2 前单独审查 `formDamageBonus`/`skillDamageBonus` 来源解析接口；`radius`/`xp` 不得被描述为已迁移权威属性；RNG/浮点顺序/实体形状/快照时机四条红线；D1/D2/D3 逐阶段授权） |

| 项 | 值 |
|---|---|
| 上游仓库 | `reopen64534042-sudo/pixel-rogue` |
| 审计基线 | `a3617e6bd51bf707437ba34cc4323a1d7af5478f`（PR #110，S4-C 合并提交） |
| 基线分支 | `upstream/main`（本轮 `git fetch upstream`：`6e58c96..a3617e6`） |
| D0 分支 | `feat/combat-foundation-s4d-d0-contract`（从 `upstream/main` 创建，未提交） |
| 审计日期 | 2026-10-26（v0.2 / v0.3 修订同日） |
| 依赖契约 | `docs/pixel-rogue-S4C-C3-contract-v1.md`（v1.2）、`docs/pixel-rogue-S4-implementation-brief.md`、`docs/migration.md` D-11/D-17/D-19～D-22/D-27/D-28/D-31 |
| 本阶段验证 | `tsc --noEmit` 通过；`vitest run`（禁用结果缓存与模块文件缓存）**411/411** 通过，其中 `parity.test.ts` **26/26**；新增文档的真实空白/结构/引用检查见 §11（行尾空白、制表符、BOM、CRLF、代码围栏配对、表格列数、标题层级、章节引用、标记唯一性）；工作区仅新增本文件 |

---

## 0. 审计口径与本次发现的差异

### 0.1 口径

- 一切结论以**当前代码**为准，不以任务书/设计文档的概括文字为准（任务书 §三 明令）。
- 行号基于基线 `a3617e6` 的工作区检出；文件为 CRLF，docs 为混合换行。
- 数值均以脚本在 Node 24.21.0 下实算（IEEE-754 double），不做「看起来对」的近似。
- 区分四类陈述，**全文严格遵守**：
  - 【事实】可由代码/运行结果直接验证；
  - 【设计建议】D1/D2/D3 的候选做法（**实现方式**仍待各阶段评审）；
  - 【待批准】可能改变可观察行为的政策或差异，必须用户/上游批准；
  - 【已批准】已经用户批准并冻结于本文 v1.0 的决策（仅 Q1–Q5，见 §10.2）；其余任何新差异仍须单独报批。
- **冻结范围提示**：v1.0 冻结的是「政策与验收口径」，不是「实现已落地」。D1/D2/D3 的生产代码尚未开始（§10.1），实现方式分歧仍按 §10.5 逐阶段审查。

### 0.2 本次审计纠正的上游文档概括（**只记录，不修改原文**）

| # | 出处 | 文档概括 | 实际代码【事实】 | 处理 |
|---|---|---|---|---|
| A-1 | `docs/pixel-rogue-S4-implementation-brief.md` §2 第 4 条（「`hp` 和 `dmg` 按波次/等级/精英分别缩放」） | 暗示 hp 与 dmg 都吃等级缩放 | `lvlPow` **只出现在 hp/maxhp**（`EnemySystem.ts:50-51`）；`dmg` 只吃 `dmgScale` 与精英 ×1.5，**无等级缩放**（`:53`） | 记录；D2 基线按实际公式；建议后续文档修订时更正 |
| A-2 | 同上 §2 第 4 条（「护甲/抗性…S3 方案甲不随波次自动缩放」） | 正确，但未说明「也不随精英变化」 | 甲/抗**不随波次、不随等级、不随精英**变化（仅条件展开拷贝 `:71-90`） | 与本轮 §2/§4 一致，补全表述 |
| A-3 | `docs/migration.md` D-21（「`Enemy.speed` 为敌人实体属性，与 Player.speed 无关、不入模型」） | 作为 C2-B 边界陈述成立 | 但 `Enemy.speed` **是生成时形成的有效属性**（含精英 ×0.8 与随机抖动），且运行时减速在消费点乘算而非写回 | D2 草案按「生成时有效属性」处理（§2.3） |
| A-4 | `docs/migration.md` D-31 遗留（「本批的 RuntimeStateProtection 白名单机制为其提供骨架」） | 暗示 S4-D 可复用玩家侧快照骨架 | 敌人**没有任何属性重算入口**（无 `Object.assign`/重放/投影），强行套用快照恢复属**虚构需求** | D3 明确不复用该骨架，见 §5.2 |
| A-5 | `docs/pixel-rogue-S4-implementation-brief.md` 文件头（「S4-C 第一批…PR #91…S4-C 后续批次与 S4-D 未开始」） | 已过时（S4-C C3 三批均已合并，PR #110） | — | **不在本批改写**；建议另开 docs 任务更新（§10.3） |

---

## 1. 字段所有权表

### 1.1 分类定义（沿用 C3 契约 §1 框架，按敌人侧需要微调）

| 类别 | 定义 | 敌人侧判定要点 |
|---|---|---|
| **S 生成时派生属性**（Spawn-derived） | 值完全由 `EnemyConfig` + `waveN` + `player.lvl` + `elite` + 一次性随机抖动决定；同一组输入唯一确定 | 理论上**可重算**，但重算会消耗 RNG、且会覆盖后续运行状态 |
| **F 生成时固定值**（Spawn-fixed） | 生成时写一次，之后无任何合法写入者；读取者可有多个 | 元数据类（type/spr/seed/xp/elite）与「默认不写」的可选战斗属性 |
| **R 动态运行状态**（RuntimeState） | 过程量：当前资源、剩余时间、消耗标记、瞬时反馈 | 必须保留现值；**不存在重算入口**（§5.2） |
| **R\* 受运行态影响的消费点** | 字段本身是 S/F，但读取处会再乘一个运行态因子 | `speed` × 减速因子；`dmg` 经快照进伤害管线 |

### 1.2 逐字段矩阵

列说明：**初始来源**＝生成时唯一写入点；**写入者**＝生成后全部合法写入点（不含测试/夹具）；**读取者**＝实际消费点；**形状**＝序列化/枚举形状约束。

#### (a) 计算属性 / 生成时派生（S）

| 字段 | 初始来源（`EnemySystem.ts`） | 生成后写入者 | 读取者 | 是否可重算 | 是否生成时固定 | 随波次 | 随等级 | 随精英 | 形状约束 |
|---|---|---|---|---|---|---|---|---|---|
| `hp`（生成时值） | `T.hp * hpScale * lvlPow * (elite?8:1)`（`:50`） | **是运行状态**：见 (c) | 见 (c) | 是（但不重算） | 否（生成后立刻成为运行状态） | 是 | 是（仅此字段） | 是（×8） | 必有键 |
| `maxhp` | 与 `hp` **同一表达式、各自独立求值**（`:51`） | **无**（`src/` 全仓无写入者） | `draw.ts:210` 精英血条比例 `(w*e.hp)/e.maxhp` | 是 | 是 | 是 | 是 | 是（×8） | 必有键；永不为 0（配置均为正） |
| `dmg` | `T.dmg * dmgScale * (elite?1.5:1)`（`:53`） | **无** | `CombatStats.ts:40`（→ `CombatStatsSnapshot.attack`）、`EnemySystem.ts:210`（射手弹丸 `dmg`）、`:232`（自爆 `damagePlayer`）、`:267`（接触 `damagePlayer`） | 是 | 是 | 是 | **否** | 是（×1.5） | 必有键 |
| `speed` | `T.speed * (elite?0.8:1) * (0.9 + Math.random()*0.2)`（`:52`） | **无**（减速不改写字段） | `EnemySystem.ts:184` `spd = e.speed * (e.slowT>0 ? 1-e.slowF : 1)` | 是 | 是（含一次性抖动） | 否 | 否 | 是（×0.8，且**乘法顺序**影响末位，见 §2.3） | 必有键 |
| `r` | `T.r * (elite?1.8:1)`（`:54`） | **无** | 接触判定 `:265`、分离 `:283`、弹丸 `ProjectileSystem.ts:20`、反弹 `:93`、飞刃 `AttackSystem.ts:59`、近战 `MeleeSystem.ts:61`、飘字 `CombatSystem.ts:88,104` | 是 | 是 | 否 | 否 | 是（×1.8） | 必有键 |
| `defense` | 条件展开拷贝 `T.defense`（`:74`） | 无 | `CombatStats.ts:41` → `DamageSystem.typeMitigationFactor`（armor）；`StatSheets.ts:229`（shadow 只读） | 是（恒等） | 是 | **否** | **否** | **否** | **可选键**：配置未声明则实体无此属性 |
| `resistances` | 条件展开 + **浅拷贝** `{...T.resistances}`（`:75-77`） | 无 | `CombatStats.ts:46` → `typeMitigationFactor`（resistance） | 是（逐 key 恒等） | 是 | 否 | 否 | 否 | **可选键 + 映射形状**：`{ lightning: 0.3 }` / `{ fire: 0.4 }`；与配置**不共享引用** |
| `tough` | 条件展开（`:78`） | 无 | `CombatStats.ts:45` → `generalMitigationFactor` | 是 | 是 | 否 | 否 | 否 | 可选键（当前 5 类配置**均未声明**） |
| `globalDamageBonus` | 条件展开（`:79-81`） | 无 | `CombatStats.ts:47` → 攻击方乘区 | 是 | 是 | 否 | 否 | 否 | 可选键（当前均未声明） |
| `typeDamageBonus` | 条件展开 + 浅拷贝（`:82-84`） | 无 | `CombatStats.ts:48` → 攻击方乘区 | 是 | 是 | 否 | 否 | 否 | 可选键 + 映射形状（当前均未声明） |
| `formDamageBonus` | 条件展开 + 浅拷贝（`:85-87`） | 无 | `CombatStats.ts:49` | 是 | 是 | 否 | 否 | 否 | 可选键 + 映射形状（当前均未声明） |
| `skillDamageBonus` | 条件展开 + 浅拷贝（`:88-90`） | 无 | `CombatStats.ts:50-52` | 是 | 是 | 否 | 否 | 否 | 可选键 + 映射形状（当前均未声明） |

#### (b) 生成时固定元数据（F）

| 字段 | 初始来源 | 生成后写入者 | 读取者 | 备注 |
|---|---|---|---|---|
| `type` | `spawnEnemy` 参数或加权抽取（`:12-30`） | 无 | AI 分支 `EnemySystem.ts:143,183,185,218`、图鉴键 `CombatSystem.ts:159`、绘制 `draw.ts:154,183` | 字符串，5 值 |
| `spr` | `T.spr`（`:47`） | 无 | 绘制 `draw.ts:151-157`（含 `${spr}_elite`） | 精灵名 |
| `elite` | `!!elite`（`:56`） | 无 | 血条/粒子/音效 `CombatSystem.ts:250-262`、绘制、图鉴键、`killEnemy` 掉落分支、`xp` 读取分支 | boolean |
| `xp` | `elite ? 25 : T.xp`（`:55`） | 无 | **仅普通怪**：`killEnemy` 的 `e.xp * (luck 双倍)`（`CombatSystem.ts:193`）；精英走 `25 + (waveN-1)*ELITE_XP_STEP`（`:185`），**不读 `e.xp`** | 精英的 25 是「形状对齐值」，无消费点（保留不动） |
| `seed` | `Math.random()*10`（`:67`） | 无 | 确定性伪随机：`hash01(e.seed, waveN)` 掉宝箱 `CombatSystem.ts:208`；表现相位 `EnemySystem.ts:132,134,144-145,183,197-198` | 刻意**不重掷**，重掷会错开 RNG 序列 |
| `kx`/`ky` | **不写入**（无键） | `meleeSwing`（`MeleeSystem.ts:73-74`）、`applyKnockback`（`:133-134`） | `applyKnockback`（`:125-126`） | **必须可选**（v8 逐字段对照先例）；未击退时对象上不存在 |

#### (c) 动态运行状态（R）

| 字段 | 初始 | 生成后写入者 | 读取者 / 效果 | 形状 |
|---|---|---|---|---|
| `hp`（当前） | 生成时 = 派生值 | `hurtEnemy` `:80`；`applyFireDot`（`CombatSystem.ts:411`）；自爆 `EnemySystem.ts:251` | 死亡判定 `:138,146,169`、`AttackSystem.ts:91`；吸血/伤害统计；精英血条 | 必有键；可为负、可为浮点（DoT） |
| `flash` | `0` | `hurtEnemy` `=0.08`（`CombatSystem.ts:81`） | 绘制白闪 `draw.ts:176`；衰减 `EnemySystem.ts:125` | 必有键（不上屏时也可为负） |
| `orbCd` | `0` | 飞刃命中 `=0.35`（`AttackSystem.ts:61`） | 飞刃命中 gate `:56`；衰减 `EnemySystem.ts:126` | 必有键 |
| `slowT`/`slowF` | `0`/`0` | `hurtEnemy` 且 `player.slow>0`：`slowT=1.2`、`slowF=player.slow`（`CombatSystem.ts:93-96`） | 移动速度乘算 `EnemySystem.ts:184`；绘制 `draw.ts:161-167`；`slowT` 衰减 `:127`（**`slowF` 不衰减、不清零**——事实，见 §2.3） | 必有键 |
| `burnT` | `0` | `hurtEnemy` 燃烧：`=2`（`CombatSystem.ts:111`）；烈焰蔓延 `=2`（`:177`） | DoT 门控 `EnemySystem.ts:157`；衰减 `:158` | 必有键 |
| `burnDps` | `0` | `hurtEnemy`：`burnStackDps(player, stacks)`（`CombatSystem.ts:112`） | `applyBurnDot` 的 DPS 来源 `:430` | 必有键；**蔓延不写 `burnDps`**（事实：`CombatSystem.ts:176-177` 只写 `burnStacks`/`burnT`，被蔓延目标的 DoT 实际 DPS 沿用其自身旧值/0） |
| `burnStacks` | `0` | `hurtEnemy` `min(4, +1)`；蔓延 `min(4, e.burnStacks)`；到期清零 `EnemySystem.ts:174` | 灼热易伤判定 `CombatSystem.ts:63`；蔓延源 `:168`；`burnStackDps` 入参 | 必有键 |
| `frostStacks` | `0` | `hurtEnemy`（`frostLv>0` 且免疫窗结束）：`+1`，满 3 → 归 0（`CombatSystem.ts:98-107`） | 冰冻触发 | 必有键 |
| `frozenT` | `0` | 冰冻触发：`frostFreezeDuration(player)`（`:101`） | 定身门控 `EnemySystem.ts:178`（**`continue` 跳过 AI 移动、射手射击与接触伤害**）；衰减 `:179`；绘制 `draw.ts:170` | 必有键 |
| `frostImmuneT` | `0` | 冰冻触发：`2.5`（`:102`） | 免疫 gate `:98`；衰减 `:177`（`Math.max(0, …)`） | 必有键 |
| `shootCd` | `1 + Math.random()*1.5`（`:68`） | 射手开火后 `=2.2`（`:204`） | 射手开火 gate `:202-203`；衰减 `:202` | 必有键；**非射手也持有并无条件衰减**（`:126` 只有 `flash`/`orbCd`/`slowT` 全局衰减，`shootCd` 仅在射手分支衰减） |
| `fuse` | `0` | 自爆虫贴近 `=0.5`（`:224`）；倒计时 `-=dt`（`:228`） | 引爆分支 `:229-253`；绘制膨胀/预警圈 `draw.ts:154,183-205` | 必有键；`!e.fuse` 语义复用（0 与负数都为假 → 已引爆后不再进入逼近分支，但对象随即被 `killEnemy` 移除） |
| `noDrop` | `false` | 自爆 `=true` | 掉落分支 | 必有键 |
| `dead` | **不写入**（无键） | `killEnemy` `=true`（`CombatSystem.ts:154`） | 全仓 `if (e.dead) continue/return`、`nearestEnemy`、更新循环移除 `EnemySystem.ts:121-123` | **必须可选**（v8 对照先例） |
| `kx`/`ky` | 不写入 | 见 (b) | 击退位移 `applyKnockback` | **必须可选** |

#### (d) 不在实体上的相关状态（避免误判为敌人属性）

| 状态 | 位置 | 说明 |
|---|---|---|
| `EnemyBullet.dmg` / `.stats` | `ProjectileSystem.ts:117` | 发射时固化：`dmg: e.dmg`（`EnemySystem.ts:210`）+ `stats: getEnemyCombatStats(e)`（`:214`）——**攻击方快照，不是实体引用** |
| `dmgBy` / `waveStartDamage` | `GameCore.ts:122-154` | 伤害报表，与实体属性无关 |
| `killLog` | `GameCore.ts:181` | 图鉴观测旁路 |
| 波次/配额/生成节奏 | `WaveSystem.ts:74-107` | `quota`、`spawnCd`、`spawnedThisWave` 属 GameCore |

### 1.3 关键判定（回答任务书三问）

1. **是否存在可选字段的序列化形状约束？**
   【事实】存在，且是本项目最硬的红线：`parity.test.ts` 对波 1/3 做**整场逐字段** `toEqual`（`tests/parity.test.ts:462-510`），波 4/5/8 在测试内临时中性化甲/抗后同样逐字段对照（`:552-594`）。因此：
   - 配置未声明 `defense`/`resistances`/`tough`/三个增伤映射时，实体上**不得出现该键**；
   - `dead`、`kx`、`ky` 在未触发时**不得出现**；
   - 精英实体不得因精英标记获得额外甲/抗键。
2. **是否随波次/等级/精英/随机变化？**
   【事实】`hp`/`maxhp` 随波次、等级、精英；`dmg`/`speed`/`r` 随波次或精英（`dmg` 不随等级）；`speed` 有一次性抖动；甲/抗/`tough`/三增伤映射**全都不随**。
3. **`speed` 的归类**（任务书特别提醒）：
   【事实】`speed` 属**生成时形成的有效属性**：写入点唯一（`:52`），生成后无写入者；减速不改写它，而是在 AI 移动处 `spd = e.speed * (slowT>0 ? 1-slowF : 1)`（`:184`）实时乘算。
   【设计建议】D2 把 `speed` 视为「生成时解析一次、运行期只读」的属性（与 `maxhp` 同组），**不**把减速并入属性模型（并入会改变消费点语义与 RNG 无关的数值路径）。

---

## 2. 敌人生成公式与 RNG 顺序（D2 逐位对照基线）

### 2.1 完整生成流程（`spawnEnemy`，`EnemySystem.ts:7-92`）

```
① 类型选择（仅 forceType 为空时）
   unlocked = [k for k in ETYPES if waveN >= ETYPES[k].w0]   // 对象键顺序：slime,bat,brute,shooter,bomber
   total = Σ wt
   roll = Math.random() * total                                // RNG#1
   for k of unlocked: roll -= wt[k]; if (roll <= 0) { type = k; break }
   兜底 type = "slime"（roll 未命中时）
② 位置（1..5 次尝试）
   for tries in 0..4:
      a = Math.random() * 2π                                  // RNG，每次尝试 1 个
      sx = clamp(player.x + cos(a)*300, 30, WORLD.w-30)
      sy = clamp(player.y + sin(a)*300, 30, WORLD.h-30)
      if hypot(sx-player.x, sy-player.y) > 150: break          // 通过即停
③ 缩放常数（无 RNG）
   over     = max(0, waveN - 15)
   hpScale  = 1 + (waveN-1)*0.18 + over*over*0.06
   dmgScale = 1 + (waveN-1)*0.05 + over*over*0.012
   lvlPow   = 1.03 ** floor(player.lvl / 5)
④ 组装实体（字段字面量顺序 = 对象键顺序）
   hp = maxhp = T.hp * hpScale * lvlPow * (elite ? 8 : 1)       // 两处独立求值
   speed = T.speed * (elite ? 0.8 : 1) * (0.9 + Math.random()*0.2)  // RNG
   dmg   = T.dmg * dmgScale * (elite ? 1.5 : 1)
   r     = T.r * (elite ? 1.8 : 1)
   xp    = elite ? 25 : T.xp
   ...flash..frostImmuneT 全 0
   seed     = Math.random() * 10                                // RNG
   shootCd  = 1 + Math.random() * 1.5                            // RNG
   fuse = 0, noDrop = false
⑤ 条件展开（无 RNG，键存在性即语义）
   defense / resistances(浅拷贝) / tough / globalDamageBonus /
   typeDamageBonus(浅拷贝) / formDamageBonus(浅拷贝) / skillDamageBonus(浅拷贝)
   —— 仅在 EnemyConfig 同名键 !== undefined 时写入
```

### 2.2 `Math.random()` 调用点、次数与顺序【事实】

| 位置 | 次数 | 条件 | 顺序约束 |
|---|---|---|---|
| ① 类型加权抽取 | 1 | 仅 `forceType` 为空 | 必须是**第一个**消耗 |
| ② 位置尝试 | **1..5** | 每次尝试 1 个；成功后立即停止，5 次全失败则用第 5 次结果 | 类型之后、速度之前 |
| ④ 速度抖动 `0.9+r*0.2` | 1 | 每次生成 | 位置之后 |
| ④ `seed` | 1 | 每次生成 | 速度之后 |
| ④ `shootCd` | 1 | 每次生成 | `seed` 之后 |
| ⑤ 条件展开 | **0** | — | 不得引入随机（否则分叉 parity） |

**实测调用总数**（`Math.random` 计数探针；强制类型与自然抽取**分列**，下标与下文映射表一致）：

| 路径 | 位置尝试次数 n | 总调用 | 构成 |
|---|---|---|---|
| 强制类型（`forceType`）| 1（首次即 >150px） | **4** | 1 位置 + 速度 + `seed` + `shootCd` |
| 强制类型（`forceType`）| 2 | **5** | 2 位置 + 3 |
| 强制类型（`forceType`）| 5（全部失败） | **8** | 5 位置 + 3 |
| 自然抽取（无 `forceType`）| 1 | **5** | 1 类型 + 1 位置 + 3 |
| 自然抽取（无 `forceType`）| 2 | **6** | 1 类型 + 2 位置 + 3 |
| 自然抽取（无 `forceType`）| 5（全部失败） | **9** | 1 类型 + 5 位置 + 3（最终接受第 5 次位置，可能 <150px） |

**值 → 消费点映射（顺序固定，测试必须按此构造序列）**：

设位置尝试次数为 **n（1 ≤ n ≤ 5）**：

| 路径 | 第 1 个随机值 | 位置值的下标区间 | 位置之后的 3 个值 |
|---|---|---|---|
| 强制类型（`forceType` 非空） | 位置角度 `a = r·2π`（即**第 1 次尝试**） | **第 1..n 个值**（第 k 次尝试 ← 第 k 个值；n=1 时只占第 1 个） | 速度抖动 `0.9+r·0.2` → `seed=r·10` → `shootCd=1+r·1.5` |
| 自然抽取（`forceType` 为空） | 类型加权 `roll = r·total` | **第 2..(n+1) 个值**（第 k 次尝试 ← 第 k+1 个值） | 同上 |

> 易错点（v0.1 曾错在此）：**强制类型路径没有类型随机**，序列第一个值即位置角度；自然抽取路径第一个值是类型加权。两者用同一序列会产生完全不同的实体——验收矩阵必须分别固定（§8.3 D2-08 / D2-08b / D2-09 / D2-09c）。
>
> 实测互证（调用次数与上两表一致；「首试通过」与「首试失败」分别取自默认位置与角落）：
> - **角落 `(30,30)` + `r=0.6`**：强制类型 `[0.6]` → 首试失败、继续消耗（需补一个通过值才停）；`[0.6, 0.125]` → **5** 次、落点 `(242.13203435596427, 242.13203435596424)`；`[0.6]×5` → **8** 次。
> - **角落 + `r=0.125`（第三象限外）**：强制类型 `[0.125]` → 首试即通过、**4** 次、落点同上（§8.3 D2-09c）。
> - **默认位置 `(696,520)`**：中心远离世界边界，`696±300 ∈ [396,996]`、`520±300 ∈ [220,820]` 均在 `[30,1262]/[30,1010]` 内 → **不发生 clamp**，任意角度都是 300px > 150 → 强制类型 `[0.6]` → **4** 次（落点 `(453.2949016875158, 343.6644243122581)`）；自然抽取 `[0.625, 0.6]` → **5** 次。
> - **自然抽取在角落**：`[0.625, 0.125]` → **5** 次；`[0.625, 0.6, 0.125]` → **6** 次；`[0.625, 0.6×5] + 3` → **9** 次。

**波次节流路径**（`WaveSystem.ts:74-95`）：`spawnCd = max(0.35, 1.2 - waveN*0.07)`；`enemies.length < 160` 才生成；精英配额 `waveN>=20 ? 3 : waveN>=12 ? 2 : waveN%4===0 ? 1 : 0`，`isElite = spawnedThisWave < eliteQuota`，精英固定 `spawnEnemy("brute", true)`（**无类型 RNG**），普通怪 `batch = waveN>=5 ? 2 : 1`。

### 2.3 逐位基线表

**缩放常数**（实算，`hpScale`/`dmgScale` 为 IEEE 结果，不是十进制近似）：

| wave | over | hpScale | dmgScale |
|---|---|---|---|
| 1 | 0 | 1 | 1 |
| 3 | 0 | 1.3599999999999999 | 1.1 |
| 4 | 0 | 1.54 | 1.15 |
| 5 | 0 | 1.72 | 1.2 |
| 8 | 0 | 2.26 | 1.35 |
| 15 | 0 | 3.52 | 1.7000000000000002 |
| 16 | 1 | 3.76 | 1.762 |

**`lvlPow` 阈值**（`floor(lvl/5)`）：

| lvl | 1–4 | 5–9 | 10–14 | 15–19 | 20–24 |
|---|---|---|---|---|---|
| lvlPow | 1 | 1.03 | 1.0609 | 1.092727 | 1.1255088100000001 |

**普通怪 hp / dmg**（`lvlPow=1`，即 lvl 1–4）：

| type | base hp | base dmg | wave 1 | wave 3 | wave 4 | wave 5 | wave 8 | wave 15 | wave 16 |
|---|---|---|---|---|---|---|---|---|---|
| slime | 14 | 8 | 14 / 8 | 19.04 / 8.8 | 21.560000000000002 / 9.2 | 24.08 / 9.6 | 31.639999999999997 / 10.8 | 49.28 / 13.600000000000001 | 52.64 / 14.096 |
| bat | 9 | 6 | 9 / 6 | 12.239999999999998 / 6.6000000000000005 | 13.86 / 6.8999999999999995 | 15.48 / 7.199999999999999 | 20.339999999999996 / 8.100000000000001 | 31.68 / 10.200000000000001 | 33.839999999999996 / 10.572 |
| brute | 65 | 15 | 65 / 15 | 88.39999999999999 / 16.5 | 100.10000000000001 / 17.25 | 111.8 / 18 | 146.89999999999998 / 20.25 | 228.8 / 25.500000000000004 | 244.39999999999998 / 26.43 |
| shooter | 16 | 10 | 16 / 10 | 21.759999999999998 / 11 | 24.64 / 11.5 | 27.52 / 12 | 36.16 / 13.5 | 56.32 / 17 | 60.16 / 17.62 |
| bomber | 12 | 16 | 12 / 16 | 16.32 / 17.6 | 18.48 / 18.4 | 20.64 / 19.2 | 27.119999999999997 / 21.6 | 42.24 / 27.200000000000003 | 45.12 / 28.192 |

**精英变换**（在普通值之上，`elite=true`）：

| 字段 | 变换 | 逐位关系 |
|---|---|---|
| `hp`/`maxhp` | `×8` | **精确 8 倍**（2 的幂，无舍入）：如 wave 16 brute = `244.39999999999998 × 8 = 1955.1999999999998` |
| `dmg` | `×1.5` | 单次乘法：如 wave 16 brute = `26.43 × 1.5 = 39.644999999999996` |
| `speed` | `×0.8` **后**再乘抖动 | **≠ 普通 speed ×0.8 的逐位结果**（结合律）：`T.speed=30`、抖动 `0.95` → `(30×0.8)×0.95 = 22.799999999999997`，而 `30×(0.8×0.95) = 22.8`（实测 5 类速度 × 20 万随机抖动：约 **32%** 样本不逐位相等） |
| `r` | `×1.8` | `brute: 7 → 12.6`、`bat: 3 → 5.4` |
| `xp`（字段） | 固定 `25` | 无消费点（精英经验由 `killEnemy` 另算） |
| 甲/抗/`tough`/三增伤 | **不变** | 与普通怪完全相同 |

**精英 + 等级**示例（brute，wave 1，`hpScale=1`，抖动固定 0.5 → speed 16；实测值，无省略号）：

| lvl | `lvlPow` | 普通 hp | 精英 hp | 精英 dmg |
|---|---|---|---|---|
| 1–4 | 1 | 65 | **520** | 22.5 |
| 5–9 | 1.03 | 66.95 | **535.6** | 22.5 |
| 10–14 | 1.0609 | 68.9585 | **551.668** | 22.5 |
| 15–19 | 1.092727 | 71.027255 | **568.21804** | 22.5 |
| 20–24 | 1.1255088100000001 | 73.15807265000001 | **585.2645812000001** | 22.5 |
| 25–29 | 1.1592740743 | 75.3528148295 | **602.822518636** | 22.5 |

> 结论：**等级只放大 HP，不放大伤害**——这是既有平衡事实，D2 不得「顺手补齐」。

### 2.4 有效属性消费（甲/抗/通用减伤）【事实】

`DamageSystem` 的减伤策略（`data/damageTypes.ts`）：`physical → armor`、`fire/lightning → resistance`、`true → none`。

| 防御属性 | 生效公式 | 当前敌人取值 | 示例结果 |
|---|---|---|---|
| `defense` | `armorK/(armorK+max(0,DEF))`，`armorK=50` | brute 30 | 物理 11 → `11×50/80 = 6.875` → `round-min-one` = **7**；火/雷/真实 11 → **11** |
| `resistances` | `1 - clamp(res, 0, 0.75)` | shooter `{lightning:0.3}`、bomber `{fire:0.4}` | shooter 雷 10 → **7**、物理 10 → **10**；bomber 火 10 → **6**、真实 10 → **10** |
| `tough` | `1 - clamp(tough, 0, 0.6)`，`true` 无视 | 5 类配置均未声明 | 恒 1 |

### 2.5 浮点关联顺序：D2 的硬约束【事实 + 实测】

当前 hp 表达式是**左结合四连乘**：`((T.hp * hpScale) * lvlPow) * eliteMul`。若改成「先算缩放组合再乘」会改变末位：

| wave | `65*hpScale*lvlPow*8`（现实现，lvlPow=1.0609） | `65*(hpScale*lvlPow*8)`（分组式） | `Object.is` |
|---|---|---|---|
| 3 | 750.2684799999998 | 750.26848 | **false** |
| 4 | 849.56872 | 849.56872 | true |
| 5 | 948.8689599999999 | 948.8689599999999 | true |
| 8 | 1246.7696799999997 | 1246.7696799999999 | **false** |
| 15 | 1941.87136 | 1941.8713599999999 | **false** |
| 16 | 2074.27168 | 2074.27168 | true |

**因此 D2 必须**：把「波次」「等级」「精英」表示为**三条按原顺序相乘的 final 修饰符**（base 起始、逐个左乘），而**不能**用 percent 区（`1+(hpScale-1)` 会引入额外舍入）或先聚合再乘。

---

## 3. D1 敌人防御属性权威迁移设计（只设计，不切换）

### 3.1 目标链路

```
data/enemies.ts (EnemyConfig)
      │  ← 权威来源声明（新增纯数据/纯函数，无 RNG、无实体依赖）
      ▼
core/StatModel.resolveStats        （既有纯解析：flat 逐次累加 → percent → final 连乘）
      │
      ▼
core/EnemySystem.spawnEnemy        （唯一写入点：仍只写既有字段，键存在性不变）
      │
      ▼
core/CombatStats.getEnemyCombatStats  → CombatStatsSnapshot（每次按需构造，映射浅拷贝）
```

### 3.2 D1 属性范围（**已批准 Q5**：防御侧三项，攻击侧四增伤推后）

`EnemyConfig` 有 7 个可选战斗字段，**按「在伤害管线中的站位」切分批次**，不在 D1 一次全切：

| 字段 | 站位 | 归属批次 | 理由 |
|---|---|---|---|
| `defense` | 防御侧（受击方减伤） | **D1** | 与 `resistances`/`tough` 同属 `getEnemyCombatStats` 的防守面，同一段条件展开、同一组三方对照 |
| `resistances` | 防御侧（受击方减伤，类型化映射） | **D1** | 当前唯一带真实数值的映射；必须验证「通用 key 解析 + 不硬编码类型」 |
| `tough` | 防御侧（受击方通用减伤） | **D1** | 当前 5 类配置均未声明 → 迁移后仍无键、零数值差异；与 DEF/RES 同段代码，分两批切会留下「半套写法」 |
| `globalDamageBonus` | **攻击侧**（增伤乘区） | **D2**（随 dmg/attack 一起） | 与 `attack` 同属攻击方快照，必须与「不得双重计入」一起设计（§4.3） |
| `typeDamageBonus` | 攻击侧（类型化增伤） | **D2** | 同上 |
| `formDamageBonus` | 攻击侧（类型化增伤） | **D2** | 同上 |
| `skillDamageBonus` | 攻击侧（按 skillId 查找） | **D2** | 同上 |

> 一致性声明（v1.0 冻结）：**§3.6 接口只声明 `defense`/`resistances`/`tough`；§8.2 矩阵只验收这三项；§10.1 文件表 D1 不含四个攻击侧映射**。四类增伤在 D1 期间**保持现有条件展开原样拷贝**，仅由 D1-16 钉住「未被改动」；其来源解析接口须在 D2 前单独审查（§10.6 注意事项 1）。

### 3.3 权威值、映射族与形状

| 配置键 | 权威表示【设计建议】 | 结果 | 形状约束 |
|---|---|---|---|
| `defense: 30` | `base.defense = 30`，零修饰符 | `30` | 实体写入 `defense`（键存在） |
| `resistances: {lightning: 0.3}` | `resolveKeyedMap("resistance", {lightning:0.3}, [])` | `{lightning:0.3}` | 实体写入 `resistances`（**新对象**，不与配置共享引用） |
| `resistances: {fire: 0.4}` | 同上 | `{fire:0.4}` | 同上 |
| `tough: 0.2`（当前无配置声明） | `base.tough = 0.2` | `0.2` | 声明才写键；未声明**无键** |
| 未声明 | 不构造键 | — | 实体**无该键**；`getEnemyCombatStats` 兜底 `?? 0` / `{...undefined} = {}` |

**Base 而非 flat 的理由【设计建议】**：`resolveStats` 要求 `base ≥ 0` 且 `base` 就是数值本身；把配置值放 `base` 使「解析结果 ≡ 配置值」在数值上**逐位恒等**（无任何加减乘参与），完全满足 D1「零数值变化」。若放 flat（`base 0 + flat 30`），数学上仍为 30，但把「配置值」和「加成」混成同一语义，后续如果出现「精英甲 +X」会与配置值无法区分来源。

**类型化 key 解析（不变式）**：抗性映射继续走 `KEYED_STAT_FAMILIES`（`resistance`）+ `resolveKeyedMap`，**不把 `fire`/`lightning`/`physical` 硬编码成新 `StatId`**（`StatModel.ts:73-83` 评审定基线）；D2 的 `typeDamageBonus` 沿用同一族机制（`typeDamageBonus` 族），不新增键名分支。

**可选字段不物化（不变式）**：解析器返回 `Partial`，写作层**只对「配置声明过」的键写入**——不得为了「结构统一」先写 `defense: 0`、`tough: 0` 或 `resistances: {}`（会立刻打红 parity 波 1/3 的 slime/bat）。

**精英不改变甲/抗/tough（不变式）**：权威来源**不接受 `elite` 入参**（签名层面禁止），防止未来有人「顺手」加精英防御加成。

**拷贝语义精确表述（v0.2 修订）**：现有实现是 `{ ...T.resistances }` 的**单层浅拷贝**。因当前映射的**值类型全部是 `number`（基本类型）**，浅拷贝即可实现「键集合与数值都完全隔离、改实体不影响配置、改配置不影响已生成实体」（实测：`e.resistances === ETYPES.bomber.resistances` 为 `false`，改 `e.resistances.fire = 0.9` 后配置仍为 `0.4`）。**它不递归**——若未来映射的值变为对象/数组（当前不存在），浅拷贝将不足，须重新评估并升级为深拷贝；D1 不得以「浅拷贝够了」为由拒绝这一前提条件。

### 3.4 发射时快照必须独立（既有不变式，D1 必须保持）

- 射手发射（`EnemySystem.ts:205-215`）：`dmg: e.dmg` + `stats: getEnemyCombatStats(e)`，**发射瞬间构造**。
- 自爆引爆（`:232-236`）：`damagePlayer(e.dmg, { attackerStats: getEnemyCombatStats(e) })`，**引爆瞬间构造**。
- 接触伤害（`:267-272`）：**不传 `attackerStats`** → `damagePlayer` 内部 `getEnemyCombatStats(opts.src)` 逐帧读取实体（`CombatSystem.ts:333`）。
- 反弹弹幕（`ProjectileSystem.ts:97-101`）：伤害归玩家侧 `hurtEnemy`，`attackerStats` 未传 → 命中时读当前玩家；**敌方快照不参与**。
- `getEnemyCombatStats` 对每个映射 `{...}` 浅拷贝（`CombatStats.ts:46-52`），因此实体侧后续原地改映射不会渗入快照（已有测试 `combat-stats.test.ts:174-206`）。

**D1 设计约束**：若来源解析引入「每次调用重算」，`getEnemyCombatStats` 将成为热路径（每次伤害结算、每帧接触）。因此 D1 **只允许在生成时解析一次并写回实体**，`getEnemyCombatStats` 保持「读字段 + 浅拷贝」不变。

### 3.5 三方对照方法（防止「同一实现包装两次」的假对照）

| 侧 | 来源 | 实现关系 | 作用 |
|---|---|---|---|
| **A 权威解析** | `EnemyConfig` → 生产来源声明 → `resolveStats` | 生产路径 | 被验证对象 |
| **B 独立期望** | **测试内的字面量常量表**（本文 §2/§3 冻结值，如 brute `defense=30`、shooter `{lightning:0.3}`），**不 import 生产来源表**，也不复算 | 与被测实现**零共享代码** | 真正的对照基准 |
| **C 生成实体** | 真实 `spawnEnemy(kind[, elite])` 后的实体字段 | 由 A 写入 | 端到端校验键存在性 + 数值 + 快照 |

判定规则：
1. `A === B`（逐位，`Object.is`）——来源声明未漂移；
2. `C === B`（逐位）——写入/拷贝未漂移；
3. `getEnemyCombatStats(C) === B`（标量 `toBe`、映射 `toEqual`）——适配层未漂移；
4. **形状**：`"defense" in e` / `"resistances" in e` 与配置声明严格一致；`Object.keys(e)` 与冻结键清单逐项相同；
5. **隔离**：原地修改 `e.resistances` 不得影响 `ETYPES[k].resistances`，也不得影响已构造快照。

> 三方不得共用「同一张期望值表」：B 必须是本文冻结的**字面量**；A/C 若同时引用同一常量表，对照即失效（S4-B 已用「来源 A / 来源 B 独立推导」实现过同类纪律，见 `StatSheets.ts:9-23`）。

### 3.6 最小接口设计（D1 才创建，D0 不建文件）

```ts
// core/EnemyStatSources.ts（候选，纯函数、无 RNG、不 import GameCore/DOM/Phaser）
import type { EnemyConfig } from "./types";
import type { StatSheet } from "./StatModel";

/** 生成时一次性解析的防御属性（只含配置声明过的键） */
export interface EnemyDefenseStats {
  readonly defense?: number;
  readonly resistances?: Readonly<Record<string, number>>; // 键来自配置，类型不硬编码
  readonly tough?: number;
}

export function enemyDefenseSheet(cfg: EnemyConfig): StatSheet;   // 供 resolveStats / shadow 共用
export function resolveEnemyDefense(cfg: EnemyConfig): EnemyDefenseStats; // 唯一权威出口
```

**范围（v0.2 定案）**：接口只含 `defense`/`resistances`/`tough` 三项；四个攻击侧增伤映射（`globalDamageBonus`/`typeDamageBonus`/`formDamageBonus`/`skillDamageBonus`）**不在本接口**，归 §4 D2 的攻击侧解析，届时以独立接口（如 `enemyAttackModifierStats(cfg)`）出现，避免「防御接口偷偷承载攻击字段」。

**D1 同步调整项（评审须确认）**：`core/StatSheets.ts` 的 `EnemyShadowStats` 目前只有 `defense` + `resistances`。因 D1 权威范围含 `tough`，**shadow 对照侧必须同步加入 `tough`**（该模块不在运行时代码路径，`docs/pixel-rogue-S4-implementation-brief.md` §2 已声明未接入），否则 §3.5 的 A/B/C 三方对照覆盖范围与权威范围不一致。

**不得**在该模块内出现：`elite` 参数、`waveN`、`player.lvl`、`Math.random()`、对实体的写操作。
**不得**在 D1 改动：`spawnEnemy` 的 RNG 顺序/次数、`getEnemyCombatStats` 的签名与默认值语义、`EnemyConfig` 的字段集。

---

## 4. D2 敌人生命与伤害迁移设计（只设计，不切换）

### 4.1 边界定义

| 概念 | 归属 | 规则 |
|---|---|---|
| **初始 maxhp** | 生成时派生属性 | `T.hp × hpScale × lvlPow × elite8`，生成时解析一次、之后只读 |
| **当前 hp** | 运行状态 | 生成时置为初始 maxhp；此后只由伤害/自爆写；**任何属性解析都不得写 `hp`** |
| **初始 dmg** | 生成时派生属性 | `T.dmg × dmgScale × elite1.5`（**无 lvlPow**），之后只读 |
| **speed / r** | 生成时派生属性 | 含抖动/精英倍率，之后只读 |
| **甲/抗/tough** | 生成时固定（**D1 权威**，Q5） | 不随波次/等级/精英 |
| **四类增伤映射** | 生成时固定（**D2 权威**，Q5） | 当前 5 类配置均未声明 → 实体无键；不随波次/等级/精英 |

### 4.2 已受伤敌人不因属性解析重新满血

【事实】敌人**没有** `recompute()` 类入口：全仓搜不到对 `Enemy` 的 `Object.assign`、按 picks 重放或属性投影；`GameCore.resetGame` 只清空数组（`GameCore.ts:238`）。

【设计约束】D2 **不得**新增「每帧/每次受伤重算敌人属性」的路径。若为 D1/D2 引入投影函数，其调用点**只允许** `spawnEnemy` 内部一处，并必须满足：

- 投影函数**没有 `hp` 参数、不写 `hp`**（签名层禁止）；
- `maxhp` 只在生成时写，且写入后不再被读取为「可覆盖值」；
- 任何「重建属性」需求（例如未来 BOSS 阶段变化）必须先单独立项批准，而不是随 D2 落地。

### 4.3 伤害基线不得与 `globalDamageBonus` 双重计入

【事实】当前链路：`e.dmg` → `CombatStats.attack` → `DamageRequest.rawAmount`（技能系数已在 `dmg` 内）→ `calculateDamage` 乘 `(1+global)/(1+type)/(1+form)/(1+skill)`。`attack` 字段在 S1 契约里**明确不参与计算**（`types.ts:37-38`「S1 计算不消费：rawAmount 已含技能系数，禁止再叠 ATK」）。

【设计约束】D2 若把 `dmg` 经 StatModel 解析：
- **不得**把 `dmg` 同时写成 `attack` 之外的乘区来源；
- 若未来给敌人加 `globalDamageBonus`（当前 5 类配置均无），它只能作为**独立的攻击方乘区**，绝不能再乘一次 `attack`；
- 可执行钉子：`getEnemyCombatStats(e).attack === e.dmg`（逐位），且 `e.dmg` 与「解析输出的 attack」逐位一致。

### 4.4 攻击者快照时间点不变（逐入口冻结）

| 入口 | 快照时机 | 冻结要求 |
|---|---|---|
| 射手弹丸 | 发射瞬间（`EnemySystem.ts:214`） | 命中前实体死亡/属性改动不回溯 |
| 自爆虫引爆 | 引爆瞬间（`:235`） | 同上 |
| 接触伤害 | 命中帧读实体（`:272` → `CombatSystem.ts:333`） | 保持「实时读取」，不得改为生成时快照 |
| 玩家弹丸 / 反弹 / DoT / 陨星 / 近战 / 飞刃 | 玩家侧快照或当前玩家（S3/S4-C 已冻结） | D2 零改动 |

### 4.5 不引入新成长与平衡系数

【设计约束】D2 的 modifier 值**只能是现有公式的等价分解**：`hpScale`、`lvlPow`、`elite8` / `dmgScale`、`elite1.5`。不得新增 `wave^2` 之外的项、不得给 `dmg` 补 `lvlPow`、不得改 `armorK`/`resistanceCap`/`toughCap`、不得改 `spawnCd`/配额/上限 160。

### 4.6 final 顺序恒等（D2 的核心技术条件）

【事实 + 实测】现实现是左结合连乘（§2.5）。`resolveStats` 的 final 区正是「按修饰符数组顺序逐个左乘」，因此**等价构造**为：

```
hp  : base.maxHp = T.hp        finals = [hpScale(wave), lvlPow(level), elite8]   // 该顺序
dmg : base.attack = T.dmg      finals = [dmgScale(wave), elite1.5]
speed: base.moveSpeed = T.speed finals = [elite0.8, jitter]                      // 该顺序
```

要求：
- **禁止 percent 区**（`1+(hpScale-1)` 会多一次舍入）；
- **禁止预聚合**（`hpScale*lvlPow*elite` 作为一个 final 会改变结合顺序，§2.5 已有 3 个波次反例）；
- 非精英也要按「×1」处理或直接省略该条——`×1` 精确无舍入，二者逐位等价，但**省略时必须保证数组顺序仍等价**；
- `lvlPow` 的值必须等于 `Math.pow(1.03, Math.floor(lvl/5))` 的实算结果（§2.3 表）；实现保持单一写法，不在同仓并存两种指数写法，以免后续「等价改写」引入审查歧义。

### 4.7 随机抖动必须由调用方抽取

【设计约束】解析函数**签名接受 `speedJitter: number`**（值域 `[0.9, 1.1)`），**不得在解析函数内部调用 `Math.random()`**：否则调用顺序/次数会从「位置之后、seed 之前」漂移到「解析时」，直接破坏 §2.2 的 RNG 序列与 parity。

### 4.8 最小接口设计（D2 才创建，D0 不建文件）

```ts
// core/EnemyStatSources.ts（D1 文件的增量，不新建第二套）
export interface EnemySpawnContext {
  readonly wave: number;
  readonly playerLevel: number;
  readonly elite: boolean;
  readonly speedJitter: number; // 已由 spawnEnemy 按原顺序抽取（[0.9, 1.1)）
}
// 说明（v0.2 修订）：不接收 maxHp/hp。初始 maxhp 由本函数产出，当前 hp 在 spawnEnemy
// 内以 `hp = maxhp` 赋值——把 maxHp 当输入会形成「输入即输出」的循环，
// 并诱导调用方把受伤实体的 hp 传进来（§4.2 明确禁止）。
export interface EnemySpawnStats {
  readonly maxHp: number;
  readonly attack: number;
  readonly moveSpeed: number;
  readonly radius: number;      // 如需入模型；否则保持 T.r × elite1.8 原式
  readonly xp: number;
}
export function resolveEnemySpawnStats(
  cfg: EnemyConfig,
  ctx: EnemySpawnContext,
): EnemySpawnStats;
```

**不提前创建生产模块**（任务书 §五）。`r`/`xp` **不纳入模型**（**已批准 Q4**）：`radius`/`xp` 字段在 `EnemySpawnStats` 中仅为**占位记录**，D2 实施时**不得**把它们描述为「已迁移的权威属性」，也**不得**改变 `T.r × (elite?1.8:1)`、`elite ? 25 : T.xp` 的原式（见 §10.6 注意事项 2）。

**性能取向**：生成时一次解析（每次生成 1 次 `resolveStats` 调用，含 1–3 条修饰符），**不进入 60Hz 热路径**。当前热点是敌人双循环分离（160 敌人 → 12720 对）与弹丸遍历（`tests/browser/performance.spec.ts:55-56` 记录），D2 不得在那里增加任何解析。

---

## 5. D3 RuntimeState 隔离设计（只设计，不实施）

### 5.1 先验证 C3-C 玩家侧 15 字段保护的充分性【事实】

`RuntimeStateProtection.ts` 现覆盖：`shield`、`shieldCd`、`haste`、`hasteT`、`rageT`、`dashT`、`dashCharges`、`dashRe`、`meteorT`、`tempShield`、`ndUsed`、`orbA`、`hurtCd`、`dx`、`dy`。

充分性核对（对照 `data/stats.ts` 的 `statBase()` 全字段）：

| statBase 字段 | 是否运行状态 | 现状 | 结论 |
|---|---|---|---|
| `hp` | 是（资源） | 不入白名单，由 recompute 末尾 `max(1,min(hpBefore,maxhp))` 承接 | **充分**（D-C3-05 冻结语义） |
| `fireCd` | 是（冷却） | 不在 `statBase` → 天然幸存 | **充分**（不需入白名单） |
| `slow` | 名义运行态 | 全仓无玩家侧写入者（恒 0） | 充分；列为观察项，不处理 |
| 上述 15 字段 | 是 | 捕获→回写→上限协调 | **充分且已被 22 项 G 用例与 12 组变异验证**（`tests/s4c-c3c-runtime.test.ts`、`migration.md` D-31） |

**结论：不重写玩家系统。** C3-C 的保护是「recompute 会重置字段」这一真实缺陷的针对性修复；敌人侧没有这个缺陷（§5.2），把机制泛化到敌人属**虚构需求**（任务书 §七 明确禁止）。

### 5.2 敌人侧所有权结论与「重算路径」取证【事实】

| 检查项 | 结果 |
|---|---|
| 是否存在 `Object.assign(enemy, …)` / 属性重建 | **无**（`src/` 全仓无匹配） |
| 是否存在按 picks/来源表投影到敌人 | **无**（`TalentStatSources` 只写 `Player`） |
| 是否存在每帧重设 `maxhp`/`dmg`/`speed`/甲抗 | **无**（写入点仅 `spawnEnemy` 一处） |
| 是否存在「读改写」`hp` 之外的重置（如换波） | **无**（`startNextWave` 只碰 `Player` 与 GameCore 波次字段） |
| 唯一会「覆盖」敌人字段的代码位置 | **测试与夹具**：`tests/helpers.ts:38`（`e.speed=0`）、`parity.test.ts:552-573`（临时删配置键）、`performance.spec.ts:19-20`（`hp=maxhp=1e12`）、`game.spec.ts:131-135`（玩家侧） |

**结论**：敌人属性与运行状态的边界是**「生成时写一次」vs「生成后只读/只演化」**；不需要快照-恢复系统，也不需要 D3 改任何生产文件。D3 的实质工作是**把这条边界变成可执行断言**（§8 矩阵）。

### 5.3 必须保留的 Enemy 公开 API 与形状

- 字段名与可枚举键集合：与 §1.2 完全一致；`dead`/`kx`/`ky` 保持可选；可选战斗属性保持「配置声明才存在」。
- `Enemy` 类型不得新增必填字段；如需标注分层，只能用**类型别名/只读视图**（如 `type EnemySpawnStats = Pick<Enemy, "maxhp"|"dmg"|"speed"|"r">`），**不得**在实体上挂 `e.stats` 侧车（会破 parity）。
- `getEnemyCombatStats(e?: Enemy)` 的签名、默认值（`defense ?? 0`、`{...undefined}`）与「每次构造新快照」的语义不变。
- `spawnEnemy(forceType?, elite?)` 签名不变；**不得**把投影对象作为新参数暴露（会诱使调用方共享可变对象）。

### 5.4 最小改造建议（如评审要求落地时才做）

| 候选 | 内容 | 是否必需 | 风险 |
|---|---|---|---|
| G-1 生成期守卫（dev-only） | `spawnEnemy` 末尾断言：`hp === maxhp`、无 `dead`/`kx`/`ky` 键、可选键 ⊆ 配置键 | 否（测试已可覆盖） | 生产分支不得引入 `import.meta.env.DEV` 之外的条件；e2e 桥已受限（`GameScene.ts:127`） |
| G-2 只读投影视图 | `enemySpawnStats(e): Readonly<Pick<Enemy,…>>` | 否 | 易被误用为「重算入口」 |
| G-3 契约注释块 | 在 `EnemySystem.ts` 头注写明「生成时写一次」边界与 RNG 顺序 | **建议**（零行为风险） | 无 |

**不采纳**：为敌人建 `capture/restore`、把 15 字段白名单扩展到敌人、一次性重写 `Enemy`/`Player`/`Simulation`（任务书 §七 明确禁止）。

---

## 6. 负区因子政策（v1.0 已批准）

> **D0 不实施任何负区因子行为变更，也不修改现有负区因子回归测试**（`tests/stat-model.test.ts:147-168` 原样保留）。
> 下表「批准结论」列的 Q1～Q3 已于 2026-10-26 由用户批准并冻结（§10.2）；P-1/P-5/P-6 为**维持现状**项，不构成新行为。

| # | 层 | 现状【事实】 | 政策【已批准 / 维持现状】 | 批准结论 |
|---|---|---|---|---|
| P-1 | `StatModel` 数学层 | `base ≥ 0` 校验；flat 任意有限（可为负）；percent 每项 `> -1`，多项合计可 `< -1` → **负区因子允许**（已钉测试）；final `> 0`；溢出抛 `RangeError` | **维持现状，不在底层静默 clamp** | 无需批准（保持现状） |
| P-2 | `defense`（新权威来源） | `DamageSystem` 对负值 `Math.max(0,DEF)` → 等价于「无护甲」；`StatModel.base` 不接受负值 | 来源产出负值 → **权威边界显式拒绝（`RangeError`）**，快速失败；理由：负护甲只可能来自配置错误，静默变 0 会把错误变成隐形强度 | **已批准 Q1**：显式拒绝 |
| P-3 | `tough` | `DamageSystem` `clamp(0,0.6)` | 负值在边界拒绝（Q1）；超上限**不在来源裁剪**（Q2），保留消费点夹紧 | **已批准 Q1 + Q2** |
| P-4 | `resistances` | `1 - clamp(res,0,0.75)`；负值等价 0、>0.75 截断 | 负值边界拒绝（Q1）；`>0.75` **不在来源裁剪**（Q2），保持消费点唯一夹紧位置，避免 UI 与未来读取者语义分叉 | **已批准 Q1 + Q2** |
| P-5 | 攻击增伤乘区 | `DamageSystem.requireZone`：每区有限且 `≥ -1`；`< -1` 抛 `RangeError`；`-1` 合法（结算 0，不保活 1） | 来源侧**不重复校验**、不裁剪，尊重管线既有校验（单一真相） | 无需批准（沿用现状） |
| P-6 | 非有限值与溢出 | `StatModel`：输入非有限 `TypeError`、聚合溢出 `RangeError`；`DamageSystem`：非有限 `RangeError` | **原样保留**；D1/D2 不得吞异常、不得 fallback 默认值 | 无需批准（红线） |
| P-7 | 未来减益来源（易伤/破甲） | 当前无 | 任何**可观察行为变化**（例如抗性可被减为负 → 伤害放大）必须先单独立项审批；本批不设计 | **已批准 Q3**：另行审批 |

---

## 7. 行为不变项与批准差异表

### 7.1 必须逐位不变（D1/D2/D3 全阶段）

| # | 不变项 | 保障手段 |
|---|---|---|
| I-1 | 生成公式与 IEEE 关联顺序（§2.5） | 逐波逐字段 `toBe` 冻结（D2 矩阵） |
| I-2 | RNG 调用次数与顺序（§2.2：4/5/6/9） | `vi.spyOn(Math,'random')` 计数 + 序列回放 |
| I-3 | 精英 HP×8 / DMG×1.5 / SPEED×0.8 / R×1.8 | 逐字段 `toBe` |
| I-4 | `lvlPow` 只作用于 HP（不作用于 dmg/speed/r/甲抗） | 等级阈值前后对照 |
| I-5 | 甲/抗不随波次/等级/精英 | 5 类 × 7 波 × 普通/精英 矩阵 |
| I-6 | 可选键存在性（slime/bat 无甲抗；brute 仅 `defense`；shooter 仅 `lightning`；bomber 仅 `fire`；**5 类均无 `tough` 与四类增伤键**） | `"key" in e` + `Object.keys` 全等（D1-01～D1-04、D1-15、D1-16、D3-01） |
| I-7 | 映射浅拷贝隔离（当前映射值均为 `number`；实体、配置和快照之间的映射对象引用独立，修改任一映射的数值不渗透至其他对象） | 原地改写不渗透 |
| I-8 | 攻击者快照时机（发射/引爆瞬时；接触实时） | 发射后改实体不回溯 |
| I-9 | 伤害管线数值（DEF 30 → 7；雷抗 0.3 → 7；火抗 0.4 → 6；true 全额） | D-08 既有断言不削弱 |
| I-10 | parity 26 项（含波 1/3 严格、4/5/8 中性化、全天赋波 3/4/8） | 不排除、不跳过、不放宽 |
| I-11 | 玩家侧 S4-C 全量（C1/C2/C3 共 375+ 用例） | 全量回归 |
| I-12 | 波次配额/精英配额/生成节流/160 上限 | 不触碰 `WaveSystem` |

### 7.2 批准差异表（v1.0 定稿）

| # | 差异 | 是否产生 | 批准状态 |
|---|---|---|---|
| D-00 | **D0 批本身无任何行为差异** | — | 仅新增/定稿文档，无代码 |
| D-01 | 负甲/负抗/负 `tough` 由「消费点静默夹紧」改为「权威边界显式拒绝（`RangeError`）」 | **仅当出现非法配置时**才可观察；当前 5 类配置均为正 → 现网零差异 | **已批准 Q1**（D1 落地） |
| D-02 | 抗性 `>0.75`、`tough >0.6` **不在来源裁剪**，保持消费点夹紧 | 不产生差异（维持现状的唯一夹紧位置） | **已批准 Q2**（D1 落地） |
| D-03 | 敌人属性改为 StatModel 解析（D1/D2 本体） | **设计目标为零差异**（逐位恒等） | 若出现任何末位差异 → 视为缺陷，不申请批准 |
| D-04 | `r`/`xp` **不**纳入属性模型，保持 `T.r×1.8` / `T.xp` 原式 | 不产生差异（纯结构决策） | **已批准 Q4**（D1/D2 均不纳入） |
| D-05 | 未来「易伤/破甲」类负向来源（含抗性被减为负 → 伤害放大） | 本批不设计 | **已批准 Q3**：任何此类机制须另行立项审批 |

---

## 8. D1/D2/D3 验收矩阵

### 8.1 通用约定

- 用例编号：`D1-xx` / `D2-xx` / `D3-xx`；同一行为在不同阶段重复验证时，后期阶段复用前期断言（不删减）。
- 「真实入口」列写**必须经过的生产函数**；禁止用「直接改字段」替代（除标注 `[夹具]` 的**前置状态构造**，且构造后必须走真实入口）。
- 「精确期望」：数值一律 `toBe`/`Object.is`；浮点尾按本文实算值；只在跨实现比较时允许 `toBeCloseTo`，并在用例中注明理由。
- 「冻结运行状态」：该用例执行期间不得被隐式改变的状态（否则用例无效）。
- 「批准差异」：`无` 表示必须逐位不变。
- 落地阶段：D1 = 防御侧三项（`defense`/`resistances`/`tough`）；D2 = HP/伤害/速度 + 攻击侧四映射；D3 = 边界与形状封口。

### 8.2 D1 矩阵（防御属性权威迁移）

| 编号 | 真实入口 | 对照基线 | 精确期望 | 冻结运行状态 | 批准差异 | 阶段 |
|---|---|---|---|---|---|---|
| D1-01 | `spawnEnemy("brute")` | 本文 §3.3 字面量 | `e.defense === 30`；`"resistances" in e === false`；`Object.keys(e)` 与冻结清单逐项相等 | `hp===maxhp`、`flash/orbCd/slowT/burnT/shootCd/fuse` 与生成值一致、无 `dead/kx/ky` | 无 | D1 |
| D1-02 | `spawnEnemy("shooter")` | 同上 | `e.resistances` `toEqual({lightning:0.3})`；`"defense" in e === false` | 同上 | 无 | D1 |
| D1-03 | `spawnEnemy("bomber")` | 同上 | `e.resistances` `toEqual({fire:0.4})`；无 `defense` 键 | 同上 | 无 | D1 |
| D1-04 | `spawnEnemy("slime")` / `("bat")` | 同上 | 无 `defense`/`resistances`/`tough` 键；快照 `defense===0`、`tough===0`、`resistances` `toEqual({})` | 同上 | 无 | D1 |
| D1-05 | `spawnEnemy(kind, true)`（5 类 × 精英） | 普通值 + §2.3 精英变换 | 甲/抗/tough 与普通**完全相同**；`hp === 普通hp×8`（精确）；`dmg === 普通dmg×1.5`；`r === T.r×1.8`；`speed === (T.speed*0.8)*(0.9+j*0.2)` | 同 D1-01 | 无 | D1 |
| D1-06 | `hurtEnemy(brute, 11, …, {type:"physical",form:"ranged"})` | D-08 既有 | `hp` 减少 **7**（6.875 → round-min-one）；返回 `settledDamage===7` | 暴击率 0（`Math.random=0.99`） | 无 | D1 |
| D1-07 | `hurtEnemy(brute, 11, …, {type:"fire"/"lightning"/"true"})` | D-08 | 各减少 **11**（护甲不对元素/真实生效） | 同上；`noChain` 避免连锁 | 无 | D1 |
| D1-08 | `hurtEnemy(shooter, 10, …, {type:"lightning"})` | D-08 | 减少 **7**；物理 10 → 减少 **10** | 同上 | 无 | D1 |
| D1-09 | `hurtEnemy(bomber, 10, …, {type:"fire"})` | D-08 | 减少 **6**；`true` 10 → 减少 **10** | 同上 | 无 | D1 |
| D1-10 | `hurtEnemy(shooter, 100, …, {type:"lightning"})`，三种血量 | 抗性 + 结算口径 | ① `hp=999`：`settledDamage===70`、`effectiveHpLoss===70`、`hp===929`、`lethal===false`；② **溢出（overkill）`hp=10`**：`settledDamage===70`、`effectiveHpLoss===10`、`hp===-60`、`lethal===killed===true`——**两者口径不同，不得互写**；③ 临时把 `shooter.resistances.lightning` 改为 `0.9`（`try/finally` 还原）：实体值 `0.9`、`settledDamage===25`（`1-clamp(0.9,0,0.75)=0.25`，消费点裁剪生效） | 同上；`noCrit+noChain` | 无（Q2 已批准：**保持消费点裁剪**，来源不裁剪） | D1 |
| D1-11 | `getEnemyCombatStats(e)` + 原地改 `e.resistances.fire` | PR #3 评审 P2 先例 | 已构造快照不变（`{fire:0.4}`）；实体值改变 | 无 | 无 | D1 |
| D1-12 | `spawnEnemy` 后原地改 `e.resistances.fire` | 配置隔离 | `ETYPES.bomber.resistances.fire` 仍 `0.4`；`e.resistances !== ETYPES.bomber.resistances`（单层浅拷贝对 `number` 值已足够，§3.3） | 用例结束必须恢复（或拒绝原地改配置） | 无 | D1 |
| D1-13 | 三源对照（§3.5） | A/B/C（含 `tough`） | `A===B`、`C===B`、快照 `===B`；形状/键一致性全过 | 无 | 无 | D1 |
| D1-14 | `spawnEnemy` RNG 计数 | §2.2 | 强制类型首试通过 → **4**；强制类型 5 次重试 → **8**；自然抽取首试通过 → **5**；自然抽取重试 1 次 → **6**；自然抽取 5 次重试 → **9** | `Math.random` 序列固定 | 无 | D1（D2 复用） |
| D1-15 | **`tough` 权威链路**：`spawnEnemy` + `getEnemyCombatStats` + `hurtEnemy` | 本文 §3.3 | ① 5 类配置**均不出现** `tough` 键（`"tough" in e === false`）；② 临时注入 `ETYPES.slime.tough = 0.2`（`try/finally` 还原，生产配置不变）→ 生成体 `e.tough===0.2`、快照 `tough===0.2`；③ **物理与真实必须各用独立目标**（两次命中都会杀死亡灵/被 `dead` 门控拦截）：生成**两个** slime，各自 `hp=maxhp=999`（避免 overkill → `killEnemy` → `dead=true`），目标 A 打物理 100 → `settledDamage===80`、`A.hp===919`；目标 B 打 `true` 100 → `settledDamage===100`、`B.hp===899`；两者 `dead` 均非真（已实测：同一目标连续两次调用，第二次因 `hurtEnemy` 首行 `if (e.dead …) return undefined` **直接返回 `undefined`**，属无效对照）；④ 还原 `tough` 后再生成体无 `tough` 键，且同条件物理 100 → **100**（无 tough 基线） | 暴击率 0（`Math.random=0.99`）、`noChain` | 无 | D1 |
| D1-16 | **四类攻击侧映射在 D1 未被改动**（结构钉子） | 本文 §3.2 范围声明 | 5 类配置均无 `globalDamageBonus`/`typeDamageBonus`/`formDamageBonus`/`skillDamageBonus` 键 → 实体无对应键、快照为 `0`/`{}`/`undefined`；临时注入 `ETYPES.slime.formDamageBonus = {melee:0.5}` 后实体**原样浅拷贝**（`toEqual`）、快照同值；`D1` 期间该字段**不进入** `EnemyDefenseStats`（由类型/接口测试或 import 断言钉住「D1 接口不含它」） | 无 | 无 | D1（D2 接管） |

### 8.3 D2 矩阵（HP / 伤害 / 速度）

**A. 生成公式逐位（5 类 × 7 波）**

| 编号 | 真实入口 | 精确期望 | 冻结状态 | 批准差异 | 阶段 |
|---|---|---|---|---|---|
| D2-01 | `spawnEnemy(kind)`，wave ∈ {1,3,4,5,8,15,16}，lvl=1 | `hp === maxhp ===` §2.3 表值（如 wave 8 bat `20.339999999999996`；wave 15 brute `228.8`） | `Math.random` 固定序列 | 无 | D2 |
| D2-02 | 同上，`waveN` 直接设定后调用（不经 `startNextWave`） | 同 D2-01 | 同上 | 无 | D2 |
| D2-03 | `spawnEnemy(kind, true)`（同 7 波） | `hp === D2-01 × 8`（精确）；`dmg === D2-01.dmg × 1.5`；`r = T.r×1.8`；`xp === 25`；`speed` 必须按 `(T.speed×0.8)×jitter` 求值——以 `T.speed=30`、抖动 `0.95` 为钉子：`22.799999999999997`（≠ `30×(0.8×0.95)=22.8`） | 同上 | 无 | D2 |
| D2-04 | **等级是生成前置条件**：先在 `fresh()` 实例上设 `g.waveN=1; g.player.lvl=lvl`，**再**调用真实 `spawnEnemy("brute", true)`（`lvlPow` 只在生成瞬间读取；先生成再改 `lvl` 不会回改已有实体，属无效前置——已实测：先生成再设 `lvl=25` 的实体仍为 lvl 1 的 520，只有再次生成才变 602.822518636）；lvl ∈ {4,5,9,10,14,15,19,20,24,25} | `hp` 逐位等于 §2.3「精英 + 等级」表：brute 普通 65 / 66.95 / 68.9585 / 71.027255 / 73.15807265000001 / 75.3528148295，精英 520 / 535.6 / 551.668 / 568.21804 / **585.2645812000001** / 602.822518636（`Math.random=0.5` 固定抖动） | 同上 | 无 | D2 |
| D2-05 | 同上，检查 `dmg` | `dmg` **不随** `lvl` 变化（lvl 1 与 lvl 20 同为 `15×dmgScale`） | 同上 | 无 | D2 |

**B. 浮点关联顺序（D2 技术红线）**

| 编号 | 真实入口 | 精确期望 | 批准差异 | 阶段 |
|---|---|---|---|---|
| D2-06 | wave 3 / 8 / 15，`spawnEnemy("brute", true)`，lvl 10 | `Object.is(hp, 65*hpScale*1.0609*8)` **为真**，且 `Object.is(hp, 65*(hpScale*1.0609*8))` **为假**（§2.5 反例） | 无 | D2 |
| D2-07 | 任意波次 | HP 解析结果与「三条 final 按 波次→等级→精英 顺序」逐位相同；改为 percent 或预聚合**必须变红** | 无 | D2 |

**C. RNG 次数/顺序与逐字段 parity**

| 编号 | 真实入口 | 精确期望 | 批准差异 | 阶段 |
|---|---|---|---|---|
| D2-08 | **真实 `GameCore.spawnEnemy()`（不带参数 = 自然抽取）**；`fresh()` 后玩家默认 `(696,520)`、`waveN=1`、`lvl=1`；`Math.random` 序列 `[0.625, 0, 0.25, 0.5, 0.75]` | 调用 **5** 次（类型→位置→速度→`seed`→`shootCd`）；`type==="slime"`（wave 1 仅 slime 解锁，`total=40`，`roll=25`）；`x===996`、`y===520`（`cos(0)=1` → `696+300`，clamp 未触发、距离 300>150 首试通过）；`speed===28.500000000000004`（`0.9+0.25×0.2=0.9500000000000001`）；`seed===5`；`shootCd===2.125`；`hp===maxhp===14`；`dmg===8`；`r===4` | 无 | D2 |
| D2-08b | **强制类型**：`spawnEnemy("slime")`，同一 `Math.random` 序列 `[0.625, 0, 0.25, 0.5]`（**无类型随机**，第 1 值即位置角度） | 调用 **4** 次；`x===483.86796564403573`、`y===307.86796564403573`（`a=0.625×2π` 第三象限）；`speed===27`（抖动 `0.9+0×0.2=0.9`）；`seed===2.5`；`shootCd===1.75` | 无 | D2 |
| D2-09 | **角落前置状态 `[夹具]`**：`g.player.x = 30; g.player.y = 30`（世界坐标下界 30）；**只固定 `r=0.6`**（`a = 0.6×2π ≈ 3.7699 rad`，`cos<0 && sin<0` → 计算点 `(30-242.6, 30-176.5)` 在 **x、y 双向都命中 `clamp(…,30,…)` 下界** → 落点 `(30,30)`，距玩家 0 < 150）→ 5 次尝试全部失败 | **自然抽取**：序列 `[0.6,0.6,0.6,0.6,0.6, 0.6, 0.5, 0.5, 0.5]`（类型 + 5 位置 + 速度 + `seed` + `shootCd`）→ 调用 **9** 次，最终位置 `x===30`、`y===30`（`Object.is` 精确），`speed===30`、`seed===5`、`shootCd===1.75`；**强制类型**：序列 `[0.6,0.6,0.6,0.6,0.6, 0.5,0.5,0.5]` → 调用 **8** 次，位置/属性同上；两条路径都**不抛错**、都接受第 5 次结果 | 无 | D2 |
| D2-09b | **对照（反证重试确由角落触发）**：同一 `0.6` 序列但玩家在默认 `(696,520)` | 自然抽取 **5** 次 / 强制类型 **4** 次；位置 `(453.2949016875158, 343.6644243122581)`（首试 300px 即通过，只消耗 **1** 次位置随机） | 无 | D2 |
| D2-09c | **反证「角落不是充分条件」**（限定 `r=0.6` 的适用边界） | 同上角落 `(30,30)` 但取 `r=0.125`（`a≈0.7854`，`cos>0 && sin>0`）→ 计算点 `(30+212.1, 30+212.1)` **未触发 clamp**，距玩家 **300 > 150** → **首试通过**，强制类型只消耗 **4** 次、落点 `(242.13203435596427, 242.13203435596424)`。即：只有 `cos<0 && sin<0`（第三象限）的角度才会双向 clamp 到 30；**不成立「任意角度在角落都会近距离」** | 无 | D2 |
| D2-10 | `spawnEnemy()` 自然抽取，wave 8、lvl 1、`Math.random=0.5` | 调用 **5** 次；`type==="bat"`（wave 8 解锁 5 类，`total=40+18+12+16+14=100`，`roll=50`：减 40 余 10、再减 18 余 −8 ≤ 0 → bat）；`hp===20.339999999999996`；`dmg===8.100000000000001`；`speed===62`（抖动 `0.9+0.5×0.2=1.0`）；`seed===5`；`shootCd===1.75` | 无 | D2 |
| D2-11 | parity 波 1/3（严格）+ 4/5/8（测试内中性化） | 26 项全绿；`enemies` 数组逐字段 `toEqual` | 无 | D2 |
| D2-12 | `killEnemy(e)`（普通怪、无爆炸、无灼烧蔓延、`luck=0`、`burnSpread=0`；`Math.random` 固定 0.99） | **共 25 次 = 掉落 4 + 粒子 21**：① 幸运双倍判定 1（`r < luck×0.07`，`luck=0` 恒假）；② 宝石 `vx` 1；③ 宝石 `vy` 1；④ 血包判定 1（`r < 0.02+luck×0.01`，0.99 假）；⑤ 粒子 **7 颗 × 3**（`vx`/`vy`/`life` 各 1）=21。宝箱判定用 `hash01(e.seed, waveN)`，**不消耗** `Math.random` | 无 | D2 |
| D2-12b | 同上的**偏移账**（各自单独用例，避免混算） | ① `killEnemy(精英)` = **60**（掉落分支零随机：宝石/血包/宝箱直接 push；粒子 20×3）；② `player.explode=1` 且半径内 0 个敌人 = **35**（25 + 10，爆炸 10 颗粒子各 1）；③ `explode=1` 且半径内 **2** 个敌人 = **37**（35 + 2，每个被波及敌人在 `hurtEnemy` 内多 1 次音效随机；explode 传 `noCrit` → 无暴击随机）；④ `burnSpread=1` 且附近 3 敌 = **25**（蔓延只写 `burnStacks`/`burnT`，零随机）；⑤ `hurtEnemy` 普通命中（允许暴击）= **2**（暴击判定 + 音效随机），`noCrit` 时 = **1**；⑥ 经验球被吸收 = **1**（`ProgressionSystem.ts:32` 音效随机）；⑦ 血包拾取 = **0**；宝箱拾取 = **0** | 无 | D2 |

**D. 伤害路径（含已受伤 HP 保留、快照时机）**

| 编号 | 真实入口 | 精确期望 | 冻结状态 | 批准差异 | 阶段 |
|---|---|---|---|---|---|
| D2-13 | 先 `hurtEnemy` 掉血，再触发一次生成（同波） | 受伤敌人 `hp` 不变（生成不触碰既有实体）；`maxhp` 不变 | 新实体不共享引用 | 无 | D2 |
| D2-14 | 射手：`shootCd=0`、距离 100 → 发射；发射后改 `s.dmg` / `s.typeDamageBonus` / 删除实体 | 弹丸 `dmg` 与 `stats.attack` 为**发射时**值；命中玩家伤害按快照 | 玩家 `hurtCd=0` | 无 | D2 |
| D2-15 | 自爆虫：贴近至 `fuse=0.5` → 推进至引爆 | 玩家伤害按**引爆瞬间**快照；`noDrop=true`；`hp=0` 后移除 | 玩家护盾/闪避清 0 | 无 | D2 |
| D2-16 | 接触伤害（`enemies` 重叠、`hurtCd=0`） | `damagePlayer(e.dmg, {melee:true,type:"physical",form:"melee"})` 数值与既有 `combat.test.ts` 一致；**实时**读实体（改 `e.dmg` 后同帧生效） | 玩家 `dashT<=0` | 无 | D2 |
| D2-17 | 反弹（`bladeReflect` + `orbit`） | 反弹弹幕对敌人伤害走玩家侧 `hurtEnemy`（`attackerStats` 不传 → 当前玩家）；敌方 `dmg` 字段不变 | `orbA` 非零 | 无 | D2 |
| D2-18 | 灼烧 DoT（`burnStacks=4`、`burnDps=burnStackDps`） | 每帧 `dps*dt` 经 `fire/dot/preserve-float`；**不暴击、不取整**；bomber 火抗 40% 生效 | `burnT` 递减 | 无 | D2 |
| D2-19 | 焦土燃烧（`burnGround` + zone） | 同 D2-18 管线；中性怪与旧直算逐位一致 | zone 存在 | 无 | D2 |
| D2-20 | 陨星（`meteor>0`） | 落点内敌人走 `fire/other` `round-min-one`；bomber 火抗生效 | `meteorT` | 无 | D2 |
| D2-21 | 近战（`meleeSwing`） | `physical/melee` `round-min-one`；击退写 `kx/ky`（**新增可选键**） | 无 | 无 | D2 |
| D2-22 | `true` 伤害对 brute（含全甲） | 全额、无视甲/抗/tough | 无 | 无 | D2 |

**E. 运行状态（冻结面）**

| 编号 | 真实入口 | 精确期望 | 批准差异 | 阶段 |
|---|---|---|---|---|
| D2-23 | 冰冻：`frostLv>0`、3 层 | `frozenT = 0.4+0.2×frostLv`；`frostImmuneT=2.5`；`frostStacks=0`；定身期间 **不移动、不接触伤害、射手不射击** | 无 | D2 |
| D2-24 | 燃烧到期帧边界（**完整初态**）：slime（**无火抗、无 `defense`、无 `tough` 键**）、`e.hp = e.maxhp = 1_000_000`、`e.burnT = 2`、`e.burnDps = 10`、`e.burnStacks = 2`、`g.dmgBy.burn` 初值 **0**、`dt = 1/60`，且**无其它伤害源**（`quota=0`、`spawnCd=1e9`、`player.fireCd=1e9`、敌人 `speed=0` 且远离玩家、无 `burnZones`/`meteors`/`bullets`） | ① **DoT 结算 121 帧**：第 120 帧结束时 `burnT = 2.1024848528838902e-15`（仍 `> 0`），第 121 帧递减前判定通过 → 结算；递减后 `-0.016666666666664564`；② `burnStacks` 在**第 122 帧**清 0（该帧 `burnT > 0` 不成立，走 `else if (burnStacks)` 分支，`burnT` 保持 `-0.016666666666664564` 不再递减）；③ 累计 `g.dmgBy.burn === 20.16666666666667`、HP 损失 `1_000_000 - e.hp === 20.16666666197125`、`e.dead` 非真（HP 远大于伤害，不触发 `killEnemy`）；④ **真正决定 121 的三件事**：(a) 门控 `if (e.burnT > 0)` 读的是**递减前**的值且为**严格 `>`**；(b) 每帧无条件 `e.burnT -= dt`、**不夹紧到 0、不设 epsilon**；(c) 清层只发生在 `burnT > 0` 不成立的 `else if (burnStacks)` 分支。**仅在同一分支内交换「递减」与「结算」的先后不影响结果**（`applyBurnDot` 只读 `e.burnDps`，不读 `burnT`，实测两序均 121 帧、`20.16666666666667`、清层 122）；而**把门控移到递减之后**（用递减后值判定）会变成 **120 帧 / `20.000000000000004` / 清层 121**（实测），**给递减加 `Math.max(0, …)` 夹紧**虽仍是 121 帧，但序列化终值由 `-0.016666666666664564` 变 `0`（`enemies` 快照字段，parity 可见）——这三类改动都**不得顺手做** | 无 | D2 |
| D2-24b | 燃烧施加：命中 1 次（`player.burn>0`） | `burnStacks=1`、`burnT=2`、`burnDps=burnStackDps(player,1)`；叠到 5 次时 `burnStacks` 封顶 4；到期清层见 D2-24 | 无 | D2 |
| D2-25 | 减速：`player.slow>0` 命中 | `slowT=1.2`、`slowF=player.slow`；`e.speed` **不变**；移动速度 = `e.speed×(1-slowF)` | 无 | D2 |
| D2-26 | 射手射击冷却 | 初始 `shootCd=1+1.5r`；开火后 `=2.2`；非射手不递减 `shootCd` | 无 | D2 |
| D2-27 | 击退：`meleeSwing({knock})` | `kx/ky` 为方向×knock；每帧衰减 `1-12dt`，\|k\|<1 归 0；位置积分 | 无 | D2 |
| D2-28 | 精英血条 | `(w*e.hp)/e.maxhp` 使用当前 hp 与生成 maxhp（受伤后比例下降、maxhp 不变） | 无 | D2 |

### 8.4 D3 矩阵（边界与形状封口）

| 编号 | 真实入口 | 精确期望 | 批准差异 | 阶段 |
|---|---|---|---|---|
| D3-01 | `spawnEnemy` 5 类 × 普通/精英 | `Object.keys(e)` 与冻结清单**逐项相等且顺序无关**（集合比较）；无 `dead/kx/ky` | 无 | D3 |
| D3-02 | 同上 + 触发 `dead`/击退 | 触发后键出现；反向验证「未触发不出现」 | 无 | D3 |
| D3-03 | 敌人侧无重算入口 | 源码级断言（测试用正则扫描 `src/game/core`，断言无 `Object.assign(<enemy>…)` / 无 `enemyStatProjection(` 之外的写入点）+ 行为断言：连续 100 帧 `update` 后 `maxhp/dmg/speed/r/defense/resistances` 不变 | 无 | D3 |
| D3-04 | 已受伤敌人跨 100 帧 | `hp` 只按 DoT/伤害变化，**绝不回到 maxhp**（不因任何解析满血） | 无 | D3 |
| D3-05 | `getEnemyCombatStats()` 快照隔离 | 每次调用返回新对象；改实体映射不渗透；`attack === e.dmg` | 无 | D3 |
| D3-06 | 玩家侧 C3 全量回归 | `s4c-c3*`、`s4c-c3-baseline`、`s4c-recompute-audit` 全绿；15 字段保护无回归 | 无 | D3 |
| D3-07 | 浏览器真实流程 | `game.spec.ts`（真实输入/暂停/升级/熔炉/死亡/重开）、`release.spec.ts`（生产构建自然首波）全绿 | 无 | D3 |
| D3-08 | 性能热点 | `performance.spec.ts` 160 敌人/120 弹丸基线可采；p50 不因 D1/D2 回退（记录实测值，不设硬阈值——现有测试也未设） | 无 | D3 |
| D3-09 | RNG 全序列 | 一次自然生成的 `Math.random` 值序列与基线**逐一相同**（回放式断言，而不只计数） | 无 | D3 |

---

## 9. 风险、非目标与停止条件

### 9.1 风险

| # | 风险 | 影响 | 缓解 |
|---|---|---|---|
| R-1 | 用 percent 区或预聚合表达缩放 | 末位差异 → parity 与 D-08 红 | D2-06/D2-07 钉子；只用 final 且按原顺序 |
| R-2 | 解析函数内部抽随机 | RNG 顺序漂移 → 全场分叉 | 签名要求 `speedJitter` 入参；D2-08/D2-09/D3-09 |
| R-3 | 「顺手」给 `dmg` 补 `lvlPow` | 平衡变更（后期怪物伤害暴涨） | I-4 + D2-05 |
| R-4 | 把甲/抗写进精英分支 | 精英变硬 → parity 波 4/5/8 红 | 来源签名禁止 `elite`；D1-05 |
| R-5 | 为「结构统一」写 `defense: 0`/`resistances: {}` | slime/bat 多键 → parity 波 1/3 红 | D1-04 + D3-01 |
| R-6 | 把快照改为实体引用 | 发射后改动回溯 → S2 评审 P2 回归 | D1-11 + D2-14 |
| R-7 | 新增每帧属性解析 | 60Hz 热路径开销 + 运行状态被覆盖 | §4.2/§4.8；D3-03 |
| R-8 | 负值政策静默变更 | 配置错误变隐形强度变化 | P-2～P-4 需批准；不夹带 |
| R-9 | 文档先于实现被引用 | 把草案当冻结契约 | 本文状态标记 + §11 交付边界 |

### 9.2 非目标（明确不做）

- 不重做 ECS、不改 `Simulation` 调度顺序、不合并 `EnemySystem`/`CombatSystem`。
- 不新增怪物等级成长、不新增精英甲/抗、不改配额/速度/碰撞/世界范围。
- 不改 `DamageSystem` 的减伤公式与 `combatBalance.ts` 系数。
- 不引入负区因子行为变更（含 clamp 位置移动）。
- 不重写玩家 `RuntimeStateProtection`（已验证充分）。
- 不为敌人建立快照-恢复系统、不给实体挂 `stats` 侧车。
- 不改 UI/图鉴/存档/战绩格式。

### 9.3 停止条件（D1/D2/D3 各自）

- 任一 `I-*` 不变项出现非零差异 → **停止并回报**，不申请「看起来合理」的批准。
- parity 任一用例变红 → 停止（不得通过排除/中性化扩大范围来恢复绿）。
- 需要修改 `EnemyConfig` 字段集或实体键集合 → 停止，先报评审（形状红线）。
- 需要新增 RNG 调用或改变调用顺序 → 停止。
- 需要改变负值/上限夹紧位置 → **停止**：Q1（负值边界拒绝）与 Q2（上限仍消费点裁剪）已批准并冻结，任何偏离即为违约，须先修订本契约。
- 需要在 D2 描述 `radius`/`xp` 为「已迁移权威属性」→ **停止**（Q4 已批准不纳入，见 §10.6）。
- 需要在 D2 之前改动 `formDamageBonus`/`skillDamageBonus` 等映射的来源解析接口 → **停止**，先按 §10.6 注意事项 1 单独审查。

---

## 10. 交付与后续

### 10.1 D1/D2/D3 预计修改文件

| 阶段 | 预计新增 | 预计修改 | **不得修改** |
|---|---|---|---|
| **D1** | `src/game/core/EnemyStatSources.ts`（防御侧来源声明 + `resolveEnemyDefense`：`defense`/`resistances`/`tough`） | `src/game/core/EnemySystem.ts`（**仅** `defense`/`resistances`/`tough` 三项改为经 `resolveEnemyDefense` 后条件展开；四个攻击侧映射**保持原样**）；`src/game/core/StatSheets.ts`（`EnemyShadowStats` 扩 `tough`，与 §3.6 一致；该模块不在运行时路径）；`tests/` 新增 D1 矩阵用例（D1-01～D1-16） | `CombatStats.ts`（签名/默认值语义）、`StatModel.ts`（契约）、`data/enemies.ts` 数值、`data/combatBalance.ts`、`tests/parity.test.ts` 对照范围 |
| **D2** | `tests/` D2 矩阵用例（可复用 D1 文件） | `EnemyStatSources.ts`（追加 spawn 解析 + **攻击侧**四映射解析）、`EnemySystem.ts`（hp/maxhp/dmg/speed 与四映射改经解析；**保持 RNG 抽取位置**） | `DamageSystem.ts`、`DamageMath.ts`、`data/combatBalance.ts`、`WaveSystem.ts`、`EnemyConfig` 字段集 |
| **D3** | `tests/` D3 矩阵用例（形状/RNG/无重算） | 可能仅 `EnemySystem.ts` 头注（契约注释）；**默认零生产改动** | `RuntimeStateProtection.ts`（玩家侧不重写）、`types.ts` 的实体字段集、`GameCore` 实体结构 |

> 一致性（v0.2）：D1 的「预计修改」与 §3.2 范围、§3.6 接口、§8.2 矩阵**三处同一范围**（DEF/RES/tough）；四类增伤只出现在 D2 行。

### 10.2 决策与批准结论（Q1–Q5 全部已批准，2026-10-26）

| # | 决策 | 批准结论（冻结） | 影响面 |
|---|---|---|---|
| Q1 | 负 `defense`/`tough`/`resistances` 在权威边界：显式拒绝 vs 沿用消费点夹紧 | **显式拒绝，抛 `RangeError`**（快速失败） | 仅非法配置可观察；当前配置均为正 → 现网零差异 |
| Q2 | `resistances > 0.75` 与 `tough > 0.6` 是否在来源裁剪 | **不裁剪**；上限仍在消费点裁剪（`DamageSystem`），保持唯一夹紧位置 | 未来配置越界时的数值与 UI 语义不变 |
| Q3 | 未来「易伤/破甲」类负向来源是否允许 | **本批不设计**；任何此类机制须另行立项审批 | 可能改变 DPS 与平衡，故不在本契约覆盖范围内 |
| Q4 | `r` / `xp` 是否纳入属性模型 | **不纳入**；保持 `T.r×(elite?1.8:1)`、`elite?25:T.xp` 原式 | 纯结构；D2 不得把它们描述为已迁移权威属性（§10.6） |
| Q5 | D1 是否顺带把 `tough`/四类增伤映射切换权威 | **D1 = `defense` + `resistances` + `tough`**（防御侧三项）；**`globalDamageBonus`/`typeDamageBonus`/`formDamageBonus`/`skillDamageBonus` 不在 D1**，随 D2 攻击侧一并迁移 | §3.2 范围、§3.6 接口、§8.2 矩阵（D1-01～D1-16）、§10.1 文件表四处一致 |

> **D2 的权威范围（Q5 推论，冻结）**：`maxHp`（←`hp`）、`attack`（←`dmg`）、`moveSpeed`（←`speed`）以及四类攻击增伤来源（`globalDamageBonus`/`typeDamageBonus`/`formDamageBonus`/`skillDamageBonus`）。`radius`、`xp` 不在其中（Q4）。

### 10.3 文档状态需更新（**本批不改**）

- `docs/pixel-rogue-S4-implementation-brief.md` 文件头状态行（仍写 C1/PR #91、S4-D 未开始）→ 已过时（PR #110 已合并 C3-C）。
- `docs/pixel-rogue-combat-foundation-v1.md` 文件头「S3–S4 尚未实施」→ 同上。
- `docs/migration.md` D-31 遗留句「RuntimeStateProtection 为其提供骨架」→ 建议在 S4-D 正式记录时改为「敌人侧无重算入口，不套用玩家快照骨架」。
- 建议随 D1 正式记录补一条 D-32（编号以合并时实际为准），并在 `CHANGELOG.md` 与 `src/game/data/changelog.ts` 追加条目（Issue #55 纪律）——**均不在 D0 执行**。

### 10.4 现有测试缺口（D1/D2 需补，D0 已确认不存在）

| # | 缺口 | 现状 | 影响 |
|---|---|---|---|
| T-1 | 生成 RNG 次数/顺序无断言 | 无任何测试计数 `spawnEnemy` 的 `Math.random` | D2 最大风险点无人看守 |
| T-2 | 位置生成规则（300 半径、clamp 30、>150、5 次重试）无测试 | 无 | 改实现不会被发现 |
| T-3 | `lvlPow` 只作用于 HP 无测试 | 无 | 易被「补齐」为 dmg |
| T-4 | 精英 speed×0.8 / r×1.8 / xp=25 无测试 | 仅有 hp/dmg 的 D-03 | 漂移风险 |
| T-5 | 甲/抗「不随波次/等级/精英」无系统矩阵 | `shadow-stats.test.ts:196-208` 仅覆盖精英不缩放（3 类） | 覆盖不全 |
| T-6 | 敌人侧「无重算入口 / 无新键」无结构断言 | 无 | D1/D2 可能悄悄加键 |
| T-7 | `frozenT` 的「定身同时跳过接触伤害」无测试 | 无 | 语义易被误解为「只停移动」 |
| T-8 | 减速不清 `slowF`、蔓延不写 `burnDps` 等既有细节未被文档/测试钉住 | 无 | 重构时易「顺手修正」成行为差异（须先批注再决定） |
| T-9 | 负配置（负甲/负抗）无测试 | `damage.test.ts` 只测消费点夹紧 | 边界拒绝策略无落地证据 |
| T-10 | `killEnemy` 的随机预算（25 = 4 掉落 + 21 粒子；精英 60；explode 35/37）无任何断言 | 无测试计数 | 掉落/粒子改动会静默改变后续随机流 → 全场分叉（v0.2 复审发现） |
| T-11 | 灼烧到期帧边界（121 帧结算 / 第 122 帧清层）无断言 | 只有 `combat-stats.test.ts` 的 DoT 总量近似断言 | 「先递减后结算」顺序被改写不会被发现（v0.2 复审发现） |
| T-12 | `tough` 在敌人侧完全无测试（含「未声明则无键」） | 无 | D1 扩到 `tough` 后无回归网 |

### 10.5 建议的独立评审顺序（契约已冻结；以下为**实施阶段**顺序）

1. **D0 契约本身已完成评审与冻结**（v1.0，Q1–Q5 已批准）；后续阶段**不得**再以「重新讨论政策」为由变更 §6/§10.2。
2. **评审 D1**：只审 `EnemyStatSources` + `spawnEnemy` 的防御属性段；确认「零数值差异 + 键形状不变 + 负值 `RangeError`（Q1）+ 上限仍消费点裁剪（Q2）」；跑 D1 矩阵（D1-01～D1-16）+ parity。
3. **评审 D2**：单列 `final` 顺序与 `speedJitter` 入参两项技术条件；**先按 §10.6 注意事项 1 单独审查四类攻击增伤来源解析接口**；确认无新平衡系数、`radius`/`xp` 未被描述为已迁移（Q4）；跑 D2 矩阵 + 全量。
4. **评审 D3**：结构/形状/RNG 回放 + 浏览器与性能；确认**没有**为了「彻底」而重写玩家系统。
5. 每阶段结束后由用户单独授权是否合并、是否进入下一阶段；**不得连续推进**；D0 冻结不代表 D1 授权。

### 10.6 实施期注意事项（v1.0 冻结时新增，全部为**约束**，不改变任何技术断言）

1. **D2 开始前须单独审查映射来源解析接口**：`formDamageBonus` 与 `skillDamageBonus` 的键空间与 `typeDamageBonus`/`resistances` 不同——前者是 `AttackForm`（`melee`/`ranged`/`other`）与自由 `skillId` 字符串，后两者是 `DamageTypeId`。`resolveKeyedMap` 目前只为 `KEYED_STAT_FAMILIES = ["typeDamageBonus","resistance"]` 提供族槽位，**`formDamageBonus`/`skillDamageBonus` 没有对应 `StatId` 族**。因此 D2 不得「顺手」把它们塞进现有族，必须先单独立项评审：是新增通用族、还是在攻击侧接口内做逐 key 解析。**在评审通过前，这两项保持现有条件展开原样拷贝**（与 D1-16 的结构钉子一致）。
2. **`radius` / `xp` 不得被描述为已迁移的权威属性**（Q4）：`EnemySpawnStats.radius`/`.xp` 仅为字段占位记录；D2 的权威范围只有 `maxHp`/`attack`/`moveSpeed` + 四类攻击增伤（§10.2 推论）。实现与文档都不得把 `r`/`xp` 写成「已入 StatModel」，也不得改动 `T.r×(elite?1.8:1)`、`elite?25:T.xp` 的原式。
3. **四条不可变更的红线**（任何阶段）：
   - **RNG 次数与顺序**：§2.2 的 4/5/6/8/9 次与「类型 → 位置(1..5) → 速度抖动 → `seed` → `shootCd`」顺序；
   - **浮点运算顺序**：HP 为左结合四连乘（`((T.hp*hpScale)*lvlPow)*elite8`），只允许「按原顺序的 final 修饰符」（§2.5、§4.6）；禁用 percent 区与预聚合；
   - **实体字段形状**：可选键「配置声明才存在」、`dead`/`kx`/`ky` 未触发不出现（§1.2、§3.3、§5.3）；
   - **伤害快照时机**：射手发射、自爆引爆为瞬时快照；接触伤害实时读实体（§3.4、§4.4）。
4. **逐阶段独立审查与授权**：D1 → D2 → D3 各自独立评审、独立授权、独立 PR；**D0 冻结不构成任何实施授权**（§10.5 第 5 条）。每阶段结束须回报：改动文件、矩阵结果、parity 状态、未验证项。

---

## 11. D0 交付边界（本文档自身）

| 项 | 状态 |
|---|---|
| 交付文件 | **仅** `docs/pixel-rogue-S4D-D0-contract-v1.md`（由 `…-contract-draft.md` 定稿更名而来；旧草案文件已删除，**不保留两份互相竞争的契约**） |
| 生产代码改动 | **无** |
| 测试改动 | **无**（未新增、未修改、未跳过任何用例） |
| 构建产物 | **无**（未运行 `vite build`；仅类型检查与 Vitest） |
| 提交 / 推送 / PR / 合并 | **无**（本批未获授权） |
| 冻结声明 | **已冻结**：**FROZEN v1.0 / 用户批准**（2026-10-26，Q1–Q5 全部推荐方案批准）；后续变更须修订本文档并升版本 |
| 实施授权 | **未授予**：D1/D2/D3 均未开始，须逐阶段独立审查与授权（§10.5、§10.6） |
| 临时探针 | 修订期使用 `tmp-s4d-probe.cjs`、`tmp-s4d-probe2.cjs`、`tmp-v03-probe.cjs`、`tmp-v03-probe2.cjs`、`tmp-doc-check-final.cjs`、`tmp-doc-check-v03.cjs` 等临时脚本（只读：仅替换 `Math.random` 做计数、只在 `try/finally` 内改内存配置；不写 `src/` 或 `tests/`），**均已删除**，不入库 |

### 11.1 文档空白与结构检查（v0.2 建立 / v0.3 与 v1.0 复跑）

`git diff --check` **不检查未跟踪文件**——v0.1 仅凭其无输出宣称通过属于方法错误。自 v0.2 起改为对文件本体逐行检查（检查器为本轮临时脚本，已删除）；v0.3 与 v1.0 每次改动后复跑同一套判定：

| 检查项 | 方法 | v1.0 结果 |
|---|---|---|
| 行尾空白 | 正则匹配「空格或制表符 + 行尾」 | **0 处** |
| 制表符 | 逐行查找制表符 | **0 处** |
| BOM | 首 3 字节比对 `EF BB BF` | **无** |
| CRLF / 孤立 CR | 统计 CRLF 与「CR 后不接 LF」 | **0 / 0**（全文 LF） |
| 代码围栏配对 | 围栏行计数为偶数且首尾闭合 | **10 行 / 5 块，配对闭合** |
| 表格列数一致 | 每个表格块内**未转义**竖线数（忽略 `\|`） | **0 处不一致** |
| 标题层级跳跃 | 相对上一标题不得跳级 | **0 处** |
| 章节交叉引用可解析 | 抽取全部 `§x` / `§x.y` 与标题编号比对 | **0 处悬空** |
| 标记唯一性 | 标题 / 状态行 / `## 11.` / `### 11.1` / v1.0 修订行各应出现 1 次 | **各 1 次** |
| 单行长度 | 记录最大值（仅记录，不设阈值——表格行天然较长） | 实测见下 |

> 结论：v1.0 文档在行尾空白、制表符、BOM、换行、代码围栏、表格结构、标题层级、章节交叉引用、标记唯一性九个判定项上自检通过（单行长度为记录项，不设阈值）；**这是文档级静态检查，不能替代 Markdown 渲染检查**（未在渲染器/浏览器中打开验证）。

> 过程留痕（缺陷披露）：v0.2 修订过程中，一次 `edit_file` 精确替换曾把 §11 区段截断并重复拼入全文副本（文件一度达 148243 字节 / 1599 行）；已在同轮用「保留 §1～§10.5 完整副本 + 重建 §11」修复，并以标记唯一性 + 结构闸门复核。v0.3 与 v1.0 每次编辑后立即复跑检查器，未再出现同类问题。
