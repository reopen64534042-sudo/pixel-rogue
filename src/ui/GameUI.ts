import type { GameCore } from "../game/core/GameCore";
import { playerMoveSpeed } from "../game/core/PlayerSystem";
import { tutorialGemStep, tutorialTotalSteps } from "../game/core/TutorialSystem";
import type { WarriorStyle } from "../game/core/types";
import { groupLabel, rarityLabel } from "../game/core/AttributeSystem";
import { CHANGELOG, CURRENT_VERSION } from "../game/data/changelog";
import { resolveDifficulty } from "../game/data/difficulty";
import {
  UPGRADES,
  TIERS,
  TIER_VAL,
  CAT_COLOR,
  CAT_ICO,
  chainDisplayLayer,
  displayTalentTier,
  mageElements,
} from "../game/data/talents";
import { fmtTime } from "../game/data/constants";
import { waveTheme } from "../game/data/enemies";
import { boltDamage, critMultiplier } from "../game/core/DamageMath";
import { professionPierce } from "../game/core/AttributeSources";
import { COMBAT_BALANCE } from "../game/data/combatBalance";
import {
  DEFAULT_KEYBINDS,
  KEY_ACTIONS,
  findKeyConflict,
  isBindableKey,
  keyLabel,
  loadKeyBindings,
  normalizeKey,
  saveKeyBindings,
  type KeyAction,
} from "../game/data/keybindings";
import { MAGE_BALANCE } from "../game/data/mageBalance";
import { statBase } from "../game/data/stats";
import {
  WARRIOR_BALANCE,
  warriorTriDashCd,
} from "../game/data/warriorBalance";
import {
  warriorIaiCap,
  warriorSwingDamage,
} from "../game/core/WarriorSystem";
import { KNOCK, knockLevel } from "../game/data/knockback";
import {
  markTutorialSeen,
  tutorialSeen,
  TUTORIAL_NEXT_KEY,
  TUTORIAL_SKIP_KEY,
} from "../game/data/tutorialState";
import {
  SPECIAL_LEVELS,
  SPECIAL_UPGRADES,
  getSpecialLevelStats,
} from "../game/data/specialShot";
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

/** 连闪是共享卡，但锐势/重斩就绪互斥；面板与卡面只展示当前流派。 */
function lianShanDesc(style: WarriorStyle): string {
  const base =
    `冲刺充能 +1 次（上限 2 次），冷却降至 ${WARRIOR_BALANCE.lianShan.cdTarget.toFixed(1)} 秒；` +
    "冲刺穿过敌人时每个返还 10% 冷却（每次最多 30%）并减速 30%/1.5 秒。";
  const branch =
    style === "katana"
      ? "太刀：冲刺后 2 秒暴击率与暴击伤害 +30%。"
      : "大剑：冲刺后 2 秒内下一次挥砍视为重斩（不推进重斩计数）。";
  return base + branch + "与「三段斩」互斥。";
}


/**
 * 置换（熔炉）入口开关。
 *
 * v60 起关闭：新职业池没有稀有度分层（法师 18 张全 t0、max 1），而 melt()
 * 的产出池走 legacyAvailTalents——法师局投入 2 张法师卡会熔出旧表退役卡。
 * 按 2026-10-28 裁定「先关入口、保留实现」：SwapSystem/melt 与单元测试不动，
 * 重新开放时改这里并同步池规则。
 */
const SWAP_ENTRY_ENABLED: boolean = false;

/** 低血量红边阈值：与 HUD 血条变红阈值一致（draw.ts 的 <0.45）。 */
const LOW_HP_RATIO = 0.45;

export class GameUI {
  /** 图鉴面板：开始界面与暂停界面共用同一实例（Issue #78） */
  readonly codex: CodexUI;
  /** 重新开始的二次确认态（Issue #81） */
  private restartArmed = false;
  private restartTimer: number | undefined;
  /** 低血量屏幕边缘提示层（index.html 的静态节点） */
  private lowHpEl: HTMLElement | null = null;
  /** 设置菜单 / 键位子窗口 / 改键捕获态（v79，v81 拆子窗口） */
  private settingsOpen = false;
  private keybindsOpen = false;
  private captureAction: KeyAction | null = null;
  private settingsHint = "";
  private tutorialPickOpen = false;
  private warriorPickMode: "start" | "tutorial" = "start";
  private tutorialHudEl: HTMLElement | null = null;
  private tutorialSig = "";
  constructor(public core: GameCore) {
    this.codex = new CodexUI(core);
    core.keybinds = loadKeyBindings();
    core.view = {
      reset: () => this.reset(),
      started: () => {
        [
          "ov-start",
          "ov-over",
          "ov-pause",
          "ov-stats",
          "ov-settings",
          "ov-keybinds",
          "ov-prof-pick",
          "ov-tutorial-pick",
          "ov-warrior-style",
        ].forEach(hide);
        this.settingsOpen = false;
        this.keybindsOpen = false;
        this.captureAction = null;
        this.tutorialPickOpen = false;
        this.tutorialHudEl?.classList.add("hidden");
        this.tutorialSig = "";
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
          // 防御：恢复游戏时若图鉴/设置仍开着，一并收起，避免盖住战斗画面
          this.codex.close();
          if (this.settingsOpen) this.closeSettings();
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
    // v99：主界面只保留「开始游戏」，职业在二级界面选择。
    // 职业必须在 startGame 里先定，否则 openLevelPanel 会按上一个职业抽第一批卡。
    element("btn-start").onclick = () => this.openProfessionPick();
    element("btn-pick-shooter").onclick = () =>
      this.startProfession("shooter");
    element("btn-pick-mage").onclick = () => this.startProfession("mage");
    element("btn-pick-warrior").onclick = () =>
      this.openWarriorStyle("start");
    element("btn-prof-pick-back").onclick = () => this.closeProfessionPick();
    this.renderProfessionStats();
    element("btn-warrior-katana").onclick = () =>
      this.chooseWarriorStyle("katana");
    element("btn-warrior-greatsword").onclick = () =>
      this.chooseWarriorStyle("greatsword");
    element("btn-warrior-style-back").onclick = () =>
      this.backFromWarriorStyle();
    // Issue #55：开始界面版本号 + 更新日志面板
    element("start-version").textContent =
      `Pixel Rogue · ${CURRENT_VERSION} · 试玩版`;
    element("btn-tutorial").onclick = () => this.openTutorialPick();
    element("btn-tutorial-shooter").onclick = () =>
      this.startTutorialFor("shooter");
    element("btn-tutorial-mage").onclick = () => this.startTutorialFor("mage");
    element("btn-tutorial-warrior").onclick = () =>
      this.openWarriorStyle("tutorial");
    element("btn-tutorial-pick-back").onclick = () => this.closeTutorialPick();
    element("btn-tutorial-skip").onclick = () => this.skipTutorial();
    element("btn-tutorial-next").onclick = () => this.core.advanceTutorial();
    element("btn-tutorial-start").onclick = () => this.finishTutorialRun();
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
    element("btn-retry").onclick = () =>
      this.core.startGame(this.core.prof, this.core.warriorStyle);
    element("btn-resume").onclick = () => this.core.togglePause();
    element("btn-pause-codex").onclick = () => this.codex.open();
    // Issue #100：触屏没有 C 键，属性面板从暂停界面进入
    element("btn-pause-stats").onclick = () => this.core.openStatsFromPause();
    element("btn-pause-settings").onclick = () => this.openSettings();
    element("btn-settings-keys").onclick = () => this.openKeybinds();
    element("btn-keyreset").onclick = () => {
      this.core.keybinds = { ...DEFAULT_KEYBINDS };
      saveKeyBindings(this.core.keybinds);
      this.captureAction = null;
      this.settingsHint = "已恢复默认键位";
      this.renderKeybindings();
      this.syncKeyLabels();
    };
    element("btn-keybinds-back").onclick = () => this.closeKeybinds();
    element("btn-settings-close").onclick = () => this.closeSettings();
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
      this.nextWave();
    };
    for (const id of [
      "btn-start",
      "btn-pick-shooter",
      "btn-pick-mage",
      "btn-pick-warrior",
    ]) {
      (element(id) as HTMLButtonElement).disabled = false;
      element(id).removeAttribute("aria-busy");
    }
    // #182：按钮上的键位文案跟随已保存的键位，不再依赖 index.html 的硬编码
    this.syncKeyLabels();
  }

  /**
   * #182：把当前键位写回按钮文案。
   *
   * 此前 `index.html` 把 `(P)` / `(C)` 直接写在按钮里，设置里改键后永远不更新。
   * 固定键（R 重开、F/X 教程、M 静音、F2 开发者面板）不参与改键，保持原样。
   * 调用时机：构造时、恢复默认键位后、单个键位保存后。
   */
  syncKeyLabels() {
    // 复用 keyLabel()：与键位设置面板同一套格式化（空格 / Esc / 方向键 / 大写）
    element("btn-pause").textContent =
      `⏸ 暂停 (${keyLabel(this.core.keybinds.pause)})`;
    const statClose = document.getElementById("btn-statclose");
    if (statClose)
      statClose.textContent = `返回战斗 (${keyLabel(this.core.keybinds.stats)})`;
    const nextBtn = document.getElementById("bp-next");
    if (nextBtn)
      nextBtn.textContent = `下一波 (${keyLabel(this.core.keybinds.nextWave)})`;
  }

  /** v128：休整面板的「下一波」快捷键是否可用（按钮实际可见时才生效）。 */
  canUseNextWaveShortcut(): boolean {
    const bar = document.getElementById("bp-rest");
    return (
      !!bar &&
      !bar.classList.contains("hidden") &&
      this.core.state === "play" &&
      !this.hasOverlay()
    );
  }

  /** 与「下一波」按钮完全同一条路径；返回是否真的进入了下一波。 */
  nextWave(): boolean {
    if (!this.core.startNextWave()) return false;
    element("bottom-bar").classList.add("hidden");
    element("bp-rest").classList.add("hidden");
    element("bp-swap").classList.add("hidden");
    return true;
  }
  reset() {
    [
      "bottom-bar",
      "bp-level",
      "bp-attr",
      "bp-rest",
      "bp-swap",
      "ov-settings",
      "ov-keybinds",
      "ov-prof-pick",
      "ov-tutorial-pick",
      "ov-warrior-style",
    ].forEach(hide);
    this.settingsOpen = false;
    this.keybindsOpen = false;
    this.captureAction = null;
    this.tutorialPickOpen = false;
    this.tutorialHudEl?.classList.add("hidden");
    this.tutorialSig = "";
    if (this.lowHpEl) this.lowHpEl.style.opacity = "0";
  }
  /**
   * 低血量屏幕边缘提示（v77）。
   *
   * 仅战斗中显示；与 HUD 血条同阈值（<45%），越低越明显；不做循环闪烁
   * （表现层铁律：状态优先用颜色，不用动画抢注意力）。
   */
  syncLowHp() {
    const overlay =
      this.lowHpEl ??
      (this.lowHpEl = document.getElementById("low-hp-vignette"));
    if (!overlay) return;
    const p = this.core.player;
    const ratio = p.maxhp > 0 ? p.hp / p.maxhp : 0;
    const active =
      this.core.state === "play" && ratio > 0 && ratio < LOW_HP_RATIO;
    const opacity = active
      ? Math.min(0.95, 0.34 + (LOW_HP_RATIO - ratio) * 3.0)
      : 0;
    const next = opacity.toFixed(3);
    if (overlay.style.opacity !== next) overlay.style.opacity = next;
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
      const desc =
        u.n === "连闪"
          ? lianShanDesc(this.core.warriorStyle)
          : u.dyn
            ? u.dyn(this.core.player)
            : u.d;
      const el = document.createElement("div");
      const displayTier = displayTalentTier(u, UPGRADES);
      // Issue #35：本局首次选卡时全部标 NEW，之后仅机制型 Lv.0 标记
      const firstPick = this.core.player.picks.length === 0;
      el.className =
        "card r" +
        displayTier +
        (lv === 0 && (u.mech || firstPick) ? " new" : "");
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", `${u.n}，${TIERS[displayTier]}，${desc}`);
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
      const chainLayer = chainDisplayLayer(u, UPGRADES);
      const chainInfo = chainLayer
        ? `<div class="chain">L${chainLayer}${u.requires ? ` · 需 ${u.requires}` : ""}</div>`
        : u.slot === "秘传"
          ? `<div class="chain">秘传${u.requires ? ` · 需 ${u.requires}` : ""}</div>`
          : "";
      el.innerHTML = `${displayTier > 0 ? `<div class="tier">${TIERS[displayTier]}</div>` : ""}
      <div class="cat" style="color:${CAT_COLOR[u.cat]}">${CAT_ICO[u.cat]} ${u.cat}</div>
      <div class="ico">${u.ico}</div><div class="nm">${u.n}${u.mech && lv === 0 ? " ✦NEW" : ""}</div>
      ${chainInfo}
      <div class="ds"><span class="ds-inner">${desc}</span></div>`;
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
    const isWarrior = this.core.prof === "warrior";
    const flowCap = isWarrior
      ? (p.upCounts["流·极"] || 0) > 0
        ? WARRIOR_BALANCE.flow.cap3
        : (p.upCounts["流·续"] || 0) > 0
          ? WARRIOR_BALANCE.flow.cap2
          : (p.upCounts["流·初"] || 0) > 0
            ? WARRIOR_BALANCE.flow.cap1
            : 0
      : 0;
    // 元素名（法师「当前元素」行）
    const ELEM_LABEL: Record<string, string> = {
      fire: "火",
      frost: "冰",
      lightning: "雷",
    };
    const elems = isMage ? mageElements(p) : [];
    // 「居合」的势：势只增不减，满层后下一刀自动变居合斩（见 warriorBalance.iai）
    const iaiCap =
      isWarrior && this.core.warriorStyle === "katana"
        ? warriorIaiCap(this.core)
        : 0;
    const triStage = this.core.warriorTriDashStage;
    const triLeapOwned = (p.upCounts["跃击"] || 0) > 0;
    const triLabel =
      triStage === 0
        ? "扇斩"
        : triStage === 1
          ? triLeapOwned
            ? "旋斩"
            : "扇斩"
          : triLeapOwned
            ? "跃击"
            : "旋斩";
    const iaiStacks = this.core.warriorIaiStacks;
    const outputRows: [string, string | number][] = [
      // 文案更名（S3-C）：p.damage 是攻击基线（技能系数/raw），非 globalDamageBonus
      // #178：战士首行显示实际普通挥砍伤害（攻击基线）；流只增幅居合，
      // 由下方「流层数」行单独标注；条件倍率（重斩/破围/气势）也各自成行。
      isMage
        ? ["🔮 元素伤害", p.damage.toFixed(1)]
        : isWarrior
          ? ["⚔️ 近战伤害", warriorSwingDamage(this.core).toFixed(1)]
          : ["⚔️ 基础攻击", p.damage.toFixed(1)],
      // 战士职业底座：近战无视护甲，面板显式展示，避免伤害变化无解释。
      ...(isWarrior
        ? ([["🪓 护甲穿透", pct(WARRIOR_BALANCE.armorPen)]] as [
            string,
            string | number,
          ][])
        : []),
      ...(isMage
        ? ([
            [
              "☄️ 法阵伤害",
              (p.damage * MAGE_BALANCE.castDamageMul).toFixed(1),
            ],
          ] as [string, string | number][])
        : isWarrior
          ? this.core.warriorStyle === "greatsword"
            ? ([
                ["🪓 重斩", "每 3 下 · 250% · 范围 +50%"],
                ...((p.upCounts["三段斩"] || 0) > 0
                  ? ([
                      [
                        "🌀 冲刺段",
                        `${triStage + 1}/3 · ${triLabel} · CD ${warriorTriDashCd(p.dashMax, p.lvl).toFixed(1)}s`,
                      ],
                    ] as [string, string][])
                  : []),
                ...(this.core.warriorHeavyReadyT > 0
                  ? ([
                      [
                        "🗡️ 下一刀",
                        `重斩就绪 · 剩 ${this.core.warriorHeavyReadyT.toFixed(1)}s`,
                      ],
                    ] as [string, string][])
                  : []),
                ...(this.core.warriorLeapInvulnT > 0
                  ? ([
                      [
                        "🛡️ 跃击无敌",
                        `剩 ${this.core.warriorLeapInvulnT.toFixed(1)}s`,
                      ],
                    ] as [string, string][])
                  : []),
                ...(p.shieldMax > 0
                  ? ([
                      [
                        "🛡️ 护盾",
                        `${p.shield}/${p.shieldMax}${
                          p.shield < p.shieldMax
                            ? ` · 下层 ${Math.ceil(p.shieldCd)}s`
                            : ""
                        }`,
                      ],
                    ] as [string, string][])
                  : []),
                ...(this.core.warriorBloodDebtStacks > 0
                  ? ([
                      [
                        "🩸 血偿",
                        `${this.core.warriorBloodDebtStacks}/${WARRIOR_BALANCE.counterChain.bloodDebtMaxStacks} · 剩 ${this.core.warriorBloodDebtT.toFixed(1)}s`,
                      ],
                    ] as [string, string][])
                  : []),
              ] as [string, string | number][])
            : iaiCap > 0
              ? ([
                  [
                    "⚔️ 居合势",
                    iaiStacks >= iaiCap
                      ? `${iaiStacks}/${iaiCap} · 下一刀居合`
                      : `${iaiStacks}/${iaiCap}`,
                  ],
                ] as [string, string | number][])
              : []
          : ([
              [
                "🏹 普通魔弹",
                boltDamage(p).toFixed(1) +
                  (p.boltDmgMul > 1 ? ` ×${p.boltDmgMul.toFixed(2)}` : ""),
              ],
              [
                "✨ 强化弹伤害",
                (
                  boltDamage(p) *
                  getSpecialLevelStats(this.core.specialLevel).mul
                ).toFixed(1),
              ],
            ] as [string, string | number][])),
      isMage
        ? ["⚡ 施法速度", p.fireRate.toFixed(2) + " 次/秒"]
        : [
            "⚡ 攻速",
            (p.fireRate * (1 + p.haste * 0.1)).toFixed(2) +
              " /秒" +
              (p.haste ? ` (狂热 +${p.haste * 10}%)` : ""),
          ],
      [
        "💥 暴击",
        (Math.min(
          1,
          p.crit +
            (isWarrior && this.core.warriorLianShanT > 0
              ? WARRIOR_BALANCE.lianShan.critBonus
              : 0),
        ) *
          100
        ).toFixed(0) +
          "%" +
          (isWarrior && this.core.warriorLianShanT > 0
            ? `（锐势 +${(WARRIOR_BALANCE.lianShan.critBonus * 100).toFixed(0)}% · 剩 ${this.core.warriorLianShanT.toFixed(1)}s）`
            : ""),
      ],
      [
        "💥 暴击伤害",
        (
          (critMultiplier(p) +
            (isWarrior && this.core.warriorLianShanT > 0
              ? WARRIOR_BALANCE.lianShan.critBonus
              : 0)) *
          100
        ).toFixed(0) +
          "%" +
          (isWarrior && this.core.warriorLianShanT > 0
            ? `（锐势 +${(WARRIOR_BALANCE.lianShan.critBonus * 100).toFixed(0)}%）`
            : ""),
      ],
      // 职业专属输出行：法师当前元素，射手穿透，战士流层数。
      ...(isMage
        ? ([
            [
              "🔮 当前元素",
              elems.length ? elems.map((e) => ELEM_LABEL[e]).join(" · ") : "无",
            ],
          ] as [string, string | number][])
        : isWarrior
          ? flowCap > 0
            ? ([
                [
                  "🌊 流层数",
                  `${this.core.warriorFlowStacks} / ${flowCap}${
                    this.core.warriorFlowStacks > 0
                      ? ` · 居合 +${Math.round(
                          WARRIOR_BALANCE.flow.dmgPerStack *
                            this.core.warriorFlowStacks *
                            100,
                        )}%`
                      : ""
                  }${
                    (p.upCounts["流·极"] || 0) > 0 &&
                    this.core.warriorFlowStacks >= flowCap
                      ? " · 下一刀居合强化"
                      : ""
                  }`,
                ],
              ] as [string, string | number][])
            : []
          : ([
              ["🔱 穿透", p.pierce + professionPierce(this.core.prof)],
            ] as [string, string | number][])),
      // 全局增伤：法师保留完整行；射手/战士只在非零时显示。
      ...(isMage || p.globalDamageBonus
        ? ([
            [
              "✴️ 全局增伤",
              p.globalDamageBonus ? "+" + pct(p.globalDamageBonus) : "—",
            ],
          ] as [string, string | number][])
        : []),
      ...(isMage
        ? ([
            ["🌡️ 火焰增伤", typeBonus.fire ? "+" + pct(typeBonus.fire) : "—"],
            [
              "🌩️ 雷电增伤",
              typeBonus.lightning ? "+" + pct(typeBonus.lightning) : "—",
            ],
            ["❄️ 冰霜增伤", typeBonus.frost ? "+" + pct(typeBonus.frost) : "—"],
          ] as [string, string | number][])
        : []),
    ];
    const knockRows: [string, string | number][] = [];
    if (isMage) {
      const meteorRoute = (p.upCounts["星陨"] || 0) > 0;
      knockRows.push([
        meteorRoute ? "☄️ 陨星" : "🔮 法阵",
        knockLevel(meteorRoute ? KNOCK.mage.meteor : KNOCK.mage.cast),
      ]);
    } else if (isWarrior) {
      const style = WARRIOR_BALANCE.styles[this.core.warriorStyle];
      knockRows.push(["⚔️ 挥砍", knockLevel(style.knock)]);
      if (this.core.warriorStyle === "greatsword")
        knockRows.push([
          "🪓 重斩",
          knockLevel(style.knock * WARRIOR_BALANCE.heavyKnockMul),
        ]);
      if ((p.upCounts["破围"] || 0) > 0)
        knockRows.push([
          "🪓 破围挥砍（3 敌+）",
          knockLevel(style.knock * WARRIOR_BALANCE.breakoutKnockMul),
        ]);
      if ((p.upCounts["剑气"] || 0) > 0)
        knockRows.push(["🗡️ 剑气", knockLevel(KNOCK.warrior.qi)]);
      if ((p.upCounts["跃击"] || 0) > 0)
        knockRows.push(["🦘 跃击", knockLevel(KNOCK.warrior.leap)]);
      if ((p.upCounts["斩浪"] || 0) > 0)
        knockRows.push(["💨 斩浪", knockLevel(KNOCK.warrior.dash)]);
    } else {
      knockRows.push(["🏹 普通魔弹", knockLevel(KNOCK.shooter.bolt)]);
      knockRows.push(["✨ 强化弹", knockLevel(KNOCK.shooter.charged)]);
      if (this.core.specialUpgrades.includes("missile"))
        knockRows.push(["🚀 导弹", knockLevel(KNOCK.shooter.missile)]);
      if (this.core.specialUpgrades.includes("laser"))
        knockRows.push(["🔆 激光", knockLevel(KNOCK.shooter.laser)]);
    }
    if (p.orbit > 0)
      knockRows.push(["🌀 环绕飞刃", knockLevel(KNOCK.orbit)]);
    // 被动反击也占击退预算（护盾破碎反震 / 荆棘受击反伤），
    // 有对应构筑时才列出来，避免空行干扰。
    if (p.shield > 0)
      knockRows.push(["🛡️ 护盾反震", knockLevel(KNOCK.shock)]);
    if (p.thorns > 0)
      knockRows.push(["🌵 荆棘反伤", knockLevel(KNOCK.thorns)]);

    const survivalRows: [string, string | number][] = [
      ["❤️ 生命", `${Math.ceil(p.hp)} / ${p.maxhp}`],
      // S3-C：护甲/元素抗性与战斗计算同公式（K/(K+DEF)，与减伤乘算）
      [
        "🪨 护甲",
        p.defense ? `${p.defense}（物理 -${physMit(p.defense)}%）` : "—",
      ],
      // 射手当前天赋/属性池没有三系抗性来源，隐藏这些空行；法师保留。
      ...(isMage
        ? ([
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
          ] as [string, string | number][])
        : []),
      ["🌀 闪避", p.dodge ? (p.dodge * 100).toFixed(0) + "%" : "—"],
    ];
    const sustainRows: [string, string | number][] = [
      [
        "🦷 吸血",
        p.lifesteal ? (p.lifesteal * 100).toFixed(1) + "%" : "—",
      ],
      ["✨ 生命回复", p.regen ? p.regen.toFixed(1) + " /秒" : "—"],
    ];
    const utilityRows: [string, string | number][] = [
      // 显示当前实际移速（含冲刺/闪避加成与蛛网减速），不再单独列冲刺加成行。
      ["👟 移动速度", Math.round(playerMoveSpeed(this.core))],
      [
        isMage ? "🎯 施法距离" : isWarrior ? "🎯 近战范围" : "🎯 射程",
        Math.round(p.attackRange),
      ],
      ...(isMage
        ? ([
            ["🌐 法阵范围", "×" + p.area.toFixed(2)],
          ] as [string, string | number][])
        : []),
    ];
    const dynamicDifficulty = resolveDifficulty(
      this.core.prof,
      this.core.waveN,
      this.core.qualityScore,
    );
    const infoRows: [string, string | number][] = [
      ["📈 等级", p.lvl],
      ["📘 下级所需经验", p.xpNext],
      [
        "🌊 当前波次",
        `${this.core.waveN} · ${waveTheme(this.core.waveN).name}（配额 ${this.core.quota}）`,
      ],
      ...(dynamicDifficulty.hpMul === 1 &&
      dynamicDifficulty.attackMul === 1 &&
      dynamicDifficulty.armorAdd === 0 &&
      dynamicDifficulty.totalDr <= 0.0001
        ? []
        : ([
            [
              "🌪️ 动态难度",
              `减伤 ${(dynamicDifficulty.totalDr * 100).toFixed(0)}% · 生命 ×${dynamicDifficulty.hpMul.toFixed(2)} · 护甲 +${Math.round(dynamicDifficulty.armorAdd)} · 攻击 ×${dynamicDifficulty.attackMul.toFixed(2)}`,
            ],
          ] as [string, string | number][])),
    ];

    const renderRows = (items: [string, string | number][]) =>
      items
        .map(([k, v]) => {
          const isDim = v === "—" || v === "未学习";
          return `<div class="row${isDim ? " dim" : ""}"><span class="k">${k}</span><span class="v${isDim ? " dim" : ""}">${v}</span></div>`;
        })
        .join("");

    const outputEl = document.getElementById("stat-combat");
    const knockEl = document.getElementById("stat-knockback");
    const survivalEl = document.getElementById("stat-defense");
    const sustainEl = document.getElementById("stat-sustain");
    const utilityEl = document.getElementById("stat-utility");
    const infoEl = document.getElementById("stat-info");
    if (outputEl) outputEl.innerHTML = renderRows(outputRows);
    if (knockEl) knockEl.innerHTML = renderRows(knockRows);
    if (survivalEl) survivalEl.innerHTML = renderRows(survivalRows);
    if (sustainEl) sustainEl.innerHTML = renderRows(sustainRows);
    if (utilityEl) utilityEl.innerHTML = renderRows(utilityRows);
    if (infoEl) infoEl.innerHTML = renderRows(infoRows);

    // 强化弹：射手专属成长信息，法师隐藏整组。
    const specialTitle = document.getElementById("stat-special-title");
    const specialEl = document.getElementById("stat-special");
    const specialUpgradesTitle = document.getElementById(
      "stat-special-upgrades-title",
    );
    const specialUpgradesEl = document.getElementById(
      "stat-special-upgrades",
    );
    const specialUpgradesList = document.getElementById(
      "stat-special-upgrades-list",
    );
    const isShooter = this.core.prof === "shooter";
    if (specialTitle) specialTitle.style.display = isShooter ? "" : "none";
    if (specialUpgradesEl)
      specialUpgradesEl.style.display = isShooter ? "" : "none";
    if (specialEl) {
      specialEl.style.display = isShooter ? "" : "none";
      if (isShooter) {
        const level = this.core.specialLevel;
        const specialStats = getSpecialLevelStats(level);
        const maxed =
          level >= SPECIAL_LEVELS.length || specialStats.xpToNext === null;
        const upgrades = this.core.specialUpgrades.flatMap((id) => {
          const found = SPECIAL_UPGRADES.find((item) => item.id === id);
          return found ? [found] : [];
        });
        const rows: [string, string][] = [
          [
            "🏹 等级",
            maxed ? "MAX" : `Lv.${level} / ${SPECIAL_LEVELS.length}`,
          ],
          ["🔱 强化穿透", `+${specialStats.pierceBonus}`],
          ["🕊️ 飞行", specialStats.infiniteFlight ? "无限" : "有限"],
          [
            "📘 下一级经验",
            maxed
              ? "MAX"
              : `${this.core.specialXp} / ${specialStats.xpToNext}`,
          ],
        ];
        specialEl.innerHTML = renderRows(rows);
        if (specialUpgradesTitle)
          specialUpgradesTitle.textContent =
            `当前升级 (${upgrades.length}/${SPECIAL_UPGRADES.length})`;
        if (specialUpgradesList)
          specialUpgradesList.innerHTML = upgrades.length
            ? upgrades
                .map(
                  (upgrade) =>
                    `<div class="special-upgrade"><span class="su-name">${upgrade.name}</span><span class="su-desc">${upgrade.desc}</span></div>`,
                )
                .join("")
            : '<div class="special-upgrade-empty">尚未获得强化弹升级</div>';
      }
    }

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
          const chainLayer = chainDisplayLayer(u, UPGRADES);
          const displayTier = displayTalentTier(u, UPGRADES);
          const suffix =
            u.max > 1
              ? ` Lv.${lv}`
              : chainLayer
                ? ` L${chainLayer}`
                : "";
          html += `<span class="talent-tag t${displayTier}" data-n="${n}">${u.ico} ${n}${suffix}</span>`;
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
      const desc =
        u.n === "连闪"
          ? lianShanDesc(this.core.warriorStyle)
          : u.dyn
            ? u.dyn(p)
            : u.d;
      const curDesc =
        u.n === "连闪"
          ? this.core.warriorStyle === "katana"
            ? "冲刺后 2 秒锐势：暴击率与暴击伤害 +30%"
            : "冲刺后 2 秒内下一刀视为重斩"
          : u.cur
            ? u.cur(p)
            : desc;
      const catColor = CAT_COLOR[u.cat] || "#57e6ff";
      const chainLayer = chainDisplayLayer(u, UPGRADES);
      const displayTier = displayTalentTier(u, UPGRADES);
      // 一次性天赋（max 1）不显示等级与「当前等级生效效果」：
      // 二者对 max 1 的卡是重复信息，机制说明已包含全部内容。
      const showLevel = u.max > 1;

      tooltip.className = `talent-tooltip tt-t${displayTier}`;
      tooltip.innerHTML = `
        <div class="tt-header">
          <span class="tt-ico">${u.ico}</span>
          <div class="tt-title-wrap">
            <div class="tt-name t${displayTier}">${u.n}</div>
            <div class="tt-sub">
              <span class="tt-tier t${displayTier}">${TIERS[displayTier]}</span>
              <span class="tt-cat" style="color:${catColor}">[${u.cat}${chainLayer ? ` · L${chainLayer}` : ""}]</span>
              ${showLevel ? `<span class="tt-lvl">Lv.${lv} / ${u.max}</span>` : ""}
            </div>
          </div>
        </div>
        <div class="tt-divider"></div>
        <div class="tt-section">
          <div class="tt-label">天赋机制说明</div>
          <div class="tt-desc">${desc}</div>
        </div>
        ${
          showLevel
            ? `<div class="tt-cur-box">
                 <div class="tt-label">当前等级生效效果 (Lv.${lv})</div>
                 <div class="tt-cur-val">${curDesc}</div>
               </div>`
            : ""
        }
        ${
          lv < u.max
            ? `<div class="tt-next-box">
                 <div class="tt-label">下级提升预览</div>
                 <div class="tt-next-val">${u.pv(p)}</div>
               </div>`
            : ""
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
        `◆ 属性强化 · 升级点 ${g.attributePoints} · 本次可分配 ${g.attrPicks}`;
    const hint = document.querySelector<HTMLElement>("#attr-hint");
    if (hint)
      hint.textContent =
        "模拟不暂停 · 四格顺序随机 · 键盘 1 / 2 / 3 / 4 快捷选取 · 刷新会连稀有度一起重掷" +
        (g.attrQualityBoosts > 0
          ? ` · 宝箱祝福 ×${g.attrQualityBoosts}：选中项品质 +1`
          : "");
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
    if (this.core.attrPicks > 0 && this.core.attributePoints > 0) return;
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
    // v128：按钮文案跟随「下一波」键位（默认 F，可在设置中改）。
    element("bp-next").textContent =
      `下一波 (${keyLabel(this.core.keybinds.nextWave)})`;
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

  /** v99：主界面「开始游戏」进入二级职业选择。 */
  private openProfessionPick(): void {
    if (this.core.state !== "start") return;
    hide("ov-start");
    show("ov-prof-pick");
  }

  private closeProfessionPick(): void {
    hide("ov-prof-pick");
    show("ov-start");
  }

  /** 职业卡属性与 statBase 同源，数值调整后不会与卡片说明漂移。 */
  private renderProfessionStats(): void {
    document
      .querySelectorAll<HTMLElement>("[data-prof][data-stat]")
      .forEach((el) => {
        const prof = el.dataset.prof as "shooter" | "mage" | "warrior";
        const stat = el.dataset.stat;
        const base = statBase(prof, "katana");
        if (prof === "warrior" && stat === "damage") {
          el.textContent = `${base.damage} / ${statBase("warrior", "greatsword").damage}`;
          return;
        }
        const value =
          stat === "maxhp"
            ? base.maxhp
            : stat === "speed"
              ? base.speed
              : stat === "damage"
                ? base.damage
                : stat === "defense"
                  ? ((base as { defense?: number }).defense ?? 0)
                  : 0;
        el.textContent =
          stat === "defense" && !value ? "—" : String(value);
      });
  }

  /** 首次选职业自动进入教程；已看过的职业直接正式开局。 */
  private startProfession(
    prof: "shooter" | "mage" | "warrior",
    warriorStyle?: WarriorStyle,
  ): void {
    if (prof === "warrior" && !warriorStyle) {
      this.openWarriorStyle("start");
      return;
    }
    if (tutorialSeen(prof)) this.core.startGame(prof, warriorStyle);
    else this.core.startTutorial(prof, warriorStyle);
  }

  private openWarriorStyle(mode: "start" | "tutorial"): void {
    this.warriorPickMode = mode;
    hide(mode === "start" ? "ov-prof-pick" : "ov-tutorial-pick");
    show("ov-warrior-style");
  }

  private closeWarriorStyle(): void {
    hide("ov-warrior-style");
  }

  /** 流派返回：回到打开它的上一层，而不是透出两层按钮。 */
  private backFromWarriorStyle(): void {
    this.closeWarriorStyle();
    show(
      this.warriorPickMode === "start" ? "ov-prof-pick" : "ov-tutorial-pick",
    );
  }

  private chooseWarriorStyle(style: WarriorStyle): void {
    this.closeWarriorStyle();
    hide("ov-tutorial-pick");
    this.tutorialPickOpen = false;
    if (this.warriorPickMode === "tutorial")
      this.startTutorialFor("warrior", style);
    else this.startProfession("warrior", style);
  }

  /** 开始界面的教程入口：选择要练习的职业，可重看。 */
  private openTutorialPick(): void {
    if (this.core.state !== "start") return;
    this.tutorialPickOpen = true;
    show("ov-tutorial-pick");
  }

  private closeTutorialPick(): void {
    this.tutorialPickOpen = false;
    hide("ov-tutorial-pick");
  }

  private startTutorialFor(
    prof: "shooter" | "mage" | "warrior",
    warriorStyle?: WarriorStyle,
  ): void {
    this.closeTutorialPick();
    this.core.startTutorial(prof, warriorStyle);
  }

  /** 教程内跳过 / 完成后开始正式战斗；两者都记该职业已看。 */
  private skipTutorial(): void {
    this.completeTutorial();
  }

  private finishTutorialRun(): void {
    this.completeTutorial();
  }

  /** 教程快捷键：F 下一步 / 完成后开始正式战斗，X 跳过；返回 true 表示已消费该按键。 */
  handleTutorialKey(key: string): boolean {
    if (!this.core.tutorialMode || this.core.state !== "play") return false;
    const prof = this.core.tutorialProf ?? this.core.prof;
    const total = tutorialTotalSteps(prof);
    const kb = this.core.keybinds;
    if (
      [kb.up, kb.down, kb.left, kb.right, kb.dash, kb.pause, kb.stats].includes(
        key,
      )
    )
      return false;
    // 教程已完成、等待「开始正式战斗」：F 直接正式开局。
    if (this.core.tutorialStep >= total) {
      if (key === TUTORIAL_NEXT_KEY) {
        this.finishTutorialRun();
        return true;
      }
      return false;
    }
    if (key === TUTORIAL_NEXT_KEY) {
      if (!this.core.tutorialStepReady) return false;
      return this.core.advanceTutorial();
    }
    if (key === TUTORIAL_SKIP_KEY) {
      this.skipTutorial();
      return true;
    }
    return false;
  }

  private completeTutorial(): void {
    if (!this.core.tutorialMode) return;
    const prof = this.core.tutorialProf ?? this.core.prof;
    if (prof !== "common") markTutorialSeen(prof);
    this.tutorialSig = "";
    this.core.finishTutorial();
  }

  /** 每帧同步练习场顶部的教程 HUD（不挡操作）。 */
  syncTutorial(): void {
    const hud =
      this.tutorialHudEl ??
      (this.tutorialHudEl = document.getElementById("tutorial-hud"));
    if (!hud) return;
    if (!this.core.tutorialMode) {
      if (!hud.classList.contains("hidden")) hud.classList.add("hidden");
      this.tutorialSig = "";
      return;
    }
    const prof = this.core.tutorialProf ?? this.core.prof;
    const step = this.core.tutorialStep;
    const total = tutorialTotalSteps(prof);
    const kb = this.core.keybinds;
    const sig = `${prof}:${step}:${this.core.tutorialStepReady ? 1 : 0}:${kb.up}:${kb.down}:${kb.left}:${kb.right}:${kb.dash}`;
    if (sig === this.tutorialSig) return;
    this.tutorialSig = sig;
    hud.classList.remove("hidden");
    const content = this.tutorialContent(prof, step);
    element("tutorial-step").textContent =
      step >= total ? "新手教程" : `新手教程 · ${step + 1} / ${total}`;
    element("tutorial-title").textContent = content.title;
    element("tutorial-body").textContent = content.body;
    element("btn-tutorial-next").classList.toggle(
      "hidden",
      !(this.core.tutorialStepReady && step < total),
    );
    element("btn-tutorial-skip").classList.toggle("hidden", step >= total);
    element("btn-tutorial-start").classList.toggle("hidden", step < total);
  }

  private tutorialContent(
    prof: string,
    step: number,
  ): { title: string; body: string } {
    const kb = this.core.keybinds;
    if (step === 0)
      return {
        title: "移动",
        body: `用 ${keyLabel(kb.up)} / ${keyLabel(kb.left)} / ${keyLabel(kb.down)} / ${keyLabel(kb.right)} 移动（方向键始终可用）。`,
      };
    if (step === 1)
      return {
        title: "冲刺",
        body: `按 ${keyLabel(kb.dash)} 冲刺。冲刺期间短暂无敌，被围住时用来脱身。`,
      };
    if (step === 2)
      return {
        title: "自动攻击",
        body: "靠近敌人就会自动出手，不需要按键。",
      };
    if (step === 3) {
      if (prof === "mage")
        return {
          title: "站定施法",
          body: "法阵会自动落在怪最密集处；读条最后 40% 停下，伤害 ×1.5。试着站定命中至少 2 个目标。",
        };
      if (prof === "warrior")
        return {
          title: "贴身挥砍",
          body: "贴近敌人自动挥砍，扇形内所有敌人一起受伤；离得越近越容易打满。试着一次命中至少 2 个木桩。",
        };
      return {
        title: "强化弹",
        body: "保持距离输出。默认每 4 发自动变成强化弹；命中会填充角色下方的强化弹经验条，升级解锁新形态。快速装填 / 超载装填提升穿透与穿透伤害，不改变发射节奏。试着打出 3 发强化弹。",
      };
    }
    if (prof === "warrior" && step === 4) {
      return this.core.warriorStyle === "katana"
        ? {
            title: "流",
            body: "你的核心是「流」：连续命中叠层，提升居合伤害；练习场先给 L1，试着叠满 5 层。",
          }
        : {
            title: "重斩",
            body: "大剑自带重斩：每第 3 次挥砍重击，范围 +50%。破甲→剑气→裂地会依次强化它；试着打出一次重斩。",
          };
    }
    if (step === tutorialGemStep(prof))
      return {
        title: "经验球",
        body: "地上有一颗经验球，走过去即可拾取。正式战斗中清完怪也会掉落，升级和波末会给你属性 / 天赋选择。",
      };
    return {
      title: "教程完成",
      body: "准备好了，按 F 或点击按钮开始正式战斗。",
    };
  }

  /** 打开设置菜单（从暂停界面进入）；具体设置项走子窗口。 */
  private openSettings(): void {
    if (this.core.state !== "pause") return;
    this.settingsOpen = true;
    this.keybindsOpen = false;
    this.captureAction = null;
    hide("ov-keybinds");
    show("ov-settings");
  }

  private closeSettings(): void {
    this.settingsOpen = false;
    this.keybindsOpen = false;
    this.captureAction = null;
    hide("ov-keybinds");
    hide("ov-settings");
  }

  /** 设置子窗口：键位。 */
  private openKeybinds(): void {
    if (!this.settingsOpen) return;
    this.keybindsOpen = true;
    this.captureAction = null;
    this.settingsHint = "点击按键后按下新键 · Esc 取消 · 方向键与 Esc 始终可用";
    this.renderKeybindings();
    show("ov-keybinds");
  }

  private closeKeybinds(): void {
    this.keybindsOpen = false;
    this.captureAction = null;
    hide("ov-keybinds");
  }

  /** 重建设置列表；捕获中的动作显示「按下新键...」。 */
  private renderKeybindings(): void {
    const box = element("keybind-list");
    box.innerHTML = "";
    for (const { action, label } of KEY_ACTIONS) {
      const row = document.createElement("div");
      row.className = "keybind-row";
      const name = document.createElement("span");
      name.className = "keybind-name";
      name.textContent = label;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "keybind-btn" + (this.captureAction === action ? " capturing" : "");
      btn.textContent =
        this.captureAction === action
          ? "按下新键..."
          : keyLabel(this.core.keybinds[action]);
      btn.onclick = () => {
        this.captureAction = action;
        this.settingsHint = "按下新键 · Esc 取消";
        this.renderKeybindings();
      };
      row.appendChild(name);
      row.appendChild(btn);
      box.appendChild(row);
    }
    element("keybind-hint").textContent = this.settingsHint;
  }

  /**
   * 设置面板/改键捕获的按键入口（GameScene 在游戏按键处理前调用）。
   * 返回 true 表示本事件已被设置面板消费，游戏不再处理。
   */
  handleSettingsKey(event: KeyboardEvent): boolean {
    if (!this.settingsOpen && !this.keybindsOpen && !this.captureAction)
      return false;
    if (this.captureAction) {
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return true;
      if (event.key === "Escape") {
        this.captureAction = null;
        this.settingsHint = "已取消";
        this.renderKeybindings();
        return true;
      }
      const key = normalizeKey(event.key);
      if (!isBindableKey(key)) {
        this.settingsHint = "这个键被保留，请换一个";
        this.renderKeybindings();
        return true;
      }
      const conflict = findKeyConflict(
        this.core.keybinds,
        key,
        this.captureAction,
      );
      if (conflict) {
        const name =
          KEY_ACTIONS.find((item) => item.action === conflict)?.label ??
          conflict;
        this.settingsHint = `已被「${name}」使用`;
        this.renderKeybindings();
        return true;
      }
      this.core.keybinds = {
        ...this.core.keybinds,
        [this.captureAction]: key,
      };
      saveKeyBindings(this.core.keybinds);
      this.captureAction = null;
      this.settingsHint = "已保存 · 方向键与 Esc 始终可用";
      this.renderKeybindings();
      this.syncKeyLabels();
      return true;
    }
    // 设置/键位子窗口打开但未捕获：吞掉所有游戏键；Esc 逐层返回。
    event.preventDefault();
    if (event.key === "Escape") {
      if (this.keybindsOpen) this.closeKeybinds();
      else this.closeSettings();
    }
    return true;
  }

  /** 关闭最上层覆盖面板；返回是否关闭了某层（键位路由据此决定是否继续处理）。 */
  dismissOverlay(): boolean {
    if (this.tutorialPickOpen) {
      this.closeTutorialPick();
      return true;
    }
    if (this.keybindsOpen) {
      this.closeKeybinds();
      return true;
    }
    if (this.settingsOpen) {
      this.closeSettings();
      return true;
    }
    if (this.codex.isOpen) {
      this.codex.close();
      return true;
    }
    return false;
  }

  /** 是否有覆盖面板打开：用于屏蔽 C 键等战斗内快捷键。 */
  hasOverlay(): boolean {
    return (
      this.codex.isOpen ||
      this.settingsOpen ||
      this.keybindsOpen ||
      this.tutorialPickOpen
    );
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
   * 暂停界面的「返回主界面」回到主界面，允许重新选择职业。
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
    if (this.settingsOpen) this.closeSettings();
    [
      "ov-pause",
      "ov-over",
      "ov-stats",
      "ov-changelog",
      "ov-settings",
      "ov-keybinds",
      "ov-prof-pick",
      "ov-tutorial-pick",
      "ov-warrior-style",
    ].forEach(hide);
    this.tutorialPickOpen = false;
    this.tutorialHudEl?.classList.add("hidden");
    this.tutorialSig = "";
    show("ov-start");
    for (const id of [
      "btn-start",
      "btn-pick-shooter",
      "btn-pick-mage",
      "btn-pick-warrior",
    ]) {
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
    button.textContent = "返 回 主 界 面";
    button.classList.remove("armed");
  }
}
