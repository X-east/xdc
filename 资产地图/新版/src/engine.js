/* engine.js —— **唯一允许 import MapLibre 的模块**（深度解耦的硬约束）
   ------------------------------------------------------------------
   负责：引擎生命周期（创建 / 销毁 / resize）、相机的读写、事件转发、
         以及所有需要引擎实例才能做的小操作（投影换算、拾取查询）。
   不负责：图层怎么装配（→ layers.js）、数据源怎么声明（→ sources.js）、
           配色（→ theme.js）、业务交互（→ 页面层）。

   ⚠ 硬约束：`grep -rn "maplibre-gl.mjs" src/` 只能命中本文件。
     其它模块要什么能力，就在本文件加一个**窄接口**，不许各自去碰引擎实例。
     探针 `tests/_map2_check.mjs` 会断言这一条（解耦不是口号，要能被机器查）。

   ⚠ 引擎实例**不对外暴露**（不返回 map 对象）：一旦别人能拿到实例，
     解耦就退化成了"约定"，迟早有人绕过本模块直接调它。 */
import * as ML from '../vendor/maplibre/6.11.2/maplibre-gl.mjs';
/* 缩放上下限要按「可见跨度」口径换算（zoom ↔ span），口径只在 camera.js 一处。
   ⚠ camera.js 是纯函数（不 import engine.js），不成环。
   ★ 261117 阶段1：删掉经度钳制后不再需要 spanForZoom（那是钳制专用）。 */
import { zoomForSpan, spanMax, SPAN_MIN } from './camera.js';

/* MapLibre v6 只有**具名导出**（没有 default）。写成 `import ML from '…'` 会得到 undefined，
   页面白屏且只在 window.onerror 里能看到 —— 261003-68 实测踩过。 */
const MapCtor = ML.Map;
if (typeof MapCtor !== 'function') {
  throw new Error('engine.js: 未从 maplibre-gl.mjs 取到 Map 构造器（导出名变了？）');
}

/* 引擎默认参数置顶。改行为改这里，不要在调用点各写一份。 */

/**
 * 渲染像素比上限（261116 任务#4）。
 *
 * ★ 为什么限：填充图层的成本 ∝ **画布像素数**，而 dpr 在高端机上是 2.5~3 ——
 *   390×844 的容器在 dpr3 下是 1170×2532 ≈ 300 万像素，比 dpr2 多 2.25 倍的着色量。
 *   本页没有文字标注（style 里刻意不写 glyphs），像素比降一档只影响线条锐度，
 *   换来的是拖拽帧率的直接改善，属于"性价比最高的一档降级"。
 * ★ 为什么是 2：dpr≤2 的屏（多数桌面/低端机）**完全不受影响**；
 *   只有 2.5/3 的高分屏才降到 2，肉眼差异远小于"少一半像素"的收益。
 * ⚠ 必须是纯函数：调用点在模块顶层，Node 里跑单测时没有 window。
 */
export const PIXEL_RATIO_MAX = 2;

/** @param {number|undefined} dpr @returns {number} 实际使用的渲染像素比 */
export function pickPixelRatio(dpr) {
  const d = Number(dpr);
  if (!Number.isFinite(d) || d <= 0) return 1;
  return Math.min(d, PIXEL_RATIO_MAX);
}

const OPT_DEF = {
  /* 261003-88：禁旋转与俯仰（用户要求「地图不要旋转了，没有意义」）。
     资产地图是「按经纬看资产」的世界地图，转起来方位感全丢，而且底图是三档整世界 GeoJSON
     （非瓦片），旋转后既不好看也拖慢。dragRotate 管鼠标右键/长按旋转，touchPitch 管双指俯仰，
     pitchWithRotate 关掉「俯仰跟随旋转」。 */
  dragRotate: false,
  touchPitch: false,
  pitchWithRotate: false,
  /* 渲染像素比封顶（见上面 pickPixelRatio 的说明）：dpr 2.5/3 的高分屏降到 2，
     填充与线条的着色量按像素数下降到约 64%。dpr≤2 的屏不受影响。 */
  pixelRatio: pickPixelRatio(typeof window === 'undefined' ? 1 : window.devicePixelRatio),
  /* 横向平铺：261117 阶段1 起 MVT vector 瓦片按 Web Mercator x 取模**天然无限横向铺**，
     `renderWorldCopies` 默认 true（B0 实测：jump ±360° 仍有 61~175 个底图要素）。
     旧 GeoJSON 时代的三条踩坑记录（renderWorldCopies 缺失 / wrap 属性不被支持 /
     数据侧铺副本）随 GeoJSON 渲染一起退役，详见 sources.js 文件头。
     ⇒ 不再需要 clampLng，相机经度允许越过 ±180。 */
  attributionControl: false,  // 离线自用，不需要版权控件（合规标注另有位置）
  fadeDuration: 0,            // 关掉淡入，帧预算可预测（探针要量帧间隔）
  antialias: true,
  preserveDrawingBuffer: false, // 只在探针需要 readback 时开（开了会略微变慢）
};

let _map = null;              // 单例：一个页面一张地图

/* ── 加载进度（261119）───────────────────────────────────────────────────
   引擎是唯一持有 _map 的模块，加载事件只能在这里听。对外只暴露一个窄接口
   onLoadProgress(cb)，把「资源/瓦片加载进度」以 {ratio,label} 上报，
   不泄露引擎实例（解耦硬约束，见文件头）。

   ★ 进度模型（实测校正）：单靠 isSourceLoaded() 不够 —— MapLibre vector source
     在 data/sourcedata 事件触发时 isSourceLoaded 往往仍为 false，导致进度长时间
     卡在 0、然后瞬间跳 100%（261119 playwright 实测：20%→100% 无中间态）。
     改用**时间平滑爬升 + 事件加速 + idle 收口**三段式：
       · 注册回调即启动 interval，按缓出曲线把 0→0.85 平滑推上去（保证可见递增）；
       · 每个 data/sourcedata（真实瓦片/资源到位）额外把进度往前推一档；
       · idle / force 直接收口到 1 并停表。
     这样无论 MapLibre 事件节奏如何，用户都能看到连续、可信的加载过程。 */
let _loadCb = null;
let _loadTicker = null;
let _loadStart = 0;
let _loadValue = 0;       // 当前上报的 ratio（0~1）
let _tileN = 0;           // 收到的瓦片/data 事件数（用于 label 与加速）
const LOAD_RAMP_MS = 1800;   // 0→0.85 的爬升时长

/** 注册加载进度回调（幂等，只保留一个监听者 = 页面层）。 */
export function onLoadProgress(cb) {
  _loadCb = (typeof cb === 'function') ? cb : null;
  if (_loadCb && !_loadTicker) {
    _loadStart = Date.now();
    _loadValue = 0;
    _tileN = 0;
    _loadTicker = setInterval(_tickLoad, 90);
    _tickLoad();   // 立即报一次初始态
  }
}

function _emitLoad(label) {
  if (!_loadCb) return;
  try { _loadCb({ ratio: Math.max(0, Math.min(1, _loadValue)), label: label || '' }); }
  catch (e) { console.error('[engine] 进度回调异常', e); }
}

function _tickLoad() {
  if (!_loadTicker) return;
  const t = Math.min(1, (Date.now() - _loadStart) / LOAD_RAMP_MS);
  const eased = 1 - Math.pow(1 - t, 2);        // 缓出：先快后慢
  const ceiling = 0.85;
  if (_loadValue < eased * ceiling) _loadValue = eased * ceiling;
  _emitLoad(_tileN ? ('已加载 ' + _tileN + ' 项资源') : '正在加载地图资源');
}

function _stopLoadTicker() {
  if (_loadTicker) { clearInterval(_loadTicker); _loadTicker = null; }
}

function _onLoadEvent(e) {
  /* 真实资源/瓦片到位：计数 + 小幅加速（每事件 +0.04，封顶 0.85）。 */
  if (e && (e.tile || e.dataType === 'source')) _tileN++;
  if (_loadTicker) _loadValue = Math.min(0.85, _loadValue + 0.04);
}

/** 强制收口到完成（idle / 数据齐备时调）。 */
function _reportLoad(force) {
  if (!_loadCb) return;
  if (force) {
    _stopLoadTicker();
    _loadValue = 1;
    _emitLoad('加载完成');
  }
}
const _camCbs = new Set();    // 相机变化订阅者

/* ── 旋转与缩放上下限（261007-179） ────────────────────────────────── */

/**
 * ★ 关掉一切旋转 —— 这是 OPT_DEF 之外的**第二道闸**。
 *
 * 为什么还需要第二道：`dragRotate: false` 只关「拖拽旋转」，而**触屏的双指旋转**
 * 归 `touchZoomRotate` 管 —— 实测手机上仍能把地图转起来（用户 261007 反馈）。
 * 所以在**处理器层**再关一次。双指缩放（pinch zoom）**保留**。
 * ⚠ 三处都加 typeof 守卫：换引擎版本时 API 若改名，不至于整页白屏。
 */
function disableRotation() {
  if (!_map) return;
  try {
    if (_map.dragRotate && typeof _map.dragRotate.disable === 'function') _map.dragRotate.disable();
    if (_map.touchZoomRotate && typeof _map.touchZoomRotate.disableRotation === 'function') {
      _map.touchZoomRotate.disableRotation();
    }
    if (_map.keyboard && typeof _map.keyboard.disableRotation === 'function') _map.keyboard.disableRotation();
  } catch (e) { console.error('[engine] 关闭旋转失败', e); }
}

/**
 * 把引擎的缩放上下限顶到「世界视野 ~ 最细」区间。
 *
 * ★ 为什么必须在这里设（261007-179）：三档底图各自有 `minzoom`（= 世界视野那一档的 zoom，
 *   见 sources.js），但**引擎本身没设 minZoom**（默认 0）→ 用户能一直往外缩，
 *   缩到三档全部低于自己的 minzoom 时，屏幕上只剩 `mp-sea` 的背景色 ——
 *   表现就是「缩小到一定程度，全球整个没了」，而且**不报任何错**。
 *   点位层没有 minzoom，所以那个现象里点还在、底图没了（与"数据丢了"要区分开）。
 * ⚠ 换算依赖容器宽度（zoom ↔ 可见跨度），所以 resize 后必须重算。
 */
function applyZoomLimits() {
  if (!_map) return;
  const el = _map.getContainer();
  const w = (el && el.clientWidth) || 390;
  /* ★ 261116 任务#5：上限还要看**高度** —— 世界像素高必须 ≥ 容器高，否则上下露底色带。
       `spanMax(w,h)` 两约束取小（见 camera.js）。高度取不到时它内部退回旧常量。 */
  const h = (el && el.clientHeight) || 0;
  try {
    _map.setMinZoom(Math.max(0, zoomForSpan(spanMax(w, h), w)));   // ⚠ 负 minzoom 会被 MapLibre 拒收整个 style
    _map.setMaxZoom(zoomForSpan(SPAN_MIN, w));
  } catch (e) { console.error('[engine] 设置缩放上下限失败', e); }
}

function _emitCam() {
  const c = getCamera();
  _camCbs.forEach((f) => { try { f(c); } catch (e) { console.error('[engine] 相机回调异常', e); } });
}

/**
 * 创建引擎。**幂等**：重复调用返回同一个实例。
 * @param {{container:string|HTMLElement, style:object, center:number[], zoom:number,
 *          preserveDrawingBuffer?:boolean}} opt
 * @returns {{ok:boolean, error?:string}} 失败不要抛（页面应能降级显示提示）
 */
export function create(opt) {
  if (_map) return { ok: true };
  const opts = Object.assign({}, OPT_DEF, opt && opt.preserveDrawingBuffer
    ? { preserveDrawingBuffer: true } : {});
  try {
    _map = new MapCtor(Object.assign({}, opts, {
      container: opt.container,
      style: opt.style,
      center: opt.center,
      zoom: opt.zoom,
    }));
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
  /* 建完立刻关旋转 + 定缩放上下限（见上面两个函数的注释）。 */
  disableRotation();
  applyZoomLimits();
  /* 261117 阶段1：删掉经度钳制（clampLng）。vector 瓦片天然无限横铺，相机可越过 ±180°。
     move 只负责转发相机变化；_emitCam 里读的是真实中心（可能是 >180 的经度）。 */
  _map.on('move', _emitCam);
  _map.on('zoom', _emitCam);
  /* 261119：进度事件。data/sourcedata 覆盖资源与瓦片下载，idle 表示全部就绪。
     error 不在这里处理 —— index.js 的 onceLoaded().catch 统一走失败态，避免两处打架。 */
  _map.on('data', _onLoadEvent);
  _map.on('sourcedata', _onLoadEvent);
  _map.on('idle', () => _reportLoad(true));
  return { ok: true };
}

/** 等 style 首次加载完成。 */
export function onceLoaded() {
  if (!_map) return Promise.reject(new Error('engine 未创建'));
  if (_map.loaded()) return Promise.resolve();
  return new Promise((res, rej) => {
    _map.once('load', res);
    _map.once('error', (e) => rej(new Error(String((e && e.error) || e))));
  });
}

/** 读相机（**唯一口径**：center 为 [lng,lat]，zoom 为引擎原生值）。 */
export function getCamera() {
  if (!_map) return null;
  const c = _map.getCenter();
  return { center: [c.lng, c.lat], zoom: _map.getZoom() };
}

/** 四边零 padding —— 用来**显式复位** transform 上的 padding。
 *  ⚠ 为什么必须有它：MapLibre 的 padding 是**粘在 transform 上的状态**（参与投影矩阵，
 *    见 EdgeInsets.getCenter = ((left+w-right)/2, (top+h-bottom)/2)）。一次
 *    「给右侧栏让位」的 padding 不会被下一次不带 padding 的 jumpTo 清掉 ——
 *    结果就是复位/切视野之后地图**永久偏左**，而现象只是"看着有点歪"，极难倒推。 */
const ZERO_PAD = { top: 0, bottom: 0, left: 0, right: 0 };

/**
 * 把数字 / 部分四边对象规范成**完整四边**。
 *
 * ⚠⚠ 261120 实测踩到的真坑：只传 `{right: 300}` 时，上一轮 `focusPointAboveDrawer`
 *   在窄屏设过的 `bottom: 253` **会留在 transform 上** —— 宽屏点一个点，目标点被顶到
 *   画布上方 126px（正好是 253/2），看起来像"让位算错了"。
 *   ⇒ padding 一律补齐四边后再交给引擎，「清零」也才真的清得干净。
 * @param {number|object|null} p
 * @returns {{top:number,bottom:number,left:number,right:number}}
 */
function fullPad(p) {
  if (p == null) return ZERO_PAD;
  if (typeof p === 'number') return { top: p, bottom: p, left: p, right: p };
  return {
    top: Number(p.top) || 0, bottom: Number(p.bottom) || 0,
    left: Number(p.left) || 0, right: Number(p.right) || 0,
  };
}

/** 写相机。`animate` 为 false 时立即落位（探针要的是可复现，不受补间影响）。
 *
 *  ★ 261009 新增可选 `cam.padding`：把目标点挪到「**被浮层盖住的那一侧之外**的正中」。
 *    为什么要走引擎原生 padding 而不是自己算纬度偏移：padding 是 MapLibre 的相机概念，
 *    它会连墨卡托的纬度非线性一起算对；自己按"像素 ÷ 每度"手算偏移在跨纬度/跨缩放时
 *    必然算错，而且是同一件事的第二份实现（本项目最忌讳的那类）。
 *  ★ 261120：padding **每次都必须显式给**（缺省 ZERO_PAD），否则上一次的让位会留下来。
 *    @param {{center:number[], zoom:number, padding?:object|number}} cam */
export function setCamera(cam, animate) {
  if (!_map) return;
  const o = { center: cam.center, zoom: cam.zoom, padding: fullPad(cam.padding) };
  if (animate) _map.easeTo(o); else _map.jumpTo(o);
}

/**
 * **只平移、不改缩放**：把 center 摆到「让位后的可视区」中心（261120）。
 *
 * 用户口径：「点击某资产，在不要缩放的情况下在左侧居中，然后右边弹出来」。
 * 做法就是**不传 zoom** —— MapLibre 的 easeTo/jumpTo 缺省保持当前 zoom；
 * padding 参与投影矩阵，于是 center 落在扣掉面板后的区域中心，正好是「左侧居中」。
 * ⚠ 与 `focusPointAboveDrawer` 的区别：那个会同时把 zoom 设成 FOCUS_SPAN（放大），
 *   用在搜索/公司卡等"要有目的地看一处"的入口；点地图不要缩放，用这里。
 * @param {number[]} center [lng, lat]
 * @param {{padding?:object, animate?:boolean, duration?:number}} [opt]
 * @returns {boolean}
 */
export function panTo(center, opt) {
  if (!_map || !center) return false;
  const o = opt || {};
  const cam = { center: center, padding: fullPad(o.padding) };
  if (o.animate) {
    /* 460ms：侧栏自身过渡是 .22s，太短会显得"地图追不上面板"。 */
    cam.duration = (o.duration != null) ? o.duration : 460;
    _map.easeTo(cam);
  } else {
    _map.jumpTo(cam);
  }
  return true;
}

/** 相机是否正在动（拖动 / 惯性 / 补间）。**补间期间不要插队**，否则点一下就被拽走。 */
export function isMoving() {
  try { return !!(_map && _map.isMoving()); } catch (e) { return false; }
}

/** 订阅相机变化。返回退订函数（别让页面层自己管 removeListener）。 */
export function onCamera(fn) {
  _camCbs.add(fn);
  return () => _camCbs.delete(fn);
}

/**
 * 把视野套到给定的经纬度包围盒上（**搜索命中的多个点 / 深链聚焦**都用它）。
 * 比"自己算 center+zoom"稳：引擎会正确处理墨卡托的纬度非线性与容器内边距。
 * @param {number[]} b [w, s, e, n]
 * @param {{animate?:boolean, padding?:number, maxZoom?:number}} [opt]
 */
export function fitBounds(b, opt) {
  if (!_map || !b || b.length !== 4) return false;
  const o = Object.assign({
    /* ★ 261119 可视区居中：透传调用方的 padding（可为四边对象 {top,bottom,left,right}）。
       旧版这里写死 28 且**完全丢弃 opt.padding** —— focusBounds 传来的遮挡让位
       （右侧栏 / 底部抽屉）被吞掉，公司/点位按全容器居中，落到侧栏底下看不见。
       缺省仍为 28，保持其它调用方行为不变。 */
    padding: fullPad((opt && opt.padding != null) ? opt.padding : 28),
    duration: (opt && opt.animate) ? 400 : 0,
  }, (opt && opt.maxZoom > 0) ? { maxZoom: opt.maxZoom } : {});
  try {
    /* ★★ 261120：**装不下时必须有兜底**，否则「搜了没反应」。
       实测（探针 E 段）：搜「金矿」命中 44 个点、经度跨 207°，`fitBounds` 直接
       `console.warn("Map cannot fit within canvas with the given bounds, padding, and/or offset.")`
       然后**什么都不做** —— 相机留在初始的 112,35，用户以为搜索坏了（而且这句话只进控制台）。
       根因是 261116 把最远一档收紧到物理天花板（minZoom 对应 span 166°），207° 装不进。
       正解：先 `cameraForBounds` 试算；返回 null 就退化成「最远一档 + bbox 中心」——
       让视野至少落到那一片，而不是假装没搜过。
       ⚠ 不能用 `catch` 抓 —— 它不是抛异常，是一句 warning 之后静默返回。 */
    const llb = [[b[0], b[1]], [b[2], b[3]]];
    const cam = _map.cameraForBounds(llb, o);
    if (!cam) {
      const mid = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
      _map.jumpTo({ center: mid, zoom: _map.getMinZoom() });
      return true;
    }
    _map.fitBounds(llb, o);
    return true;
  } catch (e) { console.error('[engine] fitBounds 失败', e); return false; }
}

/** 经纬度 → 屏幕像素。 */
export function project(lngLat) {
  if (!_map) return null;
  const p = _map.project(lngLat);
  return [p.x, p.y];
}

/** 屏幕像素 → 经纬度。 */
export function unproject(px) {
  if (!_map) return null;
  const ll = _map.unproject(px);
  return [ll.lng, ll.lat];
}

/**
 * 拾取：返回给定屏幕坐标下、指定图层 id 列表里的要素（**O(1) 走 GPU 拾取**）。
 *
 * @param {number[]|{x:number,y:number}} px 相对容器的像素坐标
 *
 * ⚠⚠ **必须转成数组再传**。MapLibre v6 的实现在这里有个静默陷阱（已核过 vendored 源码）：
 *     ```js
 *     let r = e instanceof Point || Array.isArray(e),
 *         i = r ? e : [[0,0],[w,h]];        // ← 不是 Point / 数组 → 几何被丢成"整个视口"
 *     if (t ||= (r ? {} : e) || {}, …)      // ← 而且它还会被当成 options 用掉
 *     ```
 *   传一个 `{x, y}` 普通对象 → `r === false` → **不报错、不返回空，而是把整个视口的所有要素
 *   都返回给你**。这会伪装成"鼠标在哪儿都命中"（实测：同一层在左上角、右下角、不给几何
 *   三种调用都返回 697，数字一样）。讽刺的是内层的 `Point.convert` **本来是认 `{x,y}` 的**，
 *   只是外面的 `r` 那一道判断根本不让它进去。
 *   本函数统一归一成 `[x, y]`，把这个坑关在引擎边界之内 —— 调用方（含探针）不必知道它。
 *   （261003-80 实测踩到：hover 永远清不掉、点空白也命中原点，症状像"状态机写错"。）
 */
export function pick(px, layerIds) {
  if (!_map) return [];
  const pt = Array.isArray(px) ? [px[0], px[1]] : [px.x, px.y];
  const r = _map.queryRenderedFeatures(pt, { layers: layerIds });
  return r.map((f) => {
    const g = f.geometry || {};
    const c = Array.isArray(g.coordinates) ? g.coordinates : null;
    return {
      layer: (f.layer && f.layer.id) || '',
      props: Object.assign({}, f.properties || {}),
      /* ★ 261009：**几何坐标也要给出去**。点位层的几何是 Point，坐标在 `geometry.coordinates`，
         而 `properties` 里**没有** lng/lat —— 早先只搬 props，于是页面层拿不到"这个点在哪"，
         只能再去数据源里查一遍（第二份真相源）。
         实测后果：`ix.onSelect` 想"把相机挪到刚点的那个点"时读到 `props.lng === undefined`
         → `Number.isFinite` 假 → **静默不聚焦**（点地图上的点因此永远不居中，261009 P0-1）。
         ⚠ 单独一个字段而不是塞进 `props`：`props` 是**数据源里的业务字段**，改它等于改数据合同。 */
      lngLat: c && Number.isFinite(c[0]) && Number.isFinite(c[1]) ? [c[0], c[1]] : null,
    };
        // 需要原始要素时由调用方按 props 去自己的数据里查（本模块不认识业务数据）
  });
}

/** 容器尺寸变化后必须调，否则画布与容器不一致。
 *  ⚠ 缩放上下限是按容器宽度换算的，宽度变了要跟着重算（否则旋屏后又能缩过头）。 */
export function resize() {
  if (!_map) return;
  _map.resize();
  applyZoomLimits();
}

/**
 * 某个 id 的点位**此刻是否真的画在屏幕上**（261009 P1-5 用）。
 *
 * ★ 为什么必须**问引擎**、而不是在页面层复算一遍 filter：filter 是 MapLibre 表达式，
 *   在 JS 里复算它就是同一件事的**第二份实现** —— 两处口径迟早打架，而且不报错
 *   （本项目的老毛病，见 `dup_contract` 登记的几条）。
 * ★ 为什么 `filter` 与 `layers` 同时给：两者是**叠加**关系（图层自己的 filter 仍然生效），
 *   所以这里问的就是「**在当前筛选 + 当前视野下**，这个点有没有被画出来」。
 * ⚠ 层还没建出来（懒加载）时 `queryRenderedFeatures` 会**抛**（"layer does not exist
 *   and cannot be queried"）→ 先过滤掉不存在的层；一个都不存在时返回 `null`
 *   （= 「判不了」，让调用方**别动**，而不是误判成"看不见"）。
 * @param {string[]} layerIds
 * @param {string} id
 * @returns {boolean|null} true 画着 / false 没画 / **null 判不了**
 */
/**
 * 该 id 是否仍在**图层 filter 允许的集合**里（**与它在不在屏幕上无关**）。
 *
 * ⚠⚠ 为什么**不**用 queryRenderedFeatures：那个只查**当前视口内**的要素 ——
 *   点被用户拖出屏幕（平移）就会被判成"不存在" → 改一下筛选就把选中取消掉（错杀）。
 *   这里要问的是"它还在不在允许的集合里"。
 * ⚠ 查**源**并显式带上图层当前的 filter：源里的要素不受 filter 约束，
 *   不带 filter 问的是"数据里有没有这个点"（永远为真 → 永远不取消选中）。
 * ⚠ setFilter 是**异步生效**的：调用方要等它落实（见 index.js 的 waitFilterSettled），
 *   否则会读到旧结果（"卡片还开着、还指着已被筛掉的点"——261117 实测偶发）。
 * @param {string|string[]} layerIds
 * @param {string} id
 * @returns {boolean|null} null = 判不了 → 调用方按"别动"处理
 */
export function isInFilteredSet(layerIds, id) {
  if (!_map || id == null) return null;
  const ids = (Array.isArray(layerIds) ? layerIds : [layerIds]).filter((l) => hasLayer(l));
  if (!ids.length) return null;
  const idF = ['==', ['get', 'id'], String(id)];
  try {
    const style = _map.getStyle() || {};
    for (const lid of ids) {
      const ly = (style.layers || []).filter((l) => l.id === lid)[0];
      if (!ly || !ly.source) continue;
      const srcId = typeof ly.source === 'string' ? ly.source : ly.source.id;
      /* ★ 261117 阶段1：vector source 的 querySourceFeatures **必须带 sourceLayer**，
         否则返回空/抛错 → 判成"数据不在" → 选中点被筛掉后清不掉（S5 卡死）。 */
      const sourceLayer = ly['source-layer'];
      if (!_map.getSource(srcId)) continue;
      /* 源还没加载 → 判不了（返回 null = 别动）。宁可不清，也不误杀。 */
      if (typeof _map.isSourceLoaded === 'function' && !_map.isSourceLoaded(srcId)) return null;
      /* ★ 两步问，顺序不能反：
       *   ① 只按 id 查（**不带图层 filter**）→ 找得到 = 这个点的数据**在已加载的瓦片里**；
       *   ② 再带上**图层当前的 filter** 查 → 空 = 确实被 filter 挡住了（真被筛掉）。
       * ⚠ 为什么不能一步到位（实测踩过）：GeoJSON 源是**按瓦片**加载的，
       *   点被拖出屏幕后它的瓦片会卸载 → `querySourceFeatures` 一条都查不到 ——
       *   那是"数据没加载"，不是"被筛掉"。一步到位会把"点不在屏上"误判成"点被筛掉"
       *   → 改一下筛选就把（其实还在的）选中取消掉（错杀）。
       * ⚠ filter 必须显式带上：源里的要素不受 filter 约束，
       *   不带 filter 问的是"数据里有没有这个点"（永远为真 → 永远不取消选中）。 */
      const qOpt = { filter: idF };
      if (sourceLayer) qOpt.sourceLayer = sourceLayer;
      const raw = _map.querySourceFeatures(srcId, qOpt);
      if (!raw || !raw.length) continue;        // 数据不在已加载瓦片里 → 判不了
      const f = _map.getFilter(lid);
      const expr = f ? ['all', f, idF] : idF;
      const feats = _map.querySourceFeatures(srcId, Object.assign({}, qOpt, { filter: expr }));
      return !!(feats && feats.length);
    }
    return null;                                // 一路都没判出来 → 判不了（别动）
  } catch (e) { return null; }
}

/* ── 下面三个是「改图层」的**窄接口** ──────────────────────────────
   存在的理由：图层怎么改是**引擎概念**（paint 属性名 / filter 表达式 / 要素状态），
   页面层与 points.js 都不该懂。同时刻意**不**暴露 `setStyle`
   —— 那一个一旦能用，解耦就退化成"约定"，会有人绕过 layers.js 自己重建整张图。 */

/** 图层是否存在。**懒加载与热切换都要先问这一句**（对不存在的层改 paint 会报错刷屏）。 */
/**
 * 悬停到可点要素上时，把画布容器的 cursor 切成 pointer。
 *
 * ⚠⚠ 为什么必须用这个类、而**不能**直接 `style.cursor = 'pointer'`：
 *   MapLibre 的 CSS 给画布容器写了 `cursor: grab`
 *   （`.maplibregl-canvas-container.maplibregl-interactive`），
 *   在 #map（容器）上设 cursor 会被**子元素的规则盖掉** →
 *   「指针」从来没有亮过（实测：鼠标悬到点上，光标还是抓手）。
 *   `maplibregl-track-pointer` 是 MapLibre 自己留的钩子（它内置的 TrackPointer 处理器就用它）。
 * @param {boolean} on
 */
export function setTrackPointer(on) {
  if (!_map) return;
  try {
    const cc = _map.getCanvasContainer();
    if (cc) cc.classList.toggle('maplibregl-track-pointer', !!on);
  } catch (e) { /* 老版本没有这个 API：指针不亮而已，不该因此崩 */ }
}

export function hasLayer(layerId) {
  try { return !!(_map && _map.getLayer(layerId)); } catch (e) { return false; }
}

/* 261117 阶段1：懒加载退役后，addSources / addLayers / hasSource / setLayerZoomRange
   这一组「运行时动态增删 source/layer」的窄接口失去全部调用方，已删除。
   现在 source/layer 在 boot 时一次建齐，之后只改 paint / filter / feature-state。 */

/**
 * 等某个数据源加载完（懒加载的那档必须等它，否则"补了层但没数据"= 空白且不报错）。
 * @param {string} id
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>} 超时返回 false（**不 reject** —— 调用方只需知道成没成）
 */
export function whenSourceLoaded(id, timeoutMs) {
  if (!_map) return Promise.resolve(false);
  if (_map.isSourceLoaded(id)) return Promise.resolve(true);
  /* ★ 261119：`||` 会把调用方显式传的 0 当缺省（等 20s 而非立即判定）；
     用 != null 只把 undefined/null 当缺省，0 是合法值。 */
  const ms = (timeoutMs != null) ? timeoutMs : 20000;
  return new Promise((res) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; _map.off('sourcedata', h); res(v); } };
    const h = (e) => {
      if (e && e.sourceId === id) {
        try { if (_map.isSourceLoaded(id)) fin(true); }
        catch (err) { /* ★ 261119：不再静默等到超时 —— 记日志并提前失败，避免误判"数据没来" */
          console.error('[engine] isSourceLoaded 查询异常', err); fin(false); }
      }
    };
    _map.on('sourcedata', h);
    setTimeout(() => fin(false), ms);
  });
}

/** 改一个 paint 属性。`value` 传表达式或常量都行（引擎原生支持）。 */
export function setPaint(layerId, prop, value) {
  if (!_map) return false;
  try { _map.setPaintProperty(layerId, prop, value); return true; }
  catch (e) { console.error('[engine] setPaint 失败', layerId, prop, e); return false; }
}

/** 批量改 paint（主题热切换即"逐层逐属性"地改，**绝不 setStyle**）。
 *  ⚠ 跳过**不存在**的层：`layers.themePatch()` 是按"三档全在"生成的，
 *    而懒加载那一档可能还没建 —— 不跳过就会报一堆 "layer does not exist"。 */
export function setPaintPatch(patch) {
  let n = 0;
  Object.keys(patch || {}).forEach((id) => {
    if (!hasLayer(id)) return;
    const props = patch[id] || {};
    Object.keys(props).forEach((p) => { if (setPaint(id, p, props[p])) n++; });
  });
  return n;
}

/** 按表达式筛选要素。`null` = 不过滤（引擎的快路径）。 */
export function setFilter(layerId, expr) {
  if (!_map) return false;
  try { _map.setFilter(layerId, expr || null); return true; }
  catch (e) { console.error('[engine] setFilter 失败', layerId, e); return false; }
}

/**
 * 逐要素状态（hover / 选中高亮用）。要素必须有 id（见 points.js 的 promoteId）。
 * ★ 261117 阶段1：换成 vector source 后，MapLibre 6.11 **强制要求** `sourceLayer` ——
 *   不带它则 `setFeatureState` 报错并 return（"The sourceLayer parameter must be provided
 *   for vector source types."），高亮**静默失效**（B1 实测 5 条高亮断言全红）。
 * @param {string} sourceId
 * @param {string|number} id promoteId 提升出来的业务 id（如 'h696'）
 * @param {object} state
 * @param {string} [sourceLayer] vector source 的 source-layer（点位见 points.PT_SOURCE_LAYER）
 */
export function setFeatureState(sourceId, id, state, sourceLayer) {
  if (!_map) return false;
  const ref = { source: sourceId, id };
  if (sourceLayer) ref.sourceLayer = sourceLayer;
  try { _map.setFeatureState(ref, state); return true; }
  catch (e) { console.error('[engine] setFeatureState 失败', sourceId, id, e); return false; }
}

/** 销毁（单页内一般不用；留给重复挂载 / 热重载场景）。 */
export function destroy() {
  if (!_map) return;
  _camCbs.clear();
  _stopLoadTicker();
  _loadCb = null;
  _map.remove();
  _map = null;
}

/**
 * 引擎自述当前状态（**排障用，不是业务接口**）。
 * 放这里而不是页面层：`isStyleLoaded` / `isSourceLoaded` 是引擎的内部概念，
 * 页面层不该知道 —— 261003-79 一开始把这段写在 index.js 的调试面里，
 * 结果解耦断言（「index.js 不许碰引擎实例」）直接红了。**修法是把知识挪回它该在的层，不是放宽断言。**
 */
export function diagnose() {
  if (!_map) return { map: null };
  const st = (typeof _map.getStyle === 'function' && _map.getStyle()) || {};
  const sources = {};
  Object.keys(st.sources || {}).forEach((k) => {
    try { sources[k] = _map.isSourceLoaded(k); } catch (e) { sources[k] = 'ERR:' + e.message; }
  });
  return { styleLoaded: _map.isStyleLoaded(), loaded: _map.loaded(), sources };
}

/** 仅给探针用：拿引擎原生实例做深度检查（生产代码不许调）。 */
export function __rawForTest() { return _map; }
