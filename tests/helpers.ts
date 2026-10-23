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
  e.x = x;
  e.y = y;
  e.speed = 0;
  return e;
}
export function ticks(core: GameCore, count: number) {
  for (let i = 0; i < count; i++) core.step(1 / 60);
}
export function seeded(seed = 12345) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
