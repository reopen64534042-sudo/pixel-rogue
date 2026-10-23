import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { it, expect, vi, afterEach } from "vitest";
import { fresh, seeded } from "./helpers";
import { UPGRADES } from "../src/game/data/talents";
afterEach(() => vi.restoreAllMocks());
/** Run actual preserved source, never a rewritten expectation of the same algorithm. */
function original() {
  const node = {
    classList: { add() {}, remove() {} },
    style: {},
    getContext: () => ({ fillRect() {} }),
  };
  const math = Object.create(Math) as Math;
  math.random = seeded();
  const context = createContext({
    Math: math,
    document: {
      getElementById: () => node,
      createElement: () => ({ ...node }),
    },
    window: {},
    innerWidth: 960,
    innerHeight: 540,
    addEventListener() {},
    requestAnimationFrame() {},
    performance: { now: () => 0 },
    setTimeout() {},
  });
  const html = readFileSync("legacy/upstream-v8.html", "utf8");
  runInContext(html.match(/<script>([\s\S]*?)<\/script>/)![1], context);
  runInContext(
    "muted=true;state='play';drawCards=()=>{};showRestBar=()=>{bpMode='rest';};",
    context,
  );
  return context;
}
it("every talent effect, cap and tier matches the protected original", () => {
  const baseline = original();
  for (const u of UPGRADES) {
    const expected = JSON.parse(
      runInContext(
        `JSON.stringify((()=>{resetGame();const u=UPGRADES.find(x=>x.n===${JSON.stringify(u.n)});u.f(player);return {player,max:u.max,t:u.t};})())`,
        baseline,
      ),
    );
    const g = fresh();
    u.f(g.player);
    expect(g.player).toEqual(expected.player);
    expect(u.max).toBe(expected.max);
    expect(u.t).toBe(expected.t);
  }
});
it.each([1, 4, 5, 8, 16])(
  "1800 deterministic ticks at wave %i match original combat and movement",
  (wave) => {
    const baseline = original();
    runInContext(
      `resetGame();waveN=${wave};quota=waveQuota(waveN);keys.d=true;`,
      baseline,
    );
    // Re-seed after original startup star generation, before either simulation begins.
    baseline.Math.random = seeded(900 + wave);
    runInContext("for(let i=0;i<1800;i++)update(1/60);", baseline);
    const expected = JSON.parse(
      runInContext(
        "JSON.stringify({player,enemies,bullets,gems,potions,time,kills,spawnCd,chainCd,wavePhase,waveN,quota,spawnedThisWave,dmgBy,ebullets,pendingLevels,bpMode,slotNames:slots.map(s=>({name:s.u.n,used:s.used}))})",
        baseline,
      ),
    );
    vi.spyOn(Math, "random").mockImplementation(seeded(900 + wave));
    const g = fresh();
    g.waveN = wave;
    g.quota = g.waveQuota(wave);
    g.keys.d = true;
    // Same original update entry point, independent of display-clock gating.
    for (let i = 0; i < 1800; i++) g.update(1 / 60);
    const actual = {
      player: g.player,
      enemies: g.enemies,
      bullets: g.bullets,
      gems: g.gems,
      potions: g.potions,
      time: g.time,
      kills: g.kills,
      spawnCd: g.spawnCd,
      chainCd: g.chainCd,
      wavePhase: g.wavePhase,
      waveN: g.waveN,
      quota: g.quota,
      spawnedThisWave: g.spawnedThisWave,
      dmgBy: g.dmgBy,
      ebullets: g.ebullets,
      pendingLevels: g.pendingLevels,
      bpMode: g.bpMode,
      slotNames: g.slots.map((s) => ({ name: s.u.n, used: s.used })),
    };
    expect(JSON.parse(JSON.stringify(actual))).toEqual(expected);
  },
);

it.each([4, 8, 16])(
  "all 34 talents in combat retain original simulation at wave %i",
  (wave) => {
    const baseline = original();
    runInContext(
      `resetGame();waveN=${wave};quota=waveQuota(waveN);for(const u of UPGRADES){u.f(player);player.upCounts[u.n]=1;player.picks.push(u.n);}keys.s=true;keys[' ']=true;`,
      baseline,
    );
    baseline.Math.random = seeded(400 + wave);
    runInContext("for(let i=0;i<1200;i++)update(1/60);", baseline);
    const fields =
      "player,enemies,bullets,gems,potions,time,kills,spawnCd,chainCd,wavePhase,waveN,quota,spawnedThisWave,dmgBy,ebullets,meteors,bolts,pendingLevels,bpMode,slots";
    const expected = JSON.parse(
      runInContext(`JSON.stringify({${fields}})`, baseline),
    );
    vi.spyOn(Math, "random").mockImplementation(seeded(400 + wave));
    const g = fresh();
    g.waveN = wave;
    g.quota = g.waveQuota(wave);
    for (const u of UPGRADES) g.learnTalent(u);
    g.keys.s = true;
    g.keys[" "] = true;
    for (let i = 0; i < 1200; i++) g.update(1 / 60);
    const actual = Object.fromEntries(
      fields.split(",").map((key) => [key, g[key as keyof typeof g]]),
    );
    expect(JSON.parse(JSON.stringify(actual))).toEqual(expected);
  },
);
