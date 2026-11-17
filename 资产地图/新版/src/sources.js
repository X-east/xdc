/* sources.js —— 数据源声明（**只描述"数据在哪、什么档位用"，不含渲染方式**）
   ------------------------------------------------------------------
   负责：把每个数据层的「位置 / 类型 / 分档区间 / 属性白名单」声明成数据。
   不负责：图层顺序与样式（→ layers.js）、配色（→ theme.js）。

   ★ 为什么要单独一层：数据源与渲染是两件会各自变化的事 ——
     换数据（如将来上预切瓦片：`geojson` → `vector` + PMTiles URL）**只改本文件**，
     图层与样式一行不动。所以这里刻意把 URL 与「档位区间」写成可替换的声明。

   ★ 分档：三档 LOD 用**可见跨度**判定（口径在 camera.js），启动时按容器宽度换算成
     engine zoom 再写进各层的 minzoom/maxzoom。这样换设备宽度不用重标定。

   ★ `tolerance: 0`（**必须显式给**）：MapLibre 的 GeoJSON 源默认 `tolerance 0.375`
     会做**逐要素 Douglas-Peucker 简化**（官方 style spec 原文如此）。我们的三档数据
     本身就是 Natural Earth 的三级简化产物，**再简化就是第二次独立简化** ——
     而逐要素独立简化会破坏共享边界的一致性（261003-63 的结论）。
     设 0 = 让引擎原样上传我们预简化的几何。 */

import { distUrl } from './base.js';
import { LOD_SPAN, SPAN_CEIL, zoomForSpan } from './camera.js';

/** 数据根目录（相对页面）。三档 LOD 由 `资产地图/build_world_lod.py` 生成。 */
/* ⚠ 同points.js：路径相对模块，不相对页面（个股页嵌入要用，见 base.js）。 */
const LOD_DIR = distUrl('world_lod/');

/** 单档描述：哪档、哪几个文件、属性里哪些字段要带进渲染。 */
const LEVELS = [
  { id: '110m', countries: LOD_DIR + '110m_countries.geojson', borders: LOD_DIR + '110m_borders.geojson' },
  { id: '50m', countries: LOD_DIR + '50m_countries.geojson', borders: LOD_DIR + '50m_borders.geojson' },
  { id: '10m', countries: LOD_DIR + '10m_countries.geojson', borders: LOD_DIR + '10m_borders.geojson' },
];

/** 省界（独立线要素，`资产地图/build_prov_lines.py` 生成）。只有中国，故只在中近景出现。 */
const PROV_LINES = LOD_DIR + 'province_lines.geojson';

/* -- 分档加载策略：**启动只挂最粗那档，其余按可见跨度预加载** --
   ★ 261116 任务#4 实测（443×564 CSS / dpr2.5）：
       · 首屏视野 span=118.4°（INIT_SCOPE='world'），而 LOD_SPAN.mid=45 ——
         **50m 档在首屏根本不可见**，却和 110m 一起被 eager 加载（2.16MB vs 312KB）。
       · 启动到 style-loaded 4.5s、主线程长任务合计 1.2~2.2s（最大单块 501ms）。
     把 50m 也改成懒加载后，首屏只处理 312KB —— 这是本次改动的**全部目的**。
   ★ 预加载阈值 = 该档可见上界 + 提前量（跨度越小越细，故"阈值大于上界"）：
       · 50m 可见上界 45°（LOD_SPAN.mid）→ 55° 开始下，留 10° 提前量；
       · 10m 可见上界 18°（LOD_SPAN.fine）→ 30° 开始下，留 12° 提前量。
   ⚠ 这 11MB 是**在 worker 里 fetch 的**，所以不出现在主线程的 resource timing 里 ——
     别拿"主线程只记到 1.7MB"当"启动很轻"的证据（261003-81 差点被它骗）。 */
export const EAGER_TIERS = ['110m'];
/** 懒加载计划：按"可见跨度"从粗到细排队。`span` = 该档开始预加载的跨度上界。 */
export const LAZY_TIERS = [
  { id: '50m', span: 55 },
  { id: '10m', span: 30 },
];

/**
 * 每档的 engine zoom 区间（把"可见跨度"换算成 zoom，端点处**相接不留缝**）。
 * @param {number} widthPx 容器宽度
 * @returns {Array<{id:string, countries:string, borders:string, min:number, max:number}>}
 */
export function lodTiers(widthPx) {
  // 跨度越大 = 缩得越小。tier 顺序与 LEVELS 一致（110m 最粗 → 10m 最细）。
  const bounds = [Infinity, LOD_SPAN.mid, LOD_SPAN.fine, 0];   // 每档的下界（span 上界）
  return LEVELS.map((lv, i) => {
    const spanHi = bounds[i];            // 该档可见跨度的上界（越大越粗）
    const spanLo = bounds[i + 1];        // 下界
    // span 大 → zoom 小。minzoom 对应 span 上界，maxzoom 对应 span 下界。
    /* 最粗那档的下限用**物理天花板** SPAN_CEIL（不是容器相关的 spanMax）——
       地图下限 = spanMax(...) ≥ SPAN_CEIL 对应的 zoom，故图层永远不会被地图下限排除。
       ★ 261116 任务#5：SPAN_MAX（旧的 118.4° 产品上限）已随「上限按宽高比自适应」取消。 */
    /* ⚠ Math.max(0, …)：**负 minzoom 会让 MapLibre 拒收整个 style → 页面白屏**。
       实测 layers[2].minzoom: -0.31 is less than the minimum value 0（探针抓到的）。
       取 0 是安全的：图层 minzoom ≤ 地图 minZoom 就够"最远处仍可见"，
       而地图本身根本到不了 zoom<0。 */
    const min = spanHi === Infinity ? Math.max(0, zoomForSpan(SPAN_CEIL, widthPx)) : zoomForSpan(spanHi, widthPx);
    const max = spanLo === 0 ? 24 : zoomForSpan(spanLo, widthPx);
    return Object.assign({}, lv, { min, max });
  });
}

/**
 * 省界数据源（261116 任务#4 起**不再随启动加载**）。
 *
 * ★ 为什么：省界只在可见跨度 ≤45°（`provSpanLimit`）时才画出来，而首屏是 118.4° ——
 *   启动就下 152KB 纯属浪费（占改造后首屏体积的三分之一）。
 * ⚠ 它与 50m 档**同一批**加载（同一可见区间），所以由 index.js 的 50m 懒加载顺带挂上；
 *   单独拆一档只会多一套触发条件，收益是零。
 */
export function provSource() {
  return { prov_lines: geojson(PROV_LINES) };
}

/**
 * 组装 MapLibre style 需要的 `sources` 段（**只声明数据，不含图层**）。
 * @param {number} widthPx
 * @param {string[]} [ids] 只声明这几档；默认 = EAGER_TIERS（只有 110m）
 * @returns {object} sources 对象
 *   ⚠ 不含 `prov_lines`：它随 50m 档懒加载（见 provSource），别在这里加回来 ——
 *     加了就等于每次启动又多下 152KB，且与"首屏只要最粗档"的结论相矛盾。
 */
export function buildSources(widthPx, ids) {
  const out = {};
  lodTiers(widthPx)
    .filter((t) => (ids || EAGER_TIERS).indexOf(t.id) >= 0)
    .forEach((t) => {
      out['base_' + t.id] = geojson(t.countries);
      out['borders_' + t.id] = geojson(t.borders);
    });
  return out;
}

/** 三档各自的 id / 档位区间（**全部三档**，供对账与调试面用）。 */
export function tiers(widthPx) { return lodTiers(widthPx); }

/** 启动即挂的那两档（建 style 时用这个，不是 `tiers()`）。 */
export function eagerTiers(widthPx) {
  return lodTiers(widthPx).filter((t) => EAGER_TIERS.indexOf(t.id) >= 0);
}

/** 取单档的描述（懒加载时用它，别自己重算区间）。 */
export function tierById(widthPx, id) {
  return lodTiers(widthPx).filter((t) => t.id === id)[0] || null;
}

/** 单档的数据源声明（与 `buildSources` 走同一份 URL，只是范围不同）。 */
export function sourcesForTier(id) {
  const lv = LEVELS.filter((x) => x.id === id)[0];
  if (!lv) return {};
  const out = {};
  out['base_' + id] = geojson(lv.countries);
  out['borders_' + id] = geojson(lv.borders);
  return out;
}

/** 省界只在中国视野附近显示：跨度 ≤ 45°（≈ 粗档与中档交界）起显示。 */
export function provSpanLimit() { return LOD_SPAN.mid; }

/* ⚠ 只放 MapLibre 认识的键。261003-79 实测：往里塞一个自定义键（哪怕只为写注释），
   style 校验会拒收 → `load` 事件永不触发 → 页面看着"卡住"且 window.onerror 抓不到
   （错只在控制台）。要写说明就写在注释里，别写进 style 对象。 */
function geojson(url) {
  /* ⚠⚠ GeoJSON source **不支持 `wrap` 属性**（261004-92 实测）：
       传了会直接 `sources.base_110m: unknown property "wrap"` → **引擎起不来**，
       页面停在白屏（stage 卡在 engine-created，控制台干净）。
       那是**矢量瓦片 source** 的属性，GeoJSON 源没有。
     ⚠ Map 选项 `renderWorldCopies` 同样不存在于 MapLibre 6.11（传了直接抛）。
     ⇒ 平铺只能靠**数据侧**：要么预生成 ±360 副本文件（体积×3），
       要么在运行时把相机经度**归一化回 [-180,180]**（见 camera.js 的 clampLng）——
       后者零成本，代价是「世界地图不能横向无限平移」而是「拖到边界就停住」。
     ⚠ 这两条路的取舍见 clampLng 的注释，**别混着改**。 */
  return { type: 'geojson', data: url, tolerance: 0 };
}
