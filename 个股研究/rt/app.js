/* ============================================================
   中国与全球矿产资源 · 交互式查询系统
   数据截止 2026-09-07 · 全部离线
   ============================================================ */
'use strict';
const D = (window.MP_MAP_THEME ? window.MP_MAP_THEME.dark : {"pal": ["#4a9eff", "#f59e0b", "#10b981", "#f43f5e", "#a78bfa", "#22d3ee", "#94a3b8"], "colors": ["#2563eb", "#3b82f6", "#60a5fa", "#93c5fd", "#1d4ed8", "#1e40af"], "nps": ["#b45309", "#d97706", "#f59e0b", "#fbbf24", "#92400e", "#78350f"], "qrev": ["#2563eb", "#3b82f6", "#60a5fa", "#93c5fd"], "qnp": ["#b45309", "#d97706", "#f59e0b", "#fbbf24"], "geo": {"sea": "#080d15", "area": "#1d2a44", "border": "#436399", "provBorder": "#2f4a70", "emphasis": "#283a54"}, "other": {"marker": "#3d4c66", "emphasis": "#5c6c88", "border": "#141d2e"}, "thermal": {"ramp": ["rgb(30,41,59)", "rgb(69,26,32)", "rgb(127,44,40)", "rgb(180,65,40)", "rgb(214,92,40)", "rgb(239,68,68)"], "end": "#ef4444", "base0": "#1d2a44", "baseMid": "#0d1420"}, "accent": "#4a9eff", "amber": "#f59e0b", "warn": "#fbbf24", "link": "#8fc2ff", "violet": "#a78bfa", "violet2": "#8b6fd4", "violetLt": "#c4b5fd", "green2": "#22c55e", "hydroLine": "#7fb2ff", "hydroLbl": "#9fc4ff", "pos": "#34d399", "neg": "#f87171", "tx": "#e8eef7", "tx2": "#9fb0c8", "tx3": "#64748b", "line": "#2f3d54", "lineSoft": "#1c2637", "panel": "#0e1725", "panel2": "#16202f", "bg0": "#0d1420", "bg1": "#16223a", "bg2": "#0a0f18", "white": "#ffffff", "bd3": "#3a4a63", "tipBg": "rgba(13,20,32,.96)", "tipBg2": "rgba(13,20,32,.97)", "sliderFill": "rgba(74,158,255,.14)", "sliderSel": "rgba(74,158,255,.2)", "ov07": "rgba(255,255,255,.07)", "ov14": "rgba(255,255,255,.14)", "revBar": "rgba(74,158,255,.55)", "sliderTrack": "rgba(74,158,255,.12)", "lblBg": "rgba(13,20,32,.92)", "ptBorder": "rgba(4,8,14,.85)", "warnBorder": "rgba(245,158,11,.35)", "warnFill": "rgba(245,158,11,.08)", "axTipBg": "rgba(15,23,42,.95)", "tipTx": "#cbd5e1", "warnWash": "rgba(251,191,36,.09)", "warnGlow": "rgba(251,191,36,.32)", "noteTx": "#e8d9a8", "invAxis": "#9fb0c5", "invLine": "#22304a", "invGold": "#f0b429", "invGoldSoft": "rgba(240,180,41,.14)", "invAccentSoft": "rgba(77,163,255,.5)", "invHeader": "rgba(11,17,25,.92)", "invMuted": "#8fa0b8", "invUp": "#e24b4a", "invDown": "#3fb950", "invGoldAlt": "#e0a94a", "invBg": "#0b1119", "cate": {"precious": "#f59e0b", "nonfer": "#38bdf8", "ferrous": "#94a3b8", "newene": "#10b981", "coal": "#a78bfa", "oilgas": "#f43f5e", "enchem": "#fb923c", "chem": "#22d3ee", "hydro": "#2563eb", "nuclear": "#f59e0b", "thermal": "#ef4444", "pumped": "#a78bfa", "renew": "#2dd4bf"}});

/* ---------------- 图层：硬资产 / 电力 ----------------
   同一张世界地图上的两个数据层。每层自带分类表（CATES）、计数单位、卡片口径，
   页面只装一层。**不在数据里焊「这层有哪些字段」的条件逻辑** —— 两层数据各自完整，
   各自的 data.json 原样保留（见 资产地图/sync_data.py），这才是解耦。

   分类表按层现取（不再是全局一份 const）：硬资产 8 大类；电力 4 类（水电/核电/火电/抽蓄）。
   颜色统一取自 D.cate，改色只动 app/build_content.py 的 MAP_PALETTE 一处。 */
const LAYER_DEFS = [
  {
    key:'hard', name:'硬资产', icon:'⛏️', dataFile:'hard.json', unit:'矿区',
    brand:'硬资产<span>·</span>全球布局',
    searchPh:'搜索矿区 / 省份 / 国家 / 企业 / 代码…',
    // 口径说明里的字段名：硬资产是「矿业权/运营主体」，电力是「运营主体」
    cats: [
      ['precious','贵金属',D.cate.precious,'金 · 银 · 铂族'],
      ['nonfer','有色金属',D.cate.nonfer,'铜 · 铝 · 铅锌 · 锡钨钼锑'],
      ['ferrous','黑色金属',D.cate.ferrous,'铁 · 锰 · 钒钛'],
      ['newene','新能源金属',D.cate.newene,'锂 · 稀土 · 镍钴 · 石墨'],
      ['coal','煤炭',D.cate.coal,'动力煤 · 炼焦煤'],
      ['oilgas','石油天然气',D.cate.oilgas,'海上油气 · 陆上油气'],
      ['enchem','能源化工',D.cate.enchem,'炼油 · 乙烯 · 煤化工'],
      ['chem','化工矿产',D.cate.chem,'磷 · 钾盐 · 磷化工'],
    ],
  },
  {
    key:'power', name:'电力', icon:'⚡', dataFile:'power.json', unit:'电站',
    brand:'电力资产<span>·</span>全国布局',
    searchPh:'搜索电站 / 省份 / 流域 / 企业 / 代码…',
    cats: [
      ['hydro','水电',D.cate.hydro,'常规水电 · 梯级电站'],
      ['nuclear','核电',D.cate.nuclear,'在运 · 在建'],
      ['thermal','火电',D.cate.thermal,'煤电 · 气电（省级口径）'],
      ['pumped','抽水蓄能',D.cate.pumped,'在运 · 在建'],
    ],
  },
];
const LAYER_MAP = Object.fromEntries(LAYER_DEFS.map(l => [l.key, l]));

/* 面板措辞（两层共用一份浮动层，靠这里把「矿种」换成「电源类型」）。
   空态文案也要给 —— 电力只有 4 类、细分常为空，用户读到的必须是本层的词。
   unit 是「一个资产点」的量词（矿区 / 电站）：个股页资产块、聚焦按钮都用它，
   否则电力页会出现「6 个矿区」这种串层措辞。 */
const LAYER_TERMS = {
  hard:  {cate:'矿种大类', sub:'矿种细分', tg:'矿种', empty:'本视图无矿种细分',
          cateTitle:'矿种大类', subTitle:'矿种细分', unit:'矿区', noneTip:'本视图下没有已收录的矿区。'},
  power: {cate:'电源类型', sub:'流域 / 集团', tg:'电源类型', empty:'本视图无流域分组',
          cateTitle:'电源类型', subTitle:'流域 / 集团', unit:'电站', noneTip:'本视图下没有已收录的电站。'},
};
/* 当前层措辞（个股页在 PAGE_LAYER 落定后也走这里） */
function terms(){ return LAYER_TERMS[S.layer] || LAYER_TERMS.hard; }

/* 分类标记点颜色统一统一到 app/build_content.py 的 MAP_PALETTE.cate（经文件首行的 D 取到）；
   原先这里写死深色字面量、再在下面用 forEach 覆盖一遍 —— 两处同源，等于同一条真相写两份。
   改成直接取 D.cate 后，那些字面量与覆盖循环一并删除（改色只动 MAP_PALETTE 一处）。 */
let CATES = [];                 // 当前层的分类表（切层时由 setLayer 换掉）
let CMAP = {};                  // 当前层 分类 key -> 定义行
const KIND = {mine:'矿山', smelter:'冶炼厂', refinery:'冶炼厂', gasfield:'油气田', plant:'工厂',
              plant_power:'电站', nuclear:'核电站', hydro:'水电站'};
/* kind 只存在于硬资产点位里。电力层（power.json）的点位没有 kind 字段，
   原先 `KIND[m.kind] || '矿山'` 一律落成「矿山」—— 点开一座水电站的完整档案，
   抬头会写着「水电 · 矿山」，且下面的字段标签全是「品位 / 矿床类型」。
   power 的四个分类 key（hydro/nuclear/thermal/pumped）与硬资产的八个不重叠，按 cate 兜一层即可。 */
/* >>> PICK_TABLES BEGIN（由 资产地图/inline.py 从 dist/pick_tables.json 生成；
   真相源 = 资产地图/build_points_geojson.py，手改本块会在下次构建被改回。261005-105）
   PLATFORM：上市平台 → 母公司的持股关系（矿区详情的交叉提示用）；
     紫金矿业持紫金黄金国际 85.00%（2026-09-05 股东数据）。
   NA_VALS / isNA：空值统一判定口径 —— 这三类值一律显示成「未公开」占位。 */
const KIND_CATE = {"hydro":"水电站","nuclear":"核电站","pumped":"抽水蓄能电站","thermal":"电厂","renew":"新能源电站"};
const PLATFORM = {"hk02259":{"parent":"紫金矿业","parentCode":"sh601899","pct":85.0}};
const NA_VALS = ["","未公开","不适用"];
const isNA = x => NA_VALS.indexOf(x) !== -1;
/* <<< PICK_TABLES END */

/* ── 登记到全站返回栈（app/back_kit.py 的 MPB）────────────────────────────
   本文件管三层，顺序（数值大者先退，即「遮得最狠的先退」）：
     200 说明弹窗 #modal → 190 完整档案 #drawer → 180 个股页全屏资产 #assetFull
   地图页只有前两层、个股页只有第三层，所以每个 active() 都先判元素是否存在。
   本文件只登记自己这三层，不认识别处任何浮层。
   ⚠ 走 __mpBackReg 而不是直接判 window.MPB：用入队兜底，就不必依赖「本文件排在
     注入层之后」这个当前的偶然事实（见 back_kit.py 的「登记顺序」）。 */
function mpRegBack(id, order, active, close){
  try{
    var f = window.__mpBackReg;
    if(f){ f(id, order, active, close); return; }
    (window.__mpBackQ = window.__mpBackQ || []).push([id, order, active, close]);
  }catch(e){}
}

/* 各公司利润推算模型（可选附加数据，缺失不影响主流程）。名字是拼音缩写：
   云铝/神火/盐湖/藏格/紫金/陕煤/宝丰/广汇/特变电工。地图页与个股页都按这张表取。 */
/* 数据文件前缀。个股页设 'rt/data/'（数据由构建器落成独立 json，不再把 4MB 塞进
   每个页面的 rt/pack.js）；地图页留空，直接读同目录 dist/。261109 统一运行时读取路径。 */
const DATA_BASE = window.MP_DATA_BASE || '';

const MODEL_FILES = ['ylgf.json', 'shgf.json', 'yhgf.json', 'zggf.json', 'zjky.json',
                     'smcy.json', 'bfny.json', 'ghny.json', 'tebiandiangong.json']
                    .map(f => DATA_BASE + f);

/* 两张底图（世界平铺 / 中国）。世界底图上同时画两层点位，中国视图只是镜头补间，不换底图。
   中国省界（第 5 条）复用同一份 china.geo.json，挂在第二个 geo 组件上做主 geo 的「描边层」。
   第 1 条起世界底图换成 **world_tile.geo.json**（构建期由 build_tile.py 生成，
     把 world 按 ±360·k 复制 TILE_SPAN 份）——这是「左右无限平铺」的渲染层底座。
     原来的 world.geo.json 仍是源，不动。 */
/* 261002-57：省界不再是独立的 china.geo.json 底图，而是**并进了世界底图**
   （world_tile.geo.json = 217 国 + 34 省 + 南海十段线，261 要素，7 份平铺）。
   省界与国界同源 → 共用一套投影参数与一个相机 → 拖动不可能脱节（261002-56 反馈）。
   china.geo.json 仍需注册：填色按省名匹配时要能查到 regions（见 geoBase 的 regions 口径）。 */
const GEO_FILES = {china: DATA_BASE + 'china.geo.json',
                   world: DATA_BASE + 'world_tile.geo.json'};

/* 省界层的视野阈值（第 5 条）：主 geo 的 zoom **大于等于**该值时显省界，否则隐藏。
   · 世界视野（默认 zoom 1.2）→ 隐藏，只剩国界，跟以前一样；
   · 压到中国本土（VIEW_DEF.china.z = 3.6）→ 显示 34 个省级边界。
   取 2.2 是因为世界视图下 zoom≈1.2、跨洲公司取景后通常 ≤1.5，而「中国装满屏」实测 ≈3.2+，
   2.2 落在这两档之间，放大时省界是在「快装下中国」时自然浮现，不会在世界视角乱闪。
   这是「跟随视野」而非「跟随 scope」：用户可能在世界视野里手放大到中国上空，那时也该出省界。
   2026-10-01 起 zoom 语义整体上移（ZOOM_MIN/world = 3.8、china = 7.2，标定见 ZOOM_MIN 处）：
   原阈值 2.2 在新语义下等于「永远显示省界」，与世界视野「去省界」的设计冲突（用户 261001 需求⑤）。
   新阈值取世界(3.8) 与中国(7.2) 之间 → 4.6。 */
const PROV_SHOW_ZOOM = 4.6;

/* 261002-57：省内要素在合并底图里的名字后缀（与 merge_prov.py 的 PROV_SUFFIX **必须一致**）。
   为什么加后缀：省界并进世界底图后，省名（「广东」）与国名（「China」→ 改名「中国」）
   同处一张图，echarts 的 regions 按 properties.name 匹配 —— 不加后缀万一撞名就会串色。
   填色数据里是纯省名，写进 regions 前要补上这个后缀。 */
const PROV_KEY = '·省';

/* 261002-57 起**不再需要**给省界单独钉窗口 —— 省界已并入世界底图，
   与国界共用 geo[0] 的 boundingCoords（本来就要按 tileWindow 随记账经度平移）。
   保留常量仅为兼容旧调用（探针会读 window.PROV_BOUNDS），值与 geo[0] 一致。 */
const PROV_BOUNDS = [[-180, 83.56], [180, -55.78]];

/* 画布分辨率上限 —— **手机流畅度的第一杠杆**（261001-26 实测）。
   echarts 默认按 window.devicePixelRatio 建画布，而手机 DPR 普遍 2.75～3.5：
   390×810 的容器会被渲染成 1170×2433，填充面积是电脑（DPR1）的 **9 倍**；
   再叠上 7 份平铺底图（183,911 个顶点）与两级 zlevel 画布，每一帧直接超掉 16.7ms 预算。

   实测（模拟手机 DPR3、同一条 CDP 手势、同一页面里轮换 6 次抵消系统负载漂移）：
     不夹（现状）   帧 >33ms 21/51（41%），>50ms 合计 23
     夹到 2        帧 >33ms  8/70（11%），>50ms 合计  0
   底图是「面填充 + 0.6～0.7px 细描边」，2 与 3 肉眼看不出差别，故取 2。

   ⚠ 三处 init 都要走 buildOpt() —— 漏一处那一处就仍旧按系统 DPR 建画布。 */
const CANVAS_DPR_CAP = 2;
function buildOpt(extra){
  const dpr = Math.min(CANVAS_DPR_CAP, window.devicePixelRatio || 1);
  return Object.assign({renderer:'canvas', devicePixelRatio:dpr}, extra || {});
}

/* ==================== 世界底图「横向无限平铺」（第 1 条，260930 拍板）====================
   用户要的是「往东一路拖，地图一张接一张地铺下去，永远拖不到头」——
   **无意义平铺重复**（不是「绕地球一圈回到原点」那种地理语义），且**全量**：
   底图 / 点位 / 省界 / 热力着色 / 点击命中 全部要覆盖。

   为什么不能只靠「改 center」：echarts 的投影是**绝对经度 → 像素**的纯线性映射
     （实测 260930：经度每 ±360°，画面整体横移 360/(2H)×画布宽 px，H 见下），
     所以「只改 center」不会让底图接续，必须让**底图数据本身**在经度上重复。

   实现分四层（各层互不越界）：
     底图：`world_tile.geo.json` = world 要素按 ±360·k 复制 TILE_SPAN 份（构建期生成）。
     相机：`cLng` 是记账经度，**恒归一在 [-180,180)**（见 ④ 回卷）。
     数据：点/省界/热力按经度 ±360·k 复制到**窗口覆盖的每一份**上（见 tilePts / TILE_K）。
     回卷（wrap）：echarts 的 roam 只改 center、不移 boundingCoords，所以拖过窗口半宽后
        内容就跑出画布（画面全空）。解法是在拖动中把 center **回卷整数份**（norm360）：
        因为底图/点位在 ±360 处有**逐像素相同的副本**，「center 减 360 而底图右移一份」
        在视觉上完全一致（实测），用户无感。回卷要一次 setOption（约 90 ms），
        故只在 `|center| > WRAP_DEG` 时触发 —— 一次回卷能撑住约 640 px 的继续拖动。

   参数怎么定（改动前务必先算一遍）：
     · 窗口半宽 H（度）→ boundingCoords 跨 2H，写进 echarts 的 zoom = 用户语义 × Z_SCALE；
     · 「一份(360°)铺满屏」要求 **2H / Z_SCALE = 360** ⇒ `Z_SCALE = H / 180`；
     · 回卷要求 center ∈ [-180,180) 时窗口 [center−H, center+H] ⊆ 底图覆盖范围；
       底图 N 份（奇数、以 0 为中心）覆盖 [−180N, 180N] ⇒ `180 + H ≤ 180N`。
     取 **H = 540（1.5 份）→ Z_SCALE = 3**，则 180+540 = 720 ≤ 180N ⇒ N ≥ 4；
     **取 N = 7**（±1260）留 3 份余量，保证任何 center 下窗口两侧都铺满。

   261002-61：**N 改成 5**（±900，仍留 1 份余量，720 ≤ 900 ✓）。
     理由（实测 `_doPaintList` / 帧间隔，261002-60/61）：屏幕最多只跨 118.4° 经度，
     而底图铺 7 份 = 1827 个要素，其中屏内只有约 1/3 份 —— **底图同样有 6 份是废的**。
     底图每份 ≈ 3.5 ms/份（1827→261 要素实测省 20.9 ms），7→5 省 2 份 ≈ 7 ms/帧，
     且 261002-61 的拆解显示「geo 组件重建」是 setOption 一帧里 ~100 ms 地板的主要来源，
     要素数 -29% 直接压这一块。改这一个常量 + 重跑 build_tile.py 即可，其余口径不变。
   ★ 261003-64：**N 由 5 再降到 2**。依据是帧预算归因（`_frame_budget.mjs`）：
     每帧 display list 3,867 个元素 = 1,305 个底图 compound + 2,562 个点位 path，
     JS 侧 flush 就要 10.5 ms；而 Mapbox GL / 高德同视口只有 4~9 次 draw call。
     ⚠ **`TILE_SPAN` 只能给出奇数份**：`half = TILE_SPAN >> 1`，实际份数 = `2·half+1`。
       N=2 → half=1 → **3 份**（副本在 ±360°，绝对覆盖 ±540°），不是 2 份。
       改这个数之前先按 `2·(N>>1)+1` 算出实际份数，别照字面理解。
     产出（build_tile 实测）：要素 1,305 → **783**、顶点 73,330 → **43,998**、
     描边总长 43,426° → **26,056°** —— 三项各 **−40%**。
     ⚠ N=2 时 TILE_HALF_DEG 必须 ≤360（见下面 TILE_HALF_DEG 的约束推导），两者一起改。 */
const TILE_SPAN = 2;
const TILE_DEG = 360;
/* 窗口半宽（度）：**360°（窗口跨 1 份的两倍）**。与 Z_SCALE 绑定（Z_SCALE = TILE_HALF_DEG/180）。
   ★ 261003-64 由 540（窗口跨 3 份）降到 360，与 TILE_SPAN 5→2 一起改（份数实际 5→3）。
     约束推导（**偶数 TILE_SPAN 时不能套旧注释里的 `180+H ≤ 180N`**）：
       底图 3 份 → half=1 → 副本在 ±360° → 底图绝对覆盖 ±(180+360) = ±540°；
       窗口锚在 S.cLng ∈ [-180,180)，最坏情况要求 180 + H ≤ 540 ⇒ **H ≤ 360**（取满）。
     代价：单次手势的「越界余量」从 540−59=481° 降到 360−59=301°
       （世界视野 3.29 px/度 ⇒ 约 990px 的一次滑动），超出后由 mouseup 的 wrapWindow 兜底。
     ⚠ 视觉比例尺**不受影响**：Z_SCALE = H/180 同步由 3 变 2，而 2H/Z_SCALE ≡ 360 恒成立
       （「一份铺满屏」的不变量）。改 H 必须让 Z_SCALE 跟着走，否则 ZOOM_MIN 等
       用户语义值的含义就变了 —— `_span_check.mjs` 守这条（改前后「可见经度」必须一致）。 */
const TILE_HALF_DEG = 360;
/* zoom 口径换算：echarts 侧 zoom = 用户语义 zoom × Z_SCALE（推导见上面 ）。
   由「一份铺满屏」推出 Z_SCALE = TILE_HALF_DEG / 180，改 TILE_HALF_DEG 时自动跟随。
   代码里所有「zoom」都指**「一份占屏幕的倍数」这个用户语义值**，写进 echarts 前一律 ×Z_SCALE
   （见 geoBase / setGeo）；从 `chart.getOption()` 读回时再 ÷Z_SCALE 还原。
   这样 `VIEW_DEF.z = 1.2` 仍是「世界全图」的语义，其他阈值（PROV_SHOW_ZOOM）口径不变。 */
const Z_SCALE = TILE_HALF_DEG / 180;             // 2（261003-64：随 TILE_HALF_DEG 由 3 变 2）
/* 缩放下限 / 上限（**用户语义值**，与 Z_SCALE 无关）：全站唯一来源 ——
   geoBase 的 scaleLimit、bindFollowZoom 的 LIM、setGeo 的 clamp 都引用它。
   原先这三处各写一份 0.25 / 14，改一处漏一处会让「捏合能缩到多小」与
   「echarts 自己 clamp 的下限」对不上。
   下限 3.8 是**实测标定**（390×844 竖屏，2026-10-01）：geo 是**等比 contain** 铺进容器的，
   一份世界（360°×139°）按宽度铺满后只占容器 ≈1/4 高度；zoom 每 ×k，屏幕覆盖的经纬度
   就 ÷k。实测 zoom=1.2 时屏幕覆盖 374°×584°，要让世界（纬度 139.3°）占到容器 3/4 高
   （即屏幕覆盖纬度 ≈186°），需 zoom ≈ 3.8。改容器/设备形状要重新标定（横屏可下调）。 */
const ZOOM_MIN = 3.8;
const ZOOM_MAX = 14;
/* 世界纬度范围（world 底图实测包围盒）。供 boundingCoords 与几何口径引用 */
const LAT_TOP = 83.56, LAT_BOT = -55.78;
/* 平铺底图要素名后缀（build_tile.py 生成，形如 Mongolia__t+0）。
   底图内部**必须**带后缀（否则 echarts 会把同名要素当成同一个，regions 映射会串），
   所以只在**显示层**（标签 formatter）剥掉它。 */
const TILE_SUFFIX = /__t[+-]\d+$/;
function tidyName(n){ return String(n == null ? '' : n).replace(TILE_SUFFIX, ''); }
/* 悬停标签用的名字：**省级要素一律不出名字**（261003-64 用户要求「不需要显示省的名字」）。
   底图里省名形如 `广东·省__t+0`；国名形如 `Mongolia__t+0`。判据是 PROV_KEY 在名字里的位置，
   不靠前缀猜。 */
function tidyHoverName(n){
  const s = String(n == null ? '' : n);
  if(s.indexOf(PROV_KEY) >= 0) return '';
  return tidyName(s);
}
/* 回卷阈值（度）：|center| 超过它就整数份回卷（norm360），代价是一次 setOption。
   取 120 = 180−60，留 60° 余量，保证回卷后到下一次回卷之间至少还能拖 120°。 */
const WRAP_DEG = 120;
/* 底图描边宽度（全站唯一来源）。261003-64 实测：描边是**帧成本的强敏感旋钮** ——
   底图 1,305 要素 / 边界总长 43,426°，每帧要描 28.7 万(zoom3.8)~106 万(zoom14) 设备像素，
   而整张画布只有 131 万像素。描边 0.6 → 1.6 使帧间隔 16.7 → 50.0 ms（×3）。
   故取 0.35（比 0.6 少 42% 描边面积，1px 屏上仍 ≥0.5 设备像素 @DPR2，视觉损失极小）。
   ⚠ 改这里要同步 thermalResetRegions / thermalResetProvRegions（同一件事只有一份实现）。 */
const BASE_BW = .35;
/* 归一化经度到 [-180,180)。**全站唯一的 mod 口径**，任何地方要「真经度」都调它。 */
function norm360(x){ return ((x + 180) % 360 + 360) % 360 - 180; }

/* ==================== 点位平铺的「视口裁剪」（261002-61）====================
   原先 tilePts 把每个点位铺满 TILE_SPAN（7）份 —— 854 个点 × 7 = **5978 个绘制对象**。
   而实测屏幕最多只跨 **118.4° 经度**（世界视野 zoom 3.8，390×811 竖屏）≈ 1/3 份，
   也就是说 6 份恒在屏幕外。它们照样要付两份成本（261002-60/61 实测）：
     · **option 树合并**：setGeo/render 一次 setOption 要把 5978 项并进全量 option
       → 一帧 316.6 ms，其中绘制只占 27.9 ms；
     · **roam 逐帧重算屏幕坐标**：平移一帧 133 ms，绘制只占 5.7 ms
       （echarts 的 geoRoam 会把每个 series 项重算一次 dataToPoint）。
   裁掉窗口外的副本，两项同时下降。

   窗口**恒等于底图的 boundingCoords**（都走 tileWindow）—— 一份口径，不存在两套窗口打架。
   ⚠ 窗口不能取得太窄：拖动过程中**不重跑 render**（平移交给 echarts 的 roam，只改相机），
     而相机的**绝对**经度可以一路拖到很远（实测能到 2 万+）。窗口窄了，拖出窗口的点就没了。
     故窗口取 tileWindow（±540 = 3 份），再配一条「漂移超阈值就重铺 series」的保险
     （CULL_REBUILD_DEG，见 recullIfDrifted）—— 余量远大于一屏（59°）。

   判据（261002-61 复测）：绘制对象 5978 → 2562（-57%）。 */
const CULL_REBUILD_DEG = 240;
/* 点位裁剪窗口半宽（度）——**故意与底图窗口（TILE_HALF_DEG）解耦**。
   ★ 261003-64 修一处真 bug：原来 `cullWindow()` 直接返回 `tileWindow()`，两者绑死。
     把 TILE_HALF_DEG 由 540 降到 360 后，点位窗口跟着变成 ±360，而
     `CULL_REBUILD_DEG + 180 = 420 > 360` 这个不变式被破坏 ——
     相机在「离上次重铺点 180°~240°」这一段里，某个点的最近副本会被裁掉
     （实测最远副本距离 197.5°，即那个点在屏上却没画）。`_cull_check` 抓到。

   不变式（改任何一个都要重验）：
       **CULL_HALF_DEG ≥ CULL_REBUILD_DEG + 180**
   推导：任一相机位置 C 与上次重铺点 P 的距离 ≤ CULL_REBUILD_DEG；任一点的最���副本
   距 C ≤ 180；故该副本距 P ≤ CULL_REBUILD_DEG + 180，必须落在以 P 为心的窗口内。
   取 420 = 240 + 180，一屏（±59°）之外的余量仍有 161°。

   ⚠ 别为了少画副本把窗口收窄：收窄会让 `recullIfDrifted` 更频繁触发，而
   **每次重铺 series 实测 114.8 ms**（`_cull_cost.mjs`）—— 那才是真卡。
   少一档副本省约 2 ms，多一次重铺多付 115 ms。 */
const CULL_HALF_DEG = 420;

/* 点径随缩放变（261002-61）。
   原先恒定 9px，实测被邻点盖住的比例：世界视野 **90.1%**、中国视野 **96.4%**
   （最近邻距离中位数只有 4.6 / 5.5 px，而点直径 9px）。
   各点径下的被盖率实测（两心距 < 直径即互盖）：
     4px 43.7% | 5px 51.7% | 6px 59.6% | 7px 68.2% | 8px 80.8% | 9px 90.1%（世界视野）
   → 世界视野取 5px，被盖率砍到约一半；放大时点也该更大
     （原先放大到 zoom 14 仍是 9px，与底图不成比例，观感上「越放大点越稀疏」）。 */
const PT_SIZE_MIN = 5, PT_SIZE_MAX = 12;
function ptSize(){
  const k0 = cam();
  const z = k0.z;
  /* 取不到相机（个股页小图首帧 / chart 还没建）→ 沿用旧的 9px，别让点突然变小。 */
  if(z == null) return 9;
  const t = (z - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN);
  return Math.round(PT_SIZE_MIN + Math.max(0, Math.min(1, t)) * (PT_SIZE_MAX - PT_SIZE_MIN));
}

/* 上次铺点时相机的**绝对**经度（不是 norm360 后的记账值 —— 记账值会丢「第几份」，
   而漂移是拿绝对坐标量的）。null = 还没铺过（首次 render 会落上）。 */
let _cullAt = null;
function cullWindow(){
  const c = (_cullAt == null) ? S.cLng : _cullAt;
  /* 半宽用 CULL_HALF_DEG（不是 TILE_HALF_DEG）—— 见 CULL_HALF_DEG 处的不可变式。
     底图窗口窄一点没关系（相机始终在窗口中心附近），点位窗口必须能覆盖
     「重铺点 → 相机」的漂移 + 半个副本间距，否则屏上的点会被裁掉。 */
  return [c - CULL_HALF_DEG, c + CULL_HALF_DEG];
}
/* 平铺窗口：以 cLng 为中心、跨 2×TILE_HALF_DEG（1.5 份半宽 → 共 3 份）。
   返回 [minLng, maxLng]，供 boundingCoords 与「该画哪几份」判定共用。
   窗口跨 1080° 与 zoom（×Z_SCALE=3 后）配合，使**一份世界地图正好铺满屏幕**。 */
function tileWindow(cLng){
  return [cLng - TILE_HALF_DEG, cLng + TILE_HALF_DEG];
}
/* 把一个经度「铺」到离目标 c 最近的那一份上：p 的原始值在 [-180,180)，
   副本可取 p + 360·k。返回落在 (c-180, c+180] 内的那一个。 */
function tileLng(p, c){ return p + TILE_DEG * Math.round((c - p) / TILE_DEG); }

/* 用户输入进 innerHTML 前的转义，避免搜索词里的 < > & " 破坏结构或注入 */
function escHtml(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

let DATA, chart, MAPS = {};
let PACK = {};                // 底图 + 利润模型（与「哪一层」无关，只装一次，切层不重取）
const _layerCache = {};       // 层 key -> 已归一化好的 DATA（切层复用，不重复请求）
let _lastScope = null, _lastFocus = null;   // 相机保持：记住上次 scope / focus，判断本次是否切视图 / 切公司
let S = {
  layer:'hard',         // hard | power —— 数据层（切层换整份 DATA 与分类表）
  /* scope 语义（260930 起）：**不再换数据，只挪镜头**。
     原先 world/china 是两张不同底图（world.geo.json / china.geo.json），切视图 = 换底图 + 换数据子集；
     现在是**一张世界底图**，world → china 只做一次 center/zoom 平滑补间（「从地球转进中国」）。
     于是境内 / 境外点位始终都在图上，只是镜头远近不同。 */
  scope:'world',        // world | china
  cate:new Set(),       // 显示中的分类（开关在 map_kit 的分类面板里）；**默认空 = 不画点**
  groups:new Set(),     // 细分（同上）
  /* 用户是否在**本层**动过分类筛选（按层存：{} / {hard:true, power:false}）。
     没动过 → 每次进本层都保持「0 点位」的干净态；动过 → 保留他的选择。
     260930 引入：默认不画点，但也不能把用户刚选好的筛选在切层回来时清掉。 */
  _picked:{},
  kw:'',
  sel:null,
  focus:null,           // 聚焦的公司代码：地图上只高亮其关联点位（深链 #f= 设置）
  /* 第 1 条（横向无限平铺）的**记账经度**：不受限、可任意大，代表「眼下在第几份底图」。
     它就是 `geo.center[0]` 本身（**不做 norm360**）—— 实测 echarts 接受任意大的 center
     （拖到 2 万+ 也正常），而归一会丢掉「在第几份」这个唯一有用的信息。
     全站真值只有这一个：用户拖拽时由 syncCLng() 采纳 echarts 报回的绝对值，
     程序性改镜头时由 setGeo() 用 tileLng() 把规范经度贴到当前份上。 */
  cLng:40,              // 与 VIEW_DEF.world.c[0] 同初值，避免首帧跳一下
};

/* 当前层的分类表（切层后由 setLayer 换掉） */
function cats(){ return CATES; }
/** 当前层里「在图上可见」的点位数组（**不分视野**：世界底图上境内境外都在）。 */
function allPoints(){ return DATA.points || []; }

/* 两个视野的镜头（**只是 center+zoom，不换底图**）。数值同样是 390×844 实测标定：
   world：[40,22]/3.8 ≈ 世界最小视野（经度约 118°、纬度约 186°，世界地图占容器 ≈3/4 高）
          —— 竖屏装不下整个地球，这是几何必然，故「世界」=「缩到最小」，不追求看到全球；
   china：[104,35]/7.2 ≈ 镜头压到中国本土（经度约 62°，正好把中国框满宽度）。 */
const VIEW_DEF = {
  world:{c:[40, 22], z:3.8},
  china:{c:[104, 35], z:7.2},
};

/* 视野判据：点位是境内还是境外。硬资产数据自带 m.scope（cn/ov）；
   电力数据没有 scope 字段（全境内在图），按经度粗略兜底 —— 但这会误判，
   故只用于计数文案，不用于过滤数据。 */
function inChina(m){ return m.scope ? m.scope === 'cn' : (m.lng > 73 && m.lng < 136 && m.lat > 3 && m.lat < 54); }
function inOverseas(m){ return !inChina(m); }

/* ---------------- 两种装载模式：同一份脚本、同一套视图函数 ----------------
   **地图页**（默认）：资产地图/index.html —— 全屏地图 + 浮动层（app/map_kit.py）。
      外壳只有「页面条 + #mapwrap」两块，分类面板 / 公司面板 / 点位卡片 / 聚焦条 / 按钮组
      全部是 map_kit 注入的浮动层；完整档案走 #drawer（全屏覆盖层）。
      顶栏还有「图层」段（硬资产 / 电力）：两层点位画在同一张世界底图上，切层只换数据。
   **个股页**：个股研究/<代码>.html —— 页面在引入本脚本**之前**设 window.MP_PAGE_COMP='<代码>'，
      可选 window.MP_PAGE_LAYER='hard'|'power' 指明这家公司属于哪一层（缺省 hard）。
      本脚本改为只渲染「这一家的公司研究视图 + 本公司资产视图」，不建外壳、不读地址栏。

   为什么这么设计：
   · 260922-12（用户反馈）：原先个股页是给地图页套一层 iframe（?embed=1&comp=X），结果是
     **同一只股票有两个页** —— 个股页只有概况 + 一张（被压成 180px 高、显示不全的）地图，
     而「营收 / 归母净利 / 利润模型 / 旗下矿区」这些真正的研究内容只存在于地图抽屉里。
     现在两处**共用同一批函数**（compHeadHtml / compBodyHtml / mineBodyHtml / buildSeries /
     fitFocusView / drawQuarterly …），区别只在「装进哪个容器」。
   · 260930（用户反馈「资产地图和个股解耦的逻辑混乱且不好用」）：地图侧的那个公司抽屉
     整个删除。**公司内容只有一个入口** —— 那家公司自己的个股页（goCompany）；
     地图上点公司只会跳过去，不再在地图里开第二个公司页。
     地图自身的界面则统一到 app/map_kit.py 一份（原先把矿种筛选写了 3 遍、公司列表写了 3 遍）。

   数据同源：个股页读的 data.json / *.geo.json / 利润模型 json 与地图页是同一份
     （由 个股研究/rt/pack.js 以 <script> 载入，见 build_company_pages.py）。 */
const PAGE_COMP = window.MP_PAGE_COMP || '';
const PAGE_LAYER = window.MP_PAGE_LAYER || 'hard';   // 个股页所属图层（硬资产 / 电力）

/* ---------------- 小型图表渲染 ---------------- */
/* 配色统一统一到 app/build_content.py 的 MAP_PALETTE。D 本身就是「注入的运行时调色板，
   离线单开回退内置字面量」（见文件首行），故直接取 D 的角色即可，不必再判一次 MP_MAP_THEME。
   原先写成 `MP_MAP_THEME ? …dark.pal : ['D.accent', …]` —— 两边其实同源，且兜底那串是**伪色值**。 */
const PAL = D.pal;
/* GEO.sea 是画布底（海/陆地之外的底），GEO.area 是陆地。geo 组件不再透明：
   render() 里 chart.setOption({backgroundColor: GEO.sea}) —— 只画陆地不画海的话，
   陆地色一旦接近页面底色就整块消失（260922-11 的根因）。 */
const GEO = D.geo;

/* 地图视图平滑过渡：用 rAF 把 center/zoom 补间过去（默认 300ms，easeInOutCubic）。
   zoom 按「几何插值」而非线性插值，视觉上更接近推拉镜头的直觉。
   散点系列已关闭更新动画，所以补间期间点与底图严格同步，不会一前一后。 */
let _geoTween = 0;
/* 补间的**目标相机**（center 绝对值 + 用户语义 zoom）。补间在飞时地址栏必须写它，
   不能写 chart.getOption() 的实时值 —— 那是中间帧。261002 实测：切中国后 hash 里
   留下 `z=5.93&c=84.59,31.06`（`40+(104-40)×0.694`、`3.8×(7.2/3.8)^0.694`，e≈0.694
   的那一帧），刷新后页面就永久停在半路 —— 而同一份代码在 file:// 下恰好让 280ms 去抖
   落在补间尾部，所以这是一处**被探针基址迁移暴露出来的老竞态**，不是迁移引入的。
   非补间时为 null → syncHash 回落到实时值（那时两者本来就相等）。 */
let _geoGoal = null;
function cancelGeoTween(){
  if(_geoTween){ cancelAnimationFrame(_geoTween); _geoTween = 0; }
  _geoGoal = null;                                   // 补间被打断 → 目标作废，改由实时值说话
}
function animateGeoTo(c1, z1, dur){
  if(!chart) return;
  cancelGeoTween();                                  // 连续点击时打断上一次补间
  /* 起点相机走 cam()：补间刚被上面打断（_geoGoal 已清），所以这里拿到的必是实时值。 */
  const k0 = cam();
  const c0 = k0.c;
  const z0 = (k0.z == null) ? 1 : k0.z;
  // 自适应时长（item 5）：跨度小≈220ms、跨度大≈520ms，替代固定 300ms。调用方未显式传 dur 时按跳跃距离算。
  if(!dur){
    const dC = Math.hypot(c1[0] - c0[0], (c1[1] - c0[1]) * 1.4);
    const dZ = Math.abs(Math.log(Math.max(z1, 1e-6) / Math.max(z0, 1e-6)));
    dur = Math.max(220, Math.min(520, 230 + (dC + dZ * 40) * 9));
  }
  const snap = () => setGeo({center:c1, zoom:z1});
  // 起点缺失、或几乎没有变化 → 直接落位，不做无意义的补间
  if(!c0 || !isFinite(c0[0]) || !isFinite(c0[1])){ snap(); return; }
  if(Math.abs(z1 - z0) < 1e-3 && Math.abs(c1[0] - c0[0]) < 1e-5 && Math.abs(c1[1] - c0[1]) < 1e-5){ snap(); return; }
  // 起点取「第一帧自己的时间戳」而不是 performance.now()：
  // rAF 时间戳与 performance.now() 可能差出几百毫秒（无头/节流环境尤甚），
  // 拿后者当起点会让 p 从负数开始 —— p 一旦为负，ease 返回大负数，
  // Math.pow(ratio, e) 会瞬间炸到 1e50（实测踩过）。
  let t0 = 0;
  const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  /* 目标相机先落账（见 _geoGoal 注释）：补间期间任何一处 syncHash 触发，
     写进地址栏的都是这个目标值。zoom 用与 setGeo 同一对常量夹一次
     （ZOOM_MIN / ZOOM_MAX 是唯一权威，就在上面定义）—— 保证「写进 URL 的」
     与「补间最终真正落位的」是同一个数。 */
  _geoGoal = { c:[c1[0], c1[1]], z: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z1)) };
  const step = now => {
    if(!t0) t0 = now;
    const p = Math.max(0, Math.min(1, (now - t0) / dur)), e = ease(p);
    setGeo({
      center:[c0[0] + (c1[0] - c0[0]) * e, c0[1] + (c1[1] - c0[1]) * e],
      zoom: z0 * Math.pow(z1 / z0, e),               // 几何插值
    });
    if(p < 1){ _geoTween = requestAnimationFrame(step); return; }
    /* 补间收尾：目标已兑现 → 撤掉目标账、改由实时值说话（此刻两者相等），
       并在这里补一次地址栏同步。中途那几次写的都是目标值，这一次是按**已落位的真值**
       再确认一遍 —— 若 setGeo 夹过 zoom，这一笔才是最终正确值。 */
    _geoTween = 0; _geoGoal = null; syncHash();
  };
  _geoTween = requestAnimationFrame(step);
}

/* ============================================================
   运行期状态 store（261002-44 A7）

   治的是**「旧句柄」**这一类错：`DATA` / `CATES` / `CMAP` 都是 `let`，切层时被
   `applyLayer()` **整体换对象**，而窗口上原先挂的是「首帧那一份」（`window.DATA = DATA`）。
   于是探针（和任何外部代码）拿到的永远是启动层的数据 ——
   261001-17 实测：切到电力层后 `window.DATA.points` 仍取出硬资产的「西岭金矿」，
   看着像小卡取数错，其实是句柄过期；同类假 FAIL 一共报过 7 条。
   上一轮的做法是「再挂一个 `window.points()` 让人记得换」——**靠人记得的约定不是修复**。

   现在把窗口上那两个名字改成**取值器**（活引用），并把所有取值收进本 store：
   无论读 `window.DATA.points`、`window.CATES[0]` 还是 `MP.store.data()`，拿到的
   都是**当前层**。订阅与版本号（`rev`）另给一层：状态整体换了一批时报一次，
   探针可以据此判断「我这一份读数是不是已经过期」。
   ============================================================ */
let _storeRev = 0;
const _storeSubs = new Set();
const MP_STORE = {
  get rev(){ return _storeRev; },
  /* 实时取值面（不是快照）—— 窗口上的 window.DATA / window.CATES 直接转发到这里 */
  data:   () => DATA,
  cates:  () => CATES,
  cmap:   () => CMAP,
  points: () => DATA.points,
  cam,
  sub(f){ _storeSubs.add(f); return () => _storeSubs.delete(f); },
  /* 唯一的提交点：所有「换了一整份状态」的地方（applyLayer 落数据 / render 重算 /
     切视野）在这里调一次。订阅方抛错不影响其它订阅方，也不影响调用方。 */
  commit(what){
    _storeRev++;
    for(const f of _storeSubs){ try{ f(what, _storeRev); }catch(e){} }
  },
};

/* 相机（中心 / 缩放）的**唯一读法**。
   以前各处直接读 `chart.getOption().geo[0]` —— 那是「问 echarts 要回它自己的状态」，
   于是同一件事有三个各自为政的读数：记账经度 `S.cLng`、地址栏里的 `z`、补间目标
   `_geoGoal`。收成一个函数后，「补间期间该读哪个值」只在这里决定一次（读目标值，
   理由见 `_geoGoal` 注释）—— 这也让上面那个 hash 写中间帧的老竞态不可能再靠
   某个调用点「恰好读对了」而存活。
   口径：z 一律**用户语义值**（÷Z_SCALE），与 setGeo / VIEW_DEF / URL 同一口径；
        c 是**绝对值经度**（不归一，与 echarts 的 center 同坐标系，见 setGeo）。
   取不到时给 null（不是兜底默认视野）—— 各调用方原本的兜底各不相同
   （animateGeoTo 用 1、syncHash 用 DEF_CAM、setGeo 用 VIEW_DEF），
   在这里替它们决定会把那些差异悄悄改掉，所以只在**读到什么**上收口。 */
function cam(){
  if(_geoGoal) return { c:[_geoGoal.c[0], _geoGoal.c[1]], z:_geoGoal.z, moving:true };
  /* 261002-61：**不再走 chart.getOption()**，改从 geo 组件直读。
     实测（`_cam_cost.mjs`，390×844）：
       chart.getOption()        0 点位  0.58 ms ／ 2562 个 series 项 **19.04 ms**
       getOption().geo[0]                （一样贵，21.63 ms —— 它先克隆整棵树才取子树）
       直读 geo 组件                     **0.003 ms**
     而**拖动中每帧要读两次**（syncCLng + recullIfDrifted 各一次）→ 每帧白付约 37 ms，
     比一帧真正的绘制（5.6 ms）高一个数量级 —— 这才是「平移不跟手」的大头。
     口径不变：z 仍是用户语义值（÷Z_SCALE），c 仍是绝对经度。

     ⚠ 这里读的是 echarts 的私有字段（`coordinateSystem._center` / `._zoom`）。
       261002-52 的教训是「别把内部字段当结构性保证」→ 故：
         ① 读不到（版本变了 / 结构变了）时**退回 getOption**，行为不退化；
         ② `_cam_check.mjs` 逐场景（初始 / setGeo / roam 平移 / roam 缩放 / 补间 / render）
            对账两种读法必须一致，不一致就说明该换读法了。 */
  let z = null, c = null;
  try{
    const g = chart && chart.getModel && chart.getModel().getComponent('geo', 0);
    const cs = g && g.coordinateSystem;
    if(cs && typeof cs._zoom === 'number' && cs._zoom > 0) z = cs._zoom / Z_SCALE;
    if(cs && cs._center && isFinite(cs._center[0]) && isFinite(cs._center[1]))
      c = [cs._center[0], cs._center[1]];
  }catch(e){ /* 结构不符 → 落到下面的 getOption 兜底 */ }
  if(z == null || c == null){
    const g = (((chart && chart.getOption()) || {}).geo || [])[0] || {};
    if(z == null) z = (typeof g.zoom === 'number' && g.zoom > 0) ? g.zoom / Z_SCALE : null;
    if(c == null) c = (g.center && isFinite(g.center[0]) && isFinite(g.center[1]))
          ? [g.center[0], g.center[1]] : null;
  }
  return { c, z, moving:false };
}

/* 聚焦视图自适应：覆盖该公司在「当前视图」的全部基地 + 四周留白 + 抽屉展开时整体左移。
   animate=true 走 300ms 补间；拖动 / 改宽等连续场景传 false 直接落位，避免补间互相打架。
   做法（实测驱动，不写死公式）：
   地理包围盒 → 施加「最小视野」与留白系数 → 取 4 个角点；
   在「当前状态」实测一次像素尺寸，解析算出目标 zoom；
   把平移折算成 geo.center 偏移量，一次 setOption 落位（没有中间态）。 */
function fitFocusView(animate, pts){
  if(!chart) return;
  let ms;
  if(pts && pts.length){
    ms = pts;                                        // 搜索：直接覆盖传入的点位（已属当前视图）
  } else {
    if(!S.focus || !DATA.comp[S.focus]) return;
    const isCn = S.scope === 'china';
    const sk = isCn ? 'cn' : 'ov';
    // 同样只取本视图的矿区；本视图没有该公司矿区时保持默认视图
    //（顶部聚焦提示条会提示切换视图），不拿另一视图的坐标来定位。
    // 注意：此处必须用外层 ms（let ms），不能用 const 重新声明，否则会遮蔽外层变量、
    // 导致下方 line 119 的 ms.map 读到 undefined 而崩溃。
    ms = DATA.comp[S.focus].mines.filter(m => m.scope === sk);
    if(!ms.length) return;
  }

  const mapEl = document.getElementById('map');
  if(!mapEl) return;
  const W = mapEl.clientWidth  || (mapEl.getBoundingClientRect().width  || 0);
  const H = mapEl.clientHeight || (mapEl.getBoundingClientRect().height || 0);
  if(!W || !H) return;

  /* 260930 起完整档案层是**全屏覆盖层**，不再把地图挤窄，所以这里不再扣抽屉宽度
     （原实现要按右侧 440px 抽屉算 availW，并把它折成中心偏移）。 */
  const PADX = 48, PADY = 56;                    // 可视区四周留白（防浮动面板/提示条压住）
  const availW = Math.max(140, W - PADX);
  const availH = Math.max(140, H - PADY);

  // ① 地理包围盒 + 最小视野 + 留白
  /* 经度必须**先贴到当前记账份**再取包围盒：一家公司的矿区若横跨 ±180°
     （如 175°E 与 −175°E），用原始值算出来的中心在 0°（地球另一边），
     镜头会被拉到一片空海。render() 里同一件事已用 tileLng 处理（见那里的注释），这里对齐口径。 */
  const lngs = ms.map(m => tileLng(m.lng, S.cLng)), lats = ms.map(m => m.lat);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const MIN_LNG = 10, MIN_LAT = 8;               // 基地很集中时保证的最小视野（度），避免放大到只剩一个点
  const cLng = (minLng + maxLng) / 2, cLat = (minLat + maxLat) / 2;
  const sLng = Math.max(maxLng - minLng, MIN_LNG) * 1.25;   // 1.25 = 四周留白
  const sLat = Math.max(maxLat - minLat, MIN_LAT) * 1.25;
  const box = [
    [cLng - sLng / 2, cLat - sLat / 2], [cLng + sLng / 2, cLat + sLat / 2],
    [cLng - sLng / 2, cLat + sLat / 2], [cLng + sLng / 2, cLat - sLat / 2],
  ];

  const measure = () => {
    let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity, ok = false;
    for(const p of box){
      let q = null;
      try{ q = chart.convertToPixel({geoIndex: 0}, p); }catch(e){}
      if(!q || !isFinite(q[0]) || !isFinite(q[1])) continue;
      ok = true;
      if(q[0] < mnx) mnx = q[0]; if(q[0] > mxx) mxx = q[0];
      if(q[1] < mny) mny = q[1]; if(q[1] > mxy) mxy = q[1];
    }
    return ok ? {mnx, mxx, mny, mxy} : null;
  };

  // ② 只在「当前状态」实测一次，再解析算出目标 zoom。
  //    每一步都是一次可见跳变，叠加起来就是「晃眼」。
  const b = measure();
  if(!b) return;
  const k0 = cam();
  const z0 = (k0.z == null) ? 1 : k0.z;
  const bw0 = Math.max(8, b.mxx - b.mnx), bh0 = Math.max(8, b.mxy - b.mny);
  let nz = z0 * Math.min(availW / bw0, availH / bh0);
  // 上限 9（比 ZOOM_MAX=14 保守：聚焦时宁可视野略大，也别放大到「什么都看不到」）；
  // 与缩放下限冲突，且 zoom<1 时底图会在地图上缩成一条（用户截图反馈），故一并夹到 ZOOM_MIN。
  nz = Math.max(ZOOM_MIN, Math.min(9, nz));
  const r  = nz / z0;                                    // 相对当前的缩放倍率
  const Sx = (bw0 / sLng) * r, Sy = (bh0 / sLat) * r;    // 「目标状态」下的每度像素
  if(!(Sx > 0.01) || !(Sy > 0.01)) return;

  // ③ 让包围盒中心 (cLng,cLat) 正好落在可视区中心 (tx,ty)：
  //    x 随经度递增、y 随纬度递减 ⇒ 纬度方向符号相反。
  //    平移写进 geo.center（不用 geoRoam），resize 后可与底图精确重建、不会分离。
  const tx = W / 2, ty = H / 2;
  const c1 = [cLng - (tx - W / 2) / Sx, cLat + (ty - H / 2) / Sy];
  if(animate) animateGeoTo(c1, nz);
  else setGeo({center:c1, zoom:nz});
}

/* 产量趋势图：按产品分组 */
/* 复用或重建容器上的实例，避免重复 init 造成实例堆积 */
function chartOf(el, h){
  const old = echarts.getInstanceByDom(el);
  if(old) { try{ old.dispose(); }catch(e){} }
  el.style.display = 'block';
  el.style.height = h + 'px';
  return echarts.init(el, null, buildOpt());
}

/* 抽屉 / 窗口尺寸变化后按真实宽度重绘所有图表，避免图例压住曲线 */
function relayoutAll(){
  try{ chart.resize(); }catch(e){}
  try{ _mineCharts.forEach(c=>{ if(c && c.resize) c.resize(); }); }catch(e){}
  ['compChart','ylChart','ylSens'].forEach(id=>{
    const e = document.getElementById(id); if(!e) return;
    const c = echarts.getInstanceByDom(e); if(c){ try{ c.resize(); }catch(err){} }
  });
}

/* rAF 节流（item 3）：拖动侧栏/抽屉改宽或窗口缩放时，mousemove/resize 事件极密，
   每帧都 chart.resize() 全部图表会卡顿。攒一帧再重绘，体验更顺。 */
let _relayoutRaf = 0;
function relayoutThrottled(){
  if(_relayoutRaf) return;
  _relayoutRaf = requestAnimationFrame(()=>{
    _relayoutRaf = 0;
    relayoutAll();
    if(S.focus) fitFocusView(false);                  // 聚焦时按新尺寸重算，直接落位避免与补间打架
  });
}

/* 尺寸同步：盯住 #map 自身的 ResizeObserver，容器尺寸真的变了才重绘。
   为什么不能只靠 window.resize —— 移动端「收起地图」改的是 #mapwrap 的 height（带 .2s 过渡），
   而 body.map-off 一摘掉，min-height:160 立刻生效、height 还停在补间起点；
   此时手工派发一次 resize，echarts 读到的就是过渡中间值（实测把画布永久锁成半高，
   下方露出一大片空白）。RO 在过渡的每一帧都触发，最后一帧自然停在真实尺寸上，
   顺带覆盖注入层字号改写、旋屏、键盘弹出等一切「容器自己变了」的情形。 */
function bindSizeSync(){
  const m = document.getElementById('map');
  if(!m || !window.ResizeObserver || m.__mpRO) return;
  m.__mpRO = new ResizeObserver(()=> relayoutThrottled());
  m.__mpRO.observe(m);
}

/* 图例随容器宽度自动换行时，把 grid.top 下推，使曲线不被图例遮挡
   （单行时维持原 top，两行及以上才下移）。四处折线/柱状图共用。 */
function fitLegendTop(ch, base){
  try{
    const lmod = ch.getModel().getComponent('legend');
    if(!lmod) return;
    const lh = (lmod.getLayout() && lmod.getLayout().height) || 22;
    ch.setOption({grid:{top: Math.max(base, 8 + lh + 6)}});
  }catch(e){}
}

/* syncMapAspect / initResizers / shiftMapForDrawer 260930 删除：
   syncMapAspect 是给「竖屏固定 38vh 的地图容器」算投影比例的，现在地图全屏吃满剩余高度；
   initResizers 拖的是侧栏与右侧抽屉的宽度，两者都不存在了；
   shiftMapForDrawer 只是 fitFocusView 的转发，抽屉不再挤占地图宽度，无需重算取景。 */

/* 侧栏右边缘 / 抽屉左边缘 宽度拖拽 260930 整块删除：侧栏与右侧抽屉都没了，
   地图全屏、没有可拖的分栏。 */

function drawOutput(el, out){
  if(!out || !out.length){ el.style.display='none'; return null; }
  const ch = chartOf(el, 190);
  // 按产品（或口径）分组
  const groups = {};
  out.forEach(d => {
    const key = d.p || d.who || '产量';
    (groups[key] = groups[key] || {u:d.u, b:d.b, pts:[]}).pts.push(d);
  });
  const years = [...new Set(out.map(d=>d.y))].sort();
  const keys = Object.keys(groups);
  // 有效数据点不足 3 个时折线画不成趋势，改用柱状图，保证单点也可见
  const nValid = out.filter(d => d.v != null).length;
  const useBar = nValid < 3;
  const series = keys.map((k,i)=>({
    name: k,
    type: useBar ? 'bar' : 'line',
    smooth: !useBar, symbolSize:7,
    barMaxWidth: useBar ? 34 : undefined,
    itemStyle: useBar
      ? {color:PAL[i%PAL.length], borderRadius:[3,3,0,0]}
      : {color:PAL[i%PAL.length]},
    lineStyle: useBar ? undefined : {width:2.2, color:PAL[i%PAL.length]},
    data: years.map(y=>{
      const hit = groups[k].pts.find(p=>p.y===y);
      return (hit && hit.v!=null) ? hit.v : null;
    }),
    connectNulls:false, z:5,
  }));
  if(useBar){
    // 单点或双点：柱状图更直观，并在副标题说明数据稀疏
  }
  ch.setOption({
    title: nValid < 2 ? {
      text: '仅 1 年有公开产量数据，无法呈现趋势',
      left:'center', top:6, textStyle:{color:D.tx3, fontSize:10.5, fontWeight:'normal'},
    } : undefined,
    grid:{left:52, right:16, top: nValid < 2 ? 34 : 30, bottom:26},
    tooltip:{trigger:'axis', backgroundColor:D.tipBg, borderColor:D.line,
             textStyle:{color:D.tx, fontSize:11},
             formatter: p => {
               let s = p[0].axisValue + ' 年';
               p.forEach(x=>{ if(x.value!=null){
                 const g = groups[x.seriesName];
                 s += `<br/>${x.marker}${x.seriesName}：<b>${x.value}</b> ${g?g.u:''}`;
               }});
               return s;
             }},
    legend:{ top:2, textStyle:{color:D.tx2, fontSize:10.5}, itemWidth:12, itemHeight:8,
             data:keys },
    xAxis:{ type:'category', data:years, axisLine:{lineStyle:{color:D.line}},
            axisLabel:{color:D.tx3, fontSize:10.5},
            axisTick:{show:false} },
    yAxis:{ type:'value', axisLine:{show:false}, axisTick:{show:false},
            axisLabel:{color:D.tx3, fontSize:10},
            splitLine:{lineStyle:{color:D.lineSoft}} },
    series,
  });
  setTimeout(()=>fitLegendTop(ch, 30), 60);
  return ch;
}

/* ---------------- 分季度柱状图 ----------------
   每年 N 根小柱子（A 股四季 / 港股半年），支持：
   - 指标切换（营业收入 / 归母净利润）
   - dataZoom 拖动条缩放时间段
   - hover 同时显示「年度合计」与「逐季拆分」

   数据已在 Python 侧做累计→单季差分（见 build_quarter.py），
   前端直接取 qs[q].rev 即为该季度单季值，不可再累加。          */
const QREV_COL = (window.MP_MAP_THEME ? window.MP_MAP_THEME.dark.qrev
                : ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd']);
const QNP_COL  = (window.MP_MAP_THEME ? window.MP_MAP_THEME.dark.qnp
                : ['#b45309', '#d97706', D.amber, D.warn]);
const QFMT = v => v == null ? '—'
  : (Math.abs(v) >= 10000 ? v.toLocaleString('zh-CN', {maximumFractionDigits: 0})
                          : v.toLocaleString('zh-CN', {maximumFractionDigits: 2}));

/* 默认展示最近 10 年（数据已备足 11 年，2016—2026）。
   260930 用户要求：默认看最近 10 年，**不足 10 年就显示全部** —— 覆盖到就整段铺满，
   拖动条仍可拉到全区间。抽成常量是因为 drawQuarterly 与 drawFin 共用同一条默认窗口规则。
   用户还要求：只能用拖动条调整区间，不要滚轮缩放。            */
const YEAR_DEFAULT_SPAN = 10;

function drawQuarterly(el, qy, unit, cur, metric){
  if(!qy || !qy.s || !qy.s.length){ el.style.display = 'none'; return null; }
  metric = metric || 'rev';
  const ch = chartOf(el, 276);
  const isH   = qy.freq === 'H';
  const rows  = qy.s;
  const years = rows.map(r => r.y);
  const byYear = {};
  rows.forEach(r => byYear[r.y] = r);

  /* 段序列按「实际覆盖范围」动态生成，而不是写死 Q1..Q4。
     跨期累计的段标签形如 Q1-Q3、Q3-Q4，标签即口径。 */
  const segOrder = [];
  rows.forEach(r => r.qs.forEach(x => {
    if(!segOrder.includes(x.lbl)) segOrder.push(x.lbl);
  }));
  // 让同年度的段按时间先后排列：先按起点季度，再按终点季度
  const QIDX = {Q1:1, Q2:2, Q3:3, Q4:4};
  const rank = lbl => {
    if(lbl === 'H1') return 1.5;
    if(lbl === 'H2') return 3.5;
    if(lbl === '全年') return 4;
    const m = lbl.match(/Q(\d)(?:-Q(\d))?/);
    if(!m) return 9;
    return m[2] ? (QIDX['Q'+m[1]] + QIDX['Q'+m[2]]) / 2 : QIDX['Q'+m[1]];
  };
  segOrder.sort((a, b) => rank(a) - rank(b));
  const segs = segOrder;
  const COLORS = (window.MP_MAP_THEME ? window.MP_MAP_THEME.dark.colors
                 : ['#2563eb','#3b82f6','#60a5fa','#93c5fd','#1d4ed8','#1e40af']);
  const NPS    = (window.MP_MAP_THEME ? window.MP_MAP_THEME.dark.nps
                 : ['#b45309','#d97706',D.amber,D.warn,'#92400e','#78350f']);
  const COL   = metric === 'np' ? NPS : COLORS;
  const mLbl = metric === 'np' ? '归母净利润' : '营业收入';

  /* 默认展示最近 10 年：算出 slider 的起始百分比。
     数据共 N 年（已备足 11 年），默认把窗口右端对齐到最后一年，
     左端回退 YEAR_DEFAULT_SPAN 年；不足 10 年则整段铺满（zStart=0）。
     拖动条仍可拉到全区间。 */
  const zStart = years.length <= YEAR_DEFAULT_SPAN
    ? 0
    : Math.round((years.length - YEAR_DEFAULT_SPAN) / (years.length - 1) * 100);

  const series = segs.map((sg, i) => ({
    name: sg, type: 'bar', stack: null, barMaxWidth: 26,
    itemStyle: {color: COL[i % COL.length], borderRadius: [2, 2, 0, 0]},
    emphasis: {itemStyle: {color: metric === 'np' ? D.warn : '#93c5fd'}},
    data: years.map(y => {
      const r = byYear[y];
      if(!r) return null;
      const hit = r.qs.find(x => x.lbl === sg);
      return hit ? hit[metric] : null;
    }),
  }));

  ch.setOption({
    animationDuration: 320,
    grid: {left: 62, right: 18, top: 26, bottom: 62},
    tooltip: {
      trigger: 'axis', axisPointer: {type: 'shadow'},
      backgroundColor: D.tipBg2, borderColor: D.line,
      textStyle: {color: D.tx, fontSize: 11.5},
      confine: true,
      formatter: p => {
        const y = +p[0].axisValue;
        const r = byYear[y];
        if(!r) return '';
        const tot = r[metric];
        const complete = r.complete;
        let s = `<div style="font-weight:700;margin-bottom:5px">${y} 年`
              + (complete ? '' : '　<span style="color:D.warn;font-weight:400">年内累计至今</span>')
              + `</div>`;
        s += `<div style="color:${D.tx2};margin-bottom:4px">${mLbl}　`
           + `<b style="color:${D.tx};font-size:12.5px">${QFMT(tot)}</b> ${unit}</div>`;
        s += `<div style="border-top:1px solid ${D.line};margin:5px 0 4px;padding-top:4px">`;
        if(r.conflict){
          const why = r.creason === 'nonmono'
            ? '各报告期累计值非单调递增（数据源本身有误，如某季累计数小于上季）'
            : '各期披露值与年报口径冲突（常见于追溯重述、并购并表范围变化）';
          s += `<div style="color:${D.warn};line-height:1.7;font-size:10.5px">
            ${why}。已放弃分季拆分，仅显示全年数。</div>`;
        }
        let anySeg = false;
        p.forEach(x => {
          if(x.value == null) return;
          anySeg = true;
          const seg = (r.qs || []).find(z => z.lbl === x.seriesName);
          const isCum = seg && seg.cum;
          const pct = (tot && tot > 0 && !isCum)
            ? `　<span style="color:${D.tx3}">${(x.value / tot * 100).toFixed(1)}%</span>` : '';
          s += `<div style="display:flex;align-items:center;gap:6px;line-height:1.75">
            ${x.marker}<span style="color:${D.tx2};min-width:52px">${x.seriesName}</span>`
            + (isCum ? `<span style="color:${D.tx3};font-size:9.5px">累计</span>` : '')
            + `<b style="margin-left:auto;font-variant-numeric:tabular-nums">${QFMT(x.value)}</b>${pct}</div>`;
        });
        if(!anySeg) s += `<div style="color:${D.tx3}">该期未披露分季度数据</div>`;
        s += `</div>`;
        // 另一指标作为参照
        const other = metric === 'np' ? r.rev : r.np;
        const oLbl  = metric === 'np' ? '营业收入' : '归母净利润';
        const oCol  = (other != null && other < 0) ? D.neg : D.pos;
        s += `<div style="color:${D.tx3};font-size:10.5px">${oLbl} `
           + `<b style="color:${oCol}">${QFMT(other)}</b> ${unit}</div>`;
        if(isH) s += `<div style="color:${D.tx3};font-size:10.5px;margin-top:3px">
          港股仅中期与年度披露，无季报</div>`;
        return s;
      },
    },
    legend: {
      top: 2, right: 6, itemWidth: 11, itemHeight: 8,
      textStyle: {color: D.tx2, fontSize: 10.5}, data: segs,
    },
    xAxis: {
      type: 'category', data: years,
      axisLine: {lineStyle: {color: D.line}}, axisTick: {show: false},
      axisLabel: {color: D.tx3, fontSize: 10.5},
    },
    yAxis: {
      type: 'value', name: unit, nameTextStyle: {color: D.tx3, fontSize: 10, align: 'right'},
      axisLine: {show: false}, axisTick: {show: false},
      axisLabel: {color: D.tx3, fontSize: 10},
      splitLine: {lineStyle: {color: D.lineSoft}},
    },
    dataZoom: [
      /* 只保留拖动条：用户明确要求不要用滚轮缩放。
         因此不配置 type:'inside'（那才是滚轮/拖拽缩放的来源）。 */
      {type: 'slider', xAxisIndex: 0, height: 20, bottom: 22,
       start: zStart, end: 100, minValueSpan: 1, maxValueSpan: years.length,
       borderColor: D.line, backgroundColor: D.panel,
       fillerColor: D.sliderFill,
       handleStyle: {color: D.accent, borderColor: D.accent},
       moveHandleStyle: {color: D.line},
       dataBackground: {lineStyle: {color: D.line}, areaStyle: {color: D.panel2}},
       selectedDataBackground: {lineStyle: {color: D.accent}, areaStyle: {color: D.sliderSel}},
       textStyle: {color: D.tx3, fontSize: 10},
       labelFormatter: v => (years[v] != null ? years[v] : '')},
    ],
    series,
  });
  setTimeout(()=>fitLegendTop(ch, 26), 60);
  return ch;
}

/* 财务折线图：营收柱 + 归母净利折线，可指定单位（矿山级财务等简单场景用）

   与季度图保持一致的两条规则：
     1. 默认展示最近 10 年（YEAR_DEFAULT_SPAN；不足 10 年显示全部）
     2. 只保留 slider 拖动条，不配置 type:'inside' —— 禁用滚轮与图内拖拽缩放 */
function drawFin(el, rows, unit, title){
  if(!rows || !rows.length){ el.style.display='none'; return null; }
  const ch = chartOf(el, 210);
  const years = rows.map(r=>r.y);
  const fStart = years.length <= YEAR_DEFAULT_SPAN
    ? 0
    : Math.round((years.length - YEAR_DEFAULT_SPAN) / (years.length - 1) * 100);
  ch.setOption({
    grid:{left:56, right:52, top:32, bottom:52},
    tooltip:{ trigger:'axis', backgroundColor:D.tipBg, borderColor:D.line,
              textStyle:{color:D.tx, fontSize:11},
              formatter: p => {
                let s = p[0].axisValue + ' 年';
                p.forEach(x=>{ if(x.value!=null)
                  s += `<br/>${x.marker}${x.seriesName}：<b>${x.value}</b> ${unit}`;
                });
                return s;
              }},
    legend:{ top:2, textStyle:{color:D.tx2, fontSize:10.5}, itemWidth:12, itemHeight:8 },
    xAxis:{ type:'category', data:years, axisLine:{lineStyle:{color:D.line}},
            axisLabel:{color:D.tx3, fontSize:10.5}, axisTick:{show:false} },
    yAxis:[
      { type:'value', name:'营收', nameTextStyle:{color:D.tx3, fontSize:10},
        axisLine:{show:false}, axisTick:{show:false},
        axisLabel:{color:D.tx3, fontSize:10}, splitLine:{lineStyle:{color:D.lineSoft}} },
      { type:'value', name:'净利', nameTextStyle:{color:D.tx3, fontSize:10},
        axisLine:{show:false}, axisTick:{show:false},
        axisLabel:{color:D.tx3, fontSize:10}, splitLine:{show:false} },
    ],
    series:[
      { name:'营业收入', type:'bar', barMaxWidth:26, yAxisIndex:0,
        itemStyle:{color:D.revBar, borderRadius:[3,3,0,0]},
        data: rows.map(r=>r.rev) },
      { name:'归母净利润', type:'line', smooth:true, symbolSize:7, yAxisIndex:1,
        lineStyle:{width:2.4, color:D.amber}, itemStyle:{color:D.amber},
        data: rows.map(r=>r.np), z:5 },
    ],
    dataZoom:[
      // 只保留拖动条：与季度图一致，不用滚轮缩放
      { type:'slider', xAxisIndex:0, height:18, bottom:12,
        start:fStart, end:100, minValueSpan:2, maxValueSpan:years.length,
        borderColor:D.line, backgroundColor:D.panel,
        fillerColor:D.sliderFill,
        handleStyle:{color:D.accent, borderColor:D.accent},
        moveHandleStyle:{color:D.line},
        dataBackground:{lineStyle:{color:D.line}, areaStyle:{color:D.panel2}},
        selectedDataBackground:{lineStyle:{color:D.accent},
                                areaStyle:{color:D.sliderSel}},
        textStyle:{color:D.tx3, fontSize:10},
        labelFormatter: v => (years[v] != null ? years[v] : '') },
    ],
  });
  setTimeout(()=>fitLegendTop(ch, 32), 60);
  return ch;
}

/* 聚焦提示条：只算「说了什么」，外框 / 配色 / 按钮样式全在 map_kit（单一真相源）。 */
/* 聚焦条：世界底图上不再有「本视图无、切另一个视图看」的说法 ——
   点位全在同一张图上，灰显的那些只是被当前筛选挡住，改用「筛选外 N 个」表述。 */
function renderFocusBar(){
  if(!window.MPK) return;
  if(!S.focus || !DATA.comp[S.focus]){ MPK.setFocus(null); return; }
  const c = DATA.comp[S.focus];
  const shown = filtered().filter(m => m.cos.some(x=>x[1]===S.focus));
  const rest = c.mines.length - shown.length;
  const tip = rest > 0
    ? `<span class="mp-fo">另有 ${rest} 个被当前筛选挡住</span>` : '';
  MPK.setFocus({
    html: `已聚焦 <b>${c.name}</b> — 图上 <b>${shown.length}</b>/${c.mines.length} 个点位高亮，其余灰显　${tip}`,
    btn: '退出聚焦 ✕',
    onExit: exitFocus,
  });
}

function exitFocus(){ S.focus = null; render(); }

/* ---------------- 初始化 ---------------- */
/* 启动失败时给可读提示，避免永久停在"正在加载" */
function showBootError(err){
  console.error(err);
  const el = document.getElementById('loading');
  if(!el) return;
  el.innerHTML =
    '<div style="font-size:15px;color:'+D.neg+';margin-bottom:8px">数据加载失败</div>'
    + '<div style="font-size:12px;color:var(--tx3);max-width:520px;text-align:center;line-height:1.9">'
    + '本页是内联单文件，文件被截断、转码或被手工编辑都会导致数据损坏。<br>'
    + '请重新运行 inline.py 生成，或换用原始的 index.html。<br>'
    + '<span style="color:'+D.tx3+'">错误：' + String((err && err.message) || err) + '</span></div>';
}
async function boot(){
  try{ await bootInner(); }
  catch(err){ showBootError(err); }
}
async function bootInner(){
  await loadData();
  if(PAGE_COMP) return bootCompanyPage();     // 个股页：只渲染这一家
  return bootMapPage();
}

/* 载入底图 + 一层数据 + 建反查。切层时只重跑「这一层」的部分，底图不重复加载。
   两种取数方式：
     · 地图页 —— fetch 同目录下的 hard.json / power.json / *.geo.json / 利润模型 json；
     · 个股页 —— 由 rt/pack.js 以 <script> 载入（window.MP_DATA_PACK）。
       不用 fetch 是因为个股页可能被直接双击打开（file://），那种协议下 fetch 一律被 CORS 挡掉，
       而 <script> 不受同源限制；App 里虽走 https://money.local/，同一套代码两处都能跑。 */
async function loadData(){
  /* 个股页的层由页面模板写明（PAGE_LAYER），不能靠 S.layer 的默认值 hard。
     原先只有 pack 分支里用 LK = PAGE_LAYER 指定；261109 改走 fetch 后，
     取数前必须先把 S.layer 同步过来，否则电力公司的个股页会加载 hard 层。 */
  if(PAGE_COMP) S.layer = PAGE_LAYER || 'hard';
  let cg, wg, models = [], layerData = null;
  let fetched = null;                         // 地图页的利润模型（个股页为 null，模型并入 models）
  if(window.MP_DATA_PACK){
    const P = window.MP_DATA_PACK;
    cg = P.china; wg = P.world; models = P.models || [];
    // 个股页要指明「这一家在哪一层」：硬资产公司看 hard，电力公司看 power。
    // 层 key 由 PAGE_LAYER 给出（页面模板写明），缺省 hard（绝大多数公司是硬资产）。
    const LK = PAGE_COMP ? (PAGE_LAYER || 'hard') : S.layer;
    layerData = (P.layers && P.layers[LK]) || P.data || null;
    if(P.layers) S.layer = LK;
  } else {
    /* 地图页：fetch 同目录下的 *.geo.json / 当前层数据 / 利润模型 json。
       三样都必须在 registerMap **之前**取齐：cg/wg 是 registerMap 的入参，
         漏取会让 echarts.registerMap 收到 undefined，报
         「Cannot read properties of undefined (reading 'svg')」并整页停在加载态。 */
    let ci = null;
    [cg, wg, fetched, ci] = await Promise.all([
      fetch(GEO_FILES.china).then(r=>r.json()),
      fetch(GEO_FILES.world).then(r=>r.json()),
      Promise.all(MODEL_FILES.map(f => fetch(f).then(r=>r.json()).catch(()=>null))),
      // 公司→点位白名单：以前塞在 pack.js 里，现在运行时取。
      // comp_index.json 的 pts[] 与旧 compPts 同构（id/n/c/lv/ov/lng/lat），多一个 cos 不影响。
      fetch(DATA_BASE + 'comp_index.json').then(r=>r.json()).catch(()=>null),
    ]);
    models = fetched;
    if(ci && ci[PAGE_COMP]) S.compPts = ci[PAGE_COMP].pts || [];
    // 当前层的数据在这里只取一次（首层）；切层由 loadLayerData 走缓存/单取。
    layerData = await fetch(DATA_BASE + layerDef().dataFile).then(r=>r.json());
  }
  echarts.registerMap('china', cg);
  echarts.registerMap('world', wg);
  MAPS = {china:cg, world:wg};
  const pmodels = {};
  for(const m of models){
    if(m && m.meta && m.meta.code) pmodels[m.meta.code] = m;
  }
  PACK = {cg, wg, pmodels, pmodel: models.find(Boolean) || null};
  if(layerData){ applyLayer(layerData); return; }
}

/* 把「一层的数据」装进 DATA 与当前分类表。切层时对另一层重跑本函数即可。
   归一化的全部内容：把 cn/ov 摊成 points（**世界底图上两层点位同在**，
     不再有「这个视野只画这个子集」的概念），给缺 scope 的点位补 scope，
     再建公司反查。不做任何数值加工 —— 数字一律来自各层自己的 data.json。 */
function applyLayer(d){
  const norm = [];
  for(const key of ['cn','ov']){
    for(const m of (d[key] || [])){
      // 电力数据没有 scope 字段（全境内在图）；按经度兜底会误判，故统一标 'cn'
      if(!m.scope) m.scope = (key === 'ov') ? 'ov' : 'cn';
      norm.push(m);
    }
  }
  DATA = Object.assign({}, d, {points: norm});
  DATA.pmodels = PACK.pmodels;
  DATA.pmodel = PACK.pmodel;

  // 分类表：当前层的（硬资产 8 大类 / 电力 4 类），切层时必须一起换 ——
  // 否则残留上一层 key，filtered() 会把本层点位全滤掉、图上一片空白。
  CATES = layerDef().cats;
  CMAP = Object.fromEntries(CATES.map(c => [c[0], c]));

  /* 默认**不选任何分类**（260930 用户拍板）：一进页面 0 点位 → 首屏最快、地图最干净。
     这是本项目最重要的性能决策 —— 781 个点全画（旧行为）在移动端实测掉到 ~18fps，
     而 0 点渲染等于是「静态底图」，几乎不耗帧。
     只在「本层还没被用户选过」时置空：`S._picked` 记录用户是否在本层动过筛选
     （按层分开存，切回来时保留他上次的选择，不要每次切层都清空）。 */
  if(S._picked[S.layer] === undefined) S._picked[S.layer] = false;
  if(!S._picked[S.layer]){
    S.cate = new Set();          // 空集 = 不画任何点
    S.groups = new Set();
  } else if([...S.cate].some(k => !CMAP[k])){
    // 用户选过，但他选的分类不在本层（跨层残留）→ 退回空集，别按错的表过滤
    S.cate = new Set();
    S.groups = new Set();
  }

  // 预处理：公司 -> 点位反查
  DATA.compList = Object.values(d.comp || {});
  const idx = {};
  for(const m of norm){
    for(const pair of (m.cos || [])){
      const cd = pair[1];
      (idx[cd] = idx[cd] || []).push(m);
    }
  }
  for(const c of DATA.compList){
    c.mines = idx[c.code] || [];
    c.cates = [...new Set(c.mines.map(m=>m.cate))];
  }
  /* 数据整份换过了 → 报一次（订阅方据此重算；探针可据 MP.store.rev 判「读数是否过期」）。
     位置在函数最后，保证广播时 DATA/CATES/CMAP 已是新的一份。 */
  MP_STORE.commit('layer');
}

/** 当前层的定义行（key/name/icon/dataFile/unit/分类表）。 */
function layerDef(){ return LAYER_MAP[S.layer] || LAYER_DEFS[0]; }

/* 切层：换数据 + 换分类表 + 清聚焦/选中 + 重渲。**底图与镜头不动** ——
   两层在同一张世界地图上，切层只是把点换掉，视野保持，用户不会「迷失」。 */
function setLayer(key){
  if(!LAYER_MAP[key] || key === S.layer) return;
  S.layer = key;
  S.focus = null;
  S.sel = null;
  S.groups = new Set();
  if(window.MPK && MPK.closeSheet) MPK.closeSheet();
  syncLayerTabs();               // 选中态与计数先行，别等数据回来才亮
  loadLayerData(key).then(()=>{
    if(window.MPK) MPK.renderAll();
    render();
    syncHash();
  });
}

/** 取另一层的数据（已取过就复用，不重复请求）。
    缓存必须存**原始层数据**、每次一律走 applyLayer ——
    applyLayer 不只装 DATA，还要换 CATES / CMAP、重建 compList 与公司↔点位反查。
    260930 之前这里命中缓存时只 `DATA = _layerCache[key]` 就 return，跳过了 applyLayer，
    于是**第二次进同一层**（缓存已在）会留着上一层的分类表：分类行显示 8 个矿种、
    filtered() 按错的表过滤、公司面板也错（硬→电→硬→电 必现）。 */
async function loadLayerData(key){
  const def = LAYER_MAP[key];
  if(_layerCache[key]){ applyLayer(_layerCache[key]); return; }
  if(window.MP_DATA_PACK && window.MP_DATA_PACK.layers && window.MP_DATA_PACK.layers[key]){
    const raw = window.MP_DATA_PACK.layers[key];
    _layerCache[key] = raw;
    applyLayer(raw);
    return;
  }
  const d = await fetch(DATA_BASE + def.dataFile).then(r=>r.json());
  _layerCache[key] = d;
  applyLayer(d);
}

/* ---------------- 图层切换（顶栏「⛏️ 硬资产 | ⚡ 电力」） ----------------
   按钮由 layers.json 现渲（层数、名字、图标都来自数据，不写死文案）。
   切层只换数据层；**底图与镜头不动** —— 两层在同一张世界地图上。 */
async function buildLayerTabs(){
  const box = document.getElementById('mpLayers');
  if(!box) return;
  let meta = [];
  try{ meta = await fetch(DATA_BASE + 'layers.json').then(r=>r.json()); }
  catch(e){ meta = LAYER_DEFS.map(l => ({key:l.key, name:l.name, icon:l.icon})); }
  _layerMeta = meta;
  box.innerHTML = meta.map(m =>
    `<button type="button" class="mp-layer${m.key === S.layer ? ' on' : ''}" data-l="${m.key}">`
    + `${m.icon} ${m.name}<b>${m.points}</b></button>`).join('');
  [].forEach.call(box.querySelectorAll('.mp-layer'), b=>{
    b.onclick = ()=> setLayer(b.dataset.l);
  });
}
let _layerMeta = [];

/** 同步图层按钮的选中态与计数（切层 / 深链恢复后调用）。 */
function syncLayerTabs(){
  [].forEach.call(document.querySelectorAll('#mpLayers .mp-layer'), b=>{
    b.classList.toggle('on', b.dataset.l === S.layer);
    const meta = _layerMeta.filter(m=>m.key === b.dataset.l)[0];
    if(meta){ const n = b.querySelector('b'); if(n) n.textContent = meta.points; }
  });
}

/* ---------------- 缩放「跟手」（260930 用户需求 #4） ----------------
   问题：echarts 的 geo 缩放在 zrender 层被**丢掉了真实比例**。
   min.js 里 pinch 处理写死 `scale: t.pinchScale > 1 ? 1.1 : 1/1.1` ——
   无论两根手指拉开多少（差 1% 还是差 200%），每帧一律乘 1.1。
   双指快速张开时，系统一帧发多次 pinch，1.1 连乘 → 地图瞬间放大到上限（「太灵敏、不跟手」）；
   慢速微调时又是 1.1 整数倍台阶，手停了地图还在跳（「不跟手」的另一半根因）。
   滚轮同理：min.js 按 wheelDelta 分 1.4 / 1.2 / 1.1 三档，也是台阶。

   做法：**关掉 echarts 自带的缩放，保留平移**（roam:'move'），
   然后自己监听 zrender 的 pinch / mousewheel，**用真实比例**驱动 geo.zoom。
   · pinch：zrender 事件自带 `pinchScale`（本次/上次指距之比，min.js 20200 处实算），
     直接拿它当倍率 —— 手指张开 5% 就放大 5%，完全 1:1 跟手；
   · 缩放锚点用 `pinchX/pinchY`（双指中点），滚轮用 offsetX/offsetY ——
     放大时手指/光标下的地理位置不动，这是「跟手」的关键。
   两个连续缩放之间不做补间（animation:0），否则每一帧都在追动画、越追越飘。 */
function bindFollowZoom(){
  if(!chart) return;
  const zr = chart.getZr();
  if(!zr || zr.__mpFollowZoom) return;          // 幂等：重复 bind 只留一份
  zr.__mpFollowZoom = true;

  // 缩放倍率夹到 ZOOM_MIN / ZOOM_MAX（与 geoBase 的 scaleLimit 同源，
  // 改缩放下限只改 ZOOM_MIN 一处）
  const LIM = {min:ZOOM_MIN, max:ZOOM_MAX};
  /* 以画布坐标 (px,py) 为锚点缩放：锚点下的地理位置在屏幕上不动，这是「跟手」的关键。
     261002-61 起**交给 echarts 的 geoRoam 去做**（dispatchAction），本函数只负责
     ①按 LIM 夹倍率 ②维护记账经度 ③跨省界阈值时补一次 regions。
     261002-61 之前是自己反推 geo.center（把锚点像素折算成经纬度偏移再 setGeo），
     那条路每帧要走一次完整 setOption，实测一帧 316.6 ms —— 缩放基本不可用。 */
  function zoomAt(px, py, ratio){
    if(!(ratio > 0) || !isFinite(ratio) || Math.abs(ratio - 1) < 1e-4) return;
    cancelGeoTween();                            // 手动缩放时停掉在飞的补间，避免互相覆盖
    // 缩放锚点要基于**最新**的记账经度（用户可能刚拖过还没松手）——先补齐一次（第 1 条）
    if(zr.__mpSyncCLng) zr.__mpSyncCLng();
    const k0 = cam();
    /* 读回 zoom 已被 cam() ÷Z_SCALE 还原成用户语义值（口径见 Z_SCALE）。 */
    const z0 = (k0.z == null) ? 1 : k0.z;
    const z1 = Math.max(LIM.min, Math.min(LIM.max, z0 * ratio));
    const eff = z1 / z0;                         // 实际生效倍率（撞上限后可能 < ratio）
    if(Math.abs(eff - 1) < 1e-4) return;

    /* 261002-61：推相机改走 **roam（dispatchAction）**，不再走 setOption。
       实测（同一条 rAF 驱动、全量 854 点）：setGeo（setOption）一帧 316.6 ms、其中绘制只 27.9 ms；
       dispatchAction roam 一帧 83.2 ms、其中绘制 3.0 ms。差的那 230 ms 是**全量 option 树合并**
       （series 项逐项并入 option），而 roam 只改相机 + 重绘 —— 这正是 echarts 自己处理手势缩放的路。
       echarts 的 geoRoam 自带下面两件事，故原先那套「反推 c1」不必再自己算：
         · 以 (originX, originY) 为锚点缩放 → 锚点下的地理位置不动（就是「跟手」）
         · 按 geoBase 的 scaleLimit 夹倍率（= ZOOM_MIN/MAX × Z_SCALE，与本函数 LIM 同源）
       ⚠ `componentType:'geo'` **必须显式给**：只写 geoIndex 时 echarts 匹配不到组件，
         实测相机纹丝不动且不报错（`_roam_api` 探针里五种载荷只有带它那种动了）。 */
    const provBefore = z0 >= PROV_SHOW_ZOOM, provAfter = z1 >= PROV_SHOW_ZOOM;
    chart.dispatchAction({type:'geoRoam', componentType:'geo', geoIndex:0,
                          zoom:eff, originX:px, originY:py});
    /* 记账经度仍要自己管（第 1 条）：roam 只改相机，不动 S.cLng。
       缩放会带着 center 一起动（锚点补偿），故缩放后读回再归一。 */
    syncCLng();
    /* 省界显隐：roam 不会写 regions（regions 是 option 层的东西），
       只在**跨过 PROV_SHOW_ZOOM 阈值时**补一次 setOption —— 绝大多数缩放帧两侧同态，这一笔一次都不付。 */
    if(provBefore !== provAfter) setGeo({regions: provRegionsOpt(provAfter)});
    /* 缩放会让屏幕上「点位的位置」整体改变，卡片（#mpSheet）描述的那个矿可能已经移出视野
       → 顺手收起（261001 交互审计 P2）。closeSheet 幂等且廉价，没开卡时等于空操作。 */
    if(window.MPK && MPK.closeSheet) MPK.closeSheet();
    placeTip();
    scheduleAfterZoom();
  }

  // 连续缩放期间抑制 syncHash 的抖动，松手后再写一次地址栏（30ms 去抖在 syncHash 内）
  let _zt = 0;
  function scheduleAfterZoom(){
    if(_zt) clearTimeout(_zt);
    _zt = setTimeout(()=>{ _zt = 0; syncHash(); }, 120);
  }

  /* 双指：直接用 zrender 给的 pinchScale（真实指距比）。
     必须先 preventDefault：否则浏览器原生页面缩放会插一脚，
     那才是「放大时整页跟着变」的观感来源。 */
  zr.on('pinch', e => {
    const r = (typeof e.pinchScale === 'number' && isFinite(e.pinchScale)) ? e.pinchScale : 1;
    zoomAt(e.pinchX, e.pinchY, r);
  });
  // zrender 的 pinch 依赖 touch 事件，某些 WebView 下 gestureEvent 走 'pinch' 别名，一并接
  zr.on('pinchstart', ()=>{ cancelGeoTween(); });

  /* 桌面 / 触控板滚轮：用 deltaY 的真实比例，而不是 echarts 的 1.4/1.2/1.1 三档。
     指数映射让「滚一格」在不同缩放级别下视觉步长一致（线性映射在放大后会显得太灵敏）。

     ★ 261001-26 修：**必须取原始 `e.event.deltaY`，不能取 zrender 的 `e.wheelDelta`**。
       zrender 把 DOM 的 deltaY 归一成了 `wheelDelta = deltaY / 120`（实测：
       deltaY -120 → wd=-1；-1200 → wd=-10；deltaMode=1 的 -3 行 → wd=-0.025），
       而本行下面的倍率是按「一格 = ±120」标定的。于是原写法
       `e.wheelDelta != null ? e.wheelDelta : -e.event.deltaY` 永远走前一支 ——
       一格只放大 1.0015^1 = **0.15%**（要滚约 460 格才翻倍），**桌面滚轮等于失效**，
       而且方向还是反的（向上滚 → wd=-1 → 缩小）。
       实测（CDP 一格 deltaY=-60）：修前 zoom 11.400 → 11.409；修后 → 12.47。 */
  zr.on('mousewheel', e => {
    const d = (e.event && typeof e.event.deltaY === 'number') ? -e.event.deltaY
            : (e.wheelDelta != null ? e.wheelDelta : 0);
    if(!d) return;
    const r = Math.pow(1.0015, d);               // ±120 → 约 ±1.2 倍
    zoomAt(e.offsetX, e.offsetY, r);
  });

  /* ---------------- 拖拽平移的「圈数记账 + 窗口重定」（第 1 条） ----------------
     平移交给 echarts（roam:'move'），它把 geo.center 写成绝对经度（可超 ±180，实测能到 2 万+），
     所以**拖动本身不限幅**。真正要自己管的是两件事：

     **记账**：把握手时 echarts 报回的绝对经度，用「离当前 cLng 最近的同余值」还原成
        不受限的记账经度 cLng（代表「在第几份」）。这样松手后点分类/切视野不会弹回第 1 份。
        为什么不用 `chart.on('georoam')` 事件：实测该事件派发在 updateTransform **之前**
        （260930 roamtest7），监听里读到的 center 是**上一拍**的旧值 —— 连续拖拽会少记一次、
        并随次数累积错开整份。故改为**惰性同步**：任何要用到 cLng 的地方先调 syncCLng()。

     **回卷（wrap）**：roam 只改 center、不移 boundingCoords，所以拖过窗口半宽后内容就跑出
        画布（画面全空）。故拖动中若 |center| 超过 WRAP_DEG 就把 center **折回一份内**
        （norm360）并重建窗口 —— 因为底图/点位在 ±360 处有逐像素相同的副本，
        这次「center 减 360 而窗口右移一份」在视觉上完全一致（实测 seamtest），用户无感。
        这就是「真·无限拖拽」的落点：center 有界、视觉无界。 */
  function syncCLng(){
    if(_geoTween) return;                        // 补间动画期间不动记账（由 animateGeoTo 自己管）
    const k0 = cam();
    if(!k0.c) return;
    /* 记账 = echarts 报回的经度折回一份内（norm360）。echarts 的 roam 会把 center 写成绝对值
       （可能超出 ±180），这里折回来，与「center 恒归一」的口径一致，避免累积出界。
       事件滞后一拍的补偿交给「下次调用」自然完成（幂等、无累积误差）。 */
    S.cLng = norm360(k0.c[0]);
  }

  /* 回卷窗口：center 出界时折回一份内并重建窗口。只在此处调 setOption（约 90 ms），
     所以必须**低频**触发 —— 用 WRAP_DEG=120° 作阈值，一次回卷能撑住约 2×120° 的继续拖动
     （约 510 px @世界视野），用户感知不到。

     ★ 261001-26 起这里还兼一件必须做的事：**把省界层（geo[1]）追回来**。
       拖动只改 geo[0]（echarts 的 roam 只作用在光标下的那个 geo），而 geo[1] 是
       `roam:false` + 自带 center/zoom 的独立相机 —— 拖动路径上**没有任何地方**同步它，
       于是拖多远省界就落后多远，而且**松手也不会自己恢复**（实测：拖 160px 后
       geo[0]=78.36 / geo[1]=104，两层像素差恒为 160px）。
       用户之所以觉得「有时候」才脱节：任何一次 setGeo（滚轮/捏合缩放、切分类、切视野、
       跨 120° 回卷）都会顺手把两层对齐一次 —— 也就是「拖完不缩放就一直脱、一缩放就好了」。
       本函数在 mouseup / touchend 被调用，故在这里判一次「两层是否已经对不上」，
       不等下一次 setGeo（那要等到用户去缩放）—— 代价是每次手势最多一次 setOption，
       而且只有真的脱了才付（判据见下）。 */
  /* 回卷窗口：center 出界时折回一份内并重建窗口。只在此处调 setOption（约 90 ms），
     所以必须**低频**触发 —— 用 WRAP_DEG=120° 作阈值，一次回卷能撑住约 2×120° 的继续拖动
     （约 510 px @世界视野），用户感知不到。

     ★ 261002-57：这里原先还兼一件「把省界层（geo[1]）追回来」的事，已整段删除。
       当时省界是自带相机的第二个 geo，拖动只改 geo[0]、拖动路径上没有任何地方同步它
       → 「拖动时省界不动、松手才跳过去」（261002-56 用户反馈；261001-26 修过一轮、
       只修到松手追回，根因没除）。现在省界已并入世界底图、**共用 geo[0] 的相机**，
       不存在脱节，也就没有可追的东西。连带删掉的还有两层中心是否对得上的判据。 */
  function wrapWindow(){
    /* 只看 geo[0] 自己的中心是否出安全区；省界与它同源，无需另判。 */
    const g0 = ((chart.getOption() || {}).geo || [])[0] || {};
    if(!(g0.center && isFinite(g0.center[0]))) return;
    const raw = g0.center[0];
    if(Math.abs(raw) <= WRAP_DEG) return;              // 还在安全区内，不动
    const zUser = (typeof g0.zoom === 'number' && g0.zoom > 0) ? g0.zoom / Z_SCALE : VIEW_DEF[S.scope].z;
    setGeo({ center:[norm360(raw), g0.center[1]], zoom:zUser, animation:false });
  }


  /* 拖动只做「记账」，**不在拖动过程中 setOption**（2026-10-01 用户反馈「拖动时错位/卡顿」）：
     · 原先每帧 rAF 调 wrapWindow()，越过 WRAP_DEG 时改 center，与 echarts 自己的 roam
       抢同一帧写 geo → 底图与点位错位；
     · 原先还每帧 placeTip()，它读 getBoundingClientRect + offsetHeight，强制同步布局 → 掉帧。
     回卷与气泡重定位都挪到「松手时补一次」（下面的 mouseup / touchend），拖动期间零额外开销。 */
  chart.on('georoam', () => {
    if(_geoTween) return;
    syncCLng();                                  // 惰性补齐记账（幂等，只读不写画面）
    /* 261002-61：点位已按窗口裁剪（见 CULL_REBUILD_DEG），拖出窗口的点会消失 →
       在这里补一次保险。只换 series、不动 geo，且只有真的漂出 240° 才付代价。 */
    recullIfDrifted();
    /* 地址栏同步也收在这里（261001 审计 P3）：原先它单独挂在 bootMapPage 末尾，
       与这里各监听一次 georoam —— 「响应拖动」这件事两个入口，容易改一处漏一处。
       syncHash 内部有 280ms 去抖，连续拖动不会把地址栏写爆。 */
    syncHash();
  });
  // 松手时补一次：把窗口稳稳落回安全区（避免停在阈值边缘），并把气泡钉回它描述的那个点
  /* 顺序有讲究：**先 wrapWindow 再 recullIfDrifted** —— 回卷会把相机整份挪走（±360°），
     回卷后再判漂移才能看到这次挪动；反过来的话刚铺好的窗口是按回卷前的相机算的。 */
  zr.on('mouseup', () => { if(!_geoTween) { syncCLng(); wrapWindow(); recullIfDrifted(); placeTip(); } });
  zr.on('touchend', () => { if(!_geoTween) { syncCLng(); wrapWindow(); recullIfDrifted(); placeTip(); } });

  /* 供外部（render / zoomAt / 点击）在读取 cLng 前补齐记账 —— 与 georoam 内同一份实现。 */
  zr.__mpSyncCLng = syncCLng;
}

async function bootMapPage(){
  chart = echarts.init(document.getElementById('map'), null, buildOpt());
  /* 点矿点 → 弹出矿点卡片（app/map_kit.py 的 #mpSheet）：矿产介绍 + 核心数据 + 关联公司
     → 公司页。原来点一下是钉一张小气泡、再点一次才展开侧栏详情，两级跳；现在一级到位，
     要完整档案由卡片里的「查看完整档案」触发（全屏覆盖层，不挤地图）。 */
  chart.on('click', p => {
    hideTip();
    if(p.componentType === 'series' && p.data && p.data.__m){
      MPK.openSheet(p.data.__m);
      centerMineForSheet(p.data.__m);            // 卡片贴底出现 → 把点挪到它上方，免得被盖住
      return;
    }
    // 火电省级填色时，点省份 → 弹出该省火电公司明细卡（复用矿点卡片的宿主）
    if(showThermal() && p.componentType === 'geo' && p.name && thermalProv()[p.name]){
      MPK.openProvince && MPK.openProvince(p.name, thermalProv()[p.name]);
      return;
    }
    MPK.closeSheet();                            // 点地图空白：收起卡片
  });
  chart.getZr().on('click', e => { if(!e.target) MPK.closeSheet(); });
  bindFollowZoom();                              // 缩放跟手（自定义 pinch 比例，见函数注释）
  chart.on('mouseover', p => {
    if(MPK.sheetOpen()) return;                  // 卡片开着时不让悬停气泡盖上来
    if(p.componentType==='series' && p.data && p.data.__m){ showTip(p.data.__m, p.event); return; }
    // 火电省级填色时，悬停省份显示该省已收录装机（老电力图的省份浮层）
    if(showThermal() && p.componentType === 'geo' && p.name) showProvTip(p.name, p.event);
  });
  chart.on('mouseout', hideTip);
  window.addEventListener('resize', ()=> relayoutThrottled());   // 窗口/容器尺寸变化：图表统一重绘
  bindSizeSync();                                // 容器自身尺寸变化（字号改写 / 旋屏）也重绘

  bindUI();
  await buildLayerTabs();                        // 图层按钮（数据来自 layers.json，不写死）
  // 地址栏里的视野状态先落进 S，再渲染一次，最后把相机摆到 URL 指定的位置。
  // （render 会按 scope 摆默认镜头，所以相机必须后置覆盖；若 URL 带聚焦公司，
  //   取景交给 focusCompany，不再按 z/c 摆，免得两套取景互相打架。）
  const HQ = hashParams();
  await restoreState(HQ);
  render();
  document.getElementById('loading').style.display='none';
  restoreCamera(HQ);

  // 深链：URL 带公司代码时直接在地图上聚焦该公司
  // （兼容旧写法 #sh600089 与新的 #v=cn&f=sh600089）
  if(HQ.f && DATA.comp[HQ.f]) focusCompany(HQ.f);
  syncHash();

  // 调试/测试句柄
  /* A7：窗口上的 DATA / CATES 改成**取值器**（活引用），不再是首帧快照。
     原先 `window.DATA = DATA` 那一行抓的是启动层那一份，切层后整体换对象 →
     外部读到的永远是旧层（261001-17 的 7 条假 FAIL 根因）。
     改成 defineProperty 后，`window.DATA.points` / `window.CATES[0]` 与
     `MP.store.data()` 三者同源同值 —— 读旧句柄这件事从「要靠人记得」变成「不可能」。 */
  window.S = S;
  Object.defineProperty(window, 'DATA',  {get: () => MP_STORE.data(),  configurable: true});
  Object.defineProperty(window, 'CATES', {get: () => MP_STORE.cates(), configurable: true});
  window.MP_STORE = MP_STORE;
  /* 旧的取值函数保留（探针已在用，删了会静默失效）：它们现在只是 store 的别名。 */
  window.cates = () => MP_STORE.cates(); window.cmap = () => MP_STORE.cmap();
  window.points = () => MP_STORE.points();
  window.cam = cam;                       // 相机唯一读法（探针判「补间期间读到的是目标值」）
  window.render = render; window.openMine = openMine; window.MPK = MPK;
  window.setLayer = setLayer;              // 探针要验「按层切换后搜索字段仍对得上」
  window.focusCompany = focusCompany; window.closeDrawer = closeDrawer;
  window.filtered = filtered; window.resetView = resetView;
  window.exitFocus = exitFocus; window.chart = chart;
  // 第 5 条（省界随视野）：探针要能直接驱动镜头并读阈值，故一并暴露
  window.setGeo = setGeo; window.provRegionsOpt = provRegionsOpt;
  window.PROV_SHOW_ZOOM = PROV_SHOW_ZOOM; window.PROV_BOUNDS = PROV_BOUNDS;
  window.PROV_KEY = PROV_KEY;   // 261002-57：探针要按后缀识别省内要素
  // 第 1 条（横向无限平铺）：探针要读份数、验证 norm360 / tileLng / zoom 口径
  window.TILE_SPAN = TILE_SPAN; window.norm360 = norm360;
  window.Z_SCALE = Z_SCALE; window.WRAP_DEG = WRAP_DEG; window.TILE_HALF_DEG = TILE_HALF_DEG;
  window.tileWindow = tileWindow; window.tileLng = tileLng;
  window.cateCounts = cateCounts; window.groupCounts = groupCounts;
  window.statsHtml = statsHtml;
  window.syncHash = syncHash; window.copyViewLink = copyViewLink;
  /* 悬停气泡的调试句柄（探针要验证「气泡跟着地图缩放移动」这条）：showTip 是悬停驱动、
     内部函数，不暴露就只能靠真实鼠标事件才测得到。 */
  window.showTip = showTip; window.placeTip = placeTip; window.hideTip = hideTip;
  window.centerMineForSheet = centerMineForSheet;   // 探针要验证「点矿点会把点带进视野」
  window.hashParams = hashParams; window.restoreState = restoreState;
  window.restoreCamera = restoreCamera;
}

/* ---------------- 个股页模式（不建地图外壳，只渲染这一家） ----------------
   页面 个股研究/<代码>.html 提供容器，这里只做「装进容器 + 绑交互」：
     #pageTabs     顶部「公司研究 / 本公司硬资产」切换条（两块互斥显示，默认公司研究）
     #coHead       公司头部（上市公司标签 / 名称 / 代码 / 关联矿区数）
     #coBody       公司研究正文（与地图抽屉同一份 compBodyHtml）
     #assetSeg     国内 / 全球 切换（只有一侧有矿时退化成静态标注）
     #map          本公司硬资产小图（只画这一家的矿区，切到该块时才建）
     #assetList    本公司资产简介块清单（**图在上、块在下**；选中的那条被顶到第一位）
     #assetFull    单独一屏的完整矿区档案（点某块右侧「展开」进入，Esc 关闭）

   这里没有任何「地图页」的东西：不读地址栏、不建侧栏/底栏/抽屉、不写 hash。
     视图构建全部复用地图页那几个函数，所以同一只股票不会再有第二个页面。 */
/* 动态个股页（stock.html?code=xxx）的静态文案。

   旧版是「一家公司一个 HTML」，公司名、行业简述、单位词、境内境外计数、地图深链
   全在构建期写死。一页服务全部公司后，这些只能运行时填 —— 数据都已在内存里
   （DATA.comp / DATA.ind.desc / DATA.compList / DATA.points），不额外发请求。
   人工补充三字段来自 个股研究/data/<code>.json，缺失就是空（占位提示由 CSS 显示）。 */
function fillPageChrome(c){
  const def = layerDef();
  const unit = def.unit || '矿区';
  const set = (id, v) => { const n = document.getElementById(id); if(n) n.textContent = v; };
  document.title = (c.name || PAGE_COMP) + ' ' + String(PAGE_COMP).toUpperCase() + ' · 个股研究';
  const indDesc = (DATA.ind && DATA.ind.desc) || {};
  set('coIndesc', indDesc[c.ind] || '');
  set('coUnit', unit);
  set('coLayer', def.name || '硬资产');
  const ms = c.mines || [];
  set('coScope', '境内 ' + ms.filter(m => m.scope === 'cn').length
              + ' · 境外 ' + ms.filter(m => m.scope === 'ov').length);
  const link = document.getElementById('coMapLink');
  if(link){
    link.href = '../资产地图/新版/index.html#L=' + encodeURIComponent(S.layer)
              + '&f=' + encodeURIComponent(PAGE_COMP);
  }
  set('coTotalHint', '此图与资产地图是同一份底层（同 app.js / 数据 / geo），但只装本公司自己的'
    + unit + '，不掺其他公司。想看全部 ' + (DATA.compList || []).length + ' 家（'
    + (DATA.points || []).length + ' 个' + unit + '）与完整分布，点右上「进入资产地图 →」。');

  /* 人工补充：源是 个股研究/data/<code>.json，**页面直接读源文件**。
     261109 起不再经构建期合并的 comp_supp.json —— 那份合集把「改一段笔记」绑到了
     整个个股生成器（还要顺带同步地图运行库），且它是同一份内容的第二份拷贝。
     现在改完笔记只要刷新页面：电脑上读到的是源文件本身，App 里读到的是内容包快照。
     文件不存在 = 这家公司还没写过补充（404 是预期语义）；读失败/格式坏要留痕，
     不能伪装成「空笔记」，否则用户会以为自己的字丢了。 */
  loadCompanySupplement();
}

/* 补充数据的读取状态机放在 app/company_supplement.js（唯一源，构建期内联进 stock.html）。
   本函数只负责把状态接到 DOM 与编辑内核上。 */
function loadCompanySupplement(){
  var supp = window.MP_SUPP;
  var card = document.querySelector('.mp-note');
  if(!supp || !card) return;
  if(window.MP_SUPP_FOR === PAGE_COMP) return;      // 同一页重复调用不重复挂提示
  window.MP_SUPP_FOR = PAGE_COMP;
  var old = card.querySelector('.mp-note-err');
  if(old) old.parentNode.removeChild(old);
  var transport = supp.createFetchTransport({
    base: 'data/',
    // App 内（https://money.local）包损坏也会 404，要用内容清单证明「确实没有这份文件」；
    // 电脑端静态服务器的 404 就是真没有，不需要清单。
    manifestURL: location.host === 'money.local' ? '/manifest.json' : null
  });
  var reader = supp.createReader({
    knownCompanies: new Set(Object.keys(DATA.comp || {})),
    read: transport
  });
  window.MP_SUPP_STATE = reader;
  reader.open(PAGE_COMP).then(function(snap){
    if(snap.status === 'ready' || snap.status === 'empty'){
      var d = snap.original || {};
      ['thesis', 'note', 'watch'].forEach(function(k){
        var el = document.querySelector('[data-edit="' + k + '"]');
        if(el && d[k]) el.textContent = d[k];
      });
      // 交给编辑内核算「哪些字段真被改了」；不给的话已写过内容的页会丢原文。
      if(window.__EDIT__) window.__EDIT__.original = d;
      return;
    }
    if(snap.status === 'error'){
      // 明确报错，且**不填任何字段** —— 空着会被误读成「我还没写」。
      var tip = document.createElement('div');
      tip.className = 'mp-note-err';
      tip.style.cssText = 'margin:6px 0 0;padding:6px 8px;border-radius:6px;'
        + 'background:rgba(200,60,60,.10);color:#b4382f;font-size:12px;line-height:1.5';
      tip.textContent = '人工补充读取失败，暂不显示原文（不会覆盖已有内容）：' + snap.message;
      card.appendChild(tip);
      console.warn('[个股补充] ' + snap.message);
    }
  });
}

async function bootCompanyPage(){
  let c = DATA.comp[PAGE_COMP];
  /* 层猜错就切到另一层再试。comp_index.json 里没有层标记，所以搜索跳转、
     手输 URL、外部书签都可能不带 layer；不带时默认 hard，电力公司会取不到。
     切层只多一次 fetch（数据已按层拆成独立 json），比报「未知证券代码」好。 */
  if(!c){
    const other = S.layer === 'hard' ? 'power' : 'hard';
    try{ await loadLayerData(other); S.layer = other; c = DATA.comp[PAGE_COMP]; }catch(e){}
  }
  if(!c) throw new Error('未知证券代码：' + PAGE_COMP);
  fillPageChrome(c);
  S.focus = PAGE_COMP;
  // 视图落位与地图页 alignViewForComp 同规则：有境内矿先看国内，纯境外权益才看全球
  const hasCn = c.mines.some(m=>m.scope === 'cn');
  const hasOv = c.mines.some(m=>m.scope === 'ov');
  S.scope = hasCn ? 'china' : 'world';

  document.getElementById('coHead').innerHTML = compHeadHtml(c);
  document.getElementById('coBody').innerHTML = compBodyHtml(c, {hideFocusBtn:true, hideMineList:true});
  mountCompCharts(document.getElementById('coBody'), c);
  // 分拆平台 / 旗下平台互跳 → 同目录下的个股页
  bindCompBody(document.getElementById('coBody'), c, { onPlate: cd => gotoCompany(cd) });

  renderAssetSeg(hasCn, hasOv);
  bindPageTabs();

  /* 返回栈登记（顺序见文件头）：个股页那一层整屏资产档案。
     登记放在这里而不是 initAssetView() 里 —— 那个函数要等用户切到「本公司硬资产」
     那一块才跑。放进惰性初始化，会让「这个页面到底能退几层」取决于用户先点过哪里；
     原生返回键问的是页面的**能力**，能力就该在启动时一次报清。
     （closeAssetFull 是函数声明，已提升，此处可直接引用。） */
  mpRegBack('assetFull',180,
    ()=>{ const n=document.getElementById('assetFull'); return !!(n && !n.hidden); },
    closeAssetFull);

  const ld = document.getElementById('loading');
  if(ld) ld.style.display = 'none';
}

/* 个股页顶部「公司研究 / 本公司硬资产」切换条（260925 加，用户要求：页面太长要分两块）。
   两块互斥显示、默认「公司研究」，仍是同一个 HTML 文件 —— 不拆第二个页面、不产生第二个 URL。
   资产块初始是 hidden 的 → #map 尺寸为 0，echarts 在 0 尺寸容器上 init 会报「取不到宽高」，
     所以资产视图改成**首次切到该块时才初始化**（initAssetView），不是页面一加载就建图。 */
function bindPageTabs(){
  const bar = document.getElementById('pageTabs');
  const panes = [].slice.call(document.querySelectorAll('.mp-wrap > [data-pane]'));
  if(!bar || !panes.length){ initAssetView(); return; }   // 没有切换条的老页面：照旧立刻建图
  const btns = [].slice.call(bar.querySelectorAll('.mtab'));
  const show = k => {
    btns.forEach(b => b.classList.toggle('on', b.dataset.t === k));
    panes.forEach(p => { p.hidden = (p.dataset.pane !== k); });
    // 切到资产块：先把图建出来（此时容器已有真实尺寸），再把页面其它图表按新布局重算
    if(k === 'asset'){ initAssetView(); relayoutAll(); }
  };
  btns.forEach(b => { b.onclick = () => show(b.dataset.t); });
  const on = btns.filter(b => b.classList.contains('on'))[0] || btns[0];
  show(on ? on.dataset.t : 'co');
}

/* 资产视图（本公司硬资产）的初始化：建图 + 绑交互 + 首次落位。只跑一次。 */
let _assetInited = false;
let _assetSel = null;          // 当前选中的矿区名 —— 它的简介块会被顶到清单第一位
/* 个股页的地图块 = **MapLibre 新引擎**（261004-89 换掉老 echarts）。
   换掉之后个股研究/rt/ 里的 echarts.min.js（1.02MB）就没人用了 ——
   它是「删老引擎 + 两套旧构建器」的最后一环。

   ⚠ 为什么用动态 import() 而不是 <script type="module">：
     产物要过 app/tests/audit_inline_scripts.py，它按**经典脚本**解析内联段，
     type="module" 里的 import 会被判语法错；import() 在经典脚本里合法。
     同一判据、同一个解法，理由见 资产地图/index2.html 的入口注释。

   ⚠ 白名单按**点位 id**，不按公司代码 —— MapLibre 的 legacy filter 对数组属性
     成员判断一律失效且**不报错**（实测六种写法全返回 0），见 资产地图/src/points.js。

   ⚠ 路径必须是 `../../`（**我第二版改成 `../` 是错的**，探针实测 404）：
     import() 的相对路径以**页面 URL 所在目录**为基准（不是文件系统目录）：
       页面在 /个股研究/sh601899.html → `../` 只能在包层内打转 → /个股研究/资产地图/…不存在
       `../../` 才能出到 /资产地图/新版/src/index.js
     而它**只在 URL 层生效**、不越虚拟域根：App 内 `/个股研究/x.html` 的 `../../`
     归一化后是 `/资产地图/…`（越过根的那一段被丢弃，WebViewAssetLoader 的域根是 money.local/），
     开发态（工作区当服务根）同样成立。
   ⚠ 教训：文件系统里是「兄弟目录」，不代表 URL 里也是。两者差一级 ——
     文件系统：个股研究/ 与 资产地图/ 同级；URL：/个股研究/ 的父是 /，兄弟要从 ../.. 走。
     我按文件系统直觉写 '../'，探针直接给出 404（navigate 之外的 import 失败更隐蔽：
     只表现为 catch 分支里的「地图加载失败」，看不出是路径层级错）。

   ⚠ #map 初始 hidden（切到资产块才显示）→ 宽高为 0，必须**等块可见后**才 boot，
     否则容器尺寸为 0、取景全错。老引擎靠 setTimeout(350) 绕开同一个坑，
     这里改成 boot 完成后再取景（不靠猜延迟）。*/
let _mp2 = null;          // 新引擎模块（动态 import 的结果）
let _mp2Booting = false;

function initAssetView(){
  if(_assetInited || _mp2Booting) return;
  _mp2Booting = true;
  const pts = compPts();
  const ids = pts.map(p => p.id);
  const el = document.getElementById('map');
  /* ⚠⚠ **先渲染列表，再异步装地图**（261004-90 修）：原来列表跟着地图的
     `import().then(...)` 走，于是切块后同步只有 0 行、2 秒后才有 19 行——
     `back_probe` 的「个股页展开入口」判据（切块同一句JS 里就点 .aexp）直接
     读不到行而 FAIL；用户手动切得快点也会看到空列表。
     列表**不依赖地图**（它只要 pack 里的 compPts），没有理由等15.6MB 的 LOD。
     ⚠ 这也符合「先给能用的，再补增强的」：地图 2秒后到，列表**立刻**可用。*/
  renderAssetList(assetMines());
  if(!el || !ids.length){
    /* ⚠ 白名单为空 = 本公司在点位数据里没有资产（纯参股公司）→ 明确说清，
       不装一个空地图让人以为坏了。 */
    _mp2Booting = false; _assetInited = true;
    el.innerHTML = '<div style="padding:12px;font:12px/1.7 sans-serif;color:#9fb0c8">'
      + '本公司在地图点位数据里没有资产记录（可能只有参股关系，未直接持有）。</div>';
    return;
  }

  import('../../资产地图/新版/src/index.js').then(function(m){
    _mp2Booting = false;
    _assetInited = true;
    _mp2 = m;
    return m.boot({ container: el, bare: true, onlyIds: ids });
  }).then(function(){
    /* 取景：境内优先（境外权益矿是另一档，由 renderAssetSeg 的分段控件切）。
       bbox 由白名单现算 —— 个股页本来就有 compPts 全量，不必再引一份索引。 */
    const cn = pts.filter(p => !p.ov);
    const use = cn.length ? cn : pts;
    const lngs = use.map(p=>p.lng), lats = use.map(p=>p.lat);
    _mp2.focusOn([Math.min.apply(null,lngs), Math.min.apply(null,lats),
                  Math.max.apply(null,lngs), Math.max.apply(null,lats)], false);
    renderAsset(true);
    /* 点图上的点 → 打开它的档案（与老引擎 series.click 同义）。
       ⚠⚠ 必须**按本公司那一层**查，且**只认白名单里的 id**（261004-90 修）：
       - 不限定层时紫金那页点一下命中 p95（电站的 id）—— 两层里有同坐标要素，
         pick 返回「全部命中」，取 hits[0] 就可能拿到另一层的；
       - 更要紧的是 id 必须**再过一次白名单**���否则点到别人的矿也会打开档案。
       ⚠ 引擎的 pickAt 只挂在调试面时这里是 undefined，异常被外层 try 吞成静默无反应
         —— 教训同 MEMORY 铁律 5：加调用方也要确认有实现（已把它提成正式导出）。*/
    const MY_LAYER = (window.MP_PAGE_LAYER === 'power') ? 'mp-pts-power-circle' : 'mp-pts-hard-circle';
    el.addEventListener('click', function(e){
      const r = el.getBoundingClientRect();
      const hits = _mp2.pickAt([e.clientX - r.left, e.clientY - r.top], [MY_LAYER]);
      const my = {}; pts.forEach(function(p){ my[p.id] = p; });
      const hit = (hits || []).filter(function(h){
        const id = String((h && h.props || {}).id || '');
        return !!my[id];                    // 只认本公司白名单里的 id
      })[0];
      if(hit) selectAssetMine(my[String(hit.props.id)]);
    });
    /* 资产列表点一条 → 地图上打光（只打光不动相机：列表与地图同屏，
       动相机会让列表滚出视野）。★ 这是老引擎没有的能力，是换引擎的收益之一。 */
    window.__mpCoHighlight = function(id){
      const p = pts.filter(function(x){ return x.id === id; })[0];
      if(!p || !_mp2) return false;
      /* 层名取 window.MP_PAGE_LAYER（个股页在引入本脚本前设的，如 "hard"/"power"）。
         ⚠ 早先写了个不存在的 MP_LAYER_KEY —— 未声明变量读出 undefined，于是永远走 hard：
         电力个股页的点会去 hard 层找 id，永远找不到，**且不报错**。 */
      const which = (window.MP_PAGE_LAYER === 'power') ? 'power' : 'hard';
      return _mp2.highlightPoint(which, p.id, {lng:p.lng, lat:p.lat});
    };
    window.addEventListener('resize', ()=> relayoutThrottled());
    document.addEventListener('keydown', e => { if(e.key === 'Escape') closeAssetFull(); });
    setTimeout(()=>{ relayoutAll(); }, 350);
  }).catch(function(e){
    _mp2Booting = false;
    _assetInited = false;      // 允许重试：import 失败不该让这一页永远空白
    const msg = String((e && e.message) || e);
    window.__mpCoErr = msg;
    console.error('[个股页] 新地图引擎加载失败', e);
    /*⚠⚠ 两种失败要分开说（261004-90）：`import()` 在 **file://** 下会被 CORS 拦
      （ES 模块的规范行为，浏览器不给file 源发同源许可）——
      所以「电脑上双击打开这个 HTML」时地图必然空，这不是 bug 也不是数据问题。
      App 内走 WebViewAssetLoader 的虚拟域 https://money.local/（有origin），
      一切正常。所以这里要说清「换个方式打开」，而不是让人以为页面坏了。*/
    const isFile = location.protocol === 'file:';
    el.innerHTML = '<div style="padding:12px;font:12px/1.7 sans-serif;color:#9fb0c8">'
      + (isFile
          ? '地图需要通过 App 打开（或用本地服务器）——<b>直接双击 HTML 文件</b>时浏览器'
            + '不允许加载 ES 模块（file:// 的安全限制），地图因此为空。'
          : '地图加载失败：' + msg)
      + '</div>';
  });
}

/* 本公司在本视图（国内 / 全球）下的矿区集合 —— 图与清单都取这一份，不会两处口径不一 */
function assetMines(){
  const c = DATA.comp[PAGE_COMP];
  const sk = S.scope === 'china' ? 'cn' : 'ov';
  return c.mines.filter(m => m.scope === sk);
}

/* 个股页之间互跳（个股研究/ 目录内同名 HTML） */
function gotoCompany(code){ location.href = encodeURIComponent(code) + '.html'; }

/* 国内 / 全球 切换条：两侧都有矿才给按钮，只有一侧时退化成静态标注 */
function renderAssetSeg(hasCn, hasOv){
  const el = document.getElementById('assetSeg');
  if(!el) return;
  const c = DATA.comp[PAGE_COMP];
  const nCn = c.mines.filter(m=>m.scope === 'cn').length;
  const nOv = c.mines.filter(m=>m.scope === 'ov').length;
  if(hasCn && hasOv){
    el.innerHTML =
      `<button type="button" class="aseg${S.scope === 'china' ? ' on' : ''}" data-s="china">国内 <b>${nCn}</b></button>`
      + `<button type="button" class="aseg${S.scope === 'world' ? ' on' : ''}" data-s="world">全球 <b>${nOv}</b></button>`;
    el.querySelectorAll('.aseg').forEach(b=>{
      b.onclick = ()=>{
        if(S.scope === b.dataset.s) return;
        S.scope = b.dataset.s;
        _assetSel = null;                  // 换了视图，上一视图选中的矿区已不在清单里
        el.querySelectorAll('.aseg').forEach(x=>x.classList.toggle('on', x === b));
        renderAsset(true);
      };
    });
  } else {
    // 单一侧（或两侧都没有）时退化成静态标注。两侧都为 0 时不能说「境外权益」——
    // 无点位火电公司（省级矩阵口径）就是这种，说「境外权益 0」是错的；给中性文案。
    const U = terms().unit;
    let label;
    if(nCn && !nOv) label = '中国境内';
    else if(nOv && !nCn) label = '境外权益';
    else if(!nCn && !nOv) label = '逐点';       // 无点位：资产以省级矩阵等口径呈现
    el.innerHTML = `<span class="aseg-static">${label} <b>${nCn || nOv}</b> 个${U}</span>`;
  }
}

/* 本公司硬资产视图 = 小图 + 简介块清单，两处都只装这一家的矿区（不掺其他公司）。
   底图观感、散点样式、取景算法全部复用地图页（geoBase / buildSeries / fitFocusView）。
   260925 用户要求：**图在上、块在下**（原先是清单在前、图在后），点图上的点把对应块顶到第一位，
   于是「图 + 那一块」天然同屏可读；块的完整档案走单独一屏（openAssetFull）。 */
function renderAsset(fit){
  const mines = assetMines();
  /* ⚠ 地图部分**不再由这里画**（261004-89 换 MapLibre）：本函数只管**列表**与取景。
     早先版本调 chart.setOption（echarts）—— 新引擎下 chart 是 undefined，
     那一行直接抛错，把整个资产块搞挂；而且**抛错是静默的**：
     initAssetView 的 .then 链会跳到 catch，页面只显示「地图加载失败」，
     看不出真正原因是「这里还在用老 chart」。
     地图侧的职责换成两条：显示口径（境内/境外那一档）→ setScope；取景 → focusOn。 */
  if(_mp2){
    _mp2.setScope(S.scope === 'china' ? 'cn' : 'ov');
    if(fit){
      /* 取景用**当前档**（境内/境外）的点：两个 scope 的地理范围差很远
         （紫金境内在乌金地，境外在南美澳洲），混在一框里等于没取景。 */
      const pts = compPts();
      const use = pts.filter(function(p){ return S.scope === 'china' ? !p.ov : !!p.ov; });
      const u = use.length ? use : pts;
      if(u.length){
        const lngs = u.map(function(p){ return p.lng; });
        const lats = u.map(function(p){ return p.lat; });
        _mp2.focusOn([Math.min.apply(null,lngs), Math.min.apply(null,lats),
                      Math.max.apply(null,lngs), Math.max.apply(null,lats)], false);
      }
    }
  } else if(chart){
    /* 老引擎路径（未切新引擎时）。这是它的唯一入口，别在别处再写一份。 */
    renderAssetEcharts(fit, mines);
  }
  renderAssetList(mines);
}

/* 老引擎（echarts）版的 renderAsset 主体 —— 只在 chart 还在时走。
   单独抽成函数而不是内联在 if 里：将来若恢复双实现，两条路径各自完整，
   不会出现「一半新一半旧」的中间态。*/
function renderAssetEcharts(fit, mines){
  const isCn = S.scope === 'china';
  const byCate = {};
  for(const m of mines) (byCate[m.cate] = byCate[m.cate] || []).push(m);
  /* 嵌入小图的镜头：按视野给默认取景（国内贴近、世界拉远）。
     这里原写成 `geoBase(isCn, [...], ...)`（三参）—— geoBase 重构后签名是 (center, zoom)，
       多传的首参会把布尔 isCn 当成 center，小图取景因此一直是错的（本轮顺手修正）。
     第 1 条：小图也要接平铺窗口，否则底图（world_tile 5 份）会被压回一份、点位跑到图外。 */
  const c = isCn ? [104.5, 36.5] : [40, 22];
  const z = isCn ? 1.25 : 1.2;
  const gb = geoBase(c, z);
  const win = tileWindow(c[0]);
  gb.boundingCoords = [[win[0], 83.56], [win[1], -55.78]];
  chart.setOption({
    backgroundColor: GEO.sea,
    /* 小图不显示省界（与原实现同）→ show:false；省界已是 geo 的一部分，
       这里只需把 regions 的描边关掉。 */
    geo: Object.assign({}, gb, { regions: provRegionsOpt(false) }),
    tooltip:{show:false},
    // focus 传本公司代码 → 复用「聚焦态」的高亮散点样式（这里全是他自己家的矿，没有灰显系列）
    series: buildSeries(byCate, {focus: PAGE_COMP}),
  }, true);
}

/* 本公司的点位清单（来自 pack.js 的 compPts，源是 dist/comp_index.json）。
   ⚠ 找不到就返回空数组 —— 调用方都要判空，不许假定一定有
     （15 家纯参股公司在点位数据里一个点都没有）。*/
function compPts(){
  if(S.compPts) return S.compPts;               // 个股页：loadData 时从 comp_index.json 预取
  const pack = window.MP_DATA_PACK || {};
  return (pack.compPts || {})[PAGE_COMP] || [];
}

/* 资产简介块：字段全部取 data.json 原始值，查不到就写「未公开」，不估算。 */
function assetVal(x){ return (x && !isNA(x)) ? x : '未公开'; }

/* 资源大类分组标题（清单里两处用：置顶块那一组、其余矿区各分组），抽出来避免各写一遍 */
function cateGroupHead(k, n, extra){
  const nm = (CATES.filter(c => c[0] === k)[0] || [])[1] || k;
  const col = (CMAP[k] || [])[2] || 'var(--tx3)';
  return `<div class="grp-t"><span class="dot" style="background:${col};width:9px;height:9px;border-radius:2px"></span>
        ${nm}<span class="n">${n}</span>${extra ? `<span class="arow-o">${extra}</span>` : ''}</div>`;
}

/* 资产列表项（260930 用户要求重做）：
   原先是「名称 + 6 个字段平铺（地点/状态/权益主体/资源量/品位/产能）」——
   一家公司 8 个矿区时，列表被撑成一叠详细页，扫不动、也看不出哪些是关键信息。
   现在压成**一行**：`名称 · 矿种/细分 · 地区/状态`，详情点右侧「展开」进独立档案屏（openAssetFull）。
   用户原话：「这个资产的小框为什么变成了资产的详细页，我需要的是点展开后才出来详细页」。 */
function assetRowHtml(m){
  const v = assetVal;
  // 副行只挑「最能区分这一条」的两三个信息：矿种细分 · 所在省/国家 · 状态
  const sub = [m.g || m.m, m.p && !isNA(m.p) ? m.p : null, v(m.st)]
    .filter(Boolean).map(escHtml).join(' · ');
  return `<div class="arow${m.n === _assetSel ? ' on' : ''}" data-k="${escHtml(m.n)}" role="button" tabindex="0">
      <div class="arow-h"><b>${escHtml(m.n)}</b>
        <span class="arow-o">${m.scope === 'ov' ? '🌍' : '🇨🇳'}</span>
        <button type="button" class="aexp" data-k="${escHtml(m.n)}">展开</button></div>
      <div class="arow-s">${sub}</div></div>`;
}

/* 简介块清单：**选中的那条排第一**，紧随地图之后（同屏对照阅读）；其余仍按资源大类分组。 */
function renderAssetList(mines){
  const el = document.getElementById('assetList');
  if(!el) return;
  if(!mines.length){
    // 无点位公司的资产走省级矩阵等口径（火电），提示别只说「没有」，否则用户以为没数据
    const noPt = S.layer === 'power'
      ? '本视图下没有已收录的电站。该公司的火电资产以<b>省级装机矩阵</b>口径记载，见上方「公司研究」块。'
      : terms().noneTip;
    el.innerHTML = `<p class="mp-hint">${noPt}</p>`;
    return;
  }
  const sel = mines.filter(m => m.n === _assetSel)[0] || null;
  const by = {};
  for(const m of mines) if(m !== sel) (by[m.cate] = by[m.cate] || []).push(m);
  let h = '';
  if(sel) h += cateGroupHead(sel.cate, 1, '当前选中 · 与上图对照') + assetRowHtml(sel);
  for(const [k,nm,,] of CATES){
    const arr = by[k]; if(!arr) continue;
    h += cateGroupHead(k, arr.length) + arr.map(assetRowHtml).join('');
  }
  el.innerHTML = h;
  el.querySelectorAll('.arow').forEach(row=>{
    const pick = ()=>{
      const m = mines.filter(x => x.n === row.dataset.k)[0];
      if(m) selectAssetMine(m);
    };
    row.onclick = pick;
    row.onkeydown = e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); pick(); } };
  });
  // 「展开」= 单独一屏的完整档案（不再页内展开，个股页不会被撑长）
  el.querySelectorAll('.aexp').forEach(b=>{
    b.onclick = e => {
      e.stopPropagation();
      const m = mines.filter(x => x.n === b.dataset.k)[0];
      if(m) openAssetFull(m);
    };
  });
}

/* 选中一条矿区：把它的简介块**顶到清单第一位**，再把地图拉回顶部 ——
   于是「图在上、那一块紧随其后」正好落在同一屏里，不必上下翻。
   落点让开顶部吸顶的「公司研究 / 本公司硬资产」切换条（用 offsetHeight 量，不写死像素）。 */
function selectAssetMine(m){
  _assetSel = m.n;
  renderAssetList(assetMines());
  const wrap = document.querySelector('.mpmap');
  if(!wrap) return;
  const bar = document.getElementById('pageTabs');
  const top = (bar ? bar.offsetHeight : 0) + 8;
  const r = wrap.getBoundingClientRect();
  if(r.top < top - 2 || r.top > top + 2){
    window.scrollTo({top: window.scrollY + r.top - top, behavior:'smooth'});
  }
}

/* 展开 = 单独一屏的完整矿区档案（与地图抽屉同一份 mineHeadHtml / mineBodyHtml）。
   为什么单独一屏：页内展开会把个股页撑到很长，内嵌图表还要重排整个页面。 */
function openAssetFull(m){
  const box = document.getElementById('assetFull');
  if(!box) return;
  box.innerHTML =
    `<div class="fs-wrap"><div class="fs-head"><div class="dhead">${mineHeadHtml(m, false)}</div>` +
    `<button type="button" class="fs-close" id="fsClose">关闭</button></div>` +
    `<div class="dbody">${mineBodyHtml(m)}</div></div>`;
  box.hidden = false;
  bindMineBody(box, m, { onCompany: cd => gotoCompany(cd) });
  renderMineCharts(box, m);
  box.scrollTop = 0;
  document.getElementById('fsClose').onclick = closeAssetFull;
}

function closeAssetFull(){
  const box = document.getElementById('assetFull');
  if(!box || box.hidden) return;
  box.hidden = true;
  box.innerHTML = '';
  disposeMineCharts();          // 回收本屏内的 echarts 实例，反复开合也不泄漏
}

/* ---------------- 供浮动层调用的数据口径 ----------------
   map_kit 只问「有几类各几个 / 当前过滤下剩多少」，不自己读 DATA —— 数据口径留在本文件，
   界面留在 map_kit，两边不各算一遍。
   （原「侧栏」那三块 .sect 与 buildSidebar 的矿种 chips 260930 删除：同一份矿种筛选
     此前有 3 套实现 —— 底栏 8 格、侧栏大类列表、侧栏细分 chips。） */
/* 当前视野下的点位（**只看镜头范围**）。
   260930 起视野不再切数据 —— 世界底图上境内境外点位都在，filtered() 一律看全量；
   视野只决定「面板上这个大类有几个点落在镜头里」，故这里按经纬度框算，不换数据数组。 */
function scopeKey(){ return S.scope === 'world' ? 'ov' : 'cn'; }

/** 点位是否落在当前镜头范围内（中国框 / 世界）。仅用于面板计数，不参与过滤。 */
function inView(m){
  if(S.scope === 'world') return true;
  return inChina(m);
}

/* 当前视野下的点位数（**不含**分类/细分/搜索过滤）：面板上的计数要稳定，
   否则一点某个大类，其它大类的数字全变成 0，看不出还有多少。 */
function cateCounts(){
  const c = {};
  for(const m of allPoints()) if(inView(m)) c[m.cate] = (c[m.cate]||0)+1;
  return c;
}
/* 矿种细分：在大类选择范围内统计（选煤就只列煤下面的细分矿种） */
function groupCounts(){
  const c = {};
  for(const m of allPoints()) if(inView(m) && S.cate.has(m.cate)) c[m.g] = (c[m.g]||0)+1;
  return Object.entries(c).sort((a,b)=>b[1]-a[1]);
}
/* 面板底部的统计句：跟随搜索/过滤，读作「现在这一屏是什么」。
   260930 新增空态分支：**默认不选分类**（cate 空集）时图上 0 点位，
   此时若照旧写「本层 0 个点位 · 0 家关联企业」，读起来像是数据缺失或加载失败。
   故空集时改写成一句引导语，告诉用户「点位是被你（默认设置）藏起来的，点一下就出来」。
   搜索关键词非空时不算空态 —— 那是「搜不到」，另有 renderSearchEmpty() 的居中空态负责。 */
function statsHtml(){
  const rows = filtered();
  const comps = new Set();
  rows.forEach(m=>m.cos.forEach(x=>comps.add(x[1])));
  const kw = S.kw.trim();
  if(!S.cate.size && !kw){
    const t = terms();
    return `未选${t.cateTitle || '分类'}`;
  }
  let h = (kw ? '命中 ' : '本层 ') + `<b>${rows.length}</b> 个点位 · <b>${comps.size}</b> 家关联企业`;
  // 火电省级填色时，统计句里点明「按省填色」；色阶图例挂在常显的 #mpLegend（见 thermalLegendHtml）
  /* 261002-58：省级填色废弃，这句随之去掉（它描述的是装机→颜色的填色） */
  return h;
}

/* 把手行的短摘要（260930）：收起态下只有这一行可见，所以必须**极短**（几个字），
   长了会被 ellipsis 截断成「尚未选择矿种大类 —— 点上方任一…」反而看不清。
   完整引导语留在展开后的面板底部（#mpStat），两者分工：一行给「当前状态」，一句给「怎么做」。 */
function statsBrief(){
  if(!S.cate.size) return S.kw.trim() ? '搜索中' : '未选分类';
  const rows = filtered();
  return rows.length + ' 个点位';
}

/* 图例区回调：只有火电省级填色时才给内容，其余返回空串（宿主隐藏整块）。
   不能塞进 statsHtml —— 那句话在可折叠的 #mpPlant 里，折起来色阶就没了。 */
function legendHtml(){ return showThermal() ? thermalLegendHtml() : ''; }

/* ---------------- 过滤 ---------------- */
function filtered(){
  const kw = S.kw.trim().toLowerCase();
  const kwOn = !!kw;
  /* 分类筛选的两档口径（本次修）：
     · **没有关键词**：空集 = 未选分类 → 不画任何点（260930 的性能决策，781 点全画会掉到 ~18fps）；
     · **有关键词**：分类只在「非空」时才起限制作用 —— 否则「一进页面直接搜索」会恒 0 命中、
       弹出「未找到匹配」的假空态，而同一页的公司面板是按关键词独立过滤的，两处口径打架。
     细分（groups）本来就是「非空才过滤」，这里把两种筛选统一成同一语义。 */
  return allPoints().filter(m=>{
    if(!kwOn && !S.cate.has(m.cate)) return false;
    if(kwOn && S.cate.size && !S.cate.has(m.cate)) return false;
    if(S.groups.size && !S.groups.has(m.g)) return false;
    if(kw){
      /* 字段清单必须对齐「placeholder 承诺搜什么」：顶栏搜索框写的是
         「搜索矿区 / 省份 / 国家 / 企业 / 代码…」，而**电力层的省与流域**存在
         `prov` / `river` 两个字段里（硬资产用 `p` / `loc`）—— 原先 hay 里没有它们，
         实测电力层搜「山东」命中 0（261001 审计 P3 的核对结论）。 */
      const hay = (m.n+' '+m.p+' '+m.loc+' '+m.m+' '+m.g+' '+m.ow+' '+m.eq+' '+
                   (m.prov||'')+' '+(m.river||'')+' '+
                   m.cos.map(c=>c[0]+' '+c[1]).join(' ')+' '+m.nt).toLowerCase();
      if(!hay.includes(kw)) return false;
    }
    return true;
  });
}

/* ---------------- 地图合规叠加层（已移除，仅个人私有用途） ----------------
 * 原九段线（南海诸岛线）、南海诸岛标注、藏南"争议区"标注均在此处。
 * 九段线是中国全图法定必备要素，按用户要求仅作个人私有查看、不对外发布，故移除。
 * 藏南按中国领土渲染（已并入西藏边界），不再单列"争议区"描述。
 */

/* ---------------- 地图渲染 ---------------- */
/* 散点系列：按资源大类分系列。
   opts.focus  ：公司代码 —— 该公司的矿高亮放大，其余灰显缩小（地图页聚焦 / 个股页小图都用它）
   opts.firstHit：搜索首个命中，额外加一圈白底 + 名称标签
   地图页 render() 与个股页的「本公司资产」小图共用这一个函数，两处不会再各写一套散点样式。 */
/* ---------------- 把「一个点」铺到视野可见的各份上（第 1 条） ----------------
   与底图的耦合点：底图 world_tile 铺了 TILE_SPAN 份（经度 -720..+720），
   所以点位也必须铺到同样的份数，否则「拖到第 2 份」时底图在、点不在。
   展开份数 = TILE_SPAN，偏移序列与 build_tile.py 完全一致（-2,-1,0,1,2 个 360°）。
   每个副本都保留 __m 指向**同一个**原对象：点击/悬停拿到的都是原数据，
     不必反算经度 —— 这也是「点击命中」最简单可靠的做法。

   261002-61：**只铺落在窗口内的那几份**（判据见 CULL_REBUILD_DEG 处的注释）。
     窗口外的副本恒在屏幕外，写进 series 只是让 setOption 合并与 roam 变换白付 6/7 的开销。 */
function tilePts(arr, mk){
  const half = TILE_SPAN >> 1;
  const win = cullWindow();
  const out = [];
  for(const m of arr){
    if(!isFinite(m.lng) || !isFinite(m.lat)) continue;
    for(let k = -half; k <= half; k++){
      const x = m.lng + TILE_DEG * k;
      if(x < win[0] || x > win[1]) continue;      // 窗口外 → 恒在屏外，不写进 series
      out.push(mk(m, x));
    }
  }
  return out;
}

function buildSeries(byCate, opts){
  opts = opts || {};
  const FOC = opts.focus || null;
  const firstHit = opts.firstHit || null;
  const isFocused = m => FOC && m.cos.some(x => x[1] === FOC);
  return CATES.filter(([k])=>byCate[k]).map(([k,nm,col])=>{
    const hit = byCate[k].filter(isFocused);
    const dim = byCate[k].filter(m=>!isFocused(m));
    /* mk(arr) 把一组点摊成 echarts 的 data。第 2 参 dx 是「铺到哪一份」的经度偏移，
       由 tilePts 逐个副本传入 —— 单点高亮/标签只在**当前份**（离相机最近的那一份）上生效，
       免得同一公司出现 3 个白圈高亮。
       261002-61：原先判 `dx === m.lng`（即 k=0 那份），裁剪后 k=0 可能已被裁掉
       （相机在第 2 份时窗口里没有 k=0）→ 高亮失踪。改成「离相机 ±180 内那份」，
       副本间隔 360°，故恒命中唯一一份。 */
    const cAt = (_cullAt == null) ? S.cLng : _cullAt;
    const mkOne = (m, dx) => ({
      name:m.n, value:[dx, m.lat], __m:m,
      ...((m === firstHit && Math.abs(dx - cAt) <= TILE_DEG / 2) ? {
        symbolSize:14, zlevel:6,
        itemStyle:{color:'#ffffff', borderColor:D.accent, borderWidth:2.5, shadowBlur:16, shadowColor:D.accent},
        label:{show:true, formatter:m.n, color:'#ffffff', fontSize:11, fontWeight:'bold',
               backgroundColor:D.lblBg, padding:[2,6], borderRadius:3, position:'top'}
      } : {})
    });
    const mk = arr => tilePts(arr, mkOne);
    const base = {
      name: nm, type:'scatter', coordinateSystem:'geo',
      // 关闭动画：默认 animationDurationUpdate=300 会让散点比底图晚 300ms 到位，
      // 拖动时看起来「点和地图分开挪动、跟不上」。关掉后两者严格同帧。
      animation:false,
      emphasis:{ scale:1.5 }, zlevel:3,
      /* ---------------- 大数据量渲染参数（260930 加，260930 夜修正） ----------------
         移动端实测：~300 个 marker 开始偶发掉帧，800 个明显延迟，而本层国内点位
         有 700+ 个。基于此原先开了 `large:true`（把同系列的点合并成一次 canvas 绘制）。

         但 `large` 有一个**致命代价**：批绘制通道**不再为每个点生成独立图形**，
         echarts 因此失去**逐点命中能力** → 点矿点弹不出卡片（260930 夜实测：
         large:true 时点 marker 无反应，改成 false 立刻正常）。
         这与第 1 条平铺叠加后更严重：406 个原始点 × 7 份副本 = 2842 个绘制点。

         权衡结论：**正确性优先**。点矿点是本页最核心的交互（用户点一下要出卡片），
         「点了没反应」远比「拖动时掉几帧」严重。且拖动性能已由平铺层的
         `animation:false` / `hoverAnimation:false` 兜住，实测可接受。
         故这里**不再开 large**（largeThreshold 保留，含义是「低于此值仍走原通道」，
         现在恒走原通道，等于常量 true 阈值；留着不碍事，也不会误伤未来调参）。
         若将来点数暴涨到真的卡（>2000），正确做法是**视口裁剪**（只画窗口内的副本），
         而不是回头开 large —— 后者会让点击不报错地失效。 */
      large: false,
      largeThreshold: 200,
      // 关闭 hover 动画：780 个点里每次鼠标移动都触发一遍 scale 补间，是拖图卡顿的次要来源
      hoverAnimation: false,
    };
    if(!FOC){
      return Object.assign({}, base, {
        /* 261002-61 写的是 `symbolSize: ptSize()`（**求值一次**）—— 那是个静默失效的写法：
           series 只在 render() / recullSeries() 时重建，而**缩放过程不重建 series**
           （缩放走 dispatchAction geoRoam，见 zoomAt），所以点径会被冻在「打开页面那一刻」
           的值上：从世界视图(5px)缩进中国，点还是 5px —— 用户说的「不跟手」大半来自它。
           ⚠ 也不能改成「缩放结束时重建 series」：`setOption` 有 **~78 ms 地板**
             （`_cull_cost.mjs` 实测 `setOption({})` 空调用即 77.5 ms，与载荷无关），
             缩放一停就卡一下，更糟。
           ✅ 正确做法：**symbolSize 传函数**。echarts 每次渲染都逐项调用它，
              于是点径真正「跟着相机走」，且不需要任何 setOption。 */
        symbolSize: function(){ return ptSize(); },   // 261003-64 改成回调，才真正随 zoom 变
        itemStyle:{color:col, borderColor:D.ptBorder, borderWidth:1, shadowBlur:6, shadowColor:col},
        emphasis:{itemStyle:{color:'#ffffff', borderColor:col, borderWidth:2.5, shadowBlur:14, shadowColor:col}, scale:1.5},
        data: mk(byCate[k]),
      });
    }
    // 聚焦时拆成两个系列：高亮 + 灰显
    return [
      Object.assign({}, base, {
        name: nm, symbolSize: 15, zlevel: 5,
        // 聚焦时「本公司」的点通常只有几个，关掉 large 保住高亮放大效果
        large: false,
        itemStyle:{color:col, borderColor:'#ffffff', borderWidth:1.6, shadowBlur:14, shadowColor:col},
        emphasis:{itemStyle:{color:'#ffffff', borderColor:col, borderWidth:3, shadowBlur:20, shadowColor:col}, scale:1.4},
        data: mk(hit),
      }),
      Object.assign({}, base, {
        name: nm+'（其他）', symbolSize: 5, zlevel: 2,
        itemStyle:{color:D.other.marker, borderColor:D.other.border, borderWidth:.8, opacity:.55},
        emphasis:{itemStyle:{color:D.other.emphasis}, scale:1.3},
        data: mk(dim),
        tooltip:{show:false},
      }),
    ];
  }).flat();
}

/* geo 组件配置：地图页与个股页小图共用同一套底图观感（sea/area/border/emphasis） */
/* ---------------- 火电省级装机填色（电力层专有） ----------------
   火电**不建点位**（年报只按省 / 只按公司披露容量，没有逐站坐标）——
   34 家电力公司里有 16 家**完全没有点位**，它们的资产就是这张省级矩阵。
   260930 两图合并时整条链被漏掉（详情页只剩「无」）→ 这里补回：
   省级填色 + 省份悬停浮层 + 省份点击明细 + 色阶图例。
   色阶停点固定，颜色由 MAP_PALETTE.thermal.ramp 提供（与水电蓝 / 核电橙区分）。 */
const TH_STOPS = [0.00, 0.25, 0.50, 0.70, 0.85, 1.00];
const THPAL = D.thermal.ramp;
const TH_BD = D.bd3;

/* 当前层是否该按火电省级填色：电力层 + 选中火电 + 国内视野（省级只在境内有意义） */
/* 261002-58：**省级填色已废弃**（用户决定）。
   函数保留是因为 1257 / 1269 / 1642 / 1657 这几处还在调它 —— 直接删会 ReferenceError。
   恒返回 false = 「永远不在填色态」，调用方自然各自走非填色分支。
   ⚠ 火电**点位**不受影响：那是 118 个电站的散点，由 S.cate 含 thermal 筛出，
     与省级填色是两件事。 */
function showThermal(){ return false; }

/* 省名 → {cap, cos,…} 表（顶层 thermal.prov）。数据缺失时给空表，调用方自己判空。 */
function thermalProv(){ return (DATA.thermal && DATA.thermal.prov) || {}; }

/* 261002-58：省级填色已废弃 → 恒返回空数组（调用方判空即可）。 */
function thermalRegions(){ return []; }

/* 填色该写到哪一层（260930 复查修）
   geo[0] 是**世界平铺底图**，中国的省名在里面根本不存在 —— 它的中国要素名是
   `China__t+0` 这种（build_tile.py 复制时加了 `__t<offset>` 后缀），省名一个没有。
   故把 `{name:'北京', …}` 写进 geo[0].regions 等于全打空，填色**永远不生效**
   （260930 实测：regions 20 条进了 geo[0]，画面 md5 前后完全一致）。
   认省名的是 geo[1]（map:'china'，35 要素，name 就是「北京」「广东」）。
   ⇒ 填色一律写 geo[1]；geo[0] 只负责把它自己的 regions 复位（世界底图不参与填色）。

   关掉填色时两层都不能直接返回 `[]`：echarts 对**空数组**等于「没有项要改」，
      旧填色原地留着（实测 sticky）；必须拿上一次填过色的省逐个写回底图色。
      _thOn 只在填色态更新，复位后保持不变 —— 它相当于「上次擦过哪几个省」的备忘，不能清空。 */
let _thOn = [];
/* geo[1]（省界层）的复位色：它是**透明覆盖层**，透明回去即可，不能涂 GEO.area ——
   涂了就会把世界底图盖住（两层叠着，上层不透明就看不见下层）。 */
function thermalResetRegions(){          // geo[0] 用（虽然它本来也不接受省名，仍逐条复位以防万一）
  return _thOn.map(r => ({
    name: r.name,
    itemStyle: { areaColor: GEO.area, borderColor: GEO.border, borderWidth: BASE_BW },
  }));
}
function thermalResetProvRegions(){      // 省界用：透明回去 + 恢复省界描边
  return _thOn.map(r => ({
    name: r.name,
    itemStyle: { areaColor: 'transparent', borderColor: GEO.provBorder, borderWidth: .7 },
  }));
}

/* 按当前态算出该写进 geo[0].regions 的数组（世界侧复位；省界亦走 geo[0]，故同源） */
function thermalRegionsForState(){ return []; }      // 261002-58：填色废弃

/* 省界的填色：**这里才是真正生效的那一份**。
   自带 showThermal 判定 + 自更新 _thOn，不依赖 thermalRegionsForState 先被调用（顺序无关）。 */
function thermalProvRegionsForState(){ return []; }   // 261002-58：填色废弃

/* 色阶图例（装机 → 颜色）。挂在统计区下方；只有该层该分类才显示。 */
/* 261002-58：色阶图例描述的是「装机 → 颜色」的省级填色，
   填色没了，留着图例就是误导（用户看到色阶却找不到填色）→ 恒返回空。 */
function thermalLegendHtml(){ return ''; }

/* 省份点击 → 该省火电公司明细。并入普通选择流程（S.sel 走省份口径），
   面板由 map_kit 渲染：这里只把「选中省份」的表达给出去。 */
function thermalProvinceTip(name){
  const v = thermalProv()[name];
  if(!v) return `<div class="mp-th-t"><b>${name}</b></div>
    <div class="mp-th-n">未收录到火电披露数据</div>`;
  const cos = (v.cos || []).map(c =>
    `<div class="mp-th-c"><span>${c.name}</span><em>${c.cap.toLocaleString()} 万千瓦</em></div>`).join('');
  return `<div class="mp-th-t"><b>${name}</b> <em>${v.cap.toLocaleString()} 万千瓦</em></div>
    <div class="mp-th-n">已收录上市公司火电装机 · ${(v.cos||[]).length} 家</div>
    ${cos}`;
}

function geoBase(center, zoom){
  return {
    /* 恒用世界底图（260930 起）：境内 / 境外点位同在图上，视野差别只在 center+zoom。
       原先这里按 isCn 切 china/world 两张底图 —— 那正是「点国内却像换了张图」的根因，
       也是「从地球转进中国」做不到的原因（换底图只能硬跳变、无法补间）。 */
    map: 'world',
    /* roam:'move' = 只保留平移（拖拽），**缩放交给 bindFollowZoom 自实现**。
       原为 true（echarts 全接管），但它在 zrender 层把 pinch 比例写死成 1.1
       → 双指快速张开时 1.1 连乘、瞬间顶到上限，表现为「太灵敏、一点也不跟手」。
       详见 bindFollowZoom 注释。 */
    roam:'move', zoom: zoom * Z_SCALE,
    center: center,
    // min 放到 0.25：跨洲公司需要「缩到 1 倍以下」才装得下（同步 ×Z_SCALE，口径见 Z_SCALE 注释）
    scaleLimit:{min:ZOOM_MIN * Z_SCALE, max:ZOOM_MAX * Z_SCALE},
    selectedMode:false,
    itemStyle:{areaColor:GEO.area, borderColor:GEO.border, borderWidth:BASE_BW},
    /* 悬停 / 触摸国家时的名字标签：formatter 把平铺后缀剥掉（Mongolia__t+0 → Mongolia）。
       底图要素名必须带后缀（见 TILE_SUFFIX 注释），故只在显示层处理。
       ★ 261003-64：**省级要素不显示名字**（用户要求）。省名带 `·省` 后缀、剥掉后与国名
         混在一起毫无信息量，而且点省份本来就会弹明细卡，标签是多余的。
         判据用 PROV_KEY 匹配底图要素名，不靠 name 前缀猜。 */
    emphasis:{itemStyle:{areaColor:GEO.emphasis},
              label:{show:true, formatter:p=>tidyHoverName(p && p.name), color:D.tx, fontSize:11}},
    silent:false,
    label:{show:false},
  };
}

/* ---------------- 省界描边层（geoIndex:1，第 5 条） ----------------
   做法：在**世界底图之上**再挂一个 geo 组件，底图换成 china（34 省级多边形），
   只画边框、内部全透明，与主 geo（geoIndex:0）共享 center/zoom。
   为什么不把省界并进世界底图：world.geo.json 里中国只有一个 'China' 要素，
   省界是另一份数据集；合并两份 GeoJSON 又会在「世界视野」下把 34 条省界一起画出来。
   所以用叠加层 + 阈值显隐，数据零改动、世界视野零负担。

   关键点：省界的经纬度必须与主 geo 用**同一个投影/包围盒**，否则两层会错位。
   echarts 的 geo 是按各 map 自己的 boundingRect 铺满布局框的 —— 若 china 底图单独算包围盒，
   它会为了「自己装满布局框」而换一套缩放，与 world 层完全对不上。
   解法：给省界层写 `boundingCoords`，**显式钉死**与 world 一致的经纬度范围，
   让它放弃「自适应铺满」，从而与主 geo 逐像素对齐（见 min.js 的 uC()）。

   `map` 键**任何情况下都不能省**（260930 实测致崩）：
   echarts 的 getFilledRegions() 会对每个 geo 组件取 `zT(this.map).regions`，
   若某层的 map 为 undefined → 取到 undefined.regions → 抛
   「Cannot read properties of undefined (reading 'regions')」，
   且异常发生在 optionUpdated 阶段，**整页停加载态**（bootMapPage 之后的代码全不执行）。
   故显隐一律靠 `show` 开关，绝不靠「省略 map / 只写 {show:false}」。 */
/* 省界：**不再是第二个 geo，而是 geo[0] 自己 regions 里的一组**（261002-57）。
   ------------------------------------------------------------------
   为什么改：省界本不是另一张地图，而是「中国」这个要素的内部细节。
   原先做成 geo[1]（自带 center/zoom + roam:false 的独立相机），就注定要靠
   「同步」维持一致 —— 而同步必然滞后、必然有缝：
     · 拖动只改 geo[0]（echarts 的 roam 只作用在光标下的那一个 geo），
       拖动路径上**没有任何地方**同步 geo[1] → 拖多远省界落后多远；
     · 松手才由 wrapWindow 追一次 → 用户看到的就是「拖动时省界不动、松手才跳过去」
       （261002-56 反馈；261001-26 修过一次、只修到松手追回，根因没除）。
   现在省界与世界底图是**同一份 geoJSON 里的要素**（merge_prov.py 合并）：
   共用一套投影参数与一个相机 → **不存在「同步」这件事**，脱节在结构上不可能。
   显隐与填色仍走 echarts 官方的 regions 机制（按 properties.name 匹配），
   只不过写在 geo[0] 上。 */
/* 省界：**不再是第二个 geo，而是 geo[0] 里的一组要素**（261002-57 数据同源）。

   261002-58 起**不再做省级填色**（用户决定）。原因：省界并入世界底图后，
   中国陆地面与 34 省的 polygon 完全重叠，同层绘制时中国那个大面把省界的
   **区域色**盖住了（实测：填色态与无填色态的 getDataURL 完全相同）。
   描边不受影响（画在边界像素上），故只保留描边。

   → 本函数只需按 `show` 决定描边是否可见，不再区分填色态。
   ⚠ 显隐**必须每次显式下发**：echarts 的 setOption 是合并语义，省略该键 = 保持
     上次的值（260001 踩过：省界一旦显示就再也不消失）。 */
function provRegionsOpt(show){
  /* 清单从**底图自己的 regions** 反查（省界是底图的一部分，清单就该跟着底图走）。
     不能取自 thermalProv() —— thermal 只在 power 层的数据里，hard 层直接 undefined
     （261002-57 实测：provRegionsOpt 返回 0 条 → 一条省界都没有）。 */
  let _all = [];
  try {
    const _cs = chart.getModel().getComponent('geo', 0).coordinateSystem;
    _all = (_cs && _cs.regions) || [];
  } catch (e) { _all = []; }
  const provNames = _all
    .map(r => r && r.name)
    .filter(nm => nm && nm.indexOf(PROV_KEY) >= 0)
    .map(nm => nm.slice(0, nm.indexOf(PROV_KEY)))
    .filter((nm, i, arr) => arr.indexOf(nm) === i);
  /* 平铺后要素名带副本后缀（'北京·省__t-720' … '__t+720'），
     regions 的 name 逐值匹配，故每个省要展开成 TILE_SPAN 份。
     ⚠ 261003-64 修一处真 bug：原来 k=0 拼出的是 `__t0`，而底图用的是
       `'%s__t%+d'`（build_tile.py:89）→ `__t+0`。**两者对不上**，
       于是 k=0 那一份（就是中国所在的那份）永远匹配不到名单 → 不继承「隐藏」样式，
       回落到 geo.itemStyle 的默认描边 → **任何比例尺下省界都在**（用户报「世界大小也显省界」）。
       同时每次 setGeo 还白写 34 条 `__t0` 条目（底图里没有这个要素）。
       判据：suffix 必须与 build_tile.py 的 `'%s__t%+d'` 逐字符一致 —— 改那边就要改这里。 */
  const _half = Math.floor(TILE_SPAN / 2);
  const out = [];
  for (let k = -_half; k <= _half; k++) {
    const suffix = '__t' + (k >= 0 ? '+' : '') + (k * 360);
    for (let i = 0; i < provNames.length; i++) {
      out.push({
        name: provNames[i] + PROV_KEY + suffix,
        itemStyle: show
          ? { areaColor: 'transparent', borderColor: GEO.provBorder, borderWidth: .7 }
          : { areaColor: 'transparent', borderColor: 'transparent', borderWidth: 0 },
      });
    }
  }
  return out;
}

/* ---------------- geo 写入统一（第 5 条引入） ----------------
   关键：**同一件事只有一份实现**。省界层要跟主 geo 的 center/zoom 逐帧同步，
   若在每个 setOption 处各写一遍「主 geo + 省界 geo」，就是本项目反复踩过的
   「下拉 7 套 / 页面条 7 套」的重演 —— 漏一处就错位。
   故所有镜头写入一律走这里，由它**同时**下发 geo[0] 与 geo[1]。

   第 1 条（横向无限平铺）也统一在这里：center 的经度一律经 `norm360()` 归一，
   而 boundingCoords 恒取 `tileWindow(cLng)`（覆盖 TILE_SPAN 份底图）。
   调用方只管给「想要的经度」（可以超过 ±180，代表拖到第几份），本函数负责
   把底图/省界层/窗口三者对齐到同一份上 —— 各调用点不再各算一遍。

   用法：
     setGeo({center:[..], zoom:3})          只改镜头（省界层自动跟随）
     setGeo({regions:[...]})                只改主 geo 的省级填色（省界层不动）
     setGeo(opt, true)                      整表替换（render 全量重建时用）
   省界显隐按 `zoom >= PROV_SHOW_ZOOM` 判定：这里**每次都显式写 show**，
   绝不靠「省略该键」来隐藏 —— echarts 的 setOption 是合并语义，省略 = 不改，
   上一次的 show:true 会粘住（与 regions 粘滞同类的坑）。

   火电填色的归属（260930 复查修）：`regions` 只有写在 **geo[1]**（map:'china'）上才认省名，
   geo[0] 是世界底图（要素名 `China__t+0`，无省名）—— 写它上面等于打空。
   故只要本次涉及样式（非纯镜头），一律**两层同发**：geo[0] 拿复位数组、geo[1] 拿填色数组。 */
function setGeo(opt, notMerge){
  if(!chart) return;
  const o = Object.assign({}, opt || {});
  // 只有真正动了镜头（center / zoom）才需要带着省界层重算一次
  const touchedCam = ('center' in o) || ('zoom' in o);
  if(touchedCam){
    const k0 = cam();
    let c = ('center' in o) ? o.center : (k0.c || VIEW_DEF[S.scope].c);
    /* 从 option 读回 zoom 要**除掉 Z_SCALE** 还原成用户语义值（写回时 geoBase 会再乘上去），
       否则每读一次就 ×Z_SCALE 一次，几次下来就顶到上限了。
       cam() 已做掉这一除，故这里不再 ÷Z_SCALE。 */
    const z = ('zoom' in o) ? o.zoom
            : ((k0.z == null) ? VIEW_DEF[S.scope].z : k0.z);
    /* 记账经度恒归一在 [-180,180)。调用方给的经度若已是规范值（VIEW_DEF 的 40/104），
       用 tileLng 贴到「离当前 cLng 最近的那一份」上；若给的是绝对值（zoomAt / wrapWindow），
       norm360 会把它折回一份内 —— 两者都收敛到「一份内」这个唯一表示（第 1 条的口径）。 */
    if(Array.isArray(c)){
      S.cLng = norm360(tileLng(c[0], S.cLng));
      c = [S.cLng, c[1]];
    }
    /* 写进 echarts 的 zoom 必须 ×Z_SCALE（口径见 Z_SCALE 注释）。
       调用方一律用**用户语义值**（1.2 = 世界全图），乘算是本函数的职责 ——
       与 geoBase 内部那一乘同源，但本路径不经过 geoBase（直接组装 o），
       所以必须在这里补上；漏了会让切视野后 zoom 停在旧值（260930 实测踩过）。 */
    /* 用户语义 zoom 在这里**夹到 ZOOM_MIN / ZOOM_MAX**：echarts 的 scaleLimit 只约束
       **手势**缩放，程序性 setOption 不受它管（实测 setGeo({zoom:0.2}) 会真的生效），
       所以每条路径都要在本函数夹一次 —— 否则聚焦 / 深链 / 补间仍能把底图缩成一条线。
       zc 同时给下面的省界层阈值判断用，保证「几何」与「省界显隐」两处读数一致。 */
    const zc = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    if('zoom' in o) o.zoom = zc * Z_SCALE;
    // 窗口跟着记账经度走：底图/点位在 ±360 处有同构副本，故任何一份都能无缝接上
    const win = tileWindow(S.cLng);
    const bounds = [[win[0], 83.56], [win[1], -55.78]];
    o.center = c;
    o.boundingCoords = bounds;
    /* 261002-57：省界不再是 geo[1]，而是 geo[0].regions 里的一组。
       显隐按 zoom 阈值，填色按火电态 —— 两者合成同一份 regions 写进 o。 */
    o.regions = provRegionsOpt(zc >= PROV_SHOW_ZOOM);
    chart.setOption({geo:o}, !!notMerge);
  } else {
    /* 只改了样式类键（regions / itemStyle / show…）。
       261002-57：省界也是 o.regions 的一部分，故样式路径要带上一次的显隐态重算，
       否则「只切填色不改镜头」会把省界的描边状态一起抹掉。 */
    if('regions' in o){
      const k0 = cam();
      const zNow = (k0.z == null) ? VIEW_DEF[S.scope].z : k0.z;
      o.regions = provRegionsOpt(zNow >= PROV_SHOW_ZOOM);
    }
    chart.setOption({geo:o}, !!notMerge);
  }
  /* 镜头变了就把悬停气泡钉回它描述的那个点：缩放、拖动、聚焦三条路径都经由本函数，
     在这一处统一，避免每个调用点各写一遍。 */
  placeTip();
}

/* 当前过滤下的 series —— render 与「重铺点位」共用这一份，两处不会再各写一套
   （裁剪窗口换了要重铺，见 recullIfDrifted）。装配口径只有这里一处。 */
function curSeries(){
  const rows = filtered();
  const kwOn = !!S.kw.trim();
  // 搜索首个命中：地图上高亮它并平滑跳转到全部命中点位（仅非聚焦时；聚焦优先级更高）
  const firstHit = (kwOn && !S.focus && rows.length) ? rows[0] : null;
  const byCate = {};
  for(const m of rows) (byCate[m.cate] = byCate[m.cate] || []).push(m);
  return buildSeries(byCate, {focus:S.focus, firstHit});
}

/* 只重铺点位（不动 geo）。为什么单独开一条而不是调 render()：
   漂移重铺发生在**拖动过程中**，而 render() 是整表 setOption（含 geo 重建，实测一帧 316ms），
   在拖动路径上来这么一下会明显顿一下；只换 series 则跳过 geo 重建那一半。
   ⚠ 用 merge（不是 notMerge）：geo / backgroundColor 都已在图上，整表替换会把它们清掉。 */
function recullSeries(){
  if(!chart || !DATA) return;
  const k0 = cam();
  _cullAt = (k0.c && isFinite(k0.c[0])) ? k0.c[0] : S.cLng;   // 绝对经度，见 _cullAt 注释
  chart.setOption({series: curSeries()});
}

/* 相机漂出裁剪窗口的保险：超阈值就重铺一次 series。
   挂在 georoam 上 —— 它每帧都跑（只做记账），多一次减法与一次比较，代价可忽略；
   阈值 CULL_REBUILD_DEG=240° 远小于窗口半宽 540° 减去一屏（59°），故不会漏。 */
function recullIfDrifted(){
  if(!chart || _cullAt == null) return;
  const k0 = cam();
  if(!k0.c || !isFinite(k0.c[0])) return;
  if(Math.abs(k0.c[0] - _cullAt) <= CULL_REBUILD_DEG) return;
  recullSeries();
}

function render(){
  // 读 cLng 前先补齐拖拽记账（第 1 条）：用户在图上拖过、还没松手就切了分类时，
  // 不补就会用「上一次同步时的份」把镜头弹回去。幂等，代价可忽略。
  if(chart && chart.getZr() && chart.getZr().__mpSyncCLng) chart.getZr().__mpSyncCLng();
  const rows = filtered();
  /* 铺点前先把裁剪窗口钉在**当前相机的绝对经度**上（见 _cullAt 注释）：
     记账值 S.cLng 是 norm360 后的规范经度，会丢掉「眼下在第几份」，
     拿它当窗口中心会把点位铺到错误的份上（拖到东半球后点位整片消失）。 */
  const k0c = cam();
  _cullAt = (k0c.c && isFinite(k0c.c[0])) ? k0c.c[0] : S.cLng;
  const series = curSeries();

  /* 镜头状态（260930 重写）：**一张世界底图**，world/china 只是 center+zoom 不同。
     原先 isCn 决定加载哪张底图（china/world 两张），切视图 = 换底图，只能硬跳变；
     现在底图恒定，切视图走 animateGeoTo 平滑补间 → 「从地球转进中国」。
     · 新聚焦：中心落到该公司全部点位的包围盒中心（缩放交给 fitFocusView）；
     · 切视野：补间到该视野的默认 center/zoom；
     · 其余局部刷新：读回当前 center/zoom 原样写回，保留用户手动视角。 */
  const scopeChanged = (_lastScope !== null && _lastScope !== S.scope);
  const focusChanged = (S.focus !== _lastFocus);
  _lastScope = S.scope; _lastFocus = S.focus;
  const DEF = VIEW_DEF[S.scope];
  let geoCenter, geoZoom;
  /* 跨洲公司的聚焦中心要取「平铺几何」而不是原始经度：
     例如一家公司矿区横跨 170°E 与 -170°E，原始值算出来中心在 0°（地球另一边）。
     先把每个点的经度贴到当前记账份上（tileLng），再取包围盒中心，才落在视野附近。 */
  if(S.focus && focusChanged){
    const ms = DATA.comp[S.focus] ? DATA.comp[S.focus].mines : [];
    if(ms.length){
      const lngs = ms.map(m=>tileLng(m.lng, S.cLng)), lats = ms.map(m=>m.lat);
      geoCenter = [(Math.min(...lngs) + Math.max(...lngs)) / 2,
                   (Math.min(...lats) + Math.max(...lats)) / 2];
    }
  }
  let animate = false;
  if(geoCenter == null){
    if(scopeChanged){
      geoCenter = DEF.c; geoZoom = DEF.z; animate = true;   // 切视野：平滑飞过去
    } else {
      /* 相机走 cam()（A7 唯一读法）。注意本行在下面的 cancelGeoTween() **之前**执行 ——
         若此刻正有补间在飞，cam() 给的是**目标值**：用户已经表达了「我要这个视野」，
         render 就该落到目标上，而不是把镜头钉回补到一半的位置（读实时值会那样）。
         经度仍优先用记账值（第 1 条）：cam().c 只有规范值，用它会让「拖到第 2 份后
         切个分类」把镜头弹回第 1 份。 */
      const k0 = cam();
      geoCenter = [(isFinite(S.cLng) ? S.cLng : DEF.c[0]),
                   (k0.c && isFinite(k0.c[1])) ? k0.c[1] : DEF.c[1]];
      /* zoom 也要夹（同 setGeo 的理由）：旧 hash / 旧会话状态里可能留着
         < ZOOM_MIN 的 zoom，不夹的话一次 render 就能把底图打回「一条线」。 */
      geoZoom  = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX,
                   (k0.z == null) ? DEF.z : k0.z));
    }
  }
  if(geoZoom == null) geoZoom = DEF.z;
  cancelGeoTween();            // 全量重建前先停掉在飞的补间，避免它反过来覆盖新视图

  if(animate){
    // 切视野：只改 geo.center/zoom（series 不变，底图不动）→ 视觉上就是镜头飞过去
    // 必须一并归位 regions：animateGeoTo 内部是 setOption 合并（非 notMerge），
    //   不显式处理就会把上一次的省界描边留在世界视野上（260930 实测的粘滞 bug）。
    // 261002-58：这里原先下发的是省级填色数组，填色废弃后改发省界描边
    //   （按本次目标 zoom 判定显隐，与 setGeo 内部口径一致）。
    setGeo({regions: provRegionsOpt(geoZoom >= PROV_SHOW_ZOOM)});
    animateGeoTo(geoCenter, geoZoom);
  } else {
    /* 261002-58：这里原先是「火电省级填色」，已按用户决定废弃 ——
       改为下发省界描边（省界与国界同源，都写 geo[0] 的 regions）。
       ⚠ 不能「省略该键」、也不能传空数组：二者在 echarts 的合并语义下都等于不改，
         上次的描边状态会粘住（260930 实测的粘滞 bug）。 */
    const geoOpt = geoBase(geoCenter, geoZoom);
    geoOpt.regions = provRegionsOpt(geoZoom >= PROV_SHOW_ZOOM);
    /* 整表替换（notMerge=true）时，boundingCoords 必须在这里显式给全 ——
       否则用 geoBase 里不带该项，echarts 会按 map 自己的包围盒重算，
       平铺底图（经度 -720..+720）就会被压成「一份」，整条平铺链失效。 */
    const win = tileWindow(S.cLng);
    const bounds = [[win[0], 83.56], [win[1], -55.78]];
    geoOpt.boundingCoords = bounds;
    /* center 的经度写**记账值原值**（不 norm360）：echarts 接受任意大的 center，
       而只有绝对值才和 boundingCoords、series 点位落在同一个坐标系里；
       归一成 [-180,180) 反而会让位置偏离窗口（第 1 条，260930 修）。 */
    geoOpt.center = [S.cLng, geoCenter[1]];
    /* 261002-57：省界填色与显隐都在 geoOpt.regions 里（省界已并入世界底图）。
       notMerge=true 整表替换时必须显式带上，否则会被清掉。 */
    geoOpt.regions = provRegionsOpt(geoZoom >= PROV_SHOW_ZOOM);
    chart.setOption({
      /* 画布底色 = 海/底（GEO.sea）。原为 'transparent' —— 那时只画陆地不画海，
         而陆地色（light #e6ebf1）与页面底色（#f5f6f8）只有 1.09 反差，整块底图等于消失，
         只剩一堆彩色矿点浮在白底上（260922-11 用户反馈「地图显示不出来」）。
         现在三套主题的 sea/area/border 都在 MAP_PALETTE 里配好了对比度。 */
      backgroundColor: GEO.sea,
      /* 261002-57：geo 是**单层** —— 省界已并入世界底图，不再是第二个 geo。
         notMerge=true 整表替换，regions 已在 geoOpt 上组装好（含显隐与火电填色），
         不要在这里重算，否则刚设好的会被这份「干净」的覆盖掉。 */
      geo: geoOpt,
      tooltip:{show:false},
      series,
    }, true);
  }

  // 聚焦：仅「新聚焦」或「切换视野」时重算并平滑补间，避免局部刷新（切分类/搜索）把已聚焦视图又闪一下。
  if(S.focus && (focusChanged || scopeChanged)) fitFocusView(true);
  // 搜索（非聚焦）：把视图平滑对齐到全部命中点位，实现「跳到首个匹配」（每次输入幂等，小幅变化被 snap 守卫吃掉）
  else if(S.kw.trim() && rows.length) fitFocusView(true, rows);

  // 界面全部交给单一真相源 map_kit：分类面板（大类 + 细分）/ 公司面板 / 统计句。
  // #statTop/#scopeCap（顶栏统计）四处，改一处漏一处。
  if(window.MPK) MPK.renderAll();
  renderSearchEmpty(rows);
  renderFocusBar();
  /* 视野/筛选变化后同步地址栏（内部已去抖）。
     ★ 补间在飞时这里**必须**保留：syncHash 会写 _geoGoal（补间目标）而不是此刻的中间帧；
       「补间结束再确认一次」由 animateGeoTo 的 step 负责 —— 两处各司其职，别删这里的。 */
  syncHash();
  /* 状态重算完毕 → 广播一次（A7 的提交点之一：另一处是 applyLayer 落数据）。
     订阅方抛错被 commit 吞掉，不影响渲染。 */
  MP_STORE.commit('render');
  placeTip();                 // 全量重建后同样要把气泡钉回点位（镜头可能刚被改过）
}

/* 搜索无结果的居中空态（原挂在底栏的 renderFoot 里，底栏删除后单列一条） */
function renderSearchEmpty(rows){
  const box = document.getElementById('srchEmpty');
  if(!box) return;
  const kw = S.kw.trim();
  if(kw && !rows.length){
    box.innerHTML = `未找到匹配「${escHtml(kw)}」的点位`;
    box.style.display = 'flex';
    return;
  }
  /* 首屏那句居中引导已删除（用户 261001：地图中间不能压字）。
     「还没选矿种」由底部把手行的摘要说明（未选矿种大类），不再占地图中央。 */
  box.style.display = 'none';
}

/* renderTopStats / renderFoot 260930 删除：顶栏统计与「底栏 8 格大类筛选行」都是
   app/map_kit.py 浮动层的重复实现（矿种面板 + 面板底部统计句）。底栏删除后，
   「搜索无结果」的空态单列成 renderSearchEmpty()，就在 render() 下面。 */

/* 全量重置：浮动层右上按钮组里的「重置」调它（map_kit 的 cfg.resetAll）。
   重置要把**两处**输入一起清掉：本文件的 S，和 map_kit 面板里那两个输入框
   （原生控件是真值源，不清就会「状态已重置但框里还留着上次的词」）。
   260930：分类重置为**空集**（不是「全部」）—— 与「默认不画点」一致。
      重置后必须把 `_picked` 一并退回 false，否则重置完再切层回来会「记得你选过」，
      进层即按空集过滤却走「保留用户选择」分支，行为自相矛盾。 */
function resetAll(){
  S.cate = new Set();                     // 分类回「全不显示」（默认态）
  S._picked = {};                         // 两层都退回「没动过筛选」
  S.groups.clear(); S.kw = ''; S.sel = null; S.focus = null;
  const s = document.getElementById('search'); if(s) s.value = '';
  const cp = document.getElementById('cpSearch'); if(cp) cp.value = '';
  if(window.MPK){ MPK.closeSheet(); MPK.closeComp(); }
  closeDrawer();
  resetView();    // S.focus 已清，这里走的是「相机回默认视角」分支
  render();
}

/* ---------------- 悬停气泡 ----------------
   只有悬停这一种形态：点一下矿点由 map_kit 的矿点卡片接管（要完整档案再点卡片里的按钮）。
   原来的「点击钉住气泡 + 气泡里再点一次才开详情」是两级跳，260930 删掉。 */
/* 当前气泡描述的点位：地图缩放/平移后据此重算气泡位置（见 placeTip）。
   原先气泡只在悬停那一刻按鼠标位置摆一次，触屏上 mouseout 不会来，
   于是缩放后气泡停在原地、与它描述的点脱开 —— 用户反馈的正是这个。 */
let _tipM = null;
function hideTip(){
  _tipM = null;
  const t = document.getElementById('tip'); if(t) t.style.display = 'none';
}
/* 把气泡钉回它描述的那个点：地图镜头一变就调用（幂等；气泡没显示时直接返回）。
   用 convertToPixel 把点的经纬度换成屏幕坐标，因此拖动、缩放、补间全都跟得上。 */
function placeTip(){
  const t = document.getElementById('tip');
  if(!t || !_tipM || t.style.display === 'none') return;
  let q = null;
  try{ q = chart.convertToPixel({geoIndex:0}, [tileLng(_tipM.lng, S.cLng), _tipM.lat]); }catch(e){}
  if(!q || !isFinite(q[0]) || !isFinite(q[1])) return;
  const w = 290, h = t.offsetHeight;
  let x = q[0] + 16, y = q[1] + 14;
  const R = document.getElementById('mapwrap').getBoundingClientRect();
  if(x + w > R.width) x = q[0] - w - 14;
  if(y + h > R.height) y = q[1] - h - 12;
  t.style.left = Math.max(6, x) + 'px';
  t.style.top  = Math.max(6, y) + 'px';
}
/* 点开矿点卡后，把该点挪到「卡片上方可视区的中部」：卡片是贴底出现的，若被点的矿点
   正好在屏幕下缘，卡片一出来就把它盖住 —— 观感是「我点了个点，什么也没发生」
   （261001 交互审计 P1）。用屏幕位移折算经纬度（与 fitFocusView 同一套线性近似），
   一次落位，不做来回试探。 */
function centerMineForSheet(m){
  if(!chart || !m) return;
  const el = document.getElementById('map');
  const W = (el && el.clientWidth) || 0, H = (el && el.clientHeight) || 0;
  if(!W || !H) return;
  let q = null, tl = null, br = null;
  try{ q  = chart.convertToPixel({geoIndex:0}, [tileLng(m.lng, S.cLng), m.lat]); }catch(e){}
  try{ tl = chart.convertFromPixel({geoIndex:0}, [0, 0]); }catch(e){}
  try{ br = chart.convertFromPixel({geoIndex:0}, [W - 1, H - 1]); }catch(e){}
  if(!q || !isFinite(q[0]) || !isFinite(q[1]) || !tl || !br) return;
  const tx = W / 2, ty = H * 0.32;                   // 目标：水平居中、垂直偏上（下方留给卡片）
  const dx = q[0] - tx, dy = q[1] - ty;
  if(Math.abs(dx) < 24 && Math.abs(dy) < 24) return;  // 已在附近 → 不动镜头（免得每次点击都晃）
  const perLng = (br[0] - tl[0]) / (W - 1);           // 度 / 像素（向右经度增大）
  const perLat = (tl[1] - br[1]) / (H - 1);           // 度 / 像素（向上纬度增大）
  if(!isFinite(perLng) || !isFinite(perLat) || !perLng || !perLat) return;
  const k0 = cam();
  const lat0 = (k0.c && isFinite(k0.c[1])) ? k0.c[1] : VIEW_DEF[S.scope].c[1];
  const z = (k0.z == null) ? VIEW_DEF[S.scope].z : k0.z;
  animateGeoTo([S.cLng + dx * perLng, lat0 + dy * perLat], z);
}
function showTip(m, ev){
  const t = document.getElementById('tip');
  const col = CMAP[m.cate][2];
  t.innerHTML = `<div class="t"><span class="dot" style="background:${col};width:9px;height:9px;border-radius:2px;display:inline-block"></span>${m.n}</div>
    <div class="r"><b>${m.g}</b> · ${KIND[m.kind]||''} · ${m.st||'—'}</div>
    <div class="r">${m.p}${m.loc?' · '+m.loc:''}</div>
    ${m.res&&!isNA(m.res)?`<div class="r" style="margin-top:3px">资源：${m.res}</div>`:''}
    ${m.gr&&!isNA(m.gr)?`<div class="r">品位：${m.gr}</div>`:''}
    ${m.cos.length?`<div class="r" style="margin-top:3px;color:${D.link}">▸ ${m.cos.map(c=>c[0]).join('、')}</div>`:''}
    <div class="r" style="margin-top:4px;color:var(--tx3);font-size:10.5px">点击查看矿产介绍</div>`;
  t.style.display='block';
  const w=290, h=t.offsetHeight;
  // 触屏点击时 zrender 事件不一定带 offsetX，兜底取 zrX/zrY（相对画布，与 #mapwrap 同坐标系）
  const ex = (ev && ev.offsetX != null) ? ev.offsetX : ((ev && ev.zrX != null) ? ev.zrX : 0);
  const ey = (ev && ev.offsetY != null) ? ev.offsetY : ((ev && ev.zrY != null) ? ev.zrY : 0);
  let x = ex + 16, y = ey + 14;
  const R = document.getElementById('mapwrap').getBoundingClientRect();
  if(x + w > R.width) x = ex - w - 14;
  if(y + h > R.height) y = ey - h - 12;
  t.style.left = Math.max(6,x)+'px';
  t.style.top  = Math.max(6,y)+'px';
  _tipM = m;                    // 记住点位：之后地图一动就用 placeTip 把它钉回来
}

/* 省份悬停浮层（火电省级填色时）。与 showTip 同一套定位，只是内容换成「该省已收录装机」。
   老电力图的原型；260930 合并补回。 */
function showProvTip(name, ev){
  const t = document.getElementById('tip');
  const v = thermalProv()[name];
  if(v){
    t.innerHTML = `<div class="t">${name}</div>
      <div class="r" style="color:${D.tx2}">已收录上市公司火电装机</div>
      <div class="r"><b style="color:${D.cate.thermal};font-size:14px">${v.cap.toLocaleString()}</b>
        <span style="color:${D.tx3}"> 万千瓦</span></div>
      <div class="r" style="color:${D.tx3};font-size:10.5px">${(v.cos||[]).length} 家公司</div>`;
  } else {
    t.innerHTML = `<div class="t">${name}</div>
      <div class="r" style="color:${D.tx3};font-size:11.5px">未收录到火电披露数据</div>`;
  }
  t.style.display='block';
  const w=290, h=t.offsetHeight;
  const ex = (ev && ev.offsetX != null) ? ev.offsetX : ((ev && ev.zrX != null) ? ev.zrX : 0);
  const ey = (ev && ev.offsetY != null) ? ev.offsetY : ((ev && ev.zrY != null) ? ev.zrY : 0);
  let x = ex + 16, y = ey + 14;
  const R = document.getElementById('mapwrap').getBoundingClientRect();
  if(x + w > R.width) x = ex - w - 14;
  if(y + h > R.height) y = ey - h - 12;
  t.style.left = Math.max(6,x)+'px';
  t.style.top  = Math.max(6,y)+'px';
}

/* ---------------- 矿区详情 ---------------- */
function na(v){ return (!v || isNA(v)) ? '<span class="v na">未公开</span>' : `<span class="v">${v}</span>`; }
/* ---------------- 矿区详情（地图抽屉与个股页共用同一份实现） ----------------
   与公司视图同理：head / body / bind 三段。抽屉装进 #dhead + #dbody，
   个股页装进页内面板（点小图标记或点清单条目时展开）。 */
function mineHeadHtml(m, withClose){
  const col = CMAP[m.cate][2];
  /* 省份字段两层不同名：硬资产是 p，电力（power.json）是 prov；种类同理
     （硬资产 m，电力只有流域/集团 g）。只认前者会让水电档案抬头印出
     「📍 undefined · 宜昌市… | undefined」（261001-17 实测）。 */
  const prov = m.p || m.prov || '';
  return `
    <span class="tag" style="background:${col}22;color:${col};border:1px solid ${col}55">
      ${CMAP[m.cate][1]} · ${KIND[m.kind]||KIND_CATE[m.cate]||'矿山'}${m.scope==='ov'?' · 境外':''}</span>
    <h2>${m.n}</h2>
    <div class="sub">📍 ${prov}${m.loc?' · '+m.loc:''} &nbsp;|&nbsp; ${m.m||m.g||''}
      ${m.lv?`<span class="badge b-low">${m.lv}</span>`:''}</div>`
    + (withClose ? `<button class="dclose" onclick="closeDrawer()" title="收起（回到矿点小卡）">▾</button>` : '');
}

function mineBodyHtml(m){
  let h = '';
  // 按对象类型切换字段标签（油气田没有"品位"，工厂没有"矿床类型"）
  const isGas = m.kind === 'gasfield';
  const isPlant = (m.kind === 'smelter' || m.kind === 'refinery' || m.kind === 'plant');
  /* 电力层：字段语义与矿山完全不同（res 是库容/机组、gr 是发电与调节性能、
     dt 全为空），照矿山那套标签会读出「品位 未公开」。 */
  const isPower = !!KIND_CATE[m.cate];
  const L = {
    st: isPlant || isPower ? '运行状态' : '开发状态',
    res: isGas ? '储量 / 资源量' : (isPlant ? '原料与产能背景' : (isPower ? '规模指标' : '资源量 / 储量')),
    gr: isGas ? '水深' : (isPower ? '发电 / 调节' : '品位'),
    dt: isGas ? '油气类型' : (isPlant ? '工艺 / 环节' : '矿床类型'),
    ow: isPlant ? '运营主体' : '矿权 / 运营主体',
    cap: isPlant ? '产能' : (isPower ? '装机' : '产能 / 规模'),
  };
  /* 分组标题：小卡只给关键数，完整字段在这里按用途分段。
     原先是一列平铺的键值，十几项连在一起，找一个字段要通读一遍。 */
  h += `<div class="sec-t">核心指标</div>`;
  h += `<div class="grid2" style="margin-bottom:15px">
      <div class="box"><div class="k">${L.st}</div><div class="v">${m.st||'—'}</div></div>
      <div class="box"><div class="k">${L.cap}</div><div class="v">${m.cap&&!isNA(m.cap)?m.cap:'—'}</div></div>
    </div>`;
  h += `<div class="kv"><div class="k">${L.res}</div>${na(m.res)}</div>`;
  if(!isPlant) h += `<div class="kv"><div class="k">${L.gr}</div>${na(m.gr)}</div>`;
  /* 电力点位没有 dt（74 个水电站实测填充率 0），挂一行恒为「未公开」的矿床类型是纯噪音 */
  if(!isPower) h += `<div class="kv"><div class="k">${L.dt}</div>${na(m.dt)}</div>`;
  h += `<div class="kv"><div class="k">${L.ow}</div>${na(m.ow)}</div>`;
  h += `<div class="kv"><div class="k">股权结构</div>${na(m.eq)}</div>`;
  h += `<div class="sec-t">数据说明</div>`;
  if(m.nt && !isNA(m.nt))
    h += `<div class="kv"><div class="k">备注</div><div class="v hl">${m.nt}</div></div>`;
  if(m.geo)
    h += `<div class="kv"><div class="k">坐标精度</div><div class="v" style="color:var(--tx3);font-size:12px">${m.geo} · ${m.lng.toFixed(3)}, ${m.lat.toFixed(3)}</div></div>`;

  /* ---- 深化字段：产品形态 ---- */
  h += `<div class="sec-t">产品与权属</div>`;
  if(m.prod)
    h += `<div class="kv" style="margin-top:16px"><div class="k">产品形态</div>
          <div class="v" style="color:${D.link}">${m.prod}</div></div>`;

  /* ---- 深化字段：穿透股权（带比例条 + 母子平台穿透链路）---- */
  if(m.eqs && m.eqs.length){
    // 检测是否存在「上市平台 → 母公司」的穿透关系，用缩进+箭头表达链路
    const names = m.eqs.map(e => e[0]);
    /* 是否「平台 → 母公司」的穿透一层：本项比例 ≈ 上一层平台持股 × 平台自身持股比例
       （PLATFORM 里唯一一家是紫金黄金国际 85.00%）。
       原实现只判 `i > 0 && pct != null`，把**并列股东**也当成穿透层 —— TFM 的 Gécamines 20%、
       华越的华友 57%/青创国际 10% 都会被缩进，并配上一句「穿透后权益 = 80% × 85.00%」，
       是明显错误的口径说明（260925 加 KFM 三股东时发现）。 */
    const isPassThru = (i, pct) => {
      if (i <= 0 || pct == null) return false;
      const up = m.eqs[i - 1];
      if (!up || up[1] == null) return false;
      return Math.abs(up[1] * 0.85 - pct) < Math.max(0.15, Math.abs(pct) * 0.03);
    };
    h += `<div class="kv" style="margin-top:16px"><div class="k">穿透股权结构</div><div class="eqbox">`;
    m.eqs.forEach(([who, pct, path], i) => {
      const indented = isPassThru(i, pct);
      if(pct != null){
        h += `<div class="eqrow${indented?' ind':''}">
          ${indented?'<span class="eqarrow">↳</span>':''}
          <span class="eqw">${who}</span>
          <span class="eqbar"><i style="width:${Math.min(pct,100)}%;background:${indented ? D.violet2 : CMAP[m.cate][2]}"></i></span>
          <span class="eqp">${pct}%</span></div>`;
        if(indented){
          const up = m.eqs[i-1];
          h += `<div class="eqthru">穿透后权益 = ${up[1]}% × 85.00%</div>`;
        }
      } else {
        h += `<div class="eqrow${indented?' ind':''}"><span class="eqw">${who}</span>
              <span class="eqp na" style="margin-left:auto">未公开</span></div>`;
      }
      if(path) h += `<div class="eqpath">${path}</div>`;
    });
    h += `</div></div>`;
  }

  /* ---- 上市平台归属提示（母子交叉）---- */
  {
    const plat = (m.cos || []).filter(c => PLATFORM[c[1]]);
    if(plat.length && m.cos.some(c => c[1] === 'sh601899')){
      const p = PLATFORM[plat[0][1]];
      h += `<div class="plate">
        <span class="plate-t">🏢 该矿同时归属母子公司</span>
        <div class="plate-x">由上市平台 <b>${plat[0][0]}</b>（${plat[0][1].toUpperCase()}）持有，
        而 <b>${p.parent}</b> 持该平台 <b class="hi">${p.pct.toFixed(2)}%</b>，
        故紫金矿业穿透权益 = 平台持股 × ${p.pct.toFixed(2)}%。
        两家公司的矿区列表会出现交叉，比较口径时须避免重复计算。</div>
        <div class="plate-l">
          <span class="plchip" data-cd="${plat[0][1]}">查看 ${plat[0][0]} →</span>
          <span class="plchip" data-cd="sh601899">查看 紫金矿业 →</span>
        </div></div>`;
    }
  }

  /* ---- 深化字段：分年产量图 ---- */
  if(m.out && m.out.length){
    const u = m.out[0].u || '';
    h += `<div class="kv" style="margin-top:16px">
            <div class="k">产量趋势 <span class="unit">单位：${u}</span></div>
            <div class="chart" data-chart="out"></div>
            <div class="chk-note">${[...new Set(m.out.map(d=>d.b).filter(Boolean))].join(' ｜ ')}</div>
          </div>`;
  }

  /* ---- 深化字段：矿山级财务（极少数才有）---- */
  if(m.mfin && m.mfin.length){
    h += `<div class="kv" style="margin-top:16px">
            <div class="k">矿山级财务 <span class="unit">单位：亿元</span></div>
            <div class="chart" data-chart="mfin"></div>
            <div class="chk-note">${[...new Set(m.mfin.map(d=>d.b).filter(Boolean))].join(' ｜ ')}</div>
          </div>`;
  }

  /* ---- 深化字段：事件时间线 ---- */
  if(m.ev && m.ev.length){
    h += `<div class="kv" style="margin-top:16px"><div class="k">重大事件时间线</div><div class="tl">`;
    h += m.ev.map(e=>`<div class="tli">
        <span class="tld">${e.d}</span>
        <span class="tlt">${e.t}</span>
        <span class="tlx">${e.x}</span></div>`).join('');
    h += `</div></div>`;
  }

  /* ---- 深化字段：数据层级 + 口径警示 ---- */
  if(m.dlvl || m.dwarn){
    h += `<div class="kv" style="margin-top:16px">
      ${m.dlvl?`<div class="dlvl">数据层级：<b>${m.dlvl}</b></div>`:''}
      ${m.dwarn?`<div class="dwarn">${m.dwarn}</div>`:''}
    </div>`;
  }

  // 关联公司
  if(m.cos.length){
    h += `<div class="kv" style="margin-top:18px"><div class="k">关联上市公司（点击进入聚焦模式）</div><div>`;
    h += m.cos.map(([nm,cd])=>`<span class="cochip" data-cd="${cd}">${nm} <em>${cd.toUpperCase()}</em></span>`).join('');
    h += `</div></div>`;
  } else {
    h += `<div class="kv" style="margin-top:18px"><div class="k">关联上市公司</div><div class="v na">无上市关联或未公开</div></div>`;
  }
  return h;
}

/* 矿区正文交互：关联上市公司 / 分拆平台标签。
   h.onCompany(code) —— 抽屉里换公司面板，个股页里跳那只股票的个股页。 */
function bindMineBody(root, m, h){
  h = h || {};
  root.querySelectorAll('.cochip').forEach(c=>{
    c.onclick = ()=> h.onCompany && h.onCompany(c.dataset.cd);
  });
  root.querySelectorAll('.plchip').forEach(c=>{
    c.onclick = ()=> h.onCompany && h.onCompany(c.dataset.cd);
  });
}

/* 完整档案层（原「地图抽屉」）：全屏覆盖，不挤地图。
   入口只有一个 —— map_kit 矿点卡片里的「查看完整档案」。
   注意用 <dialog> 或 overlay 都不如现在这样：它是 position:fixed 的整屏层，
   内嵌图表在「容器已有真实尺寸」之后才 init（见 renderMineCharts 的二次重画）。 */
function openMine(m){
  S.sel = m;
  const dr = document.getElementById('drawer');
  document.getElementById('dhead').innerHTML = mineHeadHtml(m, true);
  document.getElementById('dbody').innerHTML = mineBodyHtml(m);
  // 关联公司 / 上市平台标签 → 那个公司自己的个股页（不再在地图里开公司面板）
  bindMineBody(document.getElementById('dbody'), m, { onCompany: cd => goCompany(cd) });

  dr.classList.add('on');
  document.getElementById('dbody').scrollTop = 0;
  // 显示之后再建图：隐藏时容器尺寸为 0，echarts 会画出空白。
  renderMineCharts(document.getElementById('dbody'), m);
}

/* 抽屉内图表：延迟渲染 + 实例回收，避免重复打开时泄漏。
   只回收「已经从 DOM 摘掉」的实例：个股页里公司图表与矿区详情图表同时在页面上，
   一律清空会把还看得见的那些也 dispose 掉（画布变空白）。 */
let _mineCharts = [];
function disposeMineCharts(){
  const live = [];
  _mineCharts.forEach(c => {
    try{
      const el = c.getDom && c.getDom();
      if(el && document.body.contains(el)) live.push(c);
      else c.dispose();
    }catch(e){}
  });
  _mineCharts = live;
}
function renderMineCharts(body, m){
  disposeMineCharts();
  const run = () => {
    const oEl = body.querySelector('[data-chart="out"]');
    if(oEl && m.out && m.out.length){
      if(oEl.clientWidth > 0){ const c = drawOutput(oEl, m.out); if(c) _mineCharts.push(c); }
    }
    const fEl = body.querySelector('[data-chart="mfin"]');
    if(fEl && m.mfin && m.mfin.length){
      if(fEl.clientWidth > 0){ const c = drawFin(fEl, m.mfin, '亿元', '矿山级财务'); if(c) _mineCharts.push(c); }
    }
  };
  run();                      // 已打开时立即画
  setTimeout(run, 300);       // 覆盖层出现后按真实尺寸重画一次（字号改写 / 布局稳定）
}

function closeDrawer(){
  const dr = document.getElementById('drawer');
  if(!dr || !dr.classList.contains('on')) return;
  dr.classList.remove('on');
  disposeMineCharts();
  S.sel = null;
}

/* toggleDrawerFull / fsCompanyList / renderFsBar / renderFsList 260930 删除：
   「抽屉全屏 + 左侧企业栏」是「公司列表」的第三份实现（另两份是侧栏与公司面板），
   而公司列表现在只有 map_kit 的公司面板一处；完整档案层本身已经是全屏。 */

/* ---------------- 利润模型：区块 HTML + 图表（数据驱动，云铝/神火通用） ---------------- */
/* 测算流程图：把生成器给出的 flow 步骤渲染成竖向流程（步骤内可含并排分支），
   放在利润模型最下面，便于逐环节核对「价格 → 成本 → 毛利 → 税 → 归母」的口径。
   flow 由各 gen_*.py 的 FLOW 常量产出，与本模型实际计算顺序严格一致。 */
function flowHtml(pm){
  const fl = pm.flow;
  if(!fl || !fl.length) return '';
  const branch = b => `<div class="fl-br"><div class="fl-br-n">${b.n}</div><div class="fl-br-x">${b.x || ''}</div></div>`;
  const steps = fl.map((s, i) => `
    <div class="fl-step">
      <div class="fl-i">${i + 1}</div>
      <div class="fl-b">
        <div class="fl-n">${s.n}</div>
        ${s.x ? `<div class="fl-x">${s.x}</div>` : ''}
        ${(s.br && s.br.length) ? `<div class="fl-brs">${s.br.map(branch).join('')}</div>` : ''}
      </div>
    </div>
    ${i < fl.length - 1 ? '<div class="fl-ar">↓</div>' : ''}`).join('');
  return `<div class="ylflow"><div class="fl-t">测算流程</div>${steps}</div>`;
}

function ylSectionHtml(pm){
  const m = pm.meta;
  const kpi = (v, l) => `<div class="k"><div class="v">${v}</div><div class="l">${l}</div></div>`;
  // KPI 卡片优先读取 meta.kpis 数组（各公司字段不同），缺省回退到云铝旧字段
  const kpis = (m.kpis && m.kpis.length)
    ? m.kpis.map(k => kpi(k.v, k.l)).join('')
    : kpi(m.cur + '<span style="font-size:11px;color:var(--tx3)"> 亿</span>', '最新价推算全年归母')
    + kpi(m.cur_avg + '<span style="font-size:11px;color:var(--tx3)"> 亿</span>', '年内均价推算全年归母')
    + kpi((m.al||0).toLocaleString(), '沪铝价（元/吨）')
    + kpi((m.ao||0).toLocaleString(), '氧化铝价（元/吨）');
  const note = m.note || '模型为简化线性拟合，仅供研究参考，不构成投资建议。';
  // 偏差自检：生成器用各季均价跑模型并与真实季报比对，|偏离|>20% 时给出提示
  let warn = '';
  const bad = (m.checks || []).filter(c => c.warn);
  if (bad.length) {
    warn = '<div style="margin-bottom:8px;padding:6px 9px;border:1px solid '+D.warnBorder+';'
      + 'border-radius:6px;background:'+D.warnFill+';color:'+D.amber+';font-size:11px;line-height:1.7">'
      + '<b>偏差提示</b>（模型单季推算 vs 真实季报）：'
      + bad.map(c => `${c.q} 模型 ${c.model} 亿 / 实际 ${c.real} 亿，偏离 ${(c.dev * 100).toFixed(1)}%`).join('；')
      + '</div>';
  }
  // 数据更新时间：让用户知道曲线是今天刷的还是上周的
  const upd = m.gen
    ? `<span style="float:right;font-weight:400;font-size:10.5px;color:var(--tx3)">数据截至 ${m.gen}</span>`
    : '';
  // 敏感性扫描图：meta.sens 缺失的老数据不渲染，保持向后兼容
  const sensHtml = (m.sens && m.sens.points && m.sens.points.length)
    ? '<div class="chart" id="ylSens" style="height:190px"></div>' : '';
  return `<div class="ylbox">
    <div class="kv" style="margin-bottom:0">
      <div class="k">利润推算模型 · ${m.year} 年逐日拟合${upd}</div>
      ${warn}
      <div class="ylkpi">${kpis}</div>
      <div class="chart" id="ylChart"></div>
      ${sensHtml}
      <div class="ylnote">${note}</div>
      ${flowHtml(pm)}
    </div>
  </div>`;
}

/* 四条曲线：实时价年利润（抖）/ 年内均价年利润（平滑）/ Q1、Q2 单季利润。
   两条年利润走左轴，两条单季利润走右轴，按日期对齐到同一 X 轴。 */
function drawYlModel(el, pm){
  const dates = pm.realtime.map(r => r[0]);
  const toMap = arr => { const m = {}; arr.forEach(r => { m[r[0]] = r[1]; }); return m; };
  const mRT = toMap(pm.realtime), mYTD = toMap(pm.ytd), mQ1 = toMap(pm.q1), mQ2 = toMap(pm.q2);
  const pick = (mp) => dates.map(d => (mp[d] != null ? mp[d] : null));

  // 真实单季归母：季末可能非交易日，取不晚于季末的最近交易日落点；
  // 落在 X 轴区间外（如 2025 各季度）的自动丢弃，避免画到轴端点造成误读。
  const QEND = {1: '03-31', 2: '06-30', 3: '09-30', 4: '12-31'};
  const nearestLe = (t) => { let b = null; for(const d of dates){ if(d <= t) b = d; else break; } return b; };
  const actualPts = (pm.actual || []).map(a => {
    const mt = /^(\d{4})Q(\d)$/.exec(a.q);
    if(!mt) return null;
    const d = nearestLe(mt[1] + '-' + QEND[+mt[2]]);
    return d ? [d, a.real] : null;
  }).filter(Boolean);

  // 神火专用：煤价版本二曲线（已过月份按均价 + 剩余月份按现价延续）。
  // 其他模型没有 coalhold 序列，自动跳过，不影响原有 5 条线。
  const mCH = pm.coalhold ? toMap(pm.coalhold) : null;
  const legendData = ['实时价推算年利润', '年内均价推算年利润', 'Q1 单季利润', 'Q2 单季利润', '实际单季归母'];
  if(mCH) legendData.push('煤价现价延续推算年利润');
  const seriesArr = [
    {
      name: '实时价推算年利润', type: 'line', data: pick(mRT),
      symbol: 'none', smooth: false,
      lineStyle: {width: 1.3, color: D.accent}, itemStyle: {color: D.accent},
    },
    {
      name: '年内均价推算年利润', type: 'line', data: pick(mYTD),
      symbol: 'none', smooth: true,
      lineStyle: {width: 2.2, color: D.amber}, itemStyle: {color: D.amber},
    },
    {
      name: 'Q1 单季利润', type: 'line', yAxisIndex: 1, data: pick(mQ1),
      symbol: 'none', smooth: false,
      lineStyle: {width: 1.8, color: D.green2}, itemStyle: {color: D.green2},
    },
    {
      name: 'Q2 单季利润', type: 'line', yAxisIndex: 1, data: pick(mQ2),
      symbol: 'none', smooth: false,
      lineStyle: {width: 1.8, color: D.violet}, itemStyle: {color: D.violet},
    },
    {
      name: '实际单季归母', type: 'scatter', yAxisIndex: 1, data: actualPts,
      symbolSize: 10, z: 12,
      itemStyle: {color: '#ef4444', borderColor: '#ffffff', borderWidth: 1},
    },
  ];
  if(mCH){
    seriesArr.push({
      name: '煤价现价延续推算年利润', type: 'line', data: pick(mCH),
      symbol: 'none', smooth: true,
      lineStyle: {width: 2, color: '#22d3ee', type: 'dashed'}, itemStyle: {color: '#22d3ee'},
    });
  }

  const ch = chartOf(el, 300);
  ch.setOption({
    backgroundColor: 'transparent',
    grid: {left: 54, right: 58, top: 40, bottom: 56},
    tooltip: {
      trigger: 'axis',
      backgroundColor: D.axTipBg, borderColor: D.lineSoft,
      textStyle: {color: D.tipTx, fontSize: 11},
    },
    legend: {
      top: 4, itemWidth: 14, itemHeight: 8, itemGap: 14,
      textStyle: {color: D.tx3, fontSize: 10.5},
      data: legendData,
    },
    xAxis: {
      type: 'category', data: dates, boundaryGap: false,
      axisLine: {lineStyle: {color: D.lineSoft}},
      axisTick: {show: false},
      axisLabel: {color: D.tx3, fontSize: 10, formatter: v => (v || '').slice(5)},
    },
    yAxis: [
      {
        type: 'value', name: '全年归母(亿)',
        nameTextStyle: {color: D.tx3, fontSize: 10},
        axisLabel: {color: D.tx3, fontSize: 10},
        splitLine: {lineStyle: {color: D.lineSoft}},
      },
      {
        type: 'value', name: '单季归母(亿)',
        nameTextStyle: {color: D.tx3, fontSize: 10},
        axisLabel: {color: D.tx3, fontSize: 10},
        splitLine: {show: false},
      },
    ],
    dataZoom: [
      {type: 'inside'},
      {
        type: 'slider', height: 16, bottom: 8, borderColor: D.lineSoft,
        fillerColor: D.sliderTrack, handleStyle: {color: D.accent},
        textStyle: {color: D.tx3, fontSize: 9},
      },
    ],
    series: seriesArr,
  });
  setTimeout(()=>fitLegendTop(ch, 40), 60);
  return ch;
}

/* 敏感性扫描：主驱动价格 → 全年归母，等价于「价格-利润」弹性表。
   meta.sens 缺失（旧数据）时返回 null，调用方自行跳过。 */
function drawYlSens(el, pm){
  const s = pm.meta && pm.meta.sens;
  if(!s || !s.points || !s.points.length) return null;
  const ch = chartOf(el, 190);
  ch.setOption({
    backgroundColor: 'transparent',
    grid: {left: 54, right: 22, top: 40, bottom: 30},
    title: {
      text: `敏感性：${s.name} → 全年归母`, left: 0, top: 2,
      textStyle: {color: D.tx3, fontSize: 11, fontWeight: 'normal'},
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: D.axTipBg, borderColor: D.lineSoft,
      textStyle: {color: D.tipTx, fontSize: 11},
      formatter: (ps) => {
        const p = ps[0];
        return `${s.name} ${Number(p.axisValue).toLocaleString()} ${s.unit}<br/>`
             + `全年归母 <b>${p.data}</b> 亿`;
      },
    },
    xAxis: {
      type: 'category', data: s.points.map(p => String(p[0])),
      axisLine: {lineStyle: {color: D.lineSoft}}, axisTick: {show: false},
      axisLabel: {color: D.tx3, fontSize: 9, formatter: v => (Number(v) / 1000) + 'k'},
    },
    yAxis: {
      type: 'value', name: '归母(亿)',
      nameTextStyle: {color: D.tx3, fontSize: 10},
      axisLabel: {color: D.tx3, fontSize: 10},
      splitLine: {lineStyle: {color: D.lineSoft}},
    },
    series: [{
      name: '敏感性', type: 'line', data: s.points.map(p => p[1]),
      symbol: 'circle', symbolSize: 5, smooth: false,
      lineStyle: {width: 1.8, color: '#38bdf8'}, itemStyle: {color: '#38bdf8'},
    }],
  });
  return ch;
}

/* ---------------- 公司详情 ---------------- */
function fmt(v, unit){
  if(v==null) return '<span style="color:var(--tx3)">—</span>';
  return v + (unit||'');
}

/* 聚焦某公司前对齐视角：切到该公司真有矿区的视图。
   默认国内优先——用户点一家公司是想看它的矿，而多数 A 股公司只有境内矿；
   国内没有（纯境外权益）才落到全球；两边都没有（仅财务模型的公司）保持不动。
   keepScope=true 时不碰视图，供用户手动切换视角时复用。
   返回 true 表示状态有变、调用方需要重绘。 */
function alignViewForComp(c, keepScope){
  let changed = false;
  if(!keepScope && c.mines && c.mines.length){
    const cn = c.mines.filter(m => m.scope === 'cn').length;
    const ov = c.mines.filter(m => m.scope === 'ov').length;
    const want = cn ? 'china' : (ov ? 'world' : S.scope);
    if(want !== S.scope){ S.scope = want; changed = true; }
  }
  if(changed && window.MPK) MPK.syncScope(S.scope);
  return changed;
}

/* 在地图上聚焦某公司：高亮其关联矿区 + 打开对应视角。
   这里**不展示任何公司详情** —— 公司内容只有一个入口，就是那家公司自己的个股页
     （目录 个股研究/<代码>.html，与地图页共用同一份 rt/app.js 与 data.json）。
     原先地图里另有一个公司抽屉（openComp），于是同一只股票有两个页面。 */
function focusCompany(code, keepScope){
  const c = DATA.comp[code];
  if(!c) return null;
  S.focus = code;
  alignViewForComp(c, keepScope);
  render();
  return c;
}

/* 进公司页：地图页与个股页的相对位置相同（资产地图/ 与 个股研究/ 是同级目录），
   所以这一条相对路径在两个上下文里都成立（App 内容包内同样是同级）。 */
function goCompany(code){
  location.href = '../个股研究/' + encodeURIComponent(code) + '.html';
}

/* ---------------- 公司研究正文（个股页唯一入口，地图页不再有公司抽屉） ----------------
   拆成三段，装载方只决定「装进哪个容器、点矿区时做什么」：
     compHeadHtml(c)          头部：公司名 / 代码 / 关联矿区数
     compBodyHtml(c, opts)    正文：简介 / 行业 / 利润推算模型 / 母子平台 / 财务卡片 /
                              分季度柱状图 / 资产架构 / 集团总量 / 平台分部 / 旗下矿区清单
     bindCompBody(root, c, h) 绑定交互；h = { onMine(m, sc), onPlate(code), onFocus() }
   原先这一整段只服务地图抽屉，个股页只好另写一页（只有概况 + iframe 地图），
   于是同一只股票出现「两个个股研究页」、真正带营收利润的那份只在地图里 —— 260922-12 用户指出的问题。
   260930 进一步统一：地图里的公司抽屉整个删除，公司内容只有个股页这一处。 */
function compHeadHtml(c){
  const col = c.cates.length ? CMAP[c.cates[0]][2] : D.accent;
  const nCn = c.mines.filter(m=>m.scope==='cn').length;
  const nOv = c.mines.filter(m=>m.scope==='ov').length;
  return `
    <span class="tag" style="background:${col}22;color:${col};border:1px solid ${col}55">上市公司</span>
    <h2>${c.name}</h2>
    <div class="sub">${c.code.toUpperCase()} &nbsp;|&nbsp; 关联矿区 <b style="color:var(--tx)">${c.mines.length}</b> 个
      （国内 ${nCn} · 境外 ${nOv}）</div>`;
}

/* 借壳 / 重大重组的口径提示条（数据侧 emit.py 的 FIN_FROM → 产物的 finWhy / fyFrom / qyFrom）。
   有声明才输出；文案与数字同源（why 由数据层给出），前端不手抄口径。 */
function finCutNote(f){
  if(!f || !f.finWhy) return '';
  const parts = [];
  if(f.fyFrom) parts.push(`年报自 ${f.fyFrom} 年起`);
  if(f.qyFrom) parts.push(`季度自 ${f.qyFrom} 年起`);
  return `<div class="dwarn" style="margin-top:8px">
    <b>本页财务已按重大资产重组口径裁剪</b>（${parts.join('、')}）：${escHtml(f.finWhy)}
    重组前的数字属于原上市主体，与重组后资产无对应关系，连读会得出错误的增长倍数。</div>`;
}

/* 正文 HTML。opts.hideFocusBtn=true 时不渲染「在地图上聚焦」按钮
   （个股页有自己那个「进入硬资产地图 →」，不需要页内再聚焦一次）。 */
function compBodyHtml(c, opts){
  opts = opts || {};
  const f = c.fin || {};
  const y = f.y2025, hf = f.h2026;
  const U = (f.cur === 'HKD') ? '亿港元' : '亿元';
  const pm = (DATA.pmodels && DATA.pmodels[c.code]) ? DATA.pmodels[c.code] : null;
  let h = '';

  /* ---- 公司简介 ---- */
  if(c.desc){
    h += `<div class="cdesc">
      <span class="cdesc-t">公司简介</span>
      <span class="cdesc-x">${c.desc}</span>
    </div>`;
  }
  // 行业归属（与地图侧栏列表的行业分组一致，方便回溯）
  if(c.ind){
    h += `<div class="cind">行业分类：<b>${c.ind}</b></div>`;
  }

  /* ---- 利润推算模型（按证券代码挂载，如云铝股份 / 神火股份）---- */
  if(pm) h += ylSectionHtml(pm);

  /* ---- 母子平台关系（分拆上市导致的矿区交叉）---- */
  const par = PLATFORM[c.code];          // 本公司是被母公司分拆出来的平台
  const subs = Object.keys(PLATFORM).filter(k => PLATFORM[k].parentCode === c.code);
  if(par || subs.length){
    h += `<div class="plate" style="margin-bottom:12px">`;
    if(par){
      h += `<span class="plate-t">🔗 分拆上市平台</span>
        <div class="plate-x">本公司由 <b>${par.parent}</b> 分拆而来，后者持股
          <b class="hi">${par.pct.toFixed(2)}%</b>。因此本平台旗下矿区会同时出现在
          ${par.parent} 的矿区列表中，两者不可相加。</div>
        <div class="plate-l"><span class="plchip" data-cd="${par.parentCode}">查看 ${par.parent} →</span></div>`;
    }
    if(subs.length){
      h += `<span class="plate-t">🔗 旗下上市平台</span>
        <div class="plate-x">本公司在下列平台中持股，其矿区会同时计入本公司的矿区列表：</div>
        <ul style="margin:6px 0 0;padding-left:18px;font-size:11.5px;color:var(--tx2);line-height:1.9">`;
      for(const k of subs){
        h += `<li><b>${DATA.comp[k] ? DATA.comp[k].name : k}</b>（${k.toUpperCase()}）— 持股
              <b class="hi">${PLATFORM[k].pct.toFixed(2)}%</b></li>`;
      }
      h += `</ul><div class="plate-l">`;
      for(const k of subs){
        h += `<span class="plchip" data-cd="${k}">查看 ${DATA.comp[k] ? DATA.comp[k].name : k} →</span>`;
      }
      h += `</div>`;
    }
    h += `</div>`;
  }

  // 财务卡片
  const finRow = (t, d) => {
    if(!d) return `<div class="box"><div class="k">${t}</div><div class="v" style="color:var(--tx3)">未披露</div></div>`;
    const npCls = d.np!=null ? (d.np>=0?'pos':'neg') : '';
    return `<div class="box"><div class="k">${t}</div>
      <div class="v">${fmt(d.rev,'<span class="s">'+U+'</span>')}</div>
      <div class="v ${npCls}" style="margin-top:3px">${fmt(d.np,'<span class="s">'+U+'</span>')}</div>
      <div style="font-size:10.5px;color:var(--tx3);margin-top:5px">
        营收 · 归母净利</div>
      <div style="font-size:10.5px;color:var(--tx3);margin-top:4px">
        ROE ${fmt(d.roe,'%')} · 毛利率 ${fmt(d.gm,'%')}${d.yoy!=null?` · 净利同比 ${d.yoy>0?'+':''}${d.yoy}%`:''}</div>
    </div>`;
  };
  h += `<div class="grid2" style="margin-bottom:6px">
      ${finRow('2025 年报', y)}
      ${finRow('2026 上半年', hf)}
    </div>`;
  if(f.cur === 'HKD')
    h += `<div style="font-size:11px;color:var(--tx3);margin-bottom:12px;line-height:1.6">
      港股财务以<b style="color:var(--tx2)">港元</b>披露，与 A 股人民币口径不可直接比较；ROE 数据源未披露。</div>`;

  /* ---- 分季度柱状图（营收/净利可切换，带拖动条）---- */
  const qy = f.qy;
  if(qy && qy.s && qy.s.length){
    const yrs   = qy.s.map(r => r.y);
    const segLbl= qy.freq === 'H' ? '半年度 H1/H2' : '季度 Q1—Q4';
    h += `<div class="kv" style="margin-top:4px">
      <div class="k">
        <span class="qtab on" data-m="rev">营业收入</span>
        <span class="qtab" data-m="np">归母净利润</span>
        <span class="unit">单位：${U} · ${yrs[0]}—${yrs[yrs.length-1]} · ${segLbl}</span>
      </div>
      <div class="chart" id="compChart"></div>
      <div class="chk-note">${qy.freq === 'H'
        ? '港股仅披露中期与年度报告，无季报，故每年 2 根柱子（H1／H2）。'
        : '柱子为<b>单季值</b>（由年内累计报表差分还原，非累计数）；'}${yrs[yrs.length-1]} 年未走完，显示年内累计至今。悬停查看年度合计与逐季拆分，拖动下方滑块缩放时间段。</div>
      ${finCutNote(f)}
    </div>`;

    // 完整年度的首尾对比（跳过未完成的当年）
    const done = qy.s.filter(r => r.complete && r.rev != null);
    if(done.length >= 2){
      const a = done[0], b = done[done.length - 1];
      const g = (b.rev / a.rev - 1) * 100;
      const npd = (a.np != null && b.np != null && a.np !== 0) ? (b.np / Math.abs(a.np) - 1) * 100 : null;
      h += `<div class="grow">
        <span>营收 ${a.y}→${b.y}：<b class="${g>=0?'pos':'neg'}">${g>0?'+':''}${g.toFixed(1)}%</b></span>
        ${npd!=null?`<span>净利：<b class="${npd>=0?'pos':'neg'}">${npd>0?'+':''}${npd.toFixed(1)}%</b></span>`:''}
        <span style="color:var(--tx3)">（仅对比完整年度）</span>
      </div>`;
    }
  }

  /* ---- 公司级补充：资产结构与集团总量 ---- */
  const note = c.note;
  if(note){
    if(note.struct)
      h += `<div class="kv" style="margin-top:16px"><div class="k">资产架构</div>
            <div class="v" style="font-size:12.5px;line-height:1.7">${note.struct}</div></div>`;
    if(note.total && note.total.length){
      h += `<div class="kv" style="margin-top:14px"><div class="k">集团总量（不可拆分到单矿）</div>
        <div class="tt">` + note.total.map(([k,a,b])=>
          `<div class="trow"><span class="tk">${k}</span><span class="ta">${a}</span><span class="tb">${b}</span></div>`
        ).join('') + `</div></div>`;
    }
    if(note.platform && note.platform.length){
      h += `<div class="kv" style="margin-top:14px"><div class="k">平台 / 分部口径</div>`;
      h += note.platform.map(([nm,val,basis])=>
        `<div class="pf"><div class="pfn">${nm}</div><div class="pfv">${val}</div>
         <div class="pfb">${basis}</div></div>`).join('');
      h += `</div>`;
    }
    if(note.warn)
      h += `<div class="dwarn" style="margin-top:12px">${note.warn}</div>`;
  }

  /* ---- 聚焦按钮（地图抽屉用；个股页有自己的「进入硬资产地图」入口）---- */
  if(!opts.hideFocusBtn){
    h += `<button class="focus-btn" id="btnFocus">
      🎯 在地图上聚焦 ${c.name} 的全部 ${c.mines.length} 个${terms().unit}</button>`;
  }

  // 按大类分组的矿区
  // （个股页里矿区清单放进「本公司硬资产」块，故用 opts.hideMineList 关掉这里这份，避免同页两份）
  if(!opts.hideMineList){
    const by = {};
    for(const m of c.mines) (by[m.cate] = by[m.cate] || []).push(m);
    h += `<div class="kv"><div class="k">旗下矿区（${c.mines.length}）· 点击定位</div></div>`;
    for(const [k,nm,,] of CATES){
      const arr = by[k]; if(!arr) continue;
      h += `<div class="grp-t"><span class="dot" style="background:${CMAP[k][2]};width:9px;height:9px;border-radius:2px"></span>
            ${nm}<span class="n">${arr.length}</span></div>`;
      h += arr.map(m=>{
        const resTxt = (m.res && !isNA(m.res)) ? m.res : (m.cap&&!isNA(m.cap)?('产能 '+m.cap):m.dt);
        return `<div class="mini" data-m="${encodeURIComponent(JSON.stringify([m.lng,m.lat,m.n,m.scope]))}">
          <div class="t">${m.n}<span class="ct">${m.scope==='ov'?'🌍 境外':'🇨🇳 国内'} · ${m.p}</span></div>
          <div class="d">${m.g} · ${m.st||''} ${resTxt?('· '+resTxt):''}</div></div>`;
      }).join('');
    }
  }
  return h;
}

/* 渲染正文里的图表（分季度柱 / 利润模型 / 敏感性扫描）。抽屉与个股页共用。
   两张地图外的图表实例一并记入 _mineCharts，供 relayoutAll 统一 resize。 */
function mountCompCharts(root, c){
  const out = [];
  const f = c.fin || {}, qy = f.qy;
  const U = (f.cur === 'HKD') ? '亿港元' : '亿元';
  const pm = (DATA.pmodels && DATA.pmodels[c.code]) ? DATA.pmodels[c.code] : null;

  const cEl = root.querySelector('#compChart');
  if(cEl && qy && qy.s && qy.s.length){
    let metric = 'rev';
    const paint = ()=>{ if(cEl.clientWidth > 0) drawQuarterly(cEl, qy, U, f.cur, metric); };
    paint();
    setTimeout(paint, 300);        // 容器宽度在动画/首次布局后才稳定，补一次
    root.querySelectorAll('.qtab').forEach(t=>{
      t.onclick = ()=>{
        metric = t.dataset.m;
        root.querySelectorAll('.qtab').forEach(x=>x.classList.remove('on'));
        t.classList.add('on');
        paint();
      };
    });
  }

  const ylEl = root.querySelector('#ylChart');
  if(ylEl && pm){
    const paintYl = ()=>{
      if(ylEl.clientWidth > 0){
        const inst = drawYlModel(ylEl, pm);
        if(inst) out.push(inst);
      }
    };
    paintYl(); setTimeout(paintYl, 300);
  }

  // 敏感性扫描图（meta.sens 缺失时 drawYlSens 返回 null，自动跳过）
  const sensEl = root.querySelector('#ylSens');
  if(sensEl && pm){
    const paintSens = ()=>{
      if(sensEl.clientWidth > 0){
        const inst = drawYlSens(sensEl, pm);
        if(inst) out.push(inst);
      }
    };
    paintSens(); setTimeout(paintSens, 300);
  }
  out.forEach(x=>_mineCharts.push(x));
  return out;
}

/* 绑定正文交互。h 的每一项都可省：
     onMine(m, sc)  点某条矿区 —— 抽屉里是「切视图 + 定位 + 开矿区详情」；个股页是「定位 + 页内展开详情」
     onPlate(code)  点分拆平台 / 旗下平台 —— 抽屉里换公司；个股页里跳那只股票的个股页
     onFocus()      点「在地图上聚焦」—— 只有抽屉用   */
function bindCompBody(root, c, h){
  h = h || {};
  root.querySelectorAll('.mini').forEach(el=>{
    el.onclick = ()=>{
      const [lng,lat,nm,sc] = JSON.parse(decodeURIComponent(el.dataset.m));
      const m = DATA[sc].find(x=>x.n===nm);
      if(m && h.onMine) h.onMine(m, sc, [lng,lat]);
    };
  });
  root.querySelectorAll('.plchip').forEach(el=>{
    el.onclick = ()=> h.onPlate && h.onPlate(el.dataset.cd);
  });
  const fb = root.querySelector('#btnFocus');
  if(fb && h.onFocus) fb.onclick = h.onFocus;
}

/* openComp 260930 删除：地图里的「公司抽屉」整个不复存在。
   公司内容只有一个入口 —— 那家公司自己的个股页（goCompany）。地图侧的「聚焦某公司」
   改由 focusCompany() 承担（只做高亮 + 视角对齐，不展示内容）。
   compBodyHtml / mountCompCharts / bindCompBody 三个函数仍留着：个股页在用。 */

/* compListFiltered / np2025 / cmpNpDesc / indRank / compListSorted / compGroups /
   renderCompList / renderAlphaIndex / compItemHtml / selectComp / clearFocus /
   renderCompMines 260930 全部删除 —— 这些是地图侧栏那份「公司列表 + 旗下矿区」的
   实现，与 map_kit 的公司面板逐项重复（排序键、行业分组、首字母索引、净利合计
   都各写过一遍）。公司列表现在只有 map_kit 一处，点公司即进那个公司自己的个股页。 */

/* ---------------- UI 绑定 ----------------
   地图页的界面**全部**来自 app/map_kit.py：这里只交出数据口径（cateCounts / groupCounts /
   statsHtml / companies）与动作（onScope / onChange / onFocusMine / onFocusComp /
   resetView / copyLink / showNote / resetAll），不再自己绑任何外壳控件。
   原先要在这里绑 #segScope、#segView、#search、#cpSearch、#cpSort、#btnClearFocus、
   #btnFit、#btnLink、#btnNote、#btnMapToggle 十来个元素，两图各写一套。 */
function bindUI(){
  let t;
  if(window.MPK){
    MPK.init({
      // 传函数：切图层会整表换掉（硬资产 8 大类 / 电力 4 类），传值会残留上一层
      cats: ()=> CATES,
      // 只把「有矿区」的公司放进面板：0 矿区的公司在图上无处可去，列出来只会误导
      companies: ()=> DATA.compList.filter(c => c.mines.length > 0),
      // 公司内容只有一个入口：那家公司自己的个股页（见 goCompany 的相对路径说明）
      companyHref: cd => '../个股研究/' + encodeURIComponent(cd) + '.html',
      state: ()=> S,
      cateCounts, groupCounts, statsHtml, legend: legendHtml,
      // 把手行短摘要（收起态唯一可见的一行，必须极短）；见 statsBrief 注释
      statsBrief,
      indDesc: ()=> (DATA.ind && DATA.ind.desc) || {},
      // 面板措辞按层切换（硬资产叫「矿种」、电力叫「电源类型」），空态文案一并给
      terms: ()=> LAYER_TERMS[S.layer] || {},
      scopeKey,
      onScope: s=>{
        if(S.scope === s) return;
        S.scope = s;
        if(MPK.closeSheet) MPK.closeSheet();     // 切视野后卡片描述的那个点可能已不在视野里
        MPK.syncScope(s);
        render();
      },
      onChange: ()=> render(),
      onFocusComp: cd => { MPK.closeComp(); focusCompany(cd); },
      onFocusMine: m=> focusMine(m),
      onFull: m=> openMine(m),
      resetView, copyLink: copyViewLink, resetAll,
      showNote: ()=> document.getElementById('modal').classList.add('on'),
      /* 260930：进来先看地图 —— 底部上拉栏收成一条把手（约 46px），
         地图几乎全屏可见；点把手或顶栏「矿种 ▾」展开到半屏开始选分类。
         （原是 startCollapsed:true，语义相同但改叫 startDrawer 以支持三档） */
      startDrawer: 'fold',
    });
  }
  /* 拖拽/缩放的地址栏同步已并入 bindFollowZoom 的 georoam 处理器
     （「响应拖动」只留一个入口，见那里的注释），这里不再重复监听。 */
  const modal = document.getElementById('modal');
  document.getElementById('btnCloseModal').onclick = ()=> modal.classList.remove('on');
  modal.onclick = e=>{ if(e.target.id==='modal') e.currentTarget.classList.remove('on'); };
  document.addEventListener('keydown', e=>{
    if(e.key !== 'Escape') return;
    closeDrawer();
    modal.classList.remove('on');
  });
  /* 返回栈登记（顺序见文件头）：说明弹窗在上、完整档案在下。
     两者的 Esc 处理器保留 —— 本页离线单开（没有 back_kit）时它们是唯一兜底；
     在 App 里返回栈的 capture 监听会先吞掉 Esc，这里走不到。 */
  mpRegBack('modal',200,
    ()=>{ const n=document.getElementById('modal'); return !!(n && n.classList.contains('on')); },
    ()=>{ const n=document.getElementById('modal'); if(n) n.classList.remove('on'); });
  mpRegBack('drawer',190,
    ()=>{ const n=document.getElementById('drawer'); return !!(n && n.classList.contains('on')); },
    closeDrawer);
}

/* 「在地图上聚焦」= 切到该矿点所在视角 + 相机飞过去。它不设 S.focus（聚焦是公司级概念）。 */
function focusMine(m){
  const scope = m.scope === 'ov' ? 'world' : 'china';
  if(S.scope !== scope){ S.scope = scope; if(window.MPK) MPK.syncScope(scope); render(); }
  setGeo({center:[m.lng, m.lat], zoom:6});
}

boot();

/* ---------------- 视图状态 ↔ 地址栏 ----------------
   把「看的是哪张图 + 缩放到哪 + 隔离了哪类 + 聚焦哪家公司」写进 hash，
   复制链接即可还原同一个视图。沿用旧的 #公司代码 深链写法（无 = 号时按公司代码解析）。 */
/* 必须与 VIEW_DEF **同源**：原先这里另抄了一份 [40,22,1.2] / [104.5,36.5,1.25]，
   与 VIEW_DEF 的 china（104,35,7.2）已经不一致 —— 不同步就会写出「看似默认其实不是」
   的链接，或把非默认态当默认省略掉。 */
const DEF_CAM = {
  world:[VIEW_DEF.world.c[0], VIEW_DEF.world.c[1], VIEW_DEF.world.z],
  china:[VIEW_DEF.china.c[0], VIEW_DEF.china.c[1], VIEW_DEF.china.z],
};

function hashParams(){
  const h = (location.hash || '').replace(/^#/, '');
  const out = {};
  if(!h) return out;
  if(h.indexOf('=') < 0){ out.f = decodeURIComponent(h); return out; }   // 兼容旧的 #sh600089
  h.split('&').forEach(kv=>{
    const i = kv.indexOf('=');
    if(i > 0) out[kv.slice(0,i)] = decodeURIComponent(kv.slice(i+1));
  });
  return out;
}

let _hashT = 0;
function syncHash(){
  clearTimeout(_hashT);
  _hashT = setTimeout(()=>{
    const def = DEF_CAM[S.scope === 'china' ? 'china' : 'world'];
    /* URL 里的 z 一律用**用户语义值**（÷Z_SCALE），与 setGeo / VIEW_DEF 同一口径 ——
       否则写出去的是 echarts 侧值（×Z_SCALE），读回来又被 setGeo 乘一次，
       每刷新一次页面 zoom 就翻 Z_SCALE 倍（260930 复查发现的 bug）。
       ★ 相机读数全走 cam()（A7 的唯一读法）：补间在飞时它给的是**目标值**而不是
         实时中间帧 —— 写中间帧等于把「补到一半」当成用户意图（261002 实测：
         hash 里留下 `z=5.93&c=84.59,31.06`，刷新后页面永久停在半路）。 */
    const k = cam();
    const z = k.z, c = k.c;
    const p = [];
    // 与默认态一致的部分一律省略，否则一打开地址栏就顶着一串参数
    if(S.layer !== 'hard') p.push('L=' + S.layer);
    if(S.scope === 'china') p.push('v=cn');
    if(Math.abs(z - def[2]) > 0.005) p.push('z=' + z.toFixed(2));
    if(Math.abs(c[0] - def[0]) > 0.05 || Math.abs(c[1] - def[1]) > 0.05)
      p.push('c=' + (+c[0]).toFixed(2) + ',' + (+c[1]).toFixed(2));
    if(S.focus) p.push('f=' + encodeURIComponent(S.focus));
    /* 分类的「只看某一类」正是 S.cate 的单元素态，cat= 已能完整表达；
       原先并行的 k=（只看）与 h=（隐藏）是图例/资源大类两份旧实现的遗留，260922-11 一并删除。
       260930：**空集 = 默认态**（不画点），无需写进 hash —— 否则地址栏顶着一串 `cat=`（空值）。 */
    if(S.cate.size && S.cate.size !== CATES.length) p.push('cat=' + [...S.cate].join(','));
    const want = p.length ? '#' + p.join('&') : location.pathname + location.search;
    if(location.hash !== want){
      // replaceState 不产生历史记录，拖拽缩放时不会把返回键塞满
      try { history.replaceState(null, '', want); }
      catch(e){
        // 退路：location.replace 仅 hash 变化时是「同文档导航」，也不会重新加载
        try { location.replace(want); }
        catch(e2){ if(p.length) location.hash = p.join('&'); }
      }
    }
  }, 280);
}

/* 只改 S：视角 / 分类 / 聚焦（相机交给 restoreCamera）。
   旧参数 w=co（公司视图）260930 删除：地图里已经没有「公司视图」这个模式了。 */
/* 从地址栏恢复状态。**层参数要最先落** —— 它决定用哪层数据与分类表，
   后落的话 restoreState 里的 cam/cat 会按旧层的分类表校验、把参数全部丢掉。 */
async function restoreState(q){
  if(q.L && LAYER_MAP[q.L] && q.L !== S.layer){
    S.layer = q.L;
    await loadLayerData(q.L);
  }
  // 兼容旧链接：v=cn/ov 仍能还原视野（语义从「换视图」变成「挪镜头」）
  if(q.v === 'cn') S.scope = 'china';
  else if(q.v === 'ov') S.scope = 'world';
  /* 首帧经度取自 S.cLng（render 的 else 分支用记账值，而不是 VIEW_DEF.c[0]）。
     URL 只给了视野、没给相机（c=）时必须把记账经度一起挪到该视野的默认经度 ——
     否则 `#v=cn` 这种深链会拿 world 的 40°E 去开中国的镜头（实测落在地中海东岸）。 */
  if(q.v && !q.c) S.cLng = VIEW_DEF[S.scope].c[0];
  if(q.cat){
    const s = q.cat.split(',').filter(x=>CMAP[x]);
    if(s.length) S.cate = new Set(s);
  }
  if(q.f && DATA.comp && DATA.comp[q.f]) S.focus = q.f;
  if(window.MPK) MPK.syncScope(S.scope);
  syncLayerTabs();
}

/* 相机落位：URL 里有 z / c 才覆盖（render() 已按 scope 摆好默认视角） */
function restoreCamera(q){
  if(S.focus) return;                        // 有聚焦时交给 focusCompany 取景，别两套打架
  const opt = {};
  const z = parseFloat(q.z);
  if(isFinite(z) && z > 0) opt.zoom = z;
  const c = String(q.c || '').split(',').map(Number);
  if(c.length === 2 && isFinite(c[0]) && isFinite(c[1])) opt.center = c;
  if(Object.keys(opt).length) setGeo(opt);
}

/* 复制当前视图链接：clipboard 不可用时逐级退化，保证始终拿得到。
   「已复制」反馈写在 map_kit 右上角那颗按钮自己的文字上。 */
function copyViewLink(){
  syncHash();
  const url = location.href;
  const done = txt=>{ const b = document.getElementById('mpBtnLink'); if(!b) return;
    b.textContent = txt; setTimeout(()=>{ b.textContent = '🔗 链接'; }, 1600); };
  const legacy = ()=>{
    try{
      const ta = document.createElement('textarea');
      ta.value = url; ta.style.position='fixed'; ta.style.opacity='0';
      document.body.appendChild(ta); ta.select();
      const okc = document.execCommand('copy');
      document.body.removeChild(ta);
      if(okc) return done('✓ 已复制');
    }catch(e){}
    window.prompt('复制下面的视图链接', url);      // 最后兜底：让用户手动复制
  };
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(url).then(()=>done('✓ 已复制'), legacy);
  } else legacy();
}

/* 地图视图复位 */
/* 「复位」（⤢）：一个按钮只做一件事 —— **回到刚进本页的样子**：
   退出聚焦 + 清掉本层的分类/细分/关键词 + 镜头回当前视野的默认位。
   原先聚焦时只「退出聚焦」、非聚焦时只「动镜头」（同一按钮两种语义），且**都不清筛选**
   —— 用户点「复位」却发现刚才选的矿种还在（261001 交互审计 P1）。 */
function resetView(){
  if(S.focus) exitFocus();
  S.cate = new Set();
  S.groups = new Set();
  S.kw = '';
  S._picked[S.layer] = false;                 // 回到「本层没选过」的干净态
  S.sel = null;
  if(window.MPK && MPK.syncKw) MPK.syncKw('');   // 两个搜索框一起清（单一入口在 map_kit）
  const DEF = VIEW_DEF[S.scope] || VIEW_DEF.world;
  animateGeoTo(DEF.c, DEF.z);
  render();
  syncHash();
}
