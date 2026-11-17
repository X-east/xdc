/* points.js —— 点位层（**只描述"点怎么画"，不描述"谁在谁上面"、不管数据从哪来**）
   ------------------------------------------------------------------
   负责：点位 source 的声明、circle 图层的 paint 表达式（分类色 / 点径随 zoom / 描边）、
         以及「分类筛选」这个**纯表达式**的构造。
   不负责：图层顺序（→ layers.js 把本模块的层追加到最上面）、配色定义（→ theme.js）、
           真的去改图层（→ engine.js 的 setFilter / setPaint）。

   ★★ 三条来自业界标准做法（261003-80 逐条对照过），别改回去：
     ① **只用 circle 层，不用 symbol 层**。symbol 走注记布局与碰撞检测，且**需要 `glyphs`
        （字体文件）** —— 离线包就得多背一份字体。而我们的点本来就是「彩圆 + 深边」，不需要文字。
        MapLibre 官方明确建议「用 circle 层而不是 Marker 实例」：854 个 `new Marker()` 很贵。
     ② **分类上色用数据驱动表达式**（`match`），**不是切数据/重建 series**。
        旧页面「勾一个分类 → setOption 重建 series」有 **77.5 ms 地板**（`_cull_cost.mjs` 实测
        `setOption({})` 空调用就是 77.5 ms，与载荷无关）—— 这条地板正是「点一下卡一下」的根源。
     ③ **点径随 zoom 用 `interpolate` 交给引擎算**，不是每帧在 JS 里算 ——
        旧页面 261003-64 才发现 `symbolSize: ptSize()` 被求值一次、点径冻在打开那一刻，
        用户说的「不跟手」大半来自它。引擎里这是免费的。

   ★ `promoteId`：把要素的稳定 id（数据里的 `id` 字段，如 `h0` / `p17`）提升成要素 id。
     没有它就没法用 `setFeatureState` 做 hover 高亮（官方文档明确要求要素有 id）。
     ⚠ `id` 是**几何无关的稳定串**（`h`/`p` + 序号，见 `build_points_geojson.py`），
       不是数组下标 —— 重跑生成脚本后仍指向同一个点。 */

import { cateColors, pointStroke, palette, assertReady, CATE_FALLBACK_COLOR } from './theme.js';
import { SPAN_CEIL, SPAN_MIN, zoomForSpan } from './camera.js';

/** 点位数据文件（`资产地图/build_points_geojson.py` 生成）。
 *  ⚠ 路径走 base.distUrl —— 相对**模块**而不是相对页面（个股页在子目录下，
 *    写死 'dist/' 会 404 且不报错，见 base.js 文件头）。 */
import { distUrl } from './base.js';
import { isLayerOn } from './store.js';
export const PT_FILE = {
  hard: distUrl('hard_points.geojson'),
  power: distUrl('power_points.geojson'),
};

/** source id / layer id（页面与探针都按这里取，别在别处拼字符串）。 */
export const POINT_SRC = { hard: 'mp-pts-hard', power: 'mp-pts-power' };
export const POINT_LAYER = { hard: 'mp-pts-hard-circle', power: 'mp-pts-power-circle' };
/** 高亮层（hover / 选中）—— 与点层**同源**，靠 `feature-state` 过滤出那一个要素。
 *  为什么复制一层而不是改原层的颜色：改原层 paint 就得按状态写 `case` 表达式，
 *  而**表达式里读 feature-state 会让整层失去批量绘制优化**；复制一层则常态层完全不受影响。 */
export const POINT_HL = { hard: 'mp-pts-hard-hl', power: 'mp-pts-power-hl' };
/** 点层清单 —— **顺序 = 画序（后画的在上面）**。
 *  电站在上：点少的一层压在上面，被盖住的矿点最少；反过来就是大量电站被海量矿点盖住
 *  （两个层的规模都随数据变，别拿写死的数当画序依据 —— 261007-180）。
 *  同理拾取也按**倒序**找（先问最上面那层），见 interactions.js。 */
export const PT_LAYERS = ['hard', 'power'];
/** ★ 261117 任务#7：**不可见的命中层**（与点层同源，透明但可拾取）。
 *  为什么要有：视觉点的半径只有 3~7px（PT_R）→ 热区直径 6~14px，
 *  **手指根本点不中**（移动端的可点目标下限是 44px）。
 *  做法：同一份数据再画一层 `circle-opacity:0`、半径更大的圆，拾取时问这层。
 *  ⚠ 透明层**照样能被 queryRenderedFeatures 命中**（opacity 不影响要素查询，
 *    只有 `visibility:none` 才会被排除）—— 这是标准做法。 */
export const POINT_HIT = { hard: 'mp-pts-hard-hit', power: 'mp-pts-power-hit' };
/** 最小命中半径（px）：触摸设备按手指给，鼠标可以小些（鼠标有精确指向）。 */
export const HIT_MIN = { touch: 18, mouse: 10 };
/** 当前设备该用哪个最小命中半径（按**主指针**粗细判断：手指=coarse）。 */
export function hitMinRadius() {
  const coarse = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(pointer: coarse)').matches;
  return coarse ? HIT_MIN.touch : HIT_MIN.mouse;
}

/** 层的中文名与图标 —— **界面默认值**。
 *  ⚠ 权威来源是 `dist/layers.json`（构建期从数据生成，名字/图标/计数都在里面，
 *    老页顶栏的图层段也读它）。这里是"取不到时的兜底"：layers.json 要 fetch，
 *    离线首启失败时整行不能空白。两处名字必须一致 —— 改数据里的名字时这里跟着改。
 *  ⚠ 收在这里而不是各自写一份：早先 ui.js 里有一份 `GROUP_CN`，加图层开关时又要一份，
 *    两份同源常量就是"迟早对不上"的温床（铁律：同一件事只有一份实现）。 */
export const LAYER_META = {
  hard: { name: '硬资产', icon: '⛏️' },
  power: { name: '电力', icon: '⚡' },
};

/**
 * 各点层的分类集合 —— **兜底值**；权威来源是构建期生成的 `dist/pt_stats.json`，
 * hud.js fetch 到后调 `applyStatsCats()` 注入（261007-180 去写死）。
 *
 * ⚠ 为什么还留这张表：`match` 色值表达式必须**枚举**分类（不能通配），首帧渲染
 *   （stats 还在 fetch）不能等它；且离线 fetch 失败时也得有个兜底，不然整层没颜色。
 * ⚠ 为什么不能写死内容：分类数量随数据增减 —— 发电设施从硬资产迁入电力层后，
 *   power 立刻多出 thermal / renew 两类，写死的 8+3 当场过期（这正是 261007-180 修的）。
 *   兜底表只求「形状对」，注入后以数据为准。新增分类时这里可以不加 ——
 *   stats 一到就会被覆盖；落不到兜底表里也只是首帧那一瞬间用兜底色，能看出来。
 */
export const PT_CATS = {
  hard: ['precious', 'nonfer', 'ferrous', 'newene', 'coal', 'oilgas', 'enchem', 'chem'],
  power: ['hydro', 'nuclear', 'pumped'],
};

/**
 * 用构建期统计（`dist/pt_stats.json`）覆盖分类表。**幂等**；stats 里缺的层保持兜底。
 * 顺序 = pt_stats 里 cats 的键序（构建期已按展示顺序排好，见 build_points_geojson 的 order）。
 * ⚠ 调用时机：hud.js 拿到 stats 后、`onData`（ui.js 重渲 chip）**之前** ——
 *   chip 结构是按 PT_CATS 建的，晚了新分类的 chip 就不会出现。
 * @param {object} stats pt_stats.json 的解析结果（顶层含各层子对象，子对象含 cats）
 */
export function applyStatsCats(stats) {
  Object.keys(PT_CATS).forEach((k) => {
    const by = stats && stats[k] && stats[k].cats;
    const cats = by && Object.keys(by);
    if (cats && cats.length) {
      /* ⚠ **原地改写**（length=0 + push），不能 `PT_CATS[k] = cats` ——
         probe（index.js 的 MP2.pointLayers）等持有者在创建时就抓走了**数组引用**，
         换新数组对它们不可见（261007-180 实测：探针看到的一直是 11 类兜底表）。 */
      PT_CATS[k].length = 0;
      cats.forEach((c) => PT_CATS[k].push(c));
    }
  });
}

/* 点半径（屏幕像素）：世界视野 3 → 最细 7。
   ⚠ 261003-88 由 {5, 12} 调小（用户「点太大」）。锚点仍是 span 换算 zoom，
     换设备宽度不用重标定（旧口径与容器宽度绑死）。 */
export const PT_R = { min: 3, max: 7 };

/** 描边宽度（px）。旧页面 `borderWidth: 1`，深色底上 1px 就够分清新旧点。 */
export const PT_STROKE_W = 1;

/**
 * 点径表达式：`interpolate` 的输入是**引擎 zoom**（不是 span）——
 * 因为 circle-radius 的单位本来就是屏幕像素，而引擎 zoom 与像素是同一坐标系。
 * @param {number} widthPx 容器宽度（只用来把两个 span 端点换算成 zoom）
 * @param {number} [add] 半径增量（高亮层要比常态大一圈）
 */
export function pointRadiusExpr(widthPx, add) {
  const d = add || 0;
  /* ★ 261116 任务#5：端点用**物理天花板** SPAN_CEIL（不是旧的 118.4° 产品上限）。
     地图下限随容器宽高比变化（spanMax），用天花板当端点可以保证**任何实际缩放下**
     半径都落在插值区间里（引擎对超出端点的输入会取端点值，不会画错）。
     实际差别可忽略：最远时半径 ≈3.2px（原来 ≈3.0px）。 */
  const zWorld = Math.max(0, zoomForSpan(SPAN_CEIL, widthPx));   // 最粗（物理天花板；zoom 不得为负）
  const zFine = zoomForSpan(SPAN_MIN, widthPx);    // 最细
  return ['interpolate', ['linear'], ['zoom'], zWorld, PT_R.min + d, zFine, PT_R.max + d];
}

/**
 * 分类色表达式：`match` 逐类取值，**末尾必须有兜底**。
 * ⚠ 漏了兜底值 MapLibre 会拒收整条表达式（→ 整层不画），且只报在控制台。
 * @param {string[]} cats 本层认的分类
 * @param {object} C theme.js 的分类色表
 */
export function cateColorExpr(cats, C) {
  /* 灰（「其他」）—— 不新造颜色字面量：借分类表里的灰，与 theme.CATE_FALLBACK_COLOR 同值。 */
  const fallback = C.ferrous || CATE_FALLBACK_COLOR;
  const e = ['match', ['get', 'cate']];
  cats.forEach((c) => { e.push(c, C[c] || fallback); });
  e.push(fallback);
  return e;
}

/**
 * 点位层的筛选表达式 —— **「显示哪些点」的唯一实现**（261003-88）。
 *
 * 口径（用户拍板「没选中的就不显示」）：
 *   图层关掉          → 恒假（这一层不画）
 *   什么都没选        → 恒假（地图只剩底图）
 *   只选了分类        → 该分类的点
 *   选了公司          → 该公司的点（可再叠加分类）
 *   公司 + 分类       → 两者都满足
 *   分类「全清」      → 恒假（见下面 ★ 三态）
 *
 * ★★ 261008：分类这一维有**三态**，别再把它折成两态：
 *   `cats === null`   —— **没碰过**这一维（启动态）。chip 全亮、不按分类限制，
 *                        但配合下面「默认态」判断 → 什么都不选时是恒假。
 *   `cats === []`     —— 用户**显式全清**（点了筛选栏那枚「全清」，或把 chip 逐个点灭）。
 *                        chip 全灭。**恒假，且优先级高于公司维度** —— 用户说的是
 *                        「哪个分类都不要」，不是「这家公司的点照旧全显示」。
 *   `cats === [部分]` —— 只留这些分类；`=== 全部` 时等价于「不按分类限制」（显式全选）。
 *   ⚠ 早先把空数组折成 `null`（`onCats(sel.length ? sel : null)`），于是「全清」与
 *     「全选」变成同一个状态 —— 界面上会出现「按钮说已全清、chip 却全亮」的打脸。
 *
 * ⚠⚠ 公司维度**只能按点位 id 白名单**筛，**不能**按 `cos` 数组属性做成员判断（261003-88 实测）。
 *   MapLibre 的 legacy filter 对数组属性的成员判断一律失效，**且不报任何错**：
 *     `['in', ['get','cos'], ['literal',[code]]]`、`['>=', ['index-of', …], 0]`、
 *     `['in', code, ['get','cos']]`、`['match', …]` —— 实测**六种全返回 0 个要素**，
 *     而同相机下无 filter 的高亮层渲染 715 个。表现是「选中公司后一个点都不显示」。
 *   （诊断数据写在 `_map2_check.mjs` 的 K 段里，别再重复试。）
 *   id 白名单来自 `store` 的 `compIds`，与点位 geojson 同源（都是 build_points_geojson
 *   生成的稳定 id），所以 `['in', ['get','id'], ['literal', ids]]` 一定能对上。
 *
 * ⚠ 「什么都不选」用恒假式 `['in', ['get','cate'], ['literal', []]]` 而**不是 null** ——
 *   null 在 MapLibre 里是「不过滤」，正好相反。
 *
 * @param {string} which 'hard' | 'power'
 * @param {{compIds:?string[], cats:?string[], scope?:'cn'|'ov', on?:object}} st store 的状态快照
 * @returns {any[]} MapLibre filter 表达式
 */
export function pointFilter(which, st) {
  /* 图层开关是**最早**的一道闸：关掉就恒假，后面各维都不用算了。
     判据收口在 `store.isLayerOn`（缺省为「开」、只认显式 false —— 为什么不能写
     `!st.on[which]` 见那里）。261006-112 P2-23 起不再就地手写。 */
  if (!isLayerOn(which, st)) return ['in', ['get', 'cate'], ['literal', []]];

  /* ★★ 默认态 = **四个维度一个都没设**（没选公司、没选分类、没设境内外）
     → **不过滤，全部显示**（261116 用户拍板改的口径，见下）。
     历史沿革（别改回去，改之前先读完这段）：
       · 261003-88 原口径「什么都没选 → 点位层全隐藏（只剩底图）」= 恒假；
       · 261007-179 用「下面 conds 为空」推默认态，把「显式选满全部类目」一起误杀；
       · 261116 用户报「资产地图默认全部显示但是不显示具体的点」：图层全亮、统计
         972 个点，画布上 0 个点 —— 恒假在默认态下就是「看起来坏了」。改为放行全部。
     三态语义至此明确（hud.counts 与此严格对应，改一处必须看另一处）：
       ① 什么都没选        → 全部显示（return null）
       ② 显式全选「分类」  → 全部显示（conds 为空，末尾 `!conds.length → return null`）
       ③ 显式全清「分类」  → 0 个点（下面 push 的那条恒假）
     ⚠⚠ 必须**显式判**这里，不能靠 conds 推断 —— ②③ 在 conds 层面长得一样。 */
  const hasComp = !!(st && st.compIds);
  /* ⚠ 判据是 `st.cats` **非 null**（不是「非空数组」）：空数组是用户**显式全清**，
     属于「碰过这一维」，不能被当成默认态 —— 虽然两者结果都是恒假，但语义不同，
     而语义不同的东西写成同一个判据，下一个人改一处就会漏另一处（261007-179 的教训）。 */
  const hasCats = !!(st && st.cats);
  const hasScope = !!(st && (st.scope === 'cn' || st.scope === 'ov'));
  if (!hasComp && !hasCats && !hasScope) return null;

  const conds = [];
  if (hasComp) {
    /* 空数组 = 「这家在这一层一个点都没有」（15 家纯参股公司、或个股页只属另一层）：
       靠 `['in', X, ['literal', []]]` 表达恒假。
       ⚠⚠ **别用 `['literal', ['__none__']]` 当「不可能的值」**（261004-89 实测）：
         `__none__` 是 MapLibre 的**保留哨兵值**，`['literal', ['__none__']]`
         被解释成「无值」→ 比较**恒真** → 该层所有点全放行（西部矿业那页渲出 62 个电站）
         而且**不报任何错**。空数组是唯一可靠的恒假写法。 */
    conds.push(['in', ['get', 'id'], ['literal', st.compIds.slice()]]);
  }
  const all = PT_CATS[which] || [];
  const cats = st && st.cats;
  /* ⚠ 判据里**没有** `cats.length` 这一项（261008 去掉的）：空数组也要 push 一条**恒假**
     （`['in', X, ['literal', []]]` 是本项目唯一的恒假写法，见上面那段警告）。
     留着 `cats.length &&` 的后果：用户点了「全清」后，若此刻还选着某家公司，
     公司那条 cond 会把该公司的点全放行 —— 表现是「按了全清，地图上还剩一片点」。
     ⚠ `cats.length < all.length` 这一半要**保留**：它表达「显式全选 = 不加分类限制」
     （261007-179 修的那件事），`all.length` 为 0（分类表还没注入）时自然不成立。 */
  if (cats && cats.length < all.length) {
    conds.push(['in', ['get', 'cate'], ['literal', cats.slice()]]);
  }
  /* 境内/境外这一维（个股页的分段控件切它；`ov` 是 1=境外 / 0=境内）。
     ⚠ 语义是**互斥**：选了境内就不再看境外，反之亦然 —— 与「按公司筛」是 AND，
       与「按分类筛」也是 AND。三维同时存在时用 all 串起来（下面的 concat）。 */
  /*⚠ 两侧都要**字符串**：geojson 里 ov 被导出成字符串 '0'/'1'，MapLibre legacy filter
     的 `==` 要求两侧同类型 —— 传数字会被 style 校验拒收（`filter[1]: string expected,
     number found`，只在控制台，表现为「筛选点了没反应」，261003-88 已踩过一次）。
     ⚠ 261004-89 实测另一个更隐蔽的：传数字**不报 style 错**，但**恒等于境内**——
       eq0 与 eq1 返回**同一个数**（19），setScope 切了等于没切。
     正解：两侧都用字符串常量，且 geojson 侧把 ov 写成字符串（见 build_points_geojson.py）。
     ⚠ 下面还加了 in 兜底：万一类型还是不对，至少不会「静默筛错」。 */
  if (st && st.scope === 'cn') conds.push(['in', ['get', 'ov'], ['literal', ['0']]]);
  else if (st && st.scope === 'ov') conds.push(['in', ['get', 'ov'], ['literal', ['1']]]);
  /* ★ 走到这里 conds 仍为空 —— 只可能是**显式全选**（用户把该类目的 chip 全点亮，
     于是 `cats.length < all.length` 不成立、不需要额外条件）：放行全部，返回 null
     （= 不过滤）。这正是 261007-179 要修的那件事，本行**保留**。
     ⚠ 与「默认态」的区别在上面的显式判断里：默认态在更早处就返回恒假了、走不到这里；
       所以「空 conds」在这一行**只**代表显式全选，不再兼职表达「什么都没选」。
     ⚠ `st.compIds` 为**空数组**（上面 hasComp 分支）是有意表达的
       「这家在这一层一个点都没有」，它已经 push 了恒假条件、conds 非空，语义不受影响。 */
  if (!conds.length) return null;
  return conds.length === 1 ? conds[0] : ['all'].concat(conds);
}

/**
 * `ov`（境内 / 境外）的**唯一判定**。**两种形态都要吃**：
 *   · geojson 与 hover/点中时的 props → **字符串** `'0'`/`'1'`（为什么不是数字见上面 pointFilter）；
 *   · `comp_index.json` 里的点位 → **布尔**（导出时已转，见 build_comp_index.py 的
 *     `'ov': (str(p.get('ov')) == '1')`），而公司卡的资产清单是从那儿来的，
 *     `pickAsset()` 就按布尔传进卡片。
 *
 * ⚠ 为什么必须走这一个函数而不是各自写 `p.ov ? …`：
 *   **JS 里字符串 `'0'` 是 truthy** —— `p.ov ? '境外' : '境内'` 在字符串形态下
 *   **永远走 '境外'**，且不报错。261005 实测：点位卡 / hover 提示 / 搜索候选三处
 *   把境内点统统标成了「境外权益」（972 个点无一例外）—— 又一条「不报错的静默失效」。
 *   现在同一份 props 可能来自两条路径（geojson 字符串 / 索引布尔），分别写判据必然再错一次。
 */
export function isOv(v) { return v === true || String(v) === '1'; }



/** 点位 source（`promoteId` 见文件头第 4 条）。
 *  @param {number} [widthPx] 容器宽度：clusterMaxZoom 要换算成引擎 zoom，而 zoom∝宽度。 */
export function pointSource(which) {
  /* ⚠ GeoJSON source 不支持 `wrap`（见 sources.js 同名注释）—— 平铺在数据侧做。 */
  return { type: 'geojson', data: PT_FILE[which], tolerance: 0, promoteId: 'id' };
}

/** 全部点位 source（供 index.js 与底图 sources 合并）。 */
export function buildPointSources(which) {
  const out = {};
  (which || PT_LAYERS).forEach((k) => { out[POINT_SRC[k]] = pointSource(k); });
  return out;
}

/**
 * 点位 id → 层名。**「id 前缀即层」的唯一实现**（261005 从两处收成一处）。
 *
 * ⚠ 为什么非要它：`setFeatureState` 必须知道 **source**，而 id 常常是"裸"的 ——
 *   公司索引 `comp_index.json` 的 `pts[]` 只存 `id` / `n` / `c` / `lv` / `ov` / `lng` / `lat`，
 *   **没有 layer 字段**（它是点位数据的派生索引，见 build_comp_index.py）。
 *   于是「点公司卡里的资产清单一条 → 高亮那个点」这条路径上，`which` 无处可来。
 *   ⚠⚠ 早先 `pickAsset` 传的是 `x.layer`（`undefined`）→ `setFeatureState(undefined, …)`。
 *     MapLibre 对「source 不存在」**只 `console.error` 然后 return，不抛异常** ——
 *     所以状态里 `sel.id` 是对的、抽屉也渲染了，**地图上却一个点都没亮**，
 *     而探针当时只读模块内的 `_sel`，于是**全绿地放过了**（典型「真假绿」）。
 *     现在探针改读 `getFeatureState`（引擎侧真值），见 `_map2_check.mjs` 的 K4。
 * ⚠ 前缀判断**不许在各处各写一份**：`index.js` 的 applyFilters 原本自己写了
 *   `k === 'power' ? 'p' : 'h'`，与这里同源 —— 两处并存就是"迟早对不上"的经典温床
 *   （261004-89 的跨层误放行就出在同族问题上）。两边都改调这里。
 * @param {string} id 点位 id（`h*` 归硬资产、`p*` 归电力）
 * @returns {'hard'|'power'}
 */
export function whichOfId(id) {
  return String(id == null ? '' : id).charAt(0) === 'p' ? 'power' : 'hard';
}

/**
 * 组装点位图层（**由 layers.js 追加到底图之上**，本模块不决定位置）。
 * @param {string[]} which 要建哪几层
 * @param {number} widthPx
 * @param {string} theme
 * @returns {object[]} MapLibre 图层数组
 */
export function pointLayers(which, widthPx, theme) {
  assertReady(theme);   // 分类色缺失 → `match` 分支全 undefined → 整层被拒，先拦在这里
  const C = cateColors(theme);
  const stroke = pointStroke(theme);
  const r = pointRadiusExpr(widthPx);
  return (which || PT_LAYERS).map((k) => ({
    id: POINT_LAYER[k],
    type: 'circle',
    source: POINT_SRC[k],
    paint: {
      'circle-color': cateColorExpr(PT_CATS[k], C),
      'circle-radius': r,
      'circle-stroke-width': PT_STROKE_W,
      'circle-stroke-color': stroke,
    },
  }));
}

/** 命中层（不可见，只为拾取）：半径取 max(视觉半径, 最小命中半径)。
 *  ⚠ 放在点层**之上**（画序靠后）—— 命中层透明，视觉不受影响；
 *    拾取按层倒序找，先问最上面那层（见 interactions.js）。
 *  ⚠ 半径用**常数**而不是跟着 zoom 变：视觉半径本身就是 3→7px 的小量，
 *    命中半径再大也就 10~18px；跟着 zoom 变只会让"世界视野下热区小、放大后热区大"
 *    这种反直觉的取舍更难解释。
 *  @param {string[]} which
 *  @param {number} widthPx
 * @param {string} theme
 * @param {number} [minR] 最小命中半径（默认按设备自动判定）
 */
export function pointHitLayers(which, widthPx, theme, minR) {
  const r = Math.max(PT_R.max, minR || hitMinRadius());
  return (which || PT_LAYERS).map((k) => ({
    id: POINT_HIT[k],
    type: 'circle',
    source: POINT_SRC[k],
    paint: {
      'circle-radius': r,
      'circle-color': '#000000',
      /* 透明但**可拾取**：opacity 不影响要素查询（只有 visibility:none 才排除）。 */
      'circle-opacity': 0,
    },
  }));
}

/** 只改颜色（主题热切换用）：返回「图层 id → paint 补丁」，由页面层交给 engine.setPaint。
 *  ⚠ 走 `setPaintProperty` 而**不是** `setStyle` —— 官方明确警告 setStyle 会清空全部
 *    sources / layers（"A style change wipes everything"），换主题必闪 + 重建数据。 */
export function pointPaintPatch(which, theme) {
  const C = cateColors(theme);
  const stroke = pointStroke(theme);
  const out = {};
  (which || PT_LAYERS).forEach((k) => {
    out[POINT_LAYER[k]] = {
      'circle-color': cateColorExpr(PT_CATS[k], C),
      'circle-stroke-color': stroke,
    };
  });
  return out;
}

/** 只改点径（容器宽度变化时要重锚 zoom 端点）。 */
export function pointRadiusPatch(which, widthPx) {
  const r = pointRadiusExpr(widthPx);
  const out = {};
  (which || PT_LAYERS).forEach((k) => { out[POINT_LAYER[k]] = { 'circle-radius': r }; });
  return out;
}

/* ── 高亮（hover / 选中）─────────────────────────────────────── */

/** feature-state 的键名 —— **全项目唯一声明**。
 *  ⚠ 键名写错是**静默失效**：`setFeatureState` 设了个没人读的键不报错，只是"高亮不出来"，
 *    极难从现象倒推。所以页面层与 interactions.js 一律引用这里，不许写字面量。 */
export const FS = { hover: 'hover', sel: 'sel' };

/** 高亮时的半径增量与描边宽（旧页面 emphasis 是 symbolSize 9→15 + borderWidth 2.5）。 */
export const HL_R_ADD = 3, HL_STROKE_W = 2.5;

/**
 * 高亮图层：与点层**同源**，靠 `feature-state` 的**不透明度**只显示被 hover / 选中的那一个。
 * 为什么复制一层、而不是在原层 paint 里写 `case` 读 feature-state：
 *   ① 原层 paint 若是常量，引擎走的是"整层一次提交"的最优路径；一旦塞进 feature-state
 *      表达式，整层都要逐要素求值。**把高亮隔离到独立层，常态层不受牵连**。
 *   ② 高亮要比常态点大 3px、描边要换颜色，同一层做不到"只有它变"。
 *
 * ★★ 两处**实测踩过的硬约束**（261003-80 第一版两条都写错，`_map2_check` 抓到）：
 *   ① **不能给这一层写 `filter: ['==',['feature-state',…], true]`** ——
 *      MapLibre 直接拒收：`"feature-state" data expressions are not supported with filters`。
 *      feature-state **只能用在 paint 属性里**。官方 hover 示例用的也正是
 *      `'fill-opacity': ['case', ['boolean',['feature-state','hover'],false], 1, 0]`。
 *   ② **不能把 `interpolate(zoom)` 包进 `['+', expr, 3]`** —— 报
 *      `"zoom" expression may only be used as input to a top-level "step" or "interpolate"`。
 *      zoom 表达式必须是顶层 interpolate/step 的**直接输入**，所以增量要写进**端点**里
 *      （见 pointRadiusExpr 的 `add` 参数），不能事后相加。
 *   两条都会让**整个 style 被拒**、`load` 永不触发，而报错只在控制台里。
 *
 * ★★ 第三条（261005 实测抓到的**真 bug**，别再写回去）：
 *   **`circle-opacity` 只管填充，管不到描边。** 高亮层要在不命中时"整圈不见"，
 *   必须**同时**写 `circle-stroke-opacity` —— 只写 `circle-opacity` 的表现是
 *   「默认态（什么都没选）满屏**空心彩色圆环**」：填充被透明掉了，描边却照画。
 *   证据链（三重，`tests/_tmp_diag_state.mjs` 可复现）：
 *     ① 默认态 `queryRenderedFeatures(['mp-pts-hard-hl'])` = 166 + 电力 14 = 180 个；
 *     ② 藏掉 hl 层 → 截图 md5 变（188826→141748 字节）；而藏掉常态 circle 层 → 截图 md5 **不变**；
 *     ③ 只把 hl 的 `circle-stroke-width` 设 0 → 截图与「藏掉整层」**完全一致**
 *        → 证明 hl 层当时唯一的可见贡献就是描边。
 *   ⚠ 两条都是**静默**的：`queryRenderedFeatures` 不看 paint 不透明度（全透明的层照样
 *     被数出来），所以「数出 180 个要素」既不能说"看得见"也不能说"看不见"——
 *     这条只能靠**像素**断言，见 `_map2_check.mjs` 的 N 段。
 */
export function pointHighlightLayers(which, widthPx, theme) {
  assertReady(theme);
  const C = cateColors(theme);
  /* 强调色用主题里的 `white` 角色 —— 它是**主题感知**的：深色主题下是 #ffffff，
     浅色主题下是近黑（#1b2431）。浅色底上用纯白会"糊掉"，这正是不能写死 '#fff' 的原因。 */
  const white = palette(theme).white;
  const on = ['boolean', ['feature-state', FS.hover], false];
  const on2 = ['boolean', ['feature-state', FS.sel], false];
  /* 不命中就整圈透明。⚠ 这一条要**挂到两个属性上**（见文件头第三条）：
     挂 `circle-opacity` 只透明**填充**，描边照画 → 默认态满屏空心彩环。 */
  const hide = ['case', on, 1, on2, 1, 0];
  return (which || PT_LAYERS).map((k) => ({
    id: POINT_HL[k],
    type: 'circle',
    source: POINT_SRC[k],
    paint: {
      'circle-color': white,
      'circle-radius': pointRadiusExpr(widthPx, HL_R_ADD),
      'circle-stroke-width': HL_STROKE_W,
      'circle-stroke-color': cateColorExpr(PT_CATS[k], C),
      'circle-opacity': hide,
      'circle-stroke-opacity': hide,
    },
  }));
}

/** 高亮层的颜色补丁（主题热切换）。 */
export function pointHighlightPaintPatch(which, theme) {
  const C = cateColors(theme);
  const white = palette(theme).white;
  const out = {};
  (which || PT_LAYERS).forEach((k) => {
    out[POINT_HL[k]] = { 'circle-color': white, 'circle-stroke-color': cateColorExpr(PT_CATS[k], C) };
  });
  return out;
}

/** 高亮层的点径补丁（容器宽度变化）。 */
export function pointHighlightRadiusPatch(which, widthPx) {
  const r = pointRadiusExpr(widthPx, HL_R_ADD);
  const out = {};
  (which || PT_LAYERS).forEach((k) => { out[POINT_HL[k]] = { 'circle-radius': r }; });
  return out;
}
