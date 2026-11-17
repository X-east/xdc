/* camera.js —— 相机口径与深链编解码（**纯逻辑，不碰 DOM / 不碰引擎**）
   ------------------------------------------------------------------
   负责：缩放与中心的口径定义、夹紧、`#L/#f/#cam` 的解析与序列化。
   不负责：真的去改相机（→ engine.js 的 setCamera）、也不负责触发渲染。

   ⚠ 为什么「纯逻辑」很重要：本文件是唯一能**单测**的模块（无 DOM 依赖）。
     凡是"算得出对错"的东西都往这里放，凡是"要看画面才知道"的留在外面。

   ★★ 缩放口径（换引擎后必须重定义，否则旧链接的含义会漂）
     · 旧页面：zoom 是自有语义值（引擎 zoom ÷ Z_SCALE），且**与容器宽度绑定**
       —— 因为它是靠 `boundingCoords` 把「一份世界铺满屏」标定出来的。
     · 新页面：改用**「可见经度跨度」（span，单位度）**做唯一口径，与容器宽度无关，
       zoom 只在进出引擎时由下面两个函数换算（Web Mercator 世界宽 = 512·2^z 像素）：
            可见跨度 = 容器宽 / (512·2^z) · 360   ⇒   z = log2(W·360 / (512·span))
       实测锚点：390px 宽、span=118.4° ⇒ z=1.212（旧页面世界视野的跨度就是 118.4°，见 261002-59）
     好处：换设备宽度不用重标定；旧链接可按「它当时的跨度」无损换算过来。
     ⚠ 迁移时**必须重新序列化**旧链接里的 z（口径不同，直接搬会差一档）。 */

/** 世界宽（Web Mercator：赤道 360° = 512·2^z 像素时 512 为基准瓦片边长）。 */
const TILE_BASE = 512;

/** 两个视野定义 —— **用「可见经度跨度」而不是 zoom**（见文件头）。 */
export const SPAN_DEF = {
  world: 118.4,   // 旧页面世界视野的实测跨度（261002-59：390px 屏、zoom 3.8 → 118.42°）
  china: 62.5,    // 旧页面中国视野的实测跨度（zoom 7.2 → 62.5°）
};

/** 缩放上下限 —— 同样用跨度表达，与容器宽度无关。
 *  ⚠ 261116 任务#5：下限定的是**跨度**（可见经度范围），上限不再是常量 ——
 *    它由容器宽高比决定（见 `spanMax()`）。凡是要设/夹缩放的调用点，
 *    一律走 `spanMax()` / `clampZoom()`，不要直接引用常量。
 *
 *  最大缩放（最细）＝ 可见跨度 8°（≈ 省级尺度）。
 *  ⚠ **这是相对旧页面的有意放大**：旧页面上限是 ZOOM_MAX=14，对应可见跨度 32.1°
 *    —— 那是当年「一份世界铺满屏」标定的副作用，不是产品决定。三档 LOD 的意义就是
 *    「放大后边界变细」，若上限仍停在 32°，**10m 档永远触发不到**（实测换算见下），
 *    加了等于白加。故放到 8°。
 *    390px 容器下的引擎 zoom（换算锚点，供探针对账）：
 *      118.4° → z 1.212（世界）／45° → z 2.607 ／18° → z 3.929 ／8° → z 5.100（最细） */
export const SPAN_MIN = 8;

/** 跨度天花板（度）：数据只覆盖 [-180,180]，跨度接近 360 就会跨接缝露白。
 *  ⚠ 这是**物理天花板**，与容器无关 —— 分档的 minzoom 必须用它（见 sources.js），
 *    否则窄高容器的地图下限会比图层下限还高 → 缩到最远时底图整层不渲染（空白图）。
 *    容器相关的实际上限是 `spanMax()`（再被宽高比压一次）。 */
export const SPAN_CEIL = 340;

/** 三档 LOD 的切换阈值（**用可见跨度表达**，因为数据精度是"每度多少点"的问题，
 *  与容器宽度无关）。→ sources.js 按它给每档算 minzoom/maxzoom。 */
export const LOD_SPAN = { fine: 18, mid: 45 };      // span < 18 → 10m；18~45 → 50m；> 45 → 110m

/** 中心点默认值（与旧页面一致，便于对照）。 */
export const CENTER_DEF = { world: [40, 22], china: [104, 35] };

/** 可见经度跨度 → 引擎 zoom。 */
export function zoomForSpan(spanDeg, widthPx) {
  if (!(spanDeg > 0) || !(widthPx > 0)) return 0;
  return Math.log2(widthPx * 360 / (TILE_BASE * spanDeg));
}

/** 引擎 zoom → 可见经度跨度。 */
export function spanForZoom(zoom, widthPx) {
  if (!(widthPx > 0)) return 0;
  return widthPx * 360 / (TILE_BASE * Math.pow(2, zoom));
}

/**
 * 视野上限（度）—— **两个约束取小**（261116 任务#5）：
 *   ① **环绕安全上限 340°**：数据只覆盖 [-180,180]（GeoJSON 源不支持 wrap），
 *      跨度一旦接近 360，视口就会跨过接缝露出空白；
 *   ② **容器宽高比**：Web Mercator 世界像素高 = `512·2^z`，必须 ≥ 容器高，
 *      否则世界比容器矮，上下会露出底色（不是白屏 —— 是 `mp-sea` 的海底色带）。
 *      由 `span = W·360/(512·2^z)` 反解得 `512·2^z = W·360/span`
 *      ⇒ 要求 `span ≤ W·360/H`。
 *      实测：443×564 → **282.8°**、390×844（竖屏手机）→ **166.4°**、844×390（横屏）→ 340°（封顶）。
 * ⚠ 与旧页面的 118.4° 无关了：那个数是"旧页面世界视野"的标定值，不是物理限制。
 *   现在的上限由**容器尺寸**决定 —— 换设备宽度不用重标定，也不用再背一个魔数。
 * ⚠ 拿不到高度（0 / NaN）时退回 340°：宁可维持旧行为，也不要算出 0 或 NaN
 *   把整个缩放夹死（`zoomForSpan(NaN)` 会返回 0 → 相机飞到无穷远）。
 * @param {number} widthPx @param {number} heightPx @returns {number} 度数
 */
export function spanMax(widthPx, heightPx) {
  if (!(widthPx > 0) || !(heightPx > 0)) return SPAN_CEIL;
  /* 三个约束取小：
     ① SPAN_CEIL(340°)：环绕安全（数据只覆盖 [-180,180]）；
     ② **W·360/512**：zoom ≥ 0 —— MapLibre 的 zoom 硬下限是 0，跨度再大就换算成负 zoom，
        而 **负 minzoom 会让整个 style 被拒**（实测 layers[2].minzoom: -0.31 is less
        than the minimum value 0 → 页面直接白屏、且报错只在控制台里）。
        这条不是"理论洁癖"，是踩过的白屏。
     ③ W·360/H：世界像素高 ≥ 容器高（不露底色带）。 */
  return Math.min(SPAN_CEIL, widthPx * 360 / 512, widthPx * 360 / heightPx);
}

/**
 * 墨卡托 y（**屏幕约定：向南增大**，0.5 = 赤道）。
 * ⚠ 用的是屏幕方向：北纬的 y **更小**。所以算纬度跨度必须取**绝对值** ——
 *   我第一版写成 `mercY(n) - mercY(s)`，北界减南界得到**负数**，
 *   被 `Math.max(dy, 1e-9)` 吞成 1e-9 → zLat 恒等于无穷大 →
 *   **纵向约束被静默架空**（单测抓到的：算出来的"纵向像素高"是 -282.8）。
 */
export function mercY(lat) {
  const p = Math.max(-85.05112878, Math.min(85.05112878, Number(lat) || 0)) * Math.PI / 180;
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + p / 2)) / (2 * Math.PI);
}

/**
 * 装下这个 bbox 所需的**最大**引擎 zoom（再放大就装不下了）。
 * 横向与纵向各算一个上限，取小的那个 —— 这就是 fitBounds 的原理，
 * 但这里自己算，是为了能同时受 `spanMax` 约束（MapLibre 的 fitBounds 不给 minZoom 口子）。
 * @param {number[]} bbox [w, s, e, n]
 */
export function zoomForBounds(bbox, widthPx, heightPx) {
  if (!bbox || bbox.length !== 4) return 0;
  const [w, s, e, n] = bbox;
  const zLon = zoomForSpan(Math.max(e - w, 1e-6), widthPx);
  const dy = Math.abs(mercY(n) - mercY(s));     // ⚠ 取绝对值（见 mercY 的注释）
  const zLat = Math.log2(Math.max(heightPx, 1) / (512 * dy));
  return Math.min(zLon, zLat);
}

/**
 * bbox → 目标镜头（**导航按钮用**：中国/世界各自飞到本类点位的实际分布区）。
 * @param {number[]} bbox [w, s, e, n]
 * @param {number} widthPx @param {number} heightPx 容器尺寸（未扣内边距）
 * @param {number} [padPx] 内边距（卡片会盖住边缘，留出余量）
 * @returns {{center:number[], zoom:number, capped:boolean}}
 *   `capped=true` = 这个 bbox 在当前容器允许的最宽视野里**装不下**，
 *   于是取"能取的最宽 + 居中"，两侧边缘会被切掉（用户可横向拖去看）。
 */
export function cameraForBounds(bbox, widthPx, heightPx, padPx) {
  const p = Math.max(0, padPx || 0);
  const W = Math.max(widthPx - 2 * p, 1);
  const H = Math.max(heightPx - 2 * p, 1);
  const zCap = zoomForSpan(spanMax(widthPx, heightPx), widthPx);  // 最宽（最小 zoom）
  const zFine = zoomForSpan(SPAN_MIN, widthPx);                  // 最细（最大 zoom）
  const zNeed = zoomForBounds(bbox, W, H);
  const capped = zNeed < zCap;
  const zoom = Math.max(zCap, Math.min(zNeed, zFine));
  return {
    center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
    zoom: zoom,
    capped: capped,
  };
}

/** 把引擎 zoom 夹进 [SPAN_MIN, spanMax] 对应的区间。
 *  ⚠ 必须与 `engine.applyZoomLimits` 用**同一个** `spanMax`，否则会出现
 *    "自己算出来的下限比引擎的还低，setCamera 后又被默默抬回去"。 */
export function clampZoom(zoom, widthPx, heightPx) {
  const zMax = zoomForSpan(SPAN_MIN, widthPx);
  /* ⚠ Math.max(0, …)：浮点误差可能让"正好等于 0"算成 -1e-16，
     而 MapLibre 对 minzoom/maxzoom 的下限是**闭区间 0**（负数直接拒整个 style）。 */
  const zMin = Math.max(0, zoomForSpan(spanMax(widthPx, heightPx), widthPx));
  return Math.max(zMin, Math.min(zMax, zoom));
}

/** 经度归一化到 [-180, 180)。**全项目唯一的 mod 口径**。 */
export function norm360(lng) {
  return ((lng + 180) % 360 + 360) % 360 - 180;
}

/** 按视野名取默认相机（宽度用于换算 zoom）。 */
export function defaultCamera(scope, widthPx) {
  const s = SPAN_DEF[scope] ? scope : 'world';
  return { center: CENTER_DEF[s].slice(), zoom: zoomForSpan(SPAN_DEF[s], widthPx) };
}

/* ── 深链：解析 / 序列化 ──────────────────────────────────
   格式沿用旧页面（`#L=power&v=cn&c=166.50,35.00&z=..&f=..&cat=..`），理由：
   分享链接与书签还有效，且 `L=` 仍必须**最先落**（层切换会重置分类与相机，
   否则 `cat`/`cam` 会按旧层校验后全被丢掉 —— 260929 踩过）。
   ⚠ 本模块只管**编解码**；"先应用 L、再应用其余"的次序由页面层保证。

   ★ 261005 新增 `sp=`（可见经度跨度，度）—— **本页自己的"精确镜头"键**
     为什么需要：`v`（视野名）只能表达世界/中国这两档，用户自己捏合到中间尺度时
     它俩都不是，链接就只剩中心点、缩放丢了。而旧页面的 `z` **不能拿来用**
     （它是"用户语义值 × Z_SCALE"的口径，换引擎后换算不可靠 —— 见文件头）。
     取 `sp` 而不是直接存 engine zoom：**zoom 与容器宽度绑定**，`sp` 才是
     与设备无关的那个量（本文件头的口径）。于是同一条链接在 390px 手机与
     844px 平板上看到的是**同样的地理范围**。
     ⚠ 旧链接里没有 `sp`（也不会有人写），读侧取不到就回落到 `v`/默认视野 → 老链接行为不变。 */

const NUM = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

/**
 * 解析 hash（去掉开头的 `#`）。
 * @returns {{layer:string|null, scope:string|null, focus:string|null, camera:object|null,
 *            span:number|null, cat:string[]|null, raw:object}}
 */
export function parseHash(hash) {
  const raw = {};
  String(hash || '').replace(/^#/, '').split('&').forEach((kv) => {
    if (!kv) return;
    const i = kv.indexOf('=');
    if (i < 0) return;
    raw[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
  });
  let camera = null;
  if (raw.c) {
    const parts = String(raw.c).split(',');
    const lng = NUM(parts[0], NaN);
    const lat = NUM(parts[1], NaN);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      camera = { center: [norm360(lng), lat], zoom: Number.isFinite(NUM(raw.z, NaN)) ? NUM(raw.z, 0) : null };
    }
  }
  return {
    layer: raw.L != null ? raw.L : null,
    scope: raw.v != null ? raw.v : null,
    focus: raw.f != null ? raw.f : null,
    cat: raw.cat != null ? String(raw.cat).split(',').filter(Boolean) : null,
    /* 可见跨度：只认正数（0/负数会让 zoomForSpan 返回 0 → 相机飞到无穷远） */
    span: (NUM(raw.sp, 0) > 0) ? NUM(raw.sp, 0) : null,
    camera,
    raw,
  };
}

/**
 * 序列化 hash。**按固定键序输出**（`L` 最先），保证同一状态得到同一字符串（可对账）。
 * @param {{layer?:string, scope?:string, center?:number[], zoom?:number, span?:number,
 *          focus?:string|null, cat?:string[]|null}} st
 */
export function buildHash(st) {
  const out = [];
  const put = (k, v) => out.push(k + '=' + encodeURIComponent(String(v)));
  if (st.layer) put('L', st.layer);
  if (st.scope) put('v', st.scope);
  if (st.center && Number.isFinite(st.center[0]) && Number.isFinite(st.center[1])) {
    put('c', st.center[0].toFixed(2) + ',' + st.center[1].toFixed(2));
  }
  if (Number.isFinite(st.zoom)) put('z', Number(st.zoom).toFixed(2));
  if (Number.isFinite(st.span)) put('sp', Number(st.span).toFixed(2));
  if (st.focus) put('f', st.focus);
  /* ⚠ 判据是 `!= null` 而**不是** `&& st.cat.length`（261008）：空数组 = 用户点了「全清」，
     那是一个**真实状态**（点位层恒假），必须序列化出去。
     写成「非空才写」的话它会被当成"没设过"→ 重新打开时 `cat` 缺失 = 默认态，
     与用户当时的画面不一致（选了公司时差别尤其明显：全清是 0 个点，默认态是整家公司）。
     `cat=` 空值在 parseHash 里被 `.split(',').filter(Boolean)` 解回 `[]`，往返闭合。 */
  if (st.cat != null) put('cat', st.cat.join(','));
  return '#' + out.join('&');
}

/** 两个相机是否等价（用于「不必重复写 hash」的判断；容差按最终显示精度定）。 */
export function sameCamera(a, b, eps) {
  const e = Number.isFinite(eps) ? eps : 0.005;
  if (!a || !b) return false;
  return Math.abs(a.center[0] - b.center[0]) < e
      && Math.abs(a.center[1] - b.center[1]) < e
      && Math.abs(a.zoom - b.zoom) < e;
}
