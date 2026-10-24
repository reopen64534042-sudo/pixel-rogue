# Pixel Rogue Coding Agent Guide

## 项目定位与技术
像素秘境是 PC Web 优先的 2D 像素动作 Roguelike，目标是可静态发布、持续开发的独立游戏。初始迁移原件为 legacy/original.html（v7），当前规则对照基线为 legacy/upstream-v8.html（上游 27565b4），实际包含 34 种天赋。采用 TypeScript 6.0.3、Vite 8.3.5、Phaser 4.2.1、Vitest 5、Playwright；无需后端或 React/Vue。Phaser 管理世界、相机、输入和表现，DOM 管理复杂 UI。

## 实际结构
- src/main.ts：入口、缩放和 Phaser 配置。
- src/game/scenes/GameScene.ts：唯一场景及其输入/更新/清理生命周期。
- src/game/core/：GameCore 状态与命令，Simulation 按原顺序调度规则；Player/Combat/Attack/Projectile/Enemy/Wave/Progression/Talent/Swap/Effects 各有实际职责，FixedClock 固定步长。
- src/game/data/：常量、初始属性、34 天赋和敌人配置。
- src/game/rendering/：原像素纹理、Phaser 绘制和对象复用。
- src/ui/：DOM 显示及命令适配；src/services/：音频、战绩；src/styles/：样式。
- public/：随产物发布的字体、许可证与第三方说明。
- tests/：规则、原版对照及 browser 冒烟；docs/migration.md：阶段记录。
- legacy/：保护的原版与 M0 脚本快照；scripts/：历史迁移辅助工具，禁止在最终工程上直接重跑覆盖文件。

## 开发约束
先 git status、阅读相关代码，保护用户修改；复用现有模块，不做无关重构、平衡变更或删除机制。禁止 any、吞关键异常、绕过真实逻辑或修改验收目标以通过测试；不引入无必要依赖、不做无关版本升级。Windows 执行前确认 PowerShell/Git Bash/CMD，使用匹配语法、UTF-8 和正确路径引号。

## 游戏系统规范
- 数据配置与运行状态、数值与表现分离；规则输入、输出和状态变化明确。
- Core 不依赖 DOM/Phaser；UI 通过 chooseSlot/refreshSlot/openSwap/setSwapTarget/selectMaterial/melt/startNextWave 等命令修改状态，不直接改内部字段。
- 每个 GameCore 实例拥有一局状态，不增加全局可变状态；模块 type-only 引用避免运行时循环。
- Scene 管理相机、键盘、固定 60 Hz 更新及监听清理；禁止重复 RAF/输入监听。暂停和属性冻结整个模拟，升级/报告/熔炉仍非暂停。
- 状态覆盖 start/play/levelup/stats/pause/report/swap/over：底部面板与模式并行，以 core.phase 读取。波次 fight→collect→rest；收球和升级未完成不能开下一波；每波熔炉一次。
- 天赋/敌人配置集中，不暗改概率、上限、速度、伤害、碰撞、世界范围。原版缺陷的修复必须独立记录复现/期望/差异。
- 战绩键 pixelrogue_records 与旧数组格式兼容；当前是 v1 战绩，不是局内存档。将来调整须提供版本兼容读取，不能覆盖损坏或未知数据。
- e2e 开发控制接口只允许 import.meta.env.DEV && MODE==='e2e'，生产不得暴露。

## 开发与验证命令
环境安装与磁盘位置约定：

- 先只读检查现有工具、版本、实际路径和可用磁盘，优先复用，不擅自迁移或卸载已有环境。
- 新增 Node/Git/编辑器等环境、下载 Playwright 浏览器或改变相关全局配置前，说明所需内容、安装方式及占用位置，询问并确认用户选择的非 C 盘盘符和具体目录。确认前不得安装，不默认落到 C 盘，不自行猜测 D/E 盘。
- 确认范围包括软件、项目、npm 缓存/必要的全局工具目录及浏览器下载目录。用户已经明确批准的位置可复用；普通启动和已批准范围内的依赖安装不重复询问。
- 更改 PATH、持久化环境变量或全局 npm 配置前须说明影响并确认。
- 安装器有固定 C 盘组件/配置/临时文件时，说明限制与替代方案，等用户决定；不承诺完全不写 C 盘，不静默回退默认目录。安装后核对实际路径。
- 自定义 Playwright 下载位置时，安装与运行均须使用同一 PLAYWRIGHT_BROWSERS_PATH。

推荐 Node 24 LTS / npm 11（最低 Node 22.12）：
- npm ci：锁定安装。
- npm run dev：127.0.0.1:5173 开发。
- npm test：Vitest 规则及原版对照。
- npm run typecheck：严格 TS、未使用声明检查。
- npm run build：类型检查与 dist 构建。
- npm run test:browser：先构建；自动占用 5174/4173，默认系统 Chrome。无 Chrome 时安装 Playwright Chromium 并设置 PLAYWRIGHT_CHANNEL=chromium。
- npm run preview：127.0.0.1:4173 生产预览。
- npm run palette:export：从 src/game/data/palette.ts 导出 assets/palette.gpl（美术产线，改动色板后必跑）。
- node scripts/pixelize.mjs <png> --key <assetKey>：贴图后处理（规格见 docs/art-assets.md 第 7 节）。
通常只运行变更相关的现有检查；除非明确请求测试，不主动新增/扩展测试。本次迁移已明确授权测试。

## 验收
核心不可回归：480×270 视野、1392×1040 世界、5 类敌人及每 4 波精英、完整自动攻击/伤害/掉落/经验、34 天赋及独立刷新、清场→收球→选卡→报告/置换→下一波、死亡和完整重置、最近 50 战绩兼容。v8 波次配额 min(150,20+(n-1)×10)，第 5 波起普通敌人双只生成、精英单独生成；初始经验 6、阈值 ceil(×1.13)。熔炉为同档 2 等级→高一档 1 等级，不能丢卡复制；整局伤害与本波报告分开。
规则改动运行相关 Vitest、类型检查和构建；场景/UI 改动再做浏览器检查及截图，区分受控状态验证、自然生产试玩、截图视觉证据和未验证项。构建成功不能代替玩法验证。

## Git 与文件安全
开发前必须先检查当前分支和工作区，并为任务创建独立功能分支（如 feat/xxx、fix/xxx、docs/xxx），禁止直接在 main 等主分支上开发。若已处于当前任务的功能分支，可继续使用；不得将无关任务混入同一分支。若发现改动已在主分支工作区中，先创建并切换到对应功能分支，保留现有改动后再继续。

所有开发改动必须通过 Pull Request 合并到主分支；完成相关检查和必要审批后，才可按授权合并。不得直接向主分支提交或推送，不得绕过 PR、分支保护或审批。创建功能分支不代表已获准提交、推送、创建 PR 或合并；这些操作仍需相应授权。

不得批量或递归删除；单文件删除先确认精确路径、不是目录且无通配符，只操作明确授权目标。不得擅自删除/覆盖原 Demo；不覆盖用户改动。不自动提交、推送、强推、合并、reset/clean/restore/rebase；需要相应明确授权。若允许提交，按里程碑组织。

## 多会话并行协作（AI 会话/AI+人同时开发）
- 同一工作目录同一时间只允许一个会话执行写操作（编辑/提交/构建产物）；第二个会话介入前先确认对方已提交并推送，或改用独立 worktree。
- 并行开发用独立 worktree：`git worktree add ../pixel-rogue-<task> feat/<task>`，各会话工作区指向各自目录；依赖用目录联接（Junction）复用主目录 node_modules，不重复 npm ci。
- 各分支独立提交推送，合并一律走 PR + 审批。`git add` 时明确指定文件路径，禁止 `git add -A` 把其他会话的未提交改动卷入自己的提交。
- 会话开始时先 `git fetch && git status`：发现他人未提交改动或 stash 时保持原样、不擅自 pop/提交，并向用户报告归属。
- stash 由其所有者（创建它的会话）pop 并解决冲突；共享目录上发生的并发事故应记录到 docs/migration.md。

## 文档维护
本文件应简洁、准确、可执行；新增/修改结构和命令后同步。临时报告写 docs/migration.md，不堆入本文件。README 记录运行、操作和静态部署。交付时核对规则、文档、测试和产物一致性。
