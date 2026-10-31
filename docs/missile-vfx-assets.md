# 导弹动画素材包

2026-10-31，用户认可完整素材并授权提交为 `8104856`，随后认可规则并要求正式接入。v141 已将本包用于真实导弹武器：出舱、点火、巡航、物理／离子爆破、蜂群与电弧读取实际模拟事件。离线预览保留为独立素材编排，其弹道和数量不代表游戏平衡。

分支为 `codex/shooter-missile-remake`，工作树为 `E:/AllProjects/pixel-rogue-missile-remake`，基于主线 v140 的 `c3dee30`。没有移植旧 `feat/shooter-weapons` 的武器系统。

## 查看完整动画

双击 `assets/vfx/missile/preview.html`，可断网打开。图集、帧表和播放器均已内嵌；提供播放／暂停、逐步推进、时间轴、1×／2×／3× 显示、1×／0.5×／0.25× 速度，以及六种场景。`public/missile-vfx-preview/index.html` 为相同副本，后续启动项目时可通过 `/missile-vfx-preview/` 查看。

| 文件 | 内容 |
|---|---|
| `full-cycle-1x.gif` | 480×270 游戏像素，重型导弹完整周期，原速 |
| `full-cycle-2x.gif` | 同一周期整数 2× 放大至 960×540，原速不变 |
| `combined-1x.gif` | 480×270，双主弹、小弹与离子连锁组合 |
| `impact-025x.gif` | 命中至消散的四分之一速检查 |
| `scenario-poster.png` | 重型、转向、双联、蜂群、离子与组合六种静态场景 |
| `flight-2x.png` | 原尺寸飞行姿态的整数 2× 检查图 |
| `contact-sheet-2x.png` | 全部正式帧的透明背景 2× 总览 |
| `preview-record.json` | 导出时长、场景、关键时刻与实际绘制指令 |
| `ion-cycle-1x.gif` / `ion-cycle-2x.gif` | v148 离子飞行、连锁、电荷与共振的原速示意，1×／2× |
| `ion-impact-025x.gif` | 离子命中与共振阶段四分之一速检查 |
| `ion-impact-detail-4x.png` | 真实采样器指令绘制的电弧／共振细节，整数 4× 放大 |

原有四份 GIF 均为 84 帧、30fps 时间分配、总长 2.8 秒。慢放文件的采样时间为 `1.14 + frame/120`，以 30fps 播放；其余原速文件为 `frame/30`。GIF 只是导出格式，正式动画按每组可变帧时长采样。

v148 新增的三份离子 GIF 同样为 84 帧、总长 2.8 秒，离子慢放采样 `1.16 + frame/120`。离子示例使用预存电荷的受控素材编排，以展示加层／消耗后的反馈，不能作为实际叠层次数或自然战斗证据。

## 素材和锚点

正式文件位于 `public/assets/vfx/missile/`，每组均为横排 8 帧。坐标单位为原始贴图像素，参考比例为 1px／世界单位；弹体轴朝 +X，尾焰朝 −X。爆炸参考半径为 28px，小爆炸为 12px，调用方通过真实半径缩放表现。

| clip | 每帧画布 | 固定锚点 | 总时长 | 播放 |
|---|---|---|---|---|
| `body` | 32×16 | 16,8 | 0.400s | 刚性硬件，8 槽均复用首帧 |
| `eject` | 32×32 | 16,16 | 0.300s | 出舱烟气，单次 |
| `ignite` | 32×16 | 28,8 | 0.180s | 点火建立，单次，可按真实点火阶段归一化 |
| `exhaust` | 32×16 | 28,8 | 0.320s | 巡航尾焰，循环 |
| `blast` | 64×64 | 32,32 | 0.445s | 物理爆破，单次 |
| `smoke` | 64×64 | 32,32 | 0.550s | 余烟，命中后延迟 0.10s 开始 |
| `debris` | 32×32 | 16,16 | 0.380s | 碎屑，命中后延迟 0.03s 开始 |
| `ion-blast` | 64×64 | 32,32 | 0.445s | 离子爆破，单次 |
| `micro-body` | 16×12 | 8,6 | 0.400s | 微型硬件，8 槽均复用首帧 |
| `micro-blast` | 32×32 | 16,16 | 0.335s | 小爆炸，单次 |
| `arc` | 32×16 | 0,8 | 0.150s | 电弧连接材质，单次 |
| `ion-exhaust` | 32×16 | 28,8 | 0.320s | 青白巡航尾焰，循环 |

共 96 个帧槽位；刚性弹体有意复用，不代表 96 张互不相同的金属形态。爆心前三帧共 80ms，后续迅速退出白热核心，打开中心并消散为碎火；烟尘使用低透明度绘制，不用黑色实心圆遮挡敌人。尾焰与弹体分别绘制，硬件不随推进器呼吸而变形。

`missile.atlas.png` 为 544×816，`missile.atlas.json` 使用标准未裁剪 Phaser atlas 结构。`missile.metadata.json` 包含完整帧矩形、共享锚点、逐帧时长、可见包围盒、源图哈希与处理参数。真实可见尺寸以 `visibleBounds` 为准，不能把 32×16 弹体画布当作碰撞体。

## 来源与处理

采用内置 Imagegen，不使用 API CLI。用户认可的种子为 `missile-seed-v2.png`；源图 `source-master.png` 使用 8×8 网格，`source-companion.png` 使用 8×4 网格。模型实际返回尺寸分别为 1254×1254 和 1774×887，按完整图像尺寸划分均匀网格，不能假定返回了提示词要求的 1024 像素。工具未返回模型名或随机 seed，记录为 null。

提示词分别保存在 `generation-prompt.txt` 与 `companion-prompt.txt`。前两次造型提示词和候选图也保留在本目录，第一稿仅为迭代参照。`source-record.json` 记录源图、提示词、用户认可的造型和每组共享变换；`SHA256SUMS.txt` 包含正式 PNG／JSON 与主要源文件的 SHA-256。

后处理复用仓库 PNG 编解码器和统一色板：每组从同一个 64×64 采样网格与组内 union 包络计算一次共同变换，逐帧不裁边、不改比例、不重新居中。alpha 以 208 阈值规范为 0／255，颜色映射至 `palette.ts` 的已登记 RGB。本次为灰色装甲新增 `steelLight`、`steelMid`、`steelDark` 三档，统一色板从 26 色变为 29 色，原有颜色没有修改；已重新导出 `assets/palette.gpl`。

两组硬件锁定源首帧，消除金属变形。源图点火早期火星没有稳定喷口，因此正式 `ignite` 使用末态火焰的固定锚点逐步向后展开，保持喷口位置不变；没有按每帧边界强行移位。巡航尾焰采用 `[0,1,2,3,4,3,2,1]` 源帧顺序，缓和循环边界。以上处理都可从脚本重建。

## 播放接口

- `MissileVfxPlayer.ts`：纯采样与绘制指令；输入实际飞行姿态、历史轨迹、出舱、引爆和电弧的年龄与端点，不修改玩法状态，不消费战斗 RNG，不建立 RAF 或计时器。
- `MissileVfxCanvas.ts`：离线 HTML 的 Canvas 后端，使用同一帧表与图集。
- `MissileVfxPhaser.ts`：正式 GameScene 调用 `preloadMissileVfx()`；独立使用时仍可选择池化 `PhaserMissileVfxView`。
- `MissileVfxBridge.ts` 与 `MissileVfxPainter.ts`：从 GameCore 只读采集真实姿态／事件，由 PixelPainter 复用正式世界的深度、相机与对象池，不额外建立 Phaser 动画计时器。
- `MissileVfxDemo.ts`：六种确定性素材编排，供离线预览；不含碰撞、索敌、伤害或真实天赋。
- `missileAssets.ts`：由素材脚本生成的类型、帧表与喷口几何，不能手工维护。

正式接线为 Scene preload → Core 固定步推进 → `MissileRenderer` 采集快照 → `missileVfxCommands` → PixelPainter。动画读取模拟年龄，暂停与属性冻结时静止；普通波末清除玩法对象后，保留已触发短余波播完。原 `SpecialSystem` 的历史预留导弹仍独立，新系统没有同时推进旧对象。生成脚本额外从固定可见包围盒导出 `data/missileGeometry.ts` 的弹头偏移，Core 使用纯数据，不依赖 Phaser 或渲染器。

## v148 离子表现

- `IonVfx.ts` 在现有 PNG 上组合电流轮廓、折线白芯、目标火花、分段电荷环和独立共振双环；均是模拟时间驱动的绘制指令，Canvas／Phaser／PixelPainter 共用，不增加 RAF 或表现 RNG。
- `data/missileVfx.ts` 单独管理纯表现时长：电弧保留 0.34 秒，接力亮层延后 0.025 秒显现；主命中电痕 0.30 秒，共振形态 0.46 秒，新增电荷提亮 0.16 秒。原 `arc` PNG 的 0.15 秒条带在前段提供材质，后段是逐渐消退的连线余光。
- Core 只为实际共振事件添加种类标记、为接力弧添加层级标记，并延长电弧事件的可见寿命。连线始终连接实际结算端点；命中火花立即显示，亮点移动与接力层次仅属余波表现，不延迟伤害。
- 电荷环读取实际目标、层数和刷新时刻，环的提亮在模拟暂停时冻结。共振消耗后的层数继续显示真实剩余值，三向闪电来自独立共振事件；主爆破与共振使用各自真实半径。
- 已认可的源图、条带、图集、伤害／射程／次数／冷却参数保持原值。离子爆炸减少额外暖色碎火和灰烟，避免电弧被主火团盖住；不增加全屏闪白或镜头震动。

## 重建与验证

在本工作树中执行：

~~~powershell
npm run palette:export
node scripts/build-missile-vfx-assets.mjs
node scripts/build-missile-vfx-preview.mjs
npm run typecheck
npm run build
~~~

Node 与依赖复用主目录；本工作树 `node_modules` 为目录联接，无新增依赖或安装。素材导出验证固定帧、非空内容、透明背景、二值 alpha、色板 RGB 和哈希；离线 GIF 已使用现有 Pillow 逐帧解码，四份各 84 帧、2800ms，1× 为 480×270，2× 为 960×540。已检查正式帧总览、飞行姿态与六场景静态图。

内置浏览器不允许打开本地 `file://`，因此 HTML 播放、暂停、时间轴与下拉场景的交互尚未在浏览器中验收；没有使用其他浏览器表面或临时服务器绕过限制。用户可在本机正常双击 HTML 查看。本轮不运行 Vitest／Playwright、不新增测试、不改 parity 基线；素材脚本同时检查内嵌模块语法和模板占位符，静态检查不能代替浏览器交互验收。

构建与素材检查不代表 Phaser 实机播放、自然战斗强度、后期遮挡或性能验收。当前已正式接入，武器、升级、专属天赋与受控 Core 运行记录见 [导弹武器规则](shooter-missile-remake.md)。
