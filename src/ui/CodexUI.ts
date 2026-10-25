import type { GameCore } from "../game/core/GameCore";
import { TALENT_ENTRIES, type CodexEntry } from "../game/codex/codexData";
import { TIERS, TIER_COLOR } from "../game/data/talents";
import { element } from "./dom";

const ALL = "全部" as const;
const GROUPS = ["攻击", "增幅", "技能", "防御"] as const;
type Filter = typeof ALL | (typeof GROUPS)[number];
const FILTERS: readonly Filter[] = [ALL, ...GROUPS];

function tierName(entry: CodexEntry): string {
  return TIERS[entry.tier ?? 0] ?? "普通";
}

function tierColor(entry: CodexEntry): string {
  return TIER_COLOR[entry.tier ?? 0] ?? TIER_COLOR[0];
}

/**
 * 图鉴面板（只读）。
 *
 * - **只读语义**：本类不修改存档，唯一写入是打开时的 `backfill`（只补不覆盖，幂等）。
 * - 供开始界面与暂停界面共用：关闭时只隐藏自身，不改变下层 overlay 的显示状态，
 *   因此从暂停打开后关闭会自然回到暂停，无需额外回调。
 * - 隐藏天赋不在此出现：它在 `codexData` 构建期已被过滤，分母与列表同源。
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
    if (this.filter === ALL) return TALENT_ENTRIES;
    return TALENT_ENTRIES.filter((entry) => entry.group === this.filter);
  }

  private render(): void {
    const codex = this.core.codex;
    const progress = codex.progress();
    element("codex-progress").textContent = `天赋 ${progress.unlocked} / ${progress.total}`;

    element("codex-tabs").innerHTML = FILTERS.map((group) => {
      const bucket =
        group === ALL
          ? { unlocked: progress.unlocked, total: progress.total }
          : (progress.byGroup[group] ?? { unlocked: 0, total: 0 });
      const active = group === this.filter ? " active" : "";
      return `<button class="cx-tab${active}" data-group="${group}">${group}<span>${bucket.unlocked}/${bucket.total}</span></button>`;
    }).join("");

    element("codex-grid").innerHTML = this.visibleEntries()
      .map((entry) => {
        const icon = entry.icon ?? "?";
        if (!codex.isUnlocked(entry.id)) {
          // 未解锁：灰度剪影 + ???，不暴露描述与等级
          return `<button class="cx-cell locked" data-id="${entry.id}">
            <span class="cx-ico">${icon}</span>
            <span class="cx-name">???</span>
            <span class="cx-meta">${tierName(entry)}</span>
          </button>`;
        }
        return `<button class="cx-cell" data-id="${entry.id}" style="border-color:${tierColor(entry)}">
          <span class="cx-ico">${icon}</span>
          <span class="cx-name" style="color:${tierColor(entry)}">${entry.name}</span>
          <span class="cx-meta">${tierName(entry)} · Lv.${codex.maxLevel(entry.id)}</span>
        </button>`;
      })
      .join("");

    this.renderDetail();
  }

  private renderDetail(): void {
    const entry = this.selected
      ? TALENT_ENTRIES.find((item) => item.id === this.selected)
      : undefined;
    if (!entry) {
      this.hideDetail();
      return;
    }
    const detail = element("codex-detail");
    const unlocked = this.core.codex.isUnlocked(entry.id);
    detail.classList.remove("hidden");
    if (!unlocked) {
      detail.innerHTML = `
        <div class="cx-d-name">???</div>
        <div class="cx-d-meta">${tierName(entry)} · ${entry.group ?? ""} · 未解锁</div>
        <div class="cx-d-desc">在冒险中获得该天赋后解锁。</div>`;
      return;
    }
    detail.innerHTML = `
      <div class="cx-d-name" style="color:${tierColor(entry)}">${entry.icon ?? ""} ${entry.name}</div>
      <div class="cx-d-meta">${tierName(entry)} · ${entry.group ?? ""} · 历史最高 Lv.${this.core.codex.maxLevel(entry.id)}</div>
      <div class="cx-d-desc">${entry.desc}</div>`;
  }

  private hideDetail(): void {
    const detail = element("codex-detail");
    detail.classList.add("hidden");
    detail.innerHTML = "";
  }
}
