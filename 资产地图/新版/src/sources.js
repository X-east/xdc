/* sources.js —— 数据源声明（**只描述"数据在哪、什么档位用"，不含渲染方式**）
   ------------------------------------------------------------------
   负责：把每个数据层的「位置 / 类型 / 分档区间」声明成数据。
   不负责：图层顺序与样式（→ layers.js）、配色（→ theme.js）。

   ★★ 261117 阶段1：底图数据源从「三档 GeoJSON 懒加载」改为**单一 MVT vector source**。
      瓦片由 build_tiles.mjs 预切（z0-5），一个 source 就装下 countries / borders / prov
      三个 source-layer，MapLibre 按当前 zoom 自动请求对应 z 的瓦片、自动 overzoom。
      于是 EAGER/LAZY 懒加载、whenSourceLoaded、setLayerZoomRange 这一整条手写闭环退役。
      GeoJSON 文件**仍保留在包里**：搜索缓存与探针期望值读它们（见 index.js / _map2_check），
      不是第二份渲染真相源 —— 渲染只读瓦片（一数一源）。

   ★ 分档阈值：与瓦片 z 段严格对齐（B0/Q4 方案A）——
     瓦片 110m=z0-2 / 50m=z3 / 10m=z4-5；图层 minzoom/maxzoom 用**整数** 0-3 / 3-4 / 4+，
     这样「图层可见区间」与「请求的瓦片 z」一一对应，不再有 span 换算带来的半档错配。
     三档 LOD 的语义（粗/中/细）保留，只把阈值口径从「可见跨度」换成「引擎 zoom」。
*/

import { tileUrlTemplate } from './base.js';

/** 瓦片 URL 模板（唯一口径，含字面量 {z}/{x}/{y}，见 base.js 的说明）。 */
export const TILE_TEMPLATE = tileUrlTemplate('{z}/{x}/{y}.pbf');

/** 底图 vector source 的 id（单一 source 装 countries/borders/prov）。 */
export const BASE_SRC = 'mp-base';

/**
 * 三档的**整数 zoom 区间**（与瓦片 z 段对齐，见文件头）。
 * 保留 id / min / max 三元组，接口与旧 tiers() 一致（themePatch / 探针 / check_style_zooms 都按它取）。
 * @param {number} [widthPx] 兼容旧签名：新口径与宽度无关，忽略
 * @returns {Array<{id:string,min:number,max:number}>}
 */
export function tiers(widthPx) {
  return [
    { id: '110m', min: 0, max: 3 },   // z0-2 瓦片（z3 起切到 50m）
    { id: '50m', min: 3, max: 4 },    // z3 瓦片
    { id: '10m', min: 4, max: 24 },   // z4-5 瓦片，z>5 由引擎 overzoom（source.maxzoom=5）
  ];
}

/** 兼容旧接口：底图源（现在只有一个，全部档共用）。 */
export function buildSources(widthPx, ids) {
  return { [BASE_SRC]: vectorBase() };
}

/** 省界图层起点 zoom：**提到 4**（Q6 方案B）：瓦片里 prov 只在 z4-5，
 *  旧口径 zoomForSpan(45)≈2.6 会让 2.6~4 段图层可见却无数据。 */
export function provSpanLimit() { return 4; }

/** 底图 vector source 声明。 */
function vectorBase() {
  return {
    type: 'vector',
    tiles: [TILE_TEMPLATE],
    maxzoom: 5,      // 与瓦片 maxZoom 一致；z>5 由引擎 overzoom，不请求 z6
    minzoom: 0,
  };
}

/* 历史注记（保留踩坑教训，别删）：
   ⚠ GeoJSON source 不支持 `wrap`（261004-92 实测：传了报 unknown property → 白屏）。
     那是矢量瓦片 source 的属性。本阶段已换 vector source，瓦片按 Web Mercator x 取模
     天然无限横向铺（B0 实测 jump ±360° 仍有 61~175 个底图要素），无需数据侧铺副本，
     也不需要 renderWorldCopies / clampLng（已删）。
   ⚠ 261003-79：往 style 对象里塞自定义键（哪怕只为写注释）会被 style 校验拒收 →
     页面白屏。要写说明就写在注释里。 */
