# 元素法师技能 VFX 交接包（v161，未接入运行时）

**交付边界：只有素材、重建 / 离线预览工具和未启用的采样器。正式技能接线留给协作者。** GameScene 不导入 / 创建 / 注册 MageVfx，不请求技能图集；战斗 Core、draw 与 PixelPainter 和 upstream/main 9a3d860 一致。人物本体的独立接入见 [人物说明](mage-character-art.md)。

## 资源与复现

- public/assets/vfx/mage-elemental-48x48.png：288×240，6 列 × 5 行，29 个 48×48 有效帧，最后一格留空。中心锚点 (24,24)。
- assets/vfx/mage/asset-record.json：每帧索引、源锚点、尺度、色板映射与源 / 产物 SHA-256。正式图 13 色、alpha 仅 0/255，29 帧非空且不触边。
- mage-vfx-contact-sheet-4x.png / mage-vfx-preview.html / mage-vfx-preview.gif：接触表与离线示意；HTML 支持暂停 / 慢放，GIF 90 帧、960×540、3 秒。它们不代表游戏技能已启用或完成实战验收。
- 高分辨率源图和完整提示词来自上游概念批次，保留原样，见 [美术简报](mage-vfx-art-brief.md)。棱镜从原冰晶源中截取再映射元素色；不添加新色板颜色。

| 索引 | 内容 |
|---|---|
| 0–3 / 4–7 / 8–11 | 火 / 冰 / 雷法阵起手、蓄势、爆裂、消散 |
| 12–14 | 灼烧 1 / 2 / 3 层 |
| 15–17 | 凝冰 1 / 2 / 3 层 |
| 18–21 | 冰壳成形、维持、裂纹、碎裂（冻结 / 霜牢共用源形） |
| 22–25 | 雷印暗纹、充能、放电、淡出 |
| 26–28 | 火 / 冰 / 雷棱镜 |

~~~powershell
node scripts/build-mage-vfx-assets.mjs
node scripts/build-mage-vfx-preview.mjs
~~~

复用现有 Node / TypeScript / PNG 编解码器和 Python / Pillow，无新增依赖。处理为共享尺度 / 锚点、预乘 alpha 面积采样、0.25 阈值、Lab 最近色和确定性色板键映射；源图透明 RGB 不参与混色。正式 SHA-256：7dedc4979f68c8ff22c2cfc9f95b18b06e63e240aecc4d2c58da7a23f7755adb。

## 已准备、但未启用的接口

src/game/rendering/vfx/MageVfx.ts 提供 registerMageVfx / MageVfx 采样器，当前仅被离线脚本读取，不在正式游戏入口依赖图中。它定义自己的 MageVisualEvent / MageVfxView 交接契约，**真实 GameCore 没有 mageVisualEvents 字段**，不能把 GameCore 直接传给 capture。

建议由协作者在确认方案后提供只读视图：现有 player / prof / state / time / enemies / mageShadows，加本步事件数组。事件记录 kind（body / echo / refract / shadow / burst）、模拟时间 at、element、x/y、真实 radius 和可选 source 点。每步使用新数组供引用去重；在轮盘推进前记录实际元素，避免第 3 发提前变色。是否增加 Core 事件或采取其他桥接方式由协作者负责，不属于本次交付。

## 后续接线核对清单

1. Scene 加载并注册 29 帧，在固定步采集真实状态；暂停沿用模拟时间，换局 / 死亡 / 退回开始 / shutdown 清理。保留加载失败回退。
2. 本体、回响、折射、分影和震爆必须使用实际结算元素与落点，不能从剩余敌人重新猜。不要让 VFX 改动伤害、索敌、经验、RNG 或反应预算。
3. 保留精确法阵范围圈，贴图仅作圈内整数倍表现；普通 alpha，地面层低于人物和血条，无全屏闪白或额外资源条。
4. 雷印只读 elemShockT，和 elemParaT 麻痹区分；霜牢优先于普通冻结，受击延长时不重播成形，真正结束后才碎裂。旧 frozenT 保留兼容。
5. 镜像 / 分影人物复用、元素色和固定锚点由协作者另行接入；本次只接了人物本体，没有启用这些技能表现。
6. 六反应艺术字仍是静态 UI 源素材，战斗飘字继续使用两字名称与上游描边规则。

## 验证与限制

素材重建、透明 / 色板 / 锚点 / 哈希、离线预览、typecheck 和 build 为交付检查。正式场景已受控确认技能图集未加载、技能适配器实例不存在、Core 无新增事件字段、图集网络请求为 0。没有新增 / 修改测试或基线，不运行 Vitest / Playwright 测试套件；技能触发、自然战斗、全组合与性能须在协作者完成接线后验收。
