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
/* spanForZoom：算当前视野的经度跨度（度）。用于经度钳制（见下方 move 监听里的注释）。
   ⚠ engine.js 此前**不导入任何业务模块**（它是最底层，只认 MapLibre）——
     这次为了钳制引入了 camera.js，是一处**有意的依赖方向新增**：
     camera.js 本身是**纯函数**（不 import engine.js，已核过），所以不会成环。 */
import { spanForZoom, zoomForSpan, spanMax, SPAN_MIN } from './camera.js';

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
  /* 横向平铺：**在数据侧做**（261004-92 定案）。
     ⚠⚠ 不要试图用 Map 选项开关做这件事，我试了三条都错：
       ① `renderWorldCopies: false` + 「我们自己用三档整世界」——**注释里的意图，从没实现**
          （实测拖到经度 162.9，底图要素 145 → 0）；
       ② 改成 `renderWorldCopies: true` —— **MapLibre 6.11 根本没有这个 Map 选项**
          （`new Map({renderWorldCopies:true})` 直接抛，引擎起不来）；
       ③ 给 GeoJSON source 加 `wrap: true` —— **GeoJSON source 不支持该属性**
          （那是矢量瓦片 source 的），报 `sources.base_110m: unknown property "wrap"`，
          同样引擎起不来、页面白屏（stage 卡 engine-created、控制台干净）。
     正解：把底图/点位的坐标在**数据侧**铺成 ±360·k 的副本（见 sources.js / points.js
     的 buildSources / buildPointSources），幂等、不依赖任何引擎内部开关。
     老引擎的 `tileLng(p, c)`（dist/app.js）就是这个思路，本项目沿用。 */
  attributionControl: false,  // 离线自用，不需要版权控件（合规标注另有位置）
  fadeDuration: 0,            // 关掉淡入，帧预算可预测（探针要量帧间隔）
  antialias: true,
  preserveDrawingBuffer: false, // 只在探针需要 readback 时开（开了会略微变慢）
};

let _map = null;              // 单例：一个页面一张地图
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
  /* ⚠ 经度钳制（261004-92）：GeoJSON source 不支持 wrap，Map 选项也没有
     renderWorldCopies（6.11 实测）→ 数据只覆盖 [-180,180]。
     相机一旦被拖过界，那一侧**取不到任何数据**（实测底图要素 145 → 0，整片空白，
     不报任何错）。所以在 move 事件里把经度**拉回来** ——
     留半个视野的余量，保证视口始终压在有数据的那一侧、边缘不露白。
     ⚠ 只在「跨度 < 360」时钳：能看全整个世界时（span≥360）无所谓。*/
  _map.on('move', () => {
    const c = _map.getCenter();
    /*⚠ zoom 要用 **`_map.getZoom()`**，不能从 `getCenter()` 上取（261004-92）：
       MapLibre 6 的 getCenter() 只返回 {lng, lat}，**没有 zoom 字段** →
       c.zoom 是 undefined → spanForZoom 得 NaN → clampLng 的 `!(NaN > 0)` 守卫
       直接**原样返回**（钳制静默失效，探针看到 want===lng）。
       ⚠ 这个守卫的「静默跳过」性质值得记：任何以 `!(x > 0)` 形式写的守卫，
          在 x 为 NaN 时都会**默默放行**，而不是报错。 */
    const span = spanForZoom(_map.getZoom(), _map.getContainer().clientWidth || 390);
    const want = clampLng(c.lng, span);
    if (want !== c.lng) {
      /* 直接 jumpTo 而不是再emit：避免「钳→move→再钳」的循环。 */
      _map.jumpTo({ center: [want, c.lat] });
      return;                     // 这一次不转发，等 jumpTo 触发的 move 再发
    }
    _emitCam();
  });
  _map.on('zoom', _emitCam);
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

/** 写相机。`animate` 为 false 时立即落位（探针要的是可复现，不受补间影响）。
 *
 *  ★ 261009 新增可选 `cam.padding`：把目标点挪到「**被浮层盖住的那一侧之外**的正中」。
 *    为什么要走引擎原生 padding 而不是自己算纬度偏移：padding 是 MapLibre 的相机概念，
 *    它会连墨卡托的纬度非线性一起算对；自己按"像素 ÷ 每度"手算偏移在跨纬度/跨缩放时
 *    必然算错，而且是同一件事的第二份实现（本项目最忌讳的那类）。
 *    @param {{center:number[], zoom:number, padding?:object|number}} cam */
export function setCamera(cam, animate) {
  if (!_map) return;
  const o = { center: cam.center, zoom: cam.zoom };
  if (cam.padding) o.padding = cam.padding;
  if (animate) _map.easeTo(o); else _map.jumpTo(o);
}

/**
 * 把相机经度**钳在有数据的那一侧**（261004-92）。
 *
 * ★ 背景：MapLibre 的 GeoJSON source 不支持 `wrap`，Map 选项里也没有
 *   `renderWorldCopies`（6.11 实测，两者传了都直接抛 → 引擎起不来）。
 *   而底图/点位数据只覆盖经度 [-180, 180]（NaturalEarth 整世界）。
 *   ⇒ 相机经度一旦超过 ±180，那一侧**取不到任何数据** → 实测底图要素从 145 掉到 0，
 *   整片空白，而且**不报任何错**。
 *
 * ⚠ 为什么选「钳制」而不是「预生成 ±360 副本」：
 *   副本方案体积 ×3（光底图就 5.9 → 17.7MB），而收益只是「世界地图能无限横向平移」——
 *   对「按经纬找资产」这个用途，世界地图本来就是有限的一屏。
 *   若将来真要无限平移，正确做法是**生成副本文件**（而不是给 GeoJSON source 加
 *   不存在的属性）—— 见 sources.js 里 geojson() 的注释。
 *
 * @param {number} lng 原始经度
 * @param {number} span 视野跨度（度）—— 跨度大到能盖住 360 时直接不钳
 * @returns {number} 钳制后的经度
 */
export function clampLng(lng, span) {
  if (!(span > 0) || span >= 360) return lng;      // 能看全整个世界 → 无所谓
  /* 留半个视野的余量：中心最多到 ±(180 - span/2)，
     这样**视口始终压在有数据的那一侧**，边缘不会露白。
     公式：|lng| ≤ 180 - span/2 ⇒ 移出量 = |lng| - (180 - span/2)。*/
  const lim = Math.max(0, 180 - span / 2);
  if (lng > lim) return lim;
  if (lng < -lim) return -lim;
  return lng;
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
    padding: 28,
    duration: (opt && opt.animate) ? 400 : 0,
  }, (opt && opt.maxZoom > 0) ? { maxZoom: opt.maxZoom } : {});
  try {
    _map.fitBounds([[b[0], b[1]], [b[2], b[3]]], o);
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

/** 当前视口可见的经纬度范围 [w, s, e, n]。 */
export function bounds() {
  if (!_map) return null;
  const b = _map.getBounds();
  return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
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
      const raw = _map.querySourceFeatures(srcId, { filter: idF });
      if (!raw || !raw.length) continue;        // 数据不在已加载瓦片里 → 判不了
      const f = _map.getFilter(lid);
      const expr = f ? ['all', f, idF] : idF;
      const feats = _map.querySourceFeatures(srcId, { filter: expr });
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

/** 数据源是否存在。 */
export function hasSource(sourceId) {
  try { return !!(_map && _map.getSource(sourceId)); } catch (e) { return false; }
}

/** 批量加数据源（已存在则跳过 —— 幂等，重复调用不会抛 "source already exists"）。 */
export function addSources(srcs) {
  if (!_map) return 0;
  let n = 0;
  Object.keys(srcs || {}).forEach((k) => {
    if (hasSource(k)) return;
    try { _map.addSource(k, srcs[k]); n++; }
    catch (e) { console.error('[engine] addSource 失败', k, e); }
  });
  return n;
}

/**
 * 批量加图层。
 * @param {object[]} list
 * @param {string} [beforeId] 插到这个图层**之前**（必须给：否则新层会跑到点位层上面，
 *        把点盖住 —— 而"点被底图盖住"是那种一眼看不出的错）
 */
export function addLayers(list, beforeId) {
  if (!_map) return 0;
  let n = 0;
  (list || []).forEach((l) => {
    if (!l || hasLayer(l.id)) return;
    try { _map.addLayer(l, beforeId); n++; }
    catch (e) { console.error('[engine] addLayer 失败', l.id, e); }
  });
  return n;
}

/** 改某层的 zoom 区间（懒加载到位后把兜底档的上限收回来，保证"同时只有一档可见"）。 */
export function setLayerZoomRange(layerId, minzoom, maxzoom) {
  if (!_map || !hasLayer(layerId)) return false;
  try { _map.setLayerZoomRange(layerId, minzoom, maxzoom); return true; }
  catch (e) { console.error('[engine] setLayerZoomRange 失败', layerId, e); return false; }
}

/**
 * 等某个数据源加载完（懒加载的那档必须等它，否则"补了层但没数据"= 空白且不报错）。
 * @param {string} id
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>} 超时返回 false（**不 reject** —— 调用方只需知道成没成）
 */
export function whenSourceLoaded(id, timeoutMs) {
  if (!_map) return Promise.resolve(false);
  if (_map.isSourceLoaded(id)) return Promise.resolve(true);
  const ms = timeoutMs || 20000;
  return new Promise((res) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; _map.off('sourcedata', h); res(v); } };
    const h = (e) => { if (e && e.sourceId === id) { try { if (_map.isSourceLoaded(id)) fin(true); } catch (err) {} } };
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

/** 逐要素状态（hover / 选中高亮用）。要素必须有 id（见 points.js 的 promoteId）。 */
export function setFeatureState(sourceId, id, state) {
  if (!_map) return false;
  try { _map.setFeatureState({ source: sourceId, id }, state); return true; }
  catch (e) { console.error('[engine] setFeatureState 失败', sourceId, id, e); return false; }
}

/** 销毁（单页内一般不用；留给重复挂载 / 热重载场景）。 */
export function destroy() {
  if (!_map) return;
  _camCbs.clear();
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
