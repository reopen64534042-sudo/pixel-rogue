import { describe, expect, it } from "vitest";
import { GameCore } from "../src/game/core/GameCore";
import {
  ENEMY_ENTRIES,
  ENEMY_TOTAL,
  TALENT_ENTRIES,
  TALENT_TOTAL,
  enemyId,
  resolveEntryId,
  talentId,
} from "../src/game/codex/codexData";
import { CODEX_KEY, CodexStore, type CodexStorage } from "../src/game/codex/CodexStore";
import { CodexSystem } from "../src/game/codex/CodexSystem";
import { ETYPES } from "../src/game/data/enemies";
import { UPGRADES } from "../src/game/data/talents";
import { AudioService } from "../src/services/AudioService";
import { StorageService, type RunRecord } from "../src/services/StorageService";
import { enemy, learn } from "./helpers";

function memStore(initial: string | null = null) {
  let raw = initial;
  return {
    getItem: () => raw,
    setItem: (_key: string, value: string) => {
      raw = value;
    },
    dump: () => raw,
  } satisfies CodexStorage & { dump: () => string | null };
}

function record(up: Record<string, number>): RunRecord {
  return { d: 1, t: 10, k: 5, lv: 3, w: 2, up, dmg: {} };
}

function hiddenTalent() {
  const talent = UPGRADES.find((u) => u.hidden);
  if (!talent) throw new Error("预期存在至少一条隐藏天赋（不屈）");
  return talent;
}

describe("图鉴条目", () => {
  it("隐藏天赋不生成条目，且不计入分母", () => {
    const hidden = hiddenTalent();
    expect(TALENT_ENTRIES.some((e) => e.name === hidden.n)).toBe(false);
    // 当前基线：41 条天赋、1 条隐藏（不屈）→ 40 条可见。
    // 新增天赋时本断言会失败，这是有意的提醒：确认新卡已正确进入图鉴后更新数字。
    expect(TALENT_TOTAL).toBe(40);
    expect(UPGRADES.length).toBe(41);
  });

  it("每个可见天赋都有条目，且 id 与名字一一对应", () => {
    for (const entry of TALENT_ENTRIES) {
      const talent = UPGRADES.find((u) => u.n === entry.link);
      expect(talent, entry.id).toBeTruthy();
      expect(talent?.hidden).toBeUndefined();
      expect(entry.id).toBe(talentId(entry.name));
      expect(entry.desc.length).toBeGreaterThan(0);
      expect(entry.cat).toBe("talent");
    }
  });

  it("天赋名全局唯一（重名会让两条条目共享主键）", () => {
    const names = UPGRADES.map((u) => u.n);
    expect(new Set(names).size).toBe(names.length);
  });

  it("未知旧键解析为空，改名后的旧键解析到现条目", () => {
    expect(resolveEntryId("t:不存在的天赋")).toBeUndefined();
    // 基线更新依据：Issue #82（敌人图鉴上线）。v1 时敌人条目为空、
    // `e:` 键一律无法解析；现在敌人条目已登记，可解析为对应条目，未知敌人键仍为空。
    expect(resolveEntryId("e:slime")).toBe(enemyId("slime"));
    expect(resolveEntryId("e:不存在的怪")).toBeUndefined();
    expect(resolveEntryId(talentId("强化弹丸"))).toBe(talentId("强化弹丸"));
    expect(resolveEntryId(talentId("旧名字"), { 旧名字: "强化弹丸" })).toBe(
      talentId("强化弹丸"),
    );
    expect(resolveEntryId(talentId("旧名字"), { 旧名字: "也不存在" })).toBeUndefined();
  });
});

describe("图鉴存档", () => {
  it("同步记录解锁、首次时间与历史最高等级", () => {
    const store = memStore();
    const codex = new CodexSystem(new CodexStore(store));
    codex.syncTalents({ 强化弹丸: 2 }, 1000);
    expect(codex.isUnlocked(talentId("强化弹丸"))).toBe(true);
    expect(codex.maxLevel(talentId("强化弹丸"))).toBe(2);
    expect(codex.state.talents[talentId("强化弹丸")].first).toBe(1000);
    expect(store.dump()).toBeTruthy();
    expect(JSON.parse(store.dump()!).v).toBe(1);
    expect(JSON.parse(store.dump()!).talents[talentId("强化弹丸")].max).toBe(2);
  });

  it("重复同步幂等：首次时间不变，等级只取更大值", () => {
    const codex = new CodexSystem(new CodexStore(memStore()));
    codex.syncTalents({ 疾速扳机: 2 }, 1000);
    codex.syncTalents({ 疾速扳机: 2 }, 2000);
    expect(codex.state.talents[talentId("疾速扳机")].first).toBe(1000);

    codex.syncTalents({ 疾速扳机: 5 }, 3000);
    expect(codex.maxLevel(talentId("疾速扳机"))).toBe(5);

    codex.syncTalents({ 疾速扳机: 1 }, 4000);
    expect(codex.maxLevel(talentId("疾速扳机"))).toBe(5);
    expect(codex.state.talents[talentId("疾速扳机")].first).toBe(1000);
  });

  it("被置换掉的天赋仍保留解锁与最高等级", () => {
    const codex = new CodexSystem(new CodexStore(memStore()));
    codex.syncTalents({ 生命之泉: 3 }, 1000);
    // 熔炼后本局不再持有该天赋
    codex.syncTalents({}, 2000);
    expect(codex.isUnlocked(talentId("生命之泉"))).toBe(true);
    expect(codex.maxLevel(talentId("生命之泉"))).toBe(3);
  });

  it("隐藏天赋即使被持有也不写入存档（不触发任何写盘）", () => {
    const store = memStore();
    const codex = new CodexSystem(new CodexStore(store));
    codex.syncTalents({ [hiddenTalent().n]: 1 }, 1000);
    expect(codex.isUnlocked(talentId(hiddenTalent().n))).toBe(false);
    expect(store.dump()).toBeNull();
  });

  it("写盘回调抛错时中止并保留原数据（图鉴异常不得打断主循环）", () => {
    const store = memStore(JSON.stringify({ v: 1, talents: {}, enemies: {} }));
    const codexStore = new CodexStore(store);
    const ok = codexStore.update(() => {
      throw new Error("boom");
    });
    expect(ok).toBe(false);
    expect(codexStore.lastError).toBe("boom");
    expect(JSON.parse(store.dump()!).talents).toEqual({});
  });

  it("存档损坏时中止写入，原数据保持不变", () => {
    const store = memStore("{ 这不是合法 JSON");
    const codex = new CodexSystem(new CodexStore(store));
    codex.load();
    expect(codex.lastError).toBeTruthy();

    codex.syncTalents({ 强化弹丸: 1 }, 1000);
    expect(store.dump()).toBe("{ 这不是合法 JSON");
    expect(codex.isUnlocked(talentId("强化弹丸"))).toBe(false);
  });

  it("结构合法但字段类型不对的存档同样视为损坏", () => {
    const store = memStore(JSON.stringify({ v: 1, talents: { [talentId("强化弹丸")]: { max: "2", first: 0 } }, enemies: {} }));
    const codex = new CodexSystem(new CodexStore(store));
    codex.load();
    expect(codex.lastError).toBeTruthy();
    expect(codex.state.talents).toEqual({});
  });

  it("写入的键名固定为 pixelrogue_codex", () => {
    const seen: string[] = [];
    const store: CodexStorage = {
      getItem: (key) => {
        seen.push(key);
        return null;
      },
      setItem: (key) => {
        seen.push(key);
      },
    };
    new CodexSystem(new CodexStore(store)).syncTalents({ 强化弹丸: 1 }, 1000);
    expect(seen.every((key) => key === CODEX_KEY)).toBe(true);
  });
});

describe("战绩补档", () => {
  it("从战绩补出解锁与最高等级，first 记 0", () => {
    const codex = new CodexSystem(new CodexStore(memStore()));
    codex.backfill([record({ 疾速扳机: 2 }), record({ 疾速扳机: 4, 生命之泉: 1 })]);
    expect(codex.maxLevel(talentId("疾速扳机"))).toBe(4);
    expect(codex.maxLevel(talentId("生命之泉"))).toBe(1);
    expect(codex.state.talents[talentId("疾速扳机")].first).toBe(0);
  });

  it("补档不覆盖已有的首次解锁时间", () => {
    const codex = new CodexSystem(new CodexStore(memStore()));
    codex.syncTalents({ 疾速扳机: 1 }, 7000);
    codex.backfill([record({ 疾速扳机: 3 })]);
    expect(codex.state.talents[talentId("疾速扳机")].first).toBe(7000);
    expect(codex.maxLevel(talentId("疾速扳机"))).toBe(3);
  });

  it("补档忽略隐藏天赋", () => {
    const codex = new CodexSystem(new CodexStore(memStore()));
    codex.backfill([record({ [hiddenTalent().n]: 1 })]);
    expect(codex.isUnlocked(talentId(hiddenTalent().n))).toBe(false);
  });
});

describe("图鉴进度", () => {
  it("分母为可见天赋总数，分区累加与总数一致", () => {
    const codex = new CodexSystem(new CodexStore(memStore()));
    codex.syncTalents({ 强化弹丸: 1, 疾速扳机: 1 }, 1000);
    const progress = codex.progress();
    expect(progress.total).toBe(40);
    expect(progress.unlocked).toBe(2);

    const sum = Object.values(progress.byGroup).reduce(
      (acc, bucket) => ({ unlocked: acc.unlocked + bucket.unlocked, total: acc.total + bucket.total }),
      { unlocked: 0, total: 0 },
    );
    expect(sum.unlocked).toBe(progress.unlocked);
    expect(sum.total).toBe(progress.total);
  });
});

describe("GameCore 接线", () => {
  function boot(codexStore = memStore()) {
    const audio = new AudioService();
    audio.muted = true;
    const game = new GameCore(audio, new StorageService(memStore()), codexStore);
    game.startGame();
    return { game, codexStore };
  }

  function savedTalents(store: { dump: () => string | null }) {
    const raw = store.dump();
    if (!raw) throw new Error("预期图鉴已写盘");
    return (JSON.parse(raw) as { talents: Record<string, { max: number }> }).talents;
  }

  it("局末结算写入图鉴解锁", () => {
    const { game, codexStore } = boot();
    learn(game, "强化弹丸", 2);
    game.gameOver();
    expect(savedTalents(codexStore)[talentId("强化弹丸")].max).toBe(2);
  });

  it("波末进入休整时写入图鉴解锁", () => {
    const { game, codexStore } = boot();
    learn(game, "疾速扳机");
    game.enterRest();
    expect(savedTalents(codexStore)[talentId("疾速扳机")].max).toBe(1);
  });

  it("升级面板未走完的早退路径同样已同步（同步点位于早退之前）", () => {
    const { game, codexStore } = boot();
    learn(game, "疾速扳机");
    game.pendingLevels = 1;
    game.enterRest();
    expect(savedTalents(codexStore)[talentId("疾速扳机")].max).toBe(1);
  });

  it("重开一局不清空图鉴解锁", () => {
    const { game } = boot();
    learn(game, "强化弹丸");
    game.gameOver();
    game.startGame();
    expect(game.codex.isUnlocked(talentId("强化弹丸"))).toBe(true);
  });
});

describe("敌人图鉴条目", () => {
  it("每个敌人配置都有条目（新增敌人漏配会在此变红）", () => {
    for (const key of Object.keys(ETYPES)) {
      expect(ENEMY_ENTRIES.some((entry) => entry.id === enemyId(key)), key).toBe(true);
    }
    // 当前基线：5 类基础怪 + 1 个精英形态。新增敌人时更新此数字。
    expect(ENEMY_TOTAL).toBe(6);
    expect(Object.keys(ETYPES).length).toBe(5);
  });

  it("精英独立登记，贴图键与绘制层的 `${spr}_elite` 规则一致", () => {
    const elite = ENEMY_ENTRIES.find((entry) => entry.id === enemyId("brute_elite"));
    expect(elite).toBeTruthy();
    expect(elite?.spr).toBe("brute_elite");
    expect(elite?.link).toBe("brute");
    expect(elite?.elite).toBe(true);
    expect(elite?.cat).toBe("enemy");
  });

  it("每条敌人条目都带可用贴图键与描述", () => {
    for (const entry of ENEMY_ENTRIES) {
      expect(entry.spr, entry.id).toBeTruthy();
      expect(entry.desc.length).toBeGreaterThan(0);
      expect(entry.link, entry.id).toBeTruthy();
    }
  });
});

describe("敌人击杀累计", () => {
  it("击杀数跨局累加，首次时间只写一次", () => {
    const codex = new CodexSystem(new CodexStore(memStore()));
    codex.syncEnemies({ slime: 2 }, 1000);
    codex.syncEnemies({ slime: 3 }, 2000);
    expect(codex.killCount(enemyId("slime"))).toBe(5);
    expect(codex.state.enemies[enemyId("slime")].first).toBe(1000);
    expect(codex.isUnlocked(enemyId("slime"))).toBe(true);
  });

  it("未登记的敌人类型不写入存档（不产生孤儿条目）", () => {
    const store = memStore();
    const codex = new CodexSystem(new CodexStore(store));
    codex.syncEnemies({ 未知怪: 5 }, 1000);
    expect(JSON.parse(store.dump() as string).enemies).toEqual({});
  });

  it("存储损坏时返回 false，调用方据此保留待同步计数", () => {
    const codex = new CodexSystem(new CodexStore(memStore("{ 坏数据")));
    expect(codex.syncEnemies({ slime: 2 }, 1000)).toBe(false);
    expect(codex.killCount(enemyId("slime"))).toBe(0);
  });

  it("敌人与天赋进度分开统计", () => {
    const codex = new CodexSystem(new CodexStore(memStore()));
    codex.syncTalents({ 强化弹丸: 1 }, 1000);
    codex.syncEnemies({ slime: 1 }, 1000);
    const progress = codex.progress();
    expect(progress.unlocked).toBe(1);
    expect(progress.total).toBe(40);
    expect(progress.enemies.unlocked).toBe(1);
    expect(progress.enemies.total).toBe(ENEMY_TOTAL);
  });
});

describe("击杀计数接缝（CombatSystem.killEnemy）", () => {
  function bootWithStore() {
    const audio = new AudioService();
    audio.muted = true;
    const codexStore = memStore();
    const game = new GameCore(audio, new StorageService(memStore()), codexStore);
    game.startGame();
    return { game, codexStore };
  }

  it("击杀只登记类型计数，不改变敌人与战斗统计", () => {
    const { game } = bootWithStore();
    const target = enemy(game);
    const hpBefore = target.hp;
    const gemsBefore = game.gems.length;

    game.killEnemy(target);

    expect(game.kills).toBe(1);
    expect(game.killLog.slime).toBe(1);
    expect(target.hp).toBe(hpBefore);
    expect(game.gems.length).toBe(gemsBefore + 1);
  });

  it("精英与基础形态分别计数，互不混淆", () => {
    const { game } = bootWithStore();
    game.spawnEnemy("brute", true);
    game.killEnemy(game.enemies.at(-1)!);
    game.spawnEnemy("brute");
    game.killEnemy(game.enemies.at(-1)!);
    expect(game.killLog.brute_elite).toBe(1);
    expect(game.killLog.brute).toBe(1);
  });

  it("已死亡敌人重复击杀不会重复计数", () => {
    const { game } = bootWithStore();
    const target = enemy(game);
    game.killEnemy(target);
    game.killEnemy(target);
    expect(game.kills).toBe(1);
    expect(game.killLog.slime).toBe(1);
  });

  it("波末消费击杀记录并清空待同步计数", () => {
    const { game, codexStore } = bootWithStore();
    game.killLog = { slime: 3, brute_elite: 1 };
    game.enterRest();
    expect(game.killLog).toEqual({});
    const saved = JSON.parse(codexStore.dump() as string);
    expect(saved.enemies[enemyId("slime")].kills).toBe(3);
    expect(saved.enemies[enemyId("brute_elite")].kills).toBe(1);
  });

  it("重开一局清空待同步计数，但不清空已累计的击杀", () => {
    const { game } = bootWithStore();
    game.killLog = { slime: 2 };
    game.enterRest();
    game.killLog = { slime: 5 };
    game.startGame();
    expect(game.killLog).toEqual({});
    expect(game.codex.killCount(enemyId("slime"))).toBe(2);
  });
});
