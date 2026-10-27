# S4-D2-B / B2 验收报告

日期：2026-10-27（Asia/Singapore）。状态：**B2 独立复审完成，P1=0、P2=0、P3=1（文档收口，非阻断）；用户已授权 B3。** 浏览器控制台普通 `console.error` 未作独立收集，生产截图是休整状态、战斗截图来自受控测试的注入前自然运行；证据范围不得扩大为全设备或全玩法验收。

## 1. 基线与工作区

分支 `feat/combat-foundation-s4d-d2b-b1`，HEAD `d2fa35cc43dce6b9c41cf00627dd61c69a24c7c7`；本轮 fetch 后 `upstream/main` 同 SHA，无新增并行合并。开始时四个 B1 生产文件修改、B1 测试与 B0 文档未跟踪；stash 空。检查到两个旧 Playwright CLI 守护进程，命令行分别为 `pixel-original`、`pixel-m0`，不是项目构建/测试进程；5174/4173 无监听。该检查无法证明所有其他会话都不存在，仅说明未发现同工作区活动写入进程。本轮未更改四个生产文件或 B0。

实际被测版本为上述 HEAD 加未提交的 B1 改动。SHA-256（工作区文件）：

| 文件 | SHA-256 |
|---|---|
| `EnemyStatSources.ts` | `8010b27064f3f1887f50bf02fef42a16ad8f56d4ee618aa2619c6b300c273f04` |
| `EnemySystem.ts` | `88da26d885226e6d156bca5e335bc65a0c4b5c1fc77c46543b6dd679d36e5f06` |
| `StatKeyedMap.ts` | `161fd91837bfcb02e494be9d47f533bf3ab8f4fd7a9085f9b5957059ba58bff3` |
| `StatModel.ts` | `fded32983fe94de623f919dec99a28cca18fe33d7a00dbee1af32a88973e7457` |
| `tests/s4d-d2b-enemy-attack.test.ts` | `607d2eda1ca4fa7910abe97fffcf8e1d87bb5ff0ce39bcb1b2e4c98178a7bea9` |

本轮新增 `tests/s4d-d2b-b2-shape.test.ts`（4 项）及 `tests/browser/d2b-acceptance.spec.ts`（1 项），`playwright.config.ts` 将后者纳入 core-ui。未修改 Parity 或其排除项、D0、平衡和生产代码。新增测试的配置注入由 `finally` 恢复。

## 2. 类型、Vitest、构建与 Parity

| 检查 | 实际结果 |
|---|---|
| `npm run typecheck` | 通过；补充测试后再次通过 |
| `npm test` | 初次 28 文件 514/514，Vitest 2.23 秒；补测后最终 29 文件 518/518，2.22 秒 |
| `npm run build` | 通过，Vite 765 ms；主 JS 1,502.72 kB，gzip 405.94 kB。超过 500 kB 的 chunk 警告；B1 记录同为 1,502.72 kB / 405.94 kB，不能据此归因本次回归 |
| `npx vitest run tests/parity.test.ts` | 26/26，1 文件，补测后独立复跑 1.16 秒；新增的最终 RNG 用例不修改生产或 parity |
| 新增形状/RNG 文件 | 4/4，通过；已包含在最终全量 518 项 |

全量运行包含 B1、D2-A acceptance/spawn、D1、StatModel、shadow、CombatStats、Damage 及 S4-C 各来源、C3 和 recompute 测试。Parity：普通场景波 1/3、全天赋波 3 运行逐字段对照；波 4/5/8 普通及波 4/8 全天赋在测试内暂时中性化敌人 defense/resistances 后运行逐字段对照，`finally` 恢复。`expectParity` 沿用既有对血包成长、精英经验和 melee 分项的显式断言及归一化，不能将其描述为无任何归一化；未扩大 `BASELINE_EXCLUDED`、未更改中性化或断言。

## 3. D0 四条红线

| 红线 | 本轮证据和范围 |
|---|---|
| RNG | 已执行 D2-A 固定序列：强制首次 4、自然首次 5、自然第二次成功 6、强制五次位置 8、自然五次 9，以及 D2-09b/09c、D2-10；均断言位置、速度、seed、shootCd，非只计数。新增 D3-09 对应自然序列 `[0.625,0.6,0.125,0.25,0.4,0.8]`：类型 slime、先失败再到 `(242.13203435596427,242.13203435596424)`，速度 `30*(0.9+0.25*0.2)`、seed 4、shootCd `1+0.8*1.5`，共 6 次。攻击来源解析直接探针不消耗随机数。失败路径的 getter/Proxy 和生成后 push 门控由 B1 测试覆盖。 |
| IEEE754 | D2-A 五类型、普通/精英、多波和等级阈值对比独立旧公式；brute wave 3/lvl 10 精英 HP `750.2684799999998` 与 speed 左结合有精确断言；r/xp 对旧式比较。B1 用 `Object.is` 检查 ±0、四槽值，四乘区使用独立手算；attack 未预乘 global。-1 解析通过；-1.1 四槽实际消费抛 RangeError、映射未选中不抛。受伤实体不因新生成恢复。-1 的零倍率由全量 Damage 测试覆盖。 |
| 实体形状 | D1 五类精英字段列表、普通字段及 D2-A 测试；B2 新测五类×普通/精英未物化四增伤及 dead/kx/ky，显式 undefined 省略、空映射保留、符号身份与三层隔离。B1 真实配置到实体再到快照覆盖四槽及三映射隔离。旧 parity 字段逻辑未修改。 |
| 快照时机 | B1 Vitest 和本轮新增受控浏览器模拟均执行射手发弹后修改并移除实体、弹丸命中；自爆引爆时数值与 noDrop/dead/hp；两次接触分别清 hurtCd、dashT 并保持碰撞，断言两次扣血。浏览器专项使用真实 `GameCore.update`，但配置/位置/属性为受控夹具，非自然高波试玩。 |

## 4. 浏览器与证据

Windows 64 位、Node v24.21.0、系统 Chrome 文件版本 155.0.8059.85；headless UA `HeadlessChrome/155.0.0.0`，1280×800 默认视口，1 worker。为避免覆盖既有 `output/playwright` 截图和默认 `test-results`，在新目录从同一项目 Playwright CLI、同一配置与同一两服务执行等价于 `npm run test:browser` 的套件，并以独立 `--output` 保存结果；不下载安装浏览器。原套件 16/16（1.4 分钟），随后新增专项 1/1（17.0 秒），合计 17 个不同用例通过；未在最终新增配置后一次性重跑全部 17 个。

| 项目 / 文件 | 结果及覆盖 |
|---|---|
| core-ui `game.spec.ts` | 3/3：键盘移动、暂停/属性冻结、选卡、实际伤害入口与收集受控夹具、报告、熔炉、死亡重开、视口和箱子。第一个用例收集 `pageerror`，无异常。 |
| core-ui `original.spec.ts` | 1/1：上游 v8 可视基线。 |
| core-ui `performance.spec.ts` | 1/1：指定负载与采样，见下。 |
| core-ui `touch.spec.ts` | 9/9：PC、摇杆、冲刺、设置、暂停、旋转门控及 tooltip。 |
| core-ui `visual.spec.ts` | 1/1：相机边界与 HUD 字体指标。 |
| core-ui 新增 `d2b-acceptance.spec.ts` | 1/1：真实更新路径的三类攻击及快照，注入前自然运行截图，pageerror 无异常。 |
| production `release.spec.ts` | 1/1，32.9 秒：生产页面与 canvas、桥未暴露、真实开始按钮、无假计时器或状态注入自然首波、选卡与休整、下一波、暂停恢复；pageerror、失败请求及 HTTP ≥400 均为空。 |

受控 E2E 不代替生产自然试玩；生产首波不代替 Parity。截图：`output/b2-acceptance-20261027/output/playwright/d2b-battle-8s.png` 显示自然战斗中的敌人、弹丸和 HUD；`production-first-wave.png` 显示生产首波休整及报告；`stats-panel-large.png`、`bottombar-swap.png` 记录受控界面。已目视战斗、生产休整截图：画面和 HUD 可见；未对每个截图做逐像素或全分辨率人工审查。

性能：160 敌人、120 玩家弹丸、240 帧，`g.update` 采样 p50 **0.20000004768371582 ms**、p95 **0.3999999761581421 ms**、max **12.600000023841858 ms**；环境为上述 headless Chrome，非完整渲染帧时间。无同环境历史基线，不能宣称提升或无性能回归。原始输出：`output/b2-acceptance-20261027/playwright.log`。

**后续独立复审（2026-10-27）：** 用户提供的复审结果记录最终配置一次执行 core-ui 16/16、production 1/1，合计 17/17，约 2.1 分钟，退出码 0；独立性能采样 p50 0.200 ms、p95 0.400 ms、max 11.100 ms。证据目录 `output/b2-independent-review-20261027` 中有截图和 `.last-run.json` 的 passed 状态；该目录未发现可独立核对数量、耗时和性能采样数字的日志，上述细节依用户提供的独立复审结果记录。两次 max 不构成性能改善结论；原本 16/16 加 1/1 的分次记录保持不变。

## 5. 失败、限制与交付

原套件无测试失败、未重试。新增专项首次 CLI 调用把文件参数紧随 `--project`，Playwright 将其误读为项目名，在测试启动前报项目不存在；原始日志 `output/b2-acceptance-20261027/d2b.log`。修正为 `--project=core-ui` 后 1/1 通过；随后为了取得可见敌人和弹丸的截图，将截图延后 8 秒并再次运行 1/1 通过（`d2b-retry.log`、`d2b-final.log`）。没有失败 trace；此为命令参数错误而非游戏逻辑失败。截图和日志位于隔离目录，旧证据未覆盖。

未覆盖：独立监听普通 console error；不同浏览器、GPU、移动实机和高波自然试玩；性能跨版本同环境比较。Browser 的三入口测试为受控模拟、允许浮点容差；数值逐位依据 Vitest，截图不证明数值。B2 当时未发现需要重开 B1 的逻辑回归，后续独立复审结论见文首；B2 当时未提交、推送、创建 PR、修改 changelog 或 D0。
