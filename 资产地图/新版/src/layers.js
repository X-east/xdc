/* layers.js —— 图层装配（**只做"谁在谁上面、用什么样式"，不管数据从哪来**）
   ------------------------------------------------------------------
   负责：按档把 sources 组装成 MapLibre 的 `layers` 数组，并按主题上色。
   不负责：数据源声明（→ sources.js）、配色定义（→ theme.js）、相机（→ camera.js）。

   ★ 一个约定：**多边形只填充、边界单独成线**。
     理由：多边形各自描边时，同一段共享边界会被画两遍（视觉上"变粗/双线"）。
     国界与省界都已是**独立线要素**（NE 的 boundary_lines / 我们提取的 province_lines），
     所以填充一律 `fill-outline-color: transparent`，描边全交给 line 图层。
     ⚠ 实测（261003-69）：MapLibre 的 fill 渲染本身带半像素外扩，所以即使填充之间
       有次像素不一致也不会露缝；显式设 transparent 是为了**不叠加**第二层描边。

   ★ 由粗到细**全部建层、用 minzoom/maxzoom 分段**，而不是"切档时增删图层"：
     后者要在切换瞬间改 style（一次 setStyle 全量重载），前者是引擎原生行为，零成本、无闪烁。 */

import { geoColors, assertReady } from './theme.js';
import { BASE_SRC } from './sources.js';

/** 图层 id 常量（页面与探针都要按 id 找到它们，别在别处拼字符串）。 */
export const LAYER = {
  sea: 'mp-sea',
  fill: (lv) => 'mp-fill-' + lv,
  border: (lv) => 'mp-border-' + lv,
  prov: 'mp-prov',
};
/* ★ 261005-99：删掉 `provPick: 'mp-prov-pick'`（透明省面拾取层）。
   用户要求「省份卡与国家卡都去掉」→ 面拾取整条链退役：
     interactions.js 的 AREA_HITS / pickArea()
     layers.js 的 mp-prov-pick 图层与 out[LAYER.provPick] 样式
     sources.js 的 CHINA_POLY / out.china_poly
     index.js 的 layerIds 里那一段
   省界本身（LAYER.prov）**保留**——它只是画线，不参与拾取。 */

/** 线宽随 zoom 轻微变化（世界尺度细、近景稍粗）；用 interpolate 让引擎算，别每帧改样式。 */
function lineWidth(zmin, zmax, thin, thick) {
  const a = Math.max(0, zmin), b = Math.max(a + 0.001, zmax);
  return ['interpolate', ['linear'], ['zoom'], a, thin, b, thick];
}

/**
 * 单档的两层（填充 + 边界线）。
 *
 * ★ 261117 阶段1：两个 source（`base_<档>` / `borders_<档>`）合并为**一个 vector source**
 *   （BASE_SRC），靠 source-layer 区分 countries / borders。三档共用同一 source、
 *   靠整数 minzoom/maxzoom 分段；不再有 openEnded / 懒加载补层那套逻辑。
 *
 * @param {object} t 档位描述（含 id/min/max）
 * @param {string} theme
 * @param {{openEnded?:boolean}} [opt] 兼容旧签名：新口径忽略（留着避免调用点改动）
 */
export function tierLayers(t, theme, opt) {
  assertReady(theme);
  const C = geoColors(theme);
  return [
    {
      id: LAYER.fill(t.id), type: 'fill', source: BASE_SRC,
      'source-layer': 'countries',
      minzoom: t.min, maxzoom: t.max,
      paint: {
        'fill-color': C.area,
        // 不描边（描边交给下面的 line 图层），见文件头
        'fill-outline-color': 'rgba(0,0,0,0)',
      },
    },
    {
      id: LAYER.border(t.id), type: 'line', source: BASE_SRC,
      'source-layer': 'borders',
      minzoom: t.min, maxzoom: t.max,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': C.border,
        'line-width': lineWidth(t.min, t.max, 0.5, 1.0),
      },
    },
  ];
}

/**
 * 组装完整 style。
 * @param {{sources:object, tiers:Array, provMinZoom:number, theme?:string,
 *          extraLayers?:object[], lazyFiner?:boolean}} opt
 *   `tiers`：**只给启动要建的那几档**（最细那档懒加载，不在里面）。
 *   `lazyFiner`：最细那档是懒加载的 → 末档放开上限兜底（见 tierLayers 的说明）。
 *   `extraLayers`：底图之外的图层（点位层由 points.js 给），**按顺序追加在最上面**。
 *   为什么用"追加"而不是"让 layers.js 认识点位"：底图与点位的变化原因不同
 *   （换底图不影响点位、加点位不影响底图），所以只在**层序**这一件事上耦合，别的不耦合。
 * @returns {object} MapLibre style（version 8）
 */
/**
 * 省界图层（**独立导出**：261116 任务#4 起它随 50m 档懒加载，不在 boot 的 style 里）。
 * 只在"够近"时出现（世界尺度不显示），且比国界更淡更细。
 * @param {string} theme
 * @param {number} minzoom 起点（由 `provSpanLimit()` 换算，**调用方给**，别在这里写第二份口径）
 */
export function provLayer(theme, minzoom) {
  assertReady(theme);
  const C = geoColors(theme);
  return {
    id: LAYER.prov, type: 'line', source: BASE_SRC,
    'source-layer': 'prov',
    minzoom: minzoom,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': C.provBorder,
      'line-width': lineWidth(minzoom, minzoom + 2.5, 0.5, 1.0),
    },
  };
}

export function buildStyle(opt) {
  assertReady(opt.theme);   // 颜色缺失会毁掉整个 style，这里先拦
  const C = geoColors(opt.theme);
  let layers = [{
    id: LAYER.sea, type: 'background',
    paint: { 'background-color': C.sea },
  }];

  // 由粗到细排：细档在上（后画的盖住先画的），与 minzoom/maxzoom 一起保证同时只有一档可见
  opt.tiers.forEach((t, i) => {
    const last = i === opt.tiers.length - 1;
    layers = layers.concat(tierLayers(t, opt.theme, { openEnded: last && !!opt.lazyFiner }));
  });

  /* 省界：只在"够近"时才出现。
     ⚠ 261116 任务#4：改成**可选** —— `provMinZoom` 给数字才建，给 null/undefined 就不建，
       由 index.js 在 50m 档懒加载时用 `provLayer()` 补上（首屏少 152KB）。
       这里不建的话，`sources` 里也不要声明 `prov_lines`（否则空下载）。 */
  if (typeof opt.provMinZoom === 'number') {
    layers.push(provLayer(opt.theme, opt.provMinZoom));
  }

  /* 261005-99：省面透明拾取层（`mp-prov-pick`）已随「取消省份卡 / 国家卡」下线 ——
     点面出的卡没有任何资产信息。整块连同数据源 `china_poly` 一起删掉，
     连带不再打进包的是 478 KB 的 `china.geo.json`。见 interactions.js 文件头。 */

  /* ⚠ 只放**有意义**的键。261003-79 两次踩同一类坑：
       ① 自定义键 `_keepProps` → style 校验拒收；
       ② `glyphs: undefined` → `glyphs: string expected, undefined found`。
     两者都会让**整个 style 被拒**（load 事件永不触发），而报错只出现在控制台里。
     本页不做注记，所以**根本不写 glyphs 键**即可（不请求字体 = 离线包不用带字体文件）。 */
  return {
    version: 8,
    sources: opt.sources,
    layers: layers.concat(opt.extraLayers || []),
  };
}

/**
 * 主题热切换用的 paint 补丁（**只改颜色，不动几何与层序**）。
 *
 * ★ 为什么必须是"补丁"而不是重建 style：官方明确警告 `setStyle()` 会**清空所有
 *   sources / layers / images**（"A style change wipes everything"）—— 换主题时用它
 *   必然闪烁 + 重建全部数据（我们这里就是 13.5 MB 的 LOD 数据重下一遍）。
 *   逐层 `setPaintProperty` 则是原地改一个 uniform，不动任何几何。
 *
 * @param {Array} tiers 同 buildStyle
 * @param {string} theme
 * @returns {Object<string, object>} 图层 id → {paint 属性: 值}
 *   ⚠ 可能包含**还没建出来的**图层 id（懒加载的那档）—— 由 `engine.setPaintPatch`
 *     跳过不存在的层，调用方不必自己筛（那种"每个调用点都要记得筛一次"的约定迟早漏）。
 */
export function themePatch(tiers, theme) {
  assertReady(theme);
  const C = geoColors(theme);
  const out = {};
  out[LAYER.sea] = { 'background-color': C.sea };
  out[LAYER.prov] = { 'line-color': C.provBorder };
  tiers.forEach((t) => {
    out[LAYER.fill(t.id)] = { 'fill-color': C.area };
    out[LAYER.border(t.id)] = { 'line-color': C.border };
  });
  return out;
}
