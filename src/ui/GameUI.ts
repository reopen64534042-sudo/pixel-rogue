import type { GameCore } from "../game/core/GameCore";
import { groupLabel, rarityLabel } from "../game/core/AttributeSystem";
import { CHANGELOG, CURRENT_VERSION } from "../game/data/changelog";
import {
  UPGRADES,
  TIERS,
  TIER_VAL,
  CAT_COLOR,
  CAT_ICO,
  mageElements,
} from "../game/data/talents";
import { fmtTime } from "../game/data/constants";
import { boltDamage, critMultiplier } from "../game/core/DamageMath";
import { professionPierce } from "../game/core/AttributeSources";
import { COMBAT_BALANCE } from "../game/data/combatBalance";
import { MAGE_BALANCE } from "../game/data/mageBalance";
import { element } from "./dom";
import { CodexUI } from "./CodexUI";
const DMG_NAMES: Record<string, string> = {
  bullet: "🏹魔弹",
  orbit: "🗡️飞刃",
  chain: "🌩️闪电",
  meteor: "☄️陨星",
  explode: "💣爆炸",
  thorns: "🌵荆棘",
  burn: "♨️灼烧",
  shock: "💥反震",
  reflect: "🌀飞刃反弹",
  // S3 法师池：法阵爆裂与元素 DoT 的分项（types.DamageSource 的 cast/element）。
  // 缺这两项时报告按 DMG_NAMES 的键遍历，法师的主要伤害会整行消失。
  cast: "🔮法阵",
  element: "✹元素",
  reaction: "☯反应",
};
const show = (id: string) => element(id).classList.remove("hidden");
const hide = (id: string) => element(id).classList.add("hidden");

/**
 * 置换（熔炉）入口开关。
 *
 * v60 起关闭：新职业池没有稀有度分层（法师 18 张全 t0、max 1），而 melt()
 * 的产出池走 legacyAvailTalents——法师局投入 2 张法师卡会熔出旧表退役卡。
 * 按 2026-10-28 裁定「先关入口、保留实现」：SwapSystem/melt 与单元测试不动，
 * 重新开放时改这里并同步池规则。
 */
const SWAP_ENTRY_ENABLED: boolean = false;
export class GameUI {
  /** 图鉴面板：开始界面与暂停界面共用同一实例（Issue #78） */
  readonly codex: CodexUI;
  /** 重新开始的二次确认态（Issue #81） */
  private restartArmed = false;
  private restartTimer: number | undefined;
  constructor(public core: GameCore) {
    this.codex = new CodexUI(core);
    core.view = {
      reset: () => this.reset(),
      started: () => {
        ["ov-start", "ov-over", "ov-pause", "ov-stats"].forEach(hide);
        // S2 修订（用户反馈）：开局送 1 次天赋 → 选完再进入战斗。
        // 面板由**UI 层**弹出而不是 GameCore.startGame：core 里开面板会走
        // rollPicks，消耗 Math.random 打乱确定性序列，所有基于种子随机的
        // 测试与 parity 都会错位。放在这里，单测（silentView）完全不受影响。
        // 注意调的是 **core 的逻辑方法**（会 rollPicks 并写 bpMode），
        // 不是 UI 自己的 openLevelPanel()（那个只负责把面板显示出来）。
        // 写成 this.openLevelPanel() 会静默无效：它只检查 bpMode 是否已是
        // "level"，而此刻还是 null，于是直接返回、面板永远不出现。
        if (this.core.pendingLevels > 0) this.core.openLevelPanel();
      },
      paused: (p) => {
        if (p) {
          this.renderPause();
          show("ov-pause");
        } else {
          // 防御：恢复游戏时若图鉴仍开着，一并收起，避免盖住战斗画面
          this.codex.close();
          hide("ov-pause");
        }
      },
      stats: (open) => {
        if (open) {
          // Issue #100：从暂停进入时是「返回暂停」，文案不能写返回战斗
          element("btn-statclose").textContent =
            this.core.statsFrom === "pause" ? "返 回" : "返回战斗 (C)";
          this.buildStats();
          show("ov-stats");
        } else {
          hide("ov-stats");
          document.getElementById("talent-tooltip")?.classList.add("hidden");
        }
      },
      level: () => this.openLevelPanel(),
      attr: () => this.openAttrPanel(),
      rest: () => this.showRestBar(),
      over: () => {
        element("over-stats").innerHTML =
          `存活时间 <span class="accent">${fmtTime(core.time)}</span> ｜ 击杀 <span class="accent">${core.kills}</span> ｜ 等级 <span class="accent">${core.player.lvl}</span>`;
        show("ov-over");
        if (core.storage.lastError) {
          const warning = document.createElement("p");
          warning.textContent = "战绩未保存：" + core.storage.lastError;
          element("over-stats").append(warning);
        }
      },
    };
    // S3 法师池：开局职业选择。
    // #btn-start 保留在「射手」按钮上（id 与位置都不动，e2e 仍可直接点它）；
    // 法师走 #btn-prof-mage。职业必须在 startGame 里先定，
    // 否则 openLevelPanel 会按上一个职业抽第一批卡。
    element("btn-start").onclick = () => this.core.startGame("shooter");
    element("btn-prof-mage").onclick = () => this.core.startGame("mage");
    // Issue #55：开始界面版本号 + 更新日志面板
    element("start-version").textContent =
      `Pixel Rogue · ${CURRENT_VERSION} · 试玩版`;
    element("btn-changelog").onclick = () => {
      element("changelog-list").innerHTML = CHANGELOG.map(
        (e) =>
          `<div class="cl-entry"><div class="cl-head">${e.version} · ${e.date} · ${e.title}</div><ul>${e.items
            .map((it) => `<li>${it}</li>`)
            .join("")}</ul></div>`,
      ).join("");
      show("ov-changelog");
    };
    element("btn-changelog-close").onclick = () => hide("ov-changelog");
    // 重开保留当前职业（S3：玩家不该被强制退回射手）
    element("btn-retry").onclick = () => this.core.startGame(this.core.prof);
    element("btn-resume").onclick = () => this.core.togglePause();
    element("btn-pause-codex").onclick = () => this.codex.open();
    // Issue #100：触屏没有 C 键，属性面板从暂停界面进入
    element("btn-pause-stats").onclick = () => this.core.openStatsFromPause();
    // 设置入口本期只占位：保持 disabled，不绑空的 onclick（避免出现死按钮）
    element("btn-restart").onclick = () => {
      if (!this.restartArmed) {
        this.armRestart();
        return;
      }
      this.returnToStart();
    };
    element("btn-statclose").onclick = () => this.core.toggleStats();
    element("btn-pause").onclick = () => {
      element("btn-pause").blur();
      this.core.togglePause();
    };
    element("bp-swapbtn").onclick = () => {
      if (!this.core.openSwap()) return;
      // Issue #69：两步式——先选材料，目标稀有度自动推导
      element("sw-hint").textContent = "置换: 点击下方库存，选择要失去的天赋（2 个等级）";
      element("sw-form").classList.remove("hidden");
      element("sw-result").classList.add("hidden");
      element("bp-swap").classList.remove("hidden");
      this.renderSwInv();
    };
    element("sw-melt").onclick = () => {
      const output = this.core.melt();
      if (output) {
        element("bp-swap").classList.remove("hidden");
        element("sw-form").classList.add("hidden");
        const resEl = element("sw-result");
        resEl.classList.remove("hidden");
        const p = this.core.player;
        const lv = p.upCounts[output.n] || 1;
        const desc = output.dyn ? output.dyn(p) : output.d;
        const curDesc = output.cur ? output.cur(p) : desc;
        element("sw-result-card").className = `sw-card t${output.t}`;
        element("sw-result-card").innerHTML = `
          <div class="sw-tier">${TIERS[output.t]} · ${output.cat}</div>
          <div class="sw-ico">${output.ico}</div>
          <div class="sw-name">${output.n} Lv.${lv}</div>
          <div class="sw-desc">${desc}</div>
          <div class="sw-cur">${curDesc}</div>
        `;
      }
    };
    element("sw-confirm").onclick = () => {
      element("bp-swap").classList.add("hidden");
      element("sw-result").classList.add("hidden");
      element("sw-form").classList.remove("hidden");
    };
    element("attr-refresh").onclick = () => {
      // 失败（本轮已用过）时不重绘，按钮由 openAttrPanel 置灰
      this.core.refreshAttr();
    };
    element("bp-boxskip").onclick = () => {
      this.core.drainBoxPicks();
      this.core.bpMode = null;
      this.core.slots = [];
      if (this.core.wavePhase === "rest") this.showRestBar();
      else this.openLevelPanel();
    };
    element("bp-next").onclick = () => {
      if (!this.core.startNextWave()) return;
      element("bottom-bar").classList.add("hidden");
      element("bp-rest").classList.add("hidden");
      element("bp-swap").classList.add("hidden");
    };
    (element("btn-start") as HTMLButtonElement).disabled = false;
    element("btn-start").removeAttribute("aria-busy");
    (element("btn-prof-mage") as HTMLButtonElement).disabled = false;
    element("btn-prof-mage").removeAttribute("aria-busy");
  }
  reset() {
    ["bottom-bar", "bp-level", "bp-attr", "bp-rest", "bp-swap"].forEach(hide);
  }
  choose(index: number) {
    this.core.chooseSlot(index);
  }
  dispose() {
    this.core.view = {
      reset() {},
      started() {},
      paused() {},
      stats() {},
      level() {},
      attr() {},
      rest() {},
      over() {},
    };
    for (const node of document.querySelectorAll<HTMLElement>(
      "#stage button, #bp-cards .card, #attr-cards .card, #sw-inv span, #talent-list",
    )) {
      node.onclick = null;
      node.onmouseover = null;
      node.onmousemove = null;
      node.onmouseleave = null;
    }
    const overlay = document.getElementById("ov-stats");
    if (overlay) overlay.onpointerdown = null;
  }
  drawCards() {
    const box = element("bp-cards");
    box.innerHTML = "";
    this.core.slots.forEach((s, i) => {
      const u = s.u;
      const lv = this.core.player.upCounts[u.n] || 0;
      const desc = u.dyn ? u.dyn(this.core.player) : u.d;
      const el = document.createElement("div");
      // Issue #35：本局首次选卡时全部标 NEW，之后仅机制型 Lv.0 标记
      const firstPick = this.core.player.picks.length === 0;
      el.className =
        "card r" + u.t + (lv === 0 && (u.mech || firstPick) ? " new" : "");
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", `${u.n}，${TIERS[u.t]}，${desc}`);
      el.onkeydown = (event) => {
        if (event.target === el && ["Enter", " "].includes(event.key)) {
          event.preventDefault();
          this.choose(i);
        }
      };
      // 卡面只保留「说明」（d）。数值预览（pv）与 Lv.0 → 1 都是 S2 之前
      // 的天赋语言：现在天赋一次性获得、不提供数值，这类预览既无意义也占高度。
      // 稀有度文字只在非普通时显示——S2 的射手池暂定全普通（稀有度待讨论），
      // 全普通时逐卡标「普通」纯属噪声；将来恢复分级后自动生效。
      // S3：补上**链层级与前置**（设计文档 §3.4「变体与流派必须可见」）。
      // 玩家只有能看见「这是 L2、它的前置是速咏」，才知道自己在构筑一条链
      // 而不是随手拿一张卡。
      const chainInfo = u.layer
        ? `<div class="chain">L${u.layer}${u.requires ? ` · 需 ${u.requires}` : ""}</div>`
        : u.slot === "秘传"
          ? `<div class="chain">秘传${u.requires ? ` · 需 ${u.requires}` : ""}</div>`
          : "";
      el.innerHTML = `${u.t > 0 ? `<div class="tier">${TIERS[u.t]}</div>` : ""}
      <div class="cat" style="color:${CAT_COLOR[u.cat]}">${CAT_ICO[u.cat]} ${u.cat}</div>
      <div class="ico">${u.ico}</div><div class="nm">${u.n}${u.mech && lv === 0 ? " ✦NEW" : ""}</div>
      ${chainInfo}
      <div class="ds">${desc}</div>`;
      if (!s.used && this.core.bpMode === "level") {
        // 每张卡独立刷新 1 次（阻止冒泡，避免误触发"选卡"）；宝箱不提供刷新。
        // 用文字而非 🔄：Press Start 2P 不含 emoji，部分环境会渲染成方块。
        const rb = document.createElement("button");
        rb.className = "refr";
        rb.textContent = "刷新";
        rb.setAttribute("aria-label", `刷新第 ${i + 1} 张卡片（限一次）`);
        rb.onclick = (e) => {
          e.stopPropagation();
          this.core.refreshSlot(i);
        };
        el.appendChild(rb);
      }
      el.onclick = () => {
        this.choose(i);
      };
      box.appendChild(el);
    });
  }
  buildStats() {
    const p = this.core.player;
    // S3-C：UI 与战斗系统同源——魔弹读 DamageMath.boltDamage、暴伤读有效值
    // critMultiplier（含致命觉醒），不再各自复算公式；基础攻击与增伤乘区分展示
    const pct = (v: number) => (v * 100).toFixed(0) + "%";
    const resist = p.resistances ?? {};
    const typeBonus = p.typeDamageBonus ?? {};
    const physMit = (def: number) =>
      Math.round(
        (1 -
          COMBAT_BALANCE.armorK / (COMBAT_BALANCE.armorK + Math.max(0, def))) *
          100,
      );
    // S3：法师的伤害基线与攻速是元素/施法口径——沿用射手的「基础攻击/魔弹/攻速」
    // 会让玩家以为自己在加物理攻击（属性面板已同步改口径）。
    const isMage = this.core.prof === "mage";
    // 元素名（法师「当前元素」行）
    const ELEM_LABEL: Record<string, string> = {
      fire: "火",
      frost: "冰",
      lightning: "雷",
    };
    const elems = isMage ? mageElements(p) : [];
    const combatRows: [string, string | number][] = [
      ["❤️ 生命", `${Math.ceil(p.hp)} / ${p.maxhp}`],
      ["📘 下级所需经验", p.xpNext],
      ["🌊 当前波次", this.core.waveN + "（配额 " + this.core.quota + "）"],
      // 文案更名（S3-C）：p.damage 是攻击基线（技能系数/raw），非 globalDamageBonus
      isMage
        ? ["🔮 元素伤害", p.damage.toFixed(1)]
        : ["⚔️ 基础攻击", p.damage.toFixed(1)],
      isMage
        ? [
            "☄️ 法阵伤害",
            (p.damage * MAGE_BALANCE.castDamageMul).toFixed(1),
          ]
        : [
            "🔥 魔弹伤害",
            boltDamage(p).toFixed(1) +
              (p.boltDmgMul > 1 ? ` ×${p.boltDmgMul.toFixed(2)}` : ""),
          ],
      isMage
        ? ["⚡ 施法速度", p.fireRate.toFixed(2) + " 次/秒"]
        : [
            "⚡ 攻速",
            (p.fireRate * (1 + p.haste * 0.1)).toFixed(2) +
              " /秒" +
              (p.haste ? ` (狂热 +${p.haste * 10}%)` : ""),
          ],
      [
        "💥 暴击/暴伤",
        (p.crit * 100).toFixed(0) + "% / ×" + critMultiplier(p).toFixed(1),
      ],
      // S3：法师显示施法距离/当前元素/法阵范围；射手只显示穿透
      //（弹道数量对玩家没有决策价值，已移除）。
      ...(isMage
        ? ([
            ["🎯 施法距离", Math.round(p.attackRange)],
            [
              "🔮 当前元素",
              elems.length ? elems.map((e) => ELEM_LABEL[e]).join(" · ") : "无",
            ],
            ["🌐 施法范围", "×" + p.area.toFixed(2)],
          ] as [string, string | number][])
        : ([
            ["🔱 穿透", p.pierce + professionPierce(this.core.prof)],
          ] as [string, string | number][])),
      ["👟 移动速度", Math.round(p.speed)],
      ["🧲 拾取范围", Math.round(p.magnet)],
      // S3-C：独立增伤乘区展示（与 p.damage 基线区分；0 值按既有惯例显示 —）
      [
        "✴️ 全局增伤",
        p.globalDamageBonus ? "+" + pct(p.globalDamageBonus) : "—",
      ],
      ["🌡️ 火焰增伤", typeBonus.fire ? "+" + pct(typeBonus.fire) : "—"],
      [
        "🌩️ 雷电增伤",
        typeBonus.lightning ? "+" + pct(typeBonus.lightning) : "—",
      ],
      ["❄️ 冰霜增伤", typeBonus.frost ? "+" + pct(typeBonus.frost) : "—"],
    ];
    const defenseRows: [string, string | number][] = [
      ["🌀 闪避", p.dodge ? (p.dodge * 100).toFixed(0) + "%" : "—"],
      [
        "🥋 减伤",
        p.tough ? (Math.min(0.6, p.tough) * 100).toFixed(0) + "%" : "—",
      ],
      // S3-C：护甲/元素抗性与战斗计算同公式（K/(K+DEF)，与减伤乘算）
      [
        "🪨 护甲",
        p.defense ? `${p.defense}（物理 -${physMit(p.defense)}%）` : "—",
      ],
      // PR #4 评审 P3：显示值同样受 resistanceCap 裁剪（与战斗实际减伤一致）
      [
        "🌋 火焰抗性",
        resist.fire
          ? pct(Math.min(resist.fire, COMBAT_BALANCE.resistanceCap))
          : "—",
      ],
      [
        "🌩️ 雷电抗性",
        resist.lightning
          ? pct(Math.min(resist.lightning, COMBAT_BALANCE.resistanceCap))
          : "—",
      ],
      [
        "❄️ 冰霜抗性",
        resist.frost
          ? pct(Math.min(resist.frost, COMBAT_BALANCE.resistanceCap))
          : "—",
      ],
      ["✨ 生命回复", p.regen ? p.regen.toFixed(1) + " /秒" : "—"],
      ["🦷 吸血", p.lifesteal ? (p.lifesteal * 100).toFixed(1) + "%" : "—"],
    ];

    const renderRows = (items: [string, string | number][]) =>
      items
        .map(([k, v]) => {
          const isDim = v === "—" || v === "未学习";
          return `<div class="row${isDim ? " dim" : ""}"><span class="k">${k}</span><span class="v${isDim ? " dim" : ""}">${v}</span></div>`;
        })
        .join("");

    const combatEl = document.getElementById("stat-combat");
    const defenseEl = document.getElementById("stat-defense");
    if (combatEl) combatEl.innerHTML = renderRows(combatRows);
    if (defenseEl) defenseEl.innerHTML = renderRows(defenseRows);

    const tl = element("talent-list");
    const learned = Object.entries(p.upCounts).filter(([, lv]) => lv > 0);
    if (!learned.length) {
      tl.innerHTML = '<div class="talent-empty">暂未习得任何天赋</div>';
    } else {
      // S2 修复：分类顺序**从已学卡派生**，不再写死四个旧分类。
      // 之前写死 ["攻击","增幅","技能","防御"]，而射手卡的 cat 是槽位名
      //（核心/标记/距离/生存/脱离/机动），导致 18 张新卡一张都不显示——
      // 数值其实生效，玩家却以为「天赋没用」。
      const KNOWN_CATS = ["攻击", "增幅", "技能", "防御"];
      const usedCats = [
        ...new Set(
          learned
            .map(([n]) => UPGRADES.find((item) => item.n === n)?.cat)
            .filter((c): c is string => !!c),
        ),
      ];
      const CAT_ORDER = [
        ...KNOWN_CATS.filter((c) => usedCats.includes(c)),
        ...usedCats.filter((c) => !KNOWN_CATS.includes(c)),
      ];
      let html = "";
      for (const cat of CAT_ORDER) {
        const inCat = learned.filter(([n]) => {
          const u = UPGRADES.find((item) => item.n === n);
          return u && u.cat === cat;
        });
        // Issue #46：组内按稀有度从低到高，同稀有度按等级从高到低
        const tierOf = (n: string) =>
          UPGRADES.find((item) => item.n === n)?.t ?? 0;
        inCat.sort((x, y) => tierOf(x[0]) - tierOf(y[0]) || y[1] - x[1]);
        if (!inCat.length) continue;
        const catIco = CAT_ICO[cat] || "";
        const catColor = CAT_COLOR[cat] || "#e8fbff";
        html += `<div class="talent-cat-group">`;
        html += `<div class="talent-cat-header" style="color:${catColor}">${catIco} ${cat} (${inCat.length})</div>`;
        html += `<div class="talent-cat-tags">`;
        for (const [n, lv] of inCat) {
          const u = UPGRADES.find((item) => item.n === n)!;

          html += `<span class="talent-tag t${u.t}" data-n="${n}">${u.ico} ${n} Lv.${lv}</span>`;
        }
        html += `</div></div>`;
      }
      tl.innerHTML = html;
    }

    const tooltip = document.getElementById("talent-tooltip");
    const stage = document.getElementById("stage");
    const statsOverlay = document.getElementById("ov-stats");

    const updateTooltipPosition = (e: MouseEvent) => {
      if (!tooltip || !stage) return;
      const stageRect = stage.getBoundingClientRect();
      const ttWidth = tooltip.offsetWidth || 260;
      const ttHeight = tooltip.offsetHeight || 180;

      let x = e.clientX - stageRect.left + 16;
      let y = e.clientY - stageRect.top + 16;

      if (x + ttWidth > stageRect.width - 8) {
        x = e.clientX - stageRect.left - ttWidth - 16;
      }
      if (y + ttHeight > stageRect.height - 8) {
        y = e.clientY - stageRect.top - ttHeight - 16;
      }
      if (x < 8) x = 8;
      if (y < 8) y = 8;

      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
    };

    const renderTooltip = (tag: HTMLElement) => {
      if (!tooltip) return;
      const u = UPGRADES.find((item) => item.n === tag.dataset.n)!;
      const lv = p.upCounts[u.n] || 0;
      const desc = u.dyn ? u.dyn(p) : u.d;
      const curDesc = u.cur ? u.cur(p) : desc;
      const catColor = CAT_COLOR[u.cat] || "#57e6ff";

      tooltip.className = `talent-tooltip tt-t${u.t}`;
      tooltip.innerHTML = `
        <div class="tt-header">
          <span class="tt-ico">${u.ico}</span>
          <div class="tt-title-wrap">
            <div class="tt-name t${u.t}">${u.n}</div>
            <div class="tt-sub">
              <span class="tt-tier t${u.t}">${TIERS[u.t]}</span>
              <span class="tt-cat" style="color:${catColor}">[${u.cat}]</span>
              <span class="tt-lvl">Lv.${lv}${u.max ? " / " + u.max : ""}</span>
            </div>
          </div>
        </div>
        <div class="tt-divider"></div>
        <div class="tt-section">
          <div class="tt-label">天赋机制说明</div>
          <div class="tt-desc">${desc}</div>
        </div>
        <div class="tt-cur-box">
          <div class="tt-label">当前等级生效效果 (Lv.${lv})</div>
          <div class="tt-cur-val">${curDesc}</div>
        </div>
        ${
          lv < u.max
            ? `<div class="tt-next-box">
                 <div class="tt-label">下级提升预览</div>
                 <div class="tt-next-val">${u.pv(p)}</div>
               </div>`
            : `<div class="tt-maxed">★ 已达最高等级 ★</div>`
        }
      `;
      tooltip.classList.remove("hidden");
    };

    const hideTooltip = () => {
      if (tooltip) tooltip.classList.add("hidden");
    };

    /**
     * Issue #96（M2-2）：触屏没有 mouseleave，「点开就关不掉」。
     *
     * 分工：
     * - 鼠标：沿用 hover 展开（onmouseover/mousemove/mouseleave），不动 PC 手感；
     * - 触控/笔：pointerdown 切换（点开 / 再点收起 / 点空白收起），并跳过随后的 click。
     * `shownTag` 只在 pointerdown 与 click 里写，hover 不写——否则 PC 上「鼠标已经展开 + 点击」
     * 会立刻命中同一条而被误判成收起。
     */
    let shownTag: HTMLElement | null = null;
    let skipNextClick = false;
    const isVisible = () =>
      tooltip !== null && !tooltip.classList.contains("hidden");
    const tagOf = (target: EventTarget | null) =>
      target instanceof Element
        ? target.closest<HTMLElement>("span[data-n]")
        : null;
    const clearActive = () => {
      tl.querySelectorAll(".talent-tag.active").forEach((el) =>
        el.classList.remove("active"),
      );
    };
    const closeTooltip = () => {
      shownTag = null;
      clearActive();
      hideTooltip();
    };
    const showTag = (sp: HTMLElement, e: MouseEvent) => {
      clearActive();
      sp.classList.add("active");
      renderTooltip(sp);
      updateTooltipPosition(e);
      shownTag = sp;
    };
    /** 触屏的确定性开关：点开、再点收起，都与「当前展示的是不是这一条」比较 */
    const toggleTag = (sp: HTMLElement, e: MouseEvent) => {
      if (shownTag === sp && isVisible()) closeTooltip();
      else showTag(sp, e);
    };

    tl.onmouseover = (e) => {
      const sp = tagOf(e.target);
      if (!sp) {
        hideTooltip();
        return;
      }
      clearActive();
      sp.classList.add("active");
      renderTooltip(sp);
      updateTooltipPosition(e);
    };

    tl.onmousemove = (e) => {
      const sp = tagOf(e.target);
      if (sp && isVisible()) updateTooltipPosition(e);
    };

    tl.onmouseleave = () => {
      clearActive();
      hideTooltip();
      shownTag = null;
    };

    tl.onpointerdown = (e) => {
      // 鼠标交给 hover 逻辑，避免 PC 上点一下就收起
      if (e.pointerType === "mouse") return;
      // 触控本轮由这里决定开关，随后的 click 不再重复处理
      skipNextClick = true;
      const sp = tagOf(e.target);
      if (!sp) {
        closeTooltip();
        return;
      }
      toggleTag(sp, e as unknown as MouseEvent);
    };

    tl.onclick = (e) => {
      if (skipNextClick) {
        skipNextClick = false;
        return;
      }
      const sp = tagOf(e.target);
      if (!sp) {
        closeTooltip();
        return;
      }
      // 鼠标点击同样支持切换（无 hover 能力的设备走不到这里，但有键盘/辅助技术在）
      toggleTag(sp, e);
    };

    /*
     * 点属性面板空白处收起：触屏上浏览器补发的 mouseover 不可靠，
     * 这里用 pointerdown（鼠标/触摸都触发）做确定性关闭。
     */
    if (statsOverlay)
      statsOverlay.onpointerdown = (e) => {
        const inside =
          e.target instanceof Element &&
          e.target.closest("#talent-list span[data-n]") !== null;
        if (!inside) closeTooltip();
      };
  }
  openLevelPanel() {
    const mode = this.core.bpMode;
    if (mode !== "level" && mode !== "box") {
      this.closeLevelPanelIfDone();
      return;
    }
    // Issue #71：跳过按钮仅宝箱模式显示
    element("bp-boxskip").classList.toggle("hidden", mode !== "box");
    // 升级面板与宝箱面板共用同一套卡片，只换标题文案
    const box = mode === "box";
    const pending = this.core.mageElementPickPending;
    const title = document.querySelector<HTMLElement>("#bp-level .bp-title");
    if (title)
      title.textContent = box
        ? `🎁 开启宝箱 · 剩余 ${this.core.boxPicks} 次强化 · 强化一项已学天赋`
        : pending === "second"
          ? "☯️ 双修 · 选择第二个元素"
          : pending === "third"
            ? "✴️ 三修 · 选择第三个元素"
            : "⬆ 等级提升！选择一项天赋强化";
    const hint = document.querySelector<HTMLElement>(
      "#bp-level .level-subhint",
    );
    if (hint)
      hint.textContent = box
        ? "只强化已学天赋 · 键盘 1 / 2 / 3 快捷选取"
        : pending === "second"
          ? "只显示尚未持有的元素 · 键盘 1 / 2 快捷选取"
          : pending === "third"
            ? "只显示尚未持有的元素 · 键盘 1 快捷选取"
            : "模拟不暂停 · 键盘 1 / 2 / 3 快捷选取 · 点击卡片下方「刷新」换一张";
    this.drawCards();
    element("bp-level").classList.remove("hidden");
    element("bp-rest").classList.add("hidden");
    element("bottom-bar").classList.remove("hidden");
  }
  closeLevelPanelIfDone() {
    if (this.core.pendingLevels > 0) return;
    element("bp-level").classList.add("hidden");
    // Issue #71：升级选完后若仍有宝箱点数 → 依次开箱
    if (this.core.boxPicks > 0) {
      this.core.openBoxPanel();
      return;
    }
    if (this.core.wavePhase === "rest") {
      this.showRestBar();
    } else {
      element("bottom-bar").classList.add("hidden");
    }
  }
  /**
   * 属性强化面板（S1）：四方向各一格 + 整体刷新一次。
   *
   * 与升级面板共用 `.level-panel` / `.card r{tier}` 的样式，但**单独一套 DOM**——
   * 卡片内容（属性名 + 数值）、快捷键数量（4 个）、刷新语义（整体重掷而非逐张）
   * 都不同，挤进同一节点会让两边都变复杂。
   */
  openAttrPanel() {
    if (this.core.bpMode !== "attr") {
      this.closeAttrPanelIfDone();
      return;
    }
    const g = this.core;
    const title = document.querySelector<HTMLElement>("#attr-title");
    if (title)
      title.textContent =
        g.attrPicks > 1
          ? `◆ 属性强化 · 还剩 ${g.attrPicks} 次`
          : "◆ 属性强化 · 选择一项";
    const hint = document.querySelector<HTMLElement>("#attr-hint");
    if (hint)
      hint.textContent = "模拟不暂停 · 键盘 1 / 2 / 3 / 4 快捷选取 · 刷新会连稀有度一起重掷";
    const btn = element("attr-refresh") as HTMLButtonElement;
    btn.disabled = g.attrRefreshUsed;
    btn.textContent = g.attrRefreshUsed ? "已刷新" : "刷新（每次一次）";
    this.drawAttrCards();
    element("bp-attr").classList.remove("hidden");
    element("bp-level").classList.add("hidden");
    element("bp-rest").classList.add("hidden");
    element("bottom-bar").classList.remove("hidden");
  }
  drawAttrCards() {
    const box = element("attr-cards");
    box.innerHTML = "";
    this.core.attrChoices.forEach((c, i) => {
      const el = document.createElement("div");
      el.className = `card r${c.rarity}`;
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.setAttribute(
        "aria-label",
        `第 ${i + 1} 项：${c.label} ${c.text}，${rarityLabel(c.rarity)}`,
      );
      el.onkeydown = (event) => {
        if (event.target === el && ["Enter", " "].includes(event.key)) {
          event.preventDefault();
          this.core.chooseAttr(i);
        }
      };
      el.innerHTML = `<div class="tier">${rarityLabel(c.rarity)}</div>
      <div class="cat">${groupLabel(c.def.group)}</div>
      <div class="nm">${c.label}</div>
      <div class="ds">${c.text}</div>`;
      el.onclick = () => this.core.chooseAttr(i);
      box.appendChild(el);
    });
  }
  closeAttrPanelIfDone() {
    if (this.core.attrPicks > 0) return;
    element("bp-attr").classList.add("hidden");
    // 与升级面板同一条链：属性 → 天赋 → 宝箱 → 报告
    if (this.core.pendingLevels > 0) {
      this.core.openLevelPanel();
      return;
    }
    if (this.core.boxPicks > 0) {
      this.core.openBoxPanel();
      return;
    }
    if (this.core.wavePhase === "rest") {
      this.showRestBar();
    } else {
      element("bottom-bar").classList.add("hidden");
    }
  }
  showRestBar() {
    // 伤害统计: 合计突出 + 按占比降序
    const damage = this.core.waveDamage();
    const total = Object.values(damage).reduce((a, b) => a + b, 0);
    const items = Object.keys(DMG_NAMES)
      .map((k) => ({
        k,
        v: damage[k as keyof typeof damage] || 0,
      }))
      .filter((x) => x.v > 0.5);
    items.sort((a, b) => b.v - a.v);
    let html = `<span class="tot">合计 ${Math.round(total)}</span>`;
    for (const it of items)
      html += `<span class="it">${DMG_NAMES[it.k]} <b>${Math.round(it.v)}</b> (${((it.v / total) * 100).toFixed(0)}%)</span>`;
    if (total < 0.5) html = '<span class="it">本波没有造成伤害</span>';
    element("bp-report").innerHTML = html;
    // 置换入口：v60 起由 SWAP_ENTRY_ENABLED 统一关闭（原因见常量注释）。
    // 判定必须与 melt() 实际使用的池一致（legacyAvailTalents）——重新开放时
    // 若改池，这里要同步改，否则按钮会静默失效。
    const can =
      SWAP_ENTRY_ENABLED &&
      !this.core.swapUsedThisRest &&
      ((this.core.cardsOfTier(0) >= 2 &&
        this.core.legacyAvailTalents(1).length) ||
        (this.core.cardsOfTier(1) >= 2 &&
          this.core.legacyAvailTalents(2).length) ||
        (this.core.cardsOfTier(2) >= 2 &&
          this.core.legacyAvailTalents(3).length));
    element("bp-swapbtn").style.display = can ? "" : "none";
    element("bp-swap").classList.add("hidden");
    element("bp-level").classList.add("hidden");
    element("bp-rest").classList.remove("hidden");
    element("bottom-bar").classList.remove("hidden");
  }
  setSwTarget(t: number) {
    if (!this.core.setSwapTarget(t)) {
      element("sw-hint").textContent = `${TIERS[t - 1]}卡不足 2 张！`;
      return;
    }
    element("sw-hint").textContent =
      `投入 2 张${TIERS[t - 1]}卡 → 随机熔出 1 张${TIERS[t]}卡（点击下方库存选卡）`;
    this.renderSwInv();
  }
  swSelCount() {
    return this.core.selectedCount();
  }
  renderSwInv() {
    const inv = element("sw-inv");
    const entries = Object.entries(this.core.player.upCounts).sort(
      ([a], [b]) =>
        TIER_VAL[UPGRADES.find((u) => u.n === a)!.t] -
        TIER_VAL[UPGRADES.find((u) => u.n === b)!.t],
    );
    inv.innerHTML = entries.length
      ? entries
          .map(([n, lv]) => {
            const u = UPGRADES.find((u) => u.n === n)!;
            const sel = this.core.swSel[n] || 0;
            return `<span class="t${u.t}${sel ? " sel" : ""}" data-n="${n}" data-t="${u.t}">${u.ico} ${n} Lv.${lv}${sel ? ` (选${sel})` : ""}</span>`;
          })
          .join("")
      : "<span>无库存</span>";
    [...inv.querySelectorAll<HTMLElement>("span[data-n]")].forEach((sp) => {
      sp.onclick = () => {
        const n = sp.dataset.n!;
        if (!this.core.selectMaterial(n)) {
          // Issue #74：两步式下最常见的拒绝原因是材料稀有度不一致
          element("sw-hint").textContent =
            "材料稀有度须一致——请继续选同稀有度的天赋";
          return;
        }
        this.updateSwapHint();
        this.renderSwInv();
      };
    });
    this.updateSwapHint();
  }
  /** Issue #69：根据已选材料更新提示与熔炼按钮状态 */
  updateSwapHint() {
    const count = this.swSelCount();
    const hint = element("sw-hint");
    const mb = element("sw-melt") as HTMLButtonElement;
    mb.textContent = `🔥 熔 炼 (${count}/2)`;
    if (count < 2) {
      hint.textContent = `再选 ${2 - count} 个等级的材料（可重复点同一张）`;
      mb.disabled = true;
      mb.style.opacity = "0.4";
      return;
    }
    if (!this.core.swTarget) {
      hint.textContent = "两块材料稀有度不同，无法置换——请换选同稀有度的材料";
      mb.disabled = true;
      mb.style.opacity = "0.4";
      return;
    }
    hint.textContent = `可随机熔出 1 张${TIERS[this.core.swTarget]}天赋 · 点击熔炼确认`;
    // 同上：材料档的产出池也用熔炉实际使用的旧表池
    mb.disabled = !this.core.legacyAvailTalents(this.core.swTarget).length;
    mb.style.opacity = mb.disabled ? "0.4" : "1";
  }

  /** 关闭最上层覆盖面板；返回是否关闭了某层（键位路由据此决定是否继续处理）。 */
  dismissOverlay(): boolean {
    if (this.codex.isOpen) {
      this.codex.close();
      return true;
    }
    return false;
  }

  /** 是否有覆盖面板打开：用于屏蔽 C 键等战斗内快捷键。 */
  hasOverlay(): boolean {
    return this.codex.isOpen;
  }

  private renderPause(): void {
    this.disarmRestart();
    const core = this.core;
    const talentCount = Object.keys(core.player.upCounts).length;
    element("pause-stats").textContent =
      `第 ${core.waveN} 波 · ${fmtTime(core.time)} · Lv.${core.player.lvl} ｜ 击杀 ${core.kills} · 天赋 ${talentCount}`;
    element("pause-version").textContent = `Pixel Rogue · ${CURRENT_VERSION}`;
  }

  /**
   * 暂停界面的「重新开始」回到主界面，允许重新选择职业。
   *
   * 不立即重置 player：职业按钮调用 startGame 时才重建新局，避免先按本局
   * 职业重建一次再被覆盖。
   */
  private returnToStart(): void {
    this.disarmRestart();
    this.codex.close();
    this.core.clearTouchInput();
    this.core.state = "start";
    this.core.view.reset();
    ["ov-pause", "ov-over", "ov-stats", "ov-changelog"].forEach(hide);
    show("ov-start");
    for (const id of ["btn-start", "btn-prof-mage"]) {
      const button = element(id) as HTMLButtonElement;
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }

  /** 重新开始需二次确认：首次点击只改按钮文案，4 秒内没有第二次点击则自动复原。 */
  private armRestart(): void {
    this.restartArmed = true;
    const button = element("btn-restart");
    button.textContent = "再点一次确认";
    button.classList.add("armed");
    window.clearTimeout(this.restartTimer);
    this.restartTimer = window.setTimeout(() => this.disarmRestart(), 4000);
  }

  private disarmRestart(): void {
    this.restartArmed = false;
    window.clearTimeout(this.restartTimer);
    this.restartTimer = undefined;
    const button = element("btn-restart");
    button.textContent = "重 新 开 始";
    button.classList.remove("armed");
  }
}
