/* theme.js —— 配色与主题（**唯一取色入口**）
   ------------------------------------------------------------------
   负责：判断当前主题、从 `window.MP_MAP_THEME` 读出画布配色。
   不负责：把颜色用到图层上（→ layers.js）。

   ★ 一数一源（本模块存在的全部理由）：
     地图配色的**唯一真相源**是 `app/theme_palette.py` 的 `MAP_PALETTE`，
     它被构建期注入成 `window.MP_MAP_THEME = {dark:{角色:色}, light:{...}, sepia:{...}}`。
     ⛔ **不许在 JS 里再写一份颜色字面量** —— 那是旧页面反复踩过的坑
        （「下拉 7 套 / 页面条 7 套」同源问题）。本模块只做「读 + 缺档回落」。

   ★ 主题的 DOM 表现（260929 定，别当 bug 修）：
     深色 = **没有** `data-theme` 属性（`:root` 本身就是深色默认值），
     浅色/暖色才由 `html[data-theme="..."]` 覆盖。所以「取不到属性」时默认 dark 是对的。 */

/** 站点支持的主题（顺序与 theme_palette.py 一致）。 */
export const THEMES = ['dark', 'light', 'sepia'];

/**
 * 地图要不要**跟随壳的主题**（默认：跟随）。
 *
 * ★ 这是一处与老地图页的**行为差异**，打开两张卡就能看到，故显式做成一行开关：
 *   · 老地图页（echarts 版）取色写死 `MP_MAP_THEME.dark` —— 也就是「保留深色画布」，
 *     在**白色主题下它也是深色**（`MAP_THEME_CSS` 的 map_mode 只注入变量、不换画布底色）。
 *   · 新页**跟随主题**：`MAP_PALETTE.geo` 三套值本来就有（浅海底 #c3d3e6、深海底 #080d15），
 *     而壳的默认主题是**白色**（`app/config.py` 的 `SETTINGS[0].default='light'`），
 *     所以新页默认呈浅色底图。
 *   → 要与老页完全一致（永远深色）就把这里改成 `false`，**只改这一处**。
 */
export const FOLLOW_THEME = true;

/** 当前主题：取 `data-theme`，**取不到即 dark**（见文件头第 3 条）。 */
export function currentTheme() {
  if (!FOLLOW_THEME) return 'dark';
  const t = document.documentElement.dataset.theme;
  return THEMES.indexOf(t) >= 0 ? t : 'dark';
}

/** 取某个主题的完整角色表（缺 `MP_MAP_THEME` 时返回空对象，调用点必须能容忍）。 */
export function palette(theme) {
  const all = window.MP_MAP_THEME || {};
  return all[theme || currentTheme()] || all.dark || {};
}

/** 调色板是否就绪。**取不到必须立刻报出来**，不要让它退化成一堆 undefined：
    261003-79 实测，颜色为 undefined 时 MapLibre 会以 `color expected, undefined found`
    拒绝**整个 style**，表现是「引擎建好了但 style 永远加载不完」——
    只有控制台能看到原因，极难从现象倒推。 */
export function assertReady(theme) {
  const p = palette(theme);
  const g = p.geo || {};
  if (!g.area || !g.border) {
    throw new Error(
      'MP_MAP_THEME 未就绪（缺少 geo.area / geo.border）。\n'
      + '独立打开本页时需先加载 `dist/mp-theme.js`（由 资产地图/build_theme_js.py 从 '
      + 'app/theme_palette.py 生成）；真页面由 build_content.py 注入，不会缺。');
  }
  return p;
}

/**
 * 底图结构色（陆地/海/国界/省界/高亮）。
 * 角色名与 `MAP_PALETTE['geo']` 一致 —— **不要在这里改名**，改名等于悄悄开第二份口径。
 */
export function geoColors(theme) {
  const g = palette(theme).geo || {};
  return {
    sea: g.sea,
    area: g.area,
    border: g.border,
    provBorder: g.provBorder,
    emphasis: g.emphasis,
  };
}

/**
 * 分类色（矿种 / 电站类型）。键与 `MAP_PALETTE['cate']` 一致：
 *   hard  层 8 类：precious nonfer ferrous newene coal oilgas enchem chem
 *   power 层 3 类：hydro nuclear pumped
 * ⚠ 分类名是**数据里的字面量**（见 `build_points_geojson.py`），改一处要两头一起改。
 */
export function cateColors(theme) {
  return palette(theme).cate || {};
}

/** 点位描边色（深色主题下是近黑，浅色主题下同值即可 —— 亮点描深边更清楚）。 */
export function pointStroke(theme) {
  return palette(theme).ptBorder || 'rgba(0,0,0,.6)';
}

/* ── 分类名 / 分类色：**唯一实现**（别在 ui / hud / company / index 各抄一份）──
   ★ 为什么要收在这里（261005-102 P1-2 / P1-3 的落点）：
     · `cateCn` 原先在四个文件里各写一份，回退口径还分两派 —— 两处回退分类 key、
       两处回退空串。于是一旦数据里缺某个分类的中文名，地图 chip 显示 `precious`、
       候选列表与公司面板显示空，**三处打脸**（同一件事只有一份实现，铁律第 1 条）。
     · `cateColor` 在 ui.js 里另写一份且**写死 `.dark`** → 切到浅色/暖色主题后，
       地图上的点换了色，而卡片色点 / chip 色点 / 完整档案强调色还是深色主题的颜色 ——
       同一分类两处不同色，全程不报错。
   收进本模块后，分类的「名」与「色」各只剩一处口径。 */

/** 分类的兜底色（灰）。`points.js` 的 `cateColorExpr` 兜底与卡片色点兜底**共用这一个值** ——
    别再写第二遍 `'#94a3b8'`。 */
export const CATE_FALLBACK_COLOR = '#94a3b8';

/** 已经告警过的分类 key（同一条只提醒一次，免得每帧刷屏）。 */
const _warnedCate = new Set();

/**
 * 分类中文名。**缺名字时回退分类 key（并告警一次），不返回空串。**
 * 空串会把「少配了一个分类名」这件事藏起来 —— 本项目最贵的失败方式是静默失效；
 * 回退成 key 至少让它在界面上一眼可见、并在控制台留下可查的一句话。
 */
export function cateCn(cate) {
  const all = (window.MP_MAP_THEME || {}).cateCn || {};
  const n = (all[cate] && all[cate].n) || '';
  if (n) return n;
  if (cate && !_warnedCate.has(cate)) {
    _warnedCate.add(cate);
    console.warn('[theme] 分类缺中文名（暂回退显示 key）：' + cate
      + ' —— 补 app/theme_palette.py 的 CATE_CN');
  }
  return cate || '';
}

/** 分类说明一句（点位卡副标题）。取不到给空串 —— 说明**本来就可以没有**，
    与「名字」不同（名字缺了是配置漏洞，说明缺了只是没写）。 */
export function cateDesc(cate) {
  const all = (window.MP_MAP_THEME || {}).cateCn || {};
  return (all[cate] && all[cate].d) || '';
}

/**
 * 单个分类色（卡片色点 / chip 色点 / 完整档案强调色）。
 * ⚠ 必须走 `cateColors(theme)`（= 运行时调色板），**不许写死 `.dark`**；
 *    `theme` 省略即当前主题。
 */
export function cateColor(cate, theme) {
  const m = cateColors(theme);
  return m[cate] || CATE_FALLBACK_COLOR;
}

