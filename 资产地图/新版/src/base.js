/* base.js —— 数据基址（**唯一的路径口径**）
   ------------------------------------------------------------------
   负责：算出 `dist/` 相对**本模块**的位置，供 points.js / sources.js 拼数据路径。
   不负责：业务、渲染、交互。

   ★ 为什么必须按模块而不是按页面定位（261004-89 实测踩到）
     原来三处都写死 `'dist/xxx'`（相对**当前页面**）。地图页恰好在包根，
     所以 `'dist/'` 正好命中；但个股页在 `个股研究/` 下，同一个 `'dist/'`
     会指向 `个股研究/dist/` —— 不存在，fetch 404，底图空白且**不报错**。
     而个股页是要把这套引擎整份装进去的（个体页 137 张换新引擎），
     所以路径必须一开始就与「谁在加载我」无关。

     正解：`import.meta.url` 给的是**本模块文件**的 URL，
     从它 `../` 一级就是 `新版/`，再 `dist/` 即命中。页面在哪都无所谓。 */
/* ⚠ `../` 这一级别省（261004-89 踩过）：`new URL('.', import.meta.url)` 给的是
     **本模块所在目录**（…/新版/src/），而 dist/ 是它的**兄弟**，故必须 `../dist/`。
     少写 ../ 得到 …/新版/src/dist/… → fetch 404 → boot 卡在 await onceLoaded()
     → 页面白着等，**控制台一条错都没有**（探针实测卡在 stage=engine-created）。
     开发时（资产地图/src/ → 资产地图/dist/）与装包后（新版/src/ → 新版/dist/）
     是同一个相对关系，所以这一处对两种场景都对。 */
const HERE = new URL('..', import.meta.url);   // → 新版/（或 资产地图/）

/** `dist/` 的绝对 URL（带尾斜杠）。可直接与相对路径拼接。 */
export const DIST = new URL('dist/', HERE).href;

/** dist 下的文件 URL。`url('world_lod/x.geojson')` */
export function distUrl(rel) {
  return new URL(rel, DIST).href;
}

/** `tiles/` 的绝对 URL（带尾斜杠）—— 预切 MVT 瓦片根目录。
 *  ★ 瓦片在 `tiles/`（与 dist/ 平级），不在 dist/ 里：build_tiles.mjs 阶段0 就定在这里，
 *    build_map2.py 装配时整目录复制到 `新版/tiles/`。 */
export const TILES = new URL('tiles/', HERE).href;

/**
 * 矢量瓦片的 URL **模板**（给 MapLibre vector source 的 `tiles` 用）。
 *
 * ★★ 不能直接用 `distUrl()` / `new URL(...).href`（261117 B0 实测踩到）：
 *    WHATWG URL 会把 `{z}/{x}/{y}` percent-encode 成 `%7Bz%7D/%7Bx%7D/%7By%7D`，
 *    MapLibre 只替换**字面量** `{z}` → 替换失败 → source 显示 loaded、无任何 error，
 *    但 queryRenderedFeatures / querySourceFeatures **全 0**（静默白图，极难从现象倒推）。
 *   实测证据：encodeURI('…/tiles/{z}/{x}/{y}.pbf') 同样编码花括号。
 *   正解：拼出绝对 URL 后把 `%7B`→`{`、`%7D`→`}` 解码回来，保住占位符字面量。
 * @param {string} rel 相对 tiles/ 的路径，默认 `{z}/{x}/{y}.pbf`
 * @returns {string} 绝对 URL 模板（含字面量占位符）
 */
export function tileUrlTemplate(rel) {
  return new URL(rel || '{z}/{x}/{y}.pbf', TILES).href
    .replace(/%7B/gi, '{').replace(/%7D/gi, '}');
}
