# 大剑人物美术：C 佣兵与动作接入

日期：2026-11-01。分支：`codex/greatsword-character-art`。独立工作树：`E:\AllProjects\pixel-rogue-greatsword-character`。基线：最新上游 `7305711`（v153，包含已合并的太刀人物与等级成长）。

## 本轮交付

用户同意先做大剑并明确选择 C 肩扛大剑佣兵。已完成左右两向、待机 / 跑动 / 普攻 / 冲刺 / 重斩 / 起跳 / 空中 / 落地八组动作，共 64 帧，并接入大剑人物；保留非对称钢甲、胡茬、短暗红披风与双手肩扛大剑。

共用方向为钢灰护甲、暗红短披风、宽刃大剑。头身比、像素块与镜头参考已认可的太刀角色；人物主体高度延续约 24 像素档，重量感来自肩宽、护甲、双手握持和重心，不依靠放大人物。

| 候选 | 原图 | 特征与取舍 |
| --- | --- | --- |
| A 露面铁卫 | [原图](../assets/characters/greatsword/concepts/greatsword-a-iron-guard-source.png) | 短棕发、露面、成套胸肩甲、低位持剑；冒险者气质更亲近，正式种子帧需明确双手握在同一剑柄上 |
| B 覆面重甲骑士 | [原图](../assets/characters/greatsword/concepts/greatsword-b-visored-knight-source.png) | 封闭头盔、简洁眼缝、宽肩甲与暗红披风，保留为备选 |
| C 肩扛大剑佣兵（已选） | [原图](../assets/characters/greatsword/concepts/greatsword-c-heavy-mercenary-source.png) | 短发胡茬、非对称肩甲、肩扛宽刃大剑；已用于正式角色与动作 |

三张均由内置 imagegen 分别生成。完整提示词：[A](../assets/characters/greatsword/concepts/greatsword-a-iron-guard-prompt.txt)、[B](../assets/characters/greatsword/concepts/greatsword-b-visored-knight-prompt.txt)、[C](../assets/characters/greatsword/concepts/greatsword-c-heavy-mercenary-prompt.txt)。尺寸、alpha 统计与 SHA-256 见 [generation.json](../assets/characters/greatsword/concepts/generation.json)。工具未提供模型版本 / seed，不宣称可逐像素复现。

## 正式种子帧要求

三张候选是高分辨率参考，没有直接入游戏。选定 C 后先重制低细节种子，再修正原尺寸下不清楚的眼睛；左右两向分别生成基础 / 技能整表，未逐帧独立生成或在运行时镜像。

正式图为 `public/assets/characters/greatsword-mercenary-96x96.png`，384×1536，4 列 × 16 行。前 8 行向右、后 8 行向左，每组依次为 idle / run / attack / dash / heavy / takeoff / air / land，每行 4 帧。96×96 是用于完整保留长剑与下劈的透明画布，可见人物主体约 24px 高；靴底锚点 `(48,83)` 对应逻辑 `(x,y+5)`。

原始整表有行列偏移及横向范围重叠，处理脚本先按行间透明间隔分组，再用 8 邻域独立轮廓隔离每个人物，避免邻帧剑刃混入。全表共享采样尺度，采用预乘 alpha 面积采样、现有色板 Lab 最近色、二值 alpha，以及包含钢靴尖 / 描边的靴底定位；拒绝空帧、裁断或大块断开的肢体，不逐帧自动缩放或按剑尖居中。正式种子取同一结果中的 right-idle-0。

重建与预览：

```powershell
node scripts/build-greatsword-character-assets.mjs
python scripts/export-greatsword-character-preview.py
```

生成数据见 [asset-record.json](../assets/characters/greatsword/asset-record.json)，包括源图 / 结果哈希、每帧色数、轮廓区域、锚点与裁边检查。完整提示词：[种子](../assets/characters/greatsword/greatsword-c-seed-prompt.txt)、[脸部修正](../assets/characters/greatsword/greatsword-c-seed-v2-prompt.txt)、[右向基础](../assets/characters/greatsword/greatsword-c-right-base-prompt.txt)、[收刀修正](../assets/characters/greatsword/greatsword-c-right-base-fix-prompt.txt)、[左向基础](../assets/characters/greatsword/greatsword-c-left-base-prompt.txt)、[右向技能](../assets/characters/greatsword/greatsword-c-right-skills-prompt.txt)、[左向技能](../assets/characters/greatsword/greatsword-c-left-skills-prompt.txt)。

正式资产遵守的要求：

- 胸肩甲、头部、双手、靴子与剑刃分区清楚，双手握持关系稳定；覆面方案用眼缝表达朝向，露面方案保留深色眼睛。
- 与太刀保持相近身体高度和脚底落点，肩部更宽、站姿更稳。美术脚底映射到现有逻辑坐标，不移动碰撞中心、攻击原点或资源条。
- 色板从现有 `palette.ts` 取钢灰、暗红、轮廓、皮革与少量金色。概念提示中的颜色只是参考，正式像素以唯一色板为准。
- 帧画布先参照太刀的透明留白方案，再检查扛剑、前伸挥砍和跃击姿态能否完整容纳；全动作保持同一人物尺度，不能逐帧自动缩放或按刀尖包围盒居中。
- 同时检查 1×、整数倍放大和实际战场比例。保留当前太刀造型与动画，避免让两个流派退化为仅换武器。

## 动作与运行状态

`GreatswordCharacter` 保存 Scene 所有的只读表现状态，在固定步后采集实际位移、模拟时间、冲刺、刀光和跃击状态。没有新增 Core 字段、计时器、RAF 或表现 RNG。Scene 人物回调先尝试太刀，再尝试大剑，素材未加载时沿用原图；沿用 PixelPainter 对象池与绘制顺序。

| 动作 | 取帧来源 |
| --- | --- |
| 待机 / 跑动 | 实际位移；3 / 8 帧每秒，撞墙无位移时不原地跑 |
| 普攻 / 重斩 | 附近真实大剑 Slash 的 life / max 与 heavy 标记；按 `[2,2,3,0]` 从切斩开始，不在命中后追加前摇 |
| 冲刺 | 现有 0.16 秒冲刺余时 |
| 起跳 | warriorLeapState.windup 与 WB.leapWindup（当前 0.24 秒） |
| 空中 / 下落 | warriorLeapState.fall 与 WB.leapFall（当前 0.12 秒） |
| 落地 | 实际 impact 刀光余时；当前落地表现窗口 0.32 秒 |

继续使用原有 greatswordLeapPose 的高度 / 透明度和落地预警 / 冲击素材，保持相机、深度、伤害与落地时刻。按事件开始时间保持新旧顺序，避免新的普攻结束后又选回仍存活的旧落地刀光。纯纵向移动保留左右朝向；暂停 / 属性页无模拟步时帧与朝向冻结，换局按 Player 对象和时间重置。未制作独立四向 / 八向、受伤或死亡动作。

本专项只更新人物表现，不调整生命、护甲、伤害、索敌、冷却、冲刺距离、重斩判定、跃击轨迹或天赋。既有大剑刀光、剑气、裂地和落地素材按各自真实事件连接。

## 当前检查与边界

- 已目视检查三版完整人物、主要护甲 / 头部差异以及剑刃是否完整。
- 正式 64 帧均非空、未裁断，alpha 仅 0 / 255、颜色来自现有色板；源图、提示词、透明接触表与检查数据已保存。
- 已导出 64 帧动作片段 GIF 和 54 帧跃击时序 GIF。前者用于逐动作观察，后者读取当前 WB 的起跳 / 下落 / 落地时长；两者均是离线素材展示，不代替真实战斗证据。
- 类型检查、构建、聚焦画面检查结果记于 `docs/migration.md`。不新增 / 修改测试，不运行 Vitest / Playwright，不进行完整玩法验收。
- 开发起点为 7305711（v153）。用户认可本轮成果并授权提交、推送和创建 PR；提交前上游已到 6a46305（含 v154 首领与 v155 生命值显示修正），本批顺延为 v156，并在人物功能分支同步主分支。
- 本批接受范围为大剑人物与动作，聚焦检查不扩展为完整战斗验收。提交、推送及 PR 状态以仓库记录为准，不包含合入 main 的授权。
