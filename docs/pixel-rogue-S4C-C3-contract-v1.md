# Pixel Rogue · Combat Foundation S4-C C3 行为契约冻结 v1.2

> 阶段：**C3-0（契约冻结 + 基线测试 + 架构准备）——只交付审计、测试与设计，不实施任何生产行为变更。**
> 基线：上游 `reopen64534042-sudo/pixel-rogue` main `de37d93`（PR #93，C2-B 合并提交）。
> 前序记录：docs/migration.md「D-19（C0+C1）/ D-20（C2-A）/ D-21（C2-B）」。
> 审批口径：六项行为差异 D-C3-01～D-C3-06 **已经用户批准**，属「已批准、待分阶段实施」的冻结契约。本任务与其后的 C3-A/B/C 实施均**不得自行修改审批口径**；任何口径外的新差异须另行报批。
> 修订记录：**v1.1（2026-10-26，C3-0 第一轮评审修订）**——P2-1 恢复已批准的狂热降级夹紧口径（§2/§4.2/§5.3/§6/§10/G-12/D-22）；P2-2 纠正 dashMax 方案：有序 flat 来源逐位复现旧值（B16 验证），撤回「查表为唯一方案」的错误结论（§3.4/§5.1/§8.3/§10）；P3 持久来源统一命名 `potionMaxHpGrow`、投影签名改必传参数、新增 G-23（§2/§3.1/§5.1/§7.2/§10）。**v1.2（2026-10-26，第二轮复审定向修订）**——P2 §5.3 `EffectiveCaps.hasteCap` 零级哨兵表达式（hasteLv>0 → 3+hasteLv，=0 → 0）与 2→1、1→0 两分支示例；P3 §3.4 dashLv 行清除折叠公式残留、明确 dashMax 由有序 flat −0.4/级独立解析；P3 §9 验收编号归属修正（C3-A 含 G-23、C3-C 为 G-10~G-22，G 用例内容不变）。

---

## 0. 文档定位

C3 处理 S4-C 剩余的**混合天赋**（属性贡献 + 获得时即时效果）：生命之泉、巨人血脉、能量护盾、击杀狂热、疾影步，以及等级型机制卡（壁垒、二段冲刺、不屈、战意沸腾）的运行状态保护问题。S4 实施任务书 §4-S4-C.2 的原始要求：

> `Talent.f(player)` 中有即时运行副作用的卡必须把**属性贡献**与**获得时效果**分开处理：生命上限+即时补血、护盾上限+当前护盾、狂热初次触发、冲刺解锁。重算时不得重放获得时效果；但当前历史语义若不同，应列出独立的批准差异清单。

本文档即该「独立的批准差异清单」的冻结版：第 2 节逐项定义六项已批准差异，第 3 节给出全量字段所有权审计，第 4 节给出四个入口的新旧执行顺序，第 5 节给出 C3-A/B/C 最小接口设计（只设计、不接入），第 6 节处理边界场景，第 7 节给出测试映射与 Given/When/Then 验收规范。

**C3-0 交付边界（已执行）**：零生产行为变化；`TalentSystem.ts`、`SwapSystem.ts`、`WaveSystem.ts`、`PlayerSystem.ts`、`CombatSystem.ts`、`StatModel.ts`、`TalentStatSources.ts`、`data/talents.ts`、`data/stats.ts` 全部未改动；仅新增本设计文档、`tests/s4c-c3-baseline.test.ts`（旧行为基线）与 migration.md 记录。

---

## 1. 分类框架：四类状态

后续所有字段判定与接口设计都按以下四类归类（与 Combat Foundation v1 §6 的 Base/Modifiers/Effective/RuntimeState 分层衔接）：

| 类别 | 定义 | 重算（recompute）时的处理 | 本批涉及 |
|---|---|---|---|
| **Base/Modifiers/EffectiveStats**（可派生属性） | 数值完全由来源（picks + 持久来源 + 数据层基础值）决定，可依据来源重新解析且结果唯一 | **允许重建**（现有 C1/C2-A/C2-B 投影即此类） | 生命之泉/巨人血脉的 maxHp 贡献、能量护盾 shieldMax、击杀狂热 hasteLv、疾影步 dashLv/dashMax、二段冲刺 dashChargeLv、壁垒 barrierLv、不屈 nd、战意沸腾 rageLv |
| **RuntimeState**（运行状态） | 当前资源、剩余时间、消耗标记等**过程量**；不能无条件重建，否则构成「恢复资源/刷新倒计时/重放 Buff」类缺陷 | **保留现值**；仅在上限降低时按已批准策略做必要夹紧 | hp（受 D-C3-05 夹紧）、shield、shieldCd、haste、hasteT、rageT、dashT、dashCharges、dashRe、meteorT、tempShield、ndUsed、orbA、hurtCd、dx、dy |
| **OnAcquireEffect**（获得时效果） | 每次**成功学习**卡牌时执行的一次性效果；与卡牌等级的属性贡献正交 | **绝不重放**（D-C3-02/03 的核心诉求） | 生命之泉回满、巨人血脉 +30 当前 HP、能量护盾赠 1 层、击杀狂热首级 haste=1/hasteT=3 |
| **PersistentSource**（持久来源） | 不依赖当前天赋 picks 的持久属性来源，跨换波保留、仅新游戏重置 | **参与属性解析**（作为独立来源进入 StatModel） | 满血血包永久 maxHp 成长（现状直接写进 `p.maxhp`，无独立来源 → R-1 缺陷根源） |

关键判据：**「重算后能否从 picks + 持久来源唯一重建」**。能 → 属性；不能 → 运行状态。等级型字段（hasteLv、barrierLv、nd、rageLv、dashLv、dashMax、dashChargeLv、shieldMax）虽由天赋 `f` 写入，但取值完全由 picks 决定，属**属性**；其对应的现值/计时字段（haste/hasteT、tempShield、ndUsed、rageT、dashT/dashCharges/dashRe、shield/shieldCd）属**运行状态**。

---

## 2. 六项已批准差异（D-C3-01～06）完整定义

以下每项给出：现状（旧行为，含缺陷编号）、批准后的新行为、涉及字段。旧行为基线由 `tests/s4c-recompute-audit.test.ts`（R-1～R-5）与本批 `tests/s4c-c3-baseline.test.ts` 共同钉住。

### D-C3-01 修复血包永久 maxHp 成长丢失

- **现状（R-1 缺陷）**：满血拾取血包时 `ProgressionSystem` 直接 `p.maxhp += 1`（受 `potionGrow < POTION_GROW_CAP(10)` 每波上限），加成写入实体字段但**无来源记录**。`recompute()` 以 `Object.assign(statBase())` 重置后按 picks 重放，血包成长无重放来源 → 永久成长丢失（`src/game/core/ProgressionSystem.ts:56-60`、`src/game/core/TalentSystem.ts:36`）。
- **新行为**：引入 **PersistentSource**（GameCore 实例级累计值，统一命名 `potionMaxHpGrow`），满血转化时 `potionMaxHpGrow += 1` 且同步写实体兼容字段；属性解析将 `statBase().maxhp + 生命卡 flat + potionMaxHpGrow` 合成权威 maxHp。recompute 后成长保留。生产权威投影路径（learnTalent/recompute/melt→learnTalent）**必须拿到当前 GameCore 实例的累计成长来源**——扩展签名设为必传参数，杜绝漏传可选参数而静默按 0 重建（v1.1/P3，见 §5.1/§10.8）。
- **涉及字段**：`maxhp`（Player）、`potionGrow`（GameCore，仅为每波转化计数上限，**不是**成长累计本身）、新增 `potionMaxHpGrow`（GameCore 实例字段，非 Player 可枚举字段，见 §5.1 注意）。
- **保留语义**：每波 `POTION_GROW_CAP` 上限、满血才转化、转化同时 `hp += 1`、飘字「生命上限+1」全部不变。

### D-C3-02 重算不恢复已消耗护盾；上限降低时夹紧

- **现状（R-2 缺陷）**：能量护盾 `f` 无条件 `shieldMax++; shield++`。recompute 重放 f → 已消耗的盾层恢复满值；同时 `shieldCd` 被 statBase 重置为 0（`data/stats.ts:31`），若盾未满则下一帧立即恢复一层（恢复 CD 也被清除）。
- **新行为**：`shieldMax` 属属性（按 picks 解析）；`shield` 属 RuntimeState——重算**保留**当前层数，不重放赠送；`shieldCd` 保留倒计时。上限降低（置换移除层级）时 `shield = min(shield, shieldMax)` 夹紧。
- **涉及字段**：`shieldMax`（属性）、`shield`（RuntimeState）、`shieldCd`（RuntimeState）。
- **保留语义**：获得卡牌时的「赠送 1 层」仍是 OnAcquireEffect（learnTalent 路径正常触发）；恢复 CD 10s、破碎反震、消耗顺序不变。

### D-C3-03 狂热不由重算触发；降级夹紧层数、移除最后一级时清除 Buff

- **现状（R-3 缺陷）**：击杀狂热 `f`：`hasteLv++; if (hasteLv === 1) { haste = 1; hasteT = 3; }`。recompute 重放 → 第一级「首次获取」条件重放 → Buff 在休整期重新触发。真实学习路径中第二级不触发（hasteLv 已 ≥1），两种入口行为不一致——这正是缺陷的形态。
- **新行为**：`hasteLv` 属属性（按 picks 解析）；`haste/hasteT` 属 RuntimeState——获得时效果（`haste=1, hasteT=3`）只在 learnTalent 的获得路径执行（且仅当获得前 `hasteLv === 0`）；重算**绝不**触发。降级协调（已批准口径，v1.0 初版误推荐「不夹紧」，第一轮评审 P2-1 恢复）：hasteLv 降级且仍 >0 时，当前 `haste` **夹紧至 `hasteCap(newHasteLv)`**（`3 + hasteLv`），**不刷新 hasteT**；hasteLv 从 >0 降为 0 时，清除 `haste = 0, hasteT = 0`。
- **涉及字段**：`hasteLv`（属性）、`haste`/`hasteT`（RuntimeState）。
- **保留语义**：击杀叠层 `haste = min(hasteCap(hasteLv), haste+1)`、`hasteT = 2 + hasteLv` 刷新、受伤 -2 层、到期归零、攻速消费点公式全部不变。
- **可达性备注**：击杀狂热为 t3 天赋，`selectMaterial` 拒绝 `u.t > 2` 的材料（`src/game/core/SwapSystem.ts:44`），**当前游戏机制无法经置换移除 t3 卡**；该清除规则面向未来任何降级路径与 recompute 侧协调（可直接构造 picks 验证），属防御性契约冻结。

### D-C3-04 分阶段保护运行状态

- **现状（R-4 缺陷）**：`recompute()` 的 `Object.assign(statBase())` 覆盖全部 statBase 字段，其中混入运行状态：`dashT/dashCharges/dashRe`（冲刺充能与冷却）、`meteorT`（陨星计时）、`tempShield`（壁垒临时盾）、`ndUsed`（不屈本波已触发）、`orbA`（飞刃相位）、`hurtCd`（受击无敌帧）、`dx/dy`（冲刺方向记忆）、`shield/shieldCd`（见 D-C3-02）、`haste/hasteT`（见 D-C3-03）。
- **新行为**：recompute 改为「保存 → 重建属性 → 恢复运行状态 → 上限协调」；RuntimeState 字段按 C3-A/B/C 分批从「被覆盖」改为「保留」（分阶段保护）。显式换波事件（startNextWave）**仍按原逻辑**重置 `potionGrow/tempShield/ndUsed` 等字段——只有 recompute 被禁止重置它们。
- **涉及字段**：上列全部 + `fireCd`（现状即幸存：不在 statBase，recompute 不触碰；新机制下同样保留）。
- **分阶段顺序**：C3-A 保护生命相关（hp 由夹紧承接）；C3-B 扩展护盾（shield/shieldCd）；C3-C 扩展狂热与冲刺及其余 R-4 字段（meteorT/tempShield/ndUsed/orbA/hurtCd/dx/dy/dashT/dashCharges/dashRe）。每批扩充白名单并跑全量基线。

### D-C3-05 保持原有 HP 夹紧规则

- **现状（保护语义，非缺陷）**：`recompute()` 末尾 `hp = max(1, min(hpBefore, maxhp))`（`src/game/core/TalentSystem.ts:57`）。该夹紧恰好中和了重放型治疗（生命之泉回满/巨人血脉 +30 在重放中发生，随后被 `min(hpBefore, ·)` 覆盖）——这是 R-1～R-3 缺陷至今只影响上限值、不直接回血的原因。
- **新行为**：**逐字保留**。hp 始终以重算前的 hpBefore 与新有效上限夹紧；不因 RuntimeState 分离而改变。
- **已知边界（一并冻结）**：`max(1, …)` 下限意味着 hpBefore ∈ (0, 1)（浮点伤害可产生，玩家受击 preserve-float）时 recompute 会把 hp 提升到 1——该微小「抬升」属现有夹紧公式的一部分，随 D-C3-05 一并保留，不视为独立缺陷。
- **涉及字段**：`hp`。

### D-C3-06 冲刺充能及 CD 保留：不补充、不刷新、不按比例缩放剩余时间

- **现状（R-4 冲刺子项）**：recompute 重置 `dashT = -1`（CD 清零 → 立即可冲刺）、`dashCharges = 1`（已消耗充能补回）、`dashRe = 0`（恢复倒计时清零）。
- **新行为**：三个字段全部保留现值。升级缩短 `dashMax` 时 `dashRe` **不按比例缩放**（剩余时间原样）；降低充能上限（`1 + dashChargeLv` 变小）时仅做必要夹紧 `dashCharges = min(dashCharges, 1 + dashChargeLv)`；正在冲刺（dashT > 0）时 recompute 不中断冲刺运动。
- **涉及字段**：`dashT/dashCharges/dashRe`（RuntimeState）；`dashLv/dashMax/dashChargeLv`（属性，按 picks 解析）。
- **保留语义**：冲刺消耗/充能/触发条件（`PlayerSystem.ts:22-40`）与 280 px/s 固定速度、冲刺无敌窗（`dashT <= 0` 才可被命中）全部不变。

---

## 3. 全量字段所有权与生命周期矩阵

所有判断均引用实际调用点（文件:行号，基于基线 `de37d93`）；未列出的 Player 字段不涉 C3（picks/upCounts/lvl/xp/xpNext/fireCd 见 §3.6）。

### 3.1 生命：`maxhp`、`hp`、`potionGrow`

| 字段 | 分类 | 写入事件（全部） | 消费者 | recompute 策略（新） | 审批项 |
|---|---|---|---|---|---|
| `maxhp` | 属性（Effective） | ① `statBase()`=100（resetGame `GameCore.ts:216`、recompute `TalentSystem.ts:36`）② 生命之泉 f +20（`talents.ts:73`，获得时+重放）③ 巨人血脉 f +30（`talents.ts:443`，获得时+重放）④ 满血血包 `maxhp += 1`（`ProgressionSystem.ts:58`）⑤ recompute 后 hp 夹紧读取 | regen 夹紧 `PlayerSystem.ts:57`；血包满血判定/治疗夹紧 `ProgressionSystem.ts:54,65`；recompute 夹紧 `TalentSystem.ts:57`；UI/draw 显示 | **按来源重建**：`statBase + 泉20×lv + 巨人30×lv + potionMaxHpGrow`（D-C3-01；投影必传持久来源，见 §5.1）；C3-0 阶段不接入 | D-C3-01 |
| `hp` | RuntimeState（受夹紧） | ① resetGame=100 ② 泉 f `hp = maxhp`（回满）③ 血脉 f `hp += 30` ④ 血包治疗 `min(maxhp, hp+20)` / 满血转化 `hp+=1`（`ProgressionSystem.ts:59,65`）⑤ regen 逐帧 `min(maxhp, hp + regen·dt)`（`PlayerSystem.ts:57`）⑥ 受击 `p.hp -= dmg`（`CombatSystem.ts:339`）⑦ 不屈 `hp = 1`（`CombatSystem.ts:376`）⑧ recompute 夹紧（`TalentSystem.ts:57`） | 死亡判定 `hp <= 0`（`CombatSystem.ts:341,372`）；UI/draw | **保留 + 夹紧**：`max(1, min(hpBefore, maxhp))` 逐字保留（D-C3-05）；获得路径的治疗仍发生在 learnTalent | D-C3-05（及 D-C3-01 转化） |
| `potionGrow` | GameCore 波次计数（**非** Player 字段） | resetGame=0、startNextWave=0（`WaveSystem.ts:23`）、满血转化 ++（`ProgressionSystem.ts:57`） | 满血转化上限判定 | 不适用（recompute 不触碰 GameCore 波次字段） | D-C3-01（重置语义不变） |

**特别说明（任务书要求）**：`potionGrow` 仅是「本波已转化次数」计数器，用于每波 `POTION_GROW_CAP=10` 的上限判定；它**不等于**累计永久成长。现状永久成长直接累加进 `p.maxhp` 而无独立来源，这正是 R-1 缺陷根源；C3-A 引入的 `potionMaxHpGrow`（GameCore 实例字段）才是持久来源，`potionGrow` 语义原样保留。

### 3.2 护盾：`shieldMax`、`shield`、`shieldCd`、`tempShield`、`barrierLv`

| 字段 | 分类 | 写入事件（全部） | 消费者 | recompute 策略（新） | 审批项 |
|---|---|---|---|---|---|
| `shieldMax` | 属性 | ① statBase=0 ② 能量护盾 f ++（`talents.ts:286`） | 恢复 gate `PlayerSystem.ts:59`；UI `GameUI.ts:289` | 按 picks 解析（C3-B 接入权威表） | D-C3-02 |
| `shield` | RuntimeState | ① statBase=0 ② 能量护盾 f ++（**OnAcquireEffect：获得赠 1 层**，`talents.ts:287`）③ 恢复 ++（`PlayerSystem.ts:62`，条件 `shieldMax && shield < shieldMax`，每 10s）④ 受击消耗 --（`CombatSystem.ts:300`，破盾反震 80px、`shieldCd=10`、`hurtCd=0.5`） | 消耗顺序第 3 优先（闪避→壁垒→护盾，`CombatSystem.ts:293-321`）；draw/UI 显示 | **保留现值**；降上限时 `min(shield, shieldMax)` 夹紧；不重放赠送 | D-C3-02 |
| `shieldCd` | RuntimeState | ① statBase=0 ② 破盾 =10（`CombatSystem.ts:301`）③ 恢复成功重置 =10（`PlayerSystem.ts:63`）④ PlayerSystem 倒计时（仅 `shield < shieldMax` 时，`PlayerSystem.ts:59-66`；满盾时冻结不重置） | 恢复 gate | **保留现值**（现状被 statBase 清 0 → 未满盾时立即恢复一层，属 R-2 同源缺陷） | D-C3-02 |
| `tempShield` | RuntimeState（波次） | ① statBase=0 ② startNextWave `= barrierLv`（**赋值重建，非累加**，`WaveSystem.ts:29`）③ 受击消耗 --（`CombatSystem.ts:294`，无 CD） | 消耗顺序第 2 优先（`CombatSystem.ts:293`）；draw | **保留现值**（C3-C 批次）；换波显式重置不变 | D-C3-04 |
| `barrierLv` | 属性 | ① statBase=0 ② 壁垒 f ++（`talents.ts:469`） | startNextWave 重建 tempShield；UI `GameUI.ts:290` | 按 picks 解析（C3-C） | D-C3-04（等级型属性迁移范围） |

**能量护盾与壁垒的区分**：能量护盾提供**普通次数护盾**（`shield/shieldMax`，有 10s 恢复 CD、破碎反震）；壁垒提供**每波临时盾**（`tempShield`，无恢复、换波按 `barrierLv` 重建）。受击消耗顺序固定：闪避 → tempShield → shield → 扣血（`CombatSystem.ts:287-321`）。**`tempShield` 不计入 `shieldMax` 上限**（独立字段，恢复逻辑只看 `shield < shieldMax`）。

### 3.3 狂热：`hasteLv`、`haste`、`hasteT`、`rageLv`、`rageT`

| 字段 | 分类 | 写入事件（全部） | 消费者 | recompute 策略（新） | 审批项 |
|---|---|---|---|---|---|
| `hasteLv` | 属性 | ① statBase=0 ② 击杀狂热 f ++（`talents.ts:341`） | `hasteCap(hasteLv)=3+hasteLv`（`talents.ts:10-12`）；killEnemy 叠层/刷新；pv/cur 显示 | 按 picks 解析（C3-C） | D-C3-03 |
| `haste` | RuntimeState | ① statBase=0 ② **OnAcquireEffect**：f 首级（hasteLv===1）`haste=1, hasteT=3`（`talents.ts:342-345`）③ killEnemy `haste = min(hasteCap, haste+1)` 且 `hasteT = 2 + hasteLv`（`CombatSystem.ts:163-165`）④ 受击 `haste -= min(haste, 2)`（`CombatSystem.ts:362-365`）⑤ 衰减 `hasteT -= dt; ≤0 → haste=0`（`PlayerSystem.ts:68-71`） | 攻速消费点 `AttackSystem.ts:17-19`：`1/(fireRate × (1 + haste×0.1 + (rageT>0 ? 0.2×rageLv : 0)))` | **保留现值**；等级**部分下降**时夹紧 `haste = min(haste, hasteCap(newHasteLv))`（**hasteT 不刷新**，零级哨兵与两分支示例见 §5.3）；**末级移除**（hasteLv 降为 0）时清除 `haste=0, hasteT=0`；绝不重放首级 Buff | D-C3-03 |
| `hasteT` | RuntimeState | 同上 ②③⑤（f 首级=3；击杀刷新=2+hasteLv；衰减） | 衰减 gate | 同 `haste` | D-C3-03 |
| `rageLv` | 属性 | ① statBase=0 ② 战意沸腾 f ++（`talents.ts:457`） | 攻速消费点（rageT>0 时 `0.2×rageLv`）；UI | 按 picks 解析（C3-C，随等级型属性一并） | D-C3-04 |
| `rageT` | RuntimeState | ① statBase=0 ② 受击且 rageLv>0 时 =3（`CombatSystem.ts:367`）③ 衰减 `rageT -= dt`（`PlayerSystem.ts:72`，rageT>0 时；rageLv 不受影响） | 攻速消费点 | **保留现值**（独立运行状态，任何 C3 批次都不清除） | D-C3-04 |

**基础等级 vs Buff 的区分**：`hasteLv/rageLv` 是永久天赋等级（属性）；`haste/hasteT` 是击杀狂热的**当前 Buff 层数与持续时间**；`rageT` 是战意沸腾的**剩余时间**。攻速加成在 AttackSystem 开火时实时乘算，不烘焙进 `p.fireRate`（C2-B 已钉，见 D-21）。

### 3.4 冲刺：`dashLv`、`dashMax`、`dashCharges`、`dashRe`、`dashT`、`dashChargeLv`

| 字段 | 分类 | 写入事件（全部） | 消费者 | recompute 策略（新） | 审批项 |
|---|---|---|---|---|---|
| `dashLv` | 属性（解锁等级） | ① statBase=0 ② 疾影步 f：首级 `dashLv=1, dashMax=2.0`，后续 `dashLv++` 且 `dashMax -= 0.4`（`talents.ts:302-308`） | 充能/触发 gate（`PlayerSystem.ts:25,32`）；二段冲刺 req `p.dashLv > 0`（`talents.ts:480`）；命中判定 `p.dashT <= 0` 配套 | 按 picks 解析（C3-C）：dashLv 为 flat +1/级（base 0，整数精确）；**dashMax 不由 dashLv 推导**，由有序 flat −0.4/级独立解析（base 2.4，见下一行与 §10.1；折叠公式禁止，见 §8.3） | D-C3-06（属性侧） |
| `dashMax` | 属性 | ① statBase=2.4（未解锁时不消费）② 疾影步 f（同上） | 充能赋值 `dashRe = dashMax`（`PlayerSystem.ts:29,35`） | 按 picks 解析（C3-C）：**有序 flat 来源**（base 2.4 + 每级单独 flat −0.4）经现有 StatModel 逐位复现旧 f 序列 2.0 / 1.6 / **1.2000000000000002**（B10 钉住旧值、B16 钉住解析等价；注意折叠式 `2.4 − 0.4×lv` 先乘后减则不逐位一致，见 §8.3） | D-C3-06 |
| `dashCharges` | RuntimeState | ① statBase=1 ② 冲刺消耗 --（`PlayerSystem.ts:34`）③ 充能 ++（`PlayerSystem.ts:28`，`dashLv && dashCharges < 1+dashChargeLv` 时） | 触发 gate `dashCharges > 0` | **保留现值**；仅充能上限降低时 `min(dashCharges, 1+dashChargeLv)` 夹紧；不补回已消耗 | D-C3-06 |
| `dashRe` | RuntimeState | ① statBase=0 ② 充能完成后 `dashRe = dashMax`（`PlayerSystem.ts:29`）③ 冲刺后若 `dashCharges === dchMax−1 && dashRe <= 0` 则 `= dashMax`（`PlayerSystem.ts:35`）④ 倒计时（`PlayerSystem.ts:26`） | 充能 gate | **保留现值**；dashMax 缩短不缩放剩余 dashRe | D-C3-06 |
| `dashT` | RuntimeState | ① statBase=−1 ② 触发 =0.16（`PlayerSystem.ts:33`，条件 `dashLv && keys[" "] && dashCharges>0 && dashT <= −0.1`）③ 倒计时（`PlayerSystem.ts:22`，无 gate） | 冲刺运动 `dashT > 0` 沿 dx/dy 280 px/s（`PlayerSystem.ts:38-40`）；无敌窗 `hurtCd <= 0 && dashT <= 0`（`ProjectileSystem.ts:115`、`EnemySystem.ts:231,266`） | **保留现值**；正在冲刺时 recompute 不中断 | D-C3-06 |
| `dashChargeLv` | 属性 | ① statBase=0 ② 二段冲刺 f ++（`talents.ts:482`） | 充能上限 `dchMax = 1 + dashChargeLv`（`PlayerSystem.ts:24`） | 按 picks 解析（C3-C） | D-C3-06 |

**解锁与降级**：冲刺能力由 `dashLv > 0` 门控（充能、触发、req 前置）；置换移除疾影步后 dashLv=0 → 充能与触发全部停摆（dashT 保留值继续自然倒计时）；同波重新获得走首级分支（`dashMax=2.0`，与解析式一致）。二段冲刺 req 只影响**卡池投放**（canOffer），不影响直接学习与已学状态。

### 3.5 其他运行状态审计

| 字段 | 分类 | 写入事件（全部） | 消费者 | recompute 策略（新） | 审批项 |
|---|---|---|---|---|---|
| `meteorT` | RuntimeState | ① statBase=4 ② 陨星倒计时/触发后重置 `= max(2.2, 4.6 − meteor×0.4)`（`AttackSystem.ts:98-100`，gate `p.meteor > 0`） | 陨星投放节奏 | **保留现值**（现状被重置为 4 → 在途计时被打断/推迟） | D-C3-04 |
| `nd` | 属性 | ① statBase=0 ② 不屈 f =1（`talents.ts:495`） | 致死保护 gate（`CombatSystem.ts:374`）；pv/cur | 按 picks 解析（C3-C） | D-C3-04 |
| `ndUsed` | RuntimeState | ① statBase=false ② 触发不屈 =true（`CombatSystem.ts:375`）③ startNextWave =false（`WaveSystem.ts:30`） | 不屈 gate `p.nd && !p.ndUsed` | **保留现值**；换波显式重置不变 | D-C3-04 |
| `orbA` | RuntimeState | ① statBase=0 ② 环绕飞刃相位 `orbA += 4·dt`（`AttackSystem.ts:50`，gate `orbit > 0`） | 飞刃位置（`AttackSystem.ts:52`、`ProjectileSystem.ts:70`、`draw.ts:301`） | **保留现值**（现状清 0 → 飞刃角度跳变，纯视觉但属行为差异） | D-C3-04 |
| `hurtCd` | RuntimeState | ① statBase=0 ② 破盾 =0.5 / 实扣血 =0.6（`CombatSystem.ts:302,338`）③ 倒计时（`PlayerSystem.ts:56`） | 敌接触/弹幕命中 gate（`EnemySystem.ts:231,266`、`ProjectileSystem.ts:115`） | **保留现值** | D-C3-04 |
| `dx`/`dy` | RuntimeState（方向记忆） | ① statBase dx=1/dy=0 ② 有移动输入时更新（`PlayerSystem.ts:18-21`） | 冲刺方向（`PlayerSystem.ts:39-40`） | **保留现值**（现状重置为向右） | D-C3-04 |

### 3.6 边外确认：意外幸存与无写入者字段

- **`fireCd`**：不在 statBase（`data/stats.ts` 无此键），仅 `resetGame`（=0）与 `AttackSystem.ts:13-45` 写入 → **recompute 天然不重置**。RuntimeState 分离后继续保留，无迁移动作。
- **`lvl/xp/xpNext/upCounts/picks`**：不在 statBase；由 `ProgressionSystem.ts:33-38` 与 learnTalent/melt 写入 → recompute 不触碰。
- **`slow`**：statBase 含 `slow: 0`，但全仓无玩家侧写入者（寒冰只写敌人 `e.slowT/e.slowF`，`CombatSystem.ts:93-95`）→ 恒 0，recompute 重置无行为影响；列于 statBase 清理的观察项，不在本批处理。
- **C3 混合卡之外的 `f` 写入字段**（multishot/pierce/orbit/regen/luck/chain/explode/thorns/lifesteal/dodge/burn/frostLv/scorchVuln/burnSpread/meteorGuided/burnGround/bladeReflect/ricochet 等）：全部可由 picks 重放唯一重建，属属性；C3 不迁移（保持 f 重放），与 D-19 C0 分类的 A/B/E 类一致。
- **审计结论**：除上列 R-1～R-4 已定界字段外，**未发现新的**「被 `Object.assign(statBase())` 覆盖但未列入 C0」的运行字段；`fireCd` 幸存、`slow` 无写入者已在上面单独说明。

---

## 4. 四入口新旧执行顺序对照

### 4.1 learnTalent（`src/game/core/TalentSystem.ts:60-70`）

**旧顺序（现状，逐语句）**：

```
① max 校验（upCounts[n] >= max → return false）
② u.f(player)                       ← 属性贡献与获得时效果混在一起执行
③ upCounts[n] += 1
④ picks.push(n)
⑤ applyTalentStatProjection(player) ← C1/C2-A/C2-B 十三张卡的权威投影
```

**新顺序（C3 设计，分批落地）**：

```
① max 校验（不变；hidden/req 仍只在卡池层 canOffer 检查）
② lvBefore = upCounts[n] ?? 0        ← 新增：记录获得前等级
③ 混合卡：跳过 f 的属性写入（f 改空操作，C1 先例）；未迁移卡：仍执行 f
④ upCounts[n] += 1；picks.push(n)    ← 记录顺序不变
⑤ applyTalentStatProjection 扩展版   ← 含 C3 卡属性（maxHp/shieldMax/dashLv/…）
                                        与 PersistentSource（potionMaxHpGrow）
⑥ applyOnAcquireEffect(n, p, lvBefore) ← 新增：一次性效果（§5.2），仅在成功获得时
⑦ reconcileRuntimeToCaps（防御性：上限只升场景下为无操作）
```

**行为差异（全部属已批准项）**：生命之泉/巨人血脉的 maxhp 由投影写入而非 f（数值逐位一致：20×lv / 30×lv 累加）；回满/+30/赠盾/首级 Buff 改由 ⑥ 执行，**只在真实获得时发生一次**；学习路径的 RNG 消耗仍为 0。

### 4.2 recompute（`src/game/core/TalentSystem.ts:34-58`）

**旧顺序（现状，含 R-1～R-4 缺陷）**：

```
① hpBefore = player.hp
② Object.assign(player, statBase())   ← 覆盖全部 statBase 字段（含运行状态！）
③ delete 六个 S3 可选属性键
④ 重放 picks 的 talent.f              ← 重放获得时效果（R-2/R-3 缺陷根源）
⑤ applyTalentStatProjection
⑥ hp = max(1, min(hpBefore, maxhp))   ← 夹紧中和重放治疗（D-C3-05 保留）
```

**新顺序（C3 设计）**：

```
① hpBefore = player.hp（不变）
② captureRuntimeState(player)         ← 新增：快照 RuntimeState 白名单（D-C3-04 分批扩充）
③ Object.assign(player, statBase())  （保留——未迁移卡 f 重放需要基底）
④ delete 六键（不变）
⑤ 重放 picks 的 f（混合卡 f 已是空操作 → 不再重放获得时效果）
⑥ applyTalentStatProjection 扩展版（含 PersistentSource → 修复 R-1）
⑦ restoreRuntimeState(player)        ← 新增：回写运行状态（不恢复资源/不刷新持续时间的
                                        字段值原样回写；hp 不在白名单）
⑧ reconcileRuntimeToCaps             ← 新增：shield/dashCharges/haste 上限夹紧
                                        （haste 夹紧不刷新 hasteT）、hasteLv=0 清
                                        Buff（D-C3-02/03/06）
⑨ hp = max(1, min(hpBefore, maxhp))  ← 逐字保留（D-C3-05）
```

**行为差异**：②⑦⑧ 为纯新增步骤；③④⑤ 的形式保留但混合卡 f 空操作后 ④ 不再产生属性/效果写入；⑥ 吸收血包成长来源。重算幂等性保持（recompute×N 结果不变，现有 C1/C2 测试口径延续）。

### 4.3 melt（`src/game/core/SwapSystem.ts:60-106`）

**旧顺序（现状）**：

```
① 状态校验（play/rest/swapOpen/swapUsedThisRest/swTarget/选中数=2/材料合法性）
② pool = availTalents(swTarget)；output = pool[floor(random×len)]   ← 恰好 1 次 Math.random
③ 删除材料：picks.splice(lastIndexOf) × count；upCounts -= count；归零删键
④ recompute()
⑤ learnTalent(output)                 ← C1 起：f → upCounts → picks → 投影
⑥ 清 swSel/swTarget/swapOpen；swapUsedThisRest = true；view.rest()；beep；return output
```

**新顺序**：**结构零改动**——③④⑤ 的次序、RNG 消耗次数与位置、材料校验时机全部不变；变化的只是 ④⑤ 内部按 4.2/4.1 的新语义执行。因此：

- 输出卡仍经 learnTalent 获得一次性效果（如输出能量护盾 → 正常赠 1 层）；
- 材料移除导致的上限下降经 recompute 的 ⑧ 夹紧（shield/dashCharges）与 ⑨ hp 夹紧；
- 卡池与前置检查（availTalents→canOffer）时机不变。

### 4.4 startNextWave（`src/game/core/WaveSystem.ts:7-41`）

**旧顺序（现状）**：

```
① 校验（play/rest/pendingLevels==0）→ 关 bpMode/swap 面板
② waveN++、beginWaveReport、quota、spawnedThisWave=0
③ potionGrow = 0（每波转化计数重置；已获成长保留在 maxhp）
④ boxDropsThisWave / eliteBoxPointsThisWave = 0；spawnCd = 1.2
⑤ wavePhase = "fight"；tempShield = barrierLv（重建）；ndUsed = false；swapUsedThisRest = false
⑥ 飘字/音效
```

**新顺序**：**零改动**。显式换波事件仍按原逻辑重置对应状态（D-C3-04 的「显式换波事件例外」）；C3-A 引入的 `potionMaxHpGrow` **不**在重置列表中（换波保留、新游戏 resetGame 重置）。

### 4.5 新时序必须满足的六项不变式（任务书 §二，逐条对应）

| 不变式 | 保证机制 |
|---|---|
| 不重复触发获得时效果 | OnAcquireEffect 只存在于 learnTalent ⑥；recompute 重放的混合卡 f 为空操作 |
| 不改变卡池/前置条件检查时机 | canOffer/availTalents/rollPicks/rollBoxPicks 零改动；req 判定仍在抽池时 |
| 不改变 Math.random 的消耗次数或顺序 | learnTalent 零 RNG（现状即如此）；melt 恰好 1 次（②池抽取）；recompute 零 RNG |
| 置换输出卡仍正常获得一次性效果 | melt ⑤ 经 learnTalent → ⑥ OnAcquireEffect 正常执行 |
| 单纯重算不恢复资源或刷新持续时间 | ⑦ 只回写快照值；⑧ 只做「上限降低」方向的夹紧与最后一级清除；无任何 +1/重置计时 |
| 显式换波事件仍可按原逻辑重置对应状态 | startNextWave 零改动 |

---

## 5. C3-A/B/C 最小接口设计（只设计，C3-0 不接入生产）

### 5.1 职责一：属性来源解析（扩展既有权威管线）

**原则**：所有属性计算仍经已建立的 StatModel 权威管线（`talentStatModifiers → resolveStats → applyTalentStatProjection`）；不恢复旧 `Talent.f` 的重复重放作为长期方案；不新增 Player 可枚举字段；不引入全局可变缓存。

```ts
// —— core/TalentStatSources.ts 扩展（C3-A/B/C 分批追加 case）——

/** GameCore 实例级持久来源（非 Player 字段，parity 序列化不受影响；先例：potionGrow） */
export interface PersistentStatSources {
  /** 满血血包累计永久成长（D-C3-01）。resetGame 重置、startNextWave 保留 */
  readonly potionMaxHpGrow: number;
}

/** 扩展签名（v1.1/P3）：persistent 为**必传参数**——learnTalent/recompute 均为
 *  GameCore 方法，this.potionMaxHpGrow 就地取用；编译期必传杜绝「漏传可选
 *  参数 → 静默按 0 重建 maxHp」的 R-1 复活路径。C3-A 落地时同步更新 C1/C2
 *  既有直调测试（补传 { potionMaxHpGrow: 0 } 或实例字段）。 */
export function talentStatModifiers(
  picks: readonly string[],
  persistent: PersistentStatSources,
): TalentStatContribution;
// 新增 case（属性贡献，值逐字声明）：
//   生命之泉  → maxHp flat +20/级（StatId "maxHp"，白名单已含）
//   巨人血脉  → maxHp flat +30/级
//   能量护盾  → shieldMax flat +1/级（StatId 白名单需追加 "shieldMax"）
//   击杀狂热  → hasteLv flat +1/级（白名单追加，仅作等级解析；haste 消费仍走 hasteCap 读时判定）
//   疾影步    → dashLv flat +1/级（base 0，整数精确）；dashMax **有序 flat 来源**：
//               base = statBase().dashMax = 2.4，每级一条 flat −0.4——StatModel
//               flat 区「base 起始、按修饰符顺序逐次累加」语义下逐位复现旧 f
//               序列 2.0 / 1.6 / 1.2000000000000002（2.4−0.4 按 IEEE-754
//               ties-to-even 恰好舍入为 2.0，此后与旧 f 路径逐位重合；B10 钉旧值、
//               B16 钉解析等价。v1.0 初版「只能查表」结论有误，第一轮评审
//               P2-2 撤回——误因：只测了折叠式 2.4−0.4×lv（先乘后减），未测
//               StatModel 实际的逐级累加。查表保留为备选，非首选）
//   二段冲刺  → dashChargeLv flat +1/级
//   壁垒      → barrierLv flat +1/级
//   不屈      → nd flat +1/级（nd 键仍写 1，与旧 f 一致）
//   战意沸腾  → rageLv flat +1/级

// —— applyTalentStatProjection 扩展（v1.1/P3：persistent 必传，理由同上）——
export function applyTalentStatProjection(
  p: Player,
  persistent: PersistentStatSources,
): void;
// 新增投影（写回既有字段，不新增键）：
//   p.maxhp    = resolved.maxHp ?? base.maxhp   ← base = statBase().maxhp + persistent.potionMaxHpGrow
//   p.shieldMax = resolved.shieldMax ?? base.shieldMax
//   p.dashLv / p.dashMax / p.dashChargeLv / p.hasteLv / p.rageLv / p.barrierLv / p.nd 同理
// 键存在性政策沿用 C1：有来源写键、无来源删键/回写 base 值（等级型字段 statBase 必有
//   初始值 → 必写回 base；仅 defense 类「无 base」字段保留键级存在性语义）
```

**所有权边界（沿用 C2 审计口径）**：上列字段运行期写入者 = 旧 f（本批取消）+ statBase 基底 + 本投影 + 血包成长（仅 maxhp，经 PersistentSource 登记）。`maxhp` 的**治疗类写入者**（血包治疗、regen、不屈 hp=1）写的是 `hp` 不是 `maxhp`，无冲突。若未来出现卡外合法写入者，须先在来源表登记为独立来源（C2-A 头注先例）。

**等级型属性的读时判定例外**：`hasteCap(hasteLv)`、二段冲刺 req、陨星间隔 `max(2.2, 4.6−meteor×0.4)` 等读时公式**不改**——投影只保证字段值正确，消费点公式零改动（C2-B「动态攻速不进模型」同款纪律）。

### 5.2 职责二：获得时效果（新纯模块）

```ts
// —— core/OnAcquireEffects.ts（新文件；操作 Player、不掷随机、无 DOM/Phaser/GameCore）——

/**
 * 成功学习卡牌后执行的一次性效果。lvBefore = 获得前 upCounts（0 = 首次获得）。
 * 只处理属性贡献之外的运行副作用；属性写入永远由投影承担。
 * 调用时机：learnTalent 内投影之后（需要新有效上限）；melt 的输出卡路径自动复用。
 */
export function applyOnAcquireEffect(
  name: string,
  p: Player,
  lvBefore: number,
): void;
// 契约（值与旧 f 逐字一致，触发条件收紧为「真实获得」）：
//   生命之泉：p.hp = p.maxhp                        （回满至新有效上限）
//   巨人血脉：p.hp += 30                            （不夹紧——旧 f 即无夹紧，
//                 hp_old ≤ maxhp_old = maxhp_new − 30 保证不越界）
//   能量护盾：p.shield += 1                         （无条件赠 1 层，与旧 f 一致；
//                 与 shieldMax 同级增长，不存在超上限问题）
//   击杀狂热：lvBefore === 0 → p.haste = 1; p.hasteT = 3
//                 （仅首次获得触发；重算路径永不调用本模块）
//   疾影步：无运行效果（解锁与 dashMax 由属性解析承载）
//   其余卡牌：C3 阶段不登记，本函数对其为 no-op（未迁移卡仍走旧 f）
```

**与旧 f 的逐位等价论证**：learnTalent 旧路径 = f（属性+效果）→ 投影（对混合卡为 no-op）。新路径 = 投影（属性，与 f 的累加结果逐位一致）→ OnAcquire（效果，与 f 的副作用逐字一致）。两者对 Player 的最终状态相同；差别仅在 recompute 路径不再走 f。

### 5.3 职责三：运行状态协调（新纯模块）

```ts
// —— core/RuntimeStateProtection.ts（新文件；纯函数，无 DOM/Phaser/GameCore 依赖）——

/**
 * RuntimeState 白名单：recompute 时「保存 → 重建属性 → 原样回写」的字段集合。
 * 分阶段扩充（D-C3-04）：每批把该领域字段加入并跑全量基线。
 *   C3-A：[]（生命由 ⑨ hp 夹紧承接；引入骨架本身）
 *   C3-B：["shield", "shieldCd"]
 *   C3-C：["haste", "hasteT", "rageT", "dashT", "dashCharges", "dashRe",
 *          "meteorT", "tempShield", "ndUsed", "orbA", "hurtCd", "dx", "dy"]
 * hp 永不入白名单（由 recompute ⑨ 夹紧统一处理，D-C3-05）；
 * fireCd 现状即不在 statBase、天然幸存，不进白名单也无害。
 */
export type RuntimeStateKey = ...上述联合类型...;
export interface RuntimeSnapshot {
  readonly values: Partial<Record<RuntimeStateKey, number | boolean>>;
}
export function captureRuntimeState(p: Player): RuntimeSnapshot;
export function restoreRuntimeState(p: Player, s: RuntimeSnapshot): void;

/**
 * 上限协调：在属性重建/投影之后调用。只做「向下夹紧」与「最后一级清除」，
 * 绝不恢复资源、绝不刷新计时（D-C3-02/03/06 的实现载体）。
 */
export interface EffectiveCaps {
  readonly maxHp: number;
  readonly shieldMax: number;
  readonly dashChargeMax: number;   // 1 + dashChargeLv
  readonly hasteCap: number;        // 零级哨兵（v1.2/P2）：hasteCap = hasteLv > 0 ? hasteCap(hasteLv) : 0
                                    //   hasteLv = 0 → 0（未学哨兵）；hasteLv > 0 → hasteCap(hasteLv) = 3 + hasteLv
                                    // 复用 data/talents.ts 既有 hasteCap 导出；0 哨兵使 reconcile 两分支
                                    // 判定互斥完备：部分降级（after 仍 >0）走夹紧、末级移除（after === 0）走清除
}
export function effectiveCaps(p: Player): EffectiveCaps;
export function reconcileRuntimeToCaps(
  p: Player,
  before: EffectiveCaps,
  after: EffectiveCaps,
): void;
// 规则（全部来自已批准差异，逐条可追溯；v1.1 按 P2-1 恢复狂热降级夹紧口径）：
//   hp        不在此处理（recompute ⑨ 夹紧）——learnTalent 升上限方向无需动作
//   shield    after.shieldMax < before.shieldMax → p.shield = min(p.shield, after.shieldMax)
//             （D-C3-02；上限升高或不变时不动）
//   dashCharges  after.dashChargeMax < before.dashChargeMax
//             → p.dashCharges = min(p.dashCharges, after.dashChargeMax)（D-C3-06 必要夹紧）
//   haste     after.hasteCap < before.hasteCap 且 after.hasteCap > 0
//             → p.haste = Math.min(p.haste, after.hasteCap)（D-C3-03 降级夹紧；
//               **不刷新 hasteT**——持续时长与层数正交，仅层数受上限约束）
//   haste     after.hasteCap === 0 && before.hasteCap > 0
//             → p.haste = 0; p.hasteT = 0（D-C3-03 移除最后一级清除）
//   rageT/rageLv/tempShield/ndUsed 等：不在本函数职责内（rageT 永不清除；tempShield/ndUsed
//             仅由 startNextWave 重置）
//   示例（v1.2/P2，哨兵下两分支判定）：
//     2→1（部分降级）：before.hasteCap = 3+2 = 5，after.hasteCap = 3+1 = 4
//       → after > 0 且 after < before → 夹紧分支：haste = min(haste, 4)（hasteT 不刷新）
//     1→0（末级移除）：before.hasteCap = 3+1 = 4，after.hasteCap = 0（hasteLv=0 哨兵）
//       → after === 0 且 before > 0 → 清除分支：haste = 0, hasteT = 0
```

### 5.4 调用顺序与依赖方向

```
依赖方向（与 Combat Foundation 既定方向一致）：
  data/stats · data/talents · data/constants
        ↓
  StatModel（纯解析） ← TalentStatSources（来源表，含 PersistentStatSources 入参）
        ↓                      ↓
  OnAcquireEffects · RuntimeStateProtection（新纯模块）
        ↓
  TalentSystem（learnTalent / recompute 编排） → SwapSystem.melt（结构不变，复用上者）
        ↓
  GameCore（持有 potionMaxHpGrow 实例字段；resetGame 重置） → WaveSystem（零改动）

禁止：纯计算模块（OnAcquireEffects/RuntimeStateProtection/StatModel/TalentStatSources）
      import DOM/Phaser/GameCore/实体运行时实例；不掷随机数；无持久缓存。
```

**GameCore 实例字段承载 PersistentSource**：`potionMaxHpGrow` 放 GameCore（`this.potionMaxHpGrow`），不放 Player——Player 新增可枚举字段会破坏 v8/parity 逐字段序列化对照（S4 任务书 §2 明令禁止），而 GameCore 侧已有 `potionGrow` 先例。`resetGame()` 将其归零（新游戏重置累计成长，§6 生命边界⑤）；`startNextWave()` 不触碰（换波保留）。

---

## 6. 重点边界场景与推荐方案（标记所属阶段）

每条标注：适用阶段（C3-A/B/C）+ 行为依据（已批准差异编号）。凡存在多种符合契约的实现方式处，给出推荐方案与取舍。

### 生命

1. **满血血包成长与生命天赋叠加**（C3-A）：`maxHp = 100 + 20×泉lv + 30×血脉lv + potionMaxHpGrow`，单一天赋来源区 + PersistentSource 并存，StatModel flat 区顺序累加。满血转化同时 `hp += 1` 的现状保留（转化不因来源重构改变即时行为）。
2. **置换移除最后一级生命天赋**（C3-A）：材料删除 → recompute → maxHp 重建（无该来源）→ `hp = max(1, min(hpBefore, 新 maxHp))`（D-C3-05 夹紧，超上限部分丢失——现状语义即如此，属「上限降低」非「扣血」）。**注意**：learnTalent 的 OnAcquire 不在 recompute 中触发，重放「回满/+30」不再发生（D-C3-02/03 同源诉求）。
3. **maxHp 降低但当前 HP 超过新上限**（C3-A）：同上，由 ⑨ 夹紧。hpBefore 为权威基准（不是重放后的 hp）。
4. **当前 HP 已受伤时 recompute 不补血**（C3-A，R-5 保持）：重放不再执行泉/血脉的治疗；即使执行也被夹紧中和。**双重保险**设计：新机制下两层保证叠加。
5. **新游戏重置累计永久成长**（C3-A）：`resetGame()` 归零 `potionMaxHpGrow` 并重建 player（statBase）。`startNextWave` 保留。
6. **hp ∈ (0,1) 浮点边界**（C3-A，随 D-C3-05 冻结）：recompute 将其抬至 1（§2 D-C3-05 已说明）。基线测试以现状为准 pin。

### 护盾

1. **shield=0、shieldMax=2、shieldCd 倒计时中 + recompute**（C3-B）：新行为 → shield 保持 0、shieldCd 保持剩余值（继续倒计时）；旧行为 → shield 重放回满、shieldCd 清 0（未满盾时下一帧立即恢复）。基线测试分别 pin 旧行为（现缺陷）；Given/When/Then 见 §7。
2. **移除一级后新 shieldMax < 当前 shield**（C3-B）：reconcile 夹紧 `shield = min(shield, shieldMax)`。旧行为：重放后 shield=新 shieldMax（f 按剩余 picks 重建）——数值上常与夹紧一致，但**来源不同**（重放 vs 保留后夹紧）；当 shield 已消耗至低于新上限时两者分叉（旧=回满，新=保留），此即 D-C3-02。
3. **置换获得新能量护盾（输出卡）**（C3-B）：melt → recompute（此时无能量护盾来源，shield 保留旧值——若此前无盾则 0）→ learnTalent(能量护盾) → 投影 shieldMax=1 + OnAcquire `shield += 1` → shield=1。正常增加一层 ✓。
4. **tempShield 不计入普通护盾上限**（C3-C 全程保持）：恢复逻辑只看 `shield < shieldMax`；消耗顺序闪避→tempShield→shield 不变。
5. **获得第 2/3 级能量护盾时已消耗部分盾层**（C3-B）：旧 f 无条件 `shield++` → 新 OnAcquire 同为无条件 `+1×delta`（delta = 获得级数，learnTalent 恒为 1）。例：shield=0、shieldMax=1 → 学第 2 级 → shieldMax=2、shield=1（旧行为一致，基线 pin）。

### 狂热

1. **Buff 已过期后 recompute**（C3-C）：旧 → 重放首级 Buff（haste=1, hasteT=3，R-3 缺陷）；新 → 保持过期态（haste=0）。基线 pin 旧行为。
2. **Buff 生效中增加天赋等级**（C3-C）：真实学习路径旧行为 → hasteLv++ 但 haste/hasteT 不变（f 的 `if (hasteLv===1)` 不成立）；新行为一致（OnAcquire 的 lvBefore>0 分支 no-op）。**叠层上限变化**：`hasteCap = 3 + hasteLv` 读时判定，等级生效即上限生效——升级方向上限只增不减，无夹紧问题（`killEnemy` 的 `min(cap, ·)` 继续约束增长）。
3. **层数高于降级后的新上限**（C3-C，已批准夹紧口径，v1.0 初版误推荐「不夹紧」、第一轮评审 P2-1 恢复）：t3 不可作材料（SwapSystem.ts:44 `u.t > 2` 拒绝），当前不可达；通过 recompute 直接构造可达。**已批准行为：夹紧**——hasteLv 降级且仍 >0 时 `haste = min(haste, hasteCap(newHasteLv))`，**不刷新 hasteT**；例：hasteLv 2→1（cap 5→4）、haste=5 → haste=4、hasteT 原值继续衰减。取舍说明：该夹紧是批准契约的一部分（降级后层数不得高于新上限），与「不恢复资源/不刷新持续」正交；killEnemy 的 `min(cap, ·)` 仍负责增长方向约束。
4. **移除最后一级时清除 Buff**（C3-C，D-C3-03）：`after.hasteCap === 0 && before.hasteCap > 0 → haste=0, hasteT=0`。可达性备注见 §2 D-C3-03。
5. **rageT 等独立运行状态不受影响**（C3-C）：rageT 永不在 reconcile 中清除；战意沸腾为 t1 可作材料被移除，但契约只规定移除**击杀狂热最后一级**清 haste——rageLv 降级对 rageT 无任何动作（现状 rageT 与 rageLv 解耦：rageT>0 时衰减独立进行）。

### 冲刺

1. **当前充能为零且 dashRe>0 + recompute**（C3-C）：旧 → dashCharges=1、dashRe=0（补满）；新 → 保持 0 与剩余 dashRe（R-4 缺陷修复方向，D-C3-06）。基线 pin 旧行为。
2. **升级缩短 dashMax，剩余 dashRe 不缩放**（C3-C，D-C3-06 明文）：dashRe 原值继续倒计时；下次充能完成时按新 dashMax 赋值。**不按比例缩放**是批准口径，不做「按旧 dashMax/dashMax 比例折算」。
3. **降低充能上限时只做必要夹紧**（C3-C）：二段冲刺（t2，max 1）可作材料被熔掉 → `dashChargeLv` 0 → dchMax=1 → `dashCharges = min(dashCharges, 1)`。dashRe 冻结值保留（PlayerSystem 在 `dashCharges >= dchMax` 时不倒计时，无副作用）。
4. **正在冲刺时执行置换或重算**（C3-C）：rest 期仍模拟（升级/报告/熔炉非暂停），玩家可在 dashT>0 时开置换面板完成 melt。旧行为 → dashT 重置 −1，冲刺瞬间中断（位移截断）；新行为（D-C3-06）→ dashT 保留，冲刺运动自然完成。**推荐方案**：dashT 保留原值。取舍：保留 = 与「不刷新、不重置」口径一致；中断 = 旧行为且无批准依据。
5. **移除能力及重新获得能力的同波状态**（C3-C）：熔掉疾影步 → dashLv=0（解析）→ 充能/触发 gate 停摆，dashT/dashCharges/dashRe 保留现值（dashT 若 >0 继续自然倒计时——`PlayerSystem.ts:22` 无 gate）；同波重新学习 → 首级解析 `dashLv=1, dashMax=2.0`，dashCharges 沿用保留值（若此前消耗至 0 则保持 0，等充能——新语义下不补充）。**与旧行为分叉点**：旧 recompute 补 1 充能/清 CD，新保留——已批准（D-C3-06）。
6. **疾影步与二段冲刺的前置依赖**（C3-C）：二段冲刺 req `dashLv > 0` 只影响投放；已学的二段冲刺不因疾影步被熔而失效（upCounts 保留，dashChargeLv 继续解析生效）；dchMax 与 dashLv 解耦（`1 + dashChargeLv`）。若二段冲刺与疾影步都移除 → 全部停摆、属性归零。

### 换波与其他

7. **换波重置范围冻结**（C3 全程）：startNextWave 重置 `potionGrow/tempShield(=barrierLv)/ndUsed`，**不重置** `potionMaxHpGrow/shield/shieldCd/haste/hasteT/rageT/dash*/meteorT/orbA/hurtCd`（现状亦不重置后者，保持）。
8. **不屈触发与 recompute 交互**（C3-C）：ndUsed=true 后 recompute → 旧重置 false（同波二次免死，缺陷）；新保留 true（本波已触发语义成立）。不屈为 t3 不可熔，但 recompute 侧保护仍按 D-C3-04 实施。

---

## 7. 测试映射与验收规范

### 7.1 旧行为基线（已完成，`tests/s4c-c3-baseline.test.ts` + 既有 R-1～R-5）

**原则**：全部按当前真实实现断言（含缺陷）；R-1～R-5 原样保留不削弱；未来期望行为只出现在 §7.2 的 Given/When/Then（不写成可执行断言，不进 CI 通过数）。

| # | 基线用例 | 钉住的旧行为 | 对应差异 |
|---|---|---|---|
| B1 | 生命之泉获得时回满（hp=40 → 120/120） | OnAcquire：`hp = maxhp` | D-C3-01/05 背景 |
| B2 | 巨人血脉获得时 +30 当前 HP（40→70；满血 100→130） | OnAcquire：`hp += 30` 无夹紧 | 同上 |
| B3 | 双生命卡两种顺序（受伤插入点不同 → 结果不同） | 获得时效果的顺序敏感 | 同上 |
| B4 | 能量护盾首级赠盾 + 第二级在已消耗态仍无条件 +1 | 旧 f 无条件 `shield++` | D-C3-02 背景 |
| B5 | 护盾恢复侧：消耗后 CD 10s、恢复 +1、满盾冻结 | PlayerSystem 恢复逻辑 | D-C3-02 背景 |
| B6 | 破盾后 recompute：shield 回满 + shieldCd 清 0 | R-2 的补充面（shieldCd 维度） | D-C3-02 |
| B7 | 击杀狂热首级 Buff；第二级不重新触发（升级路径） | f 的 `hasteLv===1` 条件 | D-C3-03 背景 |
| B8 | 击杀叠层（cap=3+hasteLv、hasteT 刷新=2+hasteLv）、受伤 -2、战意沸腾 rageT 触发 | 消费点行为 | D-C3-03 背景 |
| B9 | 计时器推进：hasteT 耗尽 → haste 归零、rageT 独立衰减、rageLv 恒存 | 消费点衰减 | D-C3-03/04 背景 |
| B10 | 疾影步三级 dashMax **逐位序列 2.0 / 1.6 / 1.2000000000000002**（≠1.2，IEEE-754 实测） | 旧 f 重放序列（C3-C 查表依据） | D-C3-06 背景 |
| B11 | 二段冲刺 req（仅约束 canOffer）与充能上限 dchMax=1+dashChargeLv（0→1→2 充满停） | 解析等价性与前置 | D-C3-06 背景 |
| B12 | 置换删除生命材料（泉+血脉 → maxhp 回落 100、hp 夹紧）+ 恰好 1 次 Math.random | melt 结构与 RNG 纪律 | D-C3-01/05 |
| B13 | 置换输出卡 = 能量护盾（t2 池 idx3）→ 正常获得 shieldMax=1/shield=1 | 输出卡一次性效果正常 | D-C3-02 背景保证 |
| B14 | 换波重置 potionGrow/tempShield（=barrierLv 重建非累加）/ndUsed | startNextWave 现状 | D-C3-04 例外面 |
| B15 | 十三张已迁移卡与混合卡交错 + recompute 幂等（数值面） | C1/C2 管线在含混合卡 picks 下的正确性 | 回归保护 |
| B16 | 现有 StatModel 有序 flat 累加（base 2.4 + 每级单独 flat −0.4）逐位复现旧 f dashMax 序列，并与真实学习路径交叉验证 | P2-2 解析等价依据（独立验证，不接入疾影步生产） | D-C3-06 实施依据（v1.1） |

既有文件钉住的：R-1（血包成长丢失）、R-2（重放回盾）、R-3（重放首级 Buff）、R-4（dash/meteor/tempShield/ndUsed 重置）、R-5（HP 夹紧保护）；combat.test.ts（消耗顺序/破盾反震/浮点扣血）；potion.test.ts（转化/上限/换波计数重置）。

### 7.2 新行为验收规范（Given/When/Then，**未来实施阶段的可执行用例来源，当前不可运行**）

> 以下场景在对应实施阶段转为测试断言；括号内为建议落点批次。全部以实际入口（learnTalent / recompute / melt / startNextWave）驱动，不以字段直改替代。

**生命（C3-A）**

- G-1：Given 满血血包转化累计 `potionMaxHpGrow=5` 且学了生命之泉 1 级，When recompute×3，Then maxhp=125 恒定、hp=夹紧值、`potionGrow` 保持本波语义。（D-C3-01）
- G-2：Given hp=40、生命之泉 1 级，When recompute，Then hp=40 不变、maxhp=120。（D-C3-05 + 获得时效果不重放）
- G-3：Given hp=0.5（构造浮点），When recompute，Then hp=1（D-C3-05 下限语义随契约冻结）。
- G-4：Given 泉+血脉各 1 级、hp=150，When melt 移除两级（材料=泉+血脉，输出 t1），Then maxhp=100、hp=min(150,100)=100、输出卡正常学习。（D-C3-01/05）
- G-5：Given `potionMaxHpGrow=3`，When startNextWave，Then 保留；When resetGame+startGame，Then 归零。（D-C3-01）
- G-23：Given 满血血包转化累计 `potionMaxHpGrow=3`（无生命天赋，maxhp=103），When learnTalent(无关天赋，如磐石)，Then maxhp=103（**获得路径投影必须携带当前实例的持久来源**，漏传参数不得静默按 0 重建）；随后 When recompute，Then maxhp=103 仍恒定。（D-C3-01，v1.1/P3）

**护盾（C3-B）**

- G-6：Given 能量护盾 2 级、shield=0（消耗尽）、shieldCd=4.2 剩余，When recompute，Then shield=0、shieldCd=4.2、shieldMax=2。（D-C3-02）
- G-7：Given 能量护盾 3 级、shield=3，When melt 移除 1 级，Then shieldMax=2、shield=2。（D-C3-02 夹紧）
- G-8：Given 无能量护盾、shield=0，When melt 输出=能量护盾，Then shieldMax=1、shield=1。（获得时效果在置换路径正常）
- G-9：Given 能量护盾 1 级、shield=1（满），When 学习第 2 级，Then shieldMax=2、shield=2（赠层）；When 消耗至 shield=0 后学习第 3 级，Then shieldMax=3、shield=1。（旧 f 无条件赠层的语义保持）

**狂热（C3-C）**

- G-10：Given 击杀狂热 1 级、haste=0（已过期），When recompute，Then haste=0、hasteT 不变（保持过期）、hasteLv=1。（D-C3-03）
- G-11：Given haste=3、hasteT=2 生效中，When 学习第 2 级，Then hasteLv=2、haste=3、hasteT=2（获得时效果不重触发；不刷新）。（D-C3-03）
- G-12：Given 击杀狂热 2 级（cap=5）、haste=5、hasteT=1.7，When 层级降至 1（cap=4，经 recompute 构造），Then haste=4（夹紧至 hasteCap(1)）、hasteT 仍 =1.7（**不刷新**，继续衰减）、hasteLv=1。（D-C3-03 已批准夹紧口径，v1.1/P2-1）
- G-13：Given 击杀狂热 1 级、haste>0，When picks 移除至 0 级 + recompute，Then haste=0、hasteT=0。（D-C3-03）
- G-14：Given rageT=1.5、rageLv=1，When recompute / 任意 C3 操作，Then rageT 不变、rageLv 不变；When ticks 至过期，Then rageT≤0 且 rageLv 恒存。（D-C3-04）

**冲刺（C3-C）**

- G-15：Given dashCharges=0、dashRe=0.8、dashT=−0.3，When recompute，Then 三值原样保留。（D-C3-06）
- G-16：Given dashLv=2（dashMax=1.6）、dashRe=1.2 倒计时中，When 学习第 3 级，Then dashMax=1.2000000000000002（B10 逐位序列）、dashRe 仍从 1.2 继续（不缩放）。（D-C3-06）
- G-17：Given 二段冲刺已学（dchMax=2）、dashCharges=2，When 熔掉二段冲刺，Then dashChargeLv=0、dashCharges=1（夹紧）、dashRe 保留。（D-C3-06）
- G-18：Given dashT=0.1（冲刺中），When recompute（经 melt 于 rest 期构造），Then dashT 保留 0.1、冲刺运动完成、期间 `dashT<=0` 前不可被命中语义不变。（D-C3-06）
- G-19：Given 疾影步 1 级 + 二段冲刺已学、dashCharges=2，When 熔掉疾影步（材料需另一张 t1），Then dashLv=0、dashCharges=2 保留（dchMax 仍=2）、无法触发冲刺；同波重学疾影步 → dashLv=1、dashMax=2.0、dashCharges 沿用。（D-C3-06）

**换波与全局（各批回归）**

- G-20：Given tempShield=0、barrierLv=2、ndUsed=true、potionGrow=5，When startNextWave，Then tempShield=2（重建）、ndUsed=false、potionGrow=0；shield/haste/dash 等运行字段不变。（D-C3-04 例外面）
- G-21：Given §7.1 B15 场景（十三张迁移卡+混合卡交错），When recompute×3，Then 全部属性逐位幂等、运行状态按所在批次契约保留。（回归）
- G-22：parity 26 项原样通过；melt/learnTalent 的 RNG 消耗次数与顺序不变（变异验证沿用 C1/C2 口径）。

---

## 8. 实施前必须确认的边界和风险

1. **parity 序列化红线**：`potionMaxHpGrow` 必须放 GameCore 实例字段，放 Player 会破坏 v8 逐字段对照；实施前先跑 parity 确认 GameCore 新字段不在快照白名单（`potionGrow` 先例佐证，仍需实证）。
2. **maxHp 投影的血包成长同步点**：满血转化处 `p.maxhp += 1` 与 `potionMaxHpGrow += 1` 的同步次序（先累计再投影 or 直接双写）需在 C3-A 定稿——**推荐**：转化处双写实体字段（即时生效，regen/血包判定当帧可用），recompute 时以 `potionMaxHpGrow` 重建（来源唯一）。若只在来源累计、靠投影刷新，则两次转化之间 `p.maxhp` 未变，会改变「满血判定」的即时行为（不可接受）。
3. **dashMax 的浮点逐位性（v1.1/P2-2 修正定案）**：旧 f 重放序列 `2.0 → 1.6 → 1.2000000000000002`（B10 钉住）。三种计算形态实测：**有序 flat 累加**（base 2.4 + 每级单独 flat −0.4，即 StatModel flat 区语义）**逐位复现旧值**——`2.4−0.4` 按 ties-to-even 恰好舍入为 2.0，此后与旧 f 路径逐位重合（B16 以现有 StatModel 验证）；**折叠式** `2.4 − 0.4×lv`（先乘后减）不逐位一致（L2 = 1.5999999999999999、L3 = 1.1999999999999997，v1.0 初版把 L3 误记为 1.2，一并更正）。结论：**推荐有序 flat 来源**（StatModel 契约零改动，负 flat 合法），查表为备选；禁止折叠式。C3-C 实施配逐位钉子。
4. **recompute 的 Object.assign 保留范围**：混合卡 f 空操作后，statBase 中对应字段（maxhp/shieldMax/dashLv/…）的重置由投影回写承接；投影必须在 f 重放**之后**调用（现顺序已如此），且投影失败（未知天赋 throw）不得发生在运行状态回写之前——异常路径会丢运行状态。**缓解**：未知天赋 throw 现状即存在且 picks 由系统维护（melt 校验后必合法），风险仅限手工构造；记录为已知限制，不加 try/finally（避免吞异常红线）。
5. **learnTalent 的 lvBefore 捕获时机**：必须在 upCounts 递增**前**读取；melt 输出卡路径的 lvBefore 为材料删除后的现值（输出卡通常未学 → 0 → 首级效果正常）。
6. **OnAcquire 的 hp 赋值顺序**：生命之泉 `p.hp = p.maxhp` 依赖投影已写入新 maxhp——调用顺序 ⑤投影→⑥OnAcquire 不可颠倒。
7. **分阶段中间态**：C3-A 落地后、C3-B 落地前，能量护盾 f 仍是旧 f（重放回盾）——各批只动本批卡片，跨批字段行为以当批基线为准；migration.md 每批记录「本批后仍旧行为」的清单。
8. **铁布衫 0.6 上限等消费点夹紧**：模型不裁剪（S4-B 定基线），C3 不统一夹紧点。
9. **本契约不覆盖**：怪物侧 StatModel 迁移、负区因子政策、S4-D RuntimeState 大规模重写（结构与白名单机制为 S4-D 提供骨架，但不预实施）。

---

## 9. 各子阶段预计修改文件与可观察行为差异

| 阶段 | 预计修改文件（生产） | 可观察行为差异（全部属已批准差异） | 新增/扩展测试 |
|---|---|---|---|
| **C3-A 生命** | `core/TalentStatSources.ts`（maxHp 来源 + PersistentStatSources 入参）、`core/OnAcquireEffects.ts`（新）、`core/RuntimeStateProtection.ts`（新，骨架）、`core/TalentSystem.ts`（learnTalent/recompute 编排）、`core/GameCore.ts`（potionMaxHpGrow 字段 + resetGame）、`data/talents.ts`（泉/血脉 f 空操作）、`core/ProgressionSystem.ts`（转化处同步累计） | 血包永久成长在 recompute 后保留（R-1 修复）；泉/血脉获得时效果仅在获得时发生；recompute 不再重放回满/+30（hp 夹紧保持）；新游戏重置成长 | **反转** R-1（s4c-recompute-audit，血包成长保留）；**新增** G-1~G-5 与 G-23；B1~B3、B12 持续通过转为「获得路径/置换回归」；变异验证（来源删除/投影移除/f 恢复写入） |
| **C3-B 护盾** | `TalentStatSources.ts`（shieldMax 来源）、`OnAcquireEffects.ts`（赠层）、`RuntimeStateProtection.ts`（shield/shieldCd 白名单 + reconcile）、`TalentSystem.ts`（recompute 接线）、`data/talents.ts`（能量护盾 f 空操作） | 重算不恢复已耗盾层、shieldCd 保留（R-2 修复）；降上限夹紧；输出卡赠层正常 | **反转** R-2 与 B6（盾不回满、shieldCd 保留）；**新增** G-6~G-9；B4~B5、B13 持续通过（获得赠层/恢复/输出卡路径回归） |
| **C3-C 狂热/冲刺/其余运行状态** | `TalentStatSources.ts`（hasteLv/dashLv/dashMax/dashChargeLv/barrierLv/rageLv/nd 来源；dashMax 按有序 flat 设计，见 §10.1）、`OnAcquireEffects.ts`（首级 Buff）、`RuntimeStateProtection.ts`（全量白名单 + haste 降级夹紧与清除/dash 夹紧）、`TalentSystem.ts`、`data/talents.ts`（击杀狂热/疾影步/二段冲刺/壁垒/不屈/战意沸腾 f 空操作——f 空操作仅指属性写入，战意沸腾 f 本无即时效果）、`data/stats.ts`（如需键存在性对齐） | R-3/R-4 全量修复：重算不触发狂热、不清 dash/充能/meteorT/tempShield/ndUsed/orbA/hurtCd；狂热降级夹紧（不刷新 hasteT）与移除末级清 Buff；dash 上限夹紧 | **反转** R-3/R-4（s4c-recompute-audit）；B15 的 R-3 注释更新（重放面改「保留」语义，断言值恰好不变）；**新增** G-10~G-22；B7~B11、B14 持续通过（获得/消费/换波路径回归）；B16 持续通过（有序 flat 等价依据）；全量变异 + 浏览器冒烟（行为面最大的一批） |

每批完成后停审查节点，独立复审通过再进下一批（S4-C 既定节奏）。

---

## 10. 未决技术细节与推荐处理

| # | 细节 | 推荐处理 | 定案时点 |
|---|---|---|---|
| 1 | dashMax 解析形态 | **已定案（v1.1/P2-2）**：优先**有序 flat 来源**——base 2.4（statBase）+ 每级单独 flat −0.4，现有 StatModel 逐位复现旧 f 序列（B16 验证，StatModel 契约零改动）；查表 `DASH_MAX_BY_LEVEL = {1: 2.0, 2: 1.6, 3: 1.2000000000000002}` 保留为备选；**禁止折叠式** `2.4 − 0.4×lv`（先乘后减，L2/L3 均不逐位一致） | 已定案 |
| 2 | 血包转化双写 vs 投影刷新 | 转化处双写（实体+来源），recompute 以来源重建 | C3-A 实施前 |
| 3 | haste 降级夹紧的实现位置 | **已批准口径定案（v1.1/P2-1）**：`reconcileRuntimeToCaps` 内 `haste = Math.min(haste, after.hasteCap)`（不刷新 hasteT）；`after.hasteCap === 0` 时清除 haste/hasteT；hasteCap 复用 data/talents 既有导出 | 已定案 |
| 4 | `maxHp` 加入 StatModel 白名单的 base 语义 | base = statBase().maxhp + persistent；flat 区顺序累加与 C1 浮点纪律一致 | C3-A 实施前 |
| 5 | 等级型字段投影的「无来源回写」形状 | statBase 必有初值 → 必写回 base 值（与 C2-B 五字段同类）；`nd` 键写 1/0 数值（与旧 f `p.nd = 1` 一致，不布尔化） | C3-C 实施前 |
| 6 | RuntimeState 白名单的实现形态（const 数组 vs 逐字段） | const key 数组 + 泛型快照对象；分批以数组扩充表达 | C3-A 引入骨架时 |
| 7 | 置换输出卡为混合卡时 lvBefore 的语义 | 输出卡未学 → lvBefore=0 → 首级效果（与旧三行 `f→upCounts→picks` 行为一致：f 在记录前执行，此时 upCounts 未含输出卡） | C3-B 首次触及（G-8） |
| 8 | 持久成长来源的传递方式 | **已定案（v1.1/P3）**：`talentStatModifiers` / `applyTalentStatProjection` 的 `persistent: PersistentStatSources` 为**必传参数**（编译期防线，杜绝漏传静默按 0 重建）；三个生产接入点（learnTalent/recompute/melt→learnTalent）均为 GameCore 方法，`{ potionMaxHpGrow: this.potionMaxHpGrow }` 就地取用；C3-A 同步更新 C1/C2 既有直调测试；G-23 验收 | 已定案 |

---

## 11. 冻结声明

- 本契约 v1.2（初版 v1.0）自 C3-0 交付起冻结；C3-A/B/C 实施若需偏离本文任何条目（含 §6 推荐方案的选择），必须先修订本文件并注明修订依据，不得在代码中静默偏离。
- 六项差异 D-C3-01～06 的批准状态：**已批准、生产实现尚未开始**。C3-0 交付物不包含任何生产行为变更；当前 CI 中全部断言均为旧行为基线。
- 旧行为基线测试的演进口径：R-1～R-5 与 B6（及 B15 的机制注释）在对应批次按 §9 反转为新语义断言；其余 B 用例为「获得/消费/换波路径回归」，新实现下必须**持续通过**（它们钉住的正是获得时效果与消费点行为，新机制不得改变）。任何反转保留「旧行为注释」留痕；parity 26 项全程不得削减、重写、跳过或放宽。
