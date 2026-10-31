# 三首巨兽生图升级资产

用户选择「精致像素、偏卡通奇幻」，并明确参考最新合并的太刀人物。当前正式版本由内置 image_gen.imagegen 生成 Boss 和技能序列图；风格参照为上游 PR #220 / 28d1779 的 C 方案布衣浪人。保留方形像素、深紫描边、有限明暗与清楚轮廓，允许比原有六色矩阵更丰富的造型与元素细节。

当前来源与记录：

- upgrade/boss-source-v2.png：修正尾巴方向后的整张 4×2 八姿态 Boss 源图；boss-source.png 为修正前记录。
- upgrade/fire-source.png / stomp-source.png / nova-source.png / spikes-source.png / marks-source.png / chain-source.png：6 套技能源图，每套 3×2、6 帧。
- upgrade/*-prompt.txt：每次生成 / 编辑的完整提示词；asset-record.json：源图 SHA-256、尺寸、色板、锚点及处理参数。工具未返回模型版本或 seed，记录为 null，不承诺逐像素复现。
- reference/：从已合并太刀提交提取的实际源图与生产图集，提取关系见该目录 README；美术生成阶段仅用作参照，v154 提交前已按授权同步 upstream/main，保留其人物与成长代码。

正式资源：

| 路径 | 内容 |
|---|---|
| public/assets/boss-three/boss.atlas.png + .json | 8 姿态，72×56/帧，共用缩放及脚底锚点 |
| public/assets/boss-three/boss-fx.atlas.png + .json | 6 技能 ×6 帧，128×128/帧，768×768 图集 |
| public/assets/sprites/boss_three.png | 图鉴使用同源 idle 帧 |
| normalization.json / upgrade/asset-record.json | 当前处理和来源记录 |
| preview/style-comparison.png | 左为上游太刀、右为本版 Boss；上方 1×、下方 4×，只是美术对照 |
| preview/pose-sheet.png | 新 Boss 八姿态表 |
| preview/boss-effects.png / boss-redraw.gif / index.html | 正式 BossVfx + 正式图集的 8 场景 / 240 帧 GIF / 暂停慢放预览 |

重建入口：

~~~powershell
node scripts/build-boss-assets.mjs
node scripts/build-boss-preview.mjs
~~~

build-boss-assets 转调 build-boss-generated-assets：本体共用比例，逐帧只对齐脚底；VFX 按固定单元取样，只平移对齐喷口 / 地面 / 电链端点。全部使用现有色板，保留有用的源 alpha 并去除低透明整格雾光；没有放大白色背景或把雾光当不透明贴图。GameScene 通过 BossArt 预载两张图集，BossGeneratedVfx 按 Core 的寿命播放，PixelPainter 复用原图像池。

BossPixelArt.ts 仍用于资源缺失时的简化 fallback。此前六色版及早期高细节版本属于迭代历史，均不作为当前正式 PNG 构建输入。已有页面需要完整刷新才能重新预载图集。

当前招式、伤害、范围、强度和暂停 / 清理规则保持不变。预览是独立素材编排，不执行 Core 战斗，不代表 Phaser 实机、命中、TTK 或自然战斗验收；按项目约定运行 typecheck / build，不新增测试，不运行 Vitest / Playwright。
