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

## D-15 Issue #85：环绕飞刃导致全屏贴图旋转与主角偏移（2026-10-25）

### 现象

解锁「环绕飞刃」（`player.orbit > 0`）后，场上**其他贴图**开始旋转，**主角偏离视觉中心**约半个贴图尺寸。

### 根因

`src/game/rendering/PixelPainter.ts` 是 Phaser `Image` 的**跨帧对象池**：`begin()` 每帧把 `ii` 归零，
同一批 `Image` 对象被不同绘制调用按顺序复用。

- `spriteRot()`（飞刃专用，`draw.ts:304`）设置 `origin(0.5)` 与 `rotation(angle)`
- `sprite()`（玩家、敌人、子弹、宝石、血包、宝箱等**全部普通贴图**）只重置
  `position` / `alpha` / `depth` / `scale`，**不重置 `origin` 与 `rotation`**

于是飞刃用过的池槽位在后续帧被普通贴图复用时：

- 带着上一帧的 `rotation` 绘制 → 表现为「所有贴图都在转」
- `origin` 仍为中心点，但传入坐标是按左上角算的 → 整体偏移半个贴图宽高 → 「主角偏离中心」

玩家槽位会漂移并撞上飞刃槽位，是因为绘制顺序中玩家之前的宝石 / 血包 / 粒子数量每帧都在变。

### 修复

`sprite()` 中显式 `setOrigin(0).setRotation(0)`，并在代码注释里写明「对象池跨帧复用必须复位」。

### 验证（可量化，通过 e2e 调试接口直接读池状态）

`window.__PIXEL_ROGUE__.scene.painter.images`（`MODE=e2e` 下可用）：

| 状态 | 可见精灵 | 带旋转 | 居中原点 | **非飞刃却被旋转** |
|---|---|---|---|---|
| `orbit=0`（基线） | 2 | 0 | 0 | 0 |
| `orbit=2` 修复前 | 5 | **3** | 3 | **1** |
| `orbit=2` 修复后 | 5 | **2** | 2 | **0** |

修复后带旋转的精灵数**严格等于飞刃数量**，非飞刃残留归零。

### 为什么没有新增回归测试

`PixelPainter` 直接操作 Phaser `GameObject`，vitest 无 Phaser 环境；加 e2e 需改
`playwright.config.ts` 的 `testMatch` 或既有 spec，冲突面大于收益。改为：
① `sprite()` 内写明复位原因与后果；② 本节留下可复现的量化验证方法，便于日后回归。

### 影响范围

纯表现层，零模拟改动：`parity` 26 项原样通过，181 项测试全绿。

## D-16 Issue #87：精英宝箱收益下调——单箱 1 点 + 每波上限 2 点（2026-10-25）

### 背景（用户已批准的平衡变更）

特殊宝箱原为固定 2 点，而精英数量随波次增长（波 4–11 每波 1 只、12–19 每波 2 只、20+ 每波 3 只）。
后期每波最多 6 点来自精英宝箱，加上普通宝箱上限 2 点，合计最多 **8 次「已学天赋 +1 级」**，
而正常升级仅 1–2 次/波，玩家反馈中后期数值膨胀明显。

### 变更

| 项 | 变更前 | 变更后 |
|---|---|---|
| 特殊宝箱单箱价值 | 2 点 | **1 点**（`ELITE_BOX_GAIN`） |
| 每波精英宝箱点数 | 无上限 | **上限 2 点**（`ELITE_BOX_POINT_CAP`） |
| 超出上限部分 | — | 转为 8 点经验 + 1 个血包（沿用 #71 兜底口径） |
| 普通宝箱 | 1 点，每波上限 2 个 | **不变**，与精英上限独立计算 |
| 面板文案 | 「剩余 N 个」 | 「剩余 N 次强化」 |

效果：

| 波次段 | 精英数 | 变更前 | 变更后 |
|---|---|---|---|
| 4–11 | 1 | 2 | 1 |
| 12–19 | 2 | 4 | 2 |
| 20+ | 3 | 6 | **2**（第 3 只精英的宝箱转经验 + 血包） |

### 实现

- `constants.ts`：新增 `ELITE_BOX_GAIN = 1`、`ELITE_BOX_POINT_CAP = 2`
- `GameCore`：新增 `eliteBoxPointsThisWave`，`resetGame` 与 `startNextWave` 均清零
- `ProgressionSystem`：拾取分支拆成普通 / 精英两条；精英按
  `room = ELITE_BOX_POINT_CAP - eliteBoxPointsThisWave`、`gain = min(ELITE_BOX_GAIN, room)` 计点
- `GameUI`：开箱面板标题改「剩余 N 次强化」；拾取浮动文字改为按实际收益显示

### 验收基线更新（显式断言新公式，不删除对照）

`tests/parity.test.ts` 的 **D-04** 原断言 `boxPicks === before + 2` 随平衡变更失效，
改为 `before + ELITE_BOX_GAIN`，保留「特殊宝箱标记」等其余断言，并在测试内注释
「基线更新依据：Issue #87（用户已批准的平衡变更）」。

**其余 25 项 parity 对照（与 v8 逐字段相等）完全未动。**

### 新增测试（`tests/chest.test.ts`，5 项）

单精英 1 点 / 双精英达上限 / 第三箱转经验 + 血包 / 普通宝箱不受精英上限影响 / 换波重置上限。

### 验证

- `typecheck` 0 错误；`npm test` **186/186**（原 181 + 5）
- 普通宝箱的掉落名额与价值行为未变（既有 9 项宝箱测试原样通过）

## D-17 Combat Foundation S4-B：只读属性 shadow 基建（2026-10-25）

依据 `docs/pixel-rogue-S4-implementation-brief.md` §4-S4-B 与 PR #77 评审定基线，分支 `feat/combat-foundation-s4b`（基线 232d3e7，含上游 #83–#88 图鉴/渲染/宝箱批次——四个战斗文件零改动，shadow 范围权威实现未受影响）。

### 交付范围（旧快照仍为唯一权威，零运行时改动）

- **新模块 `core/StatSheets.ts`**：shadow 构建器 + 逐 key 映射解析，不被任何结算路径引用；纯函数、无持久缓存、无 sidecar（评审定基线：首选按需纯函数）。
- **双输入来源对照**（防「同值包装两次」假对照）：
  - 来源 A：实体当前值打包（Player/Enemy 字段 → 属性表 → 空修饰符恒等穿过解析管线），证明接口兼容；
  - 来源 B：玩家从 picks 序列按**来源表**翻译修饰符、敌人从 EnemyConfig 复刻 spawnEnemy 条件展开规则——与 talent.f、实体字段、spawner 无引用关系，权威实现漂移由对照测试直接暴露。
- **类型化映射保持类型化**（评审定基线）：StatModel 加性扩展通用映射族 `KEYED_STAT_FAMILIES = ["typeDamageBonus", "resistance"]`，类型/形态名永远只作 key；逐 key 构造以族为槽位的子属性表走 resolveStats，适配层装配回 `Partial<Record<键, 数值>>`——不把火/雷/冰等组合硬编码成 StatId。
- **shadow 首批字段**（评审定基线）：defense、tough、critChance、critMultiplier（含觉醒）、typeDamageBonus（火/雷）、敌人 defense/resistances；attack/maxHp 未迁移。

### shadow 立刻抓到的语义缺口：flat 区浮点分组（S4-A 契约有据修订）

对照铁布衫×4 / 致命一击×7、8 时发现：S4-A 初版 flat 区为「Σ 先求和再加」，而权威 recompute 重放是 **base 起始逐次累加**——两者浮点分组不同，非可精确表示的十进制值相差 1 ulp（0.05+0.1×8：Σ分组 0.85 vs 顺序累加 0.8499999999999999）。任务书要求 S4-C「迁移输出与旧值逐位比对」，故在本批把 resolveStats 的 flat 区改为 **base 起始、按修饰符顺序逐次累加**（溢出守卫随逐次加法下放，语义更precise），stat-model 测试新增顺序钉子（`0.8499999999999999`，并断言 ≠ Σ分组值）。percent 区无既有来源，维持 Σ 先求和再乘一次的冻结语义，首个 percent 来源迁移（S4-C）时同样逐位核对。

### 覆盖与验证

- 新增 `tests/shadow-stats.test.ts` **13 项**：零来源/磐石×3/铁布衫×4/致命一击×8 觉醒（2→2.4）/×7 未觉醒（条件来源独立判定）/元素亲和×3（0.30000000000000004 浮点尾逐位）/混合顺序五字段同时一致/来源 A 恒等+无别名/纯函数不改写输入/敌怪三属性配置与实体双来源/精英不缩放甲抗/中性怪空映射
- `npm test` **200 项通过**（上游基线 + stat-model 27 + shadow 13；parity 26 原样）；`npm run build`（含 typecheck）通过
- 变异验证 3 组均被咬住：来源表磐石 15→14（2 红，漂移检测生效）、元素亲和 flat→percent 误归类（2 红）、觉醒阈值 ≥→>（1 红）
- 浏览器测试未运行：无场景/UI 改动（与 S4-A 同理）

### 负区因子政策提案（S4-B 只出案，S4-C 接入前定稿报批）

按 PR #77 评审倾向起草：**StatModel 保留数学负值输出（现状已钉）**；权威战斗接入时（S4-C）——
1. 减伤向属性（defense/tough/resistances）解析出负值时，适配层**显式拒绝（RangeError，快速失败）**，不静默裁剪：负值只可能来自错误来源，沉默处理会把配置错误变成隐形强度变化；
2. 增伤向映射（typeDamageBonus 等）的负值语义（未来「易伤」类来源）当前不存在，首个负来源落地时单独报批；
3. 旧快照接口不变，拒绝规则只作用于新解析路径。
待用户/上游批准后才在 S4-C 实现。

### S4-C 就绪备注

来源表（磐石/铁布衫/致命一击/元素亲和）已是 S4-C「天赋贡献 → 修饰符」的雏形；迁移时将其从 shadow 专用转为天赋声明的权威形态，并按任务书 §4-S4-C 分组迁移（纯 flat 来源先行）、逐组全链路权威来源唯一。

### 上游 PR #89 评审修订（P2×2 + P3，2026-10-25）

1. **P2 来源表补「会心深渊」**：来源 B 新增 critMultiplier flat +0.5/级（max 4，值逐字对照 talents.ts，不引用 talent.f）；新增单级（2.5）/满级（4.0）/与致命一击×8 觉醒组合（3.4，两种 pick 顺序）的权威 critMultiplier 逐位对照。0.5 可精确表示，与任何乘区分组无浮点歧义。
2. **P2 敌怪对照升级为权威快照比较**：brute/shooter/bomber（普通+精英）与 slime/bat（中性）全部增加 `getEnemyCombatStats(e)` 比较维度；适配器字段漂移变异（defense 兜底 0→1）实测 3 用例红，shadow 对适配器回归有咬合力。
3. **P3 resolveKeyedMap 危险原型键显式拒绝**：普通对象上 `out.__proto__ = v` 会触发原型 setter——键被静默丢弃且下游 `{ ...map }` 展开会再次丢失，故对 `"__proto__"` 键抛 TypeError（拒绝优于安全容器：游戏数据无合法 __proto__ 键）；`"constructor"` 等非魔键作为自有数据属性正常工作（边界用例固定）。base（JSON 解析自有键）与修饰符 key 两个入口都被覆盖。
4. S4-A 语义修订（flat base 起始顺序累加）、percent 加算、final 连乘、平衡/RNG/Player/Enemy 全部未动。

## D-18 工程配置：GitHub Pages 自动部署（2026-10-25）

### 动机

此前只能本地 `npm run dev` 试玩；而 `dist/` 是构建产物、被 `.gitignore` 忽略，`git pull` 不会更新它，
曾导致长时间在玩旧版本（`dist` 停留在 02:40，`main` 已到 13:36）。协作方也面临同一问题。

### 交付

- `.github/workflows/deploy.yml`：push `main` 或手动触发 → `npm ci` → `npm run build`
  （内含 `tsc --noEmit`）→ `upload-pages-artifact` → `deploy-pages`
- 权限：`pages: write` + `id-token: write`；并发组 `pages` 防止多次部署互相覆盖
- `README.md`：第 10 节改为「发布到静态托管」，新增方式 C，并写明两个易踩的坑
  （`dist` 不随 `git pull` 更新、`dist/index.html` 双击会因 ES module 的 CORS 限制而无法运行）

### 路径适配（无需改代码）

`vite.config.ts` 已是 `base: "./"`。实测构建产物：
CSS 中字体被重写为 `url(../assets/fonts/press-start-2p.ttf)`，HTML 引用为 `./assets/...`，
在 `/pixel-rogue/` 子路径下均能正确解析，不存在 404 风险。

### 启用步骤与验证

1. 仓库 Settings → Pages → Source 选择 **GitHub Actions**（或 `POST /repos/{owner}/{repo}/pages`，`build_type=workflow`）
2. 合并后 workflow 自动运行；完成后打开 `https://reopen64534042-sudo.github.io/pixel-rogue/`，
   确认开始界面版本号与 `main` 一致
3. 此后每次合并到 `main` 自动更新，无需手动操作

### 注意

部署配置不改变游戏内容，因此**不占用 changelog 版本号**；本文件记录即可。

## D-19 Combat Foundation S4-C 第一批：C0 属性来源审计 + C1 纯 flat 权威迁移（2026-10-25）

依据 `docs/pixel-rogue-S4-implementation-brief.md` §4-S4-C 与任务书「第一批 C0+C1」，分支 `feat/combat-foundation-s4c`（基线 f35bfd1，PR #89 合并后上游无冲突性新提交）。**只完成 C0+C1，停在校审节点；C2/C3/C4 未开始。**

### C0：41 张天赋属性影响清单（分类矩阵）

全部 41 张天赋逐一审计后的六类划分（`recompute()` 现状 = Object.assign(statBase) → 清六个 S3 可选键 → 按 picks 顺序重放 talent.f → hp 夹紧；当前唯一调用点 SwapSystem.melt）：

- **A 纯 flat 属性贡献、无获得时效果**——本批迁移 5 张：磐石（defense +15/级）、铁布衫（tough +0.1/级）、致命一击（crit +0.1/级 + 条件觉醒来源：upCounts≥8 读时有效暴伤 +0.4）、会心深渊（critMul +0.5/级）、元素亲和（typeDamageBonus 火/雷各 +0.1/级）。同类未迁移：修复微光（regen +0.6）、雷霆连锁（chain 计数 + chainDmg +0.15）、屠戮之欲（explode 计数 + explodeDmg +0.5）、吸血獠牙（lifesteal +0.008）、荆棘护甲（thorns +6）、闪避本能（dodge +0.08）、灼热易伤（scorchVuln +0.1）。
- **B 逐次乘算（final 语义，暂缓）**：磨刃 damage×1.1、狂怒 ×1.2、毁灭本能 ×1.3、疾速扳机 fireRate×1.18、疾风之靴 speed×1.1、磁力护符 magnet×1.4、广域法印 area×1.2、强化弹丸 boltDmgMul×1.25（技能特化倍率，非伤害乘区）。重放顺序=picks 顺序，与逐次学习运算序列一致。
- **C flat 属性 + 获得时即时效果（暂缓）**：生命之泉（maxhp+20 且回满）、巨人血脉（maxhp+30 且 hp+30）、能量护盾（shieldMax+1 且 shield+1）。
- **D 运行状态/层数/计时（暂缓）**：击杀狂热（hasteLv 上限成长 + 首次获取 haste=1/hasteT=3）、战意沸腾（rageLv，rageT 受伤触发）、壁垒（barrierLv → 每波开始 tempShield）、疾影步（dashLv/dashMax + dashT/dashCharges/dashRe）、不屈（nd + ndUsed 每波重置）。
- **E 机制解锁/条件/计数（不涉属性模型）**：分裂射击、穿透之矢、守护之刃、弹射魔符、烈焰印记、冰霜之力、雷霆连锁、星辰坠落、幸运之星、二段冲刺（req 疾影步）、烈焰蔓延（req）、天眼制导、焦土燃烧、魔刃回旋、不屈（hidden）。
- **F 非天赋持久来源**：满血血包 maxhp+1（ProgressionSystem，每波 potionGrow≤10 上限）——属性重算必须为其提供持久来源（现状缺失，见 R-1）。

**关键调用语义确认**：`learnTalent` 先 f 后写 upCounts/picks；`melt` 删材料 → recompute → output.f → 记录输出卡（输出卡即时效果正常生效，不被 hp 夹紧中和）；`recompute` 的 hp 夹紧 min(hpBefore, maxhp) 恰好中和了重放型治疗（生命之泉/巨人血脉重放补血不生效）。

### 新旧模型差异矩阵（recompute 现状缺陷，复现测试已定界、未修复）

| # | 现状行为 | 新模型预期 | 复现 |
|---|---|---|---|
| R-1 | **缺陷**：满血血包 maxhp 成长无来源，recompute 后丢失（statBase 重置） | 血包成长作为持久来源参与解析 | s4c-recompute-audit R-1 |
| R-2 | **缺陷**：能量护盾重放 shield++ → 已耗盾层恢复满值 | 当前护盾属 RuntimeState，不重放 | s4c-recompute-audit R-2 |
| R-3 | **缺陷**：击杀狂热重放 haste=1/hasteT=3 → 休整期 buff 重新触发 | 获得时效果不重放 | s4c-recompute-audit R-3 |
| R-4 | **缺陷**：dashT/dashCharges/dashRe/meteorT/tempShield/ndUsed/orbA/hurtCd 等被 statBase 覆盖重置 | RuntimeState 与属性分离（S4-D 范围） | s4c-recompute-audit R-4 |
| R-5 | **保护语义**（非缺陷）：hp 夹紧中和重放治疗，recompute 不改当前 HP（除上限夹紧） | 保持 | s4c-recompute-audit R-5 |

### C1：单一权威来源接入方式（权威来源切换图）

- **切换图**：`picks 序列 → talentStatModifiers()（core/TalentStatSources.ts 来源表，值逐字声明、不引用 talent.f）→ StatModel.resolveStats → applyTalentStatProjection() → Player 兼容字段（defense/tough/crit/critMul/typeDamageBonus）`。接入点三处：`learnTalent` 记录后、`recompute` 重放后（hp 夹紧前）、`melt` 输出卡应用（改经 learnTalent）。**Talent.f 对五张卡改空操作——旧 f 累加与新 Modifier 不并行，无双算。**
- **melt 执行次序不变证明**：输出卡应用由原三行（f → upCounts++ → picks.push）改为 `this.learnTalent(output)`——f 先执行、记录顺序不变、零随机消耗；max 前置条件由 `availTalents→canOffer` 在抽池时保证，抽池与学习之间无状态变更，校验必然通过。材料删除 → recompute → 输出卡学习 → 收尾的次序与 RNG 消耗数逐位不变（RNG 变异验证：melt 恰好 1 次 Math.random）。
- **五张 f 空操作无损证明**：审计确认五张卡均无获得时即时效果（A 类定义）；学习路径的属性生效改由投影承接，时序上仍发生在 learnTalent 返回前（pv/cur/UI 读数时点不变）。
- **浮点语义**：flat 区 base 起始、按修饰符顺序（=picks 顺序）逐次累加，与旧重放的 IEEE-754 运算序列逐位一致；逐位钉子：tough×4=0.4、crit×8=0.8499999999999999（≠ Σ 分组 0.8500000000000001）、tdb×3=0.30000000000000004。
- **觉醒**：保持 `DamageMath.critMultiplier()` 读时按 upCounts 现值判定，+0.4 不烘焙进 p.critMul 字段——置换移除层级后自动失效（测试覆盖 7/8 边界与两种组合顺序）。
- **可选键存在性**：defense 键仅在磐石来源存在时写入、无来源删键；typeDamageBonus 为键级所有权（第一轮评审 P2 修订，见下）——与旧 f 的序列化形状一致（parity 逐字段对照原样通过）。
- **负区因子**：政策未批准，本表全部来源为正 flat，未实施任何新的拒绝/裁剪（StatModel 保持 S4-B 语义，遵守暂缓项）。

### 测试与验证

- `npm test` **229 项通过**（上游基线 206 + C1 聚焦 18 + C0 审计 5）；parity 26 项原样通过（「every talent effect」裸 f 对照对铁布衫/会心深渊改经真实学习路径 learnTalent 并归一化记录字段——基线更新依据已留痕于 S4C_AUTHORITY_MIGRATED；全天赋模拟场景继续包含两张卡，未缩减对照范围）；`npm run typecheck`、`npm run build` 通过。
- 变异验证 6 组全部被咬住：① 来源表磐石 15→14（7 红，基线钉子+shadow 对照）② learnTalent 移除投影（31 红，含 parity 裸 f 对照）③ recompute 移除投影（4 红，含 D-08）④ melt 退回手动应用无投影（4 红）⑤ StatModel flat 区改回 Σ 分组（2 红，0.8499999999999999 顺序钉子）⑥ 觉醒阈值 ≥→>（6 红）。
- S4-B shadow 双源对照保持独立：playerShadowFromPicks（来源 B 独立重述）与 playerShadowFromEntity（来源 A 实体恒等）仍不被运行时引用，与投影字段逐位互证（resolveKeyedMap/键控修饰符类型自 C1 起被权威路径复用，模块说明已同步）。
- 浏览器测试未运行：无场景/UI/显示改动；伤害行为由「火雷单次乘区」「弹丸发射时快照不回溯」与 parity 逐位钉子覆盖。

### 已知风险与后续批次边界

- R-1～R-4 为既有缺陷 pin，纠正需独立授权（RuntimeState 分离属 S4-D/后续批次范围）。
- tdb 键级所有权兼容边界（第一轮评审 P2 定界，见下「评审修订」）：fire/lightning 为投影所有权键，外部写入者须避开；recompute/melt 路径沿用历史行为，外部键在该路径不保留。
- 铁布衫 0.6 上限、暴击无上限等夹紧仍在消费点（DamageSystem/UI），模型不裁剪，与 S4-B 定基线一致。

### 第一轮评审修订（P2 + P3×2，2026-10-25，未提交状态下修复）

1. **P2 typeDamageBonus 键级来源所有权**：首版投影把映射整体替换/删除，学习无关天赋会清空非迁移增伤键（如手工预置的 physical）——旧测试还把这个清空误钉为预期。修订：投影只拥有 `ELEMENT_TDB_KEYS = [fire, lightning]`（即来源表声明的全部映射键，与 talentStatModifiers 共用单一声明）——有来源时以解析结果**绝对覆写**（每次从 picks 全量解析，不与旧值相加，无重复叠加），无来源时删这两键（映射因此为空才连映射删除）；其余键属未知外部来源，学习任何天赋都保持不动。**兼容边界（明示不猜测）**：外部来源若也写 fire/lightning，与元素亲和贡献无法区分，投影覆写为权威值（当前无此类运行时写入者）；recompute/melt 沿用历史行为——recompute 先整体删键再重放（S3-B 语义），外部键在该路径不保留。测试：新增 4 项边界用例 + 快照用例断言修正（physical 保留且弹丸不回溯）；针对性变异（重新引入整映射替换）4 用例红确认咬合。
2. **P3 Mock 卫生**：`tests/s4c-talent-stat-sources.test.ts` 新增 `afterEach(vi.restoreAllMocks)`（vitest 配置无自动 restore）；单文件单独/重复运行与全量运行均通过，无跨测试污染。
3. **P3 真实升级面板路径**：新增经 `openLevelPanel`（恒定随机 0.92 确定性产出 [磐石, 疾影步, 狂怒]）+ `chooseSlot` 的完整升级路径测试——获得磐石、defense 立即投影为 15、upCounts/picks/pendingLevels/bpMode/slots 全部正确、学习步骤零额外 RNG（抽卡 RNG 只发生在 openLevelPanel）。
4. 本轮验证：`npm test` **234/234**（229 + 5 新增；parity 26 原样）；typecheck/build 通过；浏览器冒烟 `npm run test:browser` **6/6**（真实输入升级选择、熔炉/置换、生产构建首波自然通关）。单一权威来源不变：五张 Talent.f 仍为空操作，StatModel flat/percent/final 语义未动。

## D-20 Combat Foundation S4-C 第二批（C2-A）：全局基础伤害乘法天赋权威迁移（2026-10-25）

依据任务书「S4-C 第二批第一阶段」，分支 `feat/combat-foundation-s4c-c2a`（基线 a333d7f = 上游 PR #91 合并提交）。**只迁移三张伤害卡（磨刃/狂怒/毁灭本能），完成 C2-A 即停止；C2-B（强化弹丸/攻速/移速/拾取/技能范围）、C3/C4、S4-D 未开始。**

### 实施范围与权威来源切换

- **切换图（复用 C1 管线）**：`picks 序列 → talentStatModifiers() 新增三 case（attack final 1.1/1.2/1.3）→ StatModel.resolveStats final 区 → applyTalentStatProjection() → 既有 p.damage 字段`。接入点不变（learnTalent 记录后 / recompute 重放后 / melt 经 learnTalent）；三张卡 `Talent.f` 改空操作，旧乘算与新 Modifier 不并行。
- **来源所有权审计（任务书 §二.1/§二.7）**：全仓 grep `player.damage` 写入点——运行期唯一写入者为三张卡的旧 `f`（本批取消）+ 本投影；基础值 `damage: 11` 唯一来自 `statBase()`（数据层初始值，recompute 经 Object.assign 重置）。**三卡之外无合法攻击力写入者**，投影以 picks 结果覆写不存在覆盖冲突；若未来出现外部写入者，须先在来源表登记为独立来源（模块头注已声明该边界）。
- **语义选择**：使用既有 `attack` StatId 与 `final` 乘区——多级 = ×1.1² 的逐次连乘（IEEE-754 左结合、按修饰符数组顺序=picks 顺序），**不得折叠成 percent**（磨刃×2 = 13.310000000000002 ≠ percent 折叠 13.2 ≠ 预乘 1.21 的 13.309999999999999）。StatModel 公式与固定白名单未修改；未引入第二套 attack 累加缓存或新 Player 可枚举字段（投影写回既有 `p.damage`）。
- **单一乘区纪律**：`p.damage` 经 CombatStats.attack 随 rawAmount 进 DamageSystem 管线（S1 冻结），globalDamageBonus 等乘区不重复乘 attack；本批未改动任何技能伤害公式（boltDamage/meteorDamage/burnStackDps/burnGroundDps/shieldShockDamage 及近战/飞刃/反弹/弹丸入口全部零改动）。

### 新旧计算对照（逐位，Object.is/toBe 级）

| 场景 | 旧实现（f 重放） | 新实现（final 连乘） |
|---|---|---|
| 磨刃×1 | 12.100000000000001 | 12.100000000000001 |
| 磨刃×2 | 13.310000000000002 | 13.310000000000002 |
| 磨刃×99（满级） | 137806.12339822375 | 137806.12339822375 |
| 狂怒×1 / ×5 | 13.2 / 27.37151999999999 | 13.2 / 27.37151999999999 |
| 毁灭本能×1 / ×3 | 14.3 / 24.167 | 14.3 / 24.167 |
| 交错 磨刃→狂怒→磨刃→毁灭本能 | 20.763600000000004 | 20.763600000000004 |
| 交错 毁灭本能→磨刃→狂怒→磨刃 | 20.763600000000004 | 20.763600000000004 |
| **顺序敏感** 磨刃→狂怒 | 14.520000000000001 | 14.520000000000001 |
| **顺序敏感** 狂怒→磨刃 | 14.52 | 14.52 |
| **顺序敏感** 磨刃→毁灭×2 | 20.449000000000005 | 20.449000000000005 |
| **顺序敏感** 毁灭×2→磨刃 | 20.449 | 20.449 |

测试基线为 `legacyDamage()`（迁移前 f 语义的独立重述：statBase().damage 起始、picks 顺序逐次 `*=`），全部场景与投影结果 `toBe` 逐位一致；浮点由 IEEE-754 非结合性证明「同层数不同顺序」的顺序敏感对（磨刃+狂怒、磨刃+毁灭×2）确实不同——顺序被这两个用例咬住。

### 测试与验证

- 新增 `tests/s4c-damage-talent-sources.test.ts` 30 项：单级/满级/多级重复乘算钉子（含满级 99 连乘）、交错学习、顺序敏感对、无关天赋不重复增强、recompute×3 幂等、置换五场景（移除全部/保留部分/获得狂怒/获得毁灭本能/交错移除）、pv/cur 显示口径逐字钉子、全伤害链路（boltDamage 单次乘区、meteorDamage 加法顺序、burn/shock 公式、真实弹丸/陨星/灼烧/飞刃/近战路径）、发射时快照不回溯 + 陨星命中时取值、RuntimeState 与 RNG 纪律（学习零随机消耗）、f 空操作结构钉子。
- parity「every talent effect」裸 f 对照对三卡改经真实学习路径（`S4C_AUTHORITY_MIGRATED` 追加磨刃/狂怒/毁灭本能，基线更新依据已留痕）；全天赋模拟场景继续包含三卡，**parity 26 项原样通过，未缩减对照范围**。
- `npm test` **264/264**（C1 交付基线 234 + 本批 30）；S4-C C1（23）与 S4-B shadow（19）测试原样通过；`npm run typecheck`、`npm run build` 通过。
- `npm run test:browser` **7/7**：原有 6 项 + 新增宝箱强化面板测试（真实 DOM 卡片点击强化磨刃两次 → damage = 14.641000000000004 逐位钉子）。覆盖任务书要求的真实升级、宝箱强化、置换与首波战斗（生产构建自然通关）。

### 变异验证（4 组，全部被咬住后还原）

1. **倍率遗漏**（注释磨刃 final 修饰符）：20 红——聚焦基线钉子 + parity 双暴露。
2a. **旧 f 恢复写入**（talents.ts 恢复 `p.damage *= 1.1` 与投影并行）：**初版 0 红**——投影为绝对覆写语义，learnTalent 内 f 的乘算总在投影前被覆写，行为上不可区分。修订：新增「三卡 f 空操作结构钉子」（直接调用 f 后 Player 全字段 JSON 不变）使该变异可被咬住（1 红）。「f 不写入」本身是单一权威来源交付契约的一部分，不能因投影覆写而放弃。
2b. **投影重复应用**（覆写改累乘 `p.damage *= resolved.attack`）：32 红（含 parity）。
3. **final 顺序错误**（修饰符数组反转）：2 红——恰好是两个顺序敏感对用例（14.520000000000001 vs 14.52、20.449000000000005 vs 20.449），其余浮点钉子对顺序不敏感（multiset 特性，符合预期）。

### 遗留问题与新发现

- **新发现预置缺陷（本批不修复，待独立授权）**：宝箱强化面板提示「键盘 1 / 2 / 3 快捷选取」（GameUI.ts box 分支 hint），但 GameScene 键盘快捷键只对 `bpMode === "level"` 响应——宝箱模式下按 1/2/3 无效，仅卡片点击可用。与 R-1～R-4（recompute 审计）无关，为 C2-A 浏览器验证中发现的 UI 缺陷。
- R-1～R-4（满血血包 maxhp 丢失/能量护盾重放/击杀狂热重放/RuntimeState 重置）维持 C0 审计 pin，纠正需独立授权。
- 铁布衫 0.6 上限等夹紧仍在消费点，模型不裁剪（S4-B 定基线不变）。
- 强化弹丸（boltDmgMul）、疾速扳机（fireRate）、疾风之靴（speed）、磁力护符（magnet）、广域法印（area）留待 C2-B；StatModel final 区已验证可承载逐次乘算语义。

## D-21 Combat Foundation S4-C 第二批（C2-B）：五张乘法属性天赋权威迁移（2026-10-25）

依据任务书「S4-C 第二批第二阶段」，分支 `feat/combat-foundation-s4c-c2b`（基线 43a5690 = 上游 PR #92 合并提交）。**只迁移五张乘法属性卡（强化弹丸/疾速扳机/疾风之靴/磁力护符/广域法印），完成 C2-B 即停止；C3/C4、S4-D 未开始。本批完成后经独立代码复审通过（Approved，P3×2 非阻塞已修），按 PR 流程交付上游。**

### 实施范围与权威来源切换

- **StatModel 扩展**：固定白名单按需追加 `boltDmgMul/magnet/area`（`fireRate/moveSpeed` 已有，S4-A 冻结的解析契约与验证语义未动）。五卡来源贡献（final 逐次连乘）：强化弹丸 boltDmgMul×1.25、疾速扳机 fireRate×1.18、疾风之靴 moveSpeed×1.1（Player 字段 `speed` ↔ StatId `moveSpeed` 仅历史命名差）、磁力护符 magnet×1.4、广域法印 area×1.2；复用 C1/C2-A 管线（`talentStatModifiers → resolveStats → applyTalentStatProjection → 既有 Player 字段`），五张 `Talent.f` 改空操作，无双算。
- **来源所有权审计（任务书 §二）**：五字段运行期写入者**只有** `statBase()` 基础值（recompute 经 Object.assign 重置）+ 对应单卡旧 f（本批取消）+ 本投影；逐字段 grep 确认无其他合法写入者。**五字段各自只有一张天赋来源**（与 attack 三卡不同），投影覆写不存在覆盖冲突；`Enemy.speed` 为敌人实体属性，与 Player.speed 无关、不入模型。
- **动态攻速不进模型**：击杀狂热 `haste` 与战意沸腾 `rageT` 的攻速加成保持原消费点（AttackSystem 开火公式 `1/(fireRate×(1+haste×0.1+(rageT>0?0.2×rageLv:0)))`）实时乘算，不烘焙进 `p.fireRate`（变异 ⑥ 验证）。
- **消费点读写时机逐一确认、未统一**：弹丸 `size = 2×area` 与陨星 `R = 34×area` **生成时固化**（在途对象不回溯）；环绕飞刃位置 `26×area`/命中半径 `e.r+3+3×area` 与爆炸半径 `(26+explode×6)×area` **实时读取**；魔刃回旋反弹检测固定 26 px（不受 area，旧有行为保持）；血瓶吸附 `pullR = magnet×0.4` 与经验球吸附 `s = 160+(magnet-d)×4` 实时读取。冲刺固定 280 px/s 不读 speed；暂停/固定步长语义不变。

### 新旧计算对照（逐位，Object.is/toBe 级）

基准为 `legacyMultiplicative()`（迁移前五卡 f 语义的独立重述：statBase 对应字段起始、picks 顺序逐次 `*=`，不引用来源表/f）。全部场景与投影结果逐位一致：

| 场景 | 旧实现（f 重放）= 新实现（final 连乘） |
|---|---|
| 强化弹丸 ×1 / ×2 / 满级×30 | 1.25 / 1.5625 / 807.793566946316 |
| 疾速扳机 ×1 / ×2 / 满级×8 | 2.596 / 3.06328 / 8.269490245875355 |
| 疾风之靴 ×1 / ×2 / 满级×6 | 68.2 / 75.02000000000001 / 109.83678200000007 |
| 磁力护符 ×1 / ×2 / 满级×5 | 50.4 / 70.55999999999999 / 193.61663999999993 |
| 广域法印 ×1 / ×2 / 满级×4 | 1.2 / 1.44 / 2.0736 |

多级 ≠ percent 折叠钉子：疾速扳机×2 = 3.06328 ≠ 2.992、磁力护符×2 = 70.55999999999999 ≠ 64.8、疾风之靴×2 = 75.02000000000001 ≠ 74.4、广域法印×2 = 1.44 ≠ 1.4、强化弹丸×2 = 1.5625 ≠ 1.5。

**顺序敏感说明（任务书 §六.5）**：五字段各自只有一张天赋来源，重复乘算全部是同一倍率（×1.1 反复），同值连乘对顺序不变——**不存在可构造的同属性顺序敏感对**（与 attack 三卡不同）。final 区按 picks 顺序连乘的契约由 C2-A 的 attack 顺序敏感对钉子继续咬住（变异 ⑤ 佐证）。

### 测试与验证

- 新增 `tests/s4c-multiplicative-talent-sources.test.ts` 47 项：单级/多级/满级逐位钉子、五卡正逆序交错、与 C2-A 伤害卡交错（damage/boltDmgMul 独立解析）、无关卡不重复乘算、recompute×3 幂等、**五卡 f 空操作结构钉子**、获取路径（真实升级面板：random 0.4 → [磁力护符, 强化弹丸, 荆棘护甲]，学习零 RNG；宝箱强化真实面板；置换移除全部/保留层级/获得输出卡/与 C2-A 卡共存五场景）、pv/cur 五卡逐字钉子、五条消费路径判别测试（魔弹单次乘区与非魔弹不受 boltDmgMul、发射时快照不回溯；开火冷却公式镜像与 haste/rage 消费点叠加及 rageT 过期回落、攻速时序 25 tick 两发；移速逐 tick 镜像/冲刺 280 独立/暂停冻结；吸附阈值边界 40↔36→50.4、速度公式镜像、pullR 边界 20↔14.4→20.16、满血血包成长；area 生成固化 vs 实时读取的 6.3px/35px 判别）、RuntimeState 隔离与五字段类型契约。
- parity「every talent effect」裸 f 对照对五卡改经真实学习路径（`S4C_AUTHORITY_MIGRATED` 追加五卡，基线更新依据已留痕）；**parity 26 项原样通过，未缩减对照范围**。
- `npm test` **311/311**（C2-A 交付基线 264 + 本批 47）；`npm run typecheck`、`npm run build` 通过。
- `npm run test:browser` **7/7**（含宝箱强化面板精确投影、生产构建自然首波通关）。

### 变异验证（6 组，按预期咬住后全部还原，无遗留实验改动）

1. **修饰符删除**（磁力护符 final 移除）：16 红（含 parity 4 红）。
2. **旧 f 恢复写入**（磁力护符 `p.magnet *= 1.4` 与投影并行）：1 红——五卡 f 空操作结构钉子（投影绝对覆写在数值上不可区分，「f 不写入」是单一权威来源交付契约，C2-A 先例延续）。
3. **投影改累乘**（`p.magnet *= resolved.magnet`）：15 红。
4. **final 改 percent**（五卡 stage/值改 0.25/0.18/0.1/0.4/0.2）：14 红（多级非折叠钉子逐卡暴露）。
5. **修饰符顺序反转**（`[...scalars].reverse()`）：2 红——恰为 C2-A attack 顺序敏感对；C2-B 五字段零红为**预期**（单来源无顺序敏感对，见上说明），不把无差异结果当成被咬住。
6. **动态攻速烘焙**（haste>0 时投影内 `fireRate ×= 1+haste×0.1`）：2 红——疾速扳机消费路径「不烘焙动态攻速」与「开火冷却公式」两条。
- **变异过程事故记录**：变异 ④ 的还原脚本误用 `String.replace`（只替换首个匹配），把铁布衫 flat 0.1 误改为 1.1、疾风之靴 final 留在 0.1，污染了变异 ⑤ 首跑结果（18 红）。发现后逐处核对修复、重跑全量 311/311 确认基线，再重跑干净的变异 ⑤（2 红）。该事故同时反向验证了基线钉子对来源表数值漂移的敏感度。

### 遗留问题

- R-1～R-4（满血血包 maxhp 丢失/能量护盾重放/击杀狂热重放/RuntimeState 重置）维持 C0 审计 pin；宝箱模式键盘 1/2/3 快捷键缺陷（C2-A 发现）未修。
- 生命/当前护盾/冲刺充能/冷却/狂热等运行状态与属性分离属 S4-D；怪物 StatModel 权威迁移、负区因子政策未动。
- 铁布衫 0.6 上限等夹紧仍在消费点，模型不裁剪（S4-B 定基线不变）。

### 独立复审（2026-10-25，ChatGPT 只读审查）

**Approved（P1:0 / P2:0 / P3:2 非阻塞）**，批准提交、推送并向上游创建独立 PR。复审独立核对了来源表全部数值（含确认变异污染已完全恢复）、消费路径语义（生成固化 vs 实时读取未被统一）、并认可顺序敏感说明与六组变异结论（测试结果采信开发侧报告，本轮未重跑）。P3 修订（均为注释/文档准确性，不影响行为，无需复审轮次）：

1. **P3-1**：`TalentStatSources.ts` default 分支注释「其余 33 张仍由 talent.f 重放」的硬编码张数会随每批迁移过时——改为「未迁移天赋仍由 talent.f 重放，不在此维护张数」。
2. **P3-2**：本节开头「本批处于未提交状态，留待独立复审」的临时状态表述在交付后失真——改为「经独立代码复审通过（Approved，P3×2 非阻塞已修），按 PR 流程交付上游」。

复审指出的下一步边界维持不变：R-1～R-4 与宝箱键盘缺陷待独立授权；C2-B 合并后先制定 S4-C C3（混合天赋属性贡献与获得时效果分离：生命/护盾/狂热/冲刺）的差异审批方案，不直接进入 RuntimeState 大规模重写。

## D-22 Combat Foundation S4-C C3-0：混合天赋行为契约冻结 + 旧行为基线（2026-10-25）

依据任务书「C3-0 实施任务」，分支 `feat/combat-foundation-s4c-c3-contract`（基线 de37d93 = 上游 PR #93 合并提交）。**只交付审计、基线测试与设计文档，零生产行为变更；C3-A/B/C 生产实现未开始。** 六项行为差异（D-C3-01～06）已经用户批准，属「已批准、待分阶段实施」的冻结契约——生产实现尚不存在，当前 CI 全部断言均为旧行为基线。

### 交付物

- **契约文档** `docs/pixel-rogue-S4C-C3-contract-v1.md`（v1.0 交付、v1.1 经第一轮评审修订，见文末）：四类状态分类框架（Base/Modifiers/EffectiveStats / RuntimeState / OnAcquireEffect / PersistentSource）；D-C3-01～06 逐项定义（现状含缺陷编号、新行为、涉及字段）；四入口（learnTalent/recompute/melt/startNextWave）新旧执行顺序对照与六项不变式映射；C3-A/B/C 最小接口设计（`OnAcquireEffects.ts`/`RuntimeStateProtection.ts` 纯模块草案 + `TalentStatSources` 扩展签名 + GameCore 实例级 `potionMaxHpGrow` 持久来源，不新增 Player 可枚举字段）；边界场景逐条标注所属阶段与推荐方案；Given/When/Then 验收规范 23 条（G-1～G-23，仅验收文档、不进 CI）。
- **字段所有权矩阵**（契约 §3）：maxhp/hp/potionGrow、shieldMax/shield/shieldCd/tempShield/barrierLv、hasteLv/haste/hasteT/rageLv/rageT、dashLv/dashMax/dashCharges/dashRe/dashT/dashChargeLv、meteorT/nd/ndUsed/orbA/hurtCd/dx/dy 逐一引用实际调用点（文件:行号）。**边外确认**：`fireCd` 不在 statBase、recompute 天然幸存；`slow` 无玩家侧写入者（恒 0，重置无行为影响）；未发现 C0 之外新的「被 Object.assign 覆盖」运行字段。
- **旧行为基线测试** `tests/s4c-c3-baseline.test.ts` 16 项（B1～B16）：生命卡获得时效果（回满/+30/顺序敏感）、护盾获得赠层与恢复侧（CD 归零恢复、满盾冻结）、狂热首级 Buff 与升级不重触发、击杀叠层上限/受伤扣除/计时衰减、疾影步解锁与 dashMax 逐位序列、二段冲刺前置与充能上限、置换删除生命材料（maxhp 回落 + hp 夹紧 + 恰好 1 次 Math.random）、置换输出卡=能量护盾（一次性效果正常）、换波重置三件套、十三张迁移卡与混合卡交错 recompute 幂等、StatModel 有序 flat 解析等价（B16，v1.1 补充）。R-1～R-5 原样保留未削弱。

### 关键定界与实测发现

- **dashMax 浮点逐位（v1.1/P2-2 修正）**：旧 f 重放序列 2.0 / 1.6 / **1.2000000000000002**（B10 钉住）。三种形态实测：**有序 flat 累加**（base 2.4 + 每级单独 flat −0.4，即 StatModel flat 区语义）**逐位复现旧值**——`2.4−0.4` 按 ties-to-even 恰好舍入为 2.0，此后与旧 f 路径重合（B16 以现有 StatModel 独立验证，StatModel 契约零改动）；折叠式 `2.4−0.4×lv`（先乘后减）不逐位一致（L2 = 1.5999999999999999、L3 = 1.1999999999999997；v1.0 初版把 L3 误记为 1.2，一并更正）。**定案：C3-C 优先有序 flat 来源，查表 `{1: 2.0, 2: 1.6, 3: 1.2000000000000002}` 为备选，禁止折叠式**。v1.0 初版「只能查表、flat 否决」的结论系验证方法错误（只测了折叠式未测逐级累加），已撤回。
- **可达性备注**：击杀狂热/不屈为 t3 天赋，`selectMaterial` 拒绝 `u.t > 2` 材料——**当前游戏机制无法经置换移除 t3 卡**；「移除最后一级狂热清 Buff」契约仍冻结（面向未来降级路径与 recompute 侧协调，可直接构造 picks 验证）。
- **不可达入口的行为分叉（B7）**：击杀狂热 `f` 的首级 Buff 条件在真实升级路径（第二级不触发）与 recompute 重放路径（R-3，重新触发）下行为不同——这正是「获得时效果混入 f」缺陷的形态证据。
- **haste 降级夹紧（v1.1/P2-1 恢复已批准口径）**：hasteLv 降级且仍 >0 时 `haste = min(haste, hasteCap(newHasteLv))`（**不刷新 hasteT**）；从 >0 降为 0 时清除 haste/hasteT。v1.0 初版误推荐「不夹紧」，评审纠正后在契约 §2/§4.2/§5.3/§6/§10 与 G-12 同步恢复。
- **recompute 的 `max(1, …)` 下限语义**：hp ∈ (0,1)（浮点受击可产生）时 recompute 抬升至 1，随 D-C3-05「保持原夹紧规则」一并冻结，不另立缺陷。

### 测试与验证

- `npm test` **327/327**（C2-B 交付基线 311 + 本批 16）；**parity 26 项原样通过**，未削减/重写/放宽；C0 审计 R-1～R-5 原样通过。
- `npm run typecheck`、`npm run build` 通过。浏览器测试未运行：无场景/UI/显示改动（符合 C3-0 范围约定；若实际触及场景/UI 应视为超范围并停止）。
- 零生产改动核对：`git diff --stat` 仅含 `docs/migration.md`、`docs/pixel-rogue-S4C-C3-contract-v1.md`（新增）、`tests/s4c-c3-baseline.test.ts`（新增）。

### 遗留与下一步

- 六项差异（血包成长来源/护盾重放/狂热重放/运行状态保护/HP 夹紧保持/冲刺保留）已批准、**生产实现尚未开始**；C3-A（生命）/C3-B（护盾）/C3-C（狂热+冲刺+其余运行状态）按契约 §9 分批实施，每批停审查节点、由独立复审通过后授权下一批。
- R-1～R-4 缺陷维持 pin 现状；宝箱模式键盘 1/2/3 快捷键缺陷（C2-A 发现）未修。
- parity 快照对新 GameCore 字段（`potionMaxHpGrow`）的兼容性需在 C3-A 实施前实证（`potionGrow` 先例佐证，仍需验证）。

### 第一轮评审修订（P2-1 + P2-2 + P3，2026-10-26，未提交状态下修复）

1. **P2-1 恢复已批准的狂热降级夹紧契约**：hasteLv 降级且仍 >0 → `haste = min(haste, hasteCap(newHasteLv))`、**不刷新 hasteT**；从 >0 降为 0 → 清除 haste/hasteT。v1.0 初版把该场景误写为「推荐不夹紧」（偏离审批口径），已在契约 §2（D-C3-03）/§4.2（recompute ⑧）/§5.3（reconcileRuntimeToCaps，`EffectiveCaps.hasteCapLevel` 更名 `hasteCap` 并承载 `3 + hasteLv`）/§6（狂热②③④）/§10.3/G-12 同步恢复批准口径。
2. **P2-2 纠正 dashMax 计算方案**：验证确认**有序 flat 来源**（base 2.4 + 每级单独 flat −0.4，即 StatModel flat 区「base 起始逐次累加」语义）**逐位复现**旧 f 序列 2.0 / 1.6 / 1.2000000000000002——`2.4−0.4` 按 ties-to-even 恰好舍入为 2.0，此后与旧 f 路径重合。v1.0 初版「flat 解析必须否决、只能查表」的结论系验证方法错误（只测了折叠式 `2.4−0.4×lv` 先乘后减，未测 StatModel 实际的逐级累加），已撤回；折叠式实测 L2 = 1.5999999999999999、L3 = 1.1999999999999997（初版把 L3 误记为 1.2，一并更正），**禁止折叠式**。定案：优先有序 flat 来源（StatModel 契约零改动、负 flat 合法），查表 `{1: 2.0, 2: 1.6, 3: 1.2000000000000002}` 降为备选。B10 旧值基线原样保留；新增 **B16**（tests/s4c-c3-baseline.test.ts）：以白名单内 attack 槽位承载的 StatModel 有序 flat 解析等价验证（1/2/3 级逐位钉子 + 与真实学习路径 `g.player.dashMax` 交叉验证），不接入疾影步生产逻辑、不改动 StatModel。
3. **P3 统一永久成长来源**：命名统一为 `potionMaxHpGrow`（清除 v1.0 残留的 `potionHpGrow` 混用）；`talentStatModifiers` / `applyTalentStatProjection` 的 `persistent: PersistentStatSources` 由可选参数改为**必传参数**（编译期防线——learnTalent/recompute/melt→learnTalent 三个生产接入点均为 GameCore 方法就地取用，杜绝漏传静默按 0 重建 maxHp 的 R-1 复活路径；C3-A 落地时同步更新 C1/C2 既有直调测试）；新增 **G-23**（血包永久成长后学习无关天赋 maxHp 不丢失，获得路径与 recompute 双入口）。
4. 本轮验证：聚焦 `tests/s4c-c3-baseline.test.ts` 16/16；`npm test` **327/327**（parity 26 原样）；`npm run typecheck`、`npm run build` 通过；契约/D-22/B·G 编号一致性复查通过（B1～B16、G-1～G-23、potionHpGrow 零残留、生产代码零改动维持）。

### 第二轮复审定向修订（P2 + P3×2，2026-10-26，未提交状态下修复）

1. **P2 `EffectiveCaps.hasteCap` 零级哨兵明确化**（契约 §5.3）：计算表达式 `hasteCap = hasteLv > 0 ? hasteCap(hasteLv) : 0`——hasteLv=0 → 0（未学哨兵）、hasteLv>0 → `3 + hasteLv`（复用 data/talents 既有导出）。0 哨兵使 reconcile 两分支判定互斥完备，附两示例：2→1（before cap=5、after cap=4 → 夹紧分支 `haste = min(haste, 4)`，hasteT 不刷新）；1→0（before cap=4、after cap=0 → 清除分支 `haste=0, hasteT=0`）。
2. **P3 §3.4 dashLv 行修正**：删除残留的折叠公式 `2.4 − 0.4×dashLv`；明确 dashLv 为 flat +1/级（base 0，整数精确）、dashMax 不由 dashLv 推导，由有序 flat −0.4/级独立解析（base 2.4，折叠公式禁止见 §8.3）。B10/B16 基线不调整。
3. **P3 §9 验收编号归属修正**：C3-A 为 G-1～G-5 **与 G-23**；C3-C 为 **G-10～G-22**；G 用例实际内容不变。D-22 同型表述检查：无折叠公式残留、无 G 批次归属映射，无需正文修订，仅追加本记录。
4. 本轮为纯契约与文档修正：生产代码零改动；B16 所在测试文件未变动；修订后实跑 `npm test` **327/327**（parity 26 原样）、`npm run typecheck`、`npm run build` 全部通过。

## D-23 Issue #95：移动端八向触控输入层（M1，2026-10-26）

### 背景与结论

用户提出「植入八向触控摇杆以适配手机端」。勘察后结论是：**摇杆本体不难，手机端布局才是主要工作量**，故拆为 #95（M1 输入层）/ #96（M2 布局与字号）/ #97（M3 真机调校），本章只记录 M1。

摇杆之所以是低难度项，是因为现有输入本就是离散八向：`PlayerSystem.ts` 由布尔键位合成 `mx / my ∈ {-1,0,1}`，对角再乘 `0.7071`。触控只要产出同一组取值，移动、碰撞、速度规则一行都不用改。

### 设计（三层接缝）

1. **纯逻辑** `src/input/joystick.ts`：扇区吸附（45°）、死区（半径 25%）、扇区迟滞（22.5°+8°，防边界抖动）、`Joypad` 指针状态机（单指持有、固定模式抓取容差、回中）。DOM-free，可 Vitest 覆盖。
2. **设备判定** `src/input/touchDevice.ts`：`pointer: coarse` **且** `hover: none` **且** `maxTouchPoints > 0`，三条件齐全才启用触控层。触屏笔记本主指针是鼠标（fine + hover），因此不会被误判为手机——这是 D5「宁可漏判不可误判」的落地方式。启动时一次性判定，运行期不随事件切换，避免模式抖动。另留 `?touch=1/0` 开发开关（`import.meta.env.DEV` 门控，生产构建摇树消除），供桌面浏览器与 e2e 复用同一条事件链。
3. **UI 层** `src/ui/TouchControls.ts`：只做 DOM 绑定与每帧同步，方向一律经 `core.setMoveAxis()` 写入。

### 关键取舍

- **不与 `keys` 同表**：`GameCore.moveX / moveY / dashHeld` 为独立字段。若复用 `keys["w"]`，物理键盘与摇杆会互相覆盖，症状是「松手后角色仍在走」。测试 `takes priority over the keyboard without overwriting key state` 钉住：触控优先、键盘按下态不被改写、触控归零后键盘立即接管。
- **不引入模拟量**：`setMoveAxis` 只保留 `-1/0/1`（`Math.round` 后夹紧），摇杆是离散八向而非 360° 自由方向，防止上层误改移动规则。
- **不触验收基线**：parity 快照是手写字段白名单，不含 `keys` 与新增字段；`PlayerSystem` 在 `moveX/moveY` 全零时逐字走原键盘分支，26 项对照原样通过。
- **状态门控**：`state !== "play"`、失焦、切后台一律回中并 `clearTouchInput()`。冲刺键按住态每帧**无条件**写入（只置 true 不置 false 会让按钮「一按到底」——e2e 首轮即咬住该缺陷）。
- **D4 冲刺键显隐**：`player.dashLv > 0` 才显示，未解锁「疾影步」时完全不出现，与 `PlayerSystem` 的 `dashLv` 门控天然一致；极短点击保底 80ms 脉冲，避免快于一个 60Hz 帧而被吞。

### 验收

- 新增 `tests/touch-input.test.ts` **24 项**（扇区/死区/迟滞/半径容错、指针状态机 4 项、设备判定 5 项、设置持久化 4 项、核心接缝 6 项）。
- `npm test` **351/351**（合并 main 后的基线 327 + 本批 24）；`parity` 26 项原样；`npm run typecheck`、`npm run build` 通过。
- 新增 `tests/browser/touch.spec.ts` **4 项**（PC 端不出现触控层且键盘不受影响、摇杆八向与松手回中、冲刺键解锁后才显示并可触发、摇杆模式可切换且持久化）；`npm run test:browser` **11/11**。
- 手机视口（844×390，DPR 2）实拍核对：浮动/固定两种摇杆、冲刺键充能数字、操作设置面板、升级面板在触控层之上不被遮挡。
- **尺寸参数（按用户试玩反馈定稿，后续调参只改这几处）**：摇杆半径 `JOYPAD.radiusRatio = 0.125`（舞台短边，夹紧 24–64px，844×390 下直径约 97px）；固定锚点 `(舞台宽 15%, 舞台高 78%)`；浮动模式中心按半径夹紧回舞台内（`clampCenter`），越界时底盘不再被裁掉一半；冲刺键高 `18%`、距底 `22%`、距右 `4%`；触屏暂停键最小点击区 `40px`（与冲刺键保留 ≥30px 垂直间距，两者不再重叠）。

### 已知遗留（转 #96）

- 字号体系仍是 `vmin`：升级卡片在手机横屏下实际字高约 4–6px，可读性不达标；本章只把暂停键提到 40px 最小点击区、冲刺键文字按舞台尺寸定，未动全局单位。
- 天赋详情仍依赖 `onmouseover`（`GameUI.ts:445-472`），触屏无法展开。
- 竖屏未做布局：390×844 下舞台仅 390×219，需横屏引导（D2 已定为强制横屏）。
- 真机未验证（无 iOS/Android 实机），手势边界与多指并发留待 M3。

## D-24 Issue #100：移动端属性面板入口——并入暂停界面（2026-10-26）

### 背景

M1（#95）上线后真机实测发现：属性面板唯一入口是键盘 `C`（`GameScene.ts` 的 keydown 路由），触屏无键盘即无法打开。曾比较「常驻按钮」与「并入暂停界面」两种方案，**采用后者**：

- 属性面板本身就把 `state` 切到 `stats`，此时 `GameScene` 不推进模拟——「边打边看」在机制上不存在，常驻按钮的快捷收益为零；
- 手机横屏舞台高度仅 390px，已有摇杆（左下）、冲刺（右下）、暂停（右下角）三个控件，再放常驻键必然挤压 HUD；
- 暂停界面已并列「图鉴」入口，属性并入属同一类「查看信息」操作，且常驻键还需在升级/宝箱/置换/结算面板弹出时逐一门控隐藏。

### 实现

- `GameCore.statsFrom: "play" | "pause"`（默认 `play`）记录来源；新增 `openStatsFromPause()`，**仅在 `state === "pause"` 时接受**，置来源后切 `stats` 并先 `view.paused(false)` 再 `view.stats(true)`。
- `toggleStats()` 关闭分支按来源分流：`pause` → 回 `pause` 并 `view.paused(true)`；`play` → 原样回 `play`。键盘路径（play↔stats）逐字未变。
- `ensurePlay()`（Issue #34）在关闭属性前先把来源复位为 `play`，保持「面板命令强制回战斗态」的原语义。
- UI：暂停面板新增 `#btn-pause-stats`（角色属性，位于继续/图鉴之间）；`view.stats(true)` 时按来源设置底部按钮文案「返 回」/「返回战斗 (C)」。
- `resetGame()` 复位 `statsFrom`。

### 两处坑（与既有实现冲突的地方）

1. **层级**：`#ov-stats` z-index 30 < `#ov-pause` 60，两者同时可见时属性会被暂停面板盖住 → 必须"先收暂停、再开属性"，而不是把属性提到 70（提到 70 会与图鉴同级，且暂停面板残留在下层的状态更难推理）。
2. **返回目标**：若沿用 `toggleStats()` 的旧行为，从暂停进入后关闭会直接 `state = "play"` 恢复战斗——玩家只看一眼属性就被丢回战场，属明显体验缺陷。来源字段是必要成本。

### 验收

- 新增 `tests/stats-entry.test.ts` **6 项**：暂停进入并回到暂停、属性打开期间模拟冻结（`time`/`player.x` 不变，且摇杆输入不生效）、非暂停态拒绝进入、键盘 play↔stats 不变、`ensurePlay()` 仍强制回 play、新局复位来源。
- 新增浏览器用例 1 项（`tests/browser/touch.spec.ts`）：暂停 → 角色属性 → 属性面板可见 / 暂停面板已收起 / 文案为「返 回」/ `state === "stats"` → 返回 → 暂停面板恢复且 `state === "pause"` → 继续战斗。
- `npm test` **357/357**（上一基线 351 + 6）；`parity` 26 项原样；`npm run test:browser` **12/12**；`npm run typecheck`、`npm run build` 通过。

### 遗留

- 从暂停进入属性后按 `P`（暂停快捷键）无响应——`togglePause()` 只处理 play↔pause，此时可点「返 回」或按 `Esc`。属键鼠边缘路径，未修，记录备查。
- 手机档字号问题（属性面板内的 34 条天赋列表同样偏小）仍归 #96。

## D-25 Issue #96（M2-1）：竖屏引导与触屏手势边界（2026-10-26）

### 背景与决策变更

M1/M2 上线后用户真机试玩，反馈「升级选卡与属性面板文字**很清楚，没问题**」。此前按 `vmin` 绝对值推算（横屏 390 高时 1.2vmin ≈ 4.7 CSS px）判定不可读，实际真机观感可接受。据此在 #96 留痕调整：

- **`vmin` → `--u` 的 313 处全量替换降级为可选**，不再作为必做项；
- 后续若局部仍读不清，改为只对该组件做媒体查询放大，不做全局单位迁移；
- 结论以用户观感为准，不以算术推算为准。

M2 因此重排为：**M2-1 横屏引导 + 手势边界（本章）→ M2-2 hover 改点按 → M2-3 字号（可选）**。

### 实现

- `src/ui/OrientationGate.ts`：`isPortraitSize` 纯谓词（`height > width`，正方形按横屏处理，避免误伤桌面窄窗）+ 闸门类。仅在**触屏设备**启用（与触控层共用 `TouchControls.active` 判定结果，桌面拉窄窗口不会弹提示）。
- 行为：进入竖屏 → 显示遮罩；若 `state === "play"` 则 `togglePause()`。**转回横屏只收起遮罩，不自动恢复战斗**——玩家可能正在看暂停里的信息，自动恢复会突然开打。
- 只在朝向真正翻转时动作（比较 `portrait` 前后值），避免 `resize` 抖动反复触发暂停。
- CSS：遮罩用 `position: fixed; inset: 0`，因为竖屏下 `#stage` 只有 390×219，跟随舞台会变成一条小窄条；标题/副标题另给 `max(20px, 6vmin)` / `max(12px, 3vmin)`，不受全局 `vmin` 字号偏小的影响。
- 开始界面键位提示在触屏档改写为触控说明（原文案备份并在 `dispose` 还原）。

### 手势边界的关键取舍

**不能对 `#stage` 整体用 `touch-action: none`。** `#ov-stats`、`#changelog-list`、`#bp-cards`、置换库存都是纵向滚动容器，`none` 会把面板内滚动一起禁掉——这是最容易踩的坑。采用：

| 目标 | 规则 | 理由 |
|---|---|---|
| `html, body` | `overscroll-behavior: none` | 禁下拉刷新与橡皮筋回弹 |
| `#stage.touch-mode` | `touch-action: manipulation` | 只禁双击缩放，保留滚动与捏合 |
| `#stage.touch-mode` | `user-select: none` + `-webkit-touch-callout: none` | 禁长按选中/弹出菜单 |
| `#game canvas`、`#btn-dash` | `touch-action: none` | 摇杆手势专用禁区（#95 已落地） |

不使用 `user-scalable=no`（牺牲可访问性），缩放控制交给 `touch-action`。

### 验收

- 新增 `tests/orientation.test.ts` **3 项**：竖屏/横屏判定、边长接近时判竖屏、正方形按横屏处理。
- 新增浏览器用例 **2 项**：①触屏 844×390 起手 → 转 390×844 弹遮罩且 `state === "pause"` → 转回横屏遮罩收起但仍为 pause → 点「继续战斗」恢复；②非触屏设备 420×900 窄窗下遮罩不出现。
- 既有触控用例补充断言：PC 档开始界面保留 `WASD` 键位提示，触屏档替换为「左半屏拖拽」。
- `npm test` **360/360**（上一基线 357 + 3）；`parity` 26 项原样；`npm run test:browser` **14/14**；`npm run typecheck`、`npm run build` 通过。
- 实拍（390×844 DPR 2）：遮罩铺满视口、标题与图标居中；横屏开始界面的键位提示已换成触控文案。

### 遗留

- 真机仍未验证（无 iOS/Android 实机）：iOS Safari 的 `orientationchange` 触发时机与 Android 边缘返回手势留待 #97。
- 手机档字号（M2-3）已降级为可选，若后续出现具体读不清的组件再单独处理。
- 天赋详情仍依赖 `onmouseover`（`GameUI.ts:445-472`），归 M2-2。

## D-26 Issue #96（M2-2）：天赋详情点按开关 + hover 规则隔离（2026-10-26）

### 先说一处前期判断的更正

M2 拆分时曾把「天赋详情」记为**触屏上的死功能**。实测（844×390 触屏仿真 + 合成 pointerdown/click）后确认：**点按原本就能展开**——`GameUI` 里早已有 `tl.onclick` 渲染 tooltip。真正的缺陷是另外两条：

1. **展开后关不掉**：触屏没有 `mouseleave`，再点同一条也不会收起，只能靠浏览器补发的 `mouseover` 碰运气；
2. **`:hover` 粘滞**：卡片点过之后一直保持放大/高亮，按钮一直青底，触屏观感错乱。

因此本章的实际交付是「补关闭路径 + 隔离 hover」，不是「新增点按能力」。结论记在此处，避免后来者按错误前提重做一遍。

### 实现

- **点按开关**（`GameUI` 天赋列表块）：
  - 鼠标仍走 `onmouseover / onmousemove / onmouseleave`，PC 手感零变化；
  - 触控/笔走 `pointerdown`：点开、再点同一条收起、点面板空白收起；并置 `skipNextClick` 跳过随后补发的 `click`，避免同一次点按被处理两次；
  - `shownTag` **只在 pointerdown 与 click 里写，hover 不写**——否则 PC 上「鼠标已展开 + 点击」会立刻命中同一条而被误判成收起（这是第一版实现踩到的真实 bug）；
  - `#ov-stats` 的 `pointerdown` 兜底关闭，不依赖浏览器补发的 mouseover。
- **hover 隔离**：19 处交互 `:hover` 规则（game.css 18 + codex.css 1）逐一包裹进 `@media (hover: hover)`，桌面（`hover: hover`）行为不变，触屏不再粘滞。
- **一个必须拆开的例外**：`.pause-actions .btn:disabled` 原来是 `.btn:disabled, .btn:disabled:hover` 的组合选择器。整条塞进媒体查询会让触屏上的禁用按钮丢掉背景/虚线边框（只剩 `.btn` 基础态），所以拆成「基础禁用样式（媒体查询外）+ `:disabled:hover`（媒体查询内）」。

### 验收

- 新增浏览器用例 2 项：①触屏合成 pointerdown/click 序列 → 展开 → 再点收起 → 再展开 → 点面板空白收起；②**CSS 结构断言**：遍历 `document.styleSheets`，要求 `.btn:hover`、`#bp-cards .card:hover`、`.talent-tag:hover` 等必须在 `@media (hover: hover)` 内，且**顶层不得残留任何 `:hover` 规则**（防止以后新增的 hover 规则漏包）。
- `npm test` **360/360**（与上一批同数，本批为 UI 行为，未新增单测）；`parity` 26 项原样；`npm run test:browser` **16/16**（14 + 2）；`npm run typecheck`、`npm run build` 通过。
- 实拍（844×390 DPR 2）：点按「磨刃」标签后详情面板在窄舞台内正常显示、不越界。

### 遗留

- tooltip 位置仍按手指坐标 +16px 偏移，可能与拇指重叠（`pointer-events: none`，不影响点击）。
- 真机仍未验证（无实机），触屏 `pointerdown` 与补发 `click` 的时序依赖浏览器实现；用例已按 Chrome 的实际顺序模拟，iOS Safari 需在 #97 复核。

## D-27 Combat Foundation S4-C 第三批（C3-A）：生命上限权威迁移 + 获得时治疗分离 + 血包永久成长修复（2026-10-26）

依据任务书「C3-A 实施任务」与契约 `docs/pixel-rogue-S4C-C3-contract-v1.md`（v1.2，上游 PR #98 合并），分支 `feat/combat-foundation-s4c-c3a-life`（基线 20e737d = 上游 PR #98 合并提交；已合并 upstream/main b4d9f32 = PR #99 触控输入 + PR #101 属性面板入口 + PR #103 横屏引导 + PR #104 天赋详情点按，文档编号顺延 v31/D-27（v28/D-24、v29/D-25、v30/D-26 已被上游移动端批次占用））。**只实施 C3-A（生命），完成即停止；R-2/R-3/R-4 维持缺陷 pin，C3-B/C3-C 未开始。** 已批准差异：D-C3-01（血包永久成长持久来源）、D-C3-05（HP 夹紧逐字保留）、两张生命卡获得时治疗与属性贡献分离。

### 实施范围与权威来源切换

- **切换图（复用 C1/C2 管线）**：`picks 序列 → talentStatModifiers(picks, persistent) 新增两 case（生命之泉 maxHp flat +20、巨人血脉 maxHp flat +30）→ StatModel.resolveStats（base.maxHp = statBase().maxhp + persistent.potionMaxHpGrow）→ applyTalentStatProjection → 既有 p.maxhp 字段`。接入点：`learnTalent` 记录后（+新增 OnAcquire）、`recompute` 重放后（hp 夹紧前）、`melt` 经 learnTalent 自然复用；两卡 `Talent.f` 改空操作，旧写入与新 Modifier 不并行。
- **PersistentStatSources（新接口，core/TalentStatSources.ts）**：`{ readonly potionMaxHpGrow: number }` 为 `talentStatModifiers` / `applyTalentStatProjection` 的**必传参数**（契约 §10.8 编译期防线，杜绝漏传静默按 0 重建的 R-1 复活路径；非默认参数、负值抛 RangeError）。生产接入点（learnTalent/recompute，均为 GameCore 方法）就地取用 `this.potionMaxHpGrow`。
- **血包永久成长（D-C3-01）**：GameCore 新增实例字段 `potionMaxHpGrow`（初始 0、resetGame 重置、startNextWave 不清零、非 Player 字段——先例 potionGrow，parity 快照不受影响）。满血转化处按「累计权威来源 → 即时双写实体投影」次序：`potionGrow++`（每波上限计数，语义不变）→ `potionMaxHpGrow++`（权威）→ `p.maxhp += 1; p.hp += 1`（兼容投影，保持当帧满血判定/regen/治疗读取行为，契约 §8.2 推荐方案落地）。**有效 maxHp = 100 + 血包永久成长 + 按 picks 顺序叠加的生命天赋贡献；成长仅在 base 计入一次，绝不重复作为 flat 修饰符。**
- **获得时效果分离（新模块 core/OnAcquireEffects.ts）**：`applyOnAcquireEffect(name, p, lvBefore)` 纯函数（无 DOM/Phaser/GameCore 依赖、零随机、不管来源）。生命之泉：`hp = maxhp`（回满至新有效上限）；巨人血脉：`hp += 30`（保持旧实现不主动夹紧）。调用时机 = learnTalent 内投影**之后**（回满依赖新 maxhp）；melt 输出卡经 learnTalent 自动复用；**recompute 绝不调用**。未迁移卡 no-op（不做预测登记）。
- **learnTalent 新时序（未迁移卡旧时序保持）**：max 校验 → `lvBefore` 捕获（递增前）→ `u.f(player)`（未迁移卡先行，两生命卡为空操作）→ upCounts/picks 记录 → 权威投影（带实例持久来源）→ `applyOnAcquireEffect` → 返回。max 校验失败/满级路径在校验处早退，零副作用。**未把旧「f → 记录」调换为「记录 → 所有 f」。**
- **recompute 最小改造**：结构零变动（hpBefore 捕获 / Object.assign / 六键清理 / 未迁移卡 f 重放原样保留），仅投影调用补传持久来源；hp 夹紧公式 `Math.max(1, Math.min(hpBefore, player.maxhp))` **逐字保留**（D-C3-05）。RuntimeStateProtection 空骨架**未引入**——本批无运行状态保存/恢复需求，不为凑架构增加无效抽象（任务书 §四 明示允许）；R-2/R-3/R-4 在 recompute 中仍复现旧缺陷。
- **来源所有权变更**：`p.maxhp` 运行期写入者自本批起 = 两张生命卡旧 f（已取消）+ 权威投影 + 满血转化即时双写（ProgressionSystem，权威为 potionMaxHpGrow，双写仅为当帧行为）；`hp` 写入者新增 OnAcquire 两卡（获得路径），recompute 夹紧不变。

### 修复前后对照（D-C3-01 / R-1）

| 场景 | 修复前（基线 20e737d） | 修复后（本批） |
|---|---|---|
| 满血血包 ×1 → recompute | maxhp 丢失回 100（R-1 缺陷） | maxhp 保留 101（R-1 反转为保留断言） |
| 成长 5 + 生命之泉 1 级 → recompute×3 | maxhp 120（成长丢失） | maxhp 125 恒定（G-1） |
| 成长 3 + 学习磐石/磨刃 | maxhp 103→100 | maxhp 103 恒定（G-23） |
| 置换移除泉+血脉（无成长） | maxhp 100 / hp 夹紧 | 行为一致（G-4/B12） |
| 换波 / 新游戏 | 成长随实体字段幸存/清零（但 recompute 必丢） | 换波保留、resetGame 清零（G-5） |

两张生命卡获得路径数值与旧 f 逐位一致（旧版语义独立重述 `legacyLife` 对照四种顺序 + B1～B3 + parity learnTalent 路径对照）；重放路径自本批起不再治疗（旧行为为「重放后夹紧中和」，可观测结果一致、机制更干净——R-5 断言不变）。

### 测试与验证

- R-1 反转为「永久成长正确保留」（保留旧行为注释与批准编号，含 potionMaxHpGrow 同步累计与重算幂等断言）；R-5 断言不变（注释更新机制说明）；**R-2/R-3/R-4 原样通过，未修改断言**（护盾重放/狂热重放/运行状态重置仍复现，留 C3-B/C）。
- 新增 `tests/s4c-c3a-life.test.ts` 15 项：G-1～G-5、G-23（契约 §7.2 验收落地）+ 旧版生命效果独立对照（legacyLife 四顺序）+ 生命卡与 recompute 交错时序 + 宝箱强化获得生命卡（chooseSlot 全链路）+ 生命之泉 99 级满级与满级失败零副作用 + 多波累计超单波上限（10+10、第 11 瓶触顶、跨波累计 20）+ 生命卡与伤害卡混合熔炼（melt 经实例持久来源）+ **结构钉子两条**（两卡 f 直接调用后 Player JSON 不变；OnAcquire 未登记卡 no-op）。
- P3 收尾新增真实入口回归：满血血包成长 3 + 生命之泉/巨人血脉（maxhp 153）→ 置换移除两卡 → maxhp 103、HP 按 `max(1, min(hpBefore, 103))` 夹紧、`potionMaxHpGrow` 保留 3；后续 recompute 与无关卡学习维持 103，输出卡恰好学习一次（`upCounts=1`）。
- C3-0 基线 B1～B16 原样通过（B1/B2/B3/B12/B15 在新路径下行为逐位一致）；C1/C2-A/C2-B 回归通过；`s4c-damage-talent-sources` 直调测试补传显式测试来源（断言未削减）。
- **parity 26 项原样通过**：生命之泉/巨人血脉加入 `S4C_AUTHORITY_MIGRATED`（基线更新依据已留痕：v8 f 的 maxhp/hp 结果与「投影 + 获得时效果」逐位一致，独立旧版比较由 legacyLife 对照与 B1～B3 咬住，不排除、不归零）；全天赋模拟场景继续包含两卡；wave parity 快照为固定字段清单，`potionMaxHpGrow` 为 GameCore 字段不入 Player 序列化，**无新增 Player 字段**。
- `npm test` **375/375**（C3-0 基线 327 + 上游 #99 触控 24 + #101 属性面板 6 + #103 横屏 3 + 本批 15）；`npm run typecheck`、`npm run build` 通过；`npm run test:browser` **16/16**（本批原有 7 项 + 上游 #99 触控 4 项 + #101 属性面板 1 项 + #103 横屏 2 项 + #104 详情点按 2 项）。

### 变异验证（7 组，全部被咬住后逐组还原；表中红数为新增回归测试前的 C3-A 初版 341 基线测量，合并后最终全量 375/375 通过（#104 未新增单测））

| # | 变异 | 红数 | 检测面 |
|---|---|---|---|
| ① | 删除生命之泉 flat 来源 | 16 | G-1/G-2/G-4、R-5、B1/B3/B12/B15、legacyLife 对照、parity 4 项 |
| ② | 删除巨人血脉 flat 来源 | 11 | R-5、G-4、B2/B3/B12、legacyLife、parity 4 项 |
| ③ | recompute 漏传永久来源（静默按 0） | 3 | R-1（反转）、G-1、G-23——恰为成长重建检测面 |
| ④ | 重复计算永久来源（base 双加） | 3 | R-1、G-1、G-23（125→130 越界即红） |
| ⑤ | 生命之泉回满效果恢复进 f | **1（恰为结构钉子）** | 行为面全绿——印证「旧 f 恢复写入被绝对投影+同值 OnAcquire 掩盖」，结构契约测试为唯一检测面（C2-A 变异②先例复现） |
| ⑥ | 巨人血脉 +30 改回满血恢复进 f | 8 | B2（受伤/满血时序）、B3/B12/G-4、legacyLife + 结构钉子 |
| ⑦ | recompute 夹紧公式改动（去 max(1,·)） | 1 | G-3——下限语义的唯一守卫（hp∈(0,1) 浮点边界） |

### 遗留问题与下一步

- R-2（护盾重放恢复）/R-3（狂热重放触发）/R-4（dash/meteor/tempShield/ndUsed/orbA/hurtCd 等被 statBase 覆盖）维持 C0 审计 pin，属 C3-B/C3-C 范围；RuntimeStateProtection 白名单机制待 C3-B 首次引入（契约 §5.3）。
- 宝箱模式键盘 1/2/3 快捷键缺陷（C2-A 发现）未修（任务书明示不夹带）。
- 运行状态字段（shield/shieldCd/haste/hasteT/dash*/tempShield/ndUsed/meteorT/orbA/hurtCd）在 recompute 中仍被 statBase 覆盖——既有缺陷行为，本批未顺手保护。

## D-28 Combat Foundation S4-C 第三批（C3-B）：护盾容量权威迁移 + 获得时赠层分离 + 运行状态保护（2026-10-26）

依据任务书「C3-B 实施任务」与契约 `docs/pixel-rogue-S4C-C3-contract-v1.md`（v1.2），分支 `feat/combat-foundation-s4c-c3b-shield`（基线 65c6922 = 上游 PR #102 C3-A 合并提交）。**只实施 C3-B（护盾），完成即停止；R-3/R-4 维持缺陷 pin，C3-C 未开始。** 已批准差异：D-C3-02（重算不恢复已消耗护盾、容量降低夹紧）、D-C3-04 护盾部分（仅保护 shield/shieldCd 两个运行状态字段）。

### 实施范围与权威来源切换

- **切换图（复用 C1/C2/C3-A 管线）**：`picks 序列 → talentStatModifiers(picks, persistent) 新增一 case（能量护盾 shieldMax flat +1/级）→ StatModel.resolveStats（STAT_IDS 白名单新增 shieldMax，base = statBase().shieldMax = 0）→ applyTalentStatProjection → 既有 p.shieldMax 字段（必写投影，无来源时写回 base 0）`。接入点与 C3-A 一致：`learnTalent` 记录后（+OnAcquire）、`recompute` 投影后（恢复/夹紧前）、`melt` 经 learnTalent 自然复用；能量护盾 `Talent.f` 改空操作，旧写入与新 Modifier 不并行。
- **来源所有权（C3-B 审计定界）**：`p.shieldMax` 运行期写入者 = 能量护盾旧 f（本批取消）+ 权威投影；基础值唯一来自 `statBase()`。`p.shield`/`p.shieldCd` 为 RuntimeState：写入者 = 破盾消耗（CombatSystem）、恢复逻辑（PlayerSystem）、获得时赠层（OnAcquireEffects，仅 learnTalent 路径）——来源表与投影**不声明、不写回**这两个字段。
- **获得时赠层分离（OnAcquireEffects 登记）**：`case "能量护盾": p.shield += 1`——与旧 f 逐字一致的无条件赠层（不检查当前层数、不回满、不刷新 shieldCd、不修改 shieldMax、零随机消耗）；lvBefore 不参与判定（每级获得都赠 1 层，B4 语义）。生命之泉/巨人血脉已有实现与执行时序未动。
- **RuntimeStateProtection（新纯模块，契约 §5.3 最小落地）**：`RUNTIME_STATE_KEYS = ["shield", "shieldCd"]`（const 字面量白名单 + Partial<Record> 只读快照，无 any）；`captureRuntimeState`/`restoreRuntimeState` 原样保存回写；`EffectiveCaps` **仅含 shieldMax**（C3-B 真正生效的协调字段——契约草案的 dashChargeMax/hasteCap 属 C3-C，狂热/冲刺未迁移前不得纳入，避免被误读为已完成权威属性；本批也不构造更大的 RuntimeState 容器）；`reconcileRuntimeToCaps` 只做「上限降低」方向的向下夹紧（`after.shieldMax < before.shieldMax → shield = min(shield, after.shieldMax)`），升高或不变时无操作。模块不依赖 GameCore/DOM/Phaser、不持全局状态、不掷随机数、不新增 Player 可枚举字段；hp 不入白名单（D-C3-05 夹紧承接），tempShield/C3-C 字段未提前保护。
- **recompute 编排（任务书 §五 10 步）**：① hpBefore 捕获 → ② `effectiveCaps` 捕获重建前 shieldMax → ③ `captureRuntimeState` 快照 → ④ `Object.assign(statBase())`（保留）→ ⑤ S3 六键清理（保留）→ ⑥ picks 重放未迁移卡 f（能量护盾 f 已空操作，不再产生写入）→ ⑦ 权威投影（persistent 必传）→ ⑧ `restoreRuntimeState` 回写 shield/shieldCd → ⑨ `reconcileRuntimeToCaps` 容量下降夹紧 → ⑩ HP 夹紧公式 `Math.max(1, Math.min(hpBefore, maxhp))` 逐字保留（D-C3-05）。learnTalent 未接入 reconcile——学习方向上限只增不减，夹紧结构性无操作（任务书 §三 未要求改动 learnTalent 时序）。SwapSystem.melt 结构零改动（材料删除、恰好 1 次随机、recompute→learnTalent 次序不变）。

### 修复前后对照（D-C3-02 / R-2/B6 反转）

| 场景 | 修复前（基线 65c6922） | 修复后（本批） |
|---|---|---|
| 破盾（shield=0、shieldCd=6.5）→ recompute | 重放 f 回满 shield=1、shieldCd 清 0（未满盾下一帧立即恢复） | shield=0、shieldCd=6.5 原样保留，继续倒计时（B6/R-2 反转） |
| 能量护盾 3 级满盾 → 置换移除 1 级 | 重放重建 shield=2（来源为重放） | shield 保留 3 → 夹紧 2（来源为保护后协调；已消耗时分叉：旧=回满，新=保留）（G-7） |
| shield=1、shieldMax 3→2 置换 | 重放回满至 2 | 保留 1，不凭空回满（G-7 变体） |
| 真实 damagePlayer 破盾 → recompute → 计时推进 | 盾复活 + CD 清零即恢复 | 10s 倒计时持续推进，唯一一次合法到期才 +1 |

获得路径数值与旧 f 逐位一致（legacyShield 独立重述 1~3 级对照 + B4/B13 + parity 单级 learnTalent 对照：shieldMax=1/shield=1）；重放路径自本批起不再赠层（旧行为为重放回满，D-C3-02 批准差异）。

### 测试与验证

- **反转**：R-2（tests/s4c-recompute-audit，保留旧行为注释与 D-C3-02 编号，新增 shieldMax 属性面断言）与 B6（tests/s4c-c3-baseline，shield/shieldCd 双保留断言）。
- **保持通过**：B4（获得赠层）、B5（恢复与满盾冻结）、B13（置换输出卡赠层）、B12/B14、R-1/R-5（C3-A 生命修复与 HP 夹紧）、R-3/R-4（狂热与其余 RuntimeState 缺陷继续复现——断言未动）、B15（交错回归，标题去张数化）；combat.test.ts 消耗顺序/破盾反震不变。
- **新增** `tests/s4c-c3b-shield.test.ts` 14 项：G-6（含 recompute×3 幂等）/G-7（夹紧 + 部分消耗不回满变体）/G-8/G-9 契约验收 + 真实 damagePlayer 破盾→重算→合法到期恢复 + 满盾 shieldCd 冻结保持 + 未学习时不增盾 + 满级失败零副作用 + 与生命卡/血包成长交错（双生命卡 OnAcquire 不回归）+ RNG 消耗数量不变（learnTalent 0 次/melt 1 次）+ legacyShield 旧行为独立对照 + 结构钉子两条（f 空操作 JSON 不变 / OnAcquire 未登记卡 no-op）。C3-A 的 OnAcquire no-op 结构测试样本更新（能量护盾已登记，改用疾影步/壁垒）。
- **Parity 26 项原样通过**：能量护盾加入 `S4C_AUTHORITY_MIGRATED`（基线更新依据已留痕：v8 f 的 shieldMax/shield 单级结果与「投影 + 获得时效果」逐位一致，独立旧版比较由 legacyShield/B4/B13 咬住，不排除、不删减字段、不放宽比较）；全天赋模拟场景继续包含该卡；无新增 Player 字段。
- `npm test` **389/389**（上游基线 375 + 本批 14）；`npm run typecheck`、`npm run build` 通过；`npm run test:browser` **16/16**。护盾层数游戏内显示已验证（一次性 Playwright 手动脚本，用后即删）：学习后世界内护盾环渲染 + 属性面板「🛡️ 护盾 1 / 1」+ 已学天赋能量护盾 Lv.1，真实破盾后显示同步 0 / 1（截图 output/playwright/c3b-shield-ring.png、c3b-stats-panel.png、c3b-shield-consumed.png，output/ 不入库）。

### 变异验证（7 组，全部被咬住后逐组还原；红数为 389 基线下的全量失败数）

| # | 变异 | 红数 | 检测面 |
|---|---|---|---|
| ① | 删除 shieldMax flat 来源 | 19 | R-2/B4/B5/B6/B13、G-6~G-9、damagePlayer、legacyShield、满级失败、交错、RNG、parity 4 项 |
| ② | 删除 OnAcquire 赠盾 | 14 | R-2/B4/B13、G-6~G-9、damagePlayer、满盾冻结、满级失败、legacyShield、parity 3 项 |
| ③ | 恢复旧 f 盾层与上限写入（并行叠加） | 16 | ②的全部面 + B6/parity 4 项 + **结构钉子（f 空操作）**——行为面与结构面双重咬住 |
| ④ | recompute 不恢复 shield | 4 | G-7 两项（夹紧/不回满）、damagePlayer、满盾冻结——恰好为「shield>0 保留」检测面 |
| ⑤ | recompute 不恢复 shieldCd | 5 | B6、G-6、damagePlayer、满盾冻结、交错——恰好为「shieldCd 保留」检测面 |
| ⑥ | 删除容量下降夹紧 | 2 | G-7 夹紧、RNG 用例（含两级全移除 shield 夹紧断言） |
| ⑦ | recompute 错误重新赠盾 + 清零恢复 CD | 11 | R-2/B6/B13/G-6~G-8、damagePlayer、满盾冻结、未学习不增盾、交错、D-08（重算幂等面） |

### 遗留问题与下一步

- R-3（狂热重放触发）/R-4（dash/meteor/tempShield/ndUsed/orbA/hurtCd/dx/dy 等被 statBase 覆盖）维持 C0 审计 pin，属 C3-C 范围；RuntimeStateProtection 白名单与 EffectiveCaps 已为其预留扩充位（契约 §5.3 全量清单）。
- 击杀狂热/疾影步/二段冲刺/壁垒/不屈/战意沸腾的属性迁移（hasteLv/dashLv/dashMax/dashChargeLv/barrierLv/nd/rageLv）未开始；能量护盾旧 f 已空操作，其余混合卡 f 仍按旧语义重放。
- 宝箱模式键盘 1/2/3 快捷键缺陷（C2-A 发现）未修（任务书明示不夹带）。

## D-29 Issue #107：天赋刷新按钮改为卡片下方文字按钮（2026-10-26）

- **需求**：刷新按钮从卡片右上角移到卡片下方居中（对齐《金铲铲之战》选强化布局），PC 与手机同步
- **定位改动**：`.refr` 去掉 `position: absolute` 与 `top/right`，改为流式；`#bp-cards .card .refr` 用
  `width: 33%` + `margin-top: auto` 占内容区三分之一并贴底 —— 卡片本身已是 `flex column + align-items: center`，
  故水平居中无需额外设置。实测桌面 43.8×13.0、手机 21.3×13.0（均占卡宽 28%），水平偏移 **0.00px**
- **三轮尺寸调整**：首版 `width:100%`（撑满整行，视觉像横杠）→ 用户「长宽各减一半」改为 50% →
  再「小三分之一」改为 33% 并压掉 padding。高度没有严格按比例缩，因为字号有可读下限
  （桌面 1.15vmin≈9.2px，与卡片内 `.up` 一致）
- **字体"突兀"的真实原因**：实测 computed style 发现**字体家族本来就一致**
  （都是 `"Press Start 2P", "Microsoft YaHei", monospace`），差异在 **字重**——按钮为 inherit + 400，
  而周围 `.nm`/`.lv` 是 700，细一档的字放在深色块里显飘。改为显式声明字体 + `font-weight: bold` 后与上方文字统一
- **换行坑**：宽度 33% 时，手机按钮仅 21.3px 宽，而「刷 新」三字符 × 8px = 24px 放不下，
  **浏览器自动换行把按钮撑到 22.8px 高**（比一半版本还高）。去掉字间空格改为「刷新」（16px）后恢复正常。
  Press Start 2P 的空格是等宽全角，两字按钮中间的空隙也因此显得过大
- **emoji 隐患**：原按钮用 `🔄`，而「Press Start 2P」不含 emoji，部分环境渲染为方块（历史已知问题）。
  改用文字彻底绕开字体覆盖范围，顺带与站内「继 续 战 斗」等按钮风格统一
- **手机档必须单独放大**：`vmin` 在手机上极小（844×390 时 1vmin≈3.9px），按桌面比例渲染的按钮只有约 10px 高。
  故加 `@media (pointer: coarse)`：字号 `max(8px, 1.7vmin)`、`min-height: 13px`
- **踩坑：文案有两份**。`index.html` 的 `.level-subhint` 与 `GameUI.openLevelPanel()` 里各硬编码一份，
  后者每次开面板都会覆盖前者 —— 只改 HTML 会在运行时被改回旧文案，两处必须同步
- **卡片增高**：手机卡片由 86px 增至约 108px（按钮 13px + 间距），仍在 390 高视口的安全范围内；
  桌面卡片 206.6px。两端面板均不溢出
- **验收**：Vitest **389** 项全绿、浏览器 **16/16**。`game.spec.ts` 新增位置断言：
  按钮须位于卡片下半部、水平偏移 < 1px、文字为「刷 新」，防止将来 CSS 回退成右上角
- 未改变任何规则行为（parity 26 项原样通过）；宝箱面板仍不显示刷新按钮

## D-30 Issue #106：手机端后期掉帧——文字纹理每帧无效重建（2026-10-26）

### 现象与证据链

用户反馈：iPhone 14 Pro + iQOO Z9 Turbo+ **两台机器在第 5 波后都掉帧**。

**假设演进**（记录以免重走）：

| 假设 | 结论 |
|---|---|
| DPR 3 导致像素量 9 倍膨胀 | **排除**：`Scale.NONE` + 固定 px stage，canvas 逻辑尺寸恒为 480×270 |
| ProMotion 120Hz 每帧预算只有 8.3ms | **排除**：用户开「限制帧速率」锁 60Hz 后**依然掉帧**；且安卓机同样掉帧 |
| 规则计算量（敌人分离 O(n²)） | **排除**：`core.update` 实测 0.05ms（1x）/ 0.69ms（10x 降速） |
| 渲染管线 | **确认** |

### 测量方法（可复现）

桌面 Chrome + CDP `Emulation.setCPUThrottlingRate` 模拟移动端算力：

1. 灌满 160 敌人（`player.damage = 0` 保持数量恒定）
2. 规则单帧耗时：直接连调 `core.update(1/60)` 取均值
3. 完整帧耗时：连调 `scene.update(now, 1000/60)` 取 p50/p95
4. CPU profile：`Profiler.start` 采样 4 秒，按 self time 排序

**关键**：不能只看 `requestAnimationFrame` 间隔——headless Chrome 不限帧，
实测 delta 只有 5ms（200fps），完全没有参考价值。必须测 `scene.update` 的 CPU 时长。

### 根因

CPU profile（6x 降速、160 敌人）热点：

```
17.0%  texImage2D          ← 纹理上传 GPU
14.1%  (program)           ← 着色器
 5.0%  batch (phaser)
 4.0%  draw (draw.ts)
 3.4%  syncFont (phaser)   ← 字体同步
 2.3%  measureText
 1.8%  GraphicsWebGLRenderer
 1.6%  updateText (phaser)
 1.5%  fillText
```

`PixelPainter.fillText()` 每帧对每个文字对象调用 **5 个属性写入**：

```ts
label.setText(value)
  .setFontFamily('"Press Start 2P", monospace')   // 恒定值，每帧重设
  .setFontSize(size)
  .setColor(this.fillStyle)
  .setResolution(1);                              // 恒定值，每帧重设
```

Phaser 的 `Text` 是 **canvas 重建型**对象：属性写入 → 标记 dirty → `updateText()` 重绘内部 canvas →
`texImage2D` 重新上传纹理。**HUD 那一行数值没变，也照样每帧重建一整张纹理。**

### 修复

- `fontFamily` / `resolution` 移到对象创建时设置一次（本来就恒定）
- `setText` / `setFontSize` / `setColor` 各加槽位缓存数组，值未变则跳过

### 效果

| 条件 | 优化前 p50 | 优化后 p50 | 降幅 |
|---|---|---|---|
| 6x 降速 + 160 敌人聚集 | 4.90ms | **1.00ms** | **-80%** |
| 1x（桌面原生） | 0.40ms | 0.20ms | -50% |

**遗留**：p95 仍约 9ms，尖峰疑似来自 GC 与纹理批次切换，本次未处理。

### 验收

- parity 26 项原样通过；Vitest **389** 项、浏览器 **16/16**（含 `visual.spec.ts` 的 HUD 字体尺寸断言）
- 截图确认 HUD 与伤害飘字渲染正常（`output/perf-texts.png`）
- **未触碰**敌人上限、配额曲线、生成速率——这是渲染问题，不是平衡问题
- 真机复测待用户确认（本次数据来自桌面降速模拟，非实机）

## D-31 Combat Foundation S4-C 第三批（C3-C）：等级属性权威迁移 + 全量运行状态保护 + 上限协调（2026-10-26）

依据任务书「C3-C 最终批实施任务」与契约 `docs/pixel-rogue-S4C-C3-contract-v1.md`（v1.2），分支 `feat/combat-foundation-s4c-c3c-runtime`（基线 3b0e198 = 上游 PR #105 C3-B 合并提交）。**编号顺延说明**：本批初版在 C3-B（`3b0e198`）上实施时，上游已用 v33/D-29 落地 PR #108（天赋刷新按钮 #107），故顺延为 v34/D-30；交付期间上游 PR #109（性能 #106）合并并以 v34/D-30 落地，本批据此再顺延为 **v35/D-31**，不重复编号。当前同步基线 `6e58c96`（PR #109 合并提交，含 #108/#109）——上游性能优化仅触及 `PixelPainter.ts` 渲染缓存与两份 Changelog/migration 文档，与本批代码文件无重叠，三处文档冲突按「上游 D-29/D-30 在前、本批 D-31 在后」解决。**只实施 C3-C，完成即停止。** 已批准差异：D-C3-03（狂热不因重算重触发/降级夹紧/末级清除）、D-C3-04 完整部分（剩余 RuntimeState 全量保护）、D-C3-06（冲刺充能/剩余冷却/进行中冲刺保留）；D-C3-01/02/05 生命、护盾与 HP 语义保持不变。C3-0 冻结的混合天赋阶段至此实施完毕（S4-D 敌人侧/负区因子政策不在本批范围）。

### 实施范围与权威来源切换

- **七个等级属性字段来源映射（六张卡）**：击杀狂热 → hasteLv flat +1/级；疾影步 → dashLv flat +1/级 **且** dashMax 有序 flat −0.4/级（每级一条独立修饰符，base 2.4 起始逐次累加，逐位复现旧 f 序列 2.0/1.6/**1.2000000000000002**——B10/B16/G-16 三重钉子；**禁止折叠式** 2.4−0.4×lv）；二段冲刺 → dashChargeLv flat +1/级；壁垒 → barrierLv flat +1/级；不屈 → nd flat +1（max=1，保持数字 0/1 与旧 f `p.nd = 1` 形状）；战意沸腾 → rageLv flat +1/级。StatModel 白名单新增 hasteLv/dashLv/dashMax/dashChargeLv/barrierLv/nd/rageLv 七个 StatId；投影必写回七个既有 Player 字段（无来源写回 statBase 基础值：dashMax=2.4 未解锁占位、其余 0）。
- **六卡 Talent.f 改空操作**；两张生命卡、能量护盾已迁移实现不变；「星辰坠落」的 meteor 等未迁移卡保持 f 重放。
- **击杀狂热获得时效果（OnAcquireEffects 登记）**：lvBefore===0（upCounts 递增前捕获的首级判定）→ `haste=1, hasteT=3`（与旧 f 条件分支逐字一致）；lvBefore>0 → 不改变当前 Buff（B7 语义）；max 校验失败在校验处早退零副作用；recompute 绝不调用。
- **RuntimeStateProtection 全量 15 字段**：C3-B 的 shield/shieldCd 基础上追加 haste/hasteT/rageT/dashT/dashCharges/dashRe/meteorT/tempShield/ndUsed/orbA/hurtCd/dx/dy。快照接口**逐字段显式声明真实类型**（ndUsed 为 boolean，其余 number，无 any/统一强转）——C3-B 的 Partial<Record> 联合键循环在混合类型下无法类型安全地回写（写入目标为各属性类型交集），改为显式枚举：新增字段漂移由 typecheck 咬住。快照为模块局部对象、不写 Player、无全局缓存；hp 不入白名单（D-C3-05 夹紧承接）；fireCd 天然幸存不保护。
- **EffectiveCaps 三面**：shieldMax（沿用 C3-B）、dashChargeMax = 1 + dashChargeLv（与 PlayerSystem 消费点同式）、hasteCap = **hasteLv > 0 ? 3 + hasteLv : 0**（零级哨兵——复用 data/talents.ts 既有 hasteCap 导出；不得把 hasteCap(0)=3 当作未学习的有效上限，哨兵 0 使 reconcile 两分支互斥完备）。
- **reconcileRuntimeToCaps 规则**：护盾容量下降 → `shield = min(shield, 新容量)`（升高/不变无操作）；狂热——部分降级（after cap > 0 且 < before）→ `haste = min(haste, 新 cap)`、**hasteT 不刷新**，末级移除（after cap === 0 且 before > 0）→ 清空 haste/hasteT，等级不变/升高原样保持（含已过期 Buff）；冲刺——充能上限下降 → `dashCharges = min(dashCharges, 新上限)`，不补回已消耗、dashRe 不按 dashMax 缩放、dashT 不中断。rageT/meteorT/tempShield/ndUsed/orbA/hurtCd/dx/dy 只快照恢复，无任何清零/刷新/奖励行为。
- **recompute 编排保持 10 步**（C3-B 结构，捕获/快照在 Object.assign 前、恢复/协调在投影后、HP 夹紧逐字保留）；learnTalent 时序不变；melt 材料删除/抽池/恰好 1 次随机/recompute→learnTalent 时序不变；startNextWave 显式重置面不变（potionGrow=0、tempShield=barrierLv 重建、ndUsed=false、potionMaxHpGrow 保留、其余运行状态不动）。

### 修复前后对照（D-C3-03/04/06 / R-3/R-4 反转）

| 场景 | 修复前（基线 3b0e198） | 修复后（本批） |
|---|---|---|
| 狂热 Buff 过期 → recompute | 重放 f 首级分支 → Buff 重触发（R-3） | 过期态保持；hasteLv 按 picks 重建（G-10） |
| 狂热 Lv.2→1（防御性构造）→ recompute | 重放 hasteLv=1 且首级分支重放 | haste 5→4 夹紧至新 cap、hasteT 不刷新（G-12）；Lv→0 清空（G-13） |
| dashCharges=0/dashRe=0.8/dashT=-0.3 → recompute | 重置 1/0/-1（补满清零） | 三值原样保留（G-15/R-4） |
| 熔掉二段冲刺（charges=2） | dashCharges 重置 1 | 上限夹紧 min(2,1)=1、dashRe 保留（G-17） |
| dashT=0.1 冲刺中 → recompute | dashT 重置 -1，位移截断 | 原样保留、冲刺自然完成（G-18） |
| ndUsed=true → recompute | 重置 false（同波二次免死） | 保留 true，同波只能免死一次（真实 damagePlayer 验证） |
| meteorT=0.5 / tempShield=1 / orbA/hurtCd/dx/dy 非默认 → recompute | 全部被 statBase 覆盖（R-4） | 逐字段保留；tempShield 仅换波按 barrierLv 重建 |

学习路径数值与旧 f 逐位一致（legacyLevels 三顺序对照含 dashMax 浮点序列 + B7~B11 + parity learnTalent 对照）；重放路径自本批起不再触发狂热 Buff/不再覆盖运行状态（旧行为为重放触发 + statBase 重置，D-C3-03/04/06 批准差异）。

### 测试与验证

- **反转**：R-3（狂热不重触发，含 hasteLv 属性面断言）、R-4（六字段保留，含 dashLv/dashMax 重建对照）——旧行为注释与批准编号留痕；R-1/R-2/R-5 不变。
- **保持通过**：B7~B11/B14/B16 断言不变（B7 注释更新为两入口行为一致、B15 断言值不变注释更新为保留语义）；C3-A/C3-B 全部 29 项通过；C1/C2-A/C2-B 的 RuntimeState 隔离测试继续通过（成为变异⑪ 检测面）。
- **新增** `tests/s4c-c3c-runtime.test.ts` 22 项：G-10~G-22 全部落地（G-12/G-13 防御性路径以 picks/upCounts 一致构造 + 真实 recompute，文件头注明可达性边界；G-18 测试态构造说明；G-17/G-19 真实置换链路）+ 额外重点 7 项（不屈致死单次、tempShield 消耗后重算不补/换波重建、meteorT 在途保留、攻速 Buff 与疾速扳机乘区互不污染、六卡满级失败零副作用、真实宝箱 chooseSlot 链路、未迁移卡 f 重放不变）+ legacyLevels 三顺序对照与六卡 f 空操作结构钉子。
- **Parity 26 项原样通过**：六卡加入 `S4C_AUTHORITY_MIGRATED`（击杀狂热本就在 BASELINE_EXCLUDED——Issue #1 攻速分叉，v8 对照原被跳过、由 D-01 公式断言保护，加入清单仅为登记一致；不屈 nd 数字形状与 v8 f 一致；dashMax 逐位由 B10/B16/G-16 咬住），全部走真实 learnTalent 对照，不排除、不删减、不放宽。
- `npm test` **411/411**（C3-B 合并后上游基线 389 + 本批 22）；`npm run typecheck`、`npm run build` 通过；`npm run test:browser` **16/16**。游戏内显示已验证（一次性 Playwright 手动脚本，用后即删）：学习疾影步/击杀狂热/壁垒/不屈后——属性面板攻速行「2.64/秒（狂热 +20%）」、冲刺行「充能 1/1 · 冷却 2.0s」、壁垒行「每波 1 层临时盾」、不屈行、已学天赋四卡等级；世界内冲刺充能菱形格（Issue #51）随充能恢复显示（截图 output/playwright/c3c-stats-panel.png、c3c-dash-diamond.png，output/ 不入库）。

### 变异验证（12 组，全部被咬住后逐组还原；红数为 411 基线下的全量失败数）

| # | 变异 | 红数 | 检测面 |
|---|---|---|---|
| ① | 删除击杀狂热 hasteLv 来源 | 12 | D-01 公式、B7/B8/B15、G-10~G-13/G-21、攻速污染、legacy、R-3 |
| ② | 恢复击杀狂热旧 f Buff 写入 | **1（恰为结构钉子）** | 行为面被「绝对投影 + 同值 OnAcquire」掩盖（C2-A 变异⑤/C3-A 变异⑤先例复现）；recompute 侧重放由 G-10 咬住 |
| ③ | 去掉 lvBefore===0 判定 | 2 | B7、G-11 |
| ④ | hasteCap 零级哨兵改 3 | 1 | G-13（末级走夹紧分支而非清除） |
| ⑤ | 删除部分降级夹紧 | 1 | G-12 |
| ⑥ | 删除末级 Buff 清零 | 1 | G-13 |
| ⑦ | dashMax 改折叠公式 | 6 | B10/B16/G-16/G-21/宝箱/legacy——逐位浮点钉子 |
| ⑧ | 去掉 dashCharges 夹紧 | 1 | G-17 |
| ⑨ | 去掉 dashT/dashRe 恢复 | 6 | G-15~G-18/G-21/R-4 |
| ⑩ | 去掉 tempShield/ndUsed/meteorT 恢复 | 4 | G-21、不屈单次免死、meteorT、R-4 |
| ⑪ | rageT 误入属性投影 | 6 | C1/C2-A/C2-B RuntimeState 隔离测试 + parity 3 项（recompute 路径被快照恢复掩盖，检测面在学习路径——学习路径无恢复步骤） |
| ⑫ | OnAcquire 时机提前到投影前 | 16 | B1/B3/B12/B15、G-1/G-4、legacyLife、C3-A 交错/宝箱、parity 4 项——泉回满依赖新 maxhp 的时序约束 |

### 遗留问题与下一步

- C3 混合天赋批次（C3-A/B/C）全部完成；契约冻结的六项已批准差异全部落地。未迁移卡（multishot/pierce/orbit/regen/luck/chain/explode/thorns/lifesteal/dodge/burn 等）全部为可由 picks 重建的纯属性，按 C0 审计维持 f 重放，无运行状态混入。
- 宝箱模式键盘 1/2/3 快捷键缺陷（C2-A 发现）未修（历批任务书明示不夹带）。
- S4-D（怪物侧 StatModel 迁移、负区因子政策、RuntimeState 大规模重写）未开始，不在本批授权范围；本批的 RuntimeStateProtection 白名单机制为其提供骨架。

## D-32 Issue #112：路径特效绘制合并（2026-10-27）

### 现象（用户真机第 3 次反馈，描述非常精确）

第 10 波后，**屏幕内本来怪物就多时，攻击触发新特效的那一瞬间会掉帧**；样本是闪电链与陨石；
**后期攻速快、闪电链反复触发时会变成连续卡顿**。

「瞬间掉帧 + 反复触发即连续卡」这个组合排除了两个常见猜测：
**对象池扩容**（只会卡第一次）与 **GC**（周期性且与触发时机无关），指向「每次生成特效都要付的固定开销」。

### 测量方法演进（含一个必须记住的坑）

第一版脚本每帧重建 40 个 bolt 对象（`bolts.push({...})`）来维持数量，结果 max 波动极大（8.9 / 36 / 52ms），
**这是脚本自己在制造 GC**，数据不可信。

**正确做法：预分配对象池，每帧只切片与重置字段，杜绝测量期间的分配。**
同理，`meteors` 的 `t` 会自然衰减，若用 `length = n` 赋值会把元素变成 `undefined`，
而 `t` 衰减到负数会让半径变负、Phaser 的 arc 走向异常路径（实测单帧 3000ms+），**那一组数据整体作废**。

### 实测数据（160 敌人、6x CPU 降速、预分配无污染）

| 场景 | p50 | p95 | 判定 |
|---|---|---|---|
| 无特效 | 2.70 | 4.90 | 基准 |
| 闪电链 ×40（修复前） | 2.80 | **17.20** | 超出 16.7ms 预算 |
| 闪电链 ×120（修复前） | 2.90 | 14.80 | 同上 |
| 闪电链 ×40（修复后） | 1.70 | **9.30** | -46% |
| 闪电链 ×120（修复后） | 1.70 | 10.80 | — |
| 陨石 ×20/×60（修复后） | 1.80/1.60 | 13.90/11.30 | 原数据作废，无对比基线 |

**关键特征：p50 几乎不动，p95 翻倍。** 说明不是平均负载问题，而是少数帧被批次打断。
这也解释了为什么体感是「一瞬间」而不是「整体降速」。

### 根因

`draw.ts` 里每个特效各自走完整的 Path 生命周期：

```ts
ctx.beginPath();   // → lineStyle() + beginPath()
ctx.moveTo(...); ctx.lineTo(...);
ctx.stroke();      // → strokePath()
```

而 Phaser 的 Graphics 与 Image 走不同的渲染路径，**每次 strokePath 都要把此前累积的 Image 批次 flush 掉**。
160 个敌人已在批次里，插一条链就要 flush 一次；40 条链 = 40 次打断。

### 修复

新增两个批量方法（`PixelPainter`）：

- `polyline3(pts, color, alpha)`：所有闪电链合并为一次 `lineStyle` + `beginPath` + 多次 `moveTo/lineTo` + **一次** `strokePath`
- `meteorRing(pts, color, alpha)`：所有陨石的圆环与十字合并，同样只 stroke 一次。
  `arc` 前必须 `moveTo(x + r, y)` 断开子路径，否则会从上一条线的终点连线过来

顺带把闪电链的抖动从 `Math.random()` 改为确定性相位 `sin(time * 37 + seed)`，符合项目「表现层禁用随机」的约定。

**为什么用单批而不是按亮度分 3 档**：实测 3 个桶（对应 3 个 Graphics 对象）时 p95 为 13.3ms，
合并成 1 个桶后降到 8.1ms——**每个额外的 Graphics 对象都是一次独立的渲染 pass**。
链寿命仅 0.15s，统一不透明度与原渐隐在视觉上分辨不出。

### 验收

- parity 26 项原样通过；Vitest **389** 项、浏览器 **16/16**（含 HUD 字体尺寸断言）
- 截图核对闪电链与陨石外观与原实现一致（`output/fx-after.png`）
- **遗留**：max 仍有偶发 12~38ms 尖峰，量级小于修复前，推测与 GC 相关，本次未处理
- 真机复测待用户确认

## D-33 Combat Foundation S4-D 第一批（D1）：敌人防御属性权威迁移（2026-10-27）

依据 D0 冻结契约 `docs/pixel-rogue-S4D-D0-contract-v1.md`（v1.0），基线为上游 PR #111 合并提交 `0470f59618989c701019ff5fb34bdee0f35920ce`，分支 `feat/combat-foundation-s4d-d1-defense`。本批只切换敌人防御来源权威，不调整战斗平衡；D2/D3 尚未开始。

### 实施范围与调用链

- 调用链：`EnemyConfig → EnemyStatSources → StatModel → Enemy → CombatStatsSnapshot`。`enemyDefenseSheet(cfg)` 与 `resolveEnemyDefense(cfg)` 提供纯来源解析接口；`spawnEnemy()` 每次生成只解析一次，快照和伤害路径继续从实体读取。
- 仅迁移 `defense`、`resistances`、`tough`。配置未声明的可选字段仍不写入实体；已声明的抗性映射独立浅拷贝。`getEnemyCombatStats()` 签名、默认值和快照语义不变。
- 五个 D1 文件：新增 `src/game/core/EnemyStatSources.ts` 与 `src/game/core/StatKeyedMap.ts`；修改 `src/game/core/EnemySystem.ts`、`src/game/core/StatSheets.ts`；新增 `tests/s4d-d1-enemy-defense.test.ts`。`StatSheets` 保留原 `resolveKeyedMap` 导出，四类攻击侧映射未迁移。
- `StatKeyedMap` 承载通用逐 key 解析，抗性继续使用 `resistance` 类型化族，不硬编码 fire/lightning。属性解析不进入每帧更新、碰撞或伤害结算。

### Q1/Q2 边界与行为保持

- **Q1**：负 `defense`、`tough` 或任意抗性由 StatModel 路径抛 `RangeError`。第一轮独立复审发现显式 `fire: undefined` 会被通用 `resolveKeyedMap` 的 `?? 0` 变为 `fire: 0`，使 JSON 从 `{}` 变成 `{"fire":0}`；修复在 `EnemyStatSources` 权威边界先检查抗性值，`undefined`、`null`、NaN、Infinity 等非法值抛 `TypeError`，不改变通用映射解析器既有行为。有效 `0` 保留为显式键和值。
- **Q2**：合法 `resistance > 0.75` 与 `tough > 0.6` 在来源层不裁剪；原上限仍只由 `DamageSystem` 消费点应用。
- 验收覆盖五类敌人与精英形态、可选字段键集合、配置/实体/快照映射隔离、普通/物理/火/雷/真实伤害、临时 `tough=0.2` 的物理 100→80 与真实 100→100，以及强制/自然抽取 RNG 次数。精英防御值不变；brute 物理 11→7、shooter 雷伤 10→7、bomber 火伤 10→6。
- 生成 RNG 次数保持强制类型首试/五次重试 4/8 次，自然抽取首试/一次重试/五次重试 5/6/9 次；精英倍率、伤害快照时机、受伤 HP 与原版 Parity 均未改变。

### 独立复审与验证

- 第一轮独立复审发现显式 undefined 抗性归零和真实生成入口负值拒绝覆盖不足；以上已在来源边界和真实 `spawnEnemy()` 测试中修复。第二轮独立复审结论：P1=0、P2=0。
- 新增 D1 测试 21 项；全量 Vitest **432/432**，Parity **26/26**，Typecheck 与 Build 通过，Playwright **16/16**（第一轮独立复审运行）。构建有 Vite chunk 大于 500 KB 提醒，不影响构建成功。
- D1 已完成并等待最终交付复审；**D2 与 D3 尚未开始**。
- 敌人侧无属性重算入口，D1 不引入 RuntimeStateProtection 快照/恢复机制；D3 仅进行运行状态边界与不变项验收，不照搬玩家侧重算保护骨架。

## D-34 Combat Foundation S4-D2-A：敌人生成属性权威迁移（2026-10-27）

依据 `docs/pixel-rogue-S4D-D0-contract-v1.md` FROZEN v1.0，D1 已由 PR #114 合并；本批基线为上游 `2cd1a51572dfbbdebf44b6ea00fdf020da2c17b9`。D2-0 接口审计和设计复审见 `docs/pixel-rogue-S4D-D2-interface-review.md`。

### 权威来源与不变项

- `EnemyConfig → EnemyStatSources.resolveEnemySpawnStats → StatModel.resolveStats → spawnEnemy → Enemy`：每次生成一次解析 `maxHp`、`attack`、`moveSpeed`；当前 HP 只在新实体生成时初始化，不因其他生成或属性解析恢复受伤值，不新增每帧解析。
- 保持 IEEE-754 左结合：HP 的 final 为 `[hpScale, lvlPow, elite?8:1]`；攻击为 `[dmgScale, elite?1.5:1]`；速度为 `[elite?0.8:1, speedJitter]`。不合并倍率、不改 percent，`lvlPow` 只作用于 HP。wave 3、等级 10 精英 brute HP 为 `750.2684799999998`，预组合反例为 `750.26848`。
- `spawnEnemy` 在位置抽样后按原顺序抽取 jitter 并传给纯解析器；自然类型抽取、位置尝试、jitter、seed、shootCd 的 RNG 次数和序列不变。首试强制/自然分别 4/5 次，自然一次重试 6 次，五次位置尝试强制/自然分别 8/9 次。
- D1 防御属性、实体可选键形状、四类攻击增伤的原有条件展开、`r`/`xp` 原式不变；射手发射和自爆引爆快照、接触伤害实时读取的时机不变。

### 验收与批准边界

- D0 §8.3 D2-01～28 及子项验收通过：`tests/s4d-d2a-enemy-spawn.test.ts` 覆盖生成矩阵、浮点关联、RNG、受伤状态、发射快照和燃烧到期；`tests/s4d-d2a-acceptance.test.ts` 补充等级 1 冻结字面量、真实伤害与运行状态、四层燃烧来源到消费及精英血条绘制。`tests/parity.test.ts` 保持原有 26 项和排除范围；相关既有战斗与近战测试保留。
- 已批准 D2-A 非法生成输入快速失败：负基础属性与不合法 final 抛 `RangeError`，传至 StatModel 的非有限值抛 `TypeError`，合法有限输入计算溢出抛 `RangeError`；例如负无穷等级先变成零倍率，再因 final 不大于零抛 `RangeError`。这是生成期行为与旧算术结果/失败时机的已批准差异；不改变 StatModel 校验，不自动修复或夹紧非法值，也不扩大到 D2-B 政策。
- 最终代码验收时 Vitest **478/478**、Parity **26/26**、Playwright **16/16**、Typecheck 与 Build 通过。构建仍提示 chunk 超过 500 KB。既有 G-18 在一次独立复审全量运行中偶发失败，后续全量与多轮聚焦复跑通过；本批全量通过，原因未确认，作为 P3 观察保留，不宣称已修复。
- D2-B 的四类攻击增伤来源权威迁移、公共键控族扩展与特殊键政策尚未实施，也未获得全部独立授权；不修改 `DamageSystem`，不进入 D2-B/D3。

## D-35 Combat Foundation S4-D2-B：敌人攻击增伤权威迁移（2026-10-27）

上游 PR #115 已合并 D2-A；本批基线为 `d2fa35cc43dce6b9c41cf00627dd61c69a24c7c7`，沿用 D1/D2-A，不重新实现。依据 D0 冻结契约、D2 接口审计及 `docs/pixel-rogue-S4D-D2B-B0-design.md`。D-34 保留 D2-A 当时的历史状态，不代表本批当前状态。

- 实际调用链：`EnemyConfig → EnemyStatSources.resolveEnemyAttackBonuses → StatModel / StatKeyedMap → Enemy → CombatStatsSnapshot → DamageSystem`。StatModel 是生成来源解析权威，DamageSystem 仍负责最终乘区消费与校验；四区独立，global 不预乘 attack，不改公式。
- 正数及 ±0 用 base、负数用 base=0 加有序 flat，-0 保号；-1 合法且消费倍率为零，有限 -1.1 来源解析成功、实际消费时才抛 `RangeError`。配置、实体与快照的映射独立单层拷贝；合法可枚举 Symbol 键保留，自有可枚举 `__proto__` 拒绝。
- 用户批准的差异：非有限、非数字、非法映射容器和非法映射项在生成期抛 `TypeError`，异常类型和时机可与旧展开不同；getter/Proxy 不保证完整副作用兼容。公共 `StatKeyedMap` 用自有键判断修复 modifier-only `constructor`/`toString`，保留公共 nullish → 0；敌人来源单独严格校验。
- 正常配置的 RNG 次数和序列、IEEE754 左结合、实体可选字段形状及射手发射/自爆引爆/接触实时读取的时机均保持；不改变 D1、防御公式、r/xp、玩家 S4-C 或 D0 契约。
- 生产文件：`src/game/core/StatModel.ts`、`StatKeyedMap.ts`、`EnemyStatSources.ts`、`EnemySystem.ts`。测试及配置：`tests/s4d-d2b-enemy-attack.test.ts`、`tests/s4d-d2b-b2-shape.test.ts`、`tests/browser/d2b-acceptance.spec.ts`、`playwright.config.ts`。
- B0 最终复审通过并获用户政策批准；B1 首次复审一项 P2 覆盖缺口，补充真实配置到战斗链路测试后复审通过；B2 独立复审通过。B2 Vitest 518/518、Parity 26/26，用户提供的独立复审记录最终配置 Playwright 一次性 17/17（core-ui 16、production 1），含生产自然首波；证据和可核对边界见 `docs/pixel-rogue-S4D-D2B-B2-acceptance.md`。
- 限制：性能采样缺同环境历史版本基线；浏览器普通 `console.error` 未独立收集，其他浏览器、移动实机及高波自然试玩未全部验证。`DamageSystem` 对缺失的原型同名键读取继承属性是独立后续事项，本批未修复；Vite 主 chunk 超过 500 kB 为既有构建警告。
