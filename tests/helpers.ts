import { GameCore } from "../src/game/core/GameCore";
import { AudioService } from "../src/services/AudioService";
import { StorageService } from "../src/services/StorageService";
import { UPGRADES } from "../src/game/data/talents";
export function fresh() {
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
