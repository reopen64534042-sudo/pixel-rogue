# Pixel Rogue Coding Agent Guide

## 项目定位与技术
像素秘境是 PC Web 优先的 2D 像素动作 Roguelike，目标是可静态发布、持续开发的独立游戏。初始迁移原件为 legacy/original.html（v7），当前规则对照基线为 legacy/upstream-v8.html（上游 27565b4）；旧表 39 张通用天赋已于 v165 按用户要求删除（v138 曾删除能量护盾与旧不屈）。采用 TypeScript 6.0.3、Vite 8.3.5、Phaser 4.2.1、Vitest 5、Playwright；无需后端或 React/Vue。Phaser 管理世界、相机、输入和表现，DOM 管理复杂 UI。

## 实际结构
- src/main.ts：入口、缩放和 Phaser 配置。
- src/game/scenes/GameScene.ts：唯一场景及其输入/更新/清理生命周期。
- src/game/core/：GameCore 状态与命令，Simulation 按原顺序调度规则；Player/Combat/Attack/Projectile/Enemy/Wave/Progression/Talent/Swap/Effects 各有实际职责，BossSystem 管理三首巨兽的入场、三阶段、预警招式、危险区与随从（data/boss.ts 配置；每 10 波替代普通/精英）；LaserSystem 管理射手激光照射/回充、焦点与时间预算；MissileSystem 管理导弹装填/制导/扫掠，MissileCombat 经统一管线结算爆破/电弧/余烬。Mage/MageProgression/Element（元素法师 v2：法杖等级 1–12、每 3 次成功施法轮盘、Lv1/3/6 元素、A/B 套装、六反应与棱镜/分影/终章；ElementMath 为纯计算层）随职业池接入，Damage/CombatSystem 构成 Combat Foundation 统一伤害管线（S1 纯计算 + S2 全路径接入），CombatStats 为实体属性适配层（S3-A 接线 + S3-B 方案甲数值），StatModel 为纯属性解析模型（S4-A，未接入运行时），StatSheets 为 S4-B 只读 shadow 构建器（未接入运行时），FixedClock 固定步长。
- src/game/data/：常量、初始属性、射手/法师/战士职业池与通用卡（talents/ 分文件；旧表已于 v165 删除）、元素法师 v2 规则（elementalMage.ts）、首领配置（boss.ts）、敌人配置及伤害类型注册与战斗基准。
- src/game/rendering/：像素纹理、Phaser绘制和对象复用；MonsterAnimation采样17套204帧，MonsterVfx使用MonsterFxRecipes，只读真实enemyVisualEvents及AI阶段。BossAnimation/BossArt/BossVfx/BossGeneratedVfx继续使用原版Boss八姿态和技能图集。动态预览见docs/monster-animation-and-vfx.md。vfx/laser桥接器与播放器由Scene按固定步采集；MissileRenderer只读飞行和引爆，复用PixelPainter深度与对象池。
- src/game/rendering/characters/：职业人物表现；KatanaCharacter / GreatswordCharacter / ShooterCharacter / MageCharacter 由 Scene 只读模拟状态取帧，射手身体与独立瞄准的武器分层、折光剪影复用同套素材，法师接入魔女人物本体；MageVfx 按 Core 的只读 mageVisualEvents 绘制法阵/状态/棱镜/反应爆发，缺失素材回退原程序化表现，不修改战斗状态。
- DomainSystem / data/domain 管理法师独立坍缩领域武器；Simulation 调度，DamageMath 形成分量，CombatSystem 同次应用主爆发/真伤/生命压缩。DomainRenderer / DomainCharacter 只读实际状态；AudioService 缓存领域 WAV 并在暂停/清理时停播，见 docs/domain-weapon-design.md 与 docs/domain-character-art.md。
- 领域保留三场合成，收拢中心锁定并跟随目标（范围内可攻击Boss→捕获目标→最近敌人），仅失效重选、无目标保留最后位置；捕获名单仍独立快照。W/M独立增强场/洞伤害，全域连斩去重，无量真实过载，形成后黑洞按实际位置向怪群巡游。V2四次强化已撤回。
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
- Scene 管理相机、键盘、固定 60 Hz 更新及监听清理；禁止重复 RAF/输入监听。暂停和属性冻结整个模拟，升级/报告仍非暂停。
- 状态覆盖 start/play/levelup/stats/pause/report/swap/over：底部面板与模式并行，以 core.phase 读取。波次 fight→collect→rest；收球和升级未完成不能开下一波；熔炉入口自 v60 关闭（实现保留）。
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
- node scripts/build-laser-vfx-preview.mjs：导出正式激光动画的自包含预览；python scripts/export-laser-vfx-preview.py 可导出 GIF（已有 Python/Pillow，不代表实机验收）。
- node scripts/build-missile-vfx-assets.mjs：从导弹源表导出透明条带、图集、锚点／帧时长与素材检查记录。
- node scripts/build-missile-vfx-preview.mjs：导出导弹完整周期的自包含 HTML 与原速／慢放 GIF；预览为独立素材编排，正式游戏使用相同图集与采样器，见 docs/missile-vfx-assets.md。
- node scripts/build-katana-character-assets.mjs：重建太刀人物 32 帧精灵表与来源 / 锚点检查记录；python scripts/export-katana-character-preview.py 导出离线 GIF（不代表实机验收），见 docs/character-art-upgrade.md。
- node scripts/build-greatsword-character-assets.mjs：重建大剑人物 64 帧精灵表；python scripts/export-greatsword-character-preview.py 导出动作 / 跃击离线 GIF（不代表实机验收），见 docs/greatsword-character-art.md。
- node scripts/build-domain-character-assets.mjs：重建领域师B的64帧身体与独立牌；node scripts/publish-domain-assets.mjs发布领域纹理/字形/56WAV；人物GIF为离线预览。武器Lv.4固定斩击、Lv.5固定无量，其余九项在Lv.2–3/6–12获得；DOMAIN_UNLOCK_LEVELS拥有解锁等级。经验仅由黑洞形成爆发实际命中发放，每次黑洞最多1点，普通场和后续伤害不提供；本次黑洞保留结算前快照。
- 领域实际绘制器对照（仅DEV）：`/assets/vfx/domain/live-preview.html`，左连斩/右叠加无量，可慢放/逐帧/导出图与WebM；`python assets/vfx/domain/export-live-preview.py` 转为GIF/MP4。使用正式Core/Phaser/Renderer的受控高生命目标，不写战绩，不作为自然玩法验收。
- node scripts/build-shooter-character-assets.mjs：重建射手身体 / 武器精灵表；python scripts/export-shooter-character-preview.py 导出三武器合成 GIF 与瞄准方向示例，见 docs/shooter-character-art.md。
- node scripts/build-mage-character-assets.mjs：重建 48 帧魔女帽人物；python scripts/export-mage-character-preview.py / scripts/export-mage-walk-preview.py 导出动作和步态对比，见 docs/mage-character-art.md。
- node scripts/build-mage-vfx-assets.mjs：重建 29 帧技能素材；node scripts/build-mage-vfx-preview.mjs 导出离线预览。MageVfx 已在 Scene 接入运行时（v164），加载失败回退程序化表现，见 docs/mage-vfx-runtime.md。
- node scripts/preview-laser-vfx.mjs：旧程序化激光回退的离线预览。
- npm run palette:export：从 src/game/data/palette.ts 导出 assets/palette.gpl（美术产线，改动色板后必跑）。
- node scripts/pixelize.mjs <png> --key <assetKey>：贴图后处理（规格见 docs/art-assets.md 第 7 节）。
- node scripts/build-monster-assets.mjs：Node 24从monsterArt.ts重建17张普通/子体/精英PNG，走pixelize色板/透明/尺寸校验，导出docs/previews/monsters-v167预览；不改Boss图集。
- node scripts/build-monster-animation-assets.mjs：从认可原稿重建17套204帧动作并锁定首帧；node scripts/build-monster-motion-preview.mjs与python scripts/export-monster-motion-preview.py导出23段共享配方的离线动画/VFX预览。运行时由MonsterAnimation按固定步采样，MonsterVfx只读真实释放事件；见docs/monster-animation-and-vfx.md。
**验证标准（2026-10-29 用户裁定，覆盖本节及「验收」中与此冲突的旧要求）**：改动以**编译通过、无报错**（`npm run typecheck` + `npm run build`）为交付线；**默认不运行 Vitest / Playwright，不主动新增/扩展测试或补写基线**，用户点名才做。若改动会使既有测试断言过期，在提交信息与 docs/migration.md 中留痕说明，留待用户授权的测试批次统一处理。

## 验收
核心不可回归：480×270视野、1392×1040世界、18条敌人图鉴（13种普通/特殊怪 + 子体 + 3种精英 + 三首巨兽首领）。非Boss波精英：4/8波各1只岩石巨兽，12–19波增加眼魔为2只，21波起增加祭司为3只；第8波起带词缀。完整自动攻击/伤害/掉落/经验、职业池与通用卡刷新（旧表已于v165删除）、清场→收球→选卡→报告→下一波、死亡和完整重置、最近50战绩兼容。非首领波配额min(150,20+(n-1)×10)，每10波为首领波（配额1、不刷普通怪/精英，详见docs/boss-three-headed-beast.md）；第5波起普通敌人双只生成、精英单独生成；初始经验6、阈值ceil(×1.13)。熔炉入口自v60关闭（core实现与单元测试保留，不再作为可玩验收项）；整局伤害与本波报告分开。
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

### 工程操作纪律（v11 批次事故复盘沉淀，所有会话遵守）
- **跨文件批量修改**：先探测目标文件的换行符（本仓库 CRLF/LF 混存）并对补丁做归一化；含反引号、中文、`!` 的脚本禁用 shell 内联执行，写入临时脚本文件（.cjs/.mjs）再运行，完成后清理。
- **新分支首次提交禁用 `--amend`**——会改写错误的父提交（实例：把他人合并提交改写成自己的）。发现 HEAD 不是自己的提交时立即停手检查。
- **天赋/平衡行为变更**必须同步更新 `tests/parity.test.ts` 基线：排除表 `BASELINE_EXCLUDED`、新卡桩注入（`__stub`）、玩家/敌人新字段注入、按名查找的对齐替换，并留痕"基线更新依据：Issue #N"（先例 D-01~D-05）。
- 伤害公式新增/修改时**只改 `data/combatBalance.ts` 系数或 `core/DamageMath.ts` 纯函数**，调用点通过函数引用保持稳定；不要在系统文件里内联新公式。

## 战斗数值开发资料

- 面向非程序员的交互图解（优先阅读）：`docs/combat-numerics-explained.html`，离线浏览器直接打开，可动态演示属性、伤害、护甲与怪物成长。
- 原始 Markdown 文字版：`docs/combat-numerics-explained.md`（保留供历史参考）。
- 后续 Coding Agent 开发数值、伤害属性、天赋、怪物前必须先读：`docs/combat-numerics-agent-guide.md`（接口、数据所有权、修改入口与已知缺口）。
- 当前迭代按用户要求代码优先；除非另有授权，暂缓新增测试与自行完整验收，统一留待底层完成后进行。

## 文档维护
本文件应简洁、准确、可执行；新增/修改结构和命令后同步。临时报告写 docs/migration.md，不堆入本文件。README 记录运行、操作和静态部署。交付时核对规则、文档、测试和产物一致性。

**更新日志（Issue #55）**：功能 PR 合并进 main 前，须在 `CHANGELOG.md` 顶部与
`src/game/data/changelog.ts` 同步追加条目（版本号递增、最近在前），开始界面版本号随
`CURRENT_VERSION` 自动更新。每条必须按**【加强】【削弱】【调整】【新增】【清理】【修复】【说明】**
分类开头，让加强/削弱与其他改动一目了然。
