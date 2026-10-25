import type { GameCore } from "../game/core/GameCore";
import {
  CODEX_ENTRIES,
  ENEMY_ENTRIES,
  TALENT_ENTRIES,
  type CodexEntry,
} from "../game/codex/codexData";
import type { CodexProgress } from "../game/codex/CodexSystem";
import { TIERS, TIER_COLOR } from "../game/data/talents";
import { spriteImageSrc } from "../game/rendering/assetRegistry";
import { element } from "./dom";

const ALL = "全部" as const;
const ENEMY = "敌人" as const;
const GROUPS = ["攻击", "增幅", "技能", "防御"] as const;
type Filter = typeof ALL | typeof ENEMY | (typeof GROUPS)[number];
const FILTERS: readonly Filter[] = [ALL, ...GROUPS, ENEMY];

function tierName(entry: CodexEntry): string {
  return TIERS[entry.tier ?? 0] ?? "普通";
}

/** 强调色：天赋按稀有度，敌人按是否精英（精英金色，普通怪浅白）。 */
function accentColor(entry: CodexEntry): string {
  if (entry.cat === "enemy") return entry.elite ? "#ffd24a" : "#c7cff2";
  return TIER_COLOR[entry.tier ?? 0] ?? TIER_COLOR[0];
}

/**
 * 条目图标：天赋用 emoji，敌人用贴图。
 * 贴图经 `assetRegistry.spriteImageSrc()` 取得 —— 换贴图（manifest 或像素矩阵）时这里零改动。
 */
function iconHtml(entry: CodexEntry): string {
  if (entry.spr) {
    const src = spriteImageSrc(entry.spr);
    if (src) return `<img class="cx-spr" src="${src}" alt="" />`;
  }
  return `<span class="cx-ico">${entry.icon ?? "?"}</span>`;
}

/**
 * 图鉴面板（只读）。
 *
 * - **只读语义**：本类不修改存档，唯一写入是打开时的 `backfill`（只补不覆盖，幂等）。
 * - 供开始界面与暂停界面共用：关闭时只隐藏自身，不改变下层 overlay 的显示状态。
 * - 隐藏天赋不在此出现：它在 `codexData` 构建期已被过滤，分母与列表同源。
 * - 敌人条目使用游戏内同一套逻辑贴图名，未解锁时以灰度剪影呈现。
 */
export class CodexUI {
  private filter: Filter = ALL;
  private selected: string | null = null;

  constructor(private readonly core: GameCore) {
    element("btn-codex").onclick = () => this.open();
    element("btn-codex-close").onclick = () => this.close();
    element("codex-tabs").onclick = (event) => this.pickFilter(event);
    element("codex-grid").onclick = (event) => this.pickEntry(event);
  }

  get isOpen(): boolean {
    return !element("ov-codex").classList.contains("hidden");
  }

  open(): void {
    // 老玩家的战绩应体现在图鉴里；backfill 只补不覆盖，重复调用幂等。
    this.core.codex.load();
    this.core.codex.backfill(this.core.storage.read());
    this.selected = null;
    element("ov-codex").classList.remove("hidden");
    this.render();
  }

  close(): void {
    element("ov-codex").classList.add("hidden");
    this.hideDetail();
  }

  private pickFilter(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLElement>("[data-group]");
    const group = button?.dataset.group;
    if (!group || !FILTERS.includes(group as Filter)) return;
    this.filter = group as Filter;
    this.selected = null;
    this.render();
  }

  private pickEntry(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const cell = target.closest<HTMLElement>("[data-id]");
    const id = cell?.dataset.id;
    if (!id) return;
    this.selected = id;
    this.render();
  }

  private visibleEntries(): readonly CodexEntry[] {
    if (this.filter === ALL) return CODEX_ENTRIES;
    if (this.filter === ENEMY) return ENEMY_ENTRIES;
    return TALENT_ENTRIES.filter((entry) => entry.group === this.filter);
  }

  private bucketFor(
    group: Filter,
    progress: CodexProgress,
  ): { unlocked: number; total: number } {
    if (group === ALL)
      return {
        unlocked: progress.unlocked + progress.enemies.unlocked,
        total: progress.total + progress.enemies.total,
      };
    if (group === ENEMY) return progress.enemies;
    return progress.byGroup[group] ?? { unlocked: 0, total: 0 };
  }

  private cellHtml(entry: CodexEntry): string {
    const codex = this.core.codex;
    if (!codex.isUnlocked(entry.id)) {
      // 未解锁：灰度剪影 + ???，不暴露描述与数值
      const meta = entry.cat === "enemy" ? "未击杀" : tierName(entry);
      return `<button class="cx-cell locked" data-id="${entry.id}">
        ${iconHtml(entry)}
        <span class="cx-name">???</span>
        <span class="cx-meta">${meta}</span>
      </button>`;
    }
    const meta =
      entry.cat === "enemy"
        ? `击杀 ${codex.killCount(entry.id)}`
        : `${tierName(entry)} · Lv.${codex.maxLevel(entry.id)}`;
    return `<button class="cx-cell" data-id="${entry.id}" style="border-color:${accentColor(entry)}">
      ${iconHtml(entry)}
      <span class="cx-name" style="color:${accentColor(entry)}">${entry.name}</span>
      <span class="cx-meta">${meta}</span>
    </button>`;
  }

  private render(): void {
    const codex = this.core.codex;
    const progress = codex.progress();
    element("codex-progress").textContent =
      `天赋 ${progress.unlocked} / ${progress.total} ｜ 敌人 ${progress.enemies.unlocked} / ${progress.enemies.total}`;

    element("codex-tabs").innerHTML = FILTERS.map((group) => {
      const bucket = this.bucketFor(group, progress);
      const active = group === this.filter ? " active" : "";
      return `<button class="cx-tab${active}" data-group="${group}">${group}<span>${bucket.unlocked}/${bucket.total}</span></button>`;
    }).join("");

    element("codex-grid").innerHTML = this.visibleEntries()
      .map((entry) => this.cellHtml(entry))
      .join("");

    this.renderDetail();
  }

  private renderDetail(): void {
    const entry = this.selected
      ? CODEX_ENTRIES.find((item) => item.id === this.selected)
      : undefined;
    if (!entry) {
      this.hideDetail();
      return;
    }
    const codex = this.core.codex;
    const detail = element("codex-detail");
    const unlocked = codex.isUnlocked(entry.id);
    detail.classList.remove("hidden");

    if (!unlocked) {
      const meta =
        entry.cat === "enemy"
          ? "敌人 · 未击杀"
          : `${tierName(entry)} · ${entry.group ?? ""} · 未解锁`;
      const hint =
        entry.cat === "enemy" ? "击杀该敌人后解锁。" : "在冒险中获得该天赋后解锁。";
      detail.innerHTML = `
        <div class="cx-d-name">???</div>
        <div class="cx-d-meta">${meta}</div>
        <div class="cx-d-desc">${hint}</div>`;
      return;
    }

    const meta =
      entry.cat === "enemy"
        ? `敌人 · 累计击杀 ${codex.killCount(entry.id)}`
        : `${tierName(entry)} · ${entry.group ?? ""} · 历史最高 Lv.${codex.maxLevel(entry.id)}`;
    detail.innerHTML = `
      <div class="cx-d-name" style="color:${accentColor(entry)}">${entry.icon ? `${entry.icon} ` : ""}${entry.name}</div>
      <div class="cx-d-meta">${meta}</div>
      <div class="cx-d-desc">${entry.desc}</div>`;
  }

  private hideDetail(): void {
    const detail = element("codex-detail");
    detail.classList.add("hidden");
    detail.innerHTML = "";
  }
}
