# 射手人物美术：C 机械斥候与三武器分层

日期：2026-11-01。分支：`codex/shooter-character-art`。独立工作树：`E:\AllProjects\pixel-rogue-shooter-character`。基线：最新 upstream/main `4fdeb49`（v156，PR #224 大剑人物已合并）。

## 本轮交付

用户按既定顺序继续射手并明确选择 C。已接入银发、侧置镜片、轻钢背心与能源包的机械斥候：左右两向、待机 / 跑动 / 支撑开火 / 冲刺共 40 帧身体，三套各 4 帧的武器部件共 12 帧，以及同造型激光折光剪影。用户反馈跑步不明显后，跑步单独扩为每向 8 帧。

当前射手使用魔弹（charged）、激光（laser）和导弹（missile）。三种武器共用身体比例、服装与基础移动动作，后续通过发射器部件及持握 / 开火姿态区分。候选图都只展示中性的便携能量发射器，不把某一种武器固定为整个人物身份。

| 候选 | 原图 | 特征与取舍 |
| --- | --- | --- |
| A 兜帽游侠 | [原图](../assets/characters/shooter/concepts/shooter-a-hood-ranger-source.png) | 短深蓝兜帽、青色短披肩、皮革轻装；偏奇幻冒险，需与未来法师长袍 / 帽形区分 |
| B 护目镜炼金枪手 | [原图](../assets/characters/shooter/concepts/shooter-b-alchemy-gunner-source.png) | 棕发、额头护目镜、琥珀色短夹克、能量盒，保留为备选 |
| C 轻装机械斥候（已选） | [原图](../assets/characters/shooter/concepts/shooter-c-mechanical-scout-source.png) | 银灰短发、侧置镜片、轻钢背心、小型能源包，已用于正式人物与武器部件 |

三张均由内置 imagegen 分别生成，使用已认可的太刀 C 参考锁定画风、头身比和镜头，没有复制其服装或武器。完整提示词：[A](../assets/characters/shooter/concepts/shooter-a-hood-ranger-prompt.txt)、[B](../assets/characters/shooter/concepts/shooter-b-alchemy-gunner-prompt.txt)、[C](../assets/characters/shooter/concepts/shooter-c-mechanical-scout-prompt.txt)。尺寸、alpha 统计和 SHA-256 见 [generation.json](../assets/characters/shooter/concepts/generation.json)。工具未返回模型版本 / seed，不宣称可逐像素复现。

## 正式像素帧要求

原始候选是高分辨率参考，没有直接入游戏。选定 C 后重制无手持武器的身体种子，分别整表生成左右动作；武器单独生成，运行时不翻转身体，而是按真实角度旋转持械部件。

正式身体表 `public/assets/characters/shooter-scout-body-64x64.png` 为 256×640，4 列 × 10 行，前 5 行向右、后 5 行向左。每方向 20 帧，按 idle(4) / run(8) / brace(4) / dash(4) 排列，起始索引为 0 / 4 / 12 / 16，左向整体加 20。身体主体约 24px 高，锚点 `(32,59)` 对应逻辑 `(x,y+5)`。

武器表 `public/assets/characters/shooter-scout-weapons-32x24.png` 为 128×72，4 列 × 3 行，依次为魔弹接收器、激光发射器、导弹双口部件；每组为准备、活动、回充 / 装填、回收四态。固定握持轴 `(17,12)`、前端参考 `(24,12)`，同一武器各帧共用前端轴线，保持左向正立时只翻转武器纵轴。

处理采用行间隔 / 8 邻域独立轮廓、共享尺度、预乘 alpha 面积采样、Lab 最近色与二值 alpha。身体按包含靴尖 / 描边的靴底定位；武器按前端中心线平移，不能逐帧缩放。色板只取现有 palette.ts 的 13 个相关键，未增加颜色。正式种子取处理后的 right-idle-0。

重建命令：

```powershell
node scripts/build-shooter-character-assets.mjs
python scripts/export-shooter-character-preview.py
```

源图 / 结果哈希、每帧范围、靴底与前端平移见 [asset-record.json](../assets/characters/shooter/asset-record.json)。完整提示词：[身体种子](../assets/characters/shooter/shooter-c-seed-prompt.txt)、[右向动作](../assets/characters/shooter/shooter-c-right-prompt.txt)、[左向动作](../assets/characters/shooter/shooter-c-left-prompt.txt)、[武器部件](../assets/characters/shooter/shooter-c-weapons-prompt.txt)。内置工具未返回模型版本或 seed。

跑步修订单独保留整条八帧源表与提示词：[右向跑步](../assets/characters/shooter/shooter-c-run-right-prompt.txt)、[左向跑步](../assets/characters/shooter/shooter-c-run-left-prompt.txt)。原 32 帧正式图归档为 `shooter-c-body-before-run.png`，用于[同速度前后对比](../assets/characters/shooter/shooter-c-run-comparison.gif)；对比双方均为 70px/s、0.4 秒一周期，上方 2× 移动、下方 5× 姿态。

正式像素资产的约束：

- 人物主体约 24px 高，靴底延续现有人物对应逻辑 `(x,y+5)` 的落点，确保与战士、怪物及地面保持一致比例。
- 头部标志、深色眼睛、手部、靴子和便携发射器在 1× 下可读；护目镜、能源包不依靠微小零件与常驻光雾表达。
- 正式颜色来自当前 `palette.ts`；概念图中的配色只是参考，不额外维护独立色板。
- 身体、手部与武器的分层方式按选定造型和实际瞄准姿态确定；握持锚点 / 枪口应配合已有发射位置，不能反过来移动弹丸或光束出生点。
- 同一套动作保持统一人物尺度和脚底锚点，为发射器与背部部件预留透明空间，不逐帧自动缩放或按武器包围盒居中。
- 同时查看原尺寸、整数倍放大和实际战场；保留人物脚下的冲刺、装填 / 照射 / 回充和经验资源条间距。

## 运行时与三种武器

`ShooterCharacter` 的表现状态归 Scene 所有，固定步后只读实际位置、模拟时间与武器状态，不写 Core 字段。身体共用现有角色回调；持械在弹丸 / 粒子之后、飘字之前绘制，机匣可遮住魔弹出生点到枪管前端的短段。

| 武器 / 动作 | 取帧与瞄准来源 |
| --- | --- |
| 待机 / 跑动 / 冲刺 | 待机 3 帧每秒；跑步每移动 28px 完成 8 帧，后退时反向推进，途中有 1px 身体起伏；冲刺按 0.16 秒余时，透明度同时应用于武器 |
| 魔弹 | 真实射击计数变化与 fireCd 回升，按实际弹丸速度确定开火方向；排除「双段疾冲」单纯推进计数的情况；按当前射击冷却显示回收部件 |
| 激光 | 主束 angle / aimReady 与 channel / recharge 及 remaining / total，持续照射用支撑姿态，回充更换部件状态 |
| 导弹 | 实际 rounds 与玩家附近的主发射记录，按 reload / reloadTotal 显示装填；不把远处微型弹 / 派生弹当作新的玩家开火 |

保留发射几何：魔弹从逻辑 `(x,y-3)` 附近出膛，激光主束口为该点沿实际方向前移 7px，导弹从该点两侧 5px 弹射。没有为贴图改动这些坐标；导弹部件表达双口与装填，实际弹射、制导和特效继续使用模拟坐标。身体只有左右两种朝向，八方向示例只展示武器旋转，不宣称八方向身体。

激光折光残像根据真实旧光路恢复旧人物位置与角度，只在 lane=0 绘制一次固定支撑姿态的 C 身体 / 激光部件青色剪影；余时、淡出、旧发射口与伤害保持原规则。PixelPainter 的可选 silhouette 使用 Phaser 4 的 setTint / setTintMode(FILL)，每个精灵入口 clearTint 复位，防止共用池把残像颜色带回本体或其他单位。

暂停 / 属性页无模拟推进时，帧、朝向与武器状态冻结；换局 / 切武器重置。只有两张表都正确加载后才替换人物，失败保留原图及程序化残像。

跑步只改变步态、腿部摆幅和身体的 1px 视觉起伏；持械发射口保持逻辑基准，不随起伏移动。停下 / 撞墙时回到站姿，暂停时步态相位和起伏冻结；既有折光姿态索引随新排布同步。24 个非跑步姿态逐像素保留，武器 PNG 与修订前一致。

本专项不修改伤害、索敌、枪口逻辑位置、激光路径、导弹制导 / 装填规则、冷却、经验或天赋。现有武器特效按真实事件连接。射手样板完成后，再继续法师人物。

## 当前检查与边界

- 已目视检查三张完整人物、头部 / 服装差异、武器与装备是否完整。
- 正式身体 40 帧与武器 12 帧均非空、未裁断，颜色来自现有色板，alpha 仅 0 / 255；40 帧资源靴底基线全为 59，跑步显示时按相位抬高 0 / 1px，12 个武器前端参考全为 (24,12)，哈希与记录一致。
- 已导出三武器合成 GIF 和八瞄准方向示例；这些是离线素材编排，不代表实机 / 自然战斗证据。
- 类型检查、构建与聚焦画面检查结果记于 `docs/migration.md`。不新增 / 修改测试，不运行 Vitest / Playwright，不进行完整玩法验收。
- CUA 正常职业入口确认显示；随后通过已有教程命令受控分别查看三种武器，确认魔弹开火、激光照射 / 回充、导弹发射 / 装填取帧。经现有 DEV 面板学习折光步，用已有 laserDash / setMoveAxis 触发旧位置剪影，本体与后续导弹部件均保持正常染色。暂停前后身体、武器和角度一致，页面日志为空。该记录不作为自然按键链或伤害 / 全组合验收。
- 跑步修订后另做聚焦受控检查：左右跑步使用新八帧区间，后退相位反向推进，身体 0 / 1px 起伏时武器基准稳定；暂停同时冻结相位和起伏，折光残像使用新支撑索引 12。页面日志为空，临时检查页与 5189 服务已关闭；截图与采样见 `output/shooter-run-runtime.png`、`output/shooter-run-check.json`。
- 双端日志暂记 v157。用户在 5173 开发服务器试玩后认可本批效果并授权本地提交，试玩服务已关闭；未推送、创建 PR 或合入其他功能 / 文档分支。
