# 三首巨兽 · Boss 机制、阶段与实现交接

> 状态：**设计稿（未实现）**。本文不修改任何运行时代码。
> 代码基线：v150（P1 怪物图鉴/文档修正已合并）。
> 相关文档：`docs/monster-numerics.md`（怪物基线）、`docs/combat-numerics-agent-guide.md`（伤害管线）、`docs/art-assets.md`（贴图产线）。
> 读者：Codex（实现）、素材生成、平衡与试玩。

## 1. 一句话

每 10 波出现一次的三首巨兽：火焰首、冰霜首、雷霆首依次苏醒，三个阶段各有一套有预警的攻击；击败后进入收球/休整并发放 Boss 奖励。

首版只做一个 Boss、一个场景内的机制，不做独立 Boss 房间、不做多 Boss 轮换、不做召唤物专属美术。

## 2. 范围与非目标

### 2.1 本版包含

- 单个 Boss `boss_three`，48×32 贴图，三阶段。
- Boss 波：`wave % 10 === 0`（10、20、30…）。
- 三套元素招式、阶段转换、Boss 血条、Boss 击杀统计、图鉴条目。
- 复用现有蝙蝠/角兽作为阶段召唤物（无经验、无掉落）。
- 失败/重开/暂停/返回开始/波末清理全部沿用现有生命周期。

### 2.2 本版不做

- 独立 Boss 房、边界墙、场景切换。
- Boss 动画帧（首版静态贴图 + 代码光效/预警）。
- 多个 Boss 或 Boss 词缀。
- 召唤物专属新美术。
- 新的敌方弹丸元素类型（Boss 全部使用地面预警/范围判定）。

## 3. 出现节奏与波次流程

### 3.1 Boss 波判定

```ts
isBossWave(wave) = wave > 0 && wave % 10 === 0
```

- 第 10、20、30… 波为 Boss 波。
- Boss 波**不刷普通怪和精英**，`quota = 1`（只算 Boss 本体）。
- 波次标题显示「首领 · 三首巨兽」，替代普通主题名。
- Boss 波仍按精英波逻辑在波末给 1 次属性消费额度，方便玩家在 Boss 前/后成型。
  实现提示：`enterRest` 现有的 `eliteQuotaForWave(this.waveN) > 0` 判断需要扩展为 `eliteQuotaForWave(this.waveN) > 0 || isBossWave(this.waveN)`，否则第 10/30 波不会发放这次额度。

### 3.2 波次开始

1. `startNextWave` 检测 Boss 波，设置 `quota = 1`、`spawnedThisWave = 0`、`wavePhase = "fight"`。
2. 播放 1.2 秒 Boss 入场：镜头轻微震动 + 低频音效 + 顶部 Boss 血条淡入；Boss 不出手。
3. Boss 在玩家约 200px 外生成（世界边界内 30px 夹取）；朝向玩家。
4. 入场结束后进入 AI；Boss 与召唤物都清空后进入 `collect`，再走现有收球/休整。

### 3.3 边界情况

- Boss 死亡时若场上仍有召唤物：Boss 立即掉落，但波次继续，直到召唤物也清空。
- 玩家死亡：立即停止 Boss 定时器/攻击；重开或返回开始清空 Boss、血条、地面危险区。
- 暂停 / 属性面板 / 图鉴：Boss 与危险区计时跟随固定步长冻结，恢复后继续。
- 波末清理：Boss、Boss 血条、Boss 地面危险区、雷击标记全部清空。
- Boss 波不生成精英，`eliteQuotaForWave` 在 Boss 波返回 0 或由 `updateWave` 直接跳过精英分支；不要同时生成 3 只精英。

## 4. 数值初稿

### 4.1 基础数值

| 项目 | 数值 | 说明 |
|---|---|---|
| 生命 | `1300 × hpScale` | 同波精英蛮牛 HP 的 4 倍；`hpScale = 1+(wave-1)×0.18+over²×0.06` |
| 攻击 | `21.6 × dmgScale` | 蛮牛基础攻击 18 ×1.2；各招式再乘 0.6–1.2 |
| 护甲 | 60 | 同蛮牛基础值；之后按波次护甲成长 |
| 抗性 | 火/冰/雷各 10% | 不免疫任何元素，物理/元素/真实伤害都能打 |
| 移速 | 26 | 比精英慢，靠招式和冲锋施压 |
| 半径 | 20 | 48×32 贴图的判定中心 |
| 经验 | 精英经验 ×8 | `(25+(wave-1)×4) × 8 × 难度 xpMul` |
| 控制 | 免疫冻结/眩晕/麻痹/击退 | 冲锋撞墙后的 1 秒硬直是唯一易伤窗口 |

### 4.2 关键波次参考值

| 波次 | hpScale | Boss 生命 | dmgScale | Boss 攻击 | 精英经验 ×8 |
|---|---|---|---|---|---|
| 10 | 2.62 | 3,406 | 1.495 | 32.3 | 488 |
| 20 | 5.92 | 7,696 | 2.345 | 50.7 | 808 |
| 30 | 19.72 | 25,636 | 5.295 | 114.4 | 1,128 |

`Boss 攻击` 是招式倍率前的基准；实际单次伤害 = `Boss 攻击 × 招式倍率`，再走统一玩家受伤管线（护甲/属性/闪避/护盾/冲刺无敌等）。

### 4.3 目标战斗时长

- 首个 Boss（第 10 波）目标 **25–35 秒**；第 20/30 波目标 **30–45 秒**。
- 不靠超高血量拖时间：Boss 的难度来自预警、走位、阶段切换和少量召唤物。
- 初始按上表落地；如果实测明显偏长/偏短，优先调 Boss HP 倍率，不要先动玩家或普通怪。

## 5. 三阶段

### 5.1 阶段阈值

| 阶段 | 生命区间 | 苏醒的头 | 主要元素 |
|---|---|---|---|
| P1 | 100%–70% | 左·火焰首 | 火焰 |
| P2 | 70%–35% | 中·冰霜首 | 冰霜 |
| P3 | 35%–0% | 右·雷霆首 | 雷电 |

- 阶段切换阈值：**70% / 35%**。
- 当前苏醒的头亮起、旧头变暗；身体与轮廓不变。
- 如果一次大伤害直接跨过两个阈值，只触发一次转换，直接进入 P3，避免连续两次 0.8 秒无敌。
- 转阶段期间 Boss **不受任何伤害（含 DoT）**；DoT 计时继续推进但暂不结算，防止过场白嫖。
- 转阶段 0.8 秒：清空敌方弹幕，播放吼叫/震屏，重置所有招式冷却，不重置玩家输出、不清玩家子弹。
- 转阶段结束后才召唤该阶段随从，避免和无敌窗口重叠。

### 5.2 每阶段招式

所有招式在施放前停止移动并锁定方向/落点；预警结束后才结算伤害。

#### 通用招式（三阶段都有）

| 招式 | 触发 | 预警 | 判定 | 伤害 | 冷却 |
|---|---|---|---|---|---|
| 踏地 | 玩家在 Boss 70px 内 | 0.6s 圆 | 以 Boss 为圆心 R90 | 0.8× 攻击，物理 | 4s |
| 冲锋 | 玩家 90–220px；或远距离优先 | 0.7s 红线 | 锁定方向 220px，冲锋 0.5s / 360 速 | 1.2× 攻击，物理 | P1 7s / P2 9s / P3 6s |

冲锋撞墙或冲刺结束：Boss 硬直 1.0 秒，期间受到伤害 **+15%**；硬直结束进入正常行动。Boss 冲锋期间不重复结算接触伤害（依靠玩家 `hurtCd` 也不会连跳）。

#### P1 · 火焰首（100%–70%）

| 招式 | 预警 | 判定 | 伤害 | 附加 | 冷却 |
|---|---|---|---|---|---|
| 烈焰吐息 | 0.75s 扇形 | 朝玩家方向锁定 50° / 160px 锥形 | 1.0× 攻击，火焰 | 沿锥形留下 2 片燃烧地面（R22，3s，0.25× 攻击 DPS） | 6s |

安全区：Boss 背后、锥形两侧、贴脸但不在正面。吐息结束后 Boss 有 0.4 秒收招，不移动。

#### P2 · 冰霜首（70%–35%）

| 招式 | 预警 | 判定 | 伤害 | 附加 | 冷却 |
|---|---|---|---|---|---|
| 冰霜新星 | 0.9s 圆环 | 以 Boss 为圆心的环形：内径 45、外径 130 | 0.9× 攻击，冰霜 | 减速 40%，3s | 7s |
| 冰川突刺 | 0.7s 三圆 | 从 Boss 朝玩家方向排布 3 个 R34 落点，间距 50px | 每段 0.7× 攻击，冰霜 | 落点留下减速 40% 的冰面 3s | 5s |

安全区：新星贴身（<45px）或离开外圈（>130px）；突刺站在两个落点之间或侧移。进入 P2 时召唤 **2 只蝙蝠**（无经验/掉落，不占配额）。

#### P3 · 雷霆首（35%–0%）

| 招式 | 预警 | 判定 | 伤害 | 附加 | 冷却 |
|---|---|---|---|---|---|
| 雷霆落点 | 0.7s 三圆 | 玩家施放瞬间位置 + 两侧各 55px 偏移，R36 | 每段 0.9× 攻击，雷电 | — | 5s |
| 雷电链 | 0.6s 直线 | 朝玩家 220px 直线 | 主目标 1.0× 攻击，雷电；可跳到 100px 内随从，0.6× | — | 7s |

P3 进入时召唤 **2 只角兽**（无经验/掉落）。Boss 行动间隔 ×0.8（1.2s → 0.96s），移速 ×1.15。雷霆落点锁定的是施放瞬间位置，预警期间移动即可躲开；雷电链站在 Boss 背后或侧后方即可躲开。

### 5.3 招式选择规则

- Boss 每轮行动间隔 **1.2 秒**（P3 为 0.96 秒）；同一招式不能连续使用两次。
- 玩家在 70px 内：踏地优先。
- 玩家在 220px 外：冲锋优先；若冲锋冷却，使用当前阶段的远程招式。
- 其余情况在阶段招式中按冷却轮换；同一时间最多一个“大招式”（吐息/新星/突刺/落点/链）。
- 转阶段、硬直、入场期间不选招。
- 远距离超过 240px 持续 2.5 秒：Boss 获得 25% 移速加成，直到距离回到 180px 内；防止无限风筝（不额外加伤害）。

## 6. AI、移动与状态

### 6.1 状态机

```text
intro
  -> chase（靠近玩家，停手冷却）
  -> choose
      -> stompWindup -> stompResolve -> recover
      -> chargeWindup -> chargeDash -> chargeStagger -> recover
      -> breathWindup -> breathResolve -> recover
      -> novaWindup -> novaResolve -> recover
      -> spikesWindup -> spikesResolve -> recover
      -> marksWindup -> marksResolve -> recover
      -> chainWindup -> chainResolve -> recover
  -> phaseTransition（0.8s 无敌）-> 下一阶段
  -> dead
```

- 所有计时使用固定步长 `dt`；暂停/属性冻结时同停。
- 施放预警期间 Boss 不移动；冲锋按锁定方向移动，撞墙或时间结束进入硬直。
- Boss 不参与普通敌人的分离推挤：在分离循环中跳过 Boss，或给 Boss `noKnock`，避免被召唤物推开。
- Boss 目标始终是玩家，不被法师镜像残影吸引；镜像只影响普通敌人。
- Boss 使用世界边界夹取，不做寻路；靠冲锋/远程招式处理距离。

### 6.2 地面危险区与落点

新增独立的 Boss 危险区，不复用玩家的 `burnZones`（那是玩家打敌人的焦土）：

```ts
interface BossHazard {
  kind: "fire" | "frost";
  x: number;
  y: number;
  r: number;
  t: number;          // 剩余时间
  tickT: number;      // 下一次结算
  dmg: number;        // 每 tick 伤害
  slowF?: number;     // 冰面减速
}

interface BossStrike {
  x: number;
  y: number;
  r: number;
  t: number;          // 剩余预警/落点时间
  dmg: number;
  type: "lightning";
}
```

- 火焰/冰面最多同时 4 片；雷霆落点最多 3 个；转阶段、Boss 死亡、波末、返回开始全部清空。
- 火焰/冰面按固定 tick 结算玩家伤害；冰面额外减速；雷霆落点预警结束后一次性结算。
- 预警和危险区绘制复用现有 `PixelPainter` 批次，不新增 Phaser 对象或 RAF。
- 不在 Boss 死亡后继续造成伤害；危险区随 Boss 死亡立即清除（或明确在死亡动画后 0.2s 内清空，首版直接清空）。

### 6.3 控制与状态交互

- **硬控免疫**：冻结、眩晕、麻痹、击退全部不生效；在状态写入点判断 `e.boss`。
- **减速**：Boss 受到减速效果时按 50% 效果生效（例如 40% 减速 → 20%），只影响移动，不影响行动间隔。
- **DoT**：灼烧/余烬等 DoT 正常生效；阶段转换无敌期间不结算，计时继续。
- **易伤**：仅在冲锋硬直期间受到伤害 +15%；其余时间不额外增伤。
- **击杀类效果**：Boss 死亡正常触发玩家的击杀类效果（击杀狂热、击杀爆炸等）；但 Boss 不应被当作精英蛮牛计入 `runBossKills`。

## 7. 掉落、经验与图鉴

### 7.1 奖励初稿

| 奖励 | 数量 | 说明 |
|---|---|---|
| Boss 经验 | 精英经验 ×8 | 例：W10 488、W20 808、W30 1,128（再乘难度 xpMul） |
| 普通宝箱（品质祝福） | 2 | 沿用现有 `kind: "chest"`；每箱提供 1 层品质祝福 |
| 血包 | 1 | 保证 Boss 战后的恢复 |
| 图鉴击杀 | 1 | `e:boss_three` 解锁 |

- 不重新启用旧的「特殊宝箱 / 精英宝箱点数 / 强化面板」；那套在一次性天赋后已退化。
- 召唤物无经验、无掉落；Boss 死亡时立即结算 Boss 奖励，不等待召唤物清空。
- 若品质祝福已达上限，宝箱仍会掉落并按现有规则处理溢出。

### 7.2 击杀统计

- `killEnemy` 中 Boss 走独立分支：
  - `runBossKills++`
  - `codexKey = "boss_three"`（不拼 `_elite`）
  - 不增加 `runEliteKills`
- **现有 bug**：`src/game/core/CombatSystem.ts` 目前把所有 `e.elite && e.type === "brute"` 都计入 `runBossKills`，导致死亡总结的「首领」数量错误。实现 Boss 时必须改成只有 `e.boss` 才计数。
- 死亡总结已有 `bossKills` 字段与「精英 / 首领」行，无需新增字段。

## 8. UI 与表现

### 8.1 Boss 血条

- 位置：画面顶部中央，XP 条下方、波次计时附近；尺寸约 `240×6`，不新增 DOM。
- 内容：`三首巨兽` + 当前元素首名称 + 三个阶段圆点。
- 当前阶段颜色：
  - 火焰：`#ff8c3a`
  - 冰霜：`#57e6ff`
  - 雷霆：`#ffe14a`
- 受伤/转阶段时轻微闪烁；Boss 死亡、进入休整、返回开始立即隐藏。
- 血条只显示 Boss，不显示召唤物。

### 8.2 表现与音效

- 入场：低频音 + 轻震屏 + 名称淡入；不播放全屏闪白。
- 转阶段：吼叫 + 环形冲击 + 当前头变色；不造成伤害。
- 招式预警：
  - 火焰：橙色扇形/燃烧地格；
  - 冰霜：浅蓝环形/落点 + 冰面；
  - 雷电：白蓝圆圈/直线；
  - 物理：红色冲锋线/踏地圆。
- 预警颜色保持和现有怪物一致的低饱和规则，Boss 可以略亮但不要大面积高亮填充。
- 所有预警与危险区在暂停时冻结，不继续计时。

### 8.3 贴图

- 基础：`boss_three`，48×32，透明底，居中；程序化占位贴图先保证可运行。
- 可选阶段变体：`boss_three_fire` / `boss_three_frost` / `boss_three_lightning`，同尺寸、同轮廓、仅当前苏醒的头与光效不同。
- 没有阶段变体时，使用基础贴图 + 代码 tint/头顶光环表现当前元素；有变体时按 `bossPhase` 切换，缺失则回退基础图。
- 图鉴条目 `e:boss_three` 使用 `spr: "boss_three"`。

## 9. 实现交接

### 9.1 文件与职责

| 文件 | 职责 |
|---|---|
| `src/game/data/boss.ts` | Boss 基础数值、阶段阈值、招式表、危险区参数、奖励 |
| `src/game/core/types.ts` | `BossState`、`BossAttackId`、`BossHazard`、`BossStrike`、`Enemy.boss` 等类型 |
| `src/game/core/BossSystem.ts` | 生成、阶段、状态机、招式、冲锋、危险区、召唤、清理 |
| `src/game/core/WaveSystem.ts` | Boss 波判定、quota、跳过普通/精英、波末属性额度、清场 |
| `src/game/core/Simulation.ts` | 在固定步长中调用 `updateBosses` |
| `src/game/core/EnemySystem.ts` | Boss 跳过通用 AI 与分离推挤；目标固定为玩家 |
| `src/game/core/CombatSystem.ts` | Boss 击杀统计、掉落、`bossKills` 修正 |
| `src/game/rendering/draw.ts` | Boss 贴图、预警、危险区、血条 |
| `src/game/rendering/sprites.ts` | `boss_three` 程序化占位贴图（外部 PNG 就绪前） |
| `src/game/codex/codexData.ts` | `e:boss_three` 条目 |
| `src/game/scenes/GameScene.ts` | 如使用外部图集/预载则接入；优先走现有 `manifest.json` 覆盖链路 |

### 9.2 推荐数据结构

```ts
type BossPhase = 1 | 2 | 3;

type BossAction =
  | "idle"
  | "stompWindup" | "stompResolve"
  | "chargeWindup" | "chargeDash" | "chargeStagger"
  | "breathWindup" | "breathResolve"
  | "novaWindup" | "novaResolve"
  | "spikesWindup" | "spikesResolve"
  | "marksWindup" | "marksResolve"
  | "chainWindup" | "chainResolve"
  | "phaseTransition";

interface BossState {
  enemy: Enemy;
  phase: BossPhase;
  action: BossAction;
  actionT: number;
  cooldowns: Record<string, number>;
  lastAction: BossAction | null;
  chargeDx: number;
  chargeDy: number;
  vulnerableT: number; // 冲锋硬直易伤
  introT: number;
}
```

- `Enemy.boss = true` 用于击杀、掉落、图鉴和分离跳过；Boss AI 不塞进 `updateEnemies` 的长 if/else。
- 每局最多一个 Boss；`GameCore.bossState` 在重开/返回开始/死亡时置空。
- 阶段、危险区、落点都属于 Core 状态，渲染只读取，不反向修改。

### 9.3 更新顺序建议

1. `updateBosses(core, dt)`：推进入场/阶段/招式/危险区/召唤。
2. `updateEnemies(core, dt)`：Boss 走跳过分支；普通怪按原逻辑。
3. 危险区伤害在 BossSystem 内按 tick 调用 `damagePlayer`。
4. 击杀/掉落仍在 `CombatSystem.killEnemy`，BossSystem 只负责把 Boss 打到 0 并标记死亡。

### 9.4 实现批次

- **批次 A**：数据 + Boss 生成 + Boss 波流程 + 血条 + P1 火焰招式。
- **批次 B**：P2/P3 阶段、冲锋/踏地、危险区、召唤物、转阶段表现。
- **批次 C**：奖励、图鉴、`bossKills` 修正、文档/CHANGELOG、受控 e2e 与试玩。
- 每个批次独立通过 `typecheck` + `build`；视觉/手感在批次 C 后集中试玩。

## 10. 验证计划

按项目 2026-10-29 裁定：默认只跑 `npm run typecheck` + `npm run build`，不主动运行/扩展 Vitest、Playwright 或补基线；用户点名再做。

### 10.1 受控验证

- 用 e2e 桥在 W10/20/30 生成 Boss，确认：
  - Boss 波不生成普通怪/精英；
  - Boss 血条出现、阶段在 70%/35% 切换；
  - 三阶段招式预警、伤害、危险区持续时间；
  - 冲锋撞墙硬直与 +15% 易伤；
  - 召唤物无掉落、无经验、可清场；
  - Boss 死亡掉落、波末/重开/返回开始清理；
  - 死亡总结的「首领击杀」为 1，普通精英不再误计。
- 截图：Boss 三阶段、血条、危险区、死亡总结。

### 10.2 自然试玩

- 三职业各打一次 W10/W20：
  - Boss 是否有明确安全区；
  - 近战是否有输出窗口；
  - 远程是否会被无限追/无限风筝；
  - TTK 是否在 25–45 秒目标附近；
  - 血条/阶段提示是否清楚。
- 不把 typecheck/build 当玩法验收；试玩结论单独记录。

### 10.3 基线影响

- 新增 Boss 图鉴条目会增加 `ENEMY_TOTAL`；`tests/codex.test.ts` 的旧数量断言、parity/balance 基线可能过期。
- 按当前裁定不修改测试，留待用户授权的测试批次统一处理，并在提交信息与 `docs/migration.md` 留痕。

## 11. 素材规格与 GPT Image 提示词

### 11.1 素材清单

| 素材 | key | 尺寸 | 用途 | 优先级 |
|---|---|---|---|---|
| 三首巨兽基础图 | `boss_three` | 48×32 | Boss 本体 | 必需 |
| 火焰首阶段 | `boss_three_fire` | 48×32 | P1 | 建议 |
| 冰霜首阶段 | `boss_three_frost` | 48×32 | P2 | 建议 |
| 雷霆首阶段 | `boss_three_lightning` | 48×32 | P3 | 建议 |

- 阶段变体只改当前苏醒的头和头部光效；身体、姿势、轮廓、锚点必须一致。
- 如果阶段变体未就绪，Codex 使用 `boss_three` + 代码 tint/头顶光环，不阻塞实现。
- 不生成召唤物、预警、HUD、施法特效的位图；这些用现有绘制/代码完成。

### 11.2 通用风格块

```text
A single full-body boss sprite for a 480x270 pixel-art action roguelike.
Front-facing three-quarter top-down view, centered, all four feet visible,
transparent background, no ground shadow, 3:2 aspect ratio.
A hulking compact three-headed beast with dark crimson-brown scales,
jagged gold horns, bone-white claws, and molten cracks along the chest and legs.
Three distinct heads on thick necks:
left = fire dragon head with short curved orange horns and ember-orange eyes;
center = frost serpent head with a pale cyan crystalline mane and ice-blue eyes;
right = lightning beast head with forked yellow-white horns and sharp yellow eyes.
Strong readable silhouette, large color blocks, deep ink outlines, flat pixel shading.
Limited palette: #1a0a2a, #3a1a0a, #c05050, #ff8c3a, #ffd24a, #ffe14a,
#57e6ff, #e8e8f0, #ffffff.
Crisp hard-edged pixel-art style, no anti-aliasing, no gradients, no blur,
no 3D, no photorealism, no text, no UI, no frame, no background,
no extra heads, no extra limbs, no sprite sheet.
```

### 11.3 基础图 `boss_three`

在通用风格块后追加：

```text
Neutral pose: all three heads alert and facing forward, mouths closed,
no elemental glow, tail curled behind, weight planted on four legs.
Keep the three head colors distinct but subdued.
Final game asset footprint is 48x32; render the concept at high resolution
with large, readable shapes that will survive downscaling.
```

### 11.4 阶段变体

推荐用 GPT Image 的参考图编辑，而不是重新生成。

#### `boss_three_fire`

```text
Use the provided neutral boss sprite as an exact reference image.
Keep the body, pose, camera, silhouette, horn and claw placement, scale,
outline, palette, and transparent background 100% unchanged.
Only the left fire head is active: eyes and mouth glow orange-red,
small embers at the mouth; the center frost head and right lightning head
are dim with closed eyes and no ice or lightning effects.
Same crisp limited-palette pixel-art style.
Do not add scenery, text, UI, shadow, new heads, or new limbs.
```

#### `boss_three_frost`

```text
Use the provided neutral boss sprite as an exact reference image.
Keep the body, pose, camera, silhouette, horn and claw placement, scale,
outline, palette, and transparent background 100% unchanged.
Only the center frost head is active: pale cyan glow, crystalline ice shards
around the mane, cold mist at the mouth; the left fire head and right lightning
head are dim with closed eyes and no fire or lightning effects.
Same crisp limited-palette pixel-art style.
Do not add scenery, text, UI, shadow, new heads, or new limbs.
```

#### `boss_three_lightning`

```text
Use the provided neutral boss sprite as an exact reference image.
Keep the body, pose, camera, silhouette, horn and claw placement, scale,
outline, palette, and transparent background 100% unchanged.
Only the right lightning head is active: yellow-white glowing eyes and forked
horns, small white-blue electric arcs around the head; the left fire head and
center frost head are dim with closed eyes and no fire or ice effects.
Same crisp limited-palette pixel-art style.
Do not add scenery, text, UI, shadow, new heads, or new limbs.
```

### 11.5 通用负面提示

```text
background, scenery, floor, ground shadow, text, UI, frame, watermark,
sprite sheet, multiple views, extra heads, extra limbs, realistic fur,
3D render, soft shading, gradients, anti-aliasing, blur, glow covering the body
```

### 11.6 后处理与限制

```bash
node scripts/pixelize.mjs output/boss-three-source.png --key boss_three \
  --model "gpt-image-2.5" --seed "<seed>" --prompt "<简短主体描述>"
```

- 目标尺寸 `48×32`；阶段变体必须来自同一张基础图，保证换阶段身体不抖动。
- `assets/plan.json` 已有 `boss_three` 键；若增加阶段变体，Codex 需同步 `plan.json`、`SPR`、绘制查找与图鉴/资源记录。
- **重要限制**：项目产线实测指出，大图缩到目标网格会抹平细节；GPT Image 没有真正的 48×32 像素网格。最稳妥流程是 GPT Image 出概念/造型 → 在 Aseprite 按 `assets/palette.gpl` 重绘 48×32 成品；`pixelize` 只作保底与量化。阶段变体建议在成品基础图上局部换头/换色，而不是每张独立重画。
- 贴图命名沿用 `SPR` 键：基础 `boss_three`，变体 `boss_three_<element>`；不要使用 `elite_` 前缀。

## 12. 开放问题

当前默认值如下，若改动需同步本文与实现：

1. Boss 频率：默认 `wave % 10 === 0`；也可只做 10/20/30。
2. 阶段随从：默认 P2 蝙蝠、P3 角兽；也可首版不召唤或后续做专属小怪。
3. 奖励：默认 2 普通宝箱 + 1 血包 + 8 倍精英经验；品质祝福上限沿用现有规则。
4. 控制：默认硬免疫 + 冲锋硬直易伤；也可改成“冻结/眩晕时长减半”。
5. 场地：默认不建独立 Boss 房；依靠冲锋和远程招式处理风筝。
6. 多 Boss：首版只做三首巨兽；后续可在同一框架下加不同 Boss 或词缀。

## 13. 验收清单

- [ ] Boss 波（10/20/30…）只生成 Boss，不生成普通怪/精英。
- [ ] Boss 在 70% / 35% 正常转阶段；转阶段无敌、清弹幕、无伤害。
- [ ] 三阶段招式均有清晰预警、安全区、伤害类型与冷却。
- [ ] Boss 不吃硬控/击退；减速减半；冲锋硬直有 +15% 易伤。
- [ ] Boss 血条显示名称、当前阶段与三阶段圆点，死亡/休整/重开隐藏。
- [ ] 召唤物无经验/掉落，清空后才进入收球；不占普通波次配额。
- [ ] Boss 奖励、经验、图鉴条目正常；`runBossKills` 只统计真实 Boss。
- [ ] 死亡总结「首领击杀」正确，普通精英不再误计。
- [ ] 暂停/属性/图鉴冻结 Boss 与危险区；重开/返回开始清理干净。
- [ ] `npm run typecheck`、`npm run build` 通过；受控 e2e 与自然试玩分别记录。
- [ ] 素材命名/尺寸/透明底/阶段变体一致；manifest 与 `plan.json` 同步。
