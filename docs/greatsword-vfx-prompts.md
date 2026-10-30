# 大剑剑气 / 裂地 / 冲刺斩 · 美术提示词包

状态：PR #204 的三份提示词已完成整表生成、定向修正与确定性后处理。**v133 已包含默认素材加载、稳定绘制接口和精确调用说明；三段斩的既有冲刺扇斩已直接使用专用刀光，移动剑气 / 四方裂地规则继续由玩法分支维护并调用波面接口。**

风格基线：沿用已合入 main 的大剑金白刀光与 v131 跃击落地素材（`docs/greatsword-leap-vfx.md`、`assets/vfx/greatsword-leap-impact-prompt.txt`）。不新增色板、不加厚描边、不把「重」误解为更大的白色光团。

## 交付文件

| 文件 | 用途 |
| --- | --- |
| `assets/vfx/greatsword-sword-qi-prompt.txt` | 平推剑气：脱离角色、向前移动的薄刃剑气 |
| `assets/vfx/greatsword-fissure-prompt.txt` | 裂地：以角色为中心的四方强化剑气 |
| `assets/vfx/greatsword-dash-slash-prompt.txt` | 冲刺斩专用刀光：更平、更薄、带细风痕 |
| `docs/greatsword-vfx-prompts.md` | 本说明、规格、接入与后处理约定 |

## 共同规格

- 单张透明 PNG，5 列 × 2 行 = 10 帧，从左到右、从上到下；严格 5:2 画布比例。
- 像素密度 1:1（480×270 游戏画面），最近邻、硬边、无抗锯齿、无半透明。
- 只用五色：`#9b4b16` / `#f4a940` / `#ffd24a` / `#ffe8a3` / `#ffffff`；alpha 仅 0 / 255。
- 无角色、武器、UI、文字、背景、地面贴图、检查棋盘、标签、水印。
- 固定中心锚点，不逐帧重新居中/缩放；所有帧共用同一像素网格。
- 具体格尺寸与朝向见下表；生成分辨率更高时保持相同布局与 5:2 比例。

| 素材 | 单帧目标 | 朝向 | 引擎使用 |
| --- | --- | --- | --- |
| 平推剑气 | 64×64（总 320×128） | 向右；代码镜像/旋转 | 重斩生成一道脱离角色的剑气，向前飞行 |
| 裂地强化剑气 | 96×96（总 480×192） | 向右、上下对称、耐旋转 | 重斩同时生成四道，向四个斜向飞出 |
| 冲刺斩 | 64×64（总 320×128） | 向右；代码镜像/旋转 | 三段斩的冲刺扇斩替换刀光，仍以角色为锚点 |

## 机制与接入约定（美术只负责表现）

### 平推剑气

- 重斩命中后在角色前方生成，脱离角色，以约 200–240px/s 向前移动约 150–200px。
- 竖直薄刃形碰撞体（约 20px 宽、40px 高），每个敌人每次波只结算一次，可穿透多个敌人。
- 伤害约 80%，沿飞行方向强击退；不附带眩晕（眩晕归裂地/跃击）。
- 素材表是**原地波浪动画**，不烘焙横穿画面的位移；代码负责移动、朝向旋转与淡出。

### 裂地 · 四方强化剑气

- 重斩命中时从角色中心同时向 45° / 135° / 225° / 315° 四个方向各生成一道强化剑气，向外飞出。
- 每道比普通剑气更大（约 1.4 倍宽高）、可穿透，造成约 120% 伤害、强击退并眩晕 0.45 秒；每个敌人每道只命中一次。
- 四道共用同一套波面素材，运行时按四个角度旋转；因此素材需要上下对称、耐旋转，不能有只在“向右”时成立的细节。
- 素材同样是**原地波浪动画**，不烘焙位移；代码负责生成四份、移动与淡出。

### 冲刺斩

- 用于三段斩各段末尾的冲刺扇斩，替换当前回退版的后退残影表现；命中仍是原 130° 扇形、半径与伤害，不新增命中判定。
- 与平 A 的区别必须来自**形状/运动**：更平、更薄、长而破碎的尾部、2–3 条细风痕；不是换颜色，也不是更厚的金白刃面。
- 以角色中心为锚点，向右刀光 + 代码镜像/旋转；不烘焙横穿画面的位移。

## 后处理与命名建议

- 继续使用现有大剑产线的 alpha 128 二值化、RGB 平方距离五色量化、共同径向包络、中心 4px 透明区与最近邻采样；不要按单帧包围盒裁切/重新居中。
- 平推剑气建议文件名 `greatsword-sword-qi-64x64-10f.png`、texture prefix `greatsword-sword-qi-`；裂地建议 `greatsword-fissure-96x96-10f.png`、prefix `greatsword-fissure-`；冲刺斩建议沿用现有刀光产线的 96×96 输出尺寸（提示词按 64×64 逻辑网格描述），texture prefix `greatsword-dash-slash-`。所有表继续用最近邻采样与共同锚点，不单独按帧缩放。
- 平推剑气/冲刺斩需要左右镜像版本；裂地由代码旋转四个方向，不需要逐方向出表。若 45° 旋转在实机上出现明显像素断裂，再改为四方向变体。
- 落地冲击已有 v131 素材（`greatsword-leap-impact-144x144-10f.png`），不重做；提示词见 `assets/vfx/greatsword-leap-impact-prompt.txt`。

## 生成后的验收清单

- 5×2、10 帧、尺寸/比例正确；所有帧中心锚点一致，无逐帧漂移。
- 五色以内、二值 alpha、无半透明/溢色/渐变/抗锯齿。
- 1× 与 2× 放大都能读出：平推剑气的白色前缘与中空金身；裂地的更重波面 + 地面裂纹/尘尾；冲刺斩的薄刃 + 破风尾。
- 不出现角色、武器、文字、UI、厚白描边、满屏闪光、横向长光束、蓝色/青色色块。
- 四方向旋转后的裂地不出现明显朝向错误或上下颠倒感。

## 备注

- 跃击无敌改为角色半隐身（alpha 0.5）表现，不需要额外美术提示词，也不额外画光环。
- 本包基于 main `a1901a9`（已包含 v131 跃击落地 PR #203）；不重复交付跃击落地素材。
- #204 原提示词 PR 只交付简报，没有生成 PNG 或修改运行时；本次 v133 素材 PR 增加默认加载与表现接口，机制改造仍由玩法分支独立负责。

## 生成交付（2026-10-31）

素材制作基于已合并 #204 的 `upstream/main`（`5af4766`）；交付整理同步了已合并 #205 的 `f08e338`。分支为 `codex/greatsword-qi-fissure-dash-vfx`。使用内置 `image_gen`，没有调用额外付费 API、安装依赖或修改全局配置。模型版本与 seed 未由工具返回，元数据如实记为 `null`。

正式素材位于 `public/assets/vfx/`；下表每个文件均配有同名 `.json` 元数据与 `.atlas.json` 标准 Phaser JSON Hash 图集。图集不裁切帧，不旋转打包，保留完整方格与中心锚点。

| PNG 文件 | 表尺寸 | 帧规格 | 方向 / 作用 |
| --- | --- | --- | --- |
| `greatsword-sword-qi-64x64-10f.png` | 320×128 | 64×64，5×2，10 帧 | 向右平推剑气，原地波面动画 |
| `greatsword-sword-qi-left-64x64-10f.png` | 320×128 | 同上 | 每个方格独立左右镜像，帧序不变 |
| `greatsword-fissure-96x96-10f.png` | 480×192 | 96×96，5×2，10 帧 | 单道强化波面；消费方旋转四份 |
| `greatsword-dash-slash-96x96-10f.png` | 480×192 | 96×96，5×2，10 帧 | 64×64 逻辑网格输出，向右的薄刃与分离风痕 |
| `greatsword-dash-slash-left-96x96-10f.png` | 480×192 | 同上 | 每个方格独立左右镜像，帧序不变 |

三张完整源图为 `assets/vfx/greatsword-{sword-qi,fissure,dash-slash}-source.png`。原始提示词保持 #204 内容；`assets/vfx/greatsword-energy-generation.json` 记录生成、定向修正的完整额外提示词及选择方式。裂地末帧经单独修正后，只选入该次结果的右下方格，前九格保留上一轮源图像素，避免重绘其他帧。两次中间结果的生成文件名在日志中保留，最终选用源图已全部落入仓库，重建不依赖本机生成目录。

后处理沿用大剑产线的 alpha 128 二值化、RGB 平方距离五色映射和最近邻采样。源图为 1983×793，属于生成工具的像素取整；按完整 5×2 网格统一采样后，正式表严格达到 5:2。全表只使用一个中心与一个缩放系数，取全十帧共同包络和高度上限，不逐帧裁切、缩放、重居中或烘焙位移。

- 剑气 / 裂地：将同一逻辑网格的下半部沿水平中心轴反射，保留裂纹、尘尾并保证上下严格对称；剑气最大高度 42px、裂地最大高度 64px。参考径向包络分别为 27px / 43px。
- 冲刺斩：保留生成的顺时序扫切与分离风痕，过滤角色反方向的游离噪点；输出参考半径为 39px，逻辑半径 26px。镜像版参考朝向为 π，其余表为 0。
- 中心透明区为逻辑 4px 半径：剑气 / 裂地的输出均为 4px，冲刺斩输出为 6px。角色中心没有亮点或实体块。五色之外无溢色，透明像素的 RGB 统一为零。
- `.json` 内保存源图与成品 SHA-256、每帧 SHA-256 / 像素数 / 包围盒、固定锚点、镜像状态、处理参数与十帧归一化时间表。`durationSeconds: null` 表示本素材批次不指定战斗寿命；移动速度、伤害、判定和生命周期仍由后续运行时消费者决定。

检查图与离线预览位于 `assets/vfx/`：

| 文件 | 用途 |
| --- | --- |
| `greatsword-{sword-qi,sword-qi-left,fissure,dash-slash,dash-slash-left}-contact-sheet.png` | 五张透明 2× 逐帧检查表，保留完整 5×2 格位 |
| `greatsword-energy-preview-1x.png` / `-2x.png` | 480×270 与 960×540；左列剑气左右向、中列四斜向裂地、右列冲刺斩左右向 |
| `greatsword-energy-preview.gif` | 调用实际波面 / 冲刺斩接口；同布局十帧循环，每帧 100ms，末帧停留 500ms；不代表游戏寿命或实机录像 |

预览中的暗色网格、标签和灰色中心十字仅为检查标记，正式透明 PNG 中不包含这些内容。四道裂地在预览里使用固定示例位置，以便目视检查 45° / 135° / 225° / 315° 最近邻旋转，不预设实际生成偏移或飞行速度。

现有 Node 环境即可重建，不需要 API key、图像库或手动编辑：

```powershell
node scripts/build-greatsword-energy-vfx.mjs
node scripts/preview-greatsword-energy-vfx.mjs
```

本批完成 PNG 尺寸 / 五色 / 二值 alpha / 固定透明中心、逐帧唯一性、左右镜像、上下对称、图集矩形和源图 / 成品哈希核对，并目视检查 1× / 2×、全部十帧与四斜向旋转。GIF 全帧可解码，重建哈希一致。`npm run typecheck` 与 `npm run build` 通过；既有 >500kB Vite 分包提示仍在。按当前项目裁定未运行 Vitest / Playwright、未新增或修改测试。真实战斗中的遮挡、移动观感与时机仍由后续接入和试玩确认。

## 直接接入接口（v133）

本 PR 合入后，现有 `GameScene.create()` → `loadGreatswordSlashes()` → `GREATSWORD_SLASH_SHEETS` → `registerGreatswordSlash()` 会自动解码并注册新增五张表。大剑清单共十张表、100 帧纹理，其中本批新增 50 帧。正式资源随 Vite 的 `public/` 自动发布，使用者无需运行生成脚本、重新出图、另写加载器或安装依赖。

`src/game/rendering/vfx/greatswordEnergy.ts` 是稳定入口。它只依赖表现所需的只读数值和类型，不读写 `GameCore`、玩家、敌人、伤害、位移或充能；不创建 RAF、定时器、tween 或监听。调用方每帧从现有模拟快照派生参数，暂停时快照不变，动画也不变。

| 导出 | 用途 / 返回值 |
| --- | --- |
| `GREATSWORD_ENERGY` | `qi` / `qiLeft` / `fissure` / `dash` / `dashLeft`，包含 PNG 路径、纹理前缀、帧尺寸和视觉参考半径 |
| `GREATSWORD_ENERGY_SHEETS` | 全五张表的只读描述项列表，已追加到场景默认预载清单 |
| `GREATSWORD_ENERGY_FRAME_STARTS` | 与产物元数据相同的十帧归一化起始进度 |
| `greatswordEnergyFrame(progress)` | 有效进度 `[0,1)` 返回 0–9；无效 / 过期返回 -1，标准 Phaser 消费者也可复用 |
| `drawGreatswordWave(painter, wave)` | 绘制一份实际波面状态；已绘制返回 true，纹理未就绪 / 参数无效 / 过期返回 false |
| `drawGreatswordDashSlash(painter, slash, alpha?)` | 绘制一份大剑冲刺扇斩快照；按 `life / max` 选帧，半径随本次 `slash.r` 缩放；已绘制返回 true，否则 false |
| `GreatswordWaveView` | 波面接口的导出 TypeScript 类型 |

波面参数约定：

| 字段 | 口径 |
| --- | --- |
| `kind` | `"qi"` 普通剑气；`"fissure"` 单道裂地强化剑气 |
| `x / y` | **该道波面当前的实际世界坐标**，不是当前玩家坐标，也不是整条轨迹的起点 / 终点 |
| `angle` | 飞行方向弧度；0 向右，π/2 向下。剑气自动选择左右表；裂地共用同一张表旋转 |
| `progress` | 有限数 `[0,1)`；通常为 `1 - life / max`，`max > 0`。1 代表效果过期，不再绘制 |
| `scale` | 可选，默认 1，有限且 >0；缩放只影响表现，不改变判定。剑气 / 裂地原生最大高度分别为 42px / 64px，裂地本身已更大 |
| `alpha` | 可选，默认 1，有限且在 `[0,1]` 内；可由模拟生命周期派生淡出，不使用真实时钟 |

两个绘制函数都恢复进入前的 `painter.globalAlpha`，坐标按整数落位并复用 `PixelPainter.spriteRot()` 对象池。视觉参考半径 27 / 43 / 39px 只用于缩放，不是碰撞半径。纹理未就绪时返回 false，调用方继续原来的程序化回退；读取 / 解码错误沿用场景现有 DEV 告警策略，不能为了显示效果而延后伤害。

### 接入移动剑气与四方裂地

玩法分支先持有真实的移动波面快照，再在绘制循环逐份调用接口。下面的完整适配函数可放到 `src/game/rendering/vfx/`，接收玩法层已经推进的位置与寿命：

```ts
import type { PixelPainter } from "../PixelPainter";
import { drawGreatswordWave, type GreatswordWaveView } from "./greatswordEnergy";

export interface MovingWaveSnapshot {
  kind: GreatswordWaveView["kind"];
  x: number;
  y: number;
  angle: number;
  life: number;
  max: number;
  scale?: number;
}

export function drawMovingWave(painter: PixelPainter, wave: MovingWaveSnapshot): boolean {
  if (!Number.isFinite(wave.max) || !Number.isFinite(wave.life) ||
      wave.max <= 0 || wave.life <= 0 || wave.life > wave.max) return false;
  return drawGreatswordWave(painter, {
    kind: wave.kind, x: wave.x, y: wave.y, angle: wave.angle,
    progress: 1 - wave.life / wave.max, scale: wave.scale,
  });
}
```

四方裂地由玩法层在触发时生成四份独立快照，方向为 45° / 135° / 225° / 315°，每份都保存自己的实际 `x / y / life / max`，`kind: "fissure"`。渲染时逐份调用上面的函数；不要每帧从玩家位置重新生成四份，也不要把四道图烘焙成一个 X 形精灵。伤害 / 眩晕 / 每敌每道一次的记录、实际移动、越界、清理与波次等待由对应规则系统负责。

当前基线 `main@f08e338`（已合并 #205）的 `warriorQi` 是即时直线命中后的短时路径表现，裂地仍为目标脚下延迟爆裂。它们都没有 #204 设计中的移动波面状态。接入上述接口时，规则分支需要先完成对应状态迁移；现有路径的 `x1/x2` 或地裂圈的 `t/max` 不能直接当作实际弹体坐标与飞行进度。本 PR 保留这些规则，避免素材整理改变命中时机或伤害范围。

### 替换三段斩分支的冲刺扇斩刀光

`feat/greatsword-triple-dash@cc7d8f5` 已随 #205 合入 main：在 `MeleeSwingOptions` / `Slash` 传递 `dashSlash: true`，并在 `finishWarriorTriDash()` 生成真实扇斩快照。**本 PR 已在 `src/game/rendering/draw.ts` 完成以下替换，合入即可使用，无需再手动接线：**

1. 已导入 `drawGreatswordDashSlash`，路径为 `./vfx/greatswordEnergy`。
2. 保留现有 `s.impact` 下层落地处理，以及大剑 `s.spin` 全向旋斩分支。
3. `else if (s.dashSlash)` 中「后退 5px、97% 大小、alpha 0.3 的残影 + 主刀光」已替换为：

```ts
} else if (s.dashSlash) {
  if (drawGreatswordDashSlash(ctx, s)) continue;
  // 纹理未就绪时复用原大剑刀光；函数已恢复进入前的 alpha。
  if (drawGreatswordSlash(ctx, s)) continue;
} else if (drawGreatswordSlash(ctx, s)) continue;
```

接口直接接受上游已有的 `Slash` 和 `dashSlash` 标记，本 PR 不修改 Core 类型或触发规则。只支持大剑标准 130° 扇形，固定本次 `x/y/a/r/life/max`；`spin`、`impact`、360° 或过期快照返回 false，继续各自的专用分支。它不把当前玩家位置或后来变化的连击数写回快照，不叠加旧残影，也不新增命中判定。选择「战士 → 大剑」并学习「三段斩」后，冲刺产生的扇斩自动使用新刀光；三段中的全向旋斩与跃击保留原专用表现。

### 其他场景与标准 Phaser 图集

当前场景已默认加载，不能在每次出刀时再次注册。其他采用 `PixelPainter` 的场景可遍历 `GREATSWORD_ENERGY_SHEETS`，解码 `sheet.image` 后调用既有 `registerGreatswordSlash(scene.textures, image, sheet)`；场景停止后不要继续注册，沿用 `GameScene.loadGreatswordSlashes()` 的实现即可。

标准 Phaser Image 消费者使用同名 `.atlas.json`，帧名为 `sheet.prefix + greatswordEnergyFrame(progress)`，保持 `origin(0.5)`、最近邻与完整帧尺寸。左向剑气 / 冲刺斩选 `qiLeft` / `dashLeft` 并旋转 `angle - Math.PI`；右向选 `qi` / `dash` 并旋转 `angle`，裂地始终选 `fissure` 并旋转 `angle`。左右半平面分界与接口一致：归一化弧度在 `[-π/2, π/2)` 为右向。每个同时存活的波面使用独立池内 Image，寿命结束隐藏 / 回收，由模拟提供进度。
