import type { GameCore } from "../game/core/GameCore";
import {
  CODEX_ENTRIES,
  ENEMY_ENTRIES,
  TALENT_ENTRIES,
  WEAPON_ENTRIES,
  type CodexEntry,
} from "../game/codex/codexData";
import { ETYPES } from "../game/data/enemies";
import type { CodexProgress } from "../game/codex/CodexSystem";
import { TIERS, TIER_COLOR } from "../game/data/talents";
import { spriteImageSrc } from "../game/rendering/assetRegistry";
import { element } from "./dom";

const ALL = "全部" as const;
const ENEMY = "敌人" as const;
const WEAPON='武器' as const;
// S3：旧表按旧四类分，职业池按职业分（射手 / 法师 / 战士）。
// 槽位轴不进分区——16 个 tab 会让图鉴变成噪音；槽位在条目详情里显示。
const GROUPS = [
  "攻击",
  "增幅",
  "技能",
  "防御",
  "射手",
  "法师",
  "战士",
] as const;
type Filter = typeof ALL | typeof ENEMY | typeof WEAPON | (typeof GROUPS)[number];
const FILTERS: readonly Filter[] = [ALL, ...GROUPS, WEAPON, ENEMY];

function tierName(entry: CodexEntry): string {
  return TIERS[entry.tier ?? 0] ?? "普通";
}

/** 强调色：天赋按稀有度，敌人按是否精英（精英金色，普通怪浅白）。 */
function accentColor(entry: CodexEntry): string {
  if (entry.cat === "enemy") return entry.boss ? "#ff8c3a" : entry.elite ? "#ffd24a" : "#c7cff2";
  return TIER_COLOR[entry.tier ?? 0] ?? TIER_COLOR[0];
}

/**
 * 职业池卡片的「槽位 · 层级」标注（设计文档 §3.4：变体与流派必须可见）。
 * 旧表没有槽位概念 → 返回空串。
 */
function chainMeta(entry: CodexEntry): string {
  if (!entry.slot) return "";
  return entry.layer ? `${entry.slot} · L${entry.layer}` : entry.slot;
}

const RES_LABEL = { fire: "火", frost: "冰", lightning: "雷" } as const;
const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * 敌人详情里的属性表。
 *
 * 数值直接读 `ETYPES`，与真实刷新/战斗同源；精英条目复用基础怪配置，
 * 再单列一行精英修正，避免把加成后的数字误当成基础值。
 */
function enemyStatsHtml(entry: CodexEntry): string {
  if (!entry.link) return "";
  const cfg = ETYPES[entry.link];
  if (!cfg) return "";
  const def = cfg.defense ?? 0;
  const armorNote =
    def > 0
      ? `物理/引力承伤 ${Math.round((50 / (50 + def)) * 100)}%（减伤 ${Math.round((def / (50 + def)) * 100)}%）；元素与真实伤害无视护甲`
      : "无物理护甲";
  const resText = (["fire", "frost", "lightning"] as const)
    .map((k) => {
      const v = cfg.resistances?.[k];
      return `${RES_LABEL[k]} ${v !== undefined ? pct(v) : "—"}`;
    })
    .join(" · ");
  const rows: [string, string, string][] = [
    ["生命", String(cfg.hp), "基础生命；生成时按波次成长"],
    ["攻击", String(cfg.dmg), "基础攻击；生成时按波次成长"],
    ["移速", String(cfg.speed), "像素/秒，越大移动越快"],
    ["半径", String(cfg.r), "碰撞与受击体积"],
    ["经验", entry.boss ? "精英 ×8" : String(cfg.xp), entry.boss ? "(25+(波次-1)×4)×8，再乘难度经验倍率" : "击杀获得的基础经验"],
    ["护甲", def > 0 ? String(def) : "—", armorNote],
    ["抗性", resText, "正值减伤、负值增伤（弱点）；减伤上限 75%、弱点下限 -50%；— 表示无抗性"],
    [
      "解锁波次",
      entry.boss ? "10 / 20 / 30…" : cfg.w0 < 999 ? String(cfg.w0) : "特殊生成",
      entry.boss ? "每 10 波替代普通怪与精英，不进入随机池" : cfg.w0 < 999 ? "首次出现的波次" : "由其他敌人的机制生成，不进入随机刷新池",
    ],
    [
      "初始权重",
      cfg.wt > 0 ? String(cfg.wt) : "—",
      "刷新池中的基础权重，后期会随波次变化",
    ],
  ];
  if (entry.elite)
    rows.push([
      "精英强化",
      "生命 ×5 · 攻击 ×1.6 · 移速 ×0.8 · 半径 ×1.8",
      "普通宝箱 50% 概率（品质祝福）；经验 25+(波次-1)×4",
    ]);
  return `<div class="cx-d-stats">
    <div class="cx-d-stats-title">怪物属性</div>
    ${rows
      .map(
        ([k, v, n]) =>
          `<div class="cx-stat-row"><span class="cx-stat-k">${k}</span><span class="cx-stat-v">${v}</span><span class="cx-stat-note">${n}</span></div>`,
      )
      .join("")}
  </div>`;
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
    if (this.filter === WEAPON) return WEAPON_ENTRIES;
    return TALENT_ENTRIES.filter((entry) => entry.group === this.filter);
  }

  private bucketFor(
    group: Filter,
    progress: CodexProgress,
  ): { unlocked: number; total: number } {
    if (group === ALL)
      return {
        unlocked: progress.unlocked + progress.enemies.unlocked + WEAPON_ENTRIES.length,
        total: progress.total + progress.enemies.total + WEAPON_ENTRIES.length,
      };
    if (group === ENEMY) return progress.enemies;
    if (group === WEAPON) return {unlocked:WEAPON_ENTRIES.length,total:WEAPON_ENTRIES.length};
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
      entry.cat==='weapon' ? entry.slot??'武器资料' : entry.cat === "enemy"
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
          ? `${entry.boss ? "首领" : "敌人"} · 未击杀`
          : `${tierName(entry)} · ${entry.group ?? ""}${chainMeta(entry) ? ` · ${chainMeta(entry)}` : ""} · 未解锁`;
      const hint =
        entry.cat === "enemy" ? "击杀该敌人后解锁。" : "在冒险中获得该天赋后解锁。";
      detail.innerHTML = `
        <div class="cx-d-name">???</div>
        <div class="cx-d-meta">${meta}</div>
        <div class="cx-d-desc">${hint}</div>`;
      return;
    }

    const meta =
      entry.cat==='weapon' ? entry.slot??'武器资料' : entry.cat === "enemy"
        ? `${entry.boss ? "首领" : "敌人"} · 累计击杀 ${codex.killCount(entry.id)}`
        : `${tierName(entry)} · ${entry.group ?? ""}${chainMeta(entry) ? ` · ${chainMeta(entry)}` : ""} · 历史最高 Lv.${codex.maxLevel(entry.id)}`;
    detail.innerHTML = `
      <div class="cx-d-name" style="color:${accentColor(entry)}">${entry.icon ? `${entry.icon} ` : ""}${entry.name}</div>
      <div class="cx-d-meta">${meta}</div>
      <div class="cx-d-desc">${entry.desc}</div>
      ${entry.cat === "enemy" ? enemyStatsHtml(entry) : ""}`;
  }

  private hideDetail(): void {
    const detail = element("codex-detail");
    detail.classList.add("hidden");
    detail.innerHTML = "";
  }
}
