/* interactions.js —— 交互（**只做"人做了什么 → 改哪个状态"，不碰引擎实例、不碰样式**）
   ------------------------------------------------------------------
   负责：鼠标拾取点位的悬停/选中状态、分类筛选的施加、以及把「选中变了」这件事通知页面层。
   不负责：怎么画点（→ points.js）、怎么改 paint（→ engine.js 的窄接口）、
           选中后弹什么卡片（→ 页面层自己订阅）。

   ★★ 三条业界标准做法（261003-80 对照过），别改回去：

     ① **hover 用 `setFeatureState`，不用 `setFilter`**。
        官方博客有实测原话：拿 setFilter 做高亮，鼠标快移时「takes a few seconds to catch-up」；
        而 setFeatureState 是 **O(1)** —— 不重建顶点缓冲、不重新取瓦片。
        代价是要素必须有 id（→ points.js 的 `promoteId`）。

     ② **要素间切换必须用 `mousemove` + 缓存上一个要素 id**。
        官方文档写明 `mouseenter`/`mouseleave` **只在跨入/跨出整个图层时各触发一次**，
        在点与点之间移动它们**根本不触发** —— 只靠这两个事件，高亮会"粘"在第一个点上。

     ③ **`queryRenderedFeatures` 必须节流**。
        每次调用都要遍历命中要素。这里用 rAF 合并同帧内的多次 mousemove
        （浏览器最多每帧一次 mousemove，rAF 合并后天然 ≤1 次/帧，且不引入额外延时）。

   ⚠ 本模块**不认识** MapLibre：它只用 engine.js 的 `pick` / `setFeatureState`。
     筛选也不在这里落（261003-88）：`setCategories` 只改 store，由页面层统一 setFilter。
     探针 `_map2_check.mjs` 的 A 段会断言 `src/` 里只有 engine.js 引用 maplibre。 */

import { POINT_LAYER, POINT_HIT, POINT_SRC, PT_LAYERS, FS, pointFilter, PT_SOURCE_LAYER } from './points.js';
import { pick, project, setFeatureState, setTrackPointer } from './engine.js';
import { normPoint } from './record.js';
import * as store from './store.js';

/* 261005-99：**取消省面（与国家面）拾取** —— 点面弹出的那张卡只有「省份」两个字加一行分类描述，
   没有任何资产信息，用户明确要求去掉（原话：「省份卡去掉，国家卡也去掉」）。
   随之下线：`AREA_HITS` / `pickArea` / `mp-prov-pick` 图层 / `china_poly` 数据源
   （连带不再打进包的是 478 KB 的 `china.geo.json`）。
   ⚠ 别顺手把「点空白关卡片」改掉：onClick 现在**只问点位**，没命中即 `select(null)`，
     页面层据此收起卡片 —— 这正是取消面拾取后的期望行为。 */

/** 单例状态（与 engine.js 一样，一页一张图，不做多实例）。`destroy()` 会全部复位。 */
let _el = null;
let _which = [];
let _hitLayers = [];      // 参与拾取的图层 id
let _topFirst = [];       // 同上、但**从上到下**排列（先问最上面那层）
let _layerToWhich = {};    // 层 id → 业务层名（hard / power）
let _hovered = null;      // {which, id, props} | null
let _sel = null;          // {which, id, props} | null
let _cats = null;         // 当前选中的分类（null = 全选）
/** 拖动判定阈值（px）：pointerdown→click 位移超过它就算"拖动"而非"点击"。 */
const DRAG_SLOP = 6;
let _downPt = null;     // pointerdown 时的屏幕坐标（判断 click 是不是拖出来的）
let _lastEv = null;
let _lastPt = null;       // 上一次 hover 的容器内坐标（悬停提示定位用；见 current().at）
let _raf = 0;
const _subs = new Set();  // 选中变化订阅者
const _hsubs = new Set(); // 悬停变化订阅者

/* ── 内部工具 ───────────────────────────────────────── */

/** 屏幕坐标（相对容器）→ 最上面那一层的命中要素。没有则 null。
 *  ⚠ 命中要素的 `props` 是**引擎给的原始 feature properties**（engine.pick 只搬字节，
 *    不认识业务数据）—— 这里必须过 `normPoint()` 才能进 UI（字段名/ov 类型统一，见 record.js）。
 *  ★ 261009：`props` 里**没有经纬度**（点位层的坐标在 geometry 里），而页面层要拿它
 *    "把相机挪到刚点的那个点" → 故把 `engine.pick` 给的 `lngLat` 一并喂进 `normPoint`
 *    （`normPoint` 本来就认 `lng`/`lat`）。不补这一步的后果是**静默不聚焦**：
 *    `props.lng` 是 undefined → 判空失败 → 什么也不发生（261009 P0-1 的根因）。 */
function pickTop(px) {
  /* ★★ 261120：**按屏幕距离取最近**，不是"哪层先命中就取它"。
     旧写法逐层 `pick(px,[lid])` 再取 `r[0]` —— `queryRenderedFeatures` 的返回顺序是
     要素在**瓦片里的顺序**，与距离毫无关系：密集区里明明点的是 3px 外那个点，
     弹出来的却是 20px 外的另一个（用户「比较难点中」的另一半原因，另一半是热区太小）。
     现在一次查全部命中层 → 用 project 算屏幕距离 → 距离升序；
     相差 <0.5px 视为平手，此时按画序（上层优先）裁决 —— 保住"电站在矿点之上"的既有语义。 */
  const rows = pick(px, _hitLayers);
  if (!rows.length) return null;
  let best = null, bestD = Infinity, bestRank = 99;
  for (let i = 0; i < rows.length; i++) {
    const f = rows[i];
    const lid = f.layer || '';
    const rank = _topFirst.indexOf(lid);
    const r = rank < 0 ? 99 : rank;
    const ll = f.lngLat;
    const p = (ll && Number.isFinite(ll[0]) && Number.isFinite(ll[1])) ? project(ll) : null;
    const d = p ? Math.hypot(p[0] - px[0], p[1] - px[1]) : 1e9;
    if (d < bestD - 0.5 || (Math.abs(d - bestD) <= 0.5 && r < bestRank)) {
      best = f; bestD = d; bestRank = r;
    }
  }
  if (!best) return null;
  const ll = best.lngLat;
  /* ★ 261009：`props` 里**没有经纬度**（坐标在 geometry），页面层要拿它"把相机挪到刚点的点"
     → 把 engine.pick 给的 `lngLat` 一并喂进 normPoint。不补这一步就是**静默不聚焦**。 */
  const src = (ll && Number.isFinite(ll[0]) && Number.isFinite(ll[1]))
    ? Object.assign({}, best.props, { lng: ll[0], lat: ll[1] })
    : best.props;
  const rec = normPoint(src, _layerToWhich[best.layer || (_hitLayers[0] || '')]);
  return { kind: 'point', which: rec.which, id: rec.id, props: rec };
}

/** 改某个要素的 feature-state（键名只能来自 points.FS，见那里的说明）。
 *  ⚠ 只在 `kind === 'point'` 时写：面积层（省面）没有 promoteId，写 state 会静默无效。 */
function mark(hit, key, on) {
  if (!hit || hit.kind !== 'point') return;
  /* ★ 261117 阶段1：vector source 的 feature-state 必须带 sourceLayer（见 engine.setFeatureState）。 */
  setFeatureState(POINT_SRC[hit.which], hit.id, { [key]: !!on }, PT_SOURCE_LAYER[hit.which]);
}

function same(a, b) {
  const ka = a ? a.kind + ':' + a.which + ':' + a.id : '';
  const kb = b ? b.kind + ':' + b.which + ':' + b.id : '';
  return ka === kb;
}

/* ── 三个事件 ───────────────────────────────────────── */

/** 记下按下的位置（用来分辨"点击"与"拖动后的补 click"）。 */
function onDown(e) { _downPt = [e.clientX, e.clientY]; }
/** 指针被取消（打断）：清掉按下坐标，下一次 click 不做拖动判定。 */
function onDownCancel() { _downPt = null; }

function onMove(e) {
  _lastEv = e;
  if (!_raf) _raf = requestAnimationFrame(flushMove);
}

function flushMove() {
  _raf = 0;
  if (!_el || !_lastEv) return;
  const r = _el.getBoundingClientRect();
  const px = [_lastEv.clientX - r.left, _lastEv.clientY - r.top];
  _lastPt = px;
  const hit = pickTop(px);
  /* ① 先清上一个、再设新的：反了会让"移出所有点"时旧点永远亮着。
     ② 相同要素直接跳过 —— 否则每一帧都对同一个要素写一次 state（引擎要重绘）。
     ⚠ 坐标（_lastPt）**每帧都要更新**，悬停提示要跟着手走；只有"命中要素"才做跳过。 */
  if (same(hit, _hovered)) return;
  mark(_hovered, FS.hover, false);
  mark(hit, FS.hover, true);
  _hovered = hit;
  /* ★ 261117 任务#7：光标**不能**设在 #map 上 ——
     MapLibre 的 CSS 给画布容器写了 `cursor: grab`
     （.maplibregl-canvas-container.maplibregl-interactive），子元素的规则会盖掉容器上的设置，
     于是「指针」**从来没亮过**（实测）。正解是 MapLibre 自己的 track-pointer 类。 */
  setTrackPointer(!!hit);
  _hsubs.forEach((f) => { try { f(_hovered); } catch (e) { console.error('[interactions] onHover 回调异常', e); } });
}

function onLeave() {
  _lastEv = null;
  _lastPt = null;
  if (_raf) { cancelAnimationFrame(_raf); _raf = 0; }
  if (_hovered) {
    mark(_hovered, FS.hover, false);
    _hovered = null;
    _hsubs.forEach((f) => { try { f(null); } catch (e) { console.error('[interactions] onHover 回调异常', e); } });
  }
  setTrackPointer(false);
}

function onClick(e) {
  if (!_el) return;
  /* ★ 261117 任务#7：拖动地图后浏览器**仍会补一个 click** ——
     手机上平移一下地图就误选一个点（卡片自己弹出来），非常莫名其妙。
     判据：pointerdown → click 的位移超过阈值 = 这是拖动，不是点击 → 丢弃。 */
  if (_downPt) {
    const dx = e.clientX - _downPt[0], dy = e.clientY - _downPt[1];
    _downPt = null;
    if (dx * dx + dy * dy > DRAG_SLOP * DRAG_SLOP) return;
  }
  const r = _el.getBoundingClientRect();
  const px = [e.clientX - r.left, e.clientY - r.top];
  /* 只问点位（261005-99 起不再问省面，见文件头）。没命中 = 点了空白（`sel = null`），
     页面层据此关卡片。
     ★★ 261009：**必须 force**（见 `select()` 的 `force` 说明）。点地图是一次**事件**，
       不是一个状态 —— 用去重来响应事件，"同一个状态连点两次"时第二次会被吞掉。
       实测两处都因此坏过：
         · 收起抽屉后再点**同一个点** → 卡片打不开（P0-3）；
         · 公司视图下**连点两次空白** → 第二次没反应，永远退不出公司视图（P0-2 的逐级退出）。
       去重本身没错，错在把它用在了事件路径上。 */
  /* ★ 261117 任务：点地图传 source='map' —— 页面层据此**不移动相机**（261009 的
     "点选后聚焦"只该用在搜索/公司卡等程序化入口；用户直接点地图时，地图自己动会
     打断拖拽/连续查看的手感）。source 只作通知参数，不进 hit —— 不改 feature-state
     字段、不污染订阅者拿到的选中形状。 */
  select(pickTop(px), true, 'map');
}

/* ── 对外接口 ───────────────────────────────────────── */

/**
 * 初始化（幂等：重复调用先销毁旧的）。`el` 就是地图容器 —— 事件挂在它上面，
 * 而不是去 `document` 上兜（那样抽屉/卡片上的点击也会被当成点地图）。
 * @param {{el:HTMLElement, which?:string[]}} opt
 */
export function init(opt) {
  destroy();
  _el = opt.el;
  _which = (opt.which || PT_LAYERS).slice();
  /* ★ 261117 任务#7：拾取问**命中层**（透明、半径大），不问视觉点层。
     视觉点半径只有 3~7px → 手指的热区直径 6~14px，根本点不中。
     命中层与点层**同源**（同一份数据、同一个 id 空间），所以拿到的 id 照样能用。 */
  _hitLayers = _which.map((k) => POINT_HIT[k]);
  _topFirst = _hitLayers.slice().reverse();   // 画序的倒序 = 从上到下
  _layerToWhich = {};
  _which.forEach((k) => { _layerToWhich[POINT_HIT[k]] = k; });
  /* passive: true —— 我们从不 preventDefault，声明成 passive 让浏览器不必等回调
     （移动端上是滚动流畅度的一部分）。 */
  /* ★ 261117 任务#7：**没有 hover 能力的设备不挂 mousemove** ——
     触摸拖动地图会合成 mousemove → 悬停提示卡跟着手指在地图上乱跳（很干扰）。
     判据用媒体查询 `(hover: none)`（触摸设备的标准特征）。 */
  const canHover = !(window.matchMedia && window.matchMedia('(hover: none)').matches);
  if (canHover) {
    _el.addEventListener('mousemove', onMove, { passive: true });
    _el.addEventListener('mouseleave', onLeave);
  }
  _el.addEventListener('click', onClick);
  /* 拖动判据用的按下坐标（与 hover 无关，触摸也要）。 */
  _el.addEventListener('pointerdown', onDown, { passive: true });
  _el.addEventListener('pointercancel', onDownCancel, { passive: true });
  return { ok: true, layers: _hitLayers.slice(), canHover: canHover };
}

/**
 * 订阅「选中变化」。返回退订函数。
 * 回调签名 `(hit, source)`：
 *   · hit —— `{which,id,props}|null`（null = 点了空白）
 *   · source —— `'map'` 表示**用户直接点地图**；其余（undefined）为程序化入口
 *     （搜索 / 公司卡清单 / 深链接 / 探针）。页面层据此决定是否聚焦相机：
 *     点地图不移动视野，程序化入口保留原聚焦行为。
 *     ⚠ 多传一个参数对老订阅者无害（JS 忽略多余实参），故不存在兼容问题。
 */
export function onSelect(fn) {
  _subs.add(fn);
  return () => _subs.delete(fn);
}

/**
 * 订阅「悬停变化」（261005 加，悬停提示用）。返回退订函数，回调参数同 onSelect。
 * ⚠ 为什么把它加在这里而不是让提示自己去挂 mousemove：
 *   「光标下是哪个要素」的判断（含节流、跨要素切换、清上一个）**已经**是本模块的职责 ——
 *   再挂一份就是同一个判断有两份实现，两处迟早不一致（表现是"提示显示 A、点亮的却是 B"）。
 *   提示只需要**知道**结果与位置。 */
export function onHover(fn) {
  _hsubs.add(fn);
  return () => _hsubs.delete(fn);
}

/**
 * 程序化选中（深链接线 / 搜索命中 / 探针都用它，**不要**模拟鼠标事件）。
 *
 * @param {object|null} hit
 * @param {boolean} [force] **跳过去重**，无条件通知订阅者。
 *   ★ 只有「点地图」这条**事件**路径该传 true（见 `onClick`）：事件不能用状态去重来响应，
 *     否则"同一个状态连点两次"的第二次会被静默吞掉（261009 P0-3 / P0-2 都栽在这）。
 *   ⚠ 程序化调用**别传** —— 那些是"把状态设成某个值"，重复设同一个值本来就该是空操作
 *     （比如 `store.setComp` 对同一家公司去重，那是有意的）。
 * @param {string} [source] 选中来源，透传给 onSelect 订阅者；`'map'` = 用户点地图。
 *   与 force 一样只走通知，不改变选中状态本身。程序化入口不传（=undefined）。
 */
export function select(hit, force, source) {
  if (!force && same(hit, _sel)) return _sel;
  /* ★ 261117 阶段1：所有入口的 props 统一过 normPoint（唯一规范器，见 record.js）。
     程序化 select（探针 / 深链 / 公司卡）传的是**原始瓦片 properties**，其 cos 是
     JSON 字符串（MVT 不支持数组属性）；不过这一道，renderPointCard 的 `cos.slice().forEach`
     会对字符串调用 forEach → 抛错，卡片打不开（S5 实测踩到）。幂等：pickTop 已过一次。 */
  const norm = (hit && hit.kind === 'point' && hit.props)
    ? Object.assign({}, hit, { props: normPoint(hit.props, hit.which) })
    : hit;
  mark(_sel, FS.sel, false);
  mark(norm, FS.sel, true);
  _sel = norm || null;
  _subs.forEach((f) => { try { f(_sel, source); } catch (e) { console.error('[interactions] onSelect 回调异常', e); } });
  return _sel;
}

/**
 * **静默**清掉选中：只清状态与 feature-state，**不触发 `onSelect` 订阅者**（261009 P0-3）。
 *
 * ★ 为什么需要它 —— 一个实测出来的死路：
 *   抽屉被收起（向下拖走 / 返回键）**只改档位**，`_sel` 留在这里。于是用户再点**同一个点**时
 *   `select()` 的 `same()` 去重把它判成「没变化」→ 订阅者不触发 → **卡片打不开、毫无反应**
 *   （实测：点 `h244` → 收起 → 再点 `h244` → 仍是 closed；改点别的点才正常）。
 *   这不是去重写错了，而是**「显示出来的选中」与「这里记的选中」分了家** ——
 *   本项目的标准解法就是让两处不许分家（对比 store 与 chips 的高亮）。
 *
 * ⚠⚠ **不能**用 `select(null)` 代替：那会触发订阅者去渲染，等于「用户刚收起的卡片
 *    自己弹回来」。所以这里刻意不发通知 —— 调用方（页面层）是在「卡片已经没了」之后
 *    才调它，画面不需要任何变化。
 * ⚠ 幂等：已经是 null 时直接返回（`setSnap('closed')` 在关卡片路径上会被重复调到）。
 */
export function clearSel() {
  if (!_sel) return;
  mark(_sel, FS.sel, false);
  _sel = null;
}

/** 当前选中 / 悬停快照（只读，给探针与页面层取用）。
 *  `at` = 上一次 hover 的**容器内坐标**（悬停提示按它定位；没在 hover 时为 null）。 */
export function current() {
  return { sel: _sel, hover: _hovered, cats: _cats, at: _lastPt ? _lastPt.slice() : null };
}

/**
 * 施加分类筛选（**真正的落点是 store**，不是这里改图层）。
 * 261003-88：显示口径要并上「选中公司」这一维，若各写各的 filter 会出现
 * 「chip 说全选、面板说按公司」互相打脸，而且**不报错**（只是画出来的点不对）。
 * 这里只改状态；页面层订阅 store 后统一 setFilter（见 index.js）。
 * @param {string[]|null} sel 选中的分类。**三态**（261008，见 points.js pointFilter 的 ★）：
 *   `null` = 没碰过这一维（启动态，chip 全亮）；`[]` = 显式全清（恒假）；
 *   `[部分]` = 只留这些；`[全部]` = 显式全选（等价于不按分类限制）。
 *   ⚠ 别再把 `[]` 折成 `null` —— 那是「全清」与「全选」撞成一个状态的老写法。
 * @returns {{hard:any, power:any}} 各层**将会**写进去的 filter（探针据此对账）
 */
export function setCategories(sel) {
  _cats = sel ? sel.slice() : null;
  store.setCats(_cats);
  /* 返回**当前真实状态**算出的 filter（含已选公司的 compIds）——
     早先版本硬传 `{comp: null}`，那样这个返回值在「已选公司」时是错的，
     而探针 J 段正是拿它对账引擎实际写进去的值（对不上就是两处口径打架）。 */
  const st = store.state();
  return { hard: pointFilter('hard', st), power: pointFilter('power', st) };
}


/** 拆掉事件与状态（重复 init、或页面卸载时）。 */
export function destroy() {
  if (_el) {
    _el.removeEventListener('mousemove', onMove);
    _el.removeEventListener('mouseleave', onLeave);
    _el.removeEventListener('click', onClick);
    _el.removeEventListener('pointerdown', onDown);
    _el.removeEventListener('pointercancel', onDownCancel);
    setTrackPointer(false);
  }
  _downPt = null;
  if (_raf) { cancelAnimationFrame(_raf); _raf = 0; }
  mark(_hovered, FS.hover, false);
  mark(_sel, FS.sel, false);
  _el = null; _lastEv = null; _hovered = null; _sel = null; _cats = null; _lastPt = null;
  _hitLayers = []; _topFirst = []; _layerToWhich = {};
  _subs.clear(); _hsubs.clear();
}
