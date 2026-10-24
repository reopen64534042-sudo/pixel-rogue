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
