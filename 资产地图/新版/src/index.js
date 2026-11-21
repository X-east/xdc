/* index.js —— 页面装配（**只做"把上面几层接起来 + 最小交互"**）
   ------------------------------------------------------------------
   负责：创建引擎（用 sources + layers 组装 style）、设初始相机、把尺寸变化转给引擎。
   不负责：抽屉 / 卡片 / 搜索 / 分类筛选等业务（那是页面层的事，本阶段不做）。

   ★ 本文件是**唯一**知道"页面长什么样"的地方：改走别的地图容器、加挂载点，都在这里。
     其余模块不许 querySelector。

   ★ 阶段 2 的边界（刻意不做）：
     · 不做点位层 / 不做拾取 / 不做深链 / 不做主题热切换 —— 都留到阶段 3，
       且各自有独立模块（points.js / interactions.js / 主题走 layers 重建）。
     目的：本阶段只用**一个可验证的最小闭环**证明「引擎接进来了、帧预算是这个量级」，
       而不是一次性搬完再回来分诊。

   ★ 阶段 3 的进度（261003-80 的六步）：
     ① 点位层（points.js + 本文件接线）—— **已做**
     ② 交互（interactions.js：筛选 / hover / 选中）—— **已做**
     ③ 省面拾取层（`fill-opacity:0` + 点击省份）—— **已做**
     ④ 主题热切换（engine.setPaint + points.pointPaintPatch）—— **已做**（`applyTheme`）
     ⑤ 深链接线（读侧 + `focusBounds` + `searchPoints`）—— **已做**（写回 hash 留给真页面）
     ⑥ 全量回归 —— **已做**（`_map2_check.mjs` A~L 全段）
     ⑦ 出包接线（261003-82）：最细那档改**懒加载**（启动只挂 110m+50m，省 11MB）；
        订阅壳的 `mp:themechange` 做主题联动；页面由 `资产地图/build_map2.py` 整目录复制进
        内容包（**不另写装配** —— 壳的注入链 `assemble_page()` 会自动认它） */

import {
  create, onceLoaded, setCamera, onCamera, resize, getCamera, diagnose, setPaintPatch,
  fitBounds, pick, setFilter, hasLayer, panTo, isMoving,
  isInFilteredSet, __rawForTest, project, onLoadProgress,
} from './engine.js';
/* 261119：加载进度条（独立模块，加载早期就能显示，不依赖 ui.init）。 */
import * as progress from './progress.js';
import {
  buildSources, tiers, provSpanLimit,
} from './sources.js';
import { buildStyle, themePatch, tierLayers, provLayer, LAYER } from './layers.js';
import {
  buildPointSources, pointLayers, pointHighlightLayers,
  pointPaintPatch, pointHighlightPaintPatch, pointRadiusPatch, pointHighlightRadiusPatch,
  PT_FILE, POINT_LAYER, POINT_HL, PT_LAYERS, PT_CATS, pointFilter, whichOfId, isOv,
  pointHitLayers, pointLayerIds } from './points.js';
import * as ix from './interactions.js';
import { normPoint } from './record.js';
import * as ui from './ui.js';
import * as store from './store.js';
import { onceJob, latestOnly } from './job.js';
import {
  defaultCamera, clampZoom, norm360, zoomForSpan, spanForZoom, cameraForBounds,
  parseHash, buildHash, SPAN_DEF, SPAN_MIN,
} from './camera.js';
import { currentTheme, cateCn } from './theme.js';

/** 初始视野（与旧页面同口径：世界视野 = 可见 118.4°）。 */
const INIT_SCOPE = 'world';
/** 旧深链 `v=` 的词表 → 本页的 SPAN_DEF 键。
 *  老页写 `v=cn`（只在"中国"时写，世界时省略），本页的键叫 `china` ——
 *  不做这个映射，老书签/分享链接会**静默丢掉视野**（只剩中心点，看不出哪里错）。 */
const LEGACY_VIEW = { cn: 'china', china: 'china', world: 'world' };
/** 视野按钮 → 数据过滤维度（261116，任务#2：中国/世界改互斥视图）。
 *  ★ 两套 scope 同名不同义：按钮是 world/china/all（相机档），过滤是 cn/ov/null（数据）。
 *    world = 只看境外(ov=1)，china = 只看境内(ov=0)，all = 不过滤(null)。映射只此一处。 */
const SCOPE_TO_FILTER = { world: 'ov', china: 'cn', all: null };

/* 「聚焦时放大几倍」的具名常量 —— 原先散着裸魔数 `SPAN_MIN * 2`（×2）与 `SPAN_MIN * 2.2`（×1）。
   语义 = 聚焦到单点 / 包围盒时，视口可见跨度取 SPAN_MIN 的多少倍。 */
const FOCUS_SPAN = SPAN_MIN * 2;     // 单点聚焦（searchAndFocus / openComp 的 setCamera）
const FIT_SPAN = SPAN_MIN * 2.2;     // 矮视口 fitBounds 的 maxZoom（个股页 focusOn 专用）
/** 调试/探针入口的名字（生产页面上它只是只读状态，不提供任何改画面的能力）。 */
export const DEBUG_KEY = 'MP2';

/** boot 时定下的、之后"改主题 / 改宽度"要复用的一组量。
 *  存下来而不是每次重算：`tiers` 的 zoom 区间**按宽度标定过**，重算会与已建好的层错开。 */
let _st = null;   // { el, W, tiers(全部三档), theme }

/** 点位原始数据缓存（搜索用）。**只在第一次搜索时抓**，不占启动时间。
 *  在飞去重由 `job.onceJob` 负责（261006-112 P2-30）：`searchPoints` 与 `suggest`
 *  可能同时进来，手写缓存会让两个 geojson 各 fetch 一遍。 */
const loadPts = onceJob(async () => {
  const two = await Promise.all(PT_LAYERS.map((k) => fetch(PT_FILE[k]).then((r) => r.json())));
  const out = [];
  PT_LAYERS.forEach((k, i) => {
    (two[i].features || []).forEach((f) => {
      /* 搜索缓存里的每一条**也过 normPoint** —— 它就是「搜索候选」这条入口的数据源，
         统一形状后下游（suggest / 点候选）不必再认 geojson 的字段名。
         ⚠ 必须带上 `cos` / `ov`（261003-88）：搜索命中点位后要靠它**顺带选中那家公司**
           —— 没有它就只能飞过去选一个孤点，地图上别的点都不显示。 */
      out.push(normPoint({
        id: f.properties.id, n: f.properties.n, cate: f.properties.cate,
        cos: f.properties.cos, ov: f.properties.ov,
        lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1],
      }, k));
    });
  });
  return out;
});
/**
 * 等**两帧**再执行（261009 P1-5 用）。
 * ★ 为什么是两帧：`engine.setFilter` 是同步改样式，但引擎把新 filter 反映到
 *   `queryRenderedFeatures` 上要两帧 —— 实测同一个 id 的命中数：
 *   改前 2 → 同 tick 2（旧结果）→ 1 帧后 1（只更新了一半的层）→ 2 帧后 0。
 *   在"同一 tick 里问"的写法下永远读到旧结果，而且**不报错**（这条修复会静默失效）。
 * @param {()=>void} fn
 */
function afterTwoFrames(fn) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

/**
 * 等引擎把新的 filter **落实**到源查询上（最多 ~1.5s），期间反复问 `isVisible`。
 *
 * ★ 为什么不能"两帧后问一次"就完事：setFilter 是**异步生效**的，
 *   立刻查会读到**旧**结果 → "卡片还开着、还指着已被筛掉的点"。
 *   261117 实测：机器有负载时两帧本身就要 1.6s+（单帧长任务实测到过 800ms），
 *   于是这条**偶发**漏判（探针 S5 撞到过一次，重跑又绿 —— 这种"看运气"的门禁最该修）。
 * ★ 为什么"一直可见"也算收敛：那个点本来就没被筛掉，此时**不该**取消选中；
 *   等不到"不可见"就按"仍可见"处理 —— 宁可晚一点不动，也不要错杀。
 * @param {()=>boolean} isVisible
 * @param {(visible:boolean)=>void} onSettled
 */
function waitFilterSettled(isVisible, onSettled) {
  const DEADLINE_MS = 1500, STEP_MS = 120;
  const t0 = Date.now();
  const poll = () => {
    const v = isVisible();
    if (!v || Date.now() - t0 > DEADLINE_MS) { onSettled(v); return; }
    setTimeout(poll, STEP_MS);
  };
  requestAnimationFrame(() => requestAnimationFrame(poll));
}

/**
 * 当前选中的那个点**此刻还画在屏幕上吗**（261009 P1-5）。
 *
 * ★ 为什么必须问引擎（`engine.isInFilteredSet`）而不是在 JS 里复算一遍 filter：
 *   filter 是 MapLibre 表达式，在 JS 里复算就是同一件事的**第二份实现** ——
 *   两处口径迟早打架，而且**不报错**（本项目的老毛病）。
 * ⚠ 三种"判不了"都返回 `true`（= **别动**），宁可少清一次也不要误清：
 *   · 没有选中 / 选中的不是点位；
 *   · 引擎还没建出点位层（懒加载期）；
 *   · 引擎自己说判不了（`isInFilteredSet` 返回 null）。
 * @returns {boolean}
 */
function selStillVisible() {
  const s = ix.current().sel;
  if (!s || s.kind !== 'point' || !s.id) return true;
  const layers = PT_LAYERS.map((k) => POINT_LAYER[k]);
  if (!layers.some((l) => hasLayer(l))) return true;
  const r = isInFilteredSet(layers, s.id);
  return r == null ? true : r;
}

/** UI 句柄（boot 里赋值）。模块级而非局部：`selectComp` / `pickAsset` 要用它同步 chip 状态，
 *  而它们可能在 boot 完成前被深链调用 —— 故所有引用处必须判空。 */
let uiApi = null;

function container() {
  return document.getElementById('map');
}

/** 当前容器的宽度。⚠ 认 `_st.el`（boot 的入参）而不是重新找 #map ——
 *  个股页嵌入时容器是它自己那个，裸页面里恰好也叫 #map 才碰巧对。 */
function width() {
  const el = (_st && _st.el) || container();
  return (el && el.clientWidth) || 390;
}

/** 容器高度。**只用于"世界像素高 ≥ 容器高"的判定**（见 camera.js 的 spanMax）：
 *  与 width() 同源（认 `_st.el` 而不是重新找 #map，个股页嵌入时容器是它自己那个）。 */
function height() {
  const el = (_st && _st.el) || container();
  return (el && el.clientHeight) || 0;
}

/* ── 261117 阶段1：懒加载闭环整体退役 ──────────────────────────────
   三档数据已预切成 MVT 瓦片，一个 vector source 装下全部 source-layer，
   MapLibre 按 zoom 自动请求对应瓦片。不再有「先挂粗档、按需补细档」这回事。
   下面两个导出**仅为兼容旧探针/调试面保留**：它们现在回答的是「三档是否都已就绪」，
   答案恒为「是」（三档图层在 boot 时一次建齐）。B2 会把 D 段断言改成新语义。 */
/** 兼容接口：三档是否就位（现在恒为全部）。 */
export function ensureFineTier(id) {
  if (!_st) return Promise.resolve(false);
  return Promise.resolve(true);
}

/** 兼容接口：已建出来的档（现在三档全在）。 */
export function loadedTiers() {
  return _st ? _st.tiers.map((x) => x.id) : [];
}

/**
 * 主题热切换（**原地改 paint，绝不 setStyle**）。
 * 底图与点位两边的补丁在这里合并 —— 页面层是唯一知道"一共有哪几层"的地方，
 * 所以合并点必须放这里，而不是让 theme.js 去认识图层、或让 layers.js 去认识点位。
 * @param {string} theme 'dark' | 'light' | 'sepia'
 * @returns {number} 实际改掉的 paint 属性条数（0 = 引擎没起来）
 */
export function applyTheme(theme) {
  if (!_st) return 0;
  const patch = Object.assign(
    {},
    themePatch(_st.tiers, theme),
    pointPaintPatch(PT_LAYERS, theme),
    pointHighlightPaintPatch(PT_LAYERS, theme),
  );
  const n = setPaintPatch(patch);
  _st.theme = theme;
  if (window[DEBUG_KEY]) window[DEBUG_KEY].theme = theme;
  return n;
}

/**
 * 容器宽度变了：**只有点径需要重锚**（点径的 zoom 端点是按宽度从 span 换算的），
 * 底图三档的 minzoom/maxzoom 也按宽度标定过，但那要改 layout 且改动会闪 ——
 * 现实里宽度变化只有旋屏（390→844 一档），此时重新 boot 更干净。
 * 故这里只处理点径，并在文档里明说这个取舍。
 * @param {number} W
 */
export function applyWidth(W) {
  if (!_st || !(W > 0) || W === _st.W) return 0;
  _st.W = W;
  return setPaintPatch(Object.assign(
    {},
    pointRadiusPatch(PT_LAYERS, W),
    pointHighlightRadiusPatch(PT_LAYERS, W),
  ));
}

/* ── 深链与搜索（阶段3 第⑤步）─────────────────────────────────
   ★ 深链**只读不写**：写回 hash 属于"路由"，得跟真页面的抽屉/卡片状态一起管，
     放在本阶段会半吊子（改一次相机就覆盖 URL，反而把别人的链接洗掉）。
   ★ **旧链接里的 `z` 不采信**：旧 z 是"自有语义值 × Z_SCALE"，而 Z_SCALE 依赖当年的
     TILE_HALF_DEG（540→360 变过），同一个 z 现在换算出的跨度是不确定的。
     故只采信 `v`（视野名，决定跨度）与 `c`（中心）。旧 `z` 由真页面在迁移时重新序列化。 */

/** 解析当前 URL 的深链（探针与真页面都用它，避免两处各写一遍解析）。 */
export function readDeepLink() {
  return parseHash(window.location.hash);
}

/** 由当前状态生成 hash（写侧接口：🔗 复制链接用它；本页仍**不回写地址栏**）。
 *
 *  ★ 只写「读侧真的会用」的键（261005 收口）
 *    读侧（boot 的深链落序）认：`v`（数据范围）、`sp`（精确跨度）、`c`（中心）、
 *    `f`（公司）、`cat`（分类）。**不认 `z`**（旧值是另一套口径，见文件头）——
 *    所以这里**不写 z**：写一个读侧不采信的值，等于链接在骗人。
 *  ★ 261116 任务#5：`v` 与 `sp` 从"二选一"改为**各写各的**（两者正交）：
 *    · `v`  = **数据范围**（china / world），只管"显示哪些点"；
 *    · `sp` = **镜头跨度**，只管"看多大"（中心另由 `c` 表达）。
 *    以前之所以二选一，是因为 `v` 是由相机跨度反推出来的、两者说的是同一件事；
 *    任务#5 让切换不再动相机后，它们说的是两件事 —— 只写一个必然丢掉另一半
 *    （要么链接打开后筛选没了，要么镜头回到默认）。
 *  ⚠ `L=` 也**不写**：老页面的 L 是"二选一换层"，本页两层同时画，没有对应语义；
 *    写 `L=hard` 只会让读的人以为电力层被关掉了。 */
export function makeHash(extra) {
  const c = getCamera() || { center: [0, 0], zoom: null };
  /* 数据范围取 store 的真相源，**不再**从相机跨度反推（probe().scope 那个口径已废） */
  const sc = store.state().scope;
  return buildHash(Object.assign({
    layer: null,
    scope: sc === 'cn' ? 'china' : sc === 'ov' ? 'world' : null,
    center: c.center,
    zoom: null,
    span: Number.isFinite(c.zoom) ? spanForZoom(c.zoom, width()) : null,
    focus: store.state().comp || null,
    cat: ix.current().cats,
  }, extra || {}));
}

/**
 * 把视野套到一组经纬度上（搜索命中的多个点 / 深链聚焦）。
 * ⚠ 必须传 `maxZoom`：否则命中的点挨得极近时引擎会一路放大到街道级，
 *   越过我们自己的最细上限（SPAN_MIN）。
 * @param {number[]} bbox [w, s, e, n]
 * @param {boolean} [animate]
 */
export function focusBounds(bbox, animate) {
  if (!_st) return false;
  return fitBounds(bbox, {
    animate: !!animate,
    /* ★ 261119 可视区居中：基础边距 + 面板遮挡让位（宽屏右侧栏 / 窄屏底部抽屉）。
       旧版写死 padding:28 按**全容器**居中，宽屏下目标落在右 360px 侧栏底下看不见。
       MapLibre 的 fitBounds 支持四边对象 padding，让位后目标落在"可视区"中心。 */
    padding: focusPadding(28),
    maxZoom: zoomForSpan(SPAN_MIN, _st.W),
  });
}

/**
 * 聚焦用的四边 padding：基础边距 base + 当前面板遮挡让位。
 * 宽屏 = 右侧栏宽（{right}），窄屏 = 底部抽屉高（{bottom}）；两者不会同时占（见 occlusionInset）。
 * 返回对象供 MapLibre fitBounds / easeTo 使用 —— 它们按 (宽-left-right, 高-top-bottom)
 * 重算有效视野，从而把目标摆进"真正看得见"的区域中心。
 */
function focusPadding(base) {
  const pad = { top: base, bottom: base, left: base, right: base };
  const inset = occlusionInset();
  for (const k in inset) if (k in pad && inset[k] > 0) pad[k] += inset[k];
  return pad;
}

/**
 * 在点位里按名称做子串搜索（972 个点，线性扫足够 —— **不需要空间索引**，
 * 更不需要 pbf/quadtree 这类第三方件）。
 * @param {string} q
 * @returns {Promise<{hits:Array, bbox:number[]|null}>}
 */
export async function searchPoints(q) {
  const s = String(q || '').trim();
  if (!s) return { hits: [], bbox: null };
  const cache = await loadPts();
  const hits = cache.filter((p) => p.n.indexOf(s) >= 0);
  if (!hits.length) return { hits: [], bbox: null };
  const lngs = hits.map((p) => p.lng), lats = hits.map((p) => p.lat);
  return { hits, bbox: [Math.min.apply(null, lngs), Math.min.apply(null, lats), Math.max.apply(null, lngs), Math.max.apply(null, lats)] };
}

/** 搜索并聚焦到命中集合（一条龙，真页面的搜索框调这个）。
 *  ★ 序号守卫（`job.latestOnly`，261006-112 P2-30）：连打两次回车时，先发的请求**可能后到**
 *    —— 不加守卫的话，相机最后会停在**旧关键词**的命中处（不报错、只是飞错地方）。 */
export const searchAndFocus = latestOnly(async (q, animate) => {
  const r = await searchPoints(q);
  if (r.bbox) focusBounds(r.bbox, animate);
  /* 只有一个命中时，fitBounds 的包围盒是零面积 —— 引擎会顶到 maxZoom 仍看不清，
     故单点直接 setCamera 到最细一档。 */
  if (r.hits.length === 1) {
    /* ★ 261119 可视区居中：复用 focusPointAboveDrawer（zoom 口径本就相同），
       避免这里裸 setCamera 绕过面板遮挡让位 —— 之前搜索单点会落在右侧栏底下。 */
    focusPointAboveDrawer(r.hits[0].lng, r.hits[0].lat, !!animate);
  }
  return r;
});

/**
 * 搜索框**回车**（261009 P1-4）：**先试公司、再试点位** —— 与候选列表同一条优先级。
 *
 * ★ 原先 `onEnter` 直接接 `searchAndFocus`，而它只走 `searchPoints()`（点位名）——
 *   于是输入一家**公司名**回车时：候选列表里明明有那家公司，回车却**静默无反应**
 *   （实测：输入「紫金矿业」→ 候选 1 条公司 → 回车后 comp 仍是 null、相机不动、无提示）。
 *   根因不是搜索坏了，而是**「公司优先」只接到了下拉、没接到回车**。
 * ★ 判据取**完全相等**才当"选中公司"：部分匹配就交给点位搜索 —— 否则输入两个字
 *   就会把用户丢进某家公司（"我想找矿，结果跳进公司档案"）。
 * ★ 两边都没命中 → **给一条 toast**。静默无反应是本次审计里最容易被当成"坏了"的一类。
 * @param {string} q
 * @returns {Promise<object|null>}
 */
export async function searchEnter(q) {
  const s = String(q || '').trim();
  if (!s) return null;
  const comps = await store.searchCompanies(s);
  /* ⚠ 字段名是 **`name`**（`searchCompanies` 的返回形状 `{code,name,nPts,ind}`），
     不是原始索引里的 `n` —— 写成 `c.n` 会永远匹配不到，而失败方式是**静默退回点位搜索**
     （探针第一次跑还"通过"了：上一段残留的 comp 恰好就是那家公司，假绿）。 */
  const exact = (comps || []).find((c) => c && String(c.name).trim() === s);
  if (exact) return selectComp(exact.code, true, { openCard: false });
  const r = await searchAndFocus(s, true);
  if (!r || !r.hits || !r.hits.length) {
    if (uiApi) uiApi.toast('没找到「' + s + '」');
    return null;
  }
  return r;
}

/* ── 公司驱动的交互（261003-88）─────────────────────────────────
   ★ 这一整段只有三条业务规则，其余都是机械动作：
     ① **选公司 = 改状态 + 聚焦 + 开卡**，三件事一起做，缺一件都不算完成
        （只改状态 → 点出来了但视野是世界视野，854 个点看不见自己家的；
          只聚焦 → 地图上还是空的，用户以为公司没数据）。
     ② **公司视图下点地图上的点 = 打开点位卡**，不是退出公司视图。
        退出公司视图只由「卡片上的 ✕」（在公司卡上）或「点地图空白」触发 ——
        ⚠ 261009 P0-2 修正：原先这条只写在注释里，代码**没做**（点空白会重开公司卡、
          永远退不出去）。现在 `ui.renderDrawer(null)` 按**逐级退出**实现：
          点位卡 →（点空白/✕）→ 公司卡 →（再点空白/✕）→ 退出公司视图。
     ③ **搜索候选里公司优先**：公司是新的主入口，点位退居第二层。
 */

/**
 * 候选搜索：公司优先、点位在后（261003-88 的成熟做法：主入口与次级入口分层）。
 * ★ 序号守卫（`job.latestOnly`，261006-112 P2-30）：输入即出候选时两次请求可能并发，
 *   先发的**可能后到** → 晚到的旧候选覆盖新候选（不报错）。被更新的一次覆盖后，
 *   本函数解析为 `undefined`，ui.js 据此丢弃（**判 `== null`** —— 空数组是合法结果）。
 * @param {string} q
 * @returns {Promise<Array<{kind:'comp'|'point', label, sub, right, payload}>|undefined>}
 */
export const suggest = latestOnly(async (q) => {
  const s = String(q || '').trim();
  if (!s) return [];
  const [comps, pr] = await Promise.all([store.searchCompanies(s), searchPoints(s)]);
  const out = comps.map((c) => ({
    kind: 'comp', label: c.name, sub: c.ind || '公司',
    right: c.nPts ? c.nPts + ' 点' : '', payload: c.code,
  }));
  /* 点位候选按「境内优先」排 —— 境外权益矿对多数人不是要找的东西，
     而同名矿常见（同名不同省），不排序的话第一条常是境外那个。 */
  const hits = pr.hits.slice().sort((a, b) => (isOv(a.ov) ? 1 : 0) - (isOv(b.ov) ? 1 : 0));
  hits.forEach((p) => out.push({
    kind: 'point', label: p.n, sub: isOv(p.ov) ? '境外' : '境内',
    right: p.which === 'power' ? '电力' : (p.cate ? cateCn(p.cate) : ''), payload: p,
  }));
  return out.slice(0, 12);
});

/**
 * 选中一家公司：**改状态 → 聚焦到它的境内资产 →（可选）开公司卡**（规则 ①）。
 * @param {string|null} code null = 退出公司视图（回到只剩底图）
 * @param {boolean} [animate]
 * @param {{openCard?:boolean}} [opt] `openCard:false` = **只筛不弹**（默认 true）。
 *   ★ 为什么把「开卡」提成显式参数（261008）：规则 ① 把三件事绑成一条（改状态 + 聚焦 +
 *     开卡），对「从公司面板 / 归属公司点进来」是对的 —— 用户就是想看这家公司。
 *     但**搜索**不是：用户搜一家公司，要的是「它在地图上有哪些资产」，
 *     而弹出的公司卡恰好把地图盖住 —— 那正是他要看的东西。
 *     所以这不是给搜索开个后门，而是把「开卡」从**隐含副作用**变成**调用方声明**：
 *     三个入口各自说清自己要什么，而不是在 selectComp 里猜。
 * @returns {Promise<object|null>} 公司记录（退出时 null）
 */
export async function selectComp(code, animate, opt) {
  const openCard = !(opt && opt.openCard === false);
  if (!code) { store.setComp(null); ix.select(null); return null; }
  /* ★ 261119 公司点击锁定（统一 guard）：已在公司视图时，切到**另一家**公司一律拦截。
     原来只在 company.js 公司面板列表里 disabled，而关联公司链接 / 搜索候选 / 点位卡
     归属公司按钮三条路径都直接调 selectComp，能绕过锁定 → "列表锁住、链接可切"自相矛盾。
     把所有换公司入口的判据收口到这一个函数（唯一真相源）；退出（code=null）在上面已放行。 */
  const cur = store.state().comp;
  if (cur && code !== cur) {
    if (uiApi) uiApi.toast('请先退出当前公司视图（点 ✕），再选择其它公司');
    return null;
  }
  store.setQuery('');
  /* setComp 要等索引算出 compIds（否则 filter 无从下手，见 store 文件头）。
     ⚠ 必须 await：不等就 return 会让调用方以为「已就位」，而此时地图还是空的。 */
  const ok = await store.setComp(code);
  if (!ok) return null;
  const c = store.compOf(code);
  if (!c) return null;
  /* 聚焦：优先境内 bbox（紫金这类跨洲公司直接用全量会退回世界视野，见 build_comp_index）。
     ⚠ **没有任何资产点的公司**（15 家纯参股平台）不聚焦 —— 没有 bbox 可用，
       硬调 fitBounds(null) 会抛异常。不聚焦时用户仍能看到公司卡里的说明。 */
  const bb = c.bboxCn || c.bbox;
  if (bb) focusBounds(bb, animate !== false);
  /* ⚠ 「开卡」必须**显式做**，不能只靠 store 订阅 —— 这是规则 ① 缺过的第三件事。
     `store.setComp` 对**同一家公司**是去重的（`_st.comp === v && _st.compIds` 时直接
     `return Promise.resolve(true)`，**不 emit**）→ 用户「已选中 A、抽屉停在点位卡上，
     再从公司面板点 A」时，公司卡**不会回来**（261005 探针 R 段第一次跑就撞上：
     同一家公司的入口数 = 0，换一家才有）。规则 ① 写的是「改状态 + 聚焦 + 开卡，
     三件事一起做，缺一件都不算完成」，所以这里补上这一件，与订阅无关。 */
  if (uiApi) {
    if (openCard) uiApi.renderComp();
    /* ★ 不开卡时必须**清空详情并收起侧栏/抽屉**：否则它会停在上一次那张卡上（可能是
       另一个点、甚至另一家公司），而用户此刻看的是新公司的资产分布 —— 旧卡是错的信息。
       ★ 261119：store 订阅的 renderComp 会抢先开卡（emit 是同步的），且宽屏卡片在侧栏里，
       setSnap('closed') 只作用抽屉管不到侧栏 → 必须用 clearDetail 一并清侧栏详情。 */
    else uiApi.clearDetail();
  }
  return c;
}

/**
 * 半开档抽屉**实际占掉的屏幕高度**（px）—— 点位的聚焦要把它让出去（261009 P0-1）。
 *
 * ★ 从 DOM **现取**，不写死 `0.30`：档位高度是 CSS 口径（`--u-drawer-max`），
 *   `SNAP.HALF` 只是**判据**；两边必须同步（见 ui.js 那段说明）。这里读真实盒模型，
 *   于是 CSS 改了、判据没改时，聚焦补偿仍然是对的 —— 而写死 0.30 会静默错位。
 * ⚠ 抽屉收起时它 translateY(101%) 藏起来了，`getBoundingClientRect().height` 仍是档位高度
 *   （transform 不改布局），所以这个读数在"卡片即将打开"的时刻就是对的。
 * @returns {number} 抽屉高度（px）；量不到时回落 0（= 不做补偿，宁可不动也别乱动）
 */
function drawerHeightPx() {
  try {
    const d = document.querySelector('.u-drawer');
    if (!d) return 0;
    const h = d.getBoundingClientRect().height;
    if (!(Number.isFinite(h) && h > 0)) return 0;
    /* ★★ 261120 **封顶到半开档**（口径由 ui.halfInsetPx 给，不在这里写 0.30）。
       不封顶的后果实测过：公司卡全开（844 视口 → 539px）时，`focusPadding` 把 bottom
       撑成 567px，`fitBounds` 于是把紫金的 bbox 往屏幕上方挤 —— 相机中心纬度从 38.7°N
       掉到 0.6°N（赤道），用户看到的是「选了公司，地图飞到非洲去了」。
       让位的目的是「别让卡片挡住刚聚焦的目标」，半开档就是为这件事定的高度；
       全开是用户主动要读内容，不该反过来重排地图。 */
    return Math.min(h, ui.halfInsetPx());
  } catch (e) {
    /* ⚠ 261119：不再静默吞错（原来只 return 0，问题全靠猜）。 */
    console.error('[index] 读抽屉高度失败', e);
    return 0;
  }
}

/**
 * 把相机挪到「该点在**抽屉之上**的可见区正中」（261009 P0-1）。
 *
 * ★ 为什么需要补偿：点位卡从**半开档（30vh）**打开，屏幕下方 30% 被抽屉盖住 ——
 *   只 `setCamera` 到该点的话，落在下方 30% 的点**会被自己的卡片挡住**。
 *   实测（844px 视口）：点 `h33` 屏幕 `y=629.7`，半开抽屉顶 `y=591` → 整点被盖住。
 *   而 `ui.js` 的 `renderPointCard` 注释早就写明「从 30vh 开就是为了**不挡住刚点的那个点**
 *   —— 用户点它正是为了看它在哪」：那个意图**只在上方 70% 成立**，因为代码从没做过补偿。
 * ★ 用引擎原生的 `padding`（它连墨卡托的纬度非线性一起算对），不手算纬度偏移 ——
 *   手算在跨纬度/跨缩放时必然错，且是同一换算的第二份实现。
 * @param {number} lng
 * @param {number} lat
 * @param {boolean} animate
 */
function focusPointAboveDrawer(lng, lat, animate) {
  if (!_st || !Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  /* ★ 261116 任务#6：让位方向随**形态**变 —— 窄屏是底部抽屉（{bottom}），
     宽屏是右侧栏（{right}）。MapLibre 的 padding 支持四边，
     所以这里只是换轴，机制不用改。 */
  const pad = occlusionInset();
  const cam = { center: [lng, lat], zoom: zoomForSpan(FOCUS_SPAN, _st.W) };
  const has = Object.keys(pad).some((k) => pad[k] > 0);
  if (has) cam.padding = pad;
  setCamera(cam, !!animate);
  return true;
}

/**
 * 当前**遮挡**区域（相机要给它让位）。
 * · 窄屏：底部抽屉 → `{bottom: 半开档高}`
 * · 宽屏：右侧常驻栏 → `{right: 侧栏宽}`
 * ⚠ 只有一个方向：面板不会同时占两侧（宽屏时抽屉整块隐藏）。
 *
 * ★★ 261120 两处口径修正：
 *  ① 窄屏的抽屉高度**封顶到半开档**（见 `drawerHeightPx`）：卡片被拖到全开时
 *     读到 539px → padding 撑掉大半个屏幕，相机被挤到赤道（紫金 38.7°N → 0.6°N）。
 *     让位的设计前提一直是「卡片从半开档打开」，超过它的部分不参与让位。
 *  ② 宽屏给一个**下限余量**：剩余可视区至少 280px。
 *     侧栏上限抬到 800 后，在 900px 宽窗口里如果照抄 sideWidth 就会把地图挤成 0，
 *     `cameraForBounds` 会直接判"装不下"（见 engine.fitBounds 的兜底注释）。
 */
function occlusionInset() {
  const wide = uiApi && uiApi.layout && uiApi.layout() === 'wide';
  if (wide) {
    const w = uiApi.sideWidth ? uiApi.sideWidth() : 0;
    return { right: Math.min(w, Math.max(0, width() - 280)) };
  }
  return { bottom: drawerHeightPx() };
}

/* 平移序号：连点两个点时只让**最后一次**落地 —— 否则先点的补间后到，
   视野会停在旧点（同样的竞态在 latestOnly 里处理过，这里是同一类问题的小号版本）。 */
let _panSeq = 0;

/**
 * 点击地图点位后的「**让位居中、不缩放**」（261120 用户明确要求）。
 *
 * 为什么单独一个函数、不复用 `focusPointAboveDrawer`：那个会把 zoom 设成 FOCUS_SPAN
 * （16°，等于放大）；用户要的是「不缩放，只把它挪到看得见的地方」。
 *
 * 三件必须做的事（少一件就出错）：
 *  ① 等一帧再动 —— `uiApi.render()` 展开侧栏是同步的，但 `--u-side-w` 可能被同帧的
 *     ResizeObserver 再改一次；rAF 里读到的是最终值。
 *  ② 相机正在动就不插队 —— 用户拖着地图/惯性滑行时点一下就被拽走，手感极差。
 *  ③ 跨 180° 经线要归一 —— `easeTo` 走最短路径，境外点会绕地球转一圈飞过去。
 */
function schedulePanTo(lng, lat) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
  const seq = ++_panSeq;
  requestAnimationFrame(() => {
    if (seq !== _panSeq) return;
    if (isMoving()) return;
    const cam = getCamera();
    const from = cam ? cam.center[0] : lng;
    const lng2 = lng + 360 * Math.round((from - lng) / 360);
    panTo([lng2, lat], { padding: occlusionInset(), animate: true });
  });
}

/**
 * 公司卡里点资产清单的一条：**飞到那一点并高亮它**（规则 ② 的补齐）。
 * ⚠ 必须先确保该点**可见** —— 若当前 chips 把它过滤掉了，飞过去也只看到空白
 *   （filter 是恒真叠加分类的）。故这里把分类筛选清成「全选」再选点。
 * @param {object} x 索引里的点记录（含 id / lng / lat；**没有 layer**，见 whichOfId）
 */
export function pickAsset(x) {
  if (!x) return false;
  /* 来源可能是公司索引 pts[]（`c` 字段 + 布尔 ov），也可能是搜索候选（`cate` + 字符串 ov）
     —— 全部由 normPoint 收成同一形状，这里不再自己拼字段（261005-101 R3）。 */
  const rec = normPoint(x);
  /* 点在清单里 = 用户想看它，分类筛选不该拦着（否则「点了没反应」）。
     ⚠ 261009 改正注释：清成 `null` 是**「没碰过这一维」（默认态）**，不是「全选」——
       三态化（261008）之后「全选」是**显式全数组**、`[]` 才是「全清」，三者不能混。
       这里选 `null` 是因为公司视图下 `compIds` 仍在起作用，点该显示的还是显示。 */
  if (ix.current().cats) {
    ix.setCategories(null);
    if (uiApi) uiApi.syncChips(null);
  }
  /* ⚠ 261009：**不再在这里动相机** —— 聚焦统一由 `ix.onSelect` 那条订阅里做
     （`focusPointAboveDrawer`）。两处各写一次会让相机被连续调两次（先到这里、再被订阅覆盖），
     表现是"飞过去又抖一下"。选中之后相机自然会被摆正，所以这里只负责"选中"。 */
  /* 选中：点位 id 来自公司索引，而索引的 id 直接读自点位 geojson（同一份真相源），
     故 feature-state 能对上。若对不上只会「不亮」，不会报错 —— 所以探针要验。
     ⚠ 层由 `whichOfId(id)` 推（索引里没有 layer 字段）。早先传的是 `x.layer`
       = `undefined` → `setFeatureState(undefined, …)` → MapLibre 只 console.error
       然后 return（**不抛**）→ 抽屉里"选中了"、地图上一个点都没亮（261005 修）。 */
  ix.select({ kind: 'point', which: rec.which, id: rec.id, props: rec });
  return true;
}

/**
 * 启动地图页。
 * @param {object} [opt]
 * @param {HTMLElement} [opt.container] 地图容器（默认找 #map）—— **个股页嵌入时传它自己的容器**
 * @param {boolean} [opt.bare] 裸模式：**不装 UI**（筛选栏/搜索/主题/抽屉都不建）。
 *   供个股页用（个股页自己有筛选控件与详情区，再装一套会重复且互相打脸）。
 * @param {string[]} [opt.onlyIds] 点位 id 白名单（只显示这些点）。个股页传本公司资产 id。
 *   ⚠ 必须用 **id 白名单**而不是公司代码 —— 见 points.js pointFilter 关于
 *     「legacy filter 对数组属性成员判断一律失效」的实测结论。
 * @returns {Promise<{ok:boolean, error?:string, focus?:number[]}>}
 */
export async function boot(opt) {
  const opt0 = opt || {};
  window.__mp2stage = 'boot-start';
  /* ★ 261119 加载进度条：从 boot 第一步就显示（此时 UI 层尚未 init）。
     bare 模式（个股页内嵌小容器）不显示 —— 那是宿主页面的一部分，不该弹全局浮层。
     ⚠ 引擎事件只能经 engine.js 的窄接口 onLoadProgress 上报，index.js 不碰 _map。 */
  const showProgress = !opt0.bare;
  if (showProgress) {
    progress.show();
    progress.set(0.05, '正在初始化地图');
  }
  const el = opt0.container || container();
  if (!el) throw new Error('index.js: 找不到 #map 容器');
  const W = el.clientWidth || width();
  const theme0 = currentTheme();
  /* ⚠ 一处赋值写全（261004-89 踩过）：早先版本先 `_st.bare = …` 紧接着又
     `_st = { el, W, … }` —— 后者**整个覆盖**前者，bare/onlyIds 静默丢失，
     表现为「嵌入参数传了但没生效」且**不报错**。别拆成两次写。 */
  _st = {
    el, W, tiers: null, theme: theme0,
    bare: !!opt0.bare,
    onlyIds: opt0.onlyIds ? opt0.onlyIds.map(String) : null,
  };
  const dl = readDeepLink();   // 深链**先解析**，随后按 L → v/c → cat 的次序落（见文件头）
  const srcs = Object.assign(buildSources(W), buildPointSources());
  const t = tiers(W);          // 全部三档（调试面与探针按它算区间）
  _st.tiers = t;
  /* 261117 阶段1：三档一次建齐（vector source 按 zoom 自动取对应瓦片，无需懒加载）。
     省界同样一次建好，minzoom=4（瓦片里 prov 只在 z4-5）。 */
  const style = buildStyle({
    sources: srcs,
    tiers: t,
    provMinZoom: provSpanLimit(),
    theme: theme0,
    /* 点位层追加在最上面（点必须压在边界之上，否则近景时被省界穿身）。
       高亮层再压在点位层之上 —— 它只在 hover/选中时才有要素，常态是空的。 */
    extraLayers: pointLayers(PT_LAYERS, W, theme0)
      .concat(pointHighlightLayers(PT_LAYERS, W, theme0))
      /* ★ 261117 任务#7：命中层放在**最后**（= 画在最上面）。
         透明层不影响视觉，但拾取时它会先被问到 → 热区按它算（手指够得着）。 */
      .concat(pointHitLayers(PT_LAYERS, W, theme0)),
  });

  const cam0 = defaultCamera(INIT_SCOPE, W);
  /* 深链落序：**先明确跨度（v / sp），再套中心（c）**。
     ⚠ 不采信旧链接的 `z`（口径变了，见文件头）—— 用了会把视野放到离谱的位置，
       而且是"静默的错误视野"，比不还原更难查。
     ⚠ `v` 的旧词表与本页的 SPAN_DEF **不是同一套**（261005 补）：老页写的是
       `v=cn`（老 S.scope∈{world,china}，cn = 中国），本页的键叫 `china` ——
       不做这个映射，**所有老书的书签/分享链接都会丢掉视野**（只剩中心点），
       而且不报错（表现只是"打开链接后视野不太对"）。 */
  const dlView = LEGACY_VIEW[dl.scope] || (SPAN_DEF[dl.scope] ? dl.scope : null);
  /* ★ 261116 任务#5：`sp`（镜头跨度）**优先于** `v`（数据范围）—— 两者现在**正交**。
     · v 只决定"显示哪些点"（cn / ov），不再隐含镜头；
     · sp / c 决定"看哪里、看多大"。
     旧口径是"二选一"（v 由相机跨度反推），照旧读的话 `v=china&sp=40` 会被 v 覆盖成
     62.5° —— 用户明明拖到了 40°，打开却是 62.5°，**且不报错**。
     v 只在**既没 sp 也没 c** 时才决定初始镜头（老链接的兼容路径，那时它确实带着镜头语义）。 */
  if (dl.span != null) cam0.zoom = zoomForSpan(dl.span, W);
  else if (dlView) cam0.zoom = zoomForSpan(SPAN_DEF[dlView], W);
  if (dl.camera && dl.camera.center) cam0.center = dl.camera.center;
  const r = create({ container: el, style, center: cam0.center, zoom: cam0.zoom });
  if (!r.ok) {
    // 引擎起不来（多半是 WebGL 不可用）——把原因摆在页面上，不要静默白屏
    if (showProgress) progress.fail('地图引擎启动失败');
    el.innerHTML = '<div style="padding:16px;font:13px/1.6 sans-serif;color:#e8eef7">'
      + '地图引擎启动失败：' + (r.error || '未知原因') + '</div>';
    return { ok: false, error: r.error };
  }

  window.__mp2stage = 'engine-created';
  /* ★ 261119：把引擎的资源/瓦片加载进度接到进度条。
     映射 20%~90%（0~20% 给初始化/引擎创建，90~100% 留给 onceLoaded 收尾），
     ratio=1（idle）也只到 0.9，真正的完成由下面 style-loaded 处 done() 统一收口。 */
  if (showProgress) {
    progress.set(0.2, '正在加载地图资源');
    onLoadProgress((p) => {
      const ratio = (p && typeof p.ratio === 'number') ? p.ratio : 0;
      progress.set(0.2 + 0.7 * ratio, (p && p.label) || '正在加载地图资源');
    });
  }
  /* 261004-89 排障用：引擎一起来就把 style 里的数据 URL 打出来。
     ⚠ 这类问题（路径写错 → fetch 404 → 一直等onceLoaded）**不报任何错**，
       页面只是白着等，必须能一眼看出「它到底在等哪个 URL」。 */
  window.__mp2Urls = (style.sources || {});
  /* 调试面**提前挂**（此时 ok 还是 false）：否则 load 卡住时探针拿不到引擎引用，
     只能看到"没起来"，排不了障。261003-79 就是这么卡了一轮。 */
  window[DEBUG_KEY] = {
    ok: false,
    stage: () => window.__mp2stage,
    why: diagnose,   // 引擎自述状态由 engine.js 提供（页面层不该懂 isSourceLoaded）
    /** 传给引擎的 style 摘要（排「style 被拒」这类问题时看这个，而不是猜） */
    styleInfo: () => ({
      version: style.version,
      sources: Object.keys(style.sources || {}),
      layers: (style.layers || []).map((l) => l.id),
      hasGlyphsKey: Object.prototype.hasOwnProperty.call(style, 'glyphs'),
    }),
  };

  /* ★ 261119：数据/style 加载失败不要让页面停在"有引擎、无 UI"的半成品。
     原来这里裸 await，reject 只会冒到 start() 的一句 console.error，屏幕上什么都没有。 */
  try {
    await onceLoaded();   // 三档数据要下载+解析，慢是正常的（探针会给足时间）
  } catch (e) {
    console.error('[map2] 地图数据加载失败', e);
    if (showProgress) progress.fail('地图数据加载失败');
    el.innerHTML = '<div style="padding:16px;font:13px/1.6 sans-serif;color:#e8eef7">'
      + '地图数据加载失败：' + (e && e.message ? e.message : String(e))
      + '<br><span style="font-size:11px;opacity:.75">检查 dist/ 数据文件是否齐全，或刷新重试。</span></div>';
    window.__mp2stage = 'data-load-failed';
    return { ok: false, error: e };
  }
  window.__mp2stage = 'style-loaded';
  resize();
  /* ★ 261119：数据齐备 → 进度条收口到完成并自动淡出（done 后引擎的残余 idle 事件
     不会再动它，progress.js 有终态保护）。 */
  if (showProgress) progress.done('加载完成');

  /* ★ 261116 任务#3：提示卡跟着点走。
     相机**每帧都在动**（拖动 / 补间 / 选中后 focusPointAboveDrawer 的动画），重投影必须
     合并到 rAF —— 一次重投影要读 2 个 rect + 2 个 offset，逐次调用会强制回流，
     与任务#4 的帧预算直接打架。只在有可见卡片时才有实际开销（hud 内部先判）。 */
  let _tipRaf = 0;
  function repositionTipSoon() {
    if (_tipRaf) return;
    _tipRaf = requestAnimationFrame(() => {
      _tipRaf = 0;
      if (uiApi) uiApi.repositionTip();
    });
  }

  // 尺寸变化（旋屏 / 折叠）统一转发给引擎，并让点径按新宽度重锚 zoom 端点
  if (window.ResizeObserver) {
    new ResizeObserver(() => {
      const w = width();
      resize();
      if (w !== _st.W) applyWidth(w);
      /* 提示卡按容器尺寸做边界翻转，尺寸变了必须重量（261116 任务#3）。 */
      repositionTipSoon();
    }).observe(el);
  }

  /* 主题联动（App 里由壳的设置面板驱动）：CFG_CORE_JS 在 <head> 已还原 data-theme，
     我们只需订阅它的变化把地图重上色 —— **不能靠刷新页面**（那是 setStyle 级别的大动作）。
     ⚠ 只在壳里存在这个事件；独立打开验证页时没有，故必须判存在。 */
  document.addEventListener('mp:themechange', (e) => {
    const th = (e && e.detail && e.detail.theme) || 'dark';
    const n = applyTheme(th);
    window.__mp2stage = 'theme:' + th + ' (' + n + ')';
  });

  /* 只读调试面：探针与排障用。**刻意只暴露查询能力**，
     不提供 setPaintProperty / addLayer 之类的后门 —— 否则解耦会从"结构"退化成"约定"。 */
  /* 层清单：**按启动时真正建出来的层现算**，不写死。
     ⚠ 261116 任务#4：省界改成懒加载后，写死 `[LAYER.sea, LAYER.prov]` 会列一个不存在的层
       （`MP2.layerIds` 是给探针/排障看的，列假的等于骗人）；50m/10m 同理。 */
  const layerIds = style.layers.map((l) => l.id);
  Object.assign(window[DEBUG_KEY], {
    ok: true,
    camera: getCamera(),
    tiers: t,
    /** 已建出来的档（启动只有 110m/50m；缩进去后 10m 才补上） */
    loadedTiers,
    /** 手动触发细档加载（探针与排障用；正常路径是相机自己触发） */
    ensureTier: ensureFineTier,
    layerIds,
    /** 建 style 时用的主题（探针对「分类色是否取自 MP_MAP_THEME」要用同一个主题查表） */
    theme: theme0,
    /** 主题热切换（业务口：页面上的主题按钮调它；**不是** setStyle 那种后门） */
    applyTheme,
    /** 点位层清单与各层认的分类（探针按它对账点数与分类色） */
    pointLayers: PT_LAYERS.map((k) => ({ which: k, layer: POINT_LAYER[k], hl: POINT_HL[k], cats: PT_CATS[k] })),
    /** 便捷换算（探针按「可见跨度」对账时用，口径只在 camera.js 一处） */
    span: () => spanForZoom(getCamera().zoom, width()),
    norm360,
    raw: __rawForTest,   // 只此一处：探针做深度检查用，业务路径不许调
    /** 交互的**只读**观察面（探针验 hover/选中/筛选是否真的落到引擎上） */
    ix: {
      current: ix.current,
      sel: () => ix.current().sel,
      hover: () => ix.current().hover,
      /** 程序化选中（深链与搜索将来也走它）——这才是业务口，不是"后门" */
      select: ix.select,
      setCategories: ix.setCategories,
    },
    /** 候选搜索（公司优先）/ 选公司 / 选公司名下某个点 —— UI 的三条业务入口 */
    suggest, selectComp, pickAsset, searchEnter, setScope, highlightPoint, focusOn,
    /** 顶层控件（261005）：图层开关与视野分段。探针按它们验「关一层后 filter 真的恒假」。
     *  ⚠ 261120：这两行原来被上一行的注释吞掉了 —— 上一行开了块注释却**没有收尾符**，
     *    于是 `MP2.setLayerOn` 一直是 undefined，探针一调就抛「不是函数」。
     *    这类「注释少一个收尾符 = 整段代码消失」的错**不报语法错**，只有真正调用时才炸。 */
    setLayerOn, setViewScope,
    /* ★ 261116 任务#6：当前形态（窄/宽）与右侧栏宽度 —— 探针要能断言
       「宽屏时顶部栈与抽屉都让位、卡片渲染在侧栏里」。 */
    layout: () => (uiApi && uiApi.layout ? uiApi.layout() : 'narrow'),
    sideWidth: () => (uiApi && uiApi.sideWidth ? uiApi.sideWidth() : 0),
    /** 261118 问题1：侧栏抽屉状态与操作（探针断言开合/拖宽/让位）。 */
    sideState: () => (uiApi && uiApi.sideState ? uiApi.sideState() : null),
    toggleSide: () => { if (uiApi && uiApi.toggleSide) uiApi.toggleSide(); },
    setSideWidth: (px) => { if (uiApi && uiApi.setSideWidth) uiApi.setSideWidth(px); },
    /** 复位 / 复制链接（261005）：老页 ⤢ 与 🔗 的对应物。copyLink 返回生成的 URL，
     *  探针直接拿它断言（不依赖剪贴板权限，剪贴板在 headless 里本来就不可靠）。 */
    resetView, copyLink,
    /** 公司面板（261005）：只读快照 + 显式开关（探针要能确定性地验排序/分组/首字母） */
    company: {
      probe: () => (uiApi ? uiApi.company.probe() : null),
      open: () => { if (uiApi) uiApi.company.open(); },
      close: () => { if (uiApi) uiApi.company.close(); },
      toggle: () => (uiApi ? uiApi.company.toggle() : false),
      jumpTo: (L) => { if (uiApi) uiApi.company.jumpTo(L); },
    },
    /** 信息层的只读快照（图层开关态 / 视野 / 弹窗开关 / 统计数字）—— 探针对账用 */
    hud: () => (uiApi ? uiApi.hud.probe() : null),
    /** 说明弹窗（261005 建）。⚠ **261008 删掉地图页的 ⚙ 按钮后，它一度成了死能力** ——
     *  无 UI 入口、不在本调试面上、也没有任何探针（`doc_drift` 的「零引用导出」也抓不到：
     *  它只认顶层 `export`，而 openNote 是模块内函数、挂在 hud 的返回对象上）。
     *  261009 补上这两个入口，让它与 `copyLink` 同规格 —— **按钮删了、能力留着，就必须有守护**，
     *  否则以后改坏 note.js / renderNote 没有任何信号。 */
    openNote: () => { if (uiApi) uiApi.hud.openNote(); },
    closeNote: () => { if (uiApi) uiApi.hud.closeNote(); },
    /* 抽屉三档（261004-93）：探针要能直接切档验「露出多少」——
       拖动路径在真机上不好用合成事件复现，故探针走「切档」这条确定路径。 */
    setSnap: ui.setSnap, snap: ui.snap,
    /** store 的只读快照（探针验「公司选择真的落到状态里」） */
    store: store.probe,
    /** 深链：解析结果（只读）、生成 hash、聚焦、搜索 —— 都是真页面要用的业务接口 */
    deepLink: dl,
    hash: makeHash,
    focusBounds,
    searchPoints,
    searchAndFocus,
    /** 屏幕坐标 → 该处有哪些要素（长按菜单之类的真页面也会用；探针用它锁 pick 的入参归一化） */
    pickAt: (px, layerIds) => pick(px, layerIds),
  });

  /* 交互接线：事件挂在地图容器上（不是 document —— 否则抽屉里的点击也会被当成点地图） */
  ix.init({ el, which: PT_LAYERS });
  /* 状态 → 引擎 filter 的**唯一通路**（261003-88）。
     三个状态（选中公司 / 分类 / 搜索词）都收在 store，这里订阅后统一落图层 ——
     界面各处只改状态，不再各自 setFilter，免得互相打脸。 */
  /* 嵌入模式（个股页）：白名单由**调用方**给（本公司资产 id），不走 store ——
     个股页没有「再选一家公司」这个交互，它的筛选维度是「境内/境外 + 矿种」，
     与 store 的 comp/cats 是两套。⚠ 但显示口径仍走 pointFilter（唯一实现）。 */
  const applyFilters = (st) => {
    /*⚠ 白名单**按层分开喂**（261004-89 修）：个股页的 onlyIds 是**本公司**的点，
       硬资产的公司只可能有 h*  id、电力公司只可能有 p* id。
       早先版本把同一份 id 列表喂给两层 → 西部矿业（20 个 h* id）那一页，
       电力层的 filter 变成「id ∈ 20 个 h*」→ 理论上应该是 0 个，
       实测却渲染出 455 个电站（p62/p63/…）—— 说明 legacy filter 在 id 跨层比较时
       行为不可靠（与「数组属性成员判断一律失效」同源，见 points.js 的注释）。
       正解：每层只喂**该层自己的** id（p 前缀归power、其余归 hard），
       一层都不属于的公司 → 该层给恒假（不给 null，null 是「不过滤」）。 */
    const ids = _st.onlyIds || null;
    PT_LAYERS.forEach((k) => {
      let use = st;
      if (ids) {
        const mine = ids.filter((x) => whichOfId(x) === k);
        /* ⚠⚠ 空数组（`['in', ['get','id'], ['literal', []]]`）才是恒假。
           我第一版用 `['__none__']` 当「不可能的 id」—— 而 `__none__` 是 MapLibre 的
           **保留哨兵值**，`['literal', ['__none__']]` 被解释成「无值」，比较**恒真**：
           西部矿业那页因此渲染出 62 个电站（电力层 filter 完全失效），
           而同样的代码在紫金那页看着正常（境内视野里恰好没被误放行的点）。
           ⚠ 这类「恒假写成看似非法的值」的错误**不报错**，只是静默全放行 ——
           与「数组属性成员判断失效」同源，都属于「filter 静默失效」这一类。 */
        use = { compIds: mine, cats: st.cats, scope: st.scope };
      }
      /* ★★ 261120：**三层写同一份 filter**（视觉 / 高亮 / 命中）——
         只给视觉层设的那一年，隐藏的点「看不见但点得中」：命中层是透明的、
         半径 10~18px，没有 filter 就等于给全部点位留了一块隐形热区
         （用户原话：「点被隐藏的时候还能点，这根本就不对啊」）。
         层清单的唯一来源是 `pointLayerIds`（见 points.js），别在这里手写三个常量。 */
      const f = pointFilter(k, use);
      pointLayerIds(k).forEach((lid) => setFilter(lid, f));
    });
    /* ★ 261009 P1-5：筛选条件一变，**已经选中的那个点可能被筛掉** —— 而卡片不会自己知道。
       实测：选中 `h20`（precious）→ 筛成 `[coal]` → 卡片**仍开着**、标题仍是「长山壕金矿」、
       引擎里的 `feature-state.sel` 仍是 true，而 `h20` 已**不在渲染集里**（全图 84 个 coal 点）。
       那就是「卡片与地图两处打脸」—— 本项目最忌讳的一类。
       ⇒ 筛完问一次「选中的点还在不在」，不在就把它取消（走 `ix.select(null)`，
         于是卡片按 renderDrawer 的逐级规则退到该去的位置）。
       ⚠ 判据**必须问引擎**（`isInFilteredSet`），不能在 JS 里复算 filter（那是第二份实现）。
       ⚠⚠ **要等两帧再问**：`setFilter` 是同步改样式，但引擎把新 filter 反映到
         `queryRenderedFeatures` 上要**两帧** —— 261009 实测（同一个 id 的命中数）：
         改之前 2 → **同 tick 2（旧结果）** → 1 帧后 1（只更新了一半的层）→ 2 帧后 0。
         同 tick 就问的话永远读到"还看得见"→ 这条修复**等于没做**（而它不会报错）。
       ⚠ 期间用户可能又换了选中 → 回调里**带上当时的 id 复核**，不是同一个就什么都不做。
       ⚠ `uiApi` 还没装好（boot 早期）时不动 —— 那时也没有"卡片"这回事。 */
    if (uiApi) {
      const want = ix.current().sel;
      if (want && want.kind === 'point' && want.id) {
        waitFilterSettled(() => selStillVisible(), (visible) => {
          const cur = ix.current().sel;
          if (!cur || cur.kind !== 'point' || cur.id !== want.id) return;
          if (!visible) ix.select(null);
        });
      }
    }
  };
  store.on(applyFilters);
  applyFilters(store.state());   // 初始：什么都没选 → 全部点都显示（261116 起，见 points.js）

  /* 嵌入模式（个股页）：**不装 UI** —— 个股页自己已有筛选控件与资产详情区，
     再装一套筛选栏/搜索框/抽屉会重复，且两边的筛选状态会互相打脸。
     ⚠ 但 **store 订阅必须留着**：显示口径（applyFilters）在这里，它不依赖 UI。
     ⚠ 选中也不订阅渲染：个股页有自己的资产列表，点击那边高亮地图即可。 */
  if (_st.bare) {
    applyFilters(store.state());
  } else {
    /* UI 装配（分类筛选栏 / 搜索框 / 主题按钮 / 详情抽屉）。
       DOM 与样式都在 ui.js 里，这里只做接线：把**引擎已有的能力**（setCategories /
       searchAndFocus / applyTheme / onSelect）挂到控件上 —— UI 不新增任何业务判断。
       ⚠ 主题按钮走的是 applyTheme 直调，**不发** mp:themechange，所以要手动 paint 一次
         （ui.js 自己也监听 mp:themechange，那是给壳的设置面板用的）。 */
    uiApi = ui.init({
      onCats: (sel) => ix.setCategories(sel),
      /* 候选：公司与点位合并，公司优先（规则 ③）。onSuggest 必须返回 Promise，
         ui.js 只是 Promise.resolve().then(showSug)，不关心同步还是异步。 */
      onSuggest: (q) => suggest(q),
      onPick: (it) => {
        /* ★ 公司候选 = **只筛不弹**（261008，见 selectComp 的 opt 说明）：搜索的意图是
           「在地图上找这家公司的资产」，不是读公司简介 —— 公司卡一弹就把地图盖住了。
           点位候选仍走「选公司 + 打开点位卡」：那是用户明确点了某个具体资产。 */
        if (it.kind === 'comp') selectComp(it.payload, true, { openCard: false });
        else {
          /* 命中点位：把它所属的公司一并选中（若有）—— 这样地图上不会只剩一个孤点，
             且公司卡能打开；无归属的点就只飞过去选它自己。 */
          /* 候选 `it.payload` 本身已是规范形状（搜索缓存 `loadPts()` 过过 normPoint）——
             直接透传，别再拆字段重建：早先就是那样把 `cos` 与 `lv` **拆丢**的
             （于是搜索进的点位卡没有「归属公司」那排，见 record.js 文件头）。 */
          const rec = normPoint(it.payload);
          /* 多家共有的点（cos 有多个）：选第一家。**不弹选择器** —— 那种点多为汇总档，
             选第一家足够代表，且弹窗在离线小屏上比问题本身还麻烦。 */
          const code = rec.cos[0];
          if (code) selectComp(code, true).then(() => pickAsset(rec));
          else pickAsset(rec);
        }
      },
      onEnter: (q) => searchEnter(q),
      onComp: (code) => selectComp(code, false),
      /* ★ 261009 P2-7：`selectComp` 是 async，且它内部的 `focusBounds` 在 `await` **之后**
         才落相机 —— 不串起来的话，那个 focusBounds 会跑在 `pickAsset` 之后，把"飞到该点"
         覆盖成"套住整家公司"（表现是「点了资产却停在公司全景」，且**不报错**）。
         当前两个调用点传的 `code` 恒等于 `store.comp`，所以这条竞态**暂时走不到**；
         但只要将来出现"卡片显示的公司 ≠ store.comp"就会显形 —— 故直接串对。 */
      onPickPoint: (code, x) => {
        const go = store.state().comp === code ? null : selectComp(code, false);
        return Promise.resolve(go).then(() => pickAsset(x));
      },
      /* ★ 261009 P0-3：抽屉**不再显示任何点位**（收起 / 换卡 / 退出公司视图）时，
         把交互层记的选中静默清掉 —— 否则「收起抽屉后再点同一个点」会被 `select()`
         的去重判成「没变化」，卡片打不开（实测）。
         ⚠ 用 `clearSel()`（不发通知）而不是 `ix.select(null)`（会触发 render →
           "刚被收起的卡片自己弹回来"）。 */
      onDropSel: () => ix.clearSel(),
      onRelComp: (name) => {
        /* 关联公司名 → 代码（索引里 rel 只有名字）。找不到就明确提示，不静默失败。 */
        store.index().then((idx) => {
          let hit = null;
          for (const c2 in idx) { if (idx[c2] && idx[c2].n === name) { hit = c2; break; } }
          if (hit) selectComp(hit, true);
          else if (window.console) console.warn('[map2] 关联公司未在索引里：' + name);
        });
      },
      /* 顶层控件（261005）：图层开关与视野分段。
         ⚠ 两件事都**只改状态/相机**，按钮的高亮由 hud 自己按状态重画 ——
           不许在这里直接操作按钮的类名（那就成了两份状态，迟早对不上）。 */
      onLayer: (k, on) => setLayerOn(k, on),
      /* ★ 261116 任务#5：切换境内/境外 = **纯数据操作，一行都不碰相机**。
         约束是"位置与缩放必须保持不变，不得重置/跳转/重新适配" —— 所以这里只改状态，
         由 store 广播驱动 setFilter；相机只有用户手势、复位、深链初始才会动。
         ⚠ 以前这里还有 `setViewScope(s)`（跳到该视野的默认镜头）。删掉它之后
           「中国/世界」不再兼任镜头预设，`SPAN_DEF` 只剩"复位/初始镜头"两处用途。 */
      /* ★ 261116 任务#5 最终形态：**双驱动** —— 先换数据，再导航。
         顺序有讲究：先 setScope（store 广播 → 重算 filter → 高亮与点位同帧对齐），
         再 setViewScope（飞行）。反过来会先看到全量点飞过去、再突然少掉一大半。 */
      /* ★ 261117 用户拍板：视野分段改为**显式三选一 radio**（全部 / 中国 / 世界）。
         原来"两个都不亮=全部"的隐藏态已被用户否掉 —— 现在「全部」是一个真按钮，
         点哪个选哪个，**无 toggle-off**（点已亮的不变，setScope 幂等自然吞掉）。
         ⚠ 三档的相机语义仍要分清：`all` = 开机默认镜头；`world` = 境外分布区（10.8°E）；
           `china` = 境内 bbox 中心。切 `all` 回默认镜头（与复位同口径），
           否则停在中国 66° 跨度却看全量点，比例对不上。
         ⚠ 顺序仍是先换数据再导航（否则先看到全量点飞过去、再突然少掉一大半）。 */
      onScope: (s) => {
        if (s !== 'all' && !SPAN_DEF[s]) return;       // all 是数据档，不在 SPAN_DEF（镜头表里）
        const target = SCOPE_TO_FILTER[s] || null;     // all → null（不过滤）
        setScope(target);
        setViewScope(s === 'all' ? null : s);          // all → 默认镜头
      },
      onReset: () => resetView(),
      getCamera: () => getCamera(),
      span: () => spanForZoom((getCamera() || { zoom: 0 }).zoom, width()),
      /* 261116 任务#3：提示卡定位的唯一坐标源。这里只给**画布像素**，
         「画布 → #ui」的换算在 ui.js 里做（DOM 布局归它管）。 */
      project: (lngLat) => project(lngLat),
      onSel: (hit) => ix.select(hit),
      currentTheme: () => (_st && _st.theme) || 'dark',
      setTheme: (t) => { applyTheme(t); if (uiApi) uiApi.paint(); },
      /* ★ 261118 问题1：侧栏开合 / 拖宽后，提示卡要按新投影重定位。
         相机**不主动移动**（抽屉开合不该把地图镜头拽走）——新宽度在下次聚焦时由
         occlusionInset() → sideWidth() 自然读到。 */
      onSideLayout: () => repositionTipSoon(),
    });
    /* ★ 261119：公司索引加载失败要给可见提示 —— store.index() 保留 {} 兜底
       不破坏调用链，但广播 mp:idxfail；这里统一 toast，避免「0 家公司/搜公司无反应」
       却毫无反馈（原来只有一条 console.error）。 */
    document.addEventListener('mp:idxfail', () => {
      if (uiApi) uiApi.toast('公司索引加载失败，请检查网络或重试');
    });
    /* ★ 261009 P0-1：选中一个点位 → 顺带把相机摆正（**仅程序化入口**）。
       为什么把「聚焦」放在这条订阅里而不是各入口自己调：**入口有三个**
       （点地图 / 公司卡资产清单 / 搜索候选），原先只有后两个调 `pickAsset` 里的
       `setCamera`，于是「点地图上的点」**根本不居中** —— 落在下方 30% 的点被自己的
       卡片盖住（实测 y=629.7 vs 抽屉顶 591）。放在唯一的订阅里，后两个入口自动同口径。
       ⚠ 与 `pickAsset` 的分工：那边只负责"选中"，相机由这里统一摆（两处各写一次会连调两次）。

       ★★ 261117 曾定：用户直接点地图上的点位时**不移动地图**（怕打断拖拽手感）。
       261120 用户改口径：「点击后完全没有居中动作，我提出过啊 —— 点击某资产，
       在不要缩放的情况下在左侧居中，右边弹出详情」。
       所以现在点地图走 `schedulePanTo`：**只平移、不改 zoom**，目标落到
       「扣掉右侧面板后的可视区」中心；缩放/拖拽/滚轮等原生交互仍不碰。
       程序化入口（搜索 / 公司卡 / 深链）保留原 `focusPointAboveDrawer`（放大 + 居中）——
       那些入口的意图是"带我去看这一处"，缩放是对的。 */
    ix.onSelect((hit, source) => {
      uiApi.render(hit || null);                 // 详情：所有来源都要出
      if (!hit || hit.kind !== 'point') return;
      const lng = hit.props && hit.props.lng, lat = hit.props && hit.props.lat;
      if (source === 'map') { schedulePanTo(lng, lat); return; }
      if (Number.isFinite(lng)) focusPointAboveDrawer(lng, lat, true);
    });
    /* 悬停提示（261005）：命中判断在 interactions 里（唯一实现），这里只把结果转给 hud。 */
    ix.onHover((hit) => { if (uiApi) uiApi.tip(hit); });

    /* 深链的 `cat` 必须在交互接线**之后**落（它调的是 interactions.setCategories）。
       `L=` 目前无副作用：新页面**同时画硬资产与电力两层**，不再是旧页面的"层切换"语义，
       故仅解析保留在 `deepLink` 里，等真页面决定要不要恢复单层模式。 */
    if (dl.cat) { ix.setCategories(dl.cat); uiApi.syncChips(dl.cat); }

    /* ★ 261116 任务#2：老深链 `v=cn/china` 现在=互斥的中国视图（仅境内），`v=world`=仅境外。
       相机已在 boot 里按 dlView 就位（第 554 行），这里同步数据过滤维度 —— 两者必须一致，
       否则「链接说世界、相机在世界、点却还是全量」。放在 UI 装配后：hud 的 store.on 已订阅，
       setScope 一次广播同时把 filter、chip 计数、分段高亮、统计行全部对齐。
       ⚠ 只在本分支（非 bare）做：个股页 embed 的 scope 由 host 控制，不被深链覆盖。 */
    if (dlView) setScope(SCOPE_TO_FILTER[dlView]);

    /*⚠⚠ 深链 `f=`（公司代码）**原来根本没被处理**（261004-91 补）：老引擎用它实现
      「个股页右上角的『进入资产地图 →』点进来就直接落在那家公司」，而 parseHash
      早就把 f 解析进 `dl.focus` 了，boot 却没人用 —— 表现是**点CTA 进来是一片空白地图**
      （hash 明明带着 f=sh601899，store().comp 却是 null）。
      ⚠ 与 cat 的差别：cat 必须等 interactions.setCategories 定好（它只改 L 目），
        focus 要等 UI 与筛选都装好才能selectComp（它要改口径+ 取景+ 开卡）。
      ⚠ 只在**非 bare 模式**做：bare（个股页内嵌）本来就没有「从深链选公司」这个交互，
        且那时地图自己的 comp 由宿主用 onlyIds 决定，不能被深链覆盖。 */
    if (dl.focus) {
      const code = String(dl.focus);
      store.index().then(() => {
        if (!store.compOf(code)) return;          // 索引里没有这家公司 → 保持空白（不报错）
        selectComp(code, true);
      });
    }
  }

  // 相机变化：更新调试面快照（数据加载由 MapLibre 按 zoom 自动完成，无需手动补档）
  onCamera((c) => {
    window[DEBUG_KEY].camera = c;
    /* 视野分段的高亮要跟着相机走（用户自己缩到中间尺度后两个镜头都不该亮）。
       ⚠ 相机回调**每帧都来**（拖动时），所以 hud 那边必须自己判"值没变就别写 DOM"。 */
    if (uiApi) uiApi.scopeChanged();
    /* 卡片锚在点上 → 相机一动它就得重新投影，否则会"钉"在屏幕上、底下的点在走
       （261116 任务#3）。 */
    repositionTipSoon();
  });

  setCamera({ center: cam0.center, zoom: clampZoom(cam0.zoom, W, height()) }, false);
  return { ok: true };
}

/**
 * 高亮某个点位（**只亮，不改相机**）—— 个股页的资产列表点一条时用。
 * ⚠ 与 pickAsset 的区别：那个会飞到那一点，这个只打光。个股页的列表和地图同屏，
 *   列表已经能看到位置，不需要再动相机（动相机会让列表滚出视野）。
 * @param {string} which 'hard' | 'power'
 * @param {string} id 点位 id
 * @param {{lng?:number, lat?:number}} [loc] 给了就连高亮带定位（只挪到最细档，不做补间）
 * @returns {boolean} 是否成功选中
 */
/**
 * 切「境内 / 境外」这一维（个股页的分段控件用；'cn' / 'ov' / null=不限）。
 * ⚠ 这是**互斥**维度：切到境内就只剩境内点，境外点全隐藏（不是「优先显示」）。
 *   地图页本身不设这一维（两类都画），个股页因为要「境内 30 路 / 境外 12」分栏才需要。
 * @param {'cn'|'ov'|null} v
 * @returns {boolean} 是否真的改了
 */
export function setScope(v) {
  const before = store.state().scope;
  store.setScope(v || null);
  return store.state().scope !== before;
}

/**
 * 图层开关（261005 补回老页顶栏的「⛏️ 硬资产 / ⚡ 电力」）。
 * 语义与老页**不同**：老页是"二选一换层"，新页两层画在同一张底图上，
 * 所以这里是**独立的开关**（默认都开，关掉一层 = 该层 filter 恒假）。
 * @param {'hard'|'power'} key
 * @param {boolean} on
 * @returns {boolean} 是否真的改了
 */
export function setLayerOn(key, on) {
  if (!store.setLayerOn(key, on)) return false;
  /* ⚠ 关掉一层时，若当前选中的点正属于这一层，必须**把它清掉**：
     高亮层是 feature-state 驱动、**没有 filter**（见 points.js 那条"feature-state 不能用在
     filter 里"），所以 filter 恒假挡不住已经点亮的那一个环 —— 会出现
     「层关了，那个圈还亮着」。清除选中是唯一能真正做到这件事的地方。 */
  const sel = ix.current().sel;
  if (sel && sel.kind === 'point' && sel.which === key && !on) ix.select(null);
  return true;
}

/* ── 视野分段 = 导航 + 数据范围（261116 任务#5 最终形态）────────────────────
   演进：① 只有镜头预设 → ② 加互斥过滤（双驱动）→ ③ 一度只留过滤、镜头不动
   → ④ **回到双驱动，但镜头目标改由数据算出**。

   ★ 为什么④：境内/境外是**全局划分**不是空间划分，纯过滤只在"两类点同屏"时才有价值。
     实测同屏重叠度：中国视野 境内 841 / 境外 29（切一下屏幕基本空掉）；
     世界视野 境内 91 / 境外 62（才有可比性）。
     ⇒ 按钮必须"带我去看这一类"，否则就是个累赘 —— 这也是用户实际反馈的。
   ★ 镜头目标**由数据算**：境内点聚在中国（bbox 中心 ≈102.8°E）、境外点横跨 280°
     （bbox 中心 ≈10.8°E）。写死 40°/104° 那种常量在数据更新后会悄悄指错地方。
   ★ 分工仍然清晰：**分类 chip 是筛选器（不动镜头）**；这两个按钮是导航 + 范围。 */
const NAV_PAD = 28;   // 目标镜头的内边距（与旧的 fitBounds padding 一致）

/** 某个 scope 的点位包围盒（构建期统计里的真相源；没取到就 null）。 */
function scopeBBox(scope) {
  const st = uiApi && uiApi.hud && uiApi.hud.stats ? uiApi.hud.stats() : null;
  const bb = st && st.bbox_by_scope && st.bbox_by_scope[scope];
  return (bb && bb.length === 4) ? bb : null;
}

/**
 * 某个 scope 的**目标镜头**（导航与复位共用同一个口径，别各写一份）。
 * @param {'cn'|'ov'} scope
 * @returns {{center:number[], zoom:number, capped:boolean}}
 */
function scopeCamera(scope) {
  const W = width(), H = height();
  /* ★ 261119 遮挡让位：宽屏侧栏展开时，可用宽要扣掉侧栏 ——
     否则按全宽算的 zoom 会让 bbox 右缘落到侧栏底下（与 focusBounds 同类问题）。
     sideWidth() 在侧栏收起时返回 0，复位路径不受影响。 */
  const availW = Math.max(1, W - (uiApi && uiApi.sideWidth ? uiApi.sideWidth() : 0));
  const bb = scopeBBox(scope);
  if (!bb) {
    /* 统计还没到（boot 早期）→ 退回旧口径。等数据到了再由用户点击触发，
       那时走的是 bbox 分支。 */
    const c = defaultCamera(scope === 'ov' ? 'world' : 'china', W);
    return { center: c.center, zoom: clampZoom(c.zoom, W, H), capped: false };
  }
  return cameraForBounds(bb, availW, H, NAV_PAD);
}

/**
 * 切到某个视野的**镜头**（只管相机，不碰数据过滤 —— 过滤由 setScope 负责）。
 * @param {'world'|'china'} name
 */
export function setViewScope(name) {
  if (!_st) return false;
  /* name 为 null = 「全部」档 → 回**默认镜头**（与 resetView 的默认态同口径）。
     ⚠ 不用「世界」档的镜头（那是境外分布区 10.8°E）：默认镜头是开机那一眼，
       「全部」= 回到开机状态，语义要一致。 */
  /* ★ 261119 遮挡让位：视野镜头也让开右侧栏 —— 与 focusBounds/搜索聚焦同口径，
     否则「中国/世界/全部」切完目标仍按全容器居中，落在侧栏底下。 */
  const pad = focusPadding(0);
  if (name === null || name === undefined) {
    const c = defaultCamera(INIT_SCOPE, width());
    setCamera({ center: c.center, zoom: clampZoom(c.zoom, width(), height()), padding: pad }, true);
    return true;
  }
  const scope = name === 'world' ? 'ov' : name === 'china' ? 'cn' : null;
  if (!scope) return false;
  const cam = scopeCamera(scope);
  setCamera({ center: cam.center, zoom: cam.zoom, padding: pad }, true);
  return true;
}

/**
 * 复位（261005 补回老页的 ⤢ / `resetView`）。
 *
 * 语义 = **回到刚打开这一页的干净态**，一次做全五件事，缺一件都会留下"半复位"的错觉：
 *   ① 清分类筛选（chip 全亮 + 点位全显示 = 默认态，261116 起）
 *   ② 退出公司视图（地图上不再只剩一家）
 *   ③ 清搜索词与选中（抽屉收起 —— 否则会停在一张已经不成立的卡片上）
 *   ④ 收掉浮层（公司面板 / 搜索建议）
 *   ⑤ 相机回**当前视野**的默认镜头
 *
 * ⚠ 视野（世界/中国）**不复位**：老页 `resetView` 也是按 `VIEW_DEF[S.scope]` 回到
 *   当前位置的默认镜头 —— 用户切到中国在找国内的矿，点复位把他丢回世界视野是帮倒忙。
 *   ★ 261116 任务#5：这里读的是 **`store.state().scope`（数据范围）**，不是相机跨度。
 *     复位是**显式命令**，允许动相机（与"切换不动相机"不冲突）——它做的是
 *     "回到当前数据集对应的默认镜头"。
 * @returns {boolean} 是否执行（引擎没起来时 false）
 */
export function resetView() {
  if (!_st) return false;
  ix.setCategories(null);
  ix.select(null);
  store.setComp(null);
  store.setQuery('');
  if (uiApi) {
    uiApi.syncChips(null);      // chip 的高亮必须跟着状态走（两处打脸是这个项目的老毛病）
    uiApi.clearQuery();
    ui.setSnap('closed');
    if (uiApi.company) uiApi.company.close();
    uiApi.hideSug();
  }
  /* ★ 261116 任务#2：复位镜头取**当前过滤维度**对应的视野（与按钮高亮同一真相源），
     不再按相机跨度反推 —— 互斥视图下用户手动缩放后，跨度会偏离预设，按跨度反推会
     「过滤还是境内、复位却飞回世界镜头」。scope 本身**不清**（延续既有"视野不复位"设计：
     用户在找境内矿，点复位不该突然全显示境外点）。 */
  const sc = store.state().scope === 'cn' ? 'cn'
    : store.state().scope === 'ov' ? 'ov' : null;
  /* ★ 任务#5：复位与「视野分段」按钮落到**同一个目标**（scopeCamera）——
     否则会出现"按世界飞到 A 点、按复位却飞到 B 点"的两处打脸。 */
  const cam = sc ? scopeCamera(sc) : (function () {
    const c = defaultCamera(INIT_SCOPE, width());
    return { center: c.center, zoom: clampZoom(c.zoom, width(), height()) };
  })();
  setCamera({ center: cam.center, zoom: cam.zoom }, true);
  return true;
}

/**
 * 复制当前视图链接（261005 补回老页的 🔗 / `copyViewLink`）。
 *
 * ★ 本页**不回写地址栏**（见文件头：深链只读不写）。所以这里算出的 URL
 *   与地址栏里那条可能不同 —— 它带的是**当前**状态，这正是「复制链接」要的东西。
 * ⚠ 复制失败必须有回执：`navigator.clipboard` 需要安全上下文（本页在 App 里是
 *   https://money.local，符合；但独立以 http/file 打开时可能没有）——
 *   老页的兜底是 `prompt()` 让用户手抄，这里改成「把 hash 显示在提示条里」：
 *   同样能拿到，且不弹系统框。
 * @returns {string} 生成出来的完整 URL（探针直接拿它对账，不依赖剪贴板）
 */
export function copyLink() {
  let hash = '';
  try { hash = makeHash(); } catch (e) { hash = ''; }
  const url = String(location.href).split('#')[0] + hash;
  const ok = () => { if (uiApi) uiApi.toast('链接已复制'); };
  const fallback = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const good = document.execCommand('copy');
      document.body.removeChild(ta);
      if (good) { ok(); return; }
    } catch (e) { /* 下面统一兜底 */ }
    if (uiApi) uiApi.toast('复制失败，可复制：' + hash);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(ok, fallback);
  } else fallback();
  return url;
}

/**
 * 屏幕坐标 → 该处的要素列表（**个股页点地图上的点**用）。
 * ⚠ 这个口必须是**正式导出**：早先我只把它挂在调试面（window.MP2.pickAt），
 *   个股页里写 `_mp2.pickAt(...)` 拿到的是 undefined，调用被 try 吞成静默无反应 ——
 *   表现是「点地图上的点没反应」，而控制台干净。
 *   （教训与 MEMORY 铁律 5 同源：不只「删函数要搜调用方」，**加调用方也要确认有实现**。）
 *
 * ⚠ 要**显式传层**：不传时默认只查硬资产层，但个股页若公司是电力公司会查不到；
 *   不显式限定就可能命中另一层的同坐标要素（实测紫金那页命中 p95 —— 电站的 id）。
 *
 * @param {[number,number]} px 容器内坐标（左上为原点）
 * @param {string[]} [layerIds] 限定层；默认硬资产 + 电力两层
 * @returns {Array<{props:object, layerId:string}>} 命中的要素（可能多个，调用方自己挑）
 */
export function pickAt(px, layerIds) {
  const lid = layerIds || [POINT_LAYER.hard, POINT_LAYER.power];
  const hits = pick(px, lid);
  return hits || [];
}

/**
 * 按 `which + id`（+ 可选坐标）高亮并选中一个点 —— **个股页点地图上的点**走这条。
 * 只给 which/id 时 `cate`/`ov` 由 normPoint 补空值，其中 `ov` 落 **null**（"未知"）而非
 * false，卡片才不会把境外点误标成「中国境内」。返回是否选中成功。
 *
 * @param {string} which 层键（hard / power）
 * @param {string|number} id 点位 id（来自公司索引，与点位 geojson 同一份真相源）
 * @param {{lng?:number, lat?:number}} [loc] 可选坐标；缺省时由 id 反查
 * @returns {boolean} 是否选中成功
 */
export function highlightPoint(which, id, loc) {
  if (!which || id == null) return false;
  /* 来源只给 which + id（+可选坐标），没有 cate / ov —— normPoint 会补空值，
     且 `ov` 落 **null**（"未知"）而非 false，这样卡片不会把境外点误标成「中国境内」。 */
  const rec = normPoint({
    id: id, which: which,
    lng: loc && isFinite(loc.lng) ? loc.lng : undefined,
    lat: loc && isFinite(loc.lat) ? loc.lat : undefined,
  });
  const ok = ix.select({ kind: 'point', which: rec.which, id: rec.id, props: rec });
  return !!ok;
}

/**
 * 把相机套到一组经纬度上（个股页嵌入时的对外口，与 focusBounds 同义但不做 maxZoom 限制）——
 * 个股页的视口很矮（38vh ≈ 240px），用地图页那套 maxZoom（按 SPAN_MIN 算）会放得太大。
 */
export function focusOn(bbox, animate) {
  if (!_st) return false;
  const w = width();
  return fitBounds(bbox, { animate: !!animate, padding: 20, maxZoom: zoomForSpan(FIT_SPAN, w) });
}

export function start() {
  boot().then((r) => {
    if (!r.ok) console.error('[map2] 启动失败', r.error);
  }).catch((e) => { console.error('[map2] 启动异常', e); });
}
