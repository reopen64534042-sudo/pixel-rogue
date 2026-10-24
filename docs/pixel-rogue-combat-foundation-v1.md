# Pixel Rogue · Combat Foundation v1 技术设计规范

> 状态：**设计已确认，尚未实施**  
> 日期：2026-10-24  
> 项目：Pixel Rogue（像素秘境）  
> 目标开发仓库：[`reopen64534042-sudo/pixel-rogue`](https://github.com/reopen64534042-sudo/pixel-rogue)  
> 建议入库路径：`docs/combat-foundation-v1.md`（须通过功能分支和 PR，不直接写 `main`）

## 1. 背景与目标

现有工程具备 `player.damage`、暴击/暴伤、`tough`、闪避、次数盾、吸血和各伤害来源，但缺少统一的伤害属性、防御/抗性、攻击方式增伤和玩家/敌人共享的战斗数值接口。现有 `CombatSystem.hurtEnemy()`、`damagePlayer()` 直接结算伤害；`EnemySystem` 的灼烧 DoT 则直接扣 `e.hp`。

建设一套**可扩展、低耦合、逐步迁移**的战斗数值基础设施，同时保护现有 34 天赋、波次、掉落、伤害报告与战绩。首要目标是统一计算边界和数据契约，不是重新平衡整个游戏。

### 1.1 确认的设计原则

1. **伤害属性（DamageType）、攻击方式（AttackForm）、具体来源（DamageSource/Origin）和机制标签（DamageTags）正交**。一个近战技能可以造成雷电伤害；同一种伤害属性可来自不同技能。
2. **可扩展伤害属性**：通过编译期配置/注册表添加新类型（如冰霜、毒素），不在核心计算器写死四种类型的分支。暂不做运行时插件、脚本热加载或网络注册。
3. **分乘区**：同一乘区内多个增伤先相加，不同乘区相乘。明确避免基础伤害和增伤重复计算。
4. **共享计算规则，不强迫 Player/Enemy 共用完整实体类型**：现有数据先经适配器转成战斗属性快照，后续再渐进重构。
5. **纯数值计算与副作用分离**：DamageSystem 不引用 Phaser/DOM、音效、`GameCore`，不改 HP、不抽取随机数；CombatSystem 负责编排/应用效果。
6. **先保护旧版，再启用新数值**：S1/S2 保持零防御、零抗性、新增伤乘区为 1；S3 才引入非零数值和平衡变更；S4 逐步重构属性来源。

### 1.2 本轮非目标

不新建 ECS、全局事件总线、动态插件系统；不重做武器、装备、职业、异常状态、护盾机制、局内存档或 34 张天赋的 Modifier 实现；不凭构建成功声称玩法验证通过。

## 2. 术语与类型边界

| 概念 | 职责 | 当前默认值/示例 |
| --- | --- | --- |
| DamageTypeId | **伤害属性**，决定防御策略 | `physical` / `fire` / `lightning` / `true` |
| AttackForm | **攻击方式**，决定近战/远程增伤适用范围 | `melee` / `ranged` / `other` |
| DamageSource（legacy）/ Origin | 伤害**来源**，用于伤害报告与专属增强 | `bullet`、`melee`、`orbit`、`burn`、`chain`、`meteor`、`explode`、`thorns` |
| DamageKind | 结算方式 | `hit`（离散命中）/ `dot`（持续伤害） |
| DamageTag | 机制元数据；用于未来明确声明的条件规则 | `area`、`projectile`、`dot`（标签自身不自动乘伤） |
| `attack` | 战斗属性快照中的统一攻击力 | 当前玩家适配自 `player.damage=11`，敌方 `e.dmg` **不能无条件等价**为所有攻击的攻击力 |
| `defense` | 物理护甲 | 初期玩家/敌人均为 0 |
| `resistances` | 按伤害属性索引的抗性映射 | 未声明时为 0 |

四种初始属性与策略：

| 属性 ID | 减伤策略 | 备注 |
| --- | --- | --- |
| `physical` | `armor` | 使用 DEF 非线性护甲，受现有通用减伤影响 |
| `fire` | `resistance` | 使用火焰抗性，受现有通用减伤影响 |
| `lightning` | `resistance` | 使用雷电抗性，受现有通用减伤影响 |
| `true` | `none` | 忽略 DEF、元素抗性和常规通用减伤；**不默认**穿透闪避、次数盾、无敌帧或不屈 |

第一版注册表是带类型约束的静态 TypeScript 配置；`keyof typeof registry` 推导合法类型 ID。抗性推荐 `Partial<Record<DamageTypeId, number>>` 或等效映射，新元素无需给每个敌人增加一个独立字段。注册表保存减伤策略及展示元信息，**不执行扣血、随机判定或复杂技能副作用**。新增类型必须补充对应校验和回归测试。

## 3. 伤害计算契约

### 3.1 增伤乘区（最终确定）

设技能/武器按当前机制生成的**原始伤害**为 `D_raw`，增伤倍率为：

```text
M_global = 1 + sum(globalDamageBonus)
M_type   = 1 + sum(bonusesMatchingDamageType)
M_form   = 1 + sum(bonusesMatchingAttackForm)
M_skill  = 1 + sum(bonusesMatchingSpecificSkill)  // 技能额外增伤，不是技能自身系数

D_beforeCrit = D_raw × M_global × M_type × M_form × M_skill
D_beforeMitigation = D_beforeCrit × M_crit
D_final = D_beforeMitigation × M_typeMitigation × M_generalMitigation
```

**同乘区加算、跨乘区乘算**。例如原始 100、全局 +20%、雷电 +30%、近战 +40%：`100 × 1.2 × 1.3 × 1.4 = 218.4`（尚未计暴击/防御）。同为雷电伤害的 +20% 和 +30% 合为 `1.5`，不是 `1.2×1.3`。

`D_raw` 已包含技能自身的基础系数、固定伤害，以及现有调用点已经嵌入的 `player.damage` 与天赋效果；**不得在 S1/S2 又乘一次同一加成**。例如当前魔弹有独立 `boltDmgMul`，先保留 `player.damage * boltDmgMul`，新乘区默认 1。未来 S4 再逐步拆分 `baseAttack`、技能系数和独立增伤。

`AttackForm` 是**技能显式指定**，不是按目标距离自动推断。`other` 适用于不属于近战/远程的光环、陷阱等。持续伤害默认 `form=other`，**不自动继承施加 DoT 的近战/远程增伤**；元素伤害、全局伤害以及将来独立 DoT 增伤可以生效。范围/投射物等标签默认只表达事实，不能因为多个标签叠加就自动获得任意数量的新乘区；启用标签增伤须另立规则。

### 3.2 减伤公式（已确认，参数尚需平衡验证）

```text
physical: M_typeMitigation = K / (K + max(0, DEF)), K 初始候选值 50
fire/lightning: M_typeMitigation = 1 - clamp(typeResistance, 0, 0.75)
true: M_typeMitigation = 1

physical/fire/lightning: M_generalMitigation = 1 - clamp(tough, 0, 0.60)
true: M_generalMitigation = 1
```

`K=50`、元素抗性 75% 上限是 **v1 试验基准**，不是已经平衡验证的最终定值；集中放在 `combatBalance.ts`。初期不启用负防御/负抗性、穿透与易伤。通用减伤与护甲/抗性乘算，兼容原有「铁布衫」最高 60% 减伤。若未来需要 `true` 仍接受某些特殊伤害修正，另定义显式机制，不暗改本契约。

### 3.3 取整、最低伤害和 DoT

- **命中（hit）**：默认对合法的正伤害，在增伤、暴击、减伤之后一次取整；在现有规则要求时维持最少 1 点命中伤害。零/非法输入要明确处理，不能把 `NaN`、负值意外转换成 1 点伤害。
- **持续伤害（dot）**：按 `DPS × dt` 保留浮点精度，不逐帧取整，不逐帧最少 1 点，不触发普通命中的暴击、吸血、连锁和再灼烧；如未来需特殊例外，应由规则显式允许。
- **玩家受击**：S1/S2 保留当前浮点 HP 扣除习惯及 UI 取整显示方式，不为了“统一”改成整点扣血。
- **弹丸快照**：保留攻击发射时的原始伤害快照与 0.85 穿透/弹射衰减；陨星当前命中时取属性的行为亦暂时保留。不要引入隐式重算。

### 3.4 伤害决议顺序

统一编排层（CombatSystem）按以下顺序处理合法攻击：

1. 校验状态（目标死亡、非游戏战斗态、冷却/无敌帧等现有约束）。
2. 对玩家命中：保持 **闪避 → 临时壁垒 → 普通次数护盾** 的现有优先级；必要的 RNG 消耗条件与调用次数保持不变。
3. 计算命中原始伤害与各增伤乘区；按 `hit` 的既定条件进行一次暴击判定；`dot` 默认不暴击。
4. 由 DamageSystem 纯函数计算护甲/抗性及通用减伤；根据伤害类别执行精度政策。
5. CombatSystem 应用生命变化、已有护盾/冷却/死亡保护等效果；区分结算伤害和实际生命损失。
6. 执行当前攻击允许的吸血、击退、减速、施加燃烧、连锁、反伤、击杀爆炸、死亡掉落等效果；不能造成连锁递归失控。
7. 最后按原规则更新伤害报告、飘字、音效与其他表现。具体副作用顺序以现有代码为回归基准；**如与此概念顺序有差异，以不改变现有行为的适配实现为 S1/S2 首选**。

重要：**`hurtEnemy` 当前伤害和暴击由被击敌人所在方法结算，雷霆连锁继承上一击结算伤害、禁止二次暴击/再连锁；`damagePlayer` 的反伤只在实际扣血时发生**。需要保留这些语义，不应机械地把所有回调换成统一“每次命中都触发”。

### 3.5 统计与吸血

- `settledDamage`：此次伤害经过倍率/减伤后的**结算数值**；沿用现有 `dmgBy` 统计和吸血语义，保持历史对照，允许包含超出敌人剩余 HP 的溢出部分。
- `effectiveHpLoss = min(targetHpBefore, max(0, settledDamage))`：实际减少生命值；仅作为新结果字段/未来统计依据。被次数盾抵挡时为 0。
- `killed`、`preventedDeath` 和 `shieldUsed` 是应用结果，**不能由纯 DamageSystem 推断**。
- 不修改 `pixelrogue_records` 键、最近 50 场历史记录以及已存 `dmg` 结构。若未来更换报告口径，应加版本转换/独立统计，不直接重写历史数据。

## 4. 只读属性快照与接口草案

以下仅为**设计契约草案**，具体函数命名可以在 S1 实现时调整，不强制要求一次性迁移所有调用方：

```ts
type DamageTypeId = keyof typeof DAMAGE_TYPES;
type AttackForm = "melee" | "ranged" | "other";
type DamageKind = "hit" | "dot";

type ResistanceMap = Partial<Record<DamageTypeId, number>>;

interface CombatStatsSnapshot {
  attack: number;
  defense: number;
  critChance: number;
  critMultiplier: number;
  tough: number;
  resistances: ResistanceMap;
  // 新增伤乘区按类别读取，所有值默认为 0
  globalDamageBonus: number;
  typeDamageBonus: Partial<Record<DamageTypeId, number>>;
  formDamageBonus: Partial<Record<AttackForm, number>>;
  skillDamageBonus?: Readonly<Record<string, number>>;
}

interface DamageRequest {
  rawAmount: number; // 技能已算好的数值：禁止重复叠加角色 ATK
  type: DamageTypeId;
  form: AttackForm;
  origin: string; // 适配旧 DamageSource；实际运行应使用有约束的 ID
  kind: DamageKind;
  skillId?: string;
  tags?: readonly string[];
  attackerStats: Readonly<CombatStatsSnapshot>;
  defenderStats: Readonly<CombatStatsSnapshot>;
  // 暴击和可触发机制由编排层判定，计算器不调用 Math.random()
  isCritical: boolean;
}

interface DamageCalculation {
  rawDamage: number;
  beforeMitigation: number;
  settledDamage: number;
  isCritical: boolean;
}

interface DamageResult extends DamageCalculation {
  effectiveHpLoss: number;
  dodged: boolean;
  shieldUsed: "none" | "temporary" | "normal";
  killed: boolean;
  preventedDeath: boolean;
}
```

**依赖方向**：`Player/Enemy → 只读适配器 → DamageRequest → DamageSystem（纯计算） → CombatSystem（应用）`。纯计算器不得 import `Player`、`Enemy` 或 `GameCore` 类型；这些类型只留在适配器/编排层。`CombatStatsSnapshot` 不是另一个可变玩家对象，不能与实体状态双向同步。

`DamageRequest` 具体可拆为数值请求与运行上下文，以减少复制；不能因此引入全局可变单例。增加新伤害类型时仅要求配置减伤策略、抗性映射、展示元信息和测试；对已知策略复用即可，只有出现真正新公式时才扩展策略实现。

## 5. 现有攻击的默认映射

| 当前来源 | DamageType | AttackForm / Kind | 特别约束 |
| --- | --- | --- | --- |
| `bullet` 普通/魔弹 | `physical` | `ranged` / `hit` | 保留发射快照、魔弹 `boltDmgMul`、0.85 衰减 |
| `melee` | `physical` | `melee` / `hit` | 近战框架保持命中和击退语义 |
| `orbit` | `physical` | `other` / `hit` | 不仅凭攻击距离划为近战 |
| `thorns` | `physical` | `other` / `hit` | 反伤不强行叠加 ATK、禁止意外反伤循环 |
| `chain` | `lightning` | `other` / `hit` | 保留继承上次已结算伤害及 `noCrit/noChain` |
| `burn` | `fire` | `other` / `dot` | 无逐帧取整，无普通攻击命中触发链 |
| `meteor` | `fire` | `other` / `hit` | 按现有时序读取攻击值 |
| `explode` | `fire`（暂定） | `other` / `hit` | 保留 `fromExplode` 防递归 |
| 敌人接触/射弹/自爆 | 物理 / 物理 / 火焰（暂定） | `melee` / `ranged` / `other` | 维持原有命中判定和玩家受击逻辑 |

火焰不等于自动灼烧，雷电不等于自动连锁。异常状态与伤害属性独立；以后可有火焰近战、雷电弹丸、冰霜投射物等组合。所有暂定分类可在 S3 做平衡审查后确定。

## 6. 属性来源和实体数值的渐进式迁移

**S1–S3 不直接把 34 张天赋改成 Modifier 体系。** `player.damage`、`fireRate`、`crit`、`tough` 等现有字段先由适配器读取；`enemy.dmg` 目前主要代表敌方具体行为攻击数值，不应强制重命名为通用 `attack` 而改变含义。

S4 的目标边界：

```text
BaseStats（基础属性配置）
  + FlatModifiers（固定加成）
  + PercentModifiers（同属性加算）
  × FinalMultiplier（显式最终倍率）
  = EffectiveStats（只读计算结果）
```

角色运行状态（当前 HP、次数护盾、冷却、DoT 时间、是否死亡）必须与基础属性/属性修正值分离。玩家和敌人可以采用不同成长、生成、AI 逻辑，但共享 `CombatStatsSnapshot`。天赋重算 `TalentSystem.recompute()` 需要在 S4 专门处理生命保留与临时效果，不顺带重写所有天赋。属性计算缓存只有在确实有性能需求且具备失效规则时再引入。

## 7. 分阶段实施与验收

### S1：计算契约与可扩展伤害类型（P0）

**交付**：`DamageTypeRegistry`（或等效静态配置）、`DamageSystem` 纯函数、`CombatStatsSnapshot`、请求/计算结果类型、`combatBalance.ts`、新数值的单元测试。游戏运行入口暂不接新结果。

**验收**：
- [ ] 新增 `frost` 示例类型（只在单测/扩展样例中）无需修改 DamageSystem 的类型分支即可注册与计算；未知类型和非法输入有显式处理。
- [ ] 同乘区加算、跨乘区乘算；示例 `100×1.2×1.3×1.4=218.4`。
- [ ] 物理防御 20（K=50）单独减伤系数为 `50/70`；元素抗性 0/上限、真实伤害绕过减伤验证通过。
- [ ] 纯计算不读取 `GameCore`、不调用 `Math.random()`、不执行扣血/掉落/UI。
- [ ] 默认增伤 0、DEF=0、RES=0 时计算不改变现有合法离散命中结果；S1 不修改既有战斗调用方。

### S2：现有所有伤害路径接入（P0）

**交付**：通过适配器统一当前攻击请求、数值计算和伤害应用；`hurtEnemy` / `damagePlayer` 保持兼容入口；灼烧从直接改 `e.hp` 迁移到无副作用触发链的 DoT 入口。

**验收**：
- [ ] 普通/魔弹、近战、环绕、连锁、陨星、爆炸、荆棘、灼烧及所有敌方伤害完整迁移，无遗留未说明的直接扣血路径。
- [ ] RNG 调用次数与条件、技能触发顺序、连锁/爆炸防递归、盾/闪避顺序、吸血、0.85 衰减保持。
- [ ] DoT 在 60Hz 下 DPS 正确；玩家受到伤害与敌人受击的取整语义不回退。
- [ ] 默认所有新增伤为 0、护甲抗性为 0 时，原本可对照的游戏状态及伤害总量保持一致；允许对新增字段的结构差异做**明确断言**，不删原有回归测试。
- [ ] `npm run typecheck`、`npm test`、`npm run build` 通过；涉及浏览器流程时运行 `npm run test:browser` 并注明验收环境。

### S3：启用防御、抗性及属性/攻击方式增伤（P1）

**交付**：玩家/敌人可配置 DEF/RES/增伤；属性面板展示有效值；少量明确的数值来源使新增机制真实可玩。具体新增天赋、怪物 DEF、元素抗性分布单独经过平衡批准。

**验收**：
- [ ] 不同类型、同一来源的伤害能按配置产生不同最终伤害；同类型不同 form 也能享受各自增伤。
- [ ] 物理与元素抗性按选定公式生效；真实伤害遵循本规范的穿透定义；铁布衫叠乘生效。
- [ ] UI 与战斗计算一致；明确记录相较上游 v8 的**预期平衡差异**。
- [ ] 既有 `pixelrogue_records` 与本波/总伤害报表兼容；完整游戏流程实玩通过。

### S4：Stat System 与玩家/怪物数值模型渐进重构（P2，后续）

**交付**：逐步拆分 Base / Modifiers / Effective / RuntimeState；统一玩家/敌人只读战斗属性接口；天赋与装备、Buff 新需求出现时再接入。不得以 S4 完成为 S1–S3 前置条件。

**验收**：
- [ ] 增伤来源不重复生效；固定、百分比、最终倍率的叠加规则有明确测试。
- [ ] 游戏当前 HP、次数盾、Buff 时序和天赋撤销不受重算破坏。
- [ ] 用户可继续独立加入新伤害属性、攻击方式增伤和敌人战斗配置，无需复制整套公式。

## 8. 工程边界与风险控制

建议涉及文件（最终以实际代码审查为准）：

```text
src/game/core/DamageSystem.ts         [S1，纯计算]
src/game/core/types.ts                [S1，类型契约]
src/game/data/combatBalance.ts        [S1，数值常量]
src/game/data/damageTypes.ts          [S1，类型注册]
src/game/core/CombatSystem.ts         [S2，编排/应用]
src/game/core/{Attack,Melee,Projectile,Enemy}System.ts  [S2，调用适配]
src/game/data/{stats,enemies}.ts      [S3，数值数据]
src/ui/GameUI.ts                      [S3，界面]
```

特别注意当前目标仓库相较早期快照已有宝箱掉落、精英奖励成长、魔弹特化 (`boltDmgMul`)、近战框架以及新的 UI，开发必须以目标仓库**届时的最新提交**为准。不要从旧 Demo、旧 `main` 快照反向覆盖新增功能。不同阶段分支、独立 PR；**没有明确授权不得直接提交/推送 main 或合并**。

## 9. 设计状态与未来议题

> **修订记录（2026-10-24，用户授权）**：§9 所列"未授权设计扩展"中的**易伤**，
> 经用户批准随 Issue #42（灼烧叠层链）提前引入：灼热易伤（灼烧目标受伤 +10%/级）。
> 该机制以天赋驱动、仅对灼烧目标生效，不引入通用易伤乘区；S1/S2 实现时
> 作为显式乘区接入，并在 docs/migration.md 记录预期平衡差异。
> 同批批准的相关变更：灼烧叠层（#42）、冰冻定身（#38）、护盾破碎反震（#43）、
> 暴击满层觉醒（#41）、陨星智能落点与焦土燃烧（#45）。

- **已确定**：DamageType 可扩展；DamageType/Form/Origin/Tags 正交；同乘区加算、跨乘区乘算；K/(K+DEF) 防御；元素抗性；铁布衫乘算；真实伤害绕过普通数值减伤；现有次数护盾不重做；S1→S2→S3→S4 渐进迁移。
- **实验参数**：K=50、元素抗性最高 75%，S3 可根据真实试玩与测试数据调整。
- **尚未授权的设计扩展**：穿甲、负抗性、易伤、百分比护盾、元素反应、DoT 继承近战增伤、真实伤害穿透次数盾、全面属性 Modifier 化、重写历史伤害报告。需要另开 Issue 或正式修改本规范。

> 本文是设计规范，不代表代码已经实现、测试已通过或已经合并。实际开发须遵循 `AGENTS.md` 和项目 PR 流程。
