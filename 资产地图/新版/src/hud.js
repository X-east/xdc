/* hud.js —— 地图页的**顶层控件 + 信息层**（261005 补回老页能力）
   ------------------------------------------------------------------
   负责：顶部的「图层开关 / 视野分段」、统计行、⚙ 数据口径弹窗、hover 点位提示。
   不负责：筛选 chip 与抽屉（→ ui.js）、数据来源与状态（→ store.js）、
           引擎（→ engine.js）、配色定义（→ theme.js / MP_MAP_THEME）。

   ★ 为什么单独成模块，而不并进 ui.js
     ui.js 是「交互控件 → 抽屉」的一条完整链路（搜索/筛选/卡片/返回栈），它的变化
     原因是**交互口径**变；本模块是「只读信息 + 三个开关」，变化原因是**数据与文案**变。
     混在一起会让那个已经 1100 行的文件变成"什么都往里塞"。
     两者的分界很清楚：**本模块只改「哪些层画 / 镜头在哪 / 显示什么字」，
     不碰任何选中与卡片**。

   ★ 老页对照（261005 逐条补回，老页已退役）
     · 顶栏「⛏️ 硬资产 854 / ⚡ 电力 118」→ 本模块的图层开关（**语义已按新页调整**：
       老页是"二选一换层"，新页两层**同时画**，所以这里是**独立的开关**，
       默认都开，关掉一层 = 该层 filter 恒假，见 store.js 文件头第四维）。
     · 顶栏「🌍 世界 / 🇨🇳 中国」→ **纯数据过滤器**。261116 任务#2 起是互斥视图
       （世界=仅境外 ov=1、中国=仅境内 ov=0）；任务#5 起**不再切相机** ——
       切换时位置与缩放逐像素不变，只替换点位数据集。按钮高亮与 probe().scope
       都读 store.scope（唯一真相源），与相机跨度彻底脱钩。
     · `#mpStat` 统计条 → 底部的统计行。
     · `mpBtnNote` + `#modal` → ⚙ 按钮 + 说明弹窗（正文在 note.js，整段移植）。
     · `#tip` hover 提示 → 悬停提示（命中判断复用 interactions.js 的 onHover，
       **不另挂一份 mousemove 去自己算** —— 那会让"提示说 A、点亮的是 B"）。

   ★ 字号一律用 em、颜色一律用 `--u-*` 变量（与 ui.js 同一条理由）：
     本模块的 CSS 不经 build_content.scale_fonts 改写，写死 px 会让设置面板的
     字号档位对它失效；写死颜色则会在浅色/暖色主题下错色。 */

import { PT_CATS, PT_LAYERS, LAYER_META, isOv, applyStatsCats } from './points.js';
import { cateCn } from './theme.js';
import { el } from './dom_kit.js';
import * as store from './store.js';
import { distUrl } from './base.js';
/* ⚠ 261116 任务#5：不再从 camera.js 取 SPAN_DEF/CENTER_DEF ——
   按钮高亮与 probe().scope 都改读 store.scope（数据范围），相机跨度不再是判据。 */
import { noteHtml } from './note.js';

const STYLE_ID = 'mp2-hud-css';

/** 视野分段的按钮（三选一 radio）。`all` 不在 camera.js SPAN_DEF 里（它是"全量不过滤"档），
 *  其余两个必须是 SPAN_DEF 的键。261117 用户拍板：把原来隐藏的"两个都不亮=全部"显式成按钮。 */
const SCOPE_BTNS = [{ s: 'all', t: '全部' }, { s: 'world', t: '🌍 世界' }, { s: 'china', t: '🇨🇳 中国' }];

let _root = null;     // UI 根（#ui）
let _st = null;       // { onLayer, onScope, getCamera, span, project, onExpand }
/* 图层开关按钮（k → button）。261120 起**交给页面层摆在 chips 行首**，
   不再有「折叠面板」——那个浮层盖在 chips 上、内容还与行首标签重复，
   用户原话「⚙ 点了也出不来什么，我也不知道是干啥的」。 */
let _layerBtns = {};
let _segEl = null;    // 视野分段（🌍/🇨🇳）—— 独立元素，好放进工具条行
let _statEl = null;   // 统计（现在只剩「N 个点」，摆在全选/全清旁边）
let _noteEl = null;   // 说明弹窗
let _noteBox = null;  // 弹窗正文容器（renderNote 往里写，stats 到达后重渲用）
let _tipEl = null;    // hover 提示（卡片本体；探针读它的 innerText，契约见 showTip）
let _tipWrap = null;  // 定位容器：**卡片 + 「展开」按钮**的共同外框
let _tipMoreEl = null; // 固定态的「展开」按钮（`.h-tip` 的**兄弟**，不是子节点）
let _tipHit = null;    // 卡片当前对应的命中要素（重投影靠它，别再从别处捞）
let _tipPinned = false; // 固定态：由 ix.sel 派生，不是这里自己的状态机
let _noteOpen = false;

/** `dist/layers.json`（权威：名字/图标/计数）与 `dist/pt_stats.json`（分类计数）。
 *  都没到之前界面用兜底值渲染，到了再填 —— 不能因为一个 fetch 失败就整行空白。 */
let _layers = null;
let _stats = null;
let _dataFailed = false;   // 261119：统计数据源加载失败标志（区别于"确实是 0 个"）

/* ─── 小工具 ─── */

/** 层元数据（图标/名字）—— layers.json 优先，取不到回落 LAYER_META。 */
function layerMeta(k) {
  const fromJson = (_layers || []).filter((x) => x && x.key === k)[0];
  return {
    name: (fromJson && fromJson.name) || (LAYER_META[k] && LAYER_META[k].name) || k,
    icon: (fromJson && fromJson.icon) || (LAYER_META[k] && LAYER_META[k].icon) || '',
  };
}

/** 层点数（layers.json 的 points；取不到时用 pt_stats 的 n）。 */
function layerTotal(k) {
  const fromJson = (_layers || []).filter((x) => x && x.key === k)[0];
  if (fromJson && fromJson.points != null) return fromJson.points;
  return (_stats && _stats[k] && _stats[k].n) || 0;
}

/* ⚠ 分类中文名走 theme.js 的 `cateCn`（唯一实现）—— 这里曾另留一份本地同名函数，
   与 ui.js / company.js / index.js 的回退口径分了两派（261005-102 P1-3）。别再搬回来。 */

/* ─── 统计（界面上的数字只有一个来源，就在这里）───────────────────────
   ★ 口径三条（与 pointFilter 严格对应，**别各算各的**）：
     ① 关掉的层不参与任何计数；
     ② 选中公司时，分类计数取**该公司的**（company.cats），不是全网总数；
     ③ 「什么都没选」→ 显示**全部**（261116 改）。历史上这一条是「显示 0」，
        因为那时 default 态点位层恒假；现在默认态放行全部点，统计行必须跟着说全量，
        否则「显示 0 个点」而屏幕上一片彩色点位，同样是数字与画面打脸。 */

/** 当前每个分类在**屏幕上会出现**多少个点（已并上公司维度、scope 视野与图层开关）。 */
export function counts() {
  const st = store.state();
  const rec = st.comp ? store.compOf(st.comp) : null;
  /* ★ 261116 任务#2：scope 生效时分类计数改用**数据层现算的交叉表**（禁前端估算）：
     无公司 → pt_stats.cats_by_scope[scope]；有公司 → comp_index 的公司级 cats_by_scope[scope]。
     于是「世界视图 + 某分类」与「某公司 + 境外」的数字都与画布一致。 */
  const scoped = st.scope === 'cn' || st.scope === 'ov' ? st.scope : null;
  const per = {};
  PT_LAYERS.forEach((k) => {
    if (!store.isLayerOn(k, st)) return;
    let by;
    if (rec) {
      // 公司 × 视野：comp_index 已带公司级的 cats_by_scope（数据层现算），不再是全量 cats
      by = (scoped && rec.cats_by_scope) ? (rec.cats_by_scope[scoped] || {}) : (rec.cats || {});
    } else if (scoped && _stats && _stats[k] && _stats[k].cats_by_scope) {
      by = (_stats[k].cats_by_scope[scoped]) || {};
    } else by = (_stats && _stats[k] && _stats[k].cats) || {};
    const allowed = PT_CATS[k] || [];
    Object.keys(by).forEach((c) => {
      /* ⚠ 公司记录的 cats 是**两层混在一起**的（一家公司可能同时有 h* 与 p* 点），
         所以必须按「这一层认哪些分类」过滤，否则关掉硬资产层后，
         电类计数里仍会冒出硬资产的分类。 */
      if (allowed.indexOf(c) < 0) return;
      per[c] = (per[c] || 0) + by[c];
    });
  });
  let all = 0;
  Object.keys(per).forEach((c) => { all += per[c]; });
  /* ★ 261008：分类这一维是**三态**，不能把空数组折成 null（见 points.js pointFilter 的 ★）。
     折了的话：「选了公司 + 点了全清」时地图一个点都没有，统计行却说「共 N 个点」——
     正是 261005 特意消掉的那种「数字与画面打脸」。 */
  const catsSel = st.cats == null ? null : st.cats;
  const hasCats = catsSel != null;
  const sel = hasCats && catsSel.length ? catsSel : null;
  let shown = 0;
  if (sel) Object.keys(per).forEach((c) => { if (sel.indexOf(c) >= 0) shown += per[c]; });
  const hasFilter = !!st.comp || hasCats;
  return {
    per: per,
    all: all,
    /* 没筛选时按口径是**全部显示**（261116 起；此前是恒假 → 显示 0，见 points.js
       pointFilter 的历史沿革）。画面是全铺的点，统计行就必须说全量，否则「数字与
       画面打脸」——261005 消掉过一次，别再倒回去。
       ⚠ `hasCats` 为真但 `sel` 为 null = 显式全清 → shown 停在 0，正是要的结果。 */
    shown: hasFilter ? (sel ? shown : (hasCats ? 0 : all)) : all,
    scope: scoped,
    comp: st.comp,
    compName: (rec && rec.n) || '',
    cats: catsSel ? catsSel.slice() : null,
    layersOn: PT_LAYERS.filter((k) => store.isLayerOn(k, st)),
    anyLayerOn: PT_LAYERS.some((k) => store.isLayerOn(k, st)),
  };
}

/* ─── 渲染 ─── */

/** 统计行的两段：`big` 是要突出的数字，`rest` 是说明。
 *  ★ 数字必须与画面一致 —— 见 counts() 的口径第 ③ 条。 */
function statParts(c) {
  if (!c.anyLayerOn) return { big: '0', rest: ' 个点 · 两层都已关闭' };
  /* ★ 261008：`cats` 为空数组 = 用户点了「全清」—— 那是**有筛选**（恒假），
     不能落进下面「未选择」那一支：那一支显示的是 `all`，而画面是 0 个点。 */
  const cleared = c.cats != null && !c.cats.length;
  const scopeTxt = c.scope === 'cn' ? '仅境内' : c.scope === 'ov' ? '仅境外' : '';
  if (!c.comp && c.cats == null) {
    /* ⚠ 括号里只列**还开着的**层（c.layersOn）—— 关掉的层不该出现在"共 N 个点"的说明里，
       否则「118 个点」后面跟着「硬资产 854 · 电力 118」，数字与说明自相矛盾。 */
    if (c.scope) return { big: String(c.all), rest: ' 个点 · ' + scopeTxt };
    const per = c.layersOn.map((k) => layerMeta(k).name + ' ' + layerTotal(k)).join(' · ');
    return { big: String(c.all), rest: ' 个点 · 全部（' + per + '）' };
  }
  const parts = [];
  if (scopeTxt) parts.push(scopeTxt);
  if (c.comp) parts.push(c.compName || c.comp);
  if (cleared) parts.push('分类已全清');
  else if (c.cats) parts.push('筛 ' + c.cats.map(cateCn).join('/'));
  return { big: String(c.shown), rest: ' 个点 · ' + parts.join(' · ') };
}

function paintStat() {
  if (!_statEl) return;
  const p = statParts(counts());
  _statEl.innerHTML = '';
  _statEl.appendChild(el('b', null, p.big));
  let rest = p.rest;
  /* ★ 261119：统计数据源没加载成功时，明确标出"数据未加载"——
     否则满屏点位却显示 0，用户和图例都会误判。 */
  if (_dataFailed) rest = '数据未加载 · ' + rest;
  /* ★ 261120：把「N 个点」与后面的说明拆成两段 —— 摆进「全选/全清」那一组时，
     用 CSS 只留数字、隐掉「· 全部（硬资产 792 · 电力 180）」这截（分类亮着的 chip
     已经把筛了什么说清楚了）。textContent 仍是完整一句，探针与读屏都拿得到全貌。 */
  const cut = rest.indexOf(' · ');
  _statEl.appendChild(el('span', 'h-su', cut < 0 ? rest : rest.slice(0, cut)));
  if (cut >= 0) _statEl.appendChild(el('span', 'h-sd', rest.slice(cut)));
}

/** 图层开关按钮的计数与选中态。
 *  ⚠ 261120：按钮搬到 chips 行首后**不能再靠 `_rowEl.querySelectorAll('.h-lb')` 找** ——
 *    那个容器没了，forEach 会静默空转（开关点了不变色，极难发现）。改成持有数组。 */
function paintLayers() {
  const st = store.state();
  PT_LAYERS.forEach((k) => {
    const b = _layerBtns[k];
    if (!b) return;
    const on = store.isLayerOn(k, st);
    b.classList.toggle('on', on);
    b.classList.toggle('off', !on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    const cnt = b.querySelector('b');
    if (cnt) cnt.textContent = layerTotal(k);
  });
}

/** 261116 任务#2：按钮高亮的真相源 = **数据过滤状态**（store.scope），不是相机跨度。
 *  映射：cn=仅境内→中国按钮，ov=仅境外→世界按钮，null=全显示→**全部**按钮（261117 显式化）。
 *  ★ 为什么不用"按相机跨度反推"（旧的 _scopeNow，已删）：按钮表达的是「在看哪类资产」，
 *   而任务#5 之后相机与数据**完全脱钩**（切换不动相机），按跨度反推会得出与按钮无关的
 *   答案 —— 典型症状是"数据仅境外、相机停在中国 62.5°，反推却报 world"。 */
function _filterScope() {
  const sc = store.state().scope;
  return sc === 'cn' ? 'china' : sc === 'ov' ? 'world' : 'all';
}

function paintScope() {
  if (!_segEl) return;
  const cur = _filterScope();
  if (cur === _lastScope) return;      // 没变就别写 DOM（相机每帧都在动）
  _lastScope = cur;
  _segEl.querySelectorAll('.h-sg').forEach((b) => {
    const on = b.dataset.s === cur;
    b.classList.toggle('on', on);
    /* ★ 261117：aria-pressed 跟着状态走（这两个是 toggle button）。
       之前只有 class 高亮 → 读屏用户完全不知道当前在看哪一类资产。 */
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

/** 上一次画出去的分段状态（null = 两个镜头都不是）。高亮由 _filterScope 决定。 */
let _lastScope = '__init__';

/* ── 已删除：_scopeNow()（按相机跨度反推"镜头在哪"）─────────────────────
   261116 任务#2 起按钮高亮改读 `store.scope`；任务#5 又让**切换不再动相机** ——
   于是"相机跨度"与"数据范围"彻底脱钩，再按跨度反推只会得出一个和按钮无关的答案
   （典型症状：数据是"仅境外"、相机停在中国的 62.5°，反推会报 world）。
   ⇒ `probe().scope` 现在直接返回 `_filterScope()`（数据范围名），与 `v=` 同一个真相源。 */

/* ─── 说明弹窗 ─── */

/** 弹窗正文渲染（261007-180）：noteHtml(_stats) 从构建期统计现算数字。
 *  stats 没到时 _stats 为 null → noteHtml 内部兜底「…」；fetch 回调里会再渲一次。 */
function renderNote() {
  if (!_noteBox) return;
  _noteBox.innerHTML = noteHtml(_stats);
}

function openNote() {
  if (!_noteEl) return;
  _noteEl.classList.add('on');
  _noteEl.scrollTop = 0;
  _noteOpen = true;
}

function closeNote() {
  if (!_noteEl) return;
  _noteEl.classList.remove('on');
  _noteOpen = false;
}

/** 返回栈登记（与 ui.js 同一条约定：走 `window.__mpBackReg`，独立打开时入队，注入层启动时排空）。
 *  说明弹窗是**全屏覆盖**，返回键必须先收它 —— 故 order 取 160（大于抽屉的 140）。 */
function regBack(id, order, active, close) {
  const f = window.__mpBackReg;
  if (f) { f(id, order, active, close); return; }
  (window.__mpBackQ = window.__mpBackQ || []).push([id, order, active, close]);
}

/* ─── 一次性提示（toast） ─── */

/** 提示条：底部居中，1.6 秒后自己消失。
 *  用途是「操作有了结果但结果看不见」的那几种（复制链接成功/失败、复位完成）——
 *  这类动作**画面上没有任何变化**，不给回执用户会连点三次。 */
let _toastEl = null;
let _toastTimer = 0;

export function toast(text) {
  if (!_toastEl) return;
  _toastEl.textContent = String(text == null ? '' : text);
  _toastEl.classList.add('on');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { _toastEl.classList.remove('on'); _toastTimer = 0; }, 1600);
}

/* ─── hover / 固定 提示 ─── */

/* ★★ 261116 任务#3：定位来源改成「要素自身的经纬度投影」。
   原实现读 `_st.current().at`（上一次 mousemove 的容器内坐标）—— 三重失效：
     ① `_st` 是 hud 的**选项对象**（见 init 的 `_st = o`），根本没有 `current` 成员
        → `_st && _st.current && …` 短路成 undefined → placeTip 恒早退 → 卡片留在
        CSS 默认位置（容器左上角）。桌面同样坏，不只是触屏。
     ② 就算接上，`interactions.flushMove` 在 `same(hit)` 时提前 return（性能铁律），
        同一点内移动根本不回调 → 卡片不会跟着走。
     ③ 触屏没有 mousemove → `at` 恒 null。
   新口径：坐标只认 `hit.props.lng/lat`（engine.pick 从 geometry.coordinates 取得）。
   与输入方式解耦：鼠标 / 触摸 / 搜索 / 深链 / 程序化选中走同一条路径。
   ⚠ 拿不到坐标时**必须隐藏**，绝不能留在默认位置 —— 那正是本次要修的物理入口。 */

/** 命中要素是否有可用坐标。`lng/lat` 由 engine.pick → normPoint 保证是数字。 */
function tipLngLat(hit) {
  const p = (hit && hit.props) || {};
  const lng = Number(p.lng);
  const lat = Number(p.lat);
  return (Number.isFinite(lng) && Number.isFinite(lat)) ? [lng, lat] : null;
}

/** 卡片文案。⚠ 顺序是**契约**（探针 `_map2_check.mjs` 断言以点名开头、以「境内/境外」结尾）：
 *  名称 → 分类·层级·归属N家 → 境内/境外。新增字段只能往**中间**插。 */
function fillTip(hit) {
  const p = hit.props || {};
  _tipEl.innerHTML = '';
  _tipEl.appendChild(el('div', null, p.n || hit.id || ''));
  const sub = [];
  if (p.cate) sub.push(cateCn(p.cate));
  if (p.lv) sub.push(p.lv);
  /* 归属公司只给**家数**：公司名要查 comp_index（懒加载，首次悬停可能还没到），
     悬停卡必须是同步的、不能等 fetch。名字留给详情面板。 */
  if (Array.isArray(p.cos) && p.cos.length) sub.push('归属 ' + p.cos.length + ' 家');
  if (p.ov != null) sub.push(isOv(p.ov) ? '境外' : '境内');
  if (sub.length) _tipEl.appendChild(el('div', 'c', sub.join(' · ')));
}

/** 把 .h-tipbox 摆到点的投影坐标旁，且不出容器边界（贴边翻到点另一侧）。
 *  ★ 显示 / 隐藏的**唯一入口**：可见性由「有无坐标 + 是否在视口内」当场判定，
 *    调用方（hover / 固定 / 重投影）只负责给 `_tipHit`，不必各自管类名。
 *  ⚠ 拿不到坐标或点跑出视口时**保留 `_tipHit`**（`hideTip(true)`）—— 否则用户把点拖回来时
 *    卡片再也回不来（没有任何事件会重新触发它）。 */
function placeTip() {
  if (!_tipWrap) return false;
  if (!_tipHit) { hideTip(false); return false; }
  const ll = tipLngLat(_tipHit);
  const px = (ll && _st && typeof _st.project === 'function') ? _st.project(ll) : null;
  if (!px || !Number.isFinite(px[0]) || !Number.isFinite(px[1])) {
    /* 无坐标 / 无投影能力 → 收起。**不兜底到左上角**（那会让"没定位"伪装成"定位到 0,0"）。 */
    hideTip(true);
    return false;
  }
  const host = _root;
  const W = (host && host.clientWidth) || 390;
  const H = (host && host.clientHeight) || 844;
  const off = 12;
  /* 点在视口外（拖走/缩走）时不显示 —— project() 对视野外的点照样给坐标，不判就会贴错边。 */
  if (px[0] < -off || px[1] < -off || px[0] > W + off || px[1] > H + off) {
    hideTip(true);
    return false;
  }
  /* 先亮出来再量：display:none 时 offsetWidth 是 0，翻转判据会算错。 */
  _tipWrap.classList.add('on');
  _tipEl.classList.add('on');
  _tipWrap.classList.toggle('pin', _tipPinned);
  const w = _tipWrap.offsetWidth || 96;
  const h = _tipWrap.offsetHeight || 34;
  let x = px[0] + off;
  let y = px[1] + off;
  if (x + w > W - 4) x = px[0] - off - w;
  if (y + h > H - 4) y = px[1] - off - h;
  _tipWrap.style.left = Math.max(4, x) + 'px';
  _tipWrap.style.top = Math.max(4, y) + 'px';
  return true;
}

/**
 * @param {boolean} pinned 固定态
 * 只设状态再交给 placeTip —— 「显不显示」由坐标与可见性决定，不在这里分开写一遍。
 */
function showTipBox(pinned) {
  _tipPinned = !!pinned;
  return placeTip();
}

/**
 * 收起卡片。
 * @param {boolean} keepHit true = 只是"这一帧看不见"（点出视口/暂无坐标），**保留**命中与固定态，
 *   等相机动回来还能重新出现；false = 真正取消（用户点了空白 / 收起）。
 */
function hideTip(keepHit) {
  if (_tipWrap) _tipWrap.classList.remove('on', 'pin');
  if (_tipEl) _tipEl.classList.remove('on');
  if (_tipMoreEl) _tipMoreEl.style.display = 'none';
  if (!keepHit) { _tipPinned = false; _tipHit = null; }
}

/** 悬停提示。固定态下**忽略** —— 否则用户点了 A 又飘到 B，会出现两套内容打架。 */
function showTip(hit) {
  if (!_tipWrap) return;
  if (_tipPinned) return;
  if (!hit || hit.kind !== 'point') { hideTip(false); return; }
  _tipHit = hit;
  fillTip(hit);
  showTipBox(false);
}

/** 固定/取消固定（由页面层在 onSelect 里转发 —— 固定态的真相源是 `ix.sel`，不是这里）。 */
export function setPinned(hit) {
  if (!_tipWrap) return false;
  if (!hit || hit.kind !== 'point') { hideTip(false); return false; }
  _tipHit = hit;
  fillTip(hit);
  return showTipBox(true);
}

/** 相机移动 / 窗口尺寸变化后重新投影（rAF 合并由调用方做，这里只算一次）。
 *  ⚠ 判据是「有没有命中」，不是「当前是否可见」—— 点被拖出视口时卡片会临时隐藏，
 *    拖回来要能自己重新出现（见 placeTip 的 hideTip(true)）。 */
export function repositionTip() {
  if (!_tipWrap || !_tipHit) return false;
  return placeTip();
}

/* ─── 样式 ─── */

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = [
    /* 图层/视野行 */
    /* 图层开关（261120 起摆在 chips 行首，替代原来的 .u-flabel 文字标签）：
       视觉像"这一行的名字"（透明底、无边框），但可点 —— 关掉整层点。
       原来它在 ⚙ 浮层里，既盖住 chips 又与行首标签重复，用户完全不知道那是啥。 */
    '.h-lb{flex:0 0 auto;display:inline-flex;align-items:center;gap:.25em;',
    '  min-height:var(--u-hit-min,24px);padding:0 .45em;',
    '  border-radius:.95em;border:1px solid transparent;background:transparent;',
    '  color:var(--u-tx2);font-size:.72em;-webkit-tap-highlight-color:transparent;}',
    '.h-lb:hover{background:var(--u-panel2);}',
    '.h-lb b{font-weight:500;font-size:.92em;color:var(--u-tx3);}',
    /* 关掉的层：整体压暗 + 计数也暗 —— 一眼能看出"这一层不画" */
    '.h-lb.off{opacity:.45;}',
    '.h-lb.off b{color:var(--u-tx3);}',
    '.h-lb.on b{color:var(--u-accent);}',
    '.h-seg{margin-left:auto;display:inline-flex;gap:.15em;padding:.15em;border-radius:.85em;',
    '  background:var(--u-panel);border:1px solid var(--u-bd);}',
    /* ★ 261118 UI 体检：命中区读 --u-hit-min（#ui 上定义，24px/触屏 44px；见 ui.js）。
       原 height:1.6em 在偏小档只有 ~18px；fallback 24px 防 hud 独立加载时变量缺失。 */
    '.h-sg{min-height:var(--u-hit-min,24px);padding:0 .5em;border:0;border-radius:.7em;background:transparent;',
    '  color:var(--u-tx3);font-size:.72em;-webkit-tap-highlight-color:transparent;}',
    '.h-sg.on{background:var(--u-accent);color:var(--u-on-accent,#0b1119);}',
    /* 统计行 */
    '.h-stat{font-size:.68em;color:var(--u-tx3);line-height:1.5;}',
    '.h-stat b{color:var(--u-tx2);font-weight:500;font-size:1.15em;}',
    /* hover / 固定 提示。
       ★ 261116：定位容器从 .h-tip 提到 .h-tipbox —— 因为固定态要多一个「展开」按钮，
         而按钮**不能**是 .h-tip 的子节点：探针断言 .h-tip.innerText 以「境内/境外」结尾，
         子节点按钮的文字会跟在后头把契约冲掉。兄弟节点 + 竖排就干净了。
       不吃指针事件（否则它自己会把 hover 打断，变成闪烁）；只有「展开」按钮吃。 */
    '.h-tipbox{position:absolute;z-index:6;display:none;pointer-events:none;',
    '  flex-direction:column;gap:.15em;max-width:11em;}',
    '.h-tipbox.on{display:flex;}',
    '.h-tip{display:none;padding:.25em .5em;border-radius:.4em;background:var(--u-panel-solid);',
    '  border:1px solid var(--u-bd);color:var(--u-tx);font-size:.72em;line-height:1.4;',
    '  box-shadow:0 2px 8px rgba(0,0,0,.35);}',
    '.h-tip.on{display:block;}',
    '.h-tip .c{color:var(--u-tx3);font-size:.88em;}',
    '.h-tipmore{display:none;pointer-events:auto;cursor:pointer;align-self:flex-start;',
    '  border:1px solid var(--u-bd);border-radius:.4em;background:var(--u-panel-solid);',
    '  color:var(--u-tx2);font-size:.7em;line-height:1.7;padding:0 .55em;}',
    /* 一次性提示条（toast）：底部居中、不吃指针 */
    '.h-toast{position:absolute;left:50%;bottom:2.4em;transform:translateX(-50%);z-index:24;',
    '  max-width:80%;padding:.4em .8em;border-radius:1em;pointer-events:none;opacity:0;',
    '  background:var(--u-panel-solid);border:1px solid var(--u-bd);color:var(--u-tx);',
    '  font-size:.74em;line-height:1.4;box-shadow:0 2px 10px rgba(0,0,0,.4);',
    '  transition:opacity .16s ease;}',
    '.h-toast.on{opacity:1;}',
    /* 说明弹窗：全屏覆盖、可滚 */
    '.h-note{position:absolute;inset:0;z-index:20;display:none;pointer-events:auto;',
    '  background:rgba(4,8,14,.74);overflow-y:auto;-webkit-overflow-scrolling:touch;',
    '  padding:.8em;}',
    '.h-note.on{display:block;}',
    '.h-nbox{max-width:34em;margin:0 auto;background:var(--u-panel-solid);',
    '  border:1px solid var(--u-bd);border-radius:.6em;padding:.9em 1em;',
    '  color:var(--u-tx2);font-size:.8em;line-height:1.75;}',
    '.h-nbox h3{font-size:1.18em;color:var(--u-tx);margin:.1em 0 .6em;}',
    '.h-nbox h4{font-size:.98em;color:var(--u-tx);margin:1.1em 0 .3em;}',
    '.h-nbox details{margin:.5em 0;}',
    '.h-nbox summary{cursor:pointer;padding:.35em .5em;border-radius:.4em;background:var(--u-panel2);',
    '  color:var(--u-tx2);font-size:.88em;min-height:var(--u-hit-min,24px);}',
    '.h-nbox summary:focus-visible{outline:2px solid var(--u-accent);}',
    '.h-nbox p,.h-nbox ul{margin:.4em 0;}',
    '.h-nbox ul{padding-left:1.1em;}',
    '.h-nbox b{color:var(--u-tx);}',
    '.h-nbox table{border-collapse:collapse;width:100%;}',
    '.h-nbox td,.h-nbox th{padding:.15em .2em;}',
    '.h-nx{display:block;width:100%;margin:.9em 0 .2em;height:2.2em;border-radius:.5em;',
    '  border:1px solid var(--u-bd);background:var(--u-panel2);color:var(--u-tx);',
    '  font-size:.95em;}',
  ].join('');
  document.head.appendChild(s);
}

/* ─── 对外 ─── */

/**
 * 装配顶部控件与信息层。
 * @param {object} opt
 * @param {HTMLElement} opt.root   UI 根（#ui）—— 弹窗与提示挂这里
 * @param {HTMLElement} opt.host   行容器（ui.js 建的 .u-top）—— 前两行插进去
 * @param {(k:string, on:boolean)=>void} opt.onLayer 图层开关
 * @param {(s:string)=>void} opt.onScope            视野分段（'world' | 'china'）
 * @param {()=>object} opt.getCamera                取相机（判断当前镜头）
 * @param {()=>number} opt.span                     取当前可见跨度（判断当前镜头）
 * @param {(lngLat:number[])=>number[]} opt.project 经纬度 → **本容器坐标**（提示卡定位；
 *   必须由页面层用 engine.project 包装并把画布坐标换算成 #ui 坐标，见 ui.js）
 * @param {()=>void} [opt.onExpand]                 固定卡「展开」按钮的回调
 * @returns {{row:HTMLElement, stat:HTMLElement, refresh:Function, openNote:Function}}
 */
export function init(opt) {
  const o = opt || {};
  _root = o.root || document.getElementById('ui') || document.body;
  _st = o;
  /* ★ 契约自检：缺 project 时**明确报错**。原先 placeTip 里写 `_st.current`（根本没这个成员），
     被 `&&` 短路吞成"什么都不发生"，卡片直接叠在左上角 —— 这个 bug 就是被静默养大的。
     宁可吵，也不要再静默降级。 */
  if (typeof o.project !== 'function') {
    console.error('[hud] init 缺少 project(lngLat) 注入 —— 提示卡片无法定位，将不显示（别让它留在左上角）');
  }
  ensureStyle();

  /* 图层开关按钮：**建好但不摆位**（261120 交给页面层放到两行 chips 的行首）。
     为什么不在这里 append：位置是布局的事（ui.js），hud 只管内容与状态 ——
     与 seg/stat 的处置同一条规矩。 */
  PT_LAYERS.forEach((k) => {
    const b = el('button', 'h-lb on');
    b.type = 'button';
    b.dataset.k = k;
    b.title = '显示 / 隐藏「' + ((layerMeta(k) || {}).name || k) + '」整层（不影响分类筛选）';
    const m = layerMeta(k);
    b.appendChild(el('span', null, (m.icon ? m.icon + ' ' : '') + m.name));
    b.appendChild(el('b', null, String(layerTotal(k))));
    b.addEventListener('click', () => {
      /* ⚠ 目标态要在**调 onLayer 之前**读出来：onLayer 会同步改状态并触发重绘，
         重绘里已经把类名改好了 —— 那时再读就变成"读到自己刚写的结果"（恒为原值）。
         261005 第一版就写反了这一步（传了原值过去），表现是"点了没反应"。 */
      const next = !b.classList.contains('on');
      if (_st.onLayer) _st.onLayer(k, next);
    });
    _layerBtns[k] = b;
  });
  const seg = el('div', 'h-seg');
  SCOPE_BTNS.forEach((x) => {
    const b = el('button', 'h-sg');
    b.type = 'button';
    b.dataset.s = x.s;
    b.textContent = x.t;
    /* ★ 261117 用户拍板：三选一 **radio**（全部 / 中国 / 世界），显式第三档，
       不再是"两个都不亮=全部"的隐藏态。点哪个选哪个，无 toggle-off。 */
    b.title = x.s === 'all' ? '显示所有资产（默认）'
      : x.s === 'china' ? '只看境内资产' : '只看境外资产';
    b.addEventListener('click', () => { if (_st.onScope) _st.onScope(x.s); });
    seg.appendChild(b);
  });
  /* ★ 261116 任务#6：视野分段**独立成一个元素**（原来是 _rowEl 的最后一段）。
     拆出来是为了能把它放进**工具条行**（窄屏省一整行 25px），
     也为了宽屏时能整块搬进右侧栏。paintScope 相应改成查 _segEl。 */
  _segEl = seg;

  /* 行二：统计 */
  _statEl = el('div', 'h-stat');

  /* hover 提示。挂 #ui 里，但**坐标不再假设与地图同原点** —— 由注入的 project 给出
     （见文件里 tipLngLat / placeTip 的说明）。
     ★ 261117 用户拍板：小卡只做 hover 提示，**去掉「展开」按钮** ——
       点选直接出详情（宽屏侧栏 / 窄屏抽屉），按钮已无意义；网页端尤其不该有
       "卡上还挂个展开" 的双重入口。 */
  _tipWrap = el('div', 'h-tipbox');
  _tipEl = el('div', 'h-tip');
  _tipWrap.appendChild(_tipEl);
  _root.appendChild(_tipWrap);

  /* 一次性提示条 */
  _toastEl = el('div', 'h-toast');
  _root.appendChild(_toastEl);

  /* 说明弹窗。⚠ 正文数字（点位数/公司数/分类数…）由 noteHtml(stats) 从构建期统计现算
     （261007-180 去写死）—— stats 没到时先渲兜底（数字位显示「…」），到了就重渲。 */
  _noteEl = el('div', 'h-note');
  const box = el('div', 'h-nbox');
  _noteBox = box;
  renderNote();
  const nx = el('button', 'h-nx', '我知道了');
  nx.type = 'button';
  nx.addEventListener('click', closeNote);
  box.appendChild(nx);
  _noteEl.appendChild(box);
  /* 点遮罩空白处也关（弹窗内的点击不冒泡上去关掉） */
  _noteEl.addEventListener('click', (e) => { if (e.target === _noteEl) closeNote(); });
  _root.appendChild(_noteEl);

  regBack('mpNote', 160, () => _noteOpen, () => { closeNote(); return true; });

  /* 数据（两个小文件；失败就保持兜底值，不阻断界面）。
     ⚠ 到位后要**主动通知**页面层（`onData`）—— 因为分类计数不只本模块用：
       ui.js 的 chip 上也要显示同一份数字（chip 的计数就是"图例 + 分类汇总"）。
       261005 踩过：只在本模块里 `paint()`，于是 chip 上的数字**永远是空的**——
       而"数字还没加载"与"这一类是 0 个"在界面上长得一模一样。 */
  const loaded = () => {
    paintLayers();
    paintStat();
    if (o.onData) { try { o.onData(); } catch (e) { console.error('[hud] onData 回调异常', e); } }
  };
  fetch(distUrl('layers.json')).then((r) => r.json()).then((d) => {
    if (Array.isArray(d) && d.length) { _layers = d; loaded(); }
  }).catch((e) => {
    /* ★ 261119：不再静默 —— 图层定义加载失败会让统计行全 0、新分类 chip 不出现。
       记日志并在统计行标记"数据未加载"，与"这一类是 0 个"区分开。 */
    console.error('[hud] layers.json 加载失败', e);
    _dataFailed = true; paintStat();
  });
  fetch(distUrl('pt_stats.json')).then((r) => r.json()).then((d) => {
    if (d && typeof d === 'object') {
      _stats = d;
      /* ★ 261007-180：stats 一到先把分类表注入 PT_CATS（points.js），
         **必须发生在 onData（ui.js 重建 chip）之前** —— chip 结构按 PT_CATS 建，
         晚了 power 的 thermal/renew 两枚 chip 就不会出现。
         弹窗正文同样要重渲（首次渲的是「…」兜底）。 */
      applyStatsCats(d);
      renderNote();
      loaded();
    }
  }).catch((e) => {
    console.error('[hud] pt_stats.json 加载失败', e);
    _dataFailed = true; paintStat();
  });

  paintLayers();
  paintScope();
  paintStat();
  return {
    stat: _statEl,
    /* 三样都由页面层**摆位**：`seg` 进工具条行、`layerBtn[硬/电]` 进两行 chips 的行首、
       `stat` 进「全选/全清」那一组。hud 只管内容与状态，不管位置。 */
    seg: _segEl,
    layerBtn: _layerBtns,
    refresh: refresh,
    refreshScope: refreshScope,
    openNote: openNote,
    closeNote: closeNote,
    /* ★ 261116 任务#5：把构建期统计（含 `bbox_by_scope`）**原样交给页面层** ——
       「中国/世界」按钮的相机目标必须由数据算出（境内点聚在中国、境外点横跨 280°），
       写死常量会在数据更新后悄悄指错地方。页面层拿它算目标镜头，hud 不参与相机。 */
    stats: () => _stats,
    /* 探针/排障用：只读快照 + 强制走一遍绘制 */
    probe: () => ({ layers: PT_LAYERS.map((k) => ({
      k: k, on: store.isLayerOn(k, store.state()), n: layerTotal(k),
    })), scope: _filterScope(), noteOpen: _noteOpen, counts: counts(),
      /* ★ 任务#5：把构建期算出的**点位 bbox** 也带进快照 ——
         探针要能断言「切到世界后相机确实落在这类点的实际分布区」，
         而不是断言一个写死的经度常量（数据一更新就过期）。 */
      bbox: (_stats && _stats.bbox_by_scope) || null,
      tip: _tipEl.classList.contains('on'),
      /* 261116 任务#3：固定态与投影能力也要能被断言 —— 只断言文案的话，
         "卡片根本没定位"这种 bug 会一直是绿的（正是它活到今天的原因）。 */
      tipPinned: _tipPinned,
      tipProject: !!(typeof _st.project === 'function'),
      tipPos: _tipWrap && _tipWrap.classList.contains('on')
        ? [parseFloat(_tipWrap.style.left) || 0, parseFloat(_tipWrap.style.top) || 0]
        : null }),
  };
}

/** 状态变了（store 广播）→ 重画这一层。**幂等、无副作用**，随便调。 */
export function refresh() {
  paintLayers();
  paintScope();
  paintStat();
}

/** 视野变了（相机回调）→ 只重画分段的高亮。
 *  ⚠ 相机回调是**每帧都来**的（拖动时），所以这里必须：① 只碰分段这一块 DOM；
 *    ② 值没变就直接 return（见 paintScope 的 _lastScope）。 */
export function refreshScope() {
  paintScope();
}

/** 悬停提示（由 ui.js 把 interactions 的 onHover 转过来 —— 本模块不直接认识交互模块）。 */
export function tip(hit) {
  showTip(hit);
}
