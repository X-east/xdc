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
