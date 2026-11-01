import type { RunRecord } from "../../services/StorageService";
import {
  ENEMY_ENTRIES,
  ENEMY_TOTAL,
  TALENT_ENTRIES,
  TALENT_TOTAL,
  codexEntry,
  enemyId,
  resolveEntryId,
  talentId,
} from "./codexData";
import { CodexStore, emptyCodex, type CodexSaveV1 } from "./CodexStore";

export interface CodexGroupProgress {
  unlocked: number;
  total: number;
}

export interface CodexProgress {
  /** 天赋已解锁数（保持 v1 语义，UI 与既有测试依赖此字段） */
  unlocked: number;
  /** 天赋条目总数 */
  total: number;
  byGroup: Record<string, CodexGroupProgress>;
  /** 敌人分区进度（M4 新增） */
  enemies: { unlocked: number; total: number };
}

/**
 * 图鉴状态机。
 *
 * 设计要点：**只增不减、批量同步、幂等**。
 * - 解锁不由战斗系统即时上报，而是波末 / 局末各扫一次 `player.upCounts`，
 *   因此不需要侵入 `TalentSystem` / `EnemySystem`，可反复调用而不改变结果。
 * - 被置换（熔炼）掉的天赋，`max` 与解锁状态都保留：图鉴记录的是「曾经拥有」。
 * - 本类不依赖 DOM / Phaser，可直接用内存 store 做单元测试。
 */
export class CodexSystem {
  state: CodexSaveV1 = emptyCodex();

  constructor(private readonly store = new CodexStore()) {}

  get lastError(): string | null {
    return this.store.lastError;
  }

  load(): void {
    this.state = this.store.read();
  }

  /**
   * 波末 / 局末同步。
   * @param upCounts 当前局 `player.upCounts`
   * @param now 首次解锁时间戳；测试可注入固定值以获得确定性结果
   */
  syncTalents(upCounts: Record<string, number>, now = Date.now()): void {
    const learned = Object.entries(upCounts).filter(
      // 隐藏天赋（如「不屈」）没有条目，在写盘前就过滤：不写入、不占分母、不触发多余写盘。
      ([name, lv]) => lv > 0 && codexEntry(talentId(name)) !== undefined,
    );
    if (!learned.length) return;
    const ok = this.store.update((save) => {
      for (const [name, lv] of learned) {
        const id = talentId(name);
        const prev = save.talents[id];
        save.talents[id] = {
          max: Math.max(prev?.max ?? 0, lv),
          first: prev?.first ?? now,
        };
      }
    });
    if (ok) this.load();
  }

  /**
   * 战绩补档：老玩家已有若干局记录时，图鉴不应从零开始。
   * 只补不覆盖——已有条目的 `first` 保持不变；补档项 `first` 记 0 表示无确切时间。
   */
  backfill(records: readonly RunRecord[]): void {
    if (!records.length) return;
    const ok = this.store.update((save) => {
      for (const record of records) {
        for (const [name, lv] of Object.entries(record.up)) {
          if (lv <= 0) continue;
          const id = resolveEntryId(talentId(name));
          if (!id) continue;
          const prev = save.talents[id];
          save.talents[id] = {
            max: Math.max(prev?.max ?? 0, lv),
            first: prev?.first ?? 0,
          };
        }
      }
    });
    if (ok) this.load();
  }

  /** 分区进度；天赋分母排除隐藏条目，敌人分母为显式登记的条目数。 */
  progress(): CodexProgress {
    const byGroup: Record<string, CodexGroupProgress> = {};
    let unlocked = 0;
    for (const entry of TALENT_ENTRIES) {
      const group = entry.group ?? "其他";
      let bucket = byGroup[group];
      if (!bucket) {
        bucket = { unlocked: 0, total: 0 };
        byGroup[group] = bucket;
      }
      bucket.total++;
      if (this.state.talents[entry.id]) {
        bucket.unlocked++;
        unlocked++;
      }
    }
    let enemyUnlocked = 0;
    for (const entry of ENEMY_ENTRIES) {
      if (this.state.enemies[entry.id]?.kills) enemyUnlocked++;
    }
    return {
      unlocked,
      total: TALENT_TOTAL,
      byGroup,
      enemies: { unlocked: enemyUnlocked, total: ENEMY_TOTAL },
    };
  }

  /**
   * 波末 / 局末消费击杀记录。
   *
   * `killLog` 由 `CombatSystem.killEnemy` 以**裸类型键**累计（`slime` / `brute_elite`），
   * 战斗系统只写普通计数、不依赖本类。成功后由调用方清空；
   * 返回 false 表示存储损坏，**调用方不得清空**，否则丢数据。
   */
  syncEnemies(killLog: Record<string, number>, now = Date.now()): boolean {
    const pending = Object.entries(killLog).filter(([, count]) => count > 0);
    if (!pending.length) return true;
    const ok = this.store.update((save) => {
      for (const [key, count] of pending) {
        const id = enemyId(key);
        // 未登记的类型（尚未加入图鉴的敌人）不写入，避免产生无法展示的孤儿条目。
        if (!codexEntry(id)) continue;
        const prev = save.enemies[id];
        save.enemies[id] = {
          kills: (prev?.kills ?? 0) + count,
          first: prev?.first ?? now,
        };
      }
    });
    if (ok) this.load();
    return ok;
  }

  /** 天赋与敌人共用：任一分类有记录即视为已解锁。 */
  isUnlocked(id: string): boolean {
    return codexEntry(id)?.cat==='weapon' || Boolean(this.state.talents[id] || this.state.enemies[id]?.kills);
  }

  maxLevel(id: string): number {
    return this.state.talents[id]?.max ?? 0;
  }

  /** 敌人累计击杀数（跨局）。 */
  killCount(id: string): number {
    return this.state.enemies[id]?.kills ?? 0;
  }
}
