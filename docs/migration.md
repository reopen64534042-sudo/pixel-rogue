# 迁移记录与验收基线

> 当前规则已同步上游 v8（27565b4），对照快照为 legacy/upstream-v8.html。下文原迁移阶段的 v7 数值和结果保留为历史记录；当前生效差异及复核结果见文末「上游 v8 同步」。legacy/original.html 始终保持初始 v7 原件。

## 输入与阶段

实际输入为仓库 `index.html`（71848 字节），没有 `index(4).html`。原 HEAD 为 `99ae72b`。完整副本 `legacy/original.html` 的 SHA-256：

```text
450A669075DEF19FA7324B6187C4418EB842ACEE4ACBDFB6B0379C8FABEB86B5
```

没有提交、推送或发布云站点。各阶段以可运行成果和验证结果分界，Git 最终保留本地变更。

| 阶段 | 实施与阶段验证 |
|---|---|
| M0 | 创建 AGENTS、计划、npm/Vite/TS；拆分 CSS/JS，保留 Canvas 运行；npm install、typecheck/build、浏览器开始与属性面板通过 |
| M1 | Scene 更新/输入/相机；原像素地图、精灵、粒子、预告、闪电、飘字、HUD 映射为 Phaser 对象；构建与浏览器移动/暂停/画面检查通过 |
| M2 | 规则、数据、UI、音频/存储分离；固定步长、状态命令与熔炉事务；37 项单元/原版对照测试通过 |
| M3 | 自托管字体、小视口、焦点、存储失败提示、生产无测试控制入口；真实浏览器、生产自然第一波、构建与文档核对 |

M0 中间脚本留在 legacy/，不参与生产构建。scripts/ 是此次提取时使用的历史工具，包含当时的中间结构，**不得对最终工程重跑**。日常只使用 package.json 命令。

## 核实后的原版功能

源码共有 **34 种天赋**，头部与天赋表的「24 种」注释已过时。稀有度 4 档；等级 1/5/10/16 对应权重 `[70,25,5,0]` / `[45,35,15,5]` / `[25,35,25,15]` / `[10,30,35,25]`。

| 系统 | 保持的行为/数值 |
|---|---|
| 世界/移动 | 480×270 逻辑视野，1680×1232 世界，玩家边界 24 像素，移速 62，斜向系数 0.7071 |
| 自动攻击 | 230 最近目标范围，初始伤害 11、攻速 2.2、弹速 170、寿命 1.4；多弹道偏角 0.16 |
| 投射物 | 穿透/弹射消耗与 0.85 伤害衰减、命中列表、敌方弹幕、冲刺无敌判断 |
| 机制伤害 | 环绕飞刃、减速、灼烧、链式闪电、陨星预告与范围伤害、击杀爆炸、反伤 |
| 生存 | 暴击/暴伤、吸血、回复、闪避、最高 60% 减伤、临时护盾→常驻护盾→HP、免死每波一次 |
| 冲刺 | 先学疾影步，速度 280、持续 0.16、方向记忆、冷却和二段充能 |
| 敌人 | 史莱姆/蝙蝠/坦克/射手/自爆虫，第 1/3/5/6/8 波解锁；原权重、AI、分离、射击/预警/自爆规则 |
| 生成/精英 | 世界内离玩家约 300 像素生成；第 4 波倍数首敌是精英坦克；HP/伤害/等级缩放不变 |
| 波次 | 第 1 波配额 15，每波 +9，最多 135；spawnCd 与 160 敌人上限保留 |
| 掉落/成长 | 精英 25 XP、药水、幸运双倍与掉药；磁力拾取；初始 XP 阈值 8，升级后 ceil(×1.15) |
| 升级 | 三选一、上限/前置、伤害候选保证、各卡独立刷新 1 次；新 XP 不重抽已展示的卡 |
| 熔炉 | 每次休整最多一次；同档材料 2 等级→高一档 1 等级；先验证库存再整体消耗，按 picks 顺序重算 |
| UI | 开始、属性、暂停、升级、报告、熔炉、死亡与 R 重开；1/2/3、C/P/M/空格/WASD/方向键 |
| 表现 | 原像素纹理/精英缩放、棋盘地面与装饰/砖墙、飘字/粒子、冰冻/命中白闪、护盾/冲刺/闪电/陨星、震屏与受伤边框 |
| 音频 | WebAudio 合成原频率/时长/音型，开始和死亡双音序列，M 静音 |
| 数据 | pixelrogue_records，最多 50 场，旧 `{d,t,k,lv,w,up,dmg}`，整局伤害累计；没有完整局内恢复 |

## 状态与时间契约

原版真正的互斥模式为 start/play/stats/pause/over；level/report/swap 是非打断底部面板。现以 `core.phase` 对外覆盖 start/play/levelup/stats/pause/report/swap/over，但不改变暂停语义：

- P / C：时间、移动、敌人、弹幕、冷却、经验等模拟全部冻结；返回后无暂停时长补算。
- 升级/报告/熔炉：模拟仍运行，保留原版节奏。
- fight→collect→rest：刷满配额且敌人清空→自动收球→经验球和待选等级都清空→休整报告；下一波必须手动开启。
- 用 `FixedClock` 将 Phaser delta 累积为 1/60 秒，保留原版 gem 速度 ×0.9 等按帧规则在 60 Hz 下的手感；30/60/120/144 Hz 同一秒位移一致。超过 100 ms 的卡顿限额处理，后台隐藏自动暂停，恢复需手动操作。
- 键盘忽略连发的模式切换；窗口失焦清除按键。唯一 Scene 更新，无自行 requestAnimationFrame；Scene shutdown/HMR 清理监听和音频。

## 原文件到模块的映射

| 原代码职责 | 当前位置 |
|---|---|
| HTML/CSS | 根 index.html、src/styles/game.css |
| 原始全局状态/reset | GameCore.ts 与 types.ts（每局实例） |
| 主 update 与移动 | Simulation.ts（顺序编排）、PlayerSystem.ts |
| 攻击、飞刃、陨星 | AttackSystem.ts |
| 子弹与敌方弹幕 | ProjectileSystem.ts |
| hurtEnemy/killEnemy/damagePlayer/addText | CombatSystem.ts |
| ETYPES/spawn/nearest/AI/敌人分离 | data/enemies.ts、EnemySystem.ts |
| 配额/清场/收球/休整 | WaveSystem.ts |
| 宝石/药水/升级经验 | ProgressionSystem.ts |
| 粒子/飘字/闪电寿命 | EffectsSystem.ts |
| statBase/UPGRADES/权重 | data/stats.ts、data/talents.ts、TalentSystem.ts |
| 底栏选卡/刷新/置换 | TalentSystem.ts、SwapSystem.ts（规则），GameUI.ts（DOM） |
| 像素工厂/draw | rendering/sprites.ts、draw.ts、PixelPainter.ts |
| requestAnimationFrame/键盘/相机 | GameScene.ts、FixedClock.ts |
| beep/localStorage | AudioService.ts、StorageService.ts |

渲染通过 Phaser Graphics、Image、Text 和实际相机实现；复用对象与相邻图形命令批次，保留绘制先后顺序。没有每帧把旧 Canvas 上传为 Phaser 纹理。生成像素纹理和 Phaser 文本内部仍允许 Canvas；战斗判定仍用原圆形范围与算法，未改成 Arcade Physics 碰撞。

## 独立缺陷修复

### F-01：同名两级不能投入两张材料

- 原版真实浏览器复现：磨刃 Lv2、休整、目标稀有，连续点同一库存，选择数是 **1→0**。
- 期望依据：原注释和界面明确「1级=1张，可拆等级」，应允许两级作为两卡。
- 修复：库存循环 0→1→2→0（不超过当前等级与两卡总数）；熔炉验证同档/数量/整数/计数与 picks 库存一致性后才消耗。
- 验证：原版浏览器测试确认旧缺陷；Vitest 三档输出、同名/异名材料、非法材料、重算、一次限制；浏览器实际点击同名两次并熔炼。

当前输入不存在 `consumeUnits()` / `poolValue()`。`TIER_VAL=[1,2,4,8]` 在原代码只用于库存排序。没有引入混档价值兑换、找零或新经济；三档均满足 `2×低档价值=高档价值`，测试验证不凭空丢失/复制等级。

### F-02：「本波」报告错误显示累计伤害

- 复现：原 `startNextWave()` 不清零 dmgBy，第一波 100、第二波 30，第二波 UI 会显示 130。
- 期望依据：原报告标题「本波伤害统计」，应显示第二波 30；战绩仍需整局 130。
- 修复：保存每波开始的伤害快照，报告显示差值；不清零整局 dmgBy，不改变战绩格式/伤害规则。
- 验证：Vitest 同时断言第一波 100、第二波 30、保存战绩 130。

### 迁移过程发现并修正的问题

- 核心已打开升级面板时，原 UI 的「已打开就返回」残留判断阻止显示卡片；浏览器先失败，修正为 UI 只显示核心已准备好的选项，原验收保持不变。
- Phaser HUD 字体名未加引号，导致 Canvas 使用默认 10px sans-serif；视觉检查及 48 逻辑像素字宽断言先失败，加引号后通过。
- 初始化/重开清理库存选择、卡槽和按键，防止上一局临时状态泄漏。开始/死亡延迟音符受服务生命周期管理。

## 选型与依赖

- 核验日期 2026-10-24：官方 https://phaser.io/download/stable 和 npm latest 均为 **4.2.1**；已安装并验证真实渲染/输入/构建，无 Phaser 3 回退。
- 官方稳定页所链 getting-started-phaser4 返回 404；使用安装包 README、类型声明和实现核对 API。
- Node 24.21.0 / npm 11.17.0；Vite 8.3.5 / Vitest 5.0.5 与本机兼容。
- TypeScript 首选安装 7.0.2，发现其默认入口不再提供传统 AST 编译器 API；为安全机械提取源码，固定 **6.0.3**。最终 TS 严格检查通过，未使用 any/ts-ignore/ts-nocheck。
- Playwright 1.64.1；使用本机 Chrome 155。初次缺少 Playwright 自带 Chromium 导致启动失败，未执行到游戏；下载过慢后停止，改用已安装系统 Chrome。README 提供 Chromium 替代方法。
- 自托管 Press Start 2P（SIL OFL），许可证随 dist 提供；不依赖 Google Fonts/CDN 运行。

## 实际验证记录

原版：Python HTTP 4172 + Chromium，开始、D 移动约 0.6 秒从 x=840 到 877.72，P 暂停；3.4247 秒时生成 2 敌；继续到 21.43 秒时 10 击杀、弹丸伤害 220、10 经验球。控制台仅 favicon 404。file:// 被工具策略阻止，改用 HTTP。保留截图 original.png 与 original-world.png。

最终规则测试 **37 项**：

- 34 个天赋逐个对比原脚本效果/上限/稀有度。
- 基础战斗第 1/4/8/16 波各 1800 步；携带全部天赋第 4/8/16 波各 1200 步，与 `legacy/original.html` 的真实 JS 在 VM 内使用相同随机种子对比。只隔离 DOM/音频与选卡 UI，实际战斗算法、实体、伤害和状态参与比较。
- 边界、最近目标/攻击/死亡/经验、升级与卡槽、暂停/属性冻结、波次转换/精英/重开、四种显示刷新率。
- 天赋上限/前置/权重/伤害保底、独立刷新、暴击/吸血/护盾/免死/冲刺、穿透/弹射及机制伤害。
- 熔炉三档价值守恒、材料一致性、同名/异名、重算和每波限制；本波报告与整局累计分离。
- 旧记录兼容、最近 50 场、损坏/未知格式保护、拒绝读取/配额不足。

浏览器共 **6 项**：受控真实 UI 完整流程、小视口、原版缺陷、相机与字体尺寸、性能测量、生产自然第一波。生产验证无测试桥、无改数值，观察真实自动战斗 15 击杀→收球→升级→报告→下一波→暂停恢复，并检查资源失败/404和未捕获异常。截图在 output/playwright/；实际最终执行结果见下方命令表（最终复核后填写）。

性能：Chrome 155 headless，本机 160 敌人 + 120 子弹，240 次模拟更新，p50=0.2 ms、p95=0.5 ms、单次最大 12.5 ms。每步敌人分离最多 12720 对，投射物遍历最多 19200 对。**这只是纯模拟 CPU 基线，不是完整画面帧率、移动设备性能或最坏构筑保证**；没有根据不足地引入空间分区/ECS。后续以同场景持续测量再决定优化。

## 产物与部署

Vite base='./'；dist 包含 HTML、JS/CSS、字体及许可证。生产无 legacy、tests、迁移脚本或测试控制接口。README 给出 npm ci、构建、预览与 Cloudflare Pages 配置，未连接账号、创建云资源或发布线上。

## 已知限制与后续边界

- 无阻塞性已知迁移缺陷。未做多小时长局、Firefox/Safari、更多显卡、真实低性能设备的完整测试；音效代码/触发与浏览器音频启动已验证，未做人工听感验收。
- 原版飞刃视觉半径 26 与 area 放大的实际判定不完全一致，维持原规则；闪电描述写「概率」但实现按冷却触发，也保留原行为。若要调整应独立做平衡/表现修复。
- 全部浏览器验证在本机，未作公网部署或真实线上端到端；没有完整局内恢复、战绩列表 UI、触屏操作。
- 未知或损坏战绩不覆盖，结算提示失败；跨 Origin 的旧数据不会自动转移。
- Phaser 完整引擎包较大，后续若首屏网络测量确认瓶颈再做定制构建；当前优先完整规则与可维护性。

## 最终复核命令（2026-10-24，本机）

| 实际命令/检查 | 结果 |
|---|---|
| npm install | M0 成功 |
| npm ci | 成功，按锁文件安装 43 包；初次因开发服务锁住 rolldown 原生模块 EPERM，停止本次开发服务后成功，无手动删目录 |
| npm run typecheck | 成功，strict + noUnusedLocals + noUnusedParameters |
| npm test | 3 文件、37 项全部通过，最终约 1.02 秒 |
| npm run build | 成功；最终 HTML 3.41 kB、CSS 6.44 kB、JS 1417.48 kB（gzip 374.80 kB），另有字体 115280 字节与许可证 |
| npm run test:browser | 6 项全部通过，最终 57.1 秒；生产自然流程 31.0 秒；无未捕获游戏异常或生产资源请求失败 |
| npx prettier@3.9.10 --check src tests package.json tsconfig.json vite.config.ts vitest.config.ts playwright.config.ts | 全部匹配文件格式通过；没有把 formatter 添加为项目依赖 |
| git diff --check | 通过；Windows LF/CRLF 提示不属于内容错误 |
| git hash-object legacy/original.html 与 git rev-parse HEAD:index.html | 均为 c98737384e3be80a83c2953620498365a360c537，原文件字节保持一致 |
| 生产包静态检查 | 无 __PIXEL_ROGUE__ 测试接口、无原版源码；字体相对路径与许可齐全 |
| 核心模块静态检查 | 无 any、ts-ignore、ts-nocheck、DOM/Window 或 requestAnimationFrame |

最终性能复采样为 p50=0.2 ms、p95=0.4 ms、最大 9.8 ms；前文首轮数据保留用于说明波动，不据此宣称完整渲染 FPS。

构建保留 Vite 默认的「单 chunk 大于 500 kB」警告，没有提高告警阈值掩盖包体积。Phaser 完整包仍约 1.42 MB（gzip 375 kB），为已知非阻塞限制。

## 迁移验收检查表

- [x] M0：源文件保护、工程入口、依赖锁定、AGENTS、Canvas 阶段运行与构建。
- [x] M1：Phaser 主循环/输入/相机/世界/纹理/粒子/投射物/HUD，边界与清晰字体检查。
- [x] M2：规则模块、全部天赋、真实攻击及状态、熔炉、兼容存储、37 项规则/原版对照测试。
- [x] M3：菜单与底栏、暂停/重开、小视口、生产自然第一波与后续开波、错误处理、资源与部署产物、最终文档。
- [x] 修复与迁移差异分开记录，保留原版输入和独立缺陷证据。
- [ ] 公网部署、Firefox/Safari、不同设备及多小时长局：本次未执行，不作为已通过项目。
- [ ] 人工听感验收：本次未执行。

## 上游 v8 同步（2026-10-24）

本次读取并同步 upstream/main 与 origin/main 的同一提交：`27565b4`，提交说明为 `balance(v8): 前期节奏提速 - 地图缩小30%, 刷怪翻倍, 前期经验曲线放缓`。远端只修改了 index.html（18 行新增、12 行移除）。当前功能分支 feat/phaser-migration 已快进到该提交，没有新增提交或推送，也未直接操作主分支。

根 index.html 已经是迁移后的工程入口，因此先在系统临时目录备份入口，再按 Git 的 Windows 换行过滤输出还原暂时的基线以完成快进，最后恢复入口；其字节与同步前一致。初次尝试因未应用工作区换行过滤被 Git 拒绝，没有覆盖文件，已改用 cat-file --filters 完成。其他未提交与未跟踪文件均保留。

- legacy/original.html：初始 v7，SHA-256 仍为 `450a669075def19fa7324b6187c4418eb842acee4acbdfb6b0379c8fabeb86b5`。
- legacy/upstream-v8.html：新增的完整上游 v8 快照，SHA-256 为 `d4e04dc3405f1ac1a9d8eb7151f48e01ae2f6105f2e4f1a8cc195f195e758e7b`。
- v8 快照 Git blob `9137b0f7406d258f9c1ccfc3526561c1eb98625e`，与 HEAD:index.html 完全一致。

### 已同步的实际差异

| 改动 | v7 | 上游 v8 / 当前工程 | 对应模块 |
|---|---|---|---|
| 世界 | 1680×1232 | 1392×1040，面积约缩小 30% | data/constants.ts |
| 初始经验阈值 | 8 | 6 | GameCore.ts |
| 后续经验阈值 | ceil(×1.15) | ceil(×1.13) | ProgressionSystem.ts |
| 波次配额 | min(135,15+(n-1)×9) | min(150,20+(n-1)×10) | WaveSystem.ts |
| 史莱姆/蝙蝠/坦克/射手/自爆虫速度 | 26/56/17/34/66 | 30/62/20/38/72 | data/enemies.ts |
| 刷怪间隔 | max(0.45,1.6-wave×0.09) | max(0.35,1.2-wave×0.07) | WaveSystem.ts |
| 生成批次 | 每批 1 只 | 第 5 波起普通敌人每批 2 只，受剩余配额限制；精英单独生成 | WaveSystem.ts |

480×270 逻辑视野、玩家数值、天赋/熔炉、精英规则、战绩格式和此前独立缺陷修复保持不变。README 与 AGENTS 中的当前世界/经验/配额基线已更新；原迁移章节的 v7 数据保留为历史，不作为当前数值。

### 验证调整与结果

- 规则对照改用完整的上游 v8 快照，并增加第 5 波边界场景：基础第 1/4/5/8/16 波各 1800 步，全部天赋第 4/8/16 波各 1200 步。
- 初轮对照发现测试夹具不对称：原脚本曾关闭 openLevelPanel，而迁移版仍真实抽卡；v8 提前升级后随机数序列分叉。现仅隔离 DOM 绘制，双方都执行真实升级和抽卡，并比较 pendingLevels、bpMode 与卡槽内容，不屏蔽核心行为。
- 原生产冒烟仅选择一次升级，不适合 v8 首波可能多次升级；改为通过真实卡片持续选择，直到所有待选升级完成并进入休整，不修改经验、血量、计时器或配额。
- 原版浏览器对照改为运行 legacy/upstream-v8.html，截图 upstream-v8-world.png；原 v7 HTML 和历史截图不覆盖。
- 本次未改依赖版本。开始验证时本地依赖命令缺失；npm ci 首次受此前预览进程锁文件影响，停止该进程后按锁文件安装成功。
- npm run typecheck 通过；npm test **38 项通过**；npm run build 通过（JS 1417.60 kB，gzip 374.82 kB，保留默认体积警告）；git diff --check 通过。
- npm run test:browser **6 项全部通过**，总耗时约 1 分钟；新版生产流程约 33.1 秒，自然完成首波 20 击杀、两次真实升级选择至 Lv3、休整、下一波及暂停恢复。截图 production-first-wave.png 已更新为 v8 实际结果。
- 变更文件 Prettier 检查通过；v8 原版、相机/字体、小视口、熔炉/战绩/重开均通过浏览器检查。纯模拟性能复采样 p50=0.2 ms、p95=0.4 ms（不含渲染）。

## 平衡变更 D-01：击杀狂热上限随天赋等级（2026-10-24）

**基线更新依据：Issue #1（用户已批准的平衡变更）。** 这是需求变更驱动的基线升级，不是为通过测试而修改验收目标。

- 变更前（v8 基线）：叠层上限固定 3 层（+30%），升级只延长持续时间，Lv3 后收益衰减明显。
- 变更后（当前工程）：上限 = `3 + hasteLv`，即 Lv1=4 层(+40%)、Lv2=5 层(+50%)、Lv3=6 层(+60%)。持续时间 `2 + hasteLv` 秒、受伤扣除 2 层、每层 +10% 攻速均保持不变。
- 涉及位置：`data/talents.ts` 的 `hasteCap()` 及「击杀狂热」描述/数值预览；`core/CombatSystem.ts` 的 `killEnemy()` 叠层上限。
- 验收基线更新：`tests/parity.test.ts` 的「全天赋战斗对照」把击杀狂热排除在逐字段相等之外——攻速差异会必然扩散到全部弹道字段，无法逐字段对照；该天赋改由新增两条显式断言回归：三个等级分别封顶 4/5/6 层、未学习时不产生叠层。
- 其余 33 个天赋仍与原版 v8 严格逐字段相等，出现任何差异都按 bug 处理；受保护的原版快照 `legacy/upstream-v8.html` 未修改。
- 变异验证：临时把 `hasteCap` 改回常量 3，新断言报 `expected 3 to be 4`，其余对照全绿；恢复后 40 项测试通过。

## 基础设施 D-02：近战攻击模块（2026-10-24）

**基线更新依据：Issue #13（用户已批准的基础设施建设）。** 这是新增能力驱动的基线升级，不是为通过测试而修改验收目标。

### 复现

原工程只有远程自动攻击（子弹）。`orbit`（环绕飞刃）是圆形环绕碰撞，无法表达「扇形斩」「落点砸地」「穿敌直线」三种近战判定形态，因此 #7 跃击 / #8 大剑链 / #9 太刀链 / #10 近战嗜血四条需求都无法落地。

### 变更

新增 `core/MeleeSystem.ts`，提供四项能力：

| 能力 | 实现 |
|---|---|
| 最近目标单体判定 | `meleeSwing` 省略 `angle` 时用 `nearestEnemy` 取方向；无目标直接返回，不空挥 |
| 扇形范围判定 | `spread` 指定张角，按 `atan2(sin,cos)` 归一化角差与半张角比较 |
| 圆形 360° 判定 | `spread >= 2π` 时跳过角度判定 |
| 伤害来源标记 | `DamageSource` 新增 `"melee"`，`hurtEnemy` 记账到 `dmgBy.melee` |
| 击退 | `knock` 以速度 (px/s) 写入 `Enemy.kx/ky`，`EnemySystem` 每帧衰减位移 |
| 刀光绘制 | `rendering/draw.ts` 画三层同心弧，外缘亮、向内渐淡 |

调度位置：`Simulation.update()` 中位于 `updateAttacks` 之后、`updateProjectiles` 之前，即「玩家 → 远程攻击 → 近战 → 弹道 → 波次 → 敌人 → 拾取 → 特效」。

### 为实现零影响做的两项设计选择

1. **`Enemy.kx/ky` 必须是可选字段**，且 `spawnEnemy` 不初始化。若声明为必填字段，敌人对象会多出两个键，JSON 深比较必然失配（首次实现即因此导致 8 项对照失败）。改为可选后，未发生击退时对象结构与 v8 完全一致。
2. **击退位移由 `EnemySystem` 统一结算**，`MeleeSystem` 只写入速度，不直接改坐标——避免近战模块反向依赖敌人 AI 的移动顺序。

### 验收基线更新

`damageBy` 新增 `melee` 键，而 v8 快照没有该项，因此两段对照测试改为：

- 用 `takeMelee()` 把 `melee` 从两侧快照中摘出；
- 显式断言 **v8 快照无此键**、**当前实现的 `dmgBy.melee` 恒为 0**（此阶段没有任何天赋调用近战）；
- 其余分项与其余字段继续逐字段严格相等。

**保留了回归能力**：任何原有分项（bullet/orbit/chain/meteor/explode/thorns/burn）出现偏差，或近战伤害意外渗入对照场景，测试都会失败。未删除任何测试段，未修改 `legacy/upstream-v8.html`。

### 变异验证

| 变异 | 预期 | 实测 |
|---|---|---|
| 把扇形角差阈值放大 100 倍 | 背后敌人被误命中 | `expected [ {slime…}, …(1) ] to have a length of 1 but got 2` |
| 在 `updateMelee` 里累加 `dmgBy.melee` | 对照场景出现近战伤害 | `expected 1800 to be +0`（1800 帧各 +1） |

恢复实现后：`npm run typecheck` 通过；`npm test` **45 项通过**（原 40 + 新增 5）；`npm run build` 通过（JS 1419.41 kB，gzip 375.45 kB）；`npm run test:browser` **6 项通过**，性能基线 p50=0.1 ms、p95=0.3 ms 无回归。

### 已知限制

- 本工单只交付能力，不含任何天赋。游戏内暂无调用方，**行为与画面与改动前完全一致**，只能通过断言与受控调用验证。
- 刀光用程序化弧线绘制，不依赖像素贴图——因为三种判定形态的张角差异极大（90° / 360° / 圆形），单一贴图无法自适应，且 #3 的飞刃贴图仍未定稿。
- 近战命中沿用 `hurtEnemy` 的暴击与闪电链逻辑，不单独开伤害通道。

## 机制变更 D-03：血包满血转化为最大生命（2026-10-24）

**基线更新依据：Issue #12（用户已批准的机制变更）。** 这是需求变更驱动的基线升级，不是为通过测试而修改验收目标。

### 复现

血包此前有三种浪费路径：满血时**完全不吸附**（`canPull = hp < maxhp`），原地堆积只能绕路；不满血时溢出部分直接丢弃；后期有了再生/吸血/护盾，掉血机会本身很少。结果是前期拿不到、后期用不上。

### 变更

| 场景 | 变更前 | 变更后 |
|---|---|---|
| 满血拾取 | **不吸附**，踩上也只加 0 | `maxhp +1`、`hp +1`，飘字「生命上限+1」 |
| 不满血拾取 | +20 HP，溢出丢弃 | 不变 |
| 吸附条件 | 仅 `hp < maxhp` | **满血也吸附**（`canPull` 判断移除） |
| 每波上限 | 无 | 转化点数额外受 `POTION_GROW_CAP = 10` 限制 |
| 总上限 | 无 | **不设**（按用户决定，加成永久累积） |

关键区分：**清零的只是「本波已转化几点」的计数器，`maxhp` 加成本身永久保留**，死亡、换波都不回退。

涉及位置：`data/constants.ts` 新增 `POTION_GROW_CAP`；`core/GameCore.ts` 新增 `potionGrow` 字段（`resetGame` 归零）；`core/WaveSystem.ts` 的 `startNextWave()` 每波归零；`core/ProgressionSystem.ts` 的拾取分支。

### 验收基线更新

该机制改变 `player.maxhp` / `player.hp`，parity 的 wave 1 场景确实受影响：玩家满血（100/100）拾到 1 个血包，`maxhp`/`hp` 同步变成 101，其余字段与 v8 完全一致。

因此两段对照测试改为 `expectParity()`：

- 把 `hp`/`maxhp` 从玩家对象中摘出，其余玩家属性与其余所有字段继续逐字段严格相等；
- 对 `hp`/`maxhp` 显式断言三条规则：增长量落在 `[0, POTION_GROW_CAP]`、当前血与上限**同步增长**（`hp 增量 === maxhp 增量`）。

**保留了回归能力**：任何非 `hp/maxhp` 字段的偏差、增长量越界、或只加上限不加当前血，都会失败。未删除任何测试段，`legacy/upstream-v8.html` 未修改。

### 变异验证

| 变异 | 实测结果 |
|---|---|
| 删掉 `p.hp += 1`（只加上限不加当前血） | parity 报 `expected +0 to be 1`；独立测试报 `expected 100 to be 101` / `expected 107 to be 110` / `expected 102 to be 104` |
| 把每波上限判断改成永真 | `expected 113 to be 110`（13 个血包全被吃下） |

### 验证结果

| 项 | 结果 |
|---|---|
| `npm run typecheck` | 通过 |
| `npm test` | **45 项通过**（原 40 + 新增 5） |
| `npm run build` | 通过（JS 1417.91 kB / gzip 374.91 kB） |
| `npm run test:browser` | **6 项通过**，性能 p50=0.1 ms、p95=0.2 ms 无回归 |

### 边界行为说明

达到每波 +10 上限后，血包**仍会被消耗**并提示「本波已满」，不留在原地。实际每波掉落约 1~4 个（普通怪 2%、精英必掉 1 个），几乎不会触到上限，因此该分支极少走到；这样处理是为了避免地上堆积。

## 机制变更 D-04：宝箱掉落与精英奖励（2026-10-24）

**基线更新依据：Issue #15 / #17（用户已批准的机制变更）。** 需求变更驱动的基线升级，不是为通过测试而修改验收目标。

### 复现

天赋获取渠道只有「升级三选一」一条。熔炉是等价置换（2 张低档换 1 张高档），不增加总量。玩家常常「想要的抽不到」，build 成型依赖运气。

同时精英奖励是硬编码的 25 点经验 + 1 个血包，25 是固定值，而升级阈值每级涨 13%，后期严重贬值。

### 变更一：宝箱（#15 方案 C）

| 项 | 规则 |
|---|---|
| 掉落 | 普通怪 1%（确定性伪随机）；精英必掉 |
| 每波上限 | 普通怪最多 2 个；**精英那一个不占此名额** |
| 落地 | 掉在原地等待玩家踩上去 |
| 波次结束 | 未拾取的像经验球一样自动飞向玩家 |
| 开启时机 | 经验吸收 → 升级选卡 → **开箱** → 休整（天赋置换） |
| 开箱内容 | 只从**已学且未满级**的天赋里抽 3 个各 +1 级 |
| 什么都不升 | 已学不足 3 个按实际数量；无可强化项时转为 +8 经验与 1 个血包 |
| 刷新 | 宝箱卡片**不提供**刷新（与升级面板的区别） |

### 变更二：精英奖励（#17）

- 经验：固定 25 → **`25 + (波次-1) × ELITE_XP_STEP`（=4）**，第 10 波 61、第 20 波 101
- 宝箱：精英 **100% 必掉**，且不占普通怪名额（即精英波最多 3 个：2 普通 + 1 精英）

### 关键实现约束

**所有掉落判定必须用确定性伪随机 `hash01(seed, waveN)`，不能用 `Math.random`。**
`Math.random` 会推进随机序列，让 parity 的确定性模拟在后续**每一个**随机点分叉——这比数值改动的影响面大得多。`rollBoxPicks` 的抽取同理。

### 验收基线更新

本变更改变精英宝石的经验值。parity 实测影响极其干净：wave 4 全天赋场景中，**只有地上那颗精英宝石的 `v` 从 25 变成 37**，其余 20 个字段完全一致（宝石尚未被吸收，未引发连锁）。

因此 `expectParity()` 增加第三条规则并接收 `wave` 参数：

- 先断言每个精英宝石的 `v` 等于 `25 + (wave-1) × ELITE_XP_STEP`；
- 再把这些宝石的 `v` 归一化为 0，然后照旧逐字段严格比较。

**保留了回归能力**：普通宝石经验、宝石数量与位置、其余一切字段仍与 v8 严格相等；精英经验一旦偏离新公式立即失败。未删除任何测试段，`legacy/upstream-v8.html` 未修改。

### 变异验证

| 变异 | 实测结果 |
|---|---|
| 去掉每波宝箱上限 | `expected 37 to be 2`（3000 只怪掉出 37 个） |
| 精英经验改回固定 25 | parity 报 `expected 25 to be 37`；独立测试报 `expected 25 to be 61`（wave 10） |

### 验证结果

| 项 | 结果 |
|---|---|
| `npm run typecheck` | 通过 |
| `npm test` | **60 项通过**（原 51 + 新增 9） |
| `npm run build` | 通过（JS 1428.69 kB / gzip 378.12 kB） |
| `npm run test:browser` | **6 项通过** |

### 新增文件与字段

- `core/types.ts`：`Box` 接口；`Panel` 增加 `"box"`
- `data/constants.ts`：`BOX_DROP_CAP`、`BOX_DROP_RATE`、`ELITE_XP_STEP`、`hash01()`
- `core/GameCore.ts`：`boxes`、`boxDropsThisWave`、`boxPicks`
- `core/TalentSystem.ts`：`rollBoxPicks()`、`openBoxPanel()`；`chooseSlot()` 支持双模式
- `game/rendering/sprites.ts`：`SPR.box`（12×10 木箱）
- `tests/chest.test.ts`：9 条

## 基础设施 D-05：Combat Foundation S1 统一伤害纯计算器（2026-10-24）

**基线更新依据：docs/pixel-rogue-combat-foundation-v1.md（设计已确认的 P0 基础设施，本次实施 S1）。** S1 契约明确「游戏运行入口暂不接新结果」，未修改任何既有战斗调用方，对运行时行为零影响，parity 对照全部保持。

### 交付物

| 文件 | 内容 |
|---|---|
| `src/game/data/damageTypes.ts` | 减伤策略 `MitigationStrategy`、`DamageTypeInfo`、注册表约束 `DamageTypeRegistry`、正式注册表 `DAMAGE_TYPES`（physical/fire/lightning/true） |
| `src/game/data/combatBalance.ts` | `CombatBalance`（armorK=50、resistanceCap=0.75、toughCap=0.6），v1 试验基准集中存放 |
| `src/game/core/types.ts` | `AttackForm`/`DamageKind`/`ResistanceMap`/`CombatStatsSnapshot`/`DamageRequest`/`DamageCalculation`/`DamageResult` 契约 |
| `src/game/core/DamageSystem.ts` | `calculateDamage` 纯函数与 `typeMitigationFactor`/`generalMitigationFactor` |
| `tests/damage.test.ts` | 13 项 S1 验收测试 |

### 关键实施选择（规范文本之外的具体化）

1. **注册表是 `calculateDamage` 的显式首参**：泛型 `R` 把请求的 `type` 绑定到该注册表的键上，frost 之类的扩展类型只需在测试里新建一个 `as const satisfies DamageTypeRegistry` 常量，计算器本身没有任何具体属性分支——减伤差异只体现在注册表条目的策略上（armor/resistance/none 三分支）。
2. **快照与请求以泛型 `T` 默认 `DamageTypeId`**：游戏代码按规范草案原样使用默认形；扩展注册表天然获得编译期键约束，运行时仍校验成员关系，未注册属性显式抛错。
3. **取整与保底对齐既有规则**：`kind=hit` 末尾一次 `Math.round` 并对正伤害保底 1 点，与 `hurtEnemy` 现行 `Math.max(1, Math.round(dmg))` 语义一致；`rawAmount=0` 是合法零伤害保持 0；NaN/负数/Infinity 及「增伤低于 -100% 使结算为负」一律抛 `RangeError`，不会静默复活成 1 点。
4. **暴击归编排层**：`isCritical` 由调用方判定（契约上 dot 不置位），计算器只在减伤前机械应用 `critMultiplier`；`DamageResult`（闪避/护盾/免死等应用结果）只声明类型，S2 由 CombatSystem 产生。

### S1 验收对照

| 验收项 | 结果 |
|---|---|
| frost 扩展类型不改计算器分支即可注册并计算；未知类型显式处理 | 通过（扩展注册表计算 + 未注册属性运行时报错两用例） |
| 同乘区加算、跨乘区乘算 `100×1.2×1.3×1.4=218.4` | 通过（beforeMitigation 218.4，hit 取整 218） |
| 物理防御 20（K=50）减伤系数 50/70；元素抗性 0/上限；真实伤害绕过减伤 | 三组系数断言与端到端用例通过 |
| 纯计算不读 GameCore、不调 Math.random、不执行扣血/掉落/UI | 静态检查无相关引用（仅注释文字提及）；模块无运行时调用方 |
| 默认零增伤/零护甲/零抗性不改变现有离散命中结果；不修改既有调用方 | `max(1, round(raw))` 等价断言通过；除 types.ts 追加契约外未触碰任何既有系统文件 |

### 变异验证

| 变异 | 实测 |
|---|---|
| 跨乘区乘算改为加算 | FAIL「跨乘区相乘 218.4」用例 |
| 去掉正伤害保底 1 点（`Math.max` 移除） | FAIL「与既有离散结算一致」用例（0.4 取整为 0 ≠ 1） |
| 真实伤害也应用通用减伤（去掉策略短路） | FAIL「真实伤害绕过减伤」用例 |

### 验证结果

| 项 | 结果 |
|---|---|
| `npm run typecheck` | 通过 |
| `npm test` | **85 项通过**（原 72 + 新增 13），parity 20 项全绿 |
| `npm run build` | 通过（JS 1431.59 kB / gzip 379.80 kB；DamageSystem 无运行时引用，未进入构建产物） |
| `npx prettier@3.9.10 --check`（变更文件） | 通过 |
| 核心模块静态检查 | 无 any、无 Math.random/DOM/Window 引用 |

### 已知边界

- S1 只交付契约与纯计算，游戏内无任何调用方，行为与画面与改动前完全一致；只能通过单测验证，玩法接入在 S2。
- armorK=50 与抗性 75% 上限是试验基准，S3 启用真实数值前须平衡复核。
- `DamageRequest.tags`、快照的 `attack`/`critChance` 字段为 S2+ 预留，S1 计算不消费。

### PR #1 评审修订（2026-10-24）

评审结论 Request Changes（1×P1、3×P2、1×P3），全部于本分支第二轮修复：

| 级别 | 问题 | 修复 |
|---|---|---|
| P1 | hit 统一取整破坏玩家受伤浮点语义：`damagePlayer` 不取整，第二波史莱姆 8×1.05=8.4 会被算成 8 | 结算精度与 kind 解耦：`DamageRequest` 新增**必填** `precision`（`round-min-one` 对齐 hurtEnemy 敌方命中 / `preserve-float` 对齐 damagePlayer 玩家受击）。必填且无默认正是为防 S2 接入时静默选错 |
| P2 | 两个低于 -100% 的乘区相乘互相抵消为正值，绕过终值校验 | `requireZone` 逐乘区校验「有限数字且 ≥ -1」；恰为 -100% 合法（倍率 0 → 结算 0 不保底）。暴击倍率同样校验非负 |
| P2 | `registry["__proto__"]` 等原型链成员为真值，未注册类型可混过检查 | 改用 `Object.hasOwn` 校验自有键（tsconfig lib ES2022 支持），`__proto__`/`toString`/`constructor` 显式拒绝 |
| P2 | dot + `isCritical` 组合未约束，为 S2 留下易误用接口 | 运行时显式拒绝两类非法组合：dot 暴击、dot 使用非 preserve-float 精度 |
| P3 | 设计文档指向其他仓库（`reopen64534042-sudo`）与旧建议路径 | 改指本仓库与实际入库路径；§3.3/§4 草案同步 precision 契约与 dot 组合约束 |

测试由 13 项增至 **16 项**：新增玩家浮点受伤（8×1.05 保留浮点、tough 减伤浮点、小数不保底）、双负乘区抵消（含 -100% 边界）、原型链非法键三组，并把负暴击倍率并入非法输入用例、原型链键并入未注册用例。

新守卫变异验证（4 组均被咬住后恢复）：

| 变异 | 实测 |
|---|---|
| `Object.hasOwn` 回退真值判断 | FAIL「未注册的伤害属性（含原型链成员）」 |
| `requireZone` 置为空操作 | FAIL「单个乘区低于 -100% 即非法」 |
| 去掉 dot 禁暴击守卫 | FAIL「dot 禁止暴击与取整精度」 |
| 忽略 precision 恒按 round-min-one 取整 | FAIL 3 项（含 P1 回归「preserve-float 保留玩家受伤浮点语义」） |

修复后整体验证：`npm run typecheck` 通过；`npm test` **88 项通过**；`npm run build` 通过；Prettier 通过。

## 基础设施 D-06：Combat Foundation S2 全伤害路径接入统一管线（2026-10-24）

**基线更新依据：docs/pixel-rogue-combat-foundation-v1.md S2（设计已确认的 P0）。** S1 交付的 DamageSystem 纯计算器接入全部 11 条现有伤害路径；「默认零增伤/零护甲/零抗性时与原状态完全一致」由 parity 逐字段对照保证（20 项全绿，未删任何既有测试）。

### 交付物与路径映射（§5）

| 路径 | type / form / kind / precision | 调用位置 |
|---|---|---|
| 普通弹（保留发射快照与 0.85 衰减） | physical / ranged / hit / round-min-one | ProjectileSystem |
| 环绕飞刃 | physical / other / hit / round-min-one | AttackSystem |
| 陨星 | fire / other / hit / round-min-one | AttackSystem |
| 近战 | physical / melee / hit / round-min-one | MeleeSystem |
| 雷霆连锁 | lightning / other / hit / round-min-one | CombatSystem.hurtEnemy |
| 荆棘反伤 | physical / other / hit / round-min-one | CombatSystem.damagePlayer |
| 击杀爆炸 | fire / other / hit / round-min-one | CombatSystem.killEnemy |
| 敌人接触 | physical / melee / hit / preserve-float | EnemySystem |
| 敌方弹幕 | physical / ranged / hit / preserve-float | ProjectileSystem |
| 自爆虫引爆 | fire / other / hit / preserve-float | EnemySystem |
| 灼烧 DoT | fire / other / dot / preserve-float | CombatSystem.applyBurnDot（EnemySystem 每帧调用） |

### 编排语义保持（§3.4）

- **暴击判定留在编排层**：掷骰条件（!noCrit 才掷）与顺序（先判定、结算后音效）不变；单测断言掷骰次数（普通 2 次 / noCrit 1 次 / dodge=0 全程 0 次），parity 随机序列一致证实。
- **敌方命中走 round-min-one**，与旧 `Math.max(1, Math.round(dmg × critMul))` 逐位一致（零乘区下 ×1 乘法不影响 IEEE754 结果）。
- **玩家受击走 preserve-float**：浮点扣血、UI 取整仅显示；闪避 → 壁垒 → 护盾顺序与 RNG 短路条件保持；反伤仍只发生在真实扣血后并复用管线。
- **雷霆连锁继承上一击结算值** × (0.7 + chainDmg)，noCrit/noChain 防递归不变。
- **applyBurnDot 为无副作用 DoT 入口**：不取整/不保底/不暴击/不触发吸血飘字连锁；燃烧粒子与死亡判定留在 EnemySystem 原位置。
- 非伤害 HP 路径不在管线内（此即其说明）：自爆虫自毁 hp=0 触发死亡、治疗（药水/再生/吸血回血）、不屈保命 hp=1。
- 适配器为 CombatSystem 内 playerCombatStats / enemyCombatStats 只读快照（玩家带 crit/critMul/tough，敌人全 0）；S2 无任何非零增伤/抗性来源，S3 引入。DamageSystem 纯函数零改动。

### 变异验证（3 组均被咬住后恢复）

| 变异 | 实测 |
|---|---|
| hurtEnemy 改 preserve-float | FAIL 2 项（旧公式一致、连锁继承） |
| damagePlayer 改 round-min-one | FAIL 1 项（玩家浮点） |
| applyBurnDot 扣血取整 | FAIL 1 项（DoT 60Hz 累计） |

### 验证结果

| 项 | 结果 |
|---|---|
| `npm run typecheck` | 通过 |
| `npm test` | **96 项通过**（原 88 + 新增 tests/combat.test.ts 8 项），parity 20 项全绿 |
| `npm run build` | 通过 |
| `npm run test:browser` | **6 项通过**；纯模拟性能 p50=0.2ms / p95=0.4ms（160 敌+120 弹，与 S2 前基线一致，逐次快照分配无回归）；生产自然首波+真实升级选择通过 |
| `npx prettier@3.9.10 --check`（变更文件） | 通过 |

环境备注：浏览器测试前 4173 端口被当日 20:08 遗留的本仓库 vite preview 占用（其他会话残留，PID 55784），已终止该进程后按标准命令验证；需要时可用 `npm run preview` 重启。

### PR #2 评审修订（2026-10-24）

评审结论 3×P2（无 P0/P1），全部于本分支第二轮修复：

| 级别 | 问题 | 修复 |
|---|---|---|
| P2 | 零倍率复活成 1 点：-100% 乘区或合法 0 暴击倍率下结算为 0，却被最低伤害恢复成 1 | 保底条件从 `rawAmount>0` 改为 `settled>0`：结算为 0 的命中保持 0；-100% 乘区（round-min-one）与 0 暴击倍率两个边界用例入库 |
| P2 | `DamageResult` 契约已声明但未产出 | `hurtEnemy`/`damagePlayer`/`applyBurnDot` 全路径产出 §3.5 完整结果：`effectiveHpLoss = min(受击前 HP, 结算值)`（溢出封顶）、`dodged`/`shieldUsed`（none/temporary/normal）/`killed`/`preventedDeath`；被闪避/护盾抵挡的命中未进入数值计算，结算与损失记 0；`damagePlayer` 返回值由 boolean 改为 `DamageResult`（两处调用方改读 `.killed`，已核验无外部调用依赖旧返回值；hurtEnemy 早退返回 undefined） |
| P2 | 敌方远程攻击缺少攻击者上下文 | `EnemyBullet` 新增可选 `stats`（**发射时快照**，发射者可能在命中前死亡/移除，不依赖存活引用）；射手发射时经 `enemyCombatStats(e)` 快照，命中时经 `opts.attackerStats` 进入管线；自爆改为引爆时快照；接触伤害保留 `src`（反伤需要引用且即时结算） |

parity 新增**第四条归一化**（D-02 先例）：弹丸 `stats` 从对照两侧摘出，并断言全部对照场景下快照为零值默认、`attack` 与伤害快照同源——证明该字段在 S2 数值零影响；S3 引入非零来源时须同步更新该断言。

新增测试 4 项（combat 8→12 项，damage 边界并入既有用例），全套 **100 项**。变异验证 3 组均被咬住后恢复：保底条件回退 `rawAmount>0`、`damagePlayer` 忽略 `opts.attackerStats`、`effectiveHpLoss` 不封顶。

| 项 | 结果 |
|---|---|
| `npm run typecheck` | 通过 |
| `npm test` | **100 项通过**（parity 20 项全绿，含新归一化） |
| `npm run build` | 通过 |
| `npm run test:browser` | **6 项通过**；性能本次采样 p50=0.3 / p95=0.5ms（160 敌+120 弹，处于历史波动区间 0.2–0.5 内，无阈值违规） |

### PR #2 三审修订：lethal/killed 语义分离与 CHANGELOG 补录（2026-10-24）

三审结论：原 3×P2 全部通过，新发现 1×P2（killed 在灼烧路径表示「尚未执行的死亡」）+ 2×P3，处理如下：

| 项 | 内容 |
|---|---|
| P2 | `DamageResult` 新增 `lethal`（HP ≤ 0 致死阈值）；`killed` 收紧为「死亡结算已执行」——hurtEnemy/damagePlayer 同步完成故两者同真，applyBurnDot 的死亡结算由 EnemySystem 随后按原顺序执行（粒子/击杀/随机数顺序不变），返回时恒为 false。玩家路径的 lethal 在不屈把 HP 拉回 1 **之前**捕获 |
| P3-1 | `effectiveHpLoss` 口径澄清：按伤害封顶的实际损失量，不是不屈/治疗等保命效果结算后的 HP 净变化（例：5 HP 受 20 伤触发不屈最终 HP=1，字段为 5 而非 4）；types 注释与规范 §3.5/§4 同步 |
| P3-2 | 按 Issue #55 约定补录 **v10** 更新日志（`CHANGELOG.md` + `src/game/data/changelog.ts`，主题「战斗基础：统一伤害管线（S1+S2）」，注明无对外数值变化）；PR 描述同步为最新验证数据 |

新增灼烧致死三态测试（阈值 lethal=true → killed=false/e.dead 不存在 → 调侧 killEnemy 完成 e.dead=true/kills=1）。变异验证：applyBurnDot 的 killed 改回 `e.hp <= 0` 被两个灼烧用例同时咬住。验证：typecheck 通过；`npm test` **101 项通过**（parity 20 项全绿）；build 通过。

### PR #2 四审：分支同步上游 main（2026-10-24）

四审代码 Approved，唯一阻塞为合并冲突（上游 #37 更名批次先行合入 main 并占用 v10 版本号）。按评审方案在功能分支内合并 `origin/main`（`de28b75`），未触碰主分支、无强推：

- 保留上游「急速施法」→「疾速扳机」更名（talents/game.test/parity 基线字符串替换）
- 保留本分支 parity 第四条归一化（弹丸 stats 摘出 + S2 零值断言），与基线字符串替换自动共存
- CHANGELOG 双文件：上游 v10「命名修订与流程批次」保留，本分支条目升为 **v11** 置顶，版本顺序唯一

整合后整体验证：typecheck 通过；`npm test` **101 项通过**（含更名后的 parity 20 项全绿）；build 通过；`npm run test:browser` **6 项通过**，性能采样 p50=0.3 / p95=0.5ms（与既有波动区间一致）。

## 上游交付：S1+S2 与上游 v11 平衡批次的整合（2026-10-24）

向上游 `reopen64534042-sudo/pixel-rogue` 提 PR 前，在交付分支 `feat/combat-foundation-s1-s2`（自 fork main `5fa2973` 切出）内合并 `upstream/main`（`2c504b6`，含 #58 更名与 **#60 天赋平衡大重做**）。#60 刻意按 Combat Foundation 精神新增了 `DamageMath.ts`（自述「S1 DamageSystem 的前身适配层」）与 `combatBalance.ts`（天赋平衡系数），与本分支 S1 的同名 `combatBalance.ts` 构成 add/add 冲突。语义整合决策：

| 冲突/接缝 | 整合方式 |
|---|---|
| combatBalance.ts add/add | 合并为单一 `CombatBalance` 接口：Combat Foundation 减伤基准（armorK/resistanceCap/toughCap）+ #38-#45 全部天赋系数；DamageMath 与 DamageSystem 各取所需 |
| 暴击觉醒（#41） | `playerCombatStats` 的 critMultiplier 改用 `DamageMath.critMultiplier`（含满层 +0.4），觉醒随攻击者快照进入管线，暴击乘法位置不变 |
| 灼热易伤（#42） | 条件天赋增伤折叠进 rawAmount（§3.1：D_raw 已含天赋效果）；该天赋属上游 NOT_IN_V8 排除集，乘法顺序变化不影响 parity |
| 冰冻/灼烧叠层/烈焰蔓延/护盾反震/陨星制导 | 上游编排逻辑原位保留（自动合并落入 S2 结构），反震/蔓延的 hurtEnemy 调用点补齐显式 type/form；反震经管线记账 `dmgBy.shock` |
| CHANGELOG v11 撞号 | 上游 v11「天赋平衡大重做」保留原位，本交付升为 **v12** 并补充整合说明条目 |
| 测试 | 「盾序」用例的敌人移出 80px 反震半径以隔离 #43 干扰；新增护盾反震管线整合用例（`dmgBy.shock` = 22 断言） |

验证：typecheck 通过；`npm test` **102 项全绿**（上游重做断言 + parity 20 项 + 我方计算器/管线 31 项共存）；build 通过；`test:browser` 6 项通过，性能 p50=0.2 / p95=0.4ms 回到基线。

## 基础设施 D-07：Combat Foundation S3-A 属性接线（2026-10-25）

**基线更新依据：docs/pixel-rogue-S3-implementation-brief.md（S3-A 为首个独立 PR）。** 基线为上游 `5d85c46`（PR #63 合并）。仅接线、默认数值中性、无正式平衡变更；S3-B 具体数值与来源待批准后另行实施。

### 交付

- 新增 `core/CombatStats.ts` 实体战斗属性适配层：`getPlayerCombatStats` / `getEnemyCombatStats` 作为快照唯一出入口，CombatSystem 结算与 EnemySystem 发射时快照共用；玩家暴击倍率统一经 `DamageMath.critMultiplier`（含 #41 满层觉醒）。
- `Player` / `Enemy` / `EnemyConfig` 增加可选战斗属性（defense / resistances / [tough 仅 Enemy] / globalDamageBonus / typeDamageBonus / formDamageBonus / skillDamageBonus），命名与 `CombatStatsSnapshot` 一致；**默认不写入** → 实体序列化形状与 v8/parity 逐字段对照一致（先例 Enemy.kx），parity 无需新增归一化即全绿。
- `spawnEnemy` 以条件展开拷贝 `EnemyConfig` 可选属性（存在才产生键）；S3-A 按任务书默认 DEF/RES **不随波次/精英缩放**，成长规则待 S3-B 审议。
- 明确不做（任务书边界）：不把 `p.damage` 转为 globalDamageBonus（天赋强化已含在 raw，禁止双加）；不新增天赋/卡池/难度/平衡值；不动 `TalentSystem.recompute()`（S4）。

### 验收对照（任务书 §5/§7）

| 场景 | 结果 |
|---|---|
| DEF=50、K=50 | 物理 100→50（真实 hurtEnemy，mock 非暴击） |
| RES.fire=0.2 | 火 100→80；物理/雷电不受 fire 抗性影响 |
| DEF=50 + tough=0.2 | 100→40（乘算） |
| true | 无视 DEF/RES/tough，仍走普通命中管线 |
| 增伤维度 | 100×1.2×1.3×1.4=218.4 → round 218；fire/ranged 独立乘区 100×1.25×1.2=150 |
| 玩家受击 | preserve-float：护甲减伤 100→50.0 浮点扣血 |
| 弹丸快照 | 发射后修改敌人增伤并标记死亡/移除，原弹丸仍按发射时快照结算（e.dmg×1.5） |
| DoT | 吃火抗且逐帧浮点（DPS40、火抗 25% → 60 帧共 30），无命中副作用 |
| Config 链路 | EnemyConfig 存在时拷贝、恢复后不产生键（形状不变断言） |
| 中性默认 | 实体无新字段时快照全 0/空；S2 零变化 |

### 变异验证

| 变异 | 实测 |
|---|---|
| `getPlayerCombatStats` 忽略 `p.defense` | FAIL「玩家护甲 preserve-float」用例 |
| `getEnemyCombatStats` 忽略 `resistances` | FAIL「火抗」+「DoT 火抗」两用例 |

### 验证结果

- `npm run typecheck` 通过。
- `npm test` **113 项通过**（原 102 + 新增 `tests/combat-stats.test.ts` 11 项），parity 20 项在无新增归一化的情况下直接通过。
- `npm run build` 通过；`npm run test:browser` **6 项通过**，性能采样 p50=0.3 / p95=0.5ms（历史波动区间内）。
- 格式说明：本仓库 Prettier 检查不含 docs/，历史文档保持原格式，本节不做整文件重排。

### PR #3 评审修订（2026-10-25）

评审结论 1×P2 + 1×P3，本轮修复：

| 级别 | 问题 | 修复 |
|---|---|---|
| P2 | 快照嵌套映射（resistances/三个增伤乘区/skill）与实体共享引用：发射后**原地修改**敌人 `typeDamageBonus.physical` 会渗入已飞行弹丸的发射时快照，破坏 S2 契约 | `getPlayerCombatStats`/`getEnemyCombatStats` 对嵌套映射一律**复制一层**（`{ ...map }`）；新增适配器隔离直测 + 扩展弹丸用例（发射后原地改映射 `0.2→0.8`，命中仍按 0.2 结算 `e.dmg×1.5×1.2`） |
| P3 | 任务书顶部状态仍写「尚未修改仓库代码」 | 更新为「S3-A 已实施；S3-B 数值待批准；S3-C 尚未实施」 |

变异验证：`typeDamageBonus` 深拷贝回退浅引用 → 弹丸快照用例失败（其余含隔离直测全过）。修复后 `npm test` **114 项通过**（11→12 项，+适配器隔离直测）。

S3-B 前待明确（评审提出，不阻塞本 PR）：`hurtEnemy()` 尚未传递 `skillId`（skillDamageBonus 已入快照但无调用方）；玩家弹丸（Bullet）新增增伤属性的读取时机（发射时 vs 命中时）需与敌方弹丸的发射时快照原则对齐设计。

## 平衡变更 D-08：Combat Foundation S3-B 方案甲 + S3-C UI（2026-10-25）

**基线更新依据：docs/pixel-rogue-S3-implementation-brief.md §3-B/§3-C + 用户批准「方案甲」（三选一怪物分布方案，含玩家 DEF/增伤来源与两条接口规则定稿）。** 基线为上游 `9d26087`（#59 贴图管线）合并入含 S3-A 的 fork main。这是需求变更驱动的基线升级，不是为通过测试修改验收目标。

### 怪物克制分布（方案甲）

| 怪物 | 属性 | 数值效果（K=50） |
|---|---|---|
| brute（含波 4 首敌精英坦克） | DEF 30 | 物理弹 11→7（-37.5%）；火焰/雷电/真实全额 |
| shooter（波 6 起） | 雷抗 30% | 连锁跳伤 ×0.7 |
| bomber（波 8 起） | 火抗 40% | 灼烧/陨星/爆炸 ×0.6；本体 HP 最低保持易杀 |
| slime / bat | 全中性 | 前 3 波教学期零影响 |
| 精英 | 不额外加成 | 避免与 ×8 HP 双重叠税 |

### 玩家来源与新卡（40 张天赋）

- **磐石**（🪨 防御 t1 max3）：护甲 +15/级——玩家 DEF 来源；与铁布衫（tough 通用减伤）乘算区分
- **元素亲和**（🔮 技能 t2 max3）：火焰/雷电伤害 +10%/级——typeDamageBonus 首个正式来源；不进 DMG_POOL（试点不扩散伤害保底池）
- **接口定稿**：玩家 Bullet 发射时 `stats` 快照（与 EnemyBullet 对称，`HitOptions.attackerStats` 通道，飞行中不回溯）；skillDamageBonus 推迟至近战链（#7-#10）随 skillId 启用；DoT 维持「施加时定值 + 每帧读快照」

### 实现要点

- **recompute 清键**：`TalentSystem.recompute()` 在 `Object.assign(statBase())` 后**删除六个可选战斗属性键**再重放——增量型天赋 f 才能重放安全（首版绝对值写法在逐 pick 重放下会算错，已改增量 + 变异验证）。此为 S3-B 必需的最小 TalentSystem 触碰，非 S4 重构
- S3-C UI（buildStats）：「全局伤害」文案改「基础攻击」（只改文案不动 p.damage）；魔弹读 `DamageMath.boltDamage`、暴伤读有效值 `critMultiplier(p)`（含觉醒）；新增护甲（K/(K+DEF) 同公式百分比）/火焰/雷电抗性/全局/火/雷/近战/远程增伤行（0 值按既有惯例显示 —）

### parity 基线更新

- 新卡入 `NOT_IN_V8`（v8 注入 req 恒假桩，卡池组成对齐）；严格对照波次 [1,4,5,8]→[1,3]、全天赋 [4,8]→[3]——**波 4 首敌是精英坦克**，带甲后伤害/击杀时序分叉无法摘键归一化（#47/#48 先例）；玩家弹丸 stats 归一化（摘出 + 攻击乘区中性断言，attack≥dmg 容 0.85 衰减）
- 新增 D-08 四项显式断言：怪物三属性公式（含 slime/bat 中性与 true 穿透）、磐石含 recompute 不叠加与玩家受击浮点、元素亲和属性隔离、玩家弹丸快照不回溯

### 变异验证（3 组均被咬住后恢复）

| 变异 | 实测 |
|---|---|
| 移除 brute DEF 30 | FAIL D-08 怪物属性用例 |
| recompute 去掉可选键清除 | FAIL D-08 磐石用例（60≠45） |
| 弹丸命中忽略发射时快照 | FAIL D-08 快照用例 |

### 验证结果

- `npm run typecheck` 通过；`npm test` **115 项通过**（parity 21 项：严格波 1/3 逐字段 + D-01~D-08）；`npm run build` 通过
- `npm run test:browser` **6 项通过**；性能 p50=0.3 / p95=0.5ms（波动区间内）；生产自然首波+真实升级选择通过（含 UI 改动的实机验证）
- game.test 天赋数 38→40（两处计数 + 唯一名计数）

### 回退方法

单点回退：清空 `enemies.ts` 三项新键与两张新卡即回 S3-A 中性；UI 行为无依赖。

### PR #4 评审修订（2026-10-25）

评审 1×P1 + 2×P2 + 2×P3，全部处理；其中高波次 parity 恢复引出一次深度排障，产出三项基线加固与一个未决项。

| 级别 | 问题 | 修复 |
|---|---|---|
| P1 | 焦土燃烧（#45）仍直改 `e.hp`，绕过火抗与「元素亲和」 | 抽出共用 `applyFireDot`（fire/dot/preserve-float，无命中副作用），新增导出 `applyBurnGroundDot(e, dps, dt)`；AttackSystem 调用点替换，持续时长/逐帧/死亡掉落顺序原样保留；组合用例：bomber 火抗 40% → 6 DPS、火增伤 +30% → 13、组合 7.8、中性敌人与旧直算逐位一致 + 真实地带集成 |
| P2 | 弹丸暴击率读命中时、倍率读发射时（两时间点混用） | `hurtEnemy` 掷骰改读 `opts.attackerStats?.critChance ?? this.player.crit`——不新增随机调用、不改顺序；用例：发射时 100%→命中前改 0% 仍暴击（22）、反向不暴击（11） |
| P2 | 高波次确定性回归覆盖下降 | 测试内临时中性化（try/finally 恢复，不改生产配置）恢复波 4/5 基础与波 4/8 全天赋严格对照；波 8 基础场景见下方未决项 |
| P3 | UI 抗性未按 75% 上限裁剪、缺物理增伤行 | 显示值 `min(res, resistanceCap)`；补「⚔️ 物理增伤」行 |
| P3 | recompute 重复注释 | 清理 |

**深度排障与三项基线加固**（波 4/5/8 中性化恢复时发现，均为先于本 PR 的既有隐患）：

1. **v8 卡池多出不屈**：我方自 v11 将不屈 `hidden`，v8 原文无该字段，canOffer 补丁拦不住 → v8 可投放 35 张 vs 我方 34。已给基线补 `hidden = 1`。
2. **卡池顺序不一致**：#55 四张桩在 v8 尾部、我方同名真卡在数组中部；新卡把档位池长度 N→N+1 后随机索引平移踩中错位（tick 879 升级抽卡实测：v8 致命一击 / 我方磨刃）。已按我方数组**整体镜像重排** v8 UPGRADES，并把新卡桩改为无 req、展示字段一致的结构克隆（req 恒假会因池大小 38≠40 改变保底触发时机而分叉随机流）。
3. **精英经验基线未对齐公式**（#17 已批准）：两侧精英宝石 53 vs 25 xp，吸收后等级分叉→抽卡权重不同。已按陨星 ×3 先例把 v8 基线对齐到 `25+(waveN-1)×ELITE_XP_STEP`；`expectEliteXp` 断言与归一化保持不变。

**未决项（波 8 基础场景）**：完成上述三项加固后，波 4/5 基础与波 4/8 全天赋均恢复严格对照通过；波 8 基础场景仍在 tick 879 的升级抽卡处分叉（已逐一核对两侧卡池名称/顺序/可投放/档位/DMG_POOL、tierWeights、等级/经验、rollPicks 逐行代码均一致），随后级联为终局 HP ±8.1。作为独立未决项记录，不在本 PR 强行放行；生产数值行为不受影响（波 8 数值本就按方案甲分叉）。

变异验证：焦土绕过管线、暴击率回退当前值，均被新用例咬住。修复后 `npm test` **121 项通过**（parity 22 项：波 1/3 严格 + 中性化恢复波 4/5 与全天赋 4/8 + D-01~D-08）；browser 6/6。

## D-09 Issue #5：波 8 parity 分叉根因——基线补丁静默失配（2026-10-24）

PR #4 遗留未决项（上方「未决项（波 8 基础场景）」）的专项排查结论，分支 `fix/issue-5-wave8-parity`。

**归属：测试基线缺陷，非生产回归**——生产行为零改动，仅修 `tests/parity.test.ts`。

### 排障方法（三轮对拍，插桩均保持种子流原样）

1. **全量有序轨迹对拍**：单例委托包装两侧 `Math.random`（只记录 (tick, value)，不重置、不新建种子），逐索引 diff。结果：两侧 1800 tick 各消耗恰好 1005 次、**值序列逐位相同**——但同一批值被取走的 **tick 位置不同**，首个逐 tick 计数差在 t=878。
2. **调用点栈对比**（v8 帧用「行号→行首偏移」映射回源码片段）：t=878 我方升级抽卡消耗 9 次、v8 消耗 6 次；多出的 3 次是伤害保底（pickTier + 池内选卡 + 替换位各 1）。
3. **rollPicks 忠实克隆取证**（克隆的随机消费点与原版逐点一致，仅加日志）：avail 全表 34=34 diff 仅一处——`烈焰印记#2（v8） vs 烈焰印记#1（我方）`。

### 根因

`original()` 的烈焰印记重做补丁（Issue #42，t2→1、max3→1）模式串写成空格风格（`n: "烈焰印记"`），而 v8 原文是紧凑风格（`n:'烈焰印记'`）——`String.replace` 无匹配时**静默返回原文**，该补丁自写入起从未生效。级联路径：

- 两侧档位池 t1/t2 组成长期不对称（v8 的 t1 少烈焰印记、t2 多烈焰印记）；
- 种子 908 在 t=878 升级抽卡第 2 抽踩中档内索引交叉点：同一随机值 `floor(0.258×11)=2`（v8 抽中致命一击，含伤害卡 → 保底不触发、消耗 6 次）vs `floor(0.258×12)=3`（我方抽中守护之刃，无伤害卡 → 保底触发、消耗 9 次）；
- 此后整条随机流错位级联，终局 HP ±8.1。

波 1/3/4/5 通过纯属种子未踩中交叉点；全天赋场景烈焰印记已满级不可投放，天然免疫。另：PR #4 排障中「随机消耗计数一致」的结论实际只核对了总次数、未核对 tick 内归位——本缺陷正藏在该盲区。

### 修复（仅 tests/parity.test.ts）

1. 烈焰印记补丁模式串逐字对照 v8 原文（紧凑风格），真正生效；
2. 全部补丁改为 `patches` 数组遍历，**失配即抛错**并指名片段——静默失效从此不可能；
3. 删除 Issue #48「精英宝箱 special 标记」死补丁——upstream-v8 快照（27565b4）没有宝箱代码，该补丁从未命中过任何文本；
4. 波 8 基础场景恢复中性化严格对照（`it.each([4, 5, 8])`）。

### 验证

- `npm test` **122 项通过**（parity 26 项 = 波次模拟 8：波 1/3 严格 + 中性化 4/5/8 + 全天赋 3 严格 + 全天赋中性化 4/8；规则断言 18。上文 D-08 记录的「parity 22 项」为当时计数笔误，实测 25）；
- `npm run typecheck` 通过；生产行为与产物零改动（无 src/ 变更），无需 browser/构建复验；
- 变异验证：把模式串改回空格风格 → 5 个调用 original() 的中性化用例立即失败，报错指名失配片段，守卫按设计工作。

## D-10 S3 上游集成与交付（2026-10-25）

S3-A/B/C 全部合入 fork main（PR #3/#4/#6）后，按「同步上游 → 集成验证 → 审查差异 → 上游 PR」流程向上游交付完整 Combat Foundation S3。

### 集成方式

- 分支 `feat/combat-foundation-s3` 基于 **upstream/main（ebb2a92，含 #73 波末统一执行/置换重做、#49 魔刃回旋反弹、#46 面板排序、#3/#51 精灵重绘）**，merge fork main（f1610e6，S3 全栈）。合并方向：上游新功能全部保留，S3 改动在其上叠加。
- 5 个文件冲突，解法：
  - `CHANGELOG.md` / `changelog.ts`：fork 的 S3 条目 v13/v14 与上游新占的 v13/v14 冲突，**fork 条目重编号 v15（S3-A）/ v16（S3-B/C）置顶**，上游 v14（置换）/v13（反弹）/v12（UI 精修）原样保留。上游自身存在重复 v12（UI 精修 vs S1+S2），非本批引入，未擅自改动。
  - `talents.ts`：两侧均在数组尾部追加新卡——并集保留（魔刃回旋 + 磐石/元素亲和，共 41 张）。
  - `game.test.ts`：天赋计数 41（两处）。
  - `parity.test.ts`：NOT_IN_V8 并集 7 项；上游 #67 的 3 个新基线补丁并入 `patches` 数组（同样受失配即抛错守卫保护）；镜像重排/桩注入/不屈 hidden 逻辑不变（自动合并区已核对：resetGame 注入含 bladeReflect/reflect，魔刃回旋桩随上游就位）。

### 自动合并热点语义复核

- `ProjectileSystem`：上游 #49 反弹块完整保留；反弹命中走 `hurtEnemy` 无 attackerStats → 回退读玩家实时 crit（飞刃反弹由存活玩家发射，与近战/环绕同理），我方弹丸命中通道 `attackerStats: b.stats` 原样。
- `TalentSystem`：上游 #67/#71 宝箱与波末流程完整保留；我方 recompute 清键块原样。
- `GameCore`：上游 drainBoxPicks/dmgBy.reflect 完整；parity 基线 resetGame 注入 `reflect: 0` 使 dmgBy 对照两侧同构。
- `AGENTS.md`：架构描述 1 行更新（core/ 行补 CombatStats 与 S3-A/B 状态）——本节初稿「与上游零差异」为复核 grep 过滤误判（变更行以 `- src` 开头被过滤器吞掉），已纠正。

### 上游 PR 评审修订（跨平台 P1 + 计数 P3）

上游评审发现 1 项 P1：parity 基线 `enterRest()` 补丁模式含 `\r\n`，而 `legacy/upstream-v8.html` 的 git blob 为 LF——模式只在 Windows autocrlf 检出下命中，LF 检出（Linux/CI）失配。该模式沿自上游 #67 原写法，集成时并入 patches 数组后由失配守卫显形。处置：

- **复现**：`git -c core.autocrlf=false` 独立检出（工作区 0 个 CR 行）跑 parity，9 个调用 `original()` 的用例全部失败，守卫报错指名片段；
- **修复**：`readFileSync(...)` 后统一 `replace(/\r\n/g, "\n")` 归一化，`enterRest` 模式与替换串全部改用 `\n`（注释警告不得再写 `\r\n`）——检出环境不再影响行为；
- **双向验证**：主工作区（CRLF 检出）与 LF 独立检出均全量 `npm test` 123/123；
- **P3**：AGENTS.md 天赋计数 34→41（项目定位/data 结构/验收三处，标注含暂隐藏的不屈）。上游重复 v12 维持披露、不扩大本批范围。

### 验证

- `npm test` **123 项通过**（parity 26 项不变：波 1/3 严格 + 中性化 4/5/8 + 全天赋 3 严格 + 全天赋中性化 4/8 + D-01~D-08——上游 #67 波末流程在两侧一致实现，严格对照全绿）
- `npm run typecheck`、`npm run build` 通过；`npm run test:browser` 见交付 PR 描述
- 对照 upstream/main 最终 delta：19 文件 +1364/−177，全部为 S3 基建 + 新卡/克制数值 + 配套测试与文档，无上游功能改动

## D-11 Combat Foundation S4-A：纯属性模型 StatModel（2026-10-25）

依据 `docs/pixel-rogue-S4-implementation-brief.md` §4-S4-A/§6，分支 `feat/combat-foundation-s4a`（基线 cd9c8b6，#76 合并后上游无其他新提交）。

### 交付范围（不接入运行时，零行为变化）

- **新模块 `src/game/core/StatModel.ts`**：`effective = (base + Σflat) × (1 + Σpercent) × Πfinal`。同 percent 区加算（Σ 先求和再乘一次，浮点逐位契约 `0.1+0.1 → ×1.2` 而非 ×1.21）；final 连乘（按修饰符数组顺序、IEEE754 左结合）；`final.value` 是倍率本身（1.1），不是「+10%」。
- **契约冻结**：全部数值有限（NaN/±Infinity 抛 TypeError）；base ≥ 0 缺省视为 0；flat 允许任意有限值（负增益合法、模型不裁剪——夹紧属接入点决策）；percent 每项 > -1、区因子允许为 0；final 每项 > 0；sourceId 非空字符串、同一来源可多条；结果只含出现过的属性（Partial 语义）；纯函数不改写输入。
- **历史卡兼容原则（任务书 §3）**：逐次乘算卡（磨刃/狂怒等 `p.damage *= 1.1^n`）必须映射为 n 条 final，测试钉死 `11×1.1² ≠ 13.2`，禁止折叠成 percent +0.2n。
- **来源追踪**：`modifierSources(sheet, stat)` 按首次出现顺序去重返回 sourceId，供 S4-B shadow 对照。
- **S4-B 桥接设计（仅纯投影，未替换任何 CombatStats.ts 调用）**：`resolveCombatStats(sheet)` 投影 CombatStatsSnapshot 标量子集（attack/defense/critChance/critMultiplier/tough），缺失属性省略键；resistances 与三类增伤映射的接入方式是 S4-B 决策项。

### 未触碰（S4-A 边界）

Player/Enemy、41 张天赋、敌人配置、波次/RNG、DamageSystem、CombatStats.ts、UI——零运行时改动；parity 测试内容原样（26 项全绿）。

### 验证

- 新增 `tests/stat-model.test.ts` **21 项**：任务书必测项全覆盖（180 通式 / ×1.5 加算 / ×1.21 连乘 / 零值 / 合法负 percent 与区因子 0 / NaN·Infinity / 非法 final / 缺省属性 / 输入不变性·冻结输入 / 来源追踪 / 桥接投影）
- `npm test` **144 项通过**（原 123 + 21，parity 26 原样）；`npm run build`（含 typecheck）通过
- 变异验证 2 组均被咬住：percent 区改逐项乘算（3 红，含两个加算契约钉子）、移除 final > 0 校验（1 红）
- 浏览器测试未运行：无场景/UI 改动，符合任务书 §4-S4-A「不因新增计算模块要求浏览器测试」

### S4-B 待决策项（提交审查时列出）

1. shadow 对照首批字段（建议 DEF/抗性/增伤来源）与对照场景集。
2. resistances 与 global/type/form/skillDamageBonus 映射进入白名单的方式（独立 StatId 还是结构化来源组）。
3. 模型负值/上限夹紧的接入点选择（须与现有实际生效点一致，不提前统一）。
4. sidecar（若需）生命周期与清理策略；首选无持久缓存的纯函数派生。

### 上游 PR #77 评审修订（P2 溢出守卫 + P3 负区因子政策）

- **P2**：输入逐项有限不代表聚合结果有限——flat/percent 求和、base+flat、各阶段乘积都可能在全合法输入下溢出为 ±Infinity（NaN 同样被守卫覆盖）。修复：`resolveStats` 在 flat 聚合/flat 阶段/percent 聚合/percent 阶段/final 阶段五处校验结果有限性，溢出抛 **RangeError**（区别于输入非法的 TypeError），不静默返回非有限数。新增 4 组回归：两 flat 求和溢出、base+flat 溢出（评审原始样例 MAX_VALUE+MAX_VALUE）、两 percent 求和溢出、base×final 乘积溢出。变异验证：移除溢出守卫 → 4 用例红；还原 26/26。
- **P3（不改变行为）**：多项合法负 percent 合计可 < -1，产生负区因子。任务书仅明确允许因子为 0。按评审建议本批**不裁剪**，在契约 JSDoc 明示「负区因子当前允许，政策须在 S4-B 正式读取前明确」，并新增钉住现状的回归（-0.6×2 → 负因子，与实现同序表达式逐位相等），防止后续被静默更改。
- 测试 26 项（+5）；`npm test` **149/149**（parity 26 原样）；build/typecheck 通过；架构与运行时边界零改动。

## D-12 Issue #78：图鉴体系 M1–M2——天赋图鉴与跨局收集进度（2026-10-25）

### 交付范围

- `src/game/codex/codexData.ts`：条目模型与 id 规则；条目**由 `UPGRADES` 派生**，不手工罗列
- `src/game/codex/CodexStore.ts`：独立存档 `pixelrogue_codex` v1，读写与损坏保护
- `src/game/codex/CodexSystem.ts`：`syncTalents` / `backfill` / `progress`，只增不减、幂等
- `src/ui/CodexUI.ts` + `src/styles/codex.css`：只读面板（分类筛选、剪影、详情、完成度）
- `index.html`：追加 `#ov-codex` 与开始界面「图鉴」按钮（纯追加，未移动既有节点）
- 接线共 11 行：`GameCore` 旁路字段 + 构造注入 + 局末同步；`WaveSystem.enterRest()` 首行同步

### 架构决策

1. **旁路观测**：图鉴状态不进 `Player`，独立 `core.codex`。`tests/parity.test.ts` 的快照是 19 字段显式白名单且不含 codex，故该对照无需改动，也没有新增排除项。
2. **主键用名字而非下标**：实测在 `UPGRADES` 索引 5 处插入一条新卡，下标键错位 36/41，名字键 41/41 命中。名字键失效是「单条丢失且加 alias 可修」，下标键失效是「全局静默错位且不可反推」。
3. **条目派生**：新增天赋自动进入图鉴，不存在条目漏配；因此不设「条目 ↔ 天赋」对照表，只保留名字唯一性与基线数量断言。
4. **批量同步**：波末（`enterRest` 首行，位于两个早退之前）与局末各同步一次，不侵入 `TalentSystem` / `EnemySystem`。代价是解锁非实时，可接受。
5. **补档**：打开图鉴时只读 `records.up` 回填，`first` 记 0 表示来源为战绩；只补不覆盖。
6. **异常隔离**：`CodexStore.update` 吞掉 `mutate` 异常并记 `lastError`——图鉴运行在主循环调用链上，不允许因自身异常打断 `updateWave`。

### 未触碰

`DamageMath` / `CombatStats` / `StatModel` / `DamageSystem` / `CombatSystem` / `combatBalance` / `talents.ts` 数值 / `enemies.ts` 数值 / `tests/parity.test.ts` / `src/styles/game.css`（改为新增 `codex.css` 并在 `main.ts` 引入）。

### 验证

- `npm run typecheck` 0 错误；`npm test` **169/169**（原 149 + 新增 20，parity 26 原样）
- `tests/codex.test.ts` 20 项：条目派生/隐藏过滤/名字唯一/改名解析、解锁幂等与 max 取大、置换后保留、损坏不覆盖、回调抛错中止、键名固定、补档只补不覆盖、进度分区合计、以及 **GameCore 接线真实性**（局末写入、波末写入、早退路径已同步、重开不清空）
- `npm run build` 通过；Playwright **6/6**（含 production 产物完整流程）
- 浏览器实测四态：空档 `0/40`、注入后 `4/40`、详情文案、分类计数（攻击 2/9 · 增幅 1/7 · 技能 1/15 · 防御 0/9）；隐藏天赋在整个面板出现 **0 次**；仅存战绩时打开图鉴得 `2/40`（补档生效）

### 遗留

- M3（#81）：完备暂停界面。届时需引入 `pauseSub` 子面板概念，P/Esc 先关子面板再退暂停；**重新开始不写战绩**（本文件已登记该语义：战绩 = 阵亡记录）。
- M4（#82）：敌人图鉴。需 `assetRegistry.SpriteEntry` 增加图片来源，并重新确认是否接受 `CombatSystem.killEnemy` 的一行接缝。

## D-13 Issue #81：完备暂停界面——图鉴入口与重新开始确认（2026-10-25）

### 交付范围

- `index.html`：`#ov-pause` 追加进度行、按钮组与版本号（纯追加）
- `GameUI`：`renderPause` / `armRestart` / `disarmRestart` / `dismissOverlay` / `hasOverlay` + 按钮绑定
- `GameScene`：P / Esc 键位路由改为「先关覆盖面板，再切暂停」
- `src/styles/game.css` 末尾追加暂停面板样式（`game.css` 本就是 overlay 与按钮样式的归属处）

### 关键决策

1. **不加 `pauseSub` 状态**：issue 原计划给 `GameCore` 增加暂停子面板字段，实际实现中删除。图鉴是独立 overlay，关闭时下层面板天然还在，只需 UI 层的「覆盖层优先」路由即可，**核心状态机零改动**。
2. **重新开始不写战绩**：复用既有 `startGame()`；`storage.append` 仍只在 `state = "over"` 执行。战绩语义 = 阵亡记录，中途放弃不计。
3. **二次确认原地变文案**而非新弹窗：首次点击只改按钮文案与样式，4 秒后自动复原；每次打开暂停面板也会复原，避免"一进来就是确认态"。
4. **设置按钮保持 `disabled` 且不绑 onclick**：杜绝死按钮（#69 的教训）。

### 实现中发现的两个真实冲突

- **z-index**：`#ov-pause` 为 60（Issue #68 置顶所有 UI），图鉴原设 20 会被完全盖住。已改为 70，并用 `elementFromPoint` 实测中心点最上层确为图鉴。
- **`:hover` 压过 `:disabled`**：`.btn:hover` 设青底黑字且特异性低于 `.btn:disabled` 之外无背景覆盖，disabled 按钮悬停时仍显示为可点态。已在 `.pause-actions` 范围内用 `:disabled:hover` 钉死（虚线框 + 灰字），并保留全局既有行为不动。

### 验证

- `typecheck` 0 错误；`npm test` **169/169**（无新增单测：本层为 DOM 交互，vitest 无 DOM 环境）
- Playwright **6/6**（含 production 完整流程）。注意：`test-results/` 累积 728 个 artifacts 后，Playwright 启动清空会触发本机安全删除守卫，须用 `--output=output/pw-run` 指向新目录绕过，属环境限制而非代码问题
- 浏览器实测：暂停摘要与版本号正确、设置 `disabled` 且 idle/hover 计算样式均为 `rgb(20,26,51)`/虚线、图鉴层级 70>60、Esc 关图鉴后仍在暂停、P 才恢复、重开二次确认生效且 `records` 长度不变（0→0）、重开后面板再次暂停时按钮已复原

### 遗留

- M4（#82）同上；另：全局 `.btn:disabled:hover` 仍是既有缺陷（其他面板的禁用按钮悬停也会变青底），本次只在暂停面板内修正。

## D-14 Issue #82：敌人图鉴——分类、贴图与累计击杀（2026-10-25）

### 交付范围

- `codexData.ts`：`ENEMY_ENTRIES` 显式登记 6 条（5 基础怪 + `brute_elite`），条目新增 `spr` 逻辑贴图名
- `assetRegistry.ts`：`SpriteEntry` 增加 `src?`；新增 `spriteImageSrc(key)`（覆盖 PNG 优先，否则导出发程序化 Canvas，带缓存）
- `CombatSystem.killEnemy`：**新增 4 行**（含注释），写入 `killLog[type]` / `killLog[type_elite]`
- `GameCore`：新增 `killLog` 普通字段（`resetGame` 清空）；局末消费
- `WaveSystem.enterRest`：波末消费（首行，早退之前）
- `CodexSystem`：`syncEnemies` / `killCount`；`progress()` 增加 `enemies` 分区；`isUnlocked` 兼容敌人
- `CodexUI` + `codex.css`：敌人分类 tab、贴图渲染、灰阶剪影、击杀数展示

### 关键决策

1. **击杀接缝做成普通计数，不引入图鉴依赖**：`killEnemy` 只写 `this.killLog`，完全不知道 `CodexSystem` 存在。图鉴以后重构、甚至移除，战斗侧无需改动。
2. **消费成功才清空**：`syncEnemies` 返回 false（存储损坏）时调用方保留 `killLog`，下次重试，避免丢数据。
3. **敌人条目必须显式登记**：精英是 `spawnEnemy(type, true)` 的强化标记而非独立配置，无法像天赋那样从 `UPGRADES` 派生。因此加了一条「`ETYPES` 每个键都必须有条目」的测试作为漏配兜底。
4. **贴图走单一入口**：图鉴只存逻辑贴图名，经 `spriteImageSrc()` 取图。改 manifest 或改程序化像素矩阵，图鉴零改动跟随（本轮已用截图验证贴图正常渲染）。

### 用户要求的三项风险备案

| 风险 | 备案方式 |
|---|---|
| 合并冲突（协作者领地） | 改动压缩到 4 行并置于函数最前；PR 前 rebase；`CombatSystem` 在本轮之外零改动 |
| 技术风险（影响战斗） | `parity` 26 项原样通过；新增「击杀只登记计数、不改敌人 HP/掉落」与「重复击杀不重复计数」两条测试 |
| 误删风险（未来重构） | 函数内注释写明用途、豁免原因、删除后果；`tests/codex.test.ts` 的接缝用例会在删除后变红 |

### 实现中发现并修复的问题

1. **敌人单行时卡片被拉伸到整屏**：Grid 默认 `align-content` 会拉伸行；改为 `align-content: start` 并去掉 `flex: 1`，高度随内容、超出 `max-height` 才滚动。
2. **卡片下方出现内容残影**（两次排查）：
   - 第一次怀疑半透明背景：`#ov-codex` 由 `rgba(...,0.97)` 改纯色 `#0a0b14`，消除下层透出；
   - 真正根因是**我给 `.cx-cell` 加的 `contain: paint`**：布局变化（详情条出现）时留下旧绘制层，移除后彻底消失。
   - 结论：`contain: paint` 在 `overflow-y: auto` + 频繁 `innerHTML` 重渲染的面板里不要用。
3. **脚本化正则替换静默失败**：一次多行 `replace` 未命中但 `tsc` 无感知（函数名改成功、分支没加），已改为编辑器精确替换。教训：类型检查不能替代语义验证，批量替换后必须看结果。

### 验证

- `typecheck` 0 错误；`npm test` **181/181**（原 169 + 12 项敌人测试，**parity 26 项原样**）
- Playwright **6/6**（含 production 全流程）
- 浏览器实测：进度 `天赋 1/40 ｜ 敌人 3/6`；tab 合计 `4/46`；敌人 6 格中 3 解锁、**6 张贴图全部渲染**；未解锁显示 `未击杀`；详情显示「累计击杀 37」；「全部」视图 46 条无残影
- 基线更新留痕：`resolveEntryId("e:slime")` 由「解析为空」改为「解析为条目」，注释标注 Issue #82 依据

### 已知限制

- 未登记的新敌人类型击杀会被跳过（不写孤儿条目）——由条目一致性测试兜底，不静默累积
- `killLog` 为局内累计、消费后清空；若一局中途崩溃，本波未同步的击杀会丢失（与战绩同语义）
