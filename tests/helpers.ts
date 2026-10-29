import { GameCore } from "../src/game/core/GameCore";
import { AudioService } from "../src/services/AudioService";
import { StorageService } from "../src/services/StorageService";
import { UPGRADES } from "../src/game/data/talents";
export function fresh(
  /**
   * S2 修订：`startGame()` 现在会送 1 次**开局天赋**并弹出选择面板。
   * 绝大多数用例关心的是「一张白纸的对局」，所以夹具默认把它清掉；
   * 需要验证开局发放本身的用例传 `{ keepStartTalent: true }`。
   */
  opts: { keepStartTalent?: boolean } = {},
) {
  let raw: string | null = null;
  const audio = new AudioService();
  audio.muted = true;
  const core = new GameCore(
    audio,
    new StorageService({
      getItem: () => raw,
      setItem: (_k, v) => {
        raw = v;
      },
    }),
  );
  core.startGame();
  if (!opts.keepStartTalent) {
    core.pendingLevels = 0;
    core.bpMode = null;
    core.slots = [];
    core.startTalentPending = false; // #136：白纸对局不受开局冻结影响
  }
  return core;
}
export function talent(name: string) {
  const result = UPGRADES.find((u) => u.n === name);
  if (!result) throw new Error(name);
  return result;
}
export function learn(core: GameCore, name: string, times = 1) {
  for (let i = 0; i < times; i++) core.learnTalent(talent(name));
}
export function enemy(
  core: GameCore,
  x = core.player.x + 20,
  y = core.player.y,
) {
  core.spawnEnemy("slime");
  const e = core.enemies.at(-1)!;
  // 通用战斗夹具保持中性，真实怪物防御由专门测试通过 spawnEnemy 验证。
  delete e.defense;
  delete e.resistances;
  e.x = x;
  e.y = y;
  e.speed = 0;
  return e;
}
export function ticks(core: GameCore, count: number) {
  for (let i = 0; i < count; i++) core.step(1 / 60);
}
/**
 * S1：休整期新增「属性强化面板」并排在链首（属性 → 天赋 → 宝箱 → 报告）。
 * 与属性无关的流程用例（宝箱、Issue #67 面板链等）用它清掉本波额度，
 * 回到它们真正要验证的那条链；属性面板自己的流程由
 * `tests/s1-attribute-dispatch.test.ts` 覆盖。
 */
export function skipAttrs(core: GameCore) {
  core.attrPicks = 0;
}
export function seeded(seed = 12345) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/**
 * 让熔炉产出指定的卡（S2）。
 *
 * 熔炉按 `pool[floor(rand * pool.length)]` 取卡，所以「抽到第几张」依赖池的
 * 长度与顺序。S2 删除了 3 张旧卡、又加入 18 张射手卡，任何写死的
 * `mockReturnValue(0.4)` 都会落到别的卡上——测试会以「属性对不上」的形式失败，
 * 很难看出根因。
 *
 * 用池内位置反算随机值，测试就与池的构成解耦。
 * `tier` 是**产出档**（= 材料档 + 1，即 `swTarget`）。
 */
export function meltRollFor(
  core: GameCore,
  tier: number,
  name: string,
): number {
  const pool = core.legacyAvailTalents(tier);
  const idx = pool.findIndex((u) => u.n === name);
  if (idx < 0) throw new Error(`熔炉 ${tier} 档池里没有「${name}」`);
  return (idx + 0.5) / pool.length;
}
