# 大剑跃击与第三段坠击（v131）

大剑主动「跃击」与第三段重斩现在共用完整动作：**0.24 秒起手渐隐 → 0.12 秒离地坠落 → 落地命中与 0.32 秒地面余波**。玩家沿真实位移靠近锁定落点，表现层增加高度、淡出/显现和短垂直速度线；落地使用已有金白像素尘环、暗锈裂纹和余烬，中央留给角色。

## 触发与动作规则

本功能包含落地素材与完整的起手、预警、坠落状态和第三段坠击，统一随 v131 交付。第三段锁定**当前近战目标**，主动跃击仍选最密集敌群。

| 入口 | 起手时锁定 | 落地伤害与范围 | 充能 |
| --- | --- | --- | --- |
| 学习「跃击」后按冲刺 | 原搜索范围内最密集敌群的位置 | 140% 伤害、半径 `attackRange × 1.2`，基础 54px | 起手消耗 1 次冲刺充能；无目标退回普通冲刺 |
| 每第三次自动挥砍 | 当前近战目标的位置 | 250% 伤害、360°、半径 `attackRange × 1.5`，基础 67.5px | 不消耗冲刺充能，也不要求先学习跃击 |

- 落点、半径、原始伤害与出手方向在起手时固定；目标移动或死亡不会让预警追踪目标或重新选点，仍向已标记位置落地。
- 起手与坠落期间锁住走路、普通冲刺和自动出刀；充能回复、回血、已有短时状态仍正常推进。普通冲刺尚未结束时，第三段等待其结束再起手，不截断冲刺联动。
- 起手仍可受击；0.12 秒坠落段离地免伤，敌方弹丸穿过而不被吸收；着地后立即恢复正常受击规则。
- 落地只命中一次。第三段的破甲、剑气、连斩判定与教程命中完成标记均在实际落地后沿原结算入口执行；「强袭」仍只由主动跃击落地开启。
- 第三段仍保留间隔 ×1.2，已消耗的起手/坠落时间计入间隔，落地后只等待余下部分。极高攻速下动作仍须先完整落地，再开始下一次出刀。
- 预警外圈固定为本次攻击半径，进度弧与中心十字只负责提示；圆形命中仍沿用敌人身体半径的相交口径，扁平尘环不是命中蒙版。

## 本项目直接接入

合入本 PR 的完整文件后即可使用，正式 PNG 已在 `public/assets/vfx/`，无需运行生成脚本、手动绑定事件或增加依赖。现有依赖已安装时，正常运行 `npm run dev`；发布仍使用 `npm run build`，Vite 自动将正式资源复制到 `dist/assets/vfx/`。

1. 开始界面选择「战士 → 大剑」，进入有近战目标的战斗；第三次自动挥砍会起手、预警并坠击，不消耗冲刺充能。
2. 学习「跃击」后，在搜索范围内有敌群、冲刺充能可用时按冲刺键（默认空格，可在设置改键），会使用主动跃击；范围内无目标仍执行普通冲刺。
3. 后续学习「破甲」「剑气」继续增强第三段，学习「强袭」增强主动跃击。暂停 / C 属性面板会同步冻结动作与预警。

以下接线已包含在本 PR 中，迁入其他分支时应一起保留：

| 层 | 已接好的入口 / 职责 |
| --- | --- |
| `GameScene.create()` | 默认调用 `loadGreatswordSlashes()`，解码本表并调用 `registerGreatswordSlash()` 注册 10 帧，无需新增场景事件 |
| `PlayerSystem.updatePlayer()` | 冲刺输入调用 `core.warriorLeap()`；每步先调用 `updateWarriorLeapMotion()`，动作中屏蔽普通位移和冲刺重入 |
| `AttackSystem → updateWarriorCombat()` | 每第三下建立坠击快照；到达落地时只结算一次，继续原破甲 / 剑气 / 连斩入口 |
| `GameCore` | 每局保存 `warriorLeapState`；死亡、重开和相关 DEV / 教程重置入口清空待落地状态 |
| `CombatSystem / ProjectileSystem` | 坠落段免伤与弹丸穿过，落地恢复正常受击 |
| `WaveSystem` | 末敌清空时等待当前坠击落地，再进入收球 |
| `draw.ts` | 预警和尘环在演员下层；角色用高度 / alpha 绘制；落地快照不再叠普通刀光 |
| 卡面 / C 面板 / 教程 / 更新日志 | 显示当前规则与 v131 版本，无额外开关 |

运行时只依赖正式 PNG。源图、提示词、检查图、预览和生成脚本用于维护；`.atlas.json` 供标准 Phaser 图集消费者使用，当前 `PixelPainter` 加载链直接读取 PNG。

## 交付文件

| 文件 | 用途 |
| --- | --- |
| `public/assets/vfx/greatsword-leap-impact-144x144-10f.png` | 可直接发布的 720×288 透明 PNG，5×2、10 帧，每帧 144×144 |
| 同名 `.json` | 帧矩形、中心锚点、参考半径、非匀速时间表、色板、处理参数与 SHA-256 |
| 同名 `.atlas.json` | 标准 Phaser / TexturePacker JSON Hash 图集 |
| `assets/vfx/greatsword-leap-impact-source.png` | 内置 image_gen 生成并调整金橙层级后的完整源图 |
| `assets/vfx/greatsword-leap-impact-prompt.txt` | 首次生成及二次调色的完整提示词 |
| `assets/vfx/greatsword-leap-impact-contact-sheet.png` | 最近邻 2× 放大逐帧检查图 |
| `assets/vfx/greatsword-leap-impact-preview-1x.png` / `-2x.png` | 普通横扫 / 重斩 / 跃击并排静帧 |
| `assets/vfx/greatsword-leap-impact-preview.gif` | 同上，三倍慢放，21 帧；离线素材预览，非实机录像 |
| `scripts/build-greatsword-leap-vfx.mjs` | 从保留源图确定性导出运行 PNG、元数据、图集和检查图 |
| `scripts/preview-greatsword-leap-vfx.mjs` | 调用实际落地绘制函数生成预览，无新增依赖 |
| `src/game/rendering/vfx/greatswordLeapImpact.ts` | 运行时素材描述、非匀速选帧和绘制接口 |
| `src/game/rendering/vfx/greatswordLeapMotion.ts` | 落点预警、角色高度/透明度、地面投影与坠落速度线 |
| `scripts/preview-greatsword-leap-sequence.mjs` | 调用实际运动与绘制函数，输出主动跃击 / 第三段尺寸的离线动作预览 |
| `assets/vfx/greatsword-leap-sequence-preview.gif` / `-steps.png` | 完整起手、坠落与落地余波的三倍慢放 / 分段静帧；非实机录像 |

## 美术与产线

- 只使用 `#9b4b16`、`#f4a940`、`#ffd24a`、`#ffe8a3`、`#ffffff`，alpha 只有 0 / 255。白色仅留在前 3 帧的接触余势；峰值使用金橙尘环和暗锈裂纹。
- 整张表共用中心 `(72,72)`、origin `(0.5,0.5)` 和 67.5px 径向包络。保留全向地面关系，不旋转、不镜像，不烘焙左右朝向。
- 沿用现有大剑产线的 alpha 128 二值化、RGB 平方距离五色量化、共同径向包络和最近邻采样。为保留地面裂纹及 1px 碎屑，本表使用 144×144 逻辑画布；不先压到横扫表的 64×64 再放大。
- 每帧原生中心 4px 半径内保持透明。没有按单帧包围盒裁剪、缩放或重新居中；源图与最终 PNG 哈希写入元数据，工具未提供的 model / seed 记为 `null`。
- 运行时尺寸随 `slash.r / 67.5` 缩放；基础跃击为 0.8×。尘环的水平外缘接近当前命中半径，垂直方向保持贴地压扁。装饰尘环不是圆形命中蒙版。

重建（已有 Node 与项目依赖即可，不需要安装图像库）：

```powershell
node scripts/build-greatsword-leap-vfx.mjs
node scripts/preview-greatsword-leap-vfx.mjs
```

完整动作预览另运行 `node scripts/preview-greatsword-leap-sequence.mjs`；该可选美术工具以现有 Python / Pillow 导出 GIF，未新增项目依赖。并排素材图中的旧重斩月牙保留作美术参考，实际第三段使用落地冲击。

## 游戏接线与生命周期

`GameCore.warriorLeapState` 持有 `windup / fall` 阶段、累计模拟时间、起点、锁定落点与攻击快照，放在 Core 以免属性重算重建 Player 时抹掉。`WARRIOR_BALANCE.leapWindup / leapFall / leapImpactLife` 分别为 0.24 / 0.12 / 0.32 秒。

`warriorLeap()` 只扣一次充能并建立主动攻击快照；每第三次挥砍建立 `combo` 快照。`PlayerSystem → updateWarriorLeapMotion()` 推进角色地面位置，随后相机读取同一真实位置；`updateWarriorCombat()` 在到达落地时清空状态并结算，且当步不再额外自动挥砍。前两段普通刀光仍为 0.16 秒。

两种落地都传 `impact: true, life: leapImpactLife` 给 `meleeSwing()`，生成位置/半径固定的落地 `Slash`。第三段通过共用的 `resolveWarriorSwing()` 处理既有命中联动与剩余攻击间隔，没有复制另一套伤害结算。0.32 秒余波期间玩家可以自由行动。

`GREATSWORD_SLASH_SHEETS` 追加这一张表，`GameScene.loadGreatswordSlashes()` 复用既有异步加载和尺寸校验，总计 5 张表、50 个独立纹理。新帧键为 `greatsword-leap-impact-0` 至 `-9`。场景已停止时不注册，重复注册复用纹理；加载失败沿用 DEV 告警与程序化扩散环回退。

`draw.ts` 在敌人与玩家之前绘制大剑落地快照，后方普通刀光循环跳过这些快照，避免叠画。`drawGreatswordLeapImpact(ctx, slash)` 以 `1 - life / max` 推进帧号，固定落地位置、读取本次半径，忽略朝向；绘制后恢复调用前的 alpha。

| 帧 | 归一化起始进度 | 0.32 秒效果中的起始时间 |
| --- | --- | --- |
| 0 | 0 | 0ms |
| 1 | 0.06 | 19.2ms |
| 2 | 0.12 | 38.4ms |
| 3 | 0.18 | 57.6ms |
| 4 | 0.27 | 86.4ms |
| 5 | 0.37 | 118.4ms |
| 6 | 0.49 | 156.8ms |
| 7 | 0.62 | 198.4ms |
| 8 | 0.76 | 243.2ms |
| 9 | 0.90 | 288ms |

前三帧各保持 19.2ms，超过固定 60Hz 的单步长度，避免新刀光在创建当步衰减后直接跳过接触帧。

`drawGreatswordLeapTelegraph()` 在角色与敌人下层画固定范围外圈、进度弧和落点十字；`greatswordLeapPose()` 只计算表现高度与透明度，不修改命中位置。落地动画仍根据已保存的 `impact` 标记选择，不依赖后来变化的连击计数，也不把所有 `2π` 攻击都识别为坠击。

不新增 RAF、定时器、tween 或全局可变状态。暂停 / 属性面板冻结模拟时动作与帧号一起停止；死亡、重开、DEV 复活、清天赋与教程核心步骤切换清除未落地状态。若最后一个敌人在起手期间死亡，波次先等本次动作落地，再进入收球，避免攻击跨进休整。场景表现继续复用 `PixelPainter` 对象池。

## 绘制接口与标准 Phaser 图集

| 接口 | 输入与输出 |
| --- | --- |
| `drawGreatswordLeapImpact(painter, slash)` | 接受有效的 `weapon: "greatsword", impact: true, arc: 2π` 落地快照；按 `life / max` 选帧，使用 `x/y/r`，不读取当前玩家或连击数。已绘制返回 `true`；纹理未就绪、过期或输入无效返回 `false`，调用方保留程序化回退 |
| `drawGreatswordLeapTelegraph(painter, leap)` | 接受非空 `warriorLeapState`，读取锁定 `x/y/radius` 和累计 `elapsed`；不修改状态，返回 `void` |
| `greatswordLeapPose(leap)` | 返回 `{ height, alpha }`；`null` 时为 `{ height: 0, alpha: 1 }`。绘制角色时从实际地面 y 减去 height，禁止把高度写入命中位置 |
| `drawGreatswordLeapDescent(painter, leap, x, y)` | 接受当前实际地面坐标，绘制投影和坠落速度线，返回 `void` |

这四个接口均恢复调用前的 alpha。`life / max` 和 `elapsed` 由模拟维护，接口内部不创建计时器、动画监听或 tween。

其他采用标准 Phaser Image 的场景可直接加载随附图集。以下示例可放在 `src/game/scenes/` 下；它只负责落地表现，完整攻击规则仍使用上述 Core 接线：

```ts
import type Phaser from "phaser";
import type { Slash } from "../core/types";
import { GREATSWORD_LEAP_IMPACT as IMPACT } from "../rendering/vfx/greatswordLeapImpact";

const ATLAS = "greatsword-leap-impact-atlas";

// 从场景 preload 调用，路径相对于站点 index.html。
export function preloadLeapImpact(scene: Phaser.Scene) {
  scene.load.atlas(ATLAS, IMPACT.image, IMPACT.image.replace(/\.png$/, ".atlas.json"));
}

// 从 create 调用并复用该 Image；groundDepth 低于角色 / 敌人深度。
export function createLeapImpactView(scene: Phaser.Scene, groundDepth: number) {
  return scene.add.image(0, 0, ATLAS, `${IMPACT.prefix}0`)
    .setOrigin(0.5).setDepth(groundDepth).setVisible(false);
}

// 每帧传入对应的模拟快照；过期或回收时传 null。
// 多个同时存活的落地效果使用对应数量的池内 Image，不要互相覆盖。
export function updateLeapImpactView(view: Phaser.GameObjects.Image, slash: Slash | null) {
  if (!slash || slash.weapon !== "greatsword" || !slash.impact ||
      slash.life <= 0 || slash.max <= 0 || slash.life > slash.max || slash.r <= 0) {
    view.setVisible(false);
    return;
  }
  const progress = 1 - slash.life / slash.max;
  let frame = 0;
  while (frame + 1 < IMPACT.frameStarts.length && progress >= IMPACT.frameStarts[frame + 1]) frame++;
  view.setFrame(`${IMPACT.prefix}${frame}`)
    .setPosition(Math.round(slash.x), Math.round(slash.y))
    .setRotation(0).setScale(slash.r / IMPACT.radius)
    .setAlpha(1).setVisible(true);
}
```

图集只有一组全向帧，不建立左右镜像或方向动画；项目继续使用最近邻采样。正常运行或静态发布时不需要 Python、图像生成服务、API key 或原始生成目录。

## 已做检查与未验收项

已完成类型检查、生产构建和 PNG/图集/哈希核对，并目视检查完整动作的起手、坠落与余波静帧。动作预览调用实际 `updateWarriorLeapMotion` 与三个绘制接口，以原程序化玩家作标记，左侧为主动跃击距离、右侧为近战第三段距离/半径；不运行完整战斗系统，不代表实机或命中联动验收。

按 2026-10-29 项目验证标准，未运行 Vitest / Playwright，未新增或改动测试与 parity 基线。旧「跃击立即位移/伤害」「第三段当步扇形命中」「刀光 0.16 秒」「原始 RNG/即时联动顺序」的断言会因状态机、落地点和全向覆盖变更而过期，留待授权测试批次处理。真实战斗密集遮挡、移动目标命中率、高攻速节奏与受击手感仍需试玩确认。
