# 当前生图版：卡通奇幻像素 Boss 与技能

风格选择来自用户确认：**精致像素、偏卡通奇幻**；具体参照为上游 [PR #220](https://github.com/reopen64534042-sudo/pixel-rogue/pull/220) 的 C 方案布衣浪人（素材提交 `28d1779`，合并 `80b6df4`）。参照副本和提取说明见 `../reference/`。

使用内置 `image_gen.imagegen`，真实透明背景，整表生成动画姿态，不逐帧独立生成人物。模型版本和 seed 未返回；可重建后处理产物，无法承诺重现相同生图结果。

| 最终源图 | 完整提示词 | 生成内容 |
|---|---|---|
| `boss-source-v2.png` | `boss-prompt.txt` + `boss-correction-prompt.txt` | 八姿态整表；第二次整表编辑只修正第 5 格尾巴及朝向一致性。初始 `boss-source.png` 保留 |
| `fire-source.png` | `fire-prompt.txt` | 六帧火焰吐息 |
| `stomp-source.png` | `stomp-prompt.txt` | 六帧踏地 / 冲锋撞地冲击 |
| `nova-source.png` | `nova-prompt.txt` | 六帧扩散冰环 |
| `spikes-source.png` | `spikes-prompt.txt` | 六帧冰刺破土 |
| `marks-source.png` | `marks-prompt.txt` | 六帧垂直落雷及地面放电 |
| `chain-source.png` | `chain-prompt.txt` | 六帧水平电链 |

`asset-record.json` 记录每个当前源图的尺寸和 SHA-256、色板、统一缩放、固定锚点、逐帧原点平移及 alpha 处理。本体输出 8×72×56，特效输出 36×128×128；使用项目现有色板，去除低透明雾光，保留有用透明边缘。

正式输出：`public/assets/boss-three/boss.atlas.png/.json`、`boss-fx.atlas.png/.json`、`public/assets/sprites/boss_three.png`。重建用 `node scripts/build-boss-assets.mjs`；素材预览用 `node scripts/build-boss-preview.mjs`。

本轮美术调整保持招式、数值、范围和碰撞。预览复用正式图集 / 正式绘制代码，但不执行 Core 战斗，不作为实机或自然战斗验收。v154 提交前按用户授权同步 upstream/main，保留太刀人物、等级成长及实际掉血吸血实现；未新增依赖或测试。
