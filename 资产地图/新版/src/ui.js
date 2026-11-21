/* ui.js —— 地图页的**交互控件与详情抽屉**（搜索框 / 分类筛选栏 / 主题按钮 / 详情抽屉）
   ------------------------------------------------------------------
   负责：把「引擎已经有的能力」变成**可点的控件** —— 筛选栏调 setCategories、
         搜索框调 searchAndFocus、主题按钮调 applyTheme、选中后渲染详情卡。
   不负责：引擎（→ engine.js）、相机与深链（→ camera.js）、
           拾取与选中状态机（→ interactions.js）、配色定义（→ theme.js / MP_MAP_THEME）、
           **只读信息层与图层/视野开关（→ hud.js）**。

   ★ 与 hud.js 的分界：本模块管「选中与卡片」这条链路，hud 管「哪些层画 / 镜头在哪 /
     显示什么字」。两者都往 `#ui` 里画，但**没有第二套实现**：
     顶部两行由 hud 建、本模块只负责把它们插进自己的流式容器 `.u-top`（见 init）。

   ★ 为什么 UI 自带一份 CSS（`ensureStyle()` 动态建 style 元素）而不是写进 index2.html：
     index2.html 的约定是「只放地图容器铺满这一件事，业务逻辑不许散在 HTML」。
     代价是这份 CSS **不经 build_content.scale_fonts 改写**，所以：
       · 字号一律用 **em**（相对壳给 html 的根字号，即设置面板里的**字号档位**变量），
         **不写死 px** —— 写死 px 的话，设置面板的字号档位对这页无效；
       · 颜色全部走 `--u-*` 变量，值在每次渲染/换主题时从 window.MP_MAP_THEME 取，
         绝不在这里手抄色值（单一真相源在 app/theme_palette.py）。
     ⚠ 注入进页面的文本里不许出现 `data-mp-scaled`：`scale_fonts()` 以「`<html>` 标签上
       有没有该属性」判幂等（见 `app/build_content.py` 的 `MP_SCALED_ATTR`），一旦它出现在
       会被内联进页面的文本里，整页字号改写会被**静默跳过**。src/*.js 现在是外部模块、
       不参与该扫描，但只要有人把它们内联进页面，这行注释就会让字号档位整页失效。
       （261006-110 R4 之前禁的是字号档位变量名 `--mp-fs`，判据换成显式 mark 后已可自由书写。）

   ★ 分类中文名来自 `window.MP_MAP_THEME.cateCn`（由 app/theme_palette.py 的 CATE_CN 生成）。
     取不到时回退成 key —— 宁可显示英文 key，也不要显示错的名字。

   ★ 两种详情面板（261003-88）—— **形态不同，不能合成一张卡**：
     公司详情：概览财务 / 资产清单（可点，点一条飞过去并高亮）/ 关联参股。可滚动。
     点位详情：层级与分类标签 + 分类说明 + **关键数 / 口径提示 / 种类地点**（261005 补回老页）
              + **完整档案**（261005-99 补回老页 `mineBodyHtml` 那一段）。两者都懒加载，可滚动。
     故 `renderDrawer` 按 kind 分派到 renderCompCard / renderPointCard，两者互不复用 DOM 结构。
     ⚠ 261005-99 起 `sel.kind` **只有 `'point'` 一种**：省面（与国家面）拾取链已随
       「去掉省份卡与国家卡」整体退役（见 interactions.js 文件头），点空白 = 清空选中。

   ★ 点位卡的关键数是**懒加载**的（261005）：点开第一个点位才 fetch `dist/pt_det.json`
     （972 点全量详情约 180 KB，首屏不该背）。取数是导出层算好的（→ build_points_geojson.py
     的 `detail_of`，逐行照搬老页 map_kit.py），本模块只负责画。失败静默兜底 —— 见 paintDet 注释。

   ★ 抽屉高度：**三档吸附**（261004-93，261008 定档位）：关 / 半开 30vh / 全开 100vh（到顶）。
     点位卡从**半开**打开（用户 261008 定的口径：「占全屏 30%，想看全部再往上拖」），
     公司卡从**全开**打开（内容该一次看全）。档位用 `--u-drawer-max` 表达、不写 px ——
     见下面 `.u-drawer` 那段的注释（半开档必须 min=max 锁死，否则档位等于不存在）。

   ★★ 顶部是**流式容器**（261005 改），不再是各块写死的绝对偏移：
     早先 `.u-bar{top:.5em}` / `.u-filters{top:2.9em}` / `.u-sug{top:2.75em}` 三处偏移
     互相咬着 —— 加一行控件就得手调另外两处，且 `.u-sug` 与 `.u-filters` 的 0.15em
     重叠量是"碰巧对"。现在改成一个 `.u-top` 纵向 flex，行高由内容决定，插入顺序即上下顺序。

   ★★ `.u-bar` 这个类名**曾经同时是「顶部工具条」与「卡片里的条形图行」**（261005 修）：
     工具条那条带 `position:absolute;left/right/top`，而条形图那条只写 display/gap ——
     **覆盖不掉定位** → 卡片里 8 根条形全部绝对定位、叠在抽屉顶部同一处，`.u-bars` 容器
     塌成 0 高（实测 top 全是 327、容器高 0）。财务趋势条与分类条因此**从来没被正常显示过**，
     还会糊在标题行上。修法：工具条改名 `.u-toolbar`，`.u-bar` 从此只表示条形图行。

   ★★ 工具条按钮（261005 补齐，对齐老页把手行那四个 `#mpCorner` 按钮）：
     ⤢ 复位 / 🏢 公司（带家数）；筛选栏那行另有 **全清**（261008）。
     ⚠ 261007-179 退役了「主题」按钮、261008 退役了「⚙ 说明」与「🔗 链接」——
       理由同一条：地图页要回答「资产在哪」，说明性浮层与深链复制都打断这件事
       （**能力**都还在：hud.openNote / note.js / copyLink / makeHash）。
     ⚠ 这些按钮**都只是入口**，实现分别落在别处（复位 → index.js，公司面板 → company.js，
       全清 → 只是把 `onCats([])` 送出去）—— 本模块只做「按钮 → 回调」的接线，
       不自己算任何业务。理由：同一件事只有一份实现；按钮的样式归这里，行为的归属归它们各自的模块。 */

import { PT_CATS, PT_LAYERS, LAYER_META, isOv } from './points.js';
import { distUrl } from './base.js';
import { onceJob } from './job.js';
import { el, delegate } from './dom_kit.js';
import { cateCn, cateDesc, cateColor } from './theme.js';
import * as store from './store.js';
import * as hud from './hud.js';
import * as company from './company.js';

const STYLE_ID = 'mp2-ui-css';

/** hud 的 API（模块级引用）：showSug 等**早于 hud.init 定义**的函数要用它，
 *  直接引用 init 里的 const 会撞 TDZ（ReferenceError）。 */
let _hudApi = null;
let _root = null;      // UI 根节点
let _st = null;        // { onCats, search, setTheme, currentTheme }
let _sel = null;       // 当前选中的要素（抽屉用）
let _clearBtn = null;  // 筛选栏那枚「全清」（261008）；disabled 态由 syncClearBtn 按状态写
let _allBtn = null;    // 「全选」（261120）：等价于 cats=null；已是全选态时置灰

/* ── 261116 任务#6：宽屏「右侧栏」形态 ───────────────────────────────
   窄屏（手机竖屏）：顶部栈 + 底部抽屉（现状）。
   宽屏（桌面/平板/横屏）：控件与详情都搬进**右侧常驻栏**，地图让出整个顶部带与右侧。
   ⚠ 为什么窄屏不做右侧栏：右侧栏 360px 会被 390px 的屏吃掉 78% → 地图只剩 86px，
     **地图就没法拖了**（详情是要边看边拖地图的）。所以右侧栏只给宽屏。
   ⚠ 阈值按**容器宽**（#ui 的 clientWidth）而不是屏幕宽 —— 桌面浏览器分屏/侧栏
     会让容器变窄，形态要跟着容器走。 */
const SIDE_BREAK = 720;   // 容器宽 ≥ 此值 → 宽屏形态
/* ★ 261120 用户口径：详情面板「默认用现在最大值，可以宽窄浮动 50%」——
   于是默认就取上限，范围 300~800（800 是 550 的 ~1.45 倍、300 是 ~0.55 倍）。
   ⚠ 上限 800 在窄容器里会把地图挤成 0，真正生效的宽度还要过 setSideWidth 的容器夹取。 */
const SIDE_W = 550;       // 右侧栏默认宽度（px）
const SIDE_W_MIN = 300;   // 拖宽下限（再窄详情卡读不了）
const SIDE_W_MAX = 800;   // 拖宽上限（再宽地图被挤没了）
let _layout = 'narrow';   // 'narrow' | 'wide'
let _sideEl = null;       // 右侧栏外框
let _sideDetail = null;   // 右侧栏里的「详情区」（卡片渲染到这里）
/* ★ 261118 问题1：右侧栏 = 抽屉（可收起 / 可拖宽），只放详情，控件回地图浮层。 */
let _sideCollapsed = true;    // 宽屏侧栏默认收起（261119 用户要求：默认隐藏，点资产/公司才弹出）
let _sideW = SIDE_W;          // 当前侧栏宽度（拖宽手柄改它）
let _sideGrip = null;         // 左边缘拖宽手柄
let _sideToggle = null;       // 收起 / 展开把手

/* ─── 小工具 ─── */

/* ⚠ 分类的「名 / 说明 / 色」三个取用**全部走 theme.js**（唯一实现，261005-102 P1-2/P1-3）。
   这里曾各留一份本地实现：`cateColor` 那份还写死了 `.dark` → 切浅色/暖色主题后
   卡片色点不跟着变。别再把它们搬回来。
   ★ 261006-113 R2：`el()` 建节点工厂也曾在本文件与 hud/company 各写一份（逐字节相同），
     已收口到 `dom_kit.js`；事件委托同理走 `dom_kit.delegate()`。 */

/** 条形宽度（%）：按本组最大值归一。
 *  ⚠ 必须带 `mx<=0` 守卫 —— 某公司 cats 全 0 时 `0/0*100 = NaN` → `width:NaN%` 是无效值，
 *    条不显示却**不报错**。原先两处条形图一有守卫、一无（P2-32），这里收成唯一实现。 */
function barWidth(v, mx) {
  return (mx > 0 ? Math.max(2, Math.round((Number(v) || 0) / mx * 100)) : 2) + '%';
}

/** 一次性注入 UI 自己的样式（幂等：重复 init 不会叠加两份）。 */
function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = [
    /* ⚠⚠ 选择器必须匹配**真实 DOM**：挂载点是 `<div id="ui">`，**没有** `u-root` 类。
       261004-95 发现：早先写 `.u-root{…}` / `.u-root *{…}` → 这两行**从未生效**
       （页面上没有任何元素带 u-root 类，是死选择器）。
       定位那几条一直「看着是对的」，纯属巧合 —— 页面自身的样式块里有等价的
       `#ui{position:absolute;inset:0;z-index:3;pointer-events:none}`（261003-83 那段，
       还写明了「若吃掉指针事件地图就拖不动」）。但 `box-sizing:border-box` **没人代劳**
       → 抽屉按 content-box 算高度，`max-height:62vh` 被 padding+border 顶出去
       （实测全开 540px > 62vh=523px）→ 「全开不超 62vh 封顶」的探针断言假 FAIL。
       修法：选择器改成 `#ui`（保留 `.u-root` 兼容写法，万一将来挂载点带类也不炸）。
       ⚠⚠ 261116：原来这两行写 `inset:0`，会**在运行时覆盖页面样式块**里
       `#ui{top:var(--mp-nav-h,38px)}`（本函数注入的 <style> 更晚、优先级相同）——
       于是全站页面条（nav_kit 注入的 `.mp-nav`）被 #ui 整块盖住，条看不见、
       搜索框压到 y=10。现在高度只认 `--mp-nav-h`（由 nav_kit 的 CSS 公布，
       没有页面条时回落 0，与地图容器同坐标）。别改回 inset:0。 */
    '#ui,.u-root{position:absolute;top:var(--mp-nav-h,0);right:0;bottom:0;left:0;',
    '  z-index:3;pointer-events:none;',
    '  font-size:1em;color:var(--u-tx);',
    /* ★ 261118 UI 体检：可点击控件命中区下限（WCAG 2.5.8 AA = 24px）。
       这是**布局常量、主题无关**，故放 CSS 层而非 paintVars()（那是主题色函数），
       并由 --u-hit-min 单点收口（.h-sg / .u-chip 都读它，见各自样式）。
       ★ 触屏（pointer:coarse）抬到 44px（Apple HIG / Material 舒适目标）：
       桌面视口不受影响，诊断在桌面跑仍按 24px 判；真机手指操作更宽裕。 */
    '  --u-hit-min:24px;}',
    '@media(pointer:coarse){#ui,.u-root{--u-hit-min:44px;}}',
    '#ui *,.u-root *{box-sizing:border-box;}',
    /* ★ 顶部容器：**纵向流**，行高由内容决定。插入顺序即上下顺序。
       早先三处写死的绝对偏移（.u-bar top:.5em / .u-sug top:2.75em / .u-filters top:2.9em）
       互相咬着 —— 加一行控件就要手调另外两处，而 .u-sug 与 .u-filters 那 0.15em 的重叠
       是"碰巧对"（261005 改成流式）。
       ⚠ pointer-events:none 在容器上、auto 给每一行 —— 行与行之间的缝要让地图能拖。 */
    '.u-top{position:absolute;left:.5em;right:.5em;top:.5em;display:flex;flex-direction:column;',
    '  gap:.35em;pointer-events:none;}',
    '.u-top>*{pointer-events:auto;}',
    /* ★ 261118 问题1：宽屏时顶部浮层要给右侧栏让位，否则侧栏（z-index:3、DOM 更后）
       会盖住工具条最右侧的 ◧ / 🏢 按钮 —— ◧ 被盖 = 用户再也无法收起侧栏（假绿）。
       收起侧栏（.side-collapsed）时浮层恢复全宽。 */
    '.wide .u-top{right:calc(var(--u-side-w,550px) + .5em);}',
    '.wide.side-collapsed .u-top{right:.5em;}',
    '.u-row{display:flex;gap:.4em;align-items:center;}',
    /* ⚠⚠ 这个类名**不再是**顶部工具条（261005 修）：它以前同时表示工具条与卡片里的条形图行，
       而工具条那条带 position:absolute;left/right/top —— 后一条只覆盖 display/gap，
       **覆盖不掉定位** → 卡片里 8 根条形全部绝对定位叠在同一处、容器塌成 0 高。 */
    /* 工具条：可换行（261120）—— 1280 宽、侧栏 550 时可用宽只剩 ~720，
       搜索 260 + 分段 + 三个按钮刚好；再窄就折成两行，而不是把按钮挤出边界。 */
    '.u-toolbar{position:relative;display:flex;flex-wrap:wrap;gap:.35em;align-items:center;}',
    /* 视野分段：**紧挨搜索框**，不再靠右推（"控件集中靠左"，261120 用户要求）。 */
    '.u-toolbar .h-seg{margin-left:0;}',
    /* ★ 261120：搜索框**限宽 260px**。原来 `flex:1` 让它吃掉整行剩余宽度 ——
       1280 屏上是 700+ px 的空白输入框，右侧按钮被推到屏幕另一头（用户原话
       「这些部分隔得太远，搜公司代码太长，应该集中到左边」）。 */
    '.u-swrap{position:relative;flex:0 1 260px;min-width:7em;max-width:260px;}',
    /* ★ 261118：命中区统一读 --u-hit-min（和 .u-btn/.u-chip/.h-sg 同一令牌）。
       原 height:2.2em 在偏小字号档缩到 ~23px，WCAG AA 不过。 */
    '.u-search{width:100%;min-height:var(--u-hit-min,24px);padding:0 .7em;border-radius:1.1em;',
    '  border:1px solid var(--u-bd);background:var(--u-panel);color:var(--u-tx);',
    '  font-size:.82em;outline:none;-webkit-appearance:none;}',
    '.u-search:focus{border-color:var(--u-accent);}',
    '.u-search::placeholder{color:var(--u-tx3);}',
    '.u-btn{min-height:var(--u-hit-min,24px);min-width:var(--u-hit-min,24px);padding:0 .7em;border-radius:1.1em;',
    '  border:1px solid var(--u-bd);background:var(--u-panel);color:var(--u-tx);',
    '  font-size:.78em;pointer-events:auto;}',
    '.u-btn:active{background:var(--u-panel2);}',
    /* 工具条按钮的「开启」态（面板开着时那个按钮要看得出来是自己开着）。
       ⚠ 用 .on 而不是 :focus/:active：后两者只表示「刚点过」，面板还开着的时候看不出。 */
    '.u-btn.on{border-color:var(--u-bd2);background:var(--u-panel2);color:var(--u-tx);}',
    /* 按钮里的小计数（🏢 上的家数）—— 与 chip 的计数同一套视觉重量 */
    '.u-btn .u-cn{font-style:normal;font-size:.86em;color:var(--u-tx3);margin-left:.2em;}',
    /* 分类筛选栏：横向可滚，两行（硬资产 / 电力）。
       某一层被关掉时整行隐藏（.off）—— 与图层开关同一条状态，不另做判断。 */
    /* ★ 261008：筛选栏改成 `[ 两行 chip ] [ 全清 ]` 的**横排**（原来是纯竖排）。
       ⚠ 为什么必须横排、不能把「全清」塞进某一行的末尾：塞进 `.u-frow` 里，
         它会被读成「只清这一行」（硬资产那行 vs 电力那行），而它是**全局**清空。
         横排 + `align-items:center` 让它落在两行的右侧、垂直居中，语义一目了然。 */
    /* ★ 261116 任务#6：宽屏右侧栏。
       ⚠ 详情区与控件区**必须分开**：卡片渲染是 `d.innerHTML=''` 重建的，
         和控件共用一个容器 → 每次出卡片都会把工具条与 chips 一起抹掉。 */
    '.u-side{position:absolute;right:0;top:0;bottom:0;width:var(--u-side-w,550px);display:none;',
    '  flex-direction:column;pointer-events:auto;z-index:3;',
    '  background-color:var(--u-panel-solid);background-image:var(--u-panel);',
    '  border-left:1px solid var(--u-bd);box-shadow:-2px 0 10px rgba(0,0,0,.32);',
    /* ★ 261118 问题1：抽屉式收起（高德风格）—— translateX 滑出，留一条把手在边缘。 */
    '  transition:transform .22s ease;}',
    '.u-side.on{display:flex;}',
    '.u-side.closed{transform:translateX(100%);}',
    /* ★ 261121：`.u-side-ctrl{display:none}` 已随容器一起删（见 createSide 的说明）。 */
    /* 左边缘拖宽手柄（侧栏展开时可见）：宽 6px，贴左边，鼠标/触摸拖动改宽度。 */
    '.u-side-grip{position:absolute;left:-3px;top:0;bottom:0;width:7px;cursor:ew-resize;',
    '  z-index:5;touch-action:none;}',
    '.u-side-grip:hover{background:var(--u-accent);opacity:.5;}',
    /* 收起 / 展开按钮放在地图浮层工具条里（.u-btn），始终可见 —— 不随侧栏 translateX 滑走。 */
    /* ★ 261119：min-height:0 让 flex 子项能收缩到内容高以下 —— 默认 min-height:auto
       会阻止收缩，设置区并入侧栏（占顶部空间）后详情区可能撑破侧栏、底部内容被裁且滚不到。
       与 company.js 的 .cp-l{flex:1;min-height:0;overflow-y:auto} 同款写法。 */
    '.u-side-detail{flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;',
    '  padding:.2em .6em 1.2em;}',
    '.u-side-detail:empty{display:none;}',
    /* 公司面板在**宽屏侧栏**里的形态：铺满整条侧栏（盖住控件），窄屏仍是顶栏下的浮层。
       ⚠ 高度用 **height:100%** 而不是靠 top:0+bottom:0 撑开 ——
         实测那样算出来是 790px（差 10px，来源不明），显式给高度最省心。 */
    '.u-cp.side{position:absolute;inset:0;top:0;right:0;width:auto;max-width:none;',
    '  height:100%;margin-top:0;border-radius:0;border:0;}',
    /* 侧栏里不要再套一层纵向滚动（卡片本身已经分块滚动） */
    '.u-side-detail .u-dbody{max-height:none;overflow:visible;}',
    /* 形态切换：宽屏时底部抽屉让位（顶部浮层 261118 起宽屏也保留，不再 off） */
    '.u-top.off{display:none;}',
    '.u-drawer.off{display:none;}',
    /* 261118：只在宽屏显示的控件（侧栏开合按钮）—— 窄屏没有侧栏，hidden by default */
    '.u-wide-only{display:none;}',
    '.wide .u-wide-only{display:inline-flex;}',
    '.u-filters{display:flex;flex-wrap:wrap;align-items:flex-start;gap:.25em;row-gap:.25em;}',
    /* ★ 261120：`.u-frows` 从 `flex:1` 改成不撑满 —— 原来它把「全清」顶到整行最右，
       而 chips 只占左边一段，中间一片空白（用户：「全清离得剩下的太远」）。
       现在 chips 有多宽占多宽，动作组紧跟其后。 */
    '.u-frows{flex:0 1 auto;min-width:0;max-width:calc(100% - 8em);',
    '  display:flex;flex-direction:column;gap:.25em;}',
    /* ⚠ min-width:0 必须有：column flex 的子项默认 `min-width:auto`，
       会被 chips 的内容宽撑破父容器 —— 表现是整行溢出到屏幕外、
       被动作组盖住（390px 实测截到过）。 */
    '.u-frow{display:flex;align-items:center;gap:.25em;min-width:0;}',
    /* 层被关掉：整行**压暗**而不是消失（行首就是开关，行没了按钮也没了 → 再也打不开）。
       chips 同时不吃指针，避免"压暗了还能点"。 */
    '.u-frow.off .u-chips{opacity:.4;}',
    '.u-frow.off .u-chips{pointer-events:none;}',
    /* 动作组：全选 / 全清 / N 个点 —— 紧贴 chips 右侧，不再被推到屏幕另一头。 */
    '.u-acts{flex:0 0 auto;display:flex;align-items:center;gap:.25em;align-self:center;}',
    '.u-acts .h-stat{font-size:.68em;color:var(--u-tx3);line-height:1.4;white-space:nowrap;}',
    '.u-acts .h-stat b{color:var(--u-tx2);font-weight:500;font-size:1.15em;}',
    /* 说明后半截（· 全部（硬资产 792 · 电力 180））在动作组里不显示 ——
       分类亮着的 chip 已经把"筛了什么"说清楚了，这里只留「N 个点」。 */
    '.u-acts .h-sd{display:none;}',
    /* ★ 261119 UI 彻底统一：分类标签挂在恒深色地图面板上，用专用恒亮令牌
       --u-flabel-fg（#9fb0c8，深底 8.59）；原来跟随主题的 tx2/tx3 在浅色档
       落到 #5a6b80/#5f6b7a 配深底仅 3.47/3.49。 */
    '.u-flabel{flex:0 0 auto;font-size:.72em;color:var(--u-flabel-fg,#9fb0c8);padding-right:.2em;}',
    /* flex:1 1 auto（不是 0 1 auto）：让 chips 吃下这一行的剩余宽度并自己横滑，
       否则 basis=auto=内容宽 → 撑破父容器。 */
    '.u-chips{flex:1 1 auto;min-width:0;display:flex;gap:.25em;overflow-x:auto;',
    '  scrollbar-width:none;-webkit-overflow-scrolling:touch;}',
    '.u-chips::-webkit-scrollbar{display:none;}',
    /* ★ 261118 UI 体检：命中区读 --u-hit-min（#ui 上定义，24px/触屏 44px）。
       原 height:1.9em 在偏小档只有 ~22px；fallback 24px 防变量未注入时塌回旧值。 */
    '.u-chip{flex:0 0 auto;display:flex;align-items:center;gap:.25em;min-height:var(--u-hit-min,24px);',
    '  padding:0 .5em;border-radius:.95em;border:1px solid var(--u-bd);',
    '  background:var(--u-panel);color:var(--u-tx2);font-size:.72em;',
    '  -webkit-tap-highlight-color:transparent;}',
    '.u-chip.on{color:var(--u-tx);border-color:var(--u-bd2);background:var(--u-panel2);}',
    '.u-dot{flex:0 0 auto;width:.55em;height:.55em;border-radius:50%;',
    '  border:1px solid rgba(0,0,0,.35);}',
    '.u-chip:not(.on) .u-dot{opacity:.35;}',
    /* 分类计数（= 图例 + 分类汇总，与统计行同源，都来自 hud.counts()） */
    '.u-chip b{font-weight:500;font-size:.92em;color:var(--u-tx3);}',
    '.u-chip.on b{color:var(--u-accent);}',
    /* 「全选 / 全清」（261008 只有全清，261120 补全选）：与 chip 同一套视觉重量。
       ⚠ 各自在"无事可做"时进 disabled —— 否则按钮看着能点、点了没反应，
         用户会以为坏了。判据见 syncClearBtn()，取自状态而不是点击次数。 */
    '.u-clear,.u-all{flex:0 0 auto;min-height:var(--u-hit-min,24px);padding:0 .55em;border-radius:.95em;',
    '  border:1px solid var(--u-bd);background:var(--u-panel);color:var(--u-tx2);',
    '  font-size:.72em;-webkit-tap-highlight-color:transparent;}',
    '.u-clear:active,.u-all:active{background:var(--u-panel2);}',
    '.u-clear:disabled,.u-all:disabled{opacity:.45;}',
    /* 详情抽屉：从底部升起 */
    /* ⚠ max-height + overflow-y：公司卡三大模块内容长短差别极大（资产清单可能几十条），
       不封顶会把整屏顶掉、底图全被遮住（261003-88）。内容少时按内容定高，不留空荡。 */
    '.u-drawer{position:absolute;left:0;right:0;bottom:0;pointer-events:auto;',
    /* ⚠ overflow-y 必须写在 .u-drawer **自己**上，不能只写 .u-dbody ——
       261003-88 实测：只给子块写 overflow 时，父块封顶了（max-height 生效）但内容照样溢出，
       探针读到 `overflowY: visible`。
       ⚠⚠ 这里**不能加 display:flex**（261003-88 截图抓到）：抽屉是
       `position:absolute; bottom:0` 的普通流容器，一旦变 flex 容器，
       `.u-dhead` 与 `.u-dmeta` 这类子块会被当成 flex item 参与主轴排布 ——
       标题与标签叠在一起（截图里「紫金矿业」压在「黄金 41个资产点」上），
       且底部 padding 被 flex 均分，看起来像抽屉凭空长高一截。 */
    '  padding:.7em .8em calc(.8em + env(safe-area-inset-bottom));',
    /* ⚠ 背景要**不透明**：--u-panel 是 rgba(13,20,32,.96)，4% 透出地图符号，
       财务数字叠在点圈上读不清（261003-88 截图看到）。solidOf 从同一 rgba 取同色不透明版，
       浅色档也照样生效（它本来就该是浅色）。 */
    '  background-color:var(--u-panel-solid);background-image:var(--u-panel);',
    '  border-top:1px solid var(--u-bd);',
    /* 三档吸附（261004-93）：关 / 半开（30vh）/ 全开（到顶）。
       ⚠ 用 **max-height 的百分比**表达档位、而不是 translateY 百分比 ——
         抽屉高度是**内容自适应**的，translateY(50%) 会依赖实际高度，
         同一个值在不同公司（内容多少不同）落到不同位置，档位就不准了。
         max-height 则是相对视口的确定值，跨内容稳定。
       ⚠ transition 同时管 transform 与 max-height：拖动跟手时只跟transform
         （max-height 变化滞后会有「橡皮筋」感），松手吸附时才让 max-height 跟上。
         用 .dragging 类把过渡关掉。 */
    '  --u-drawer-max:100vh;max-height:var(--u-drawer-max);',
    '  overflow-y:auto;-webkit-overflow-scrolling:touch;',
    '  transform:translateY(101%);',
    '  transition:transform .18s ease,max-height .18s ease;',
    '  box-shadow:0 -2px 10px rgba(0,0,0,.35);}',
    /* 关：完全藏起来 */
    '.u-drawer{transform:translateY(101%);}',
    /* 半开：**恰好 30vh** —— min 与 max 都锁 30vh。
       ★ 为什么要**锁死**而不是只给 max-height（261004-93 踩过两次的坑）：
         内容比 30vh 矮的卡片（点位卡实测 ≈128px）若只给 max-height，它会被内容撑成
         128px，与全开档量出**同一个高度** —— 「半开」这个档位等于不存在，
         而探针看着还是绿的（两档"各自都对"）。min=max 之后档位差**永远可见**，
         与内容多少无关。
       ★ 为什么是 30vh：用户 261008 定的口径 ——「点资产弹出占全屏 30% 的界面」。
         这一档是**点位卡打开时的默认档**，想看全部再往上拖到顶。 */
    '.u-drawer.half{transform:translateY(0);--u-drawer-max:30vh;min-height:30vh;}',
    /* 全开：**到顶**（占满视口）。不加 min-height —— 内容短时按内容定高，不硬撑。 */
    '.u-drawer.on{transform:translateY(0);--u-drawer-max:100vh;min-height:0;}',
    '.u-drawer.half .u-dbody{overflow:hidden;}',
    /* 拖动中：关掉过渡，且临时放开 max-height（否则内容被截断会「拽不动」） */
    '.u-drawer.dragging{transition:none;max-height:100vh;}',
    /* 拖动时的手型（抓握区是标题栏） */
    '.u-dhead{touch-action:none;cursor:grab;}',
    '.u-dhead:active{cursor:grabbing;}',
    '.u-dhead{display:flex;align-items:flex-start;gap:.5em;}',
    '.u-dtitle{flex:1;min-width:0;font-size:.95em;font-weight:500;line-height:1.35;}',
    '.u-dclose{flex:0 0 auto;width:1.9em;height:1.9em;border-radius:.95em;',
    '  border:1px solid var(--u-bd);background:transparent;color:var(--u-tx2);',
    '  font-size:.8em;line-height:1;}',
    '.u-dmeta{margin-top:.35em;display:flex;flex-wrap:wrap;gap:.3em;}',
    '.u-tag{flex:0 0 auto;display:flex;align-items:center;gap:.25em;',
    '  padding:.15em .5em;border-radius:.8em;background:var(--u-panel2);',
    '  border:1px solid var(--u-bd);font-size:.7em;color:var(--u-tx2);}',
    '.u-ddesc{margin-top:.4em;font-size:.72em;color:var(--u-tx3);line-height:1.5;}',
    /* 点位小卡的详情（261005 补回老页 `.mp-brief` / `.mp-warn`）：地点行 / 关键数网格 / 口径提示。
       ⚠ 关键数用 auto-fit 网格而不是 flex 换行 —— 格子数不定（2~3 个），固定列数会在只有两项时
         留出半格空白；auto-fit + minmax 让「有几项就占几列」自然成立。 */
    '.u-dloc{margin-top:.32em;display:flex;gap:.5em;flex-wrap:wrap;font-size:.72em;color:var(--u-tx3);}',
    '.dl-k{color:var(--u-tx2);}',
    '.u-brief{margin-top:.4em;display:grid;grid-template-columns:repeat(auto-fit,minmax(5.4em,1fr));',
    '  gap:.35em;}',
    '.u-bi{min-width:0;padding:.3em .45em;border-radius:.4em;',
    '  background:var(--u-panel2);border:1px solid var(--u-bd);}',
    '.u-bi u{display:block;font-size:.66em;color:var(--u-tx3);text-decoration:none;}',
    '.u-bi b{display:block;margin-top:.1em;font-size:.8em;font-weight:500;color:var(--u-tx);',
    '  line-height:1.3;word-break:break-word;}',
    /* 口径提示：放在关键数**下面** —— 它注解的正是上面那几个数字（老页同序） */
    '.u-warn{margin-top:.4em;padding:.4em .5em;border-radius:.4em;font-size:.72em;',
    '  line-height:1.5;color:var(--u-warn);background:var(--u-warnFill);',
    '  border:1px solid var(--u-warnBd);}',
    /* 汇总档（公司/基地/矿区…）的层级徽标转警示色：这些数字是**多个资产的合计口径**，
       与「单矿」不是一回事（判定在导出层 build_points_geojson.py 的 AGG_RE，不在这里重算）。 */
    '.u-tag.agg{color:var(--u-warn);border-color:var(--u-warnBd);background:var(--u-warnFill);}',
    /* ── 点位完整档案（261005-99 补回老页 `mineBodyHtml`）──────────────────
       ⚠ 与上面那块「关键数」**分开两套视觉**：关键数只有 2~3 格（概览），
         档案有十来个字段 + 时间线 + 比例条（详档）。用同一套样式会让两者糊成一段，
         用户仍然读不出"哪些是重点"。
       位置在抽屉里（`.u-drawer{overflow-y:auto}`），长文直接靠抽屉滚动，不另做内层滚动条。 */
    '.u-full{margin-top:.15em;}',
    /* 分组标题（老页 .sec-t）：一条细线收尾，让"段"能被一眼扫出来 */
    '.u-fsec{margin-top:.7em;display:flex;align-items:center;gap:.35em;',
    '  font-size:.7em;color:var(--u-tx3);}',
    '.u-fsec:first-child{margin-top:.2em;}',
    '.u-fsec::after{content:"";flex:1;height:1px;background:var(--u-bd);}',
    /* 核心指标那两格方框（老页 .grid2 / .box） */
    '.u-grid2{display:grid;grid-template-columns:1fr 1fr;gap:.35em;margin-top:.35em;}',
    '.u-gbox{min-width:0;padding:.35em .5em;border-radius:.4em;',
    '  background:var(--u-panel2);border:1px solid var(--u-bd);}',
    '.u-gk{font-size:.66em;color:var(--u-tx3);}',
    '.u-gv{margin-top:.12em;font-size:.78em;color:var(--u-tx);line-height:1.35;',
    '  word-break:break-word;}',
    /* 键值行（老页 .kv）：标签在左、值在右，值可换行 */
    '.u-kv{margin-top:.34em;font-size:.74em;line-height:1.5;color:var(--u-tx);',
    '  word-break:break-word;}',
    '.u-kv>i{font-style:normal;color:var(--u-tx3);margin-right:.45em;}',
    /* 「未公开」占位：灰字，与真值区分开（老页 .na 同义） */
    '.u-kv.na>span{color:var(--u-tx3);}',
    /* 备注：老页给的是警示色（.v.hl）—— 这段常含口径纠错，比正文更要紧 */
    '.u-kv.hl>span{color:var(--u-warn);}',
    '.u-kv.link>span{color:var(--u-accent);}',
    '.u-geo{margin-top:.3em;font-size:.68em;color:var(--u-tx3);}',
    /* 穿透股权结构（老页 .eqbox / .eqrow / .eqbar） */
    '.u-eq{margin-top:.32em;display:flex;flex-direction:column;gap:.26em;}',
    '.u-eqr{display:flex;align-items:center;gap:.4em;font-size:.72em;}',
    '.u-eqr.ind{padding-left:1em;}',
    '.u-eqw{flex:0 0 auto;max-width:9em;color:var(--u-tx2);overflow:hidden;',
    '  text-overflow:ellipsis;white-space:nowrap;}',
    '.u-eqt{flex:1;min-width:2em;height:.5em;border-radius:.25em;',
    '  background:var(--u-panel2);overflow:hidden;}',
    '.u-eqf{height:100%;border-radius:.25em;}',
    '.u-eqp{flex:0 0 auto;min-width:3.2em;text-align:right;font-size:.92em;',
    '  color:var(--u-tx3);}',
    '.u-eqarrow{color:var(--u-tx3);}',
    '.u-eqthru,.u-eqpath{margin-left:1.7em;font-size:.66em;color:var(--u-tx3);line-height:1.45;}',
    /* 事件时间线（老页 .tl / .tli）：左竖线 + 日期/标题/说明三段 */
    '.u-tl{margin-top:.32em;display:flex;flex-direction:column;gap:.45em;}',
    '.u-tli{padding-left:.55em;border-left:2px solid var(--u-bd2);}',
    '.u-tld{font-size:.66em;color:var(--u-tx3);}',
    '.u-tlt{font-size:.74em;color:var(--u-tx);line-height:1.4;}',
    '.u-tlx{font-size:.68em;color:var(--u-tx2);line-height:1.5;}',
    /* 数值序列（老页的产量/财务**图表**在本页降级成文本表 —— 新页不带图表库） */
    '.u-ser{margin-top:.32em;display:flex;flex-direction:column;gap:.18em;}',
    '.u-serrow{display:flex;justify-content:space-between;gap:.5em;font-size:.72em;}',
    '.u-serk{color:var(--u-tx3);}',
    '.u-serv{color:var(--u-tx);text-align:right;}',
    '.u-seru{font-size:.9em;color:var(--u-tx3);}',
    '.u-sern{margin-top:.2em;font-size:.66em;color:var(--u-tx3);line-height:1.45;}',
    /* 数据层级 + 口径警示（老页 .dlvl / .dwarn）—— 这段是"读数前必读"，给警示色 */
    '.u-dlvl{margin-top:.32em;font-size:.72em;color:var(--u-tx2);}',
    '.u-dwarn{margin-top:.32em;padding:.4em .5em;border-radius:.4em;font-size:.7em;',
    '  line-height:1.5;color:var(--u-warn);background:var(--u-warnFill);',
    '  border:1px solid var(--u-warnBd);}',
    /* 母子平台交叉提示（老页 .plate） */
    '.u-plate{margin-top:.34em;padding:.45em .55em;border-radius:.4em;font-size:.7em;',
    '  line-height:1.5;color:var(--u-tx2);background:var(--u-panel2);',
    '  border:1px solid var(--u-bd2);}',
    '.u-plate b{color:var(--u-tx);}',
    '.u-plchips{margin-top:.3em;display:flex;gap:.3em;flex-wrap:wrap;}',
    /* 搜索建议下拉（业界标准：边打字边出候选，不用等回车）。
       ⚠ 挂在 `.u-swrap`（搜索框的包裹层）里、用 `top:100%` 定位（261005 改）：
         早先是相对 #ui 用固定 top:2.75em —— 一旦搜索行上方多一行控件就会错位。
         现在它只依赖"搜索框在哪儿"，与上面有几行无关。 */
    '.u-sug{position:absolute;left:0;right:0;top:calc(100% + .2em);max-height:46vh;',
    '  overflow-y:auto;pointer-events:auto;border-radius:.6em;z-index:4;',
    '  border:1px solid var(--u-bd);background:var(--u-panel);',
    '  box-shadow:0 3px 14px rgba(0,0,0,.35);display:none;}',
    '.u-sug.on{display:block;}',
    '.u-su{display:flex;align-items:center;gap:.45em;width:100%;padding:.5em .7em;',
    '  border:0;border-bottom:1px solid var(--u-bd);background:transparent;',
    '  color:var(--u-tx);font-size:.8em;text-align:left;',
    '  -webkit-tap-highlight-color:transparent;}',
    '.u-su:last-child{border-bottom:0;}',
    '.u-su:active{background:var(--u-panel2);}',
    '.su-n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.su-x{flex:0 0 auto;font-size:.7em;color:var(--u-tx3);}',
    '.su-kind{flex:0 0 auto;font-size:.66em;padding:.1em .4em;border-radius:.7em;',
    '  background:var(--u-panel2);color:var(--u-tx3);}',
    '.u-sug0{padding:.6em .7em;font-size:.74em;color:var(--u-tx3);}',
    /* 公司详情卡：分区块 */
    '.u-dbody{margin-top:.45em;display:flex;flex-direction:column;gap:.55em;',
    '  max-height:54vh;overflow-y:auto;-webkit-overflow-scrolling:touch;}',
    '.u-sec{margin-top:.55em;font-size:.7em;color:var(--u-tx3);display:flex;',
    '  align-items:center;gap:.35em;}',
    '.u-sec::after{content:"";flex:1;height:1px;background:var(--u-bd);}',
    '.u-fin{display:grid;grid-template-columns:repeat(2,1fr);gap:.35em .5em;',
    '  font-size:.74em;}',
    '.u-fv{font-size:1.12em;font-weight:500;color:var(--u-tx);line-height:1.25;}',
    '.u-fk{font-size:.88em;color:var(--u-tx3);}',
    '.u-fu{font-size:.66em;color:var(--u-tx3);}',
    '.u-list{display:flex;flex-direction:column;border-radius:.4em;',
    '  border:1px solid var(--u-bd);overflow:hidden;}',
    '.u-li{display:flex;align-items:center;gap:.4em;width:100%;padding:.42em .55em;',
    '  border:0;border-bottom:1px solid var(--u-bd);background:transparent;',
    '  color:var(--u-tx2);font-size:.74em;text-align:left;',
    '  -webkit-tap-highlight-color:transparent;}',
    '.u-li:last-child{border-bottom:0;}',
    '.u-li:active{background:var(--u-panel2);}',
    '.li-n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.li-x{flex:0 0 auto;font-size:.88em;color:var(--u-tx3);}',
    '.u-bars{display:flex;flex-direction:column;gap:.22em;}',
    '.u-bar{display:flex;align-items:center;gap:.4em;font-size:.7em;}',
    '.bu-k{flex:0 0 4.6em;color:var(--u-tx2);overflow:hidden;',
    '  text-overflow:ellipsis;white-space:nowrap;}',
    '.bu-t{flex:1;height:.5em;border-radius:.25em;background:var(--u-panel2);overflow:hidden;}',
    '.bu-f{height:100%;border-radius:.25em;}',
    '.bu-v{flex:0 0 auto;font-size:.92em;color:var(--u-tx3);min-width:1.6em;',
    '  text-align:right;}',
    '.u-more{align-self:flex-start;font-size:.7em;color:var(--u-tx3);',
    '  background:none;border:0;padding:.2em 0;}',
    /* 空态/提示条 */
    '.u-note{margin-top:.45em;font-size:.72em;color:var(--u-tx3);line-height:1.5;',
    '  padding:.5em .6em;border-radius:.4em;background:var(--u-panel2);',
    '  border:1px solid var(--u-bd);}',
    /* 公司卡尾部的「去个股页」动作（261005）：它是**跳转**不是业务按钮，
       所以用 <a>（语义正确、长按能复制/新窗打开），样式做成主行动的样子 */
    '.u-cta{display:flex;align-items:center;justify-content:center;gap:.4em;',
    '  margin-top:.2em;padding:.55em .7em;border-radius:.45em;',
    '  border:1px solid var(--u-accent);background:var(--u-panel2);',
    '  color:var(--u-accent);font-size:.76em;text-decoration:none;',
    '  -webkit-tap-highlight-color:transparent;}',
    '.u-cta:active{background:var(--u-bd);}',
    '.u-cta-x{font-size:.9em;}',
  ].join('');
  document.head.appendChild(s);
}

/** 把当前主题的颜色写进 CSS 变量（换主题时只改变量、不重建 DOM）。 */
function paintVars() {
  if (!_root) return;
  const t = (window.MP_MAP_THEME || {});
  const p = (t[(_st && _st.currentTheme && _st.currentTheme())] || t.dark) || {};
  const g = p.geo || {}, o = p.other || {};
  const set = (k, v) => _root.style.setProperty(k, v);
  set('--u-panel', p.tipBg || 'rgba(13,20,32,.96)');
  set('--u-panel-solid', solidOf(p.tipBg || 'rgba(13,20,32,.96)'));
  set('--u-panel2', p.panel2 || '#16202f');
  set('--u-bd', o.border || '#3a4a63');
  set('--u-bd2', o.emphasis || '#5c6c88');
  set('--u-tx', p.tx || '#e8eef7');
  set('--u-tx2', p.tx2 || '#9fb0c8');
  set('--u-tx3', p.tx3 || '#7e93af');  // fallback 取深底达标值；实际值按主题由 MAP_PALETTE 注入
  set('--u-flabel-fg', p.flabelFg || '#9fb0c8');  // 分类标签恒亮（所在地图面板恒深）
  set('--u-accent', p.accent || '#4a9eff');
  /* ★ 261118 底层统一：选中态字色随主题（dark 深字 / light+sepia 白字），
     来源 MAP_PALETTE['onAccent']（与全站 --on-accent 同值同义）。
     原先 hud.js 写死 #0b1119：浅底蓝上 4.05、sepia 深棕上仅 2.79，皆不达 AA。 */
  set('--u-on-accent', p.onAccent || '#0b1119');
  set('--u-geo', g.area || '#1d2a44');
  /* 警示色（点位小卡的「⚠ 口径提示」与汇总档徽标）。同源 MP_MAP_THEME[主题].warn*，
     与老页 --warn / --warnBorder / --warnFill 是同一批值（源头仍只在 app/theme_palette.py）。 */
  set('--u-warn', p.warn || '#fbbf24');
  set('--u-warnBd', p.warnBorder || 'rgba(245,158,11,.35)');
  set('--u-warnFill', p.warnFill || 'rgba(245,158,11,.08)');
  /* 穿透股权条里「缩进那一层」（母平台→上市平台）的颜色。老页用 --violet2，
     同源 MP_MAP_THEME[主题].violet2（源头仍是 app/theme_palette.py）。 */
  set('--u-violet2', p.violet2 || '#8b6fd4');
}

/** rgba(...) → 同色不透明版。取不到就原样返回（宁可半透明也不要颜色错乱）。 */
function solidOf(c) {
  const m = /^rgba?\(([^)]+)\)$/.exec(String(c || '').trim());
  if (!m) return c;
  const p3 = m[1].split(',').map((x) => parseFloat(x));
  if (p3.length < 3 || p3.some((x) => !isFinite(x))) return c;
  return 'rgb(' + p3.slice(0, 3).join(',') + ')';
}

/* ─── 筛选栏 ─── */

function buildChips(host, which) {
  const row = el('div', 'u-frow');
  row.dataset.which = which;
  /* 行首 = **图层开关按钮**（261120）：原来这里是纯文字标签，开关藏在 ⚙ 浮层里 ——
     浮层盖住 chips、内容又与这个标签重复，用户完全不知道它是干嘛的。
     现在合成一个东西：既是"这一行叫什么"，又能点（关掉整层）。
     ⚠ 拿不到 hud 按钮时回落静态标签（hud 初始化异常时 chips 也得能画出来）。 */
  const lb = _hudApi && _hudApi.layerBtn && _hudApi.layerBtn[which];
  row.appendChild(lb || el('span', 'u-flabel', (LAYER_META[which] || {}).name || which));
  const chips = el('div', 'u-chips');
  (PT_CATS[which] || []).forEach((c) => {
    const b = el('button', 'u-chip on');
    b.type = 'button';
    b.dataset.cate = c;
    b.dataset.which = which;
    const dot = el('i', 'u-dot');
    dot.style.background = cateColor(c);
    b.appendChild(dot);
    b.appendChild(el('span', null, cateCn(c)));
    /* 分类计数（261005 加）：它同时充当**图例与分类汇总** ——
       老页的 legendHtml 在出厂版本里其实是空实现（thermalLegendHtml 直接 return ''），
       而色点 + 名字 + 条数本来就能说明"这一类的颜色是什么、有多少个"。
       ⚠ 计数与统计行同源（hud.counts()），不许在这里另算一份。 */
    b.appendChild(el('b', null, ''));
    b.addEventListener('click', () => {
      b.classList.toggle('on');
      if (!_st) return;
      /* ★ 261008：把 `currentCats()` 的结果**原样**送出去，不再把空数组折成 `null`
         （那是「全清」与「全选」撞成同一个状态的老写法，见 points.js pointFilter 的 ★ 三态）：
           全部点亮   → `[全部]` → 显式全选 = 不按分类限制
           点掉最后一枚 → `[]`    → 显式全清 = 恒假（与筛选栏那枚「全清」同一语义）
         所以「点掉最后一枚」与「按全清」落到同一个状态，符合直觉。 */
      _st.onCats(currentCats());
    });
    chips.appendChild(b);
  });
  row.appendChild(chips);
  host.appendChild(row);
}

/** 按当前 PT_CATS **重建**全部筛选行（261007-180）。
 *  chip 结构是启动时按兜底 PT_CATS 建的；构建期统计（pt_stats.json）到达、
 *  hud 注入新分类表后必须重建，power 的 thermal / renew 两枚 chip 才会出现。
 *
 *  ★ 261008：重建后**按状态**恢复勾选，不再按 DOM 快照。
 *    快照法有个洞：用户点过「全清」时 chip 全灭 → 快照是**空集**，
 *    而空集被当成「没动过」→ 全部恢复成 on。表现是「按了全清，数据一到 chip 又全亮」。
 *    状态（store.cats）本来就是这件事的唯一真源，别再复制一份到 DOM 上对账 ——
 *    `syncChips` 已经把三态都画对了（null → 全亮 / [] → 全灭 / 数组 → 按名单）。
 *  ⚠ 只清 `.u-frows`，**不能** `filters.innerHTML = ''` —— 那会把「全清」按钮一起清掉。 */
function rebuildChips() {
  if (!_root) return;
  const host = _root.querySelector('.u-frows');
  if (!host) return;
  host.innerHTML = '';
  PT_LAYERS.forEach((w) => buildChips(host, w));
  syncChips(store.state().cats);
}

/** 各分类的计数（跟着公司选择/图层开关变）。 */
function syncChipCounts() {
  if (!_root) return;
  const per = hud.counts().per || {};
  _root.querySelectorAll('.u-chip').forEach((b) => {
    const n = per[b.dataset.cate];
    const box = b.querySelector('b');
    if (box) box.textContent = n == null ? '' : String(n);
  });
}

/** 关掉的层：整行**压暗**（与图层开关同一条状态）。
 *  ⚠ 261120 从"整行 display:none"改来：行首就是开关按钮，行一消失按钮也跟着消失 →
 *    用户再也无法把这一层打开（拆浮层时最容易踩的死路）。压暗 + chips 不吃指针即可。 */
function syncLayerRows() {
  if (!_root) return;
  const st = store.state();
  _root.querySelectorAll('.u-frow').forEach((r) => {
    r.classList.toggle('off', !store.isLayerOn(r.dataset.which, st));
  });
}

/** 当前勾选（= 所有 .u-chip.on 的分类）。 */
function currentCats() {
  const out = [];
  _root.querySelectorAll('.u-chip.on').forEach((b) => out.push(b.dataset.cate));
  return out;
}

/** 外部改筛选（如深链 `cat=`）后同步 chip 状态。
 *  ⚠ 三态都要吃（261008）：`null` → 全亮；`[]` → 全灭（显式全清）；数组 → 按名单。
 *    写成 `set.has(...)` 而不判空集的话，`[]` 会落进 `!sel` 那一支变成全亮 ——
 *    那正是「全清」与「全选」撞车的另一种表现。 */
function syncChips(sel) {
  if (!_root) return;
  const set = new Set(sel || []);
  _root.querySelectorAll('.u-chip').forEach((b) => {
    b.classList.toggle('on', !sel || set.has(b.dataset.cate));
  });
  syncClearBtn();
}

/** 「全清」按钮的可用态（261008）：**已全清**时禁用 —— 没有可清的了。
 *  ⚠ 判据取自**状态**（`store.state().cats`），不是「点过几次」、也不是「DOM 里还剩几个
 *    `.on`」：复位（cats=null）、深链（cat=…）、数据到达后重建，都会改这一维；
 *    状态是唯一真源，从 DOM 反推迟早出现「按钮亮着但点了没反应」。 */
function syncClearBtn() {
  const cats = store.state().cats;
  /* 「全清」：已经全清（`[]`）就没得可清了。
     「全选」：`null` 本来就是全选态，再点一次没有任何效果 → 置灰，
     否则又是一个"看着能点、点了没反应"的按钮。 */
  if (_clearBtn) _clearBtn.disabled = !!(cats && !cats.length);
  if (_allBtn) _allBtn.disabled = (cats == null);
}

/* ─── 详情抽屉 ─── */

/** 数字口径：财务金额单位是「亿元」（源数据即如此），百分比原样。 */
function finVal(v, unit) {
  if (v == null || v === '') return '未披露';
  const n = Number(v);
  if (!isFinite(n)) return '未披露';
  return (Math.round(n * 100) / 100).toLocaleString('zh-CN') + (unit || '');
}

/** 一格财务（值 + 口径名 + 可选单位/副注）。 */
function finCell(k, v, opt) {
  const o = opt || {};
  const cell = el('div', 'u-fin-c');
  const val = el('div', 'u-fv', finVal(v, o.unit));
  cell.appendChild(val);
  cell.appendChild(el('div', 'u-fk', k));
  if (o.sub) cell.appendChild(el('div', 'u-fu', o.sub));
  return cell;
}

/* ─── 公司详情卡 ─── */

/**
 * 公司详情卡。三个模块（261003-88 按成熟方案定）：
 *   ① 概览与财务 —— 年报口径为主，附近 5 年营收/净利的极简条形（趋势比绝对值有用）
 *   ② 资产清单   —— **可点**：点一条飞过去并高亮那个点（点位 id 来自索引，与 geojson 同源）
 *   ③ 关联参股   —— 从点位 eqs 聚合，按权益降序
 * @param {object} c 公司记录（store.compOf 的返回）
 */
function renderCompCard(d, c) {
  const st = store.state();
  d.innerHTML = '';
  const head = el('div', 'u-dhead');
  const h = el('div', 'u-dtitle');
  h.textContent = c.n || c.code || '未具名';
  head.appendChild(h);
  const close = el('button', 'u-dclose', '✕');
  close.type = 'button';
  close.addEventListener('click', () => _st.onComp(null));
  head.appendChild(close);
  d.appendChild(head);

  const meta = el('div', 'u-dmeta');
  if (c.ind) meta.appendChild(el('span', 'u-tag', c.ind));
  meta.appendChild(el('span', 'u-tag', (c.nPts || 0) + ' 个资产点'));
  if (c.code) meta.appendChild(el('span', 'u-tag', c.code.toUpperCase()));
  d.appendChild(meta);

  const body = el('div', 'u-dbody');
  d.appendChild(body);

  /* ① 概览与财务 */
  body.appendChild(el('div', 'u-sec', '概览与财务'));
  const fin = c.fin || {};
  const y = fin.y2025 || {};
  const h1 = fin.h2026 || {};
  if (!Object.keys(y).length && !Object.keys(h1).length && !(fin.fy || []).length) {
    body.appendChild(el('div', 'u-note', '财务数据未收录。'));
  } else {
    const g = el('div', 'u-fin');
    g.appendChild(finCell('营业收入', y.rev, { unit: ' 亿元', sub: y.yoy != null ? '年报 ' + y.yoy + '%' : '' }));
    g.appendChild(finCell('归母净利', y.np, { unit: ' 亿元' }));
    g.appendChild(finCell('ROE', y.roe, { unit: '%', sub: h1.roe != null ? '中报 ' + h1.roe + '%' : '' }));
    g.appendChild(finCell('毛利率', y.gm, { unit: '%' }));
    body.appendChild(g);
    // 近 5 年营收条形（横条，按当年最大值归一）
    const fy = (fin.fy || []).slice().sort((a, b) => (a.y || 0) - (b.y || 0));
    if (fy.length >= 2) {
      const mx = Math.max.apply(null, fy.map((r) => Number(r.rev) || 0));
      const bars = el('div', 'u-bars');
      fy.forEach((r) => {
        const row = el('div', 'u-bar');
        row.appendChild(el('span', 'bu-k', r.y + ' 营收'));
        const t = el('span', 'u-t');
        const f = el('span', 'bu-f');
        f.style.width = barWidth(r.rev, mx);
        f.style.background = 'var(--u-accent)';
        t.appendChild(f);
        row.appendChild(t);
        row.appendChild(el('span', 'bu-v', finVal(r.rev, '')));
        bars.appendChild(row);
      });
      body.appendChild(bars);
    }
  }

  /* ② 资产清单（可点） */
  body.appendChild(el('div', 'u-sec', '资产清单'));
  const pts = c.pts || [];
  if (!pts.length) {
    /* ⚠ 15 家公司有财务但**没有资产点**（纯参股平台，如华电国际）。必须显式说明，
       否则用户看到空清单会以为地图坏了 —— 而它其实是「本公司不在地图上的点位里」。 */
    body.appendChild(el('div', 'u-note', '该公司在地图点位数据里没有资产记录（可能只有参股关系，未直接持有）。'));
  } else {
    const catKeys = Object.keys(c.cats || {}).sort((a, b) => c.cats[b] - c.cats[a]);
    const bars = el('div', 'u-bars');
    const mx = Math.max.apply(null, catKeys.map((k) => c.cats[k]));
    catKeys.forEach((k) => {
      const row = el('div', 'u-bar');
      row.appendChild(el('span', 'bu-k', cateCn(k)));
      const t = el('span', 'u-t');
      const f = el('span', 'bu-f');
      f.style.width = barWidth(c.cats[k], mx);
      f.style.background = cateColor(k);
      t.appendChild(f);
      row.appendChild(t);
      row.appendChild(el('span', 'bu-v', String(c.cats[k])));
      bars.appendChild(row);
    });
    body.appendChild(bars);

    const shown = pts.slice(0, 8);
    const list = el('div', 'u-list');
    shown.forEach((x) => {
      const b = el('button', 'u-li');
      b.type = 'button';
      const dot = el('i', 'u-dot');
      dot.style.background = cateColor(x.c);
      b.appendChild(dot);
      b.appendChild(el('span', 'li-n', x.n));
      b.appendChild(el('span', 'li-x', (isOv(x.ov) ? '境外 ' : '') + (x.lv || cateCn(x.c))));
      b.addEventListener('click', () => _st.onPickPoint && _st.onPickPoint(c.code, x));
      list.appendChild(b);
    });
    body.appendChild(list);
    if (pts.length > shown.length) {
      const more = el('button', 'u-more', '展开其余 ' + (pts.length - shown.length) + ' 个');
      more.type = 'button';
      more.addEventListener('click', () => {
        more.remove();
        pts.slice(8).forEach((x) => {
          const b = el('button', 'u-li');
          b.type = 'button';
          const dot = el('i', 'u-dot');
          dot.style.background = cateColor(x.c);
          b.appendChild(dot);
          b.appendChild(el('span', 'li-n', x.n));
          b.appendChild(el('span', 'li-x', (isOv(x.ov) ? '境外 ' : '') + (x.lv || cateCn(x.c))));
          b.addEventListener('click', () => _st.onPickPoint && _st.onPickPoint(c.code, x));
          list.appendChild(b);
        });
      });
      body.appendChild(more);
    }
  }

  /* ③ 关联参股 */
  body.appendChild(el('div', 'u-sec', '关联公司 / 参股关系'));
  const rel = c.rel || [];
  if (!rel.length) {
    body.appendChild(el('div', 'u-note', '该公司的点位数据里没有其它公司参股记录。'));
  } else {
    const list = el('div', 'u-list');
    rel.forEach((x) => {
      const b = el('button', 'u-li');
      b.type = 'button';
      b.appendChild(el('span', 'li-n', x.n));
      b.appendChild(el('span', 'li-x', (x.p ? x.p + '%' : '')));
      b.addEventListener('click', () => _st.onRelComp && _st.onRelComp(x.n));
      list.appendChild(b);
    });
    body.appendChild(list);
    body.appendChild(el('div', 'u-fu', '按最高权益比例取自各矿点的参股记录；「关联公司」本身可能是未上市的合资方。'));
  }

  /* ④ 完整档案 —— **只给路，不重复实现**（261005）。
     为什么是「跳出去」而不是「在这儿再画三张图」：
       · 图表（分季度柱 / 利润推算模型 / 敏感性扫描）与完整档案**只活在
         `个股研究/<代码>.html`** —— 由 `资产地图/dist/app.js` 的 `bootCompanyPage()`
         把 `compBodyHtml()` + `mountCompCharts()` 渲染进 `#coBody`。
         老地图页本来也不显示它们（地图侧的公司抽屉 260930 已删），不是新页漏做。
       · 137 家公司 ⇄ 137 个股页 **一一对应、零缺口**（261005 实测），故此处不判存在性。
       · 把 echarts 图表搬进本页 = 在第三处再实现一遍，且给地图页（长驻主力页）
         加 +3.4 MB 常驻堆（实测），只换来「不跳页」—— 不划算，见 261005 成本对照。
     ⚠ `href` 用**相对路径**，按文档 URL 解析：本页在 `资产地图/新版/` 下，
       个股页在包根 `个股研究/`，所以要 `../../`。 */
  if (c.code) {
    body.appendChild(el('div', 'u-sec', '完整档案'));
    const a = el('a', 'u-cta');
    a.href = '../../个股研究/' + c.code + '.html';
    a.appendChild(el('span', null, '财务图表与完整档案'));
    a.appendChild(el('span', 'u-cta-x', '→'));
    body.appendChild(a);
    body.appendChild(el('div', 'u-fu',
      '分季度财务趋势、利润推算模型与敏感性扫描，在本公司个股页上（与门户、搜索进入的是同一份内容）。'));
  }

  ensureSnapBound();
  setSnap('full');
  return d;
}

/* ─── 点位详情卡 ─── */

/** 详情缓存：`{which: {id: {kind?,loc?,brief,warn?,agg?}}}`（首次点开点位卡才取，一次会话只取一次）。
 *  ⚠ 失败静默兜底成 `{}`（小卡退回「只有标题 + 标签 + 归属公司」的形态）——
 *    这也意味着**漏登记 build_map2.py 白名单时页面不会报错**，只是小卡永远没有关键数。 */
const loadDet = onceJob(() => fetch(distUrl('pt_det.json'))
  .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .catch((e) => {
    /* ★ 261119：区分「数据文件加载失败」与「这条本来没有详情」——
       原来一律吞成 {}，前者被误读成后者，且漏登记白名单时页面毫无报错。 */
    console.error('[ui] pt_det.json 加载失败', e);
    _detFailed = true;
    return {};
  })
  .then((d) => ((d && typeof d === 'object') ? d : {})));
let _detFailed = false;

/** 把一条详情画进点位卡：地点行 / 关键数网格 / 口径提示。
 *  ⚠ 缺哪个字段就**整块不画** —— 不画空网格、也不写「暂无数据」：
 *    前者看着像布局坏了，后者会让「这条本来没有」看起来像「数据丢了」。 */
function paintDet(box, r) {
  if (r.kind || r.loc) {
    const sub = el('div', 'u-dloc');
    if (r.kind) sub.appendChild(el('span', 'dl-k', r.kind));
    if (r.loc) sub.appendChild(el('span', null, r.loc));
    box.appendChild(sub);
  }
  const rows = r.brief || [];
  if (rows.length) {
    const g = el('div', 'u-brief');
    rows.forEach((row) => {
      const cell = el('div', 'u-bi');
      cell.appendChild(el('u', null, String(row[0] == null ? '' : row[0])));
      cell.appendChild(el('b', null, String(row[1] == null ? '' : row[1])));
      g.appendChild(cell);
    });
    box.appendChild(g);
  }
  if (r.warn) box.appendChild(el('div', 'u-warn', '⚠ ' + r.warn));
}

/* ─── 点位**完整档案**（261005-99 补回老页 `mineBodyHtml`）────────────────────

   「这份更全的」= 老页完整档案那一整段：核心指标 / 资源量储量 / 品位 / 矿床类型 /
   矿权运营主体 / 股权结构 / 备注与坐标精度 / 产品形态 / 穿透股权结构 / 事件时间线 /
   数据层级与口径警示。老页是"小卡 → 点按钮 → 全屏完整档案"两级；本页**只有一张抽屉**，
   所以把概览（关键数）与详档（完整档案）**装在同一个抽屉里**，概览在前、详档在后。

   ★ 数据是**有序区块列表**（`detail_of` 的兄弟 `full_of` 产出），本模块只按 `k` 机械分派 ——
     没有一处口径判断（哪个标签、哪项该藏、哪些字段叫"穿透层"全在导出层算好了）。 */

/** 完整档案缓存（与详情卡同理：首次点开点位卡才取，一次会话只取一次）。
 *  ⚠ **与 pt_det 分开两个文件、两次请求**：档案实测比小卡详情大一个数量级
 *    （2.1 MB vs 0.18 MB，大头是逐点的备注与口径警示）——
 *    合在一起会让"概要数字"被长文本拖住；分开则小卡先出、详档随后填，
 *    且任一文件缺失时另一块仍能正常显示（各自静默兜底）。 */
const loadFull = onceJob(() => fetch(distUrl('pt_full.json'))
  .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .catch((e) => {
    console.error('[ui] pt_full.json 加载失败', e);
    _fullFailed = true;
    return {};
  })
  .then((d) => ((d && typeof d === 'object') ? d : {})));
let _fullFailed = false;

/** 数据里的 `**强调**` → `<b>`。
 *  ⚠ 这是**呈现**、不是口径：一个字符都不增不删（段落/换行/标点原样），只把成对的
 *    `**` 变成加粗 —— 老页把整段直接塞 innerHTML，`**` 会原样显示成星号。
 *  ⚠ 一律用 `createTextNode` 建文本节点：数据里的尖括号不会被当标签执行（不引入 XSS 面）。 */
function richText(txt) {
  const frag = document.createDocumentFragment();
  String(txt == null ? '' : txt).split('**').forEach((seg, i) => {
    if (!seg) return;
    if (i % 2) {
      const b = el('b');
      b.appendChild(document.createTextNode(seg));
      frag.appendChild(b);
    } else {
      frag.appendChild(document.createTextNode(seg));
    }
  });
  return frag;
}

/** 一个区块 —— 认不出的 `k` 一律跳过（导出层加了新类型而前端还没跟上时，
 *  宁可少画一块，也不要在卡片里印出 `[object Object]`）。 */
function paintFullBlock(box, r, color) {
  const k = r.k;
  if (k === 'sec') { box.appendChild(el('div', 'u-fsec', r.t)); return; }
  if (k === 'grid') {
    const g = el('div', 'u-grid2');
    (r.cells || []).forEach((c) => {
      const b = el('div', 'u-gbox');
      b.appendChild(el('div', 'u-gk', String(c[0] == null ? '' : c[0])));
      b.appendChild(el('div', 'u-gv', String(c[1] == null ? '' : c[1])));
      g.appendChild(b);
    });
    box.appendChild(g);
    return;
  }
  if (k === 'kv') {
    const row = el('div', 'u-kv' + (r.na ? ' na' : '') + (r.hl ? ' hl' : '') + (r.link ? ' link' : ''));
    row.appendChild(el('i', null, r.t));
    const s = el('span');
    s.appendChild(richText(r.v));
    row.appendChild(s);
    box.appendChild(row);
    return;
  }
  if (k === 'geo') { box.appendChild(el('div', 'u-geo', r.v)); return; }
  if (k === 'eq') {
    const wrap = el('div', 'u-eq');
    (r.rows || []).forEach((x) => {
      const row = el('div', 'u-eqr' + (x.ind ? ' ind' : ''));
      if (x.ind) row.appendChild(el('span', 'u-eqarrow', '↳'));
      row.appendChild(el('span', 'u-eqw', x.w));
      const t = el('span', 'u-eqt');
      const f = el('span', 'u-eqf');
      /* 条宽同老页：`Math.min(pct, 100)%`（**绝对比例**，不是按最大项归一 ——
         股东比例本来就以 100% 为满，按最大项归一会把 20% 画成满格，读错权重）。 */
      const hasP = typeof x.p === 'number';
      f.style.width = (hasP ? Math.max(2, Math.min(x.p, 100)) : 0) + '%';
      f.style.background = x.ind ? 'var(--u-violet2)' : (color || 'var(--u-accent)');
      t.appendChild(f);
      row.appendChild(t);
      row.appendChild(el('span', 'u-eqp' + (hasP ? '' : ' na'), hasP ? x.p + '%' : '未公开'));
      wrap.appendChild(row);
      if (x.thru) wrap.appendChild(el('div', 'u-eqthru', x.thru));
      if (x.path) wrap.appendChild(el('div', 'u-eqpath', x.path));
    });
    box.appendChild(wrap);
    return;
  }
  if (k === 'plate') {
    const b = el('div', 'u-plate');
    b.appendChild(el('div', null, r.t));
    const p = el('div');
    p.appendChild(richText(r.v));
    b.appendChild(p);
    const chips = el('div', 'u-plchips');
    (r.chips || []).forEach((c) => {
      const btn = el('span', 'u-tag');
      btn.style.cursor = 'pointer';
      btn.appendChild(richText(c[0]));
      const em = el('em');
      em.style.cssText = 'font-style:normal;font-size:.86em;color:var(--u-tx3);margin-left:.2em;';
      em.textContent = String(c[1]).toUpperCase();
      btn.appendChild(em);
      btn.addEventListener('click', () => _st && _st.onComp && _st.onComp(c[1]));
      chips.appendChild(btn);
    });
    b.appendChild(chips);
    box.appendChild(b);
    return;
  }
  if (k === 'series') {
    const wrap = el('div', 'u-ser');
    (r.rows || []).forEach((row) => {
      const line = el('div', 'u-serrow');
      line.appendChild(el('span', 'u-serk', String(row[0] == null ? '' : row[0])));
      const v = el('span', 'u-serv');
      v.appendChild(richText(row[1]));
      if (r.unit) {
        const u = el('span', 'u-seru', ' ' + r.unit);
        v.appendChild(u);
      }
      line.appendChild(v);
      wrap.appendChild(line);
    });
    box.appendChild(wrap);
    if (r.note) box.appendChild(el('div', 'u-sern', r.note));
    return;
  }
  if (k === 'tl') {
    const wrap = el('div', 'u-tl');
    (r.rows || []).forEach((x) => {
      const li = el('div', 'u-tli');
      if (x.d) li.appendChild(el('div', 'u-tld', x.d));
      if (x.t) { const t = el('div', 'u-tlt'); t.appendChild(richText(x.t)); li.appendChild(t); }
      if (x.x) { const e2 = el('div', 'u-tlx'); e2.appendChild(richText(x.x)); li.appendChild(e2); }
      wrap.appendChild(li);
    });
    box.appendChild(wrap);
    return;
  }
  if (k === 'dnote') {
    if (r.lvl) box.appendChild(el('div', 'u-dlvl', '数据层级：' + r.lvl));
    if (r.warn) {
      const w = el('div', 'u-dwarn');
      w.appendChild(richText(r.warn));
      box.appendChild(w);
    }
    return;
  }
}

/** 把完整档案画进点位卡（空列表 = 整块不画）。
 *  @param {string} color 该点的分类色（穿透股权条的上层色，与老页一致） */
function paintFull(box, blocks, color) {
  if (!blocks || !blocks.length) return;
  let drew = 0;
  blocks.forEach((r) => {
    const before = box.childNodes.length;
    paintFullBlock(box, r, color);
    if (box.childNodes.length > before) drew++;
  });
  /* 一块都没画出来 → 把刚建的壳摘掉（不留一段空白）。 */
  if (!drew) box.remove();
}

/* ─── 点位详情卡 ─── */

/** 点位详情卡（261005-99 起**只剩点位一种** —— 省面/国家面拾取链已随
 *  「去掉省份卡与国家卡」下线，见 interactions.js 文件头）。 */
function renderPointCard(d, sel, prev) {
  const p = sel.props || {};
  const cate = p.cate;
  const title = p.n || sel.id || '';
  d.innerHTML = '';
  const head = el('div', 'u-dhead');
  head.appendChild(el('div', 'u-dtitle', title));
  const close = el('button', 'u-dclose', '✕');
  close.type = 'button';
  close.addEventListener('click', () => _st && _st.onSel(null));
  head.appendChild(close);
  d.appendChild(head);

  const meta = el('div', 'u-dmeta');
  meta.appendChild(el('span', 'u-tag', '点位'));
  if (cate) {
    const t = el('span', 'u-tag');
    const dot = el('i', 'u-dot');
    dot.style.background = cateColor(cate);
    t.appendChild(dot);
    t.appendChild(el('span', null, cateCn(cate)));
    meta.appendChild(t);
  }
  let lvTag = null;
  if (p.lv) { lvTag = el('span', 'u-tag', p.lv); meta.appendChild(lvTag); }
  if (p.ov != null) meta.appendChild(el('span', 'u-tag', isOv(p.ov) ? '境外权益' : '中国境内'));
  d.appendChild(meta);

  if (cate) {
    const desc = cateDesc(cate);
    if (desc) d.appendChild(el('div', 'u-ddesc', desc));
  }

  /* 点位详情（关键数 / 口径提示 / 种类地点）—— 懒加载，占位先入 DOM。
     ⚠ 占位**必须在「归属公司」之前** append，这样异步取回来填的还是老页那个顺序
       （标题 → 层级/种类/地点 → 关键数 → 口径提示 → 归属公司）；
       取回来后 `detBox.isConnected` 为假说明卡片已换人/收起 → 直接丢弃，不往废 DOM 上写。 */
  if (sel.kind === 'point' && p.id) {
    const detBox = el('div', 'u-det');
    d.appendChild(detBox);
    loadDet().then((map) => {
      if (!detBox.isConnected) return;
      const r = (map[sel.which] || {})[p.id];
      if (!r) {
        /* ★ 261119：文件整体加载失败（而非这条没数据）→ 给一条可见提示，
           与 paintDet「缺字段整块不画」的设计并存，不误伤「本来没有」。 */
        if (_detFailed) detBox.appendChild(el('div', 'u-note', '详情数据未加载，请重试'));
        return;
      }
      paintDet(detBox, r);
      if (r.agg && lvTag) lvTag.classList.add('agg');
    });
  }

  /* 归属公司入口：点 → 跳到公司视图（261003-88 的「地图 ↔ 详情」闭环）。
     只列**能查到名字**的代码 —— 索引里没名字就只显示代码，宁可难看也不显示 undefined。 */
  const cos = p.cos || [];
  if (cos.length) {
    const bar = el('div', 'u-dmeta');
    bar.appendChild(el('span', 'u-tag', '归属公司'));
    cos.slice(0, 4).forEach((code) => {
      const rec = store.compOf(code);
      const b = el('button', 'u-tag');
      b.type = 'button';
      b.style.cursor = 'pointer';
      b.textContent = (rec && rec.n) || code;
      b.addEventListener('click', () => _st.onComp(code));
      bar.appendChild(b);
    });
    d.appendChild(bar);
  }

  /* 完整档案（261005-99 补回老页 `mineBodyHtml`）：概览（关键数）之后、卡片最末。
     ⚠ 放最后而不是紧跟关键数：它是**详档**，内容长（十几段 + 时间线），
       插在中间会把「归属公司」这个导航入口挤到看不见的地方。
     ⚠ 与关键数同一套懒加载约定：占位先入 DOM，取回来后判 `isConnected`
       （卡片已换人/收起就丢弃，不往废 DOM 上写）。 */
  if (sel.kind === 'point' && p.id) {
    const fullBox = el('div', 'u-full');
    d.appendChild(fullBox);
    loadFull().then((map) => {
      if (!fullBox.isConnected) return;
      const blocks = (map[sel.which] || {})[p.id];
      if (!blocks) {
        if (_fullFailed) fullBox.appendChild(el('div', 'u-note', '完整档案未加载，请重试'));
        return;
      }
      paintFull(fullBox, blocks, cate ? cateColor(cate) : null);
    });
  }

  ensureSnapBound();
  /* ★ 点位卡**从半开档（30vh）打开**（261008 用户口径：「点资产要弹出占全屏 30% 的界面，
     然后我可以将它拉到顶」）。原先是从全开档开（62vh ≈ 大半个屏幕），把刚点的那个点挡住了
     —— 用户点它正是为了看它在哪。
     ⚠ 公司卡（renderCompCard）**仍从全开档开**：它的内容（概览财务 + 资产清单 + 关联参股）
       本来就该一次看全，且入口语义是「我想看这家公司」，与「我想在地图上找资产」不同。 */
  /* ★ 261009：**同一个点**重新渲染时**保留当前档位**。为什么会出现"同一个点重渲染"：
     点地图现在走 force（见 interactions.select 的说明），所以"再点一次同一个点"会真的
     重渲染一次卡片。若这里无条件回半开档，那么「把卡片拉到顶读详情、手滑点了一下同一个点」
     就会被打回 30vh（很恼人）。换点 / 首次打开仍从半开档开（用户 261008 的口径）。 */
  const samePoint = !!(prev && prev.kind === 'point'
    && prev.id === sel.id && prev.which === sel.which);
  setSnap(samePoint && _snap !== 'closed' ? _snap : 'half');
  return d;
}

/**
 * 三档吸附的**露出比例**阈值（261004-93）。
 * ⚠ 这是「露出多少算这一档」的**判据**，不是档位高度 —— 高度在 CSS 的
 *   `--u-drawer-max` 里（half=30vh / full=100vh）。两者必须同步改。
 * ⚠ 用**视口百分比**表达，不用像素：不同机型视口高度差很多，
 *   写死 px 会在小屏上「全开也露不全」、在大屏上「半开像全开」。
 * ★ FULL 必须跟着 CSS 的全开档走（261008 由 62vh 改到「到顶」= 1.00）——
 *   两者脱钩的后果是「只拖到 62% 就被判成全开」，而全开档其实是 100vh，
 *   于是松手后抽屉会突然跳高一大截。
 */
const SNAP = { HALF: 0.30, FULL: 1.00, CLOSED: 1.01 };
/** 半开档抽屉的高度（px）—— **相机让位口径的唯一来源**。
 *
 *  ⚠ 261120 为什么需要它：`index.js` 的 `drawerHeightPx()` 读的是**当前真实盒模型高度**，
 *    于是公司卡被用户拖到全开（实测 844px 视口下 539px）时，`fitBounds` 的 padding 被撑到
 *    567px → 相机中心被硬挤到赤道（紫金 bbox 中心 38.7°N 变成 0.6°N），"飞过去看不到公司在哪"。
 *    聚焦的本质是「别被卡片挡住」，而卡片**默认从半开档打开**（见 261009 的设计前提）——
 *    用户后来把它展开到全开，是"我要读内容"，不是"请你重新排布地图"。
 *  ⇒ 让位**封顶在半开档**：读 DOM 拿实际高度、再夹到本值。
 *  ⚠ 与 `.u-drawer.half{min-height:30vh}` 同源（SNAP.HALF），改一处必须看另一处。 */
export function halfInsetPx() {
  return Math.round((window.innerHeight || 0) * SNAP.HALF);
}
/** 当前档：'closed' | 'half' | 'full' */
let _snap = 'closed';
let _snapBound = false;   // 常驻监听（document + window）只绑一次
let _drawerEl = null;     // 抽屉根元素（init 时建好并**永不替换**，内容渲染后才可能有 .u-dhead）
/** 拖动中的手势状态；null = 没在拖。**模块级** —— 监听挂在常驻节点上，
 *  手柄本身无所谓「是哪一次渲染出来的那个 .u-dhead」。 */
let _drag = null;

/** 抽屉内容渲染完后确保拖动已绑（`.u-dhead` 是渲染时才有的）。
 *  ⚠ 早先在 init 里直接绑会拿不到 head（那时还没内容）→ 静默不绑，
 *    表现为「拖不动」且无报错。 */
function ensureSnapBound() {
  if (_snapBound || !_drawerEl) return;
  bindSnap();
}

/**
 * 绑抽屉的拖动吸附（261004-93；261005-102 改事件委托）。抓握区是**标题栏**（`.u-dhead`）。
 *
 * 行为（对齐系统下拉面板 / 底部抽屉的通用做法）：
 *   · 按下 → 进入 .dragging（关掉过渡，跟手）
 *   · 拖动 → 实时改 transform（translateY 跟手）
 *   · 松手 → 按**当前位置与阈值**吸附到最近档；拖得够快（速度大）则跳一档
 *   · 向下拖超过阈值 → 关闭（清掉 on/half）
 *
 * ⚠ 为什么用 Pointer Events 而不是 touch/mouse 分开写：
 *   桌面（鼠标拖）与手机（手指拖）走同一套代码，探针也能用鼠标事件复现真机手势。
 * ⚠ 阈值取「相邻档之间」：`(HALF + FULL) / 2` 决定「半开↔全开」的翻转点。
 *
 * ⚠⚠ **监听只挂常驻节点（document / window），运行时用选择器路由到抓握区** ——
 *   这是本函数唯一正确的写法，别改回「绑到当时那个 head」。走 `dom_kit.delegate()`
 *   （261006-113 R2 起），它就是这条口径的具名实现。
 *   缘由（261005-102 P0-1）：卡片每渲染一次就把抽屉清空重建
 *   （`renderCompCard` / `renderPointCard` 都是 `d.innerHTML = ''`），
 *   旧 `.u-dhead` 连同挂在它身上的监听一并被摘掉；而那时用的是「只绑一次」的
 *   `_snapBound` 旗标，于是**从第二张卡起，标题栏拖不动，且全程不报错**
 *   （首屏默认就是第一张卡，所以长期没被发现）。
 *   委托到常驻节点后，手柄是哪个 DOM 都无所谓 —— 「重建元素」不再能摘下监听。
 */
function bindSnap() {
  if (_snapBound) return;
  _snapBound = true;

  const cur = () => _drawerEl;
  const hNow = () => { const d = cur(); return (d && d.getBoundingClientRect().height) || 1; };
  const vh = () => Math.max(1, window.innerHeight);
  const apply = (y) => {
    /* y = 手指位移（向下为正）。translateY 用**实际像素**跟手，
       松手后再交还给档位的百分比 —— 跟手期间用百分比会因为高度变化而「飘」。*/
    const d = cur();
    if (d) d.style.transform = 'translateY(' + Math.max(0, y) + 'px)';
  };

  /* ① 按下：委托在 document 上 —— 抽屉根本身会被换（boot 重入）也照样有效。
        `delegate` 负责 `closest('.u-dhead')`；回调里仍要校验命中的 head 属于**当前**抽屉
        （document 下别处也可能有 .u-dhead）。 */
  delegate(document, '.u-dhead', 'pointerdown', (e, head) => {
    const d = cur();
    if (!d || !d.contains(head)) return;
    /* 忽略点内部按钮（关闭/展开）上的按下 —— 否则点✕ 会被当成拖动起点。 */
    if (e.target.closest('button')) return;
    const t = e.timeStamp || Date.now();
    _drag = { startY: e.clientY, lastY: e.clientY, startT: t, lastT: t, startH: hNow() };
    d.classList.add('dragging');
    d.style.maxHeight = '100vh';
    if (d.setPointerCapture && e.pointerId != null) {
      try { d.setPointerCapture(e.pointerId); } catch (err) { /* 某些环境不支持 */ }
    }
    e.preventDefault();
  });

  /* ② 移动 / 抬起：挂在 window 上 —— 指针滑出抽屉甚至滑出页面也照样跟手/收尾
        （否则会出现「抽屉卡在 dragging、松手不吸附」）。 */
  window.addEventListener('pointermove', (e) => {
    if (!_drag) return;
    _drag.lastY = e.clientY; _drag.lastT = e.timeStamp || Date.now();
    apply(e.clientY - _drag.startY);
    e.preventDefault();
  });

  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  function onUp(e) {
    if (!_drag) return;
    const g = _drag; _drag = null;          // 先清，避免重入
    const d = cur();
    if (d) {
      d.classList.remove('dragging');
      d.style.transform = '';      // 交还给档位类的 CSS
      d.style.maxHeight = '';
    }
    const dy = g.lastY - g.startY;
    const dt = Math.max(1, (e.timeStamp || Date.now()) - g.startT);
    const v = dy / dt;             // px/ms，正 = 向下
    const shown = g.startH - dy;   // 拖动后「露出」的高度
    const frac = shown / vh();     // 露出比例

    /* 快速下滑 → 直接关；快速上滑 → 升一档。阈值 0.45px/ms（约 450px/s，
       比人的「甩」慢、比「慢拖」快，实践上是好用的分界）。 */
    let next;
    if (v > 0.45) next = 'closed';
    else if (v < -0.45) next = (_snap === 'full' ? 'full' : 'half');
    else if (frac < SNAP.HALF * 0.55) next = 'closed';
    else if (frac < (SNAP.HALF + SNAP.FULL) / 2) next = 'half';
    else next = 'full';
    setSnap(next);
    e.preventDefault();
  }
}

/**
 * 切到某一档（261004-93）。
 * @param {'closed'|'half'|'full'} v
 */
export function setSnap(v) {
  const d = _root && _root.querySelector('.u-drawer');
  const was = _snap;
  _snap = v;
  if (!d) return;
  d.classList.toggle('on', v === 'full');
  d.classList.toggle('half', v === 'half');
  /* closed 时两个类都摘掉 → 走 transform:translateY(101%) 藏起来。
     ⚠ 与 renderDrawer 里「关卡片 ≠ 退出公司视图」的语义一致：
       收起抽屉只是收起，store 里的 comp 不动。 */
  /* ★ 261009 P0-3：抽屉**从开着**收到 closed（向下拖走 / 返回键 / 关卡片）→ 通知页面层
     把交互层记的选中**静默清掉**，否则「收起后再点同一个点」会被 `select()` 的去重
     判成「没变化」→ 卡片打不开（实测）。只在**跨越**时发：setSnap('closed') 在关卡片
     路径上会被重复调到，每次都发虽然幂等，但没必要。 */
  if (v === 'closed' && was !== 'closed') dropSel();
}

/** 当前档（探针/调试用）。 */
export function snap() { return _snap; }

/**
 * 固定卡「展开」。当前把详情推到**全开档**；任务#6 把详情迁到右侧面板后，
 * 只改这个函数体即可 —— 调用点（hud 的 `onExpand`）不用动。
 * ⚠ 不在这里直接 `setSnap('full')` 散落调用：那样 #6 要改的地方会变成两处。
 * @returns {boolean} 是否真的展开了（没有选中时返回 false，不静默开一张空卡）
 */
/**
 * 261118 问题1：侧栏抽屉开合。收起后侧栏 translateX 滑出、地图全宽。
 * @param {boolean} collapsed
 */
function setSideCollapsed(collapsed) {
  if (_layout !== 'wide') return;
  _sideCollapsed = !!collapsed;
  if (_sideEl) _sideEl.classList.toggle('closed', _sideCollapsed);
  /* 顶部浮层让位跟着开合走（◧ 按钮不能被侧栏盖住），见 CSS .wide.side-collapsed */
  if (_root) _root.classList.toggle('side-collapsed', _sideCollapsed);
  if (_st && _st.onSideLayout) { try { _st.onSideLayout(); } catch (e) { /* 不阻塞 */ } }
}

/** 261118 问题1：设置侧栏宽度（拖宽手柄调），夹在 [MIN, MAX]。
 *  ★ 261120：上限抬到 800 后必须再按**容器**夹一次 —— 800px 侧栏放进 900px 窗口，
 *    地图只剩 100px，`occlusionInset` 的右 padding 等于整个视口宽，
 *    `cameraForBounds` 会直接判「装不下」（见 engine.fitBounds 的兜底）。
 *    留 280px 给地图，与 index.occlusionInset 的下限是同一个数。 */
function setSideWidth(px) {
  if (!Number.isFinite(px)) return;
  const rootW = (_root && _root.clientWidth) || window.innerWidth || 1024;
  const cap = Math.max(SIDE_W_MIN, Math.min(SIDE_W_MAX, rootW - 280));
  _sideW = Math.max(SIDE_W_MIN, Math.min(cap, Math.round(px)));
  /* 变量设在 _root（.u-side 与 .wide .u-top 都要读它，设在兄弟节点上读不到）。 */
  if (_root) _root.style.setProperty('--u-side-w', _sideW + 'px');
  if (_sideEl) _sideEl.style.setProperty('--u-side-w', _sideW + 'px');
  if (_st && _st.onSideLayout) { try { _st.onSideLayout(); } catch (e) { /* 不阻塞 */ } }
}

/** 侧栏左边缘拖宽手柄的指针事件（宽屏展开时有效）。 */
function bindSideGrip() {
  if (!_sideGrip) return;
  let dragging = false;
  const start = (e) => {
    if (_layout !== 'wide' || _sideCollapsed) return;
    dragging = true;
    _sideGrip.setPointerCapture && _sideGrip.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const move = (e) => {
    if (!dragging) return;
    /* 侧栏右边缘贴视口右侧 → 新宽度 = 视口右 - 指针 x。 */
    const rootW = (_root && _root.clientWidth) || window.innerWidth || 390;
    setSideWidth(rootW - e.clientX + (_root ? _root.getBoundingClientRect().left : 0));
  };
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    _sideGrip.releasePointerCapture && _sideGrip.releasePointerCapture(e.pointerId);
  };
  _sideGrip.addEventListener('pointerdown', start);
  _sideGrip.addEventListener('pointermove', move);
  _sideGrip.addEventListener('pointerup', end);
  _sideGrip.addEventListener('pointercancel', end);
}

export function expandSel() {
  if (!_sel) return false;
  /* ★ 261116 任务#6 阶段3：宽屏的详情在右侧栏里**本来就是整幅显示**的，
     没有"再展开"这一档 → 直接返回（别去 setSnap 一个看不见的抽屉）。
     ★ 261118：若侧栏此刻是收起的，顺手展开它（用户点了"展开"就是想看详情）。 */
  if (_layout === 'wide') { if (_sideCollapsed) setSideCollapsed(false); return true; }
  setSnap('full');
  return true;
}

/* ─── 返回栈登记（261004-95） ──────────────────────────────────────────
   老 echarts 页有**三层**浮层各自登记：`mpComp`(160 公司面板) / `mpSheet`(150 矿点小卡) /
   `mpDrawer`(140 上拉抽屉)。新引擎（MapLibre）把它们**合并成一张抽屉** —— 点位详情与公司
   档案都渲染在 `.u-drawer` 里，只是档位不同。所以这里只登记一条 `mpDrawer`，但**必须逐档退**
   （full → half → closed）：抽屉「一档 = 用户眼里的一层」，一次退到底就又变回 MPB 要解决的
   那个老问题（按返回整段跳掉一层）。
   另登记 `mpSug`（**150** 搜索建议列表）—— 它是新引擎新增的浮层，`z-index:4`（本页最高，
   见 `.u-sug` 的样式），盖在抽屉与公司面板之上，所以返回键**应该先收它**。
   ⚠ 261009 修正：这条原先写的是 **135**，比抽屉的 140 还低 → `actives()` 按
   `(y.order-x.order)` 排序，**order 大者先退** ⇒ 实际是「抽屉先退」，公司卡开着时要连按
   3 次才轮到建议 —— 与上面这句注释**正好相反**（`company.js` 那段注释还说 135 与 140
   「次序一致」，两处对同一件事的期望相反）。改 150 之后次序 = 说明弹窗 160 > 建议 150 >
   公司面板 145 > 抽屉 140，与 z-index 的视觉叠放一致。
   ⚠ 走 `window.__mpBackReg` 而不是直接判 `window.MPB`：本页离线单开时注册表不存在，
   入队即可；`build_content` 的注入层启动时会排空队列。 */
function regBack(id, order, active, close) {
  var f = window.__mpBackReg;
  if (f) { f(id, order, active, close); return; }
  (window.__mpBackQ = window.__mpBackQ || []).push([id, order, active, close]);
}

function registerBackLayers() {
  regBack('mpDrawer', 140,
    function () {
      /* ★ 261116 任务#6 阶段3：宽屏的详情在**右侧栏**里，没有"档位"可言。
         判据统一成「当前形态下有没有可见的详情」——
         否则宽屏下抽屉恒为 closed，返回键会直接穿透到下一层（关不掉详情）。 */
      if (_layout === 'wide') {
        const d = detailHost();
        return !!(d && d.querySelector('.u-dtitle'));
      }
      return snap() !== 'closed';
    },
    function () {
      /* 宽屏：没有档位可退，一次退到底 = 关掉详情（走卡片 ✕ 同一条路）。 */
      if (_layout === 'wide') {
        const d = detailHost();
        if (d && d.querySelector('.u-dtitle')) {
          if (_st && _st.onSel) { _st.onSel(null); return true; }
          return false;
        }
        return false;
      }
      /* 逐档退：full → half → closed。已 closed 时返回 false 让给下一层。 */
      if (snap() === 'full') { setSnap('half'); return true; }
      if (snap() === 'half') { setSnap('closed'); return true; }
      return false;
    });
  regBack('mpSug', 150,
    function () {
      var s = _root && _root.querySelector('.u-sug');
      return !!(s && s.classList.contains('on'));
    },
    function () { hideSug(); return true; });
}

/**
 * 通知页面层「这边已经不再显示某个点位了」→ 让它把**交互层记的选中静默清掉**（261009 P0-3）。
 *
 * ★ 为什么需要一个专门的通道，而不是复用 `_st.onSel(null)`：
 *   `onSel` 会走 render（那是「用户改了选中」），拿它来清状态等于**刚被收起的卡片自己弹回来**。
 *   这里的语义只是「卡片没了」，画面不需要任何变化 —— 所以是一条只通知、不渲染的路。
 * ★ 为什么必须有人清：抽屉收起只改档位，交互层的 `_sel` 留着 → 「再点同一个点」被
 *   `select()` 的去重吞掉（实测：卡片打不开且无任何报错）。
 */
function dropSel() {
  if (_st && _st.onDropSel) {
    try { _st.onDropSel(); } catch (e) { console.error('[ui] onDropSel 回调异常', e); }
  }
}

/**
 * 详情卡片的**渲染宿主**：宽屏 → 右侧栏的详情区；窄屏 → 底部抽屉。
 * ⚠ 卡片渲染是 `d.innerHTML=''` 重建的，所以宿主必须是**只装卡片**的容器 ——
 *   和控件（工具条/chips）共用一个容器会把控件一起抹掉（见 .u-side-detail 的注释）。
 */
function detailHost() {
  if (_layout === 'wide' && _sideDetail) return _sideDetail;
  return _root ? _root.querySelector('.u-drawer') : null;
}

/**
 * 形态（窄/宽）切换后，把当前卡片**原样搬到新宿主**。
 * ⚠ 不用 renderDrawer 重画：那条路径在"没有选中"时会触发**逐级退出**
 *   （dropSel → 清选中），形态切换不该顺手把用户的选中抹掉。
 */
function redrawDetail() {
  const d = detailHost();
  if (!d) return;
  /* ⚠ 用**模块级 `_sel`**（本模块自己的选中态），不是 `ix.current()` ——
     ui.js 从来没 import 过 ix（那是 index.js 的东西）。写成 ix.current() 会抛
     ReferenceError → ui.init 整个抛出去 → **index.js 的 uiApi 一直是 null**
     （DOM 建好了、接线却断了，页面看着正常但一切交互都不通）。
     这个坑很隐蔽：异常被入口的 .catch 收进 __mp2Err，不报在控制台。 */
  const st = store.state();
  if (st.comp) {
    const c = store.compOf(st.comp);
    if (c) { renderCompCard(d, Object.assign({ code: st.comp }, c)); return; }
  }
  if (_sel && _sel.kind === 'point') renderPointCard(d, _sel, null);
}

/**
 * 按容器宽决定形态，并在形态变化时**搬动 DOM**（工具条 / chips / 折叠面板 / 详情）。
 * ⚠ 搬动用 appendChild（同一个节点整体挪走）—— 事件监听器跟着节点走，不会丢。
 * ⚠ 搬完要把卡片重画到新宿主（redrawDetail），否则卡片留在旧宿主里（宽屏看不到）。
 */
function applyLayout() {
  const w = (_root && _root.clientWidth) || 390;
  const next = w >= SIDE_BREAK ? 'wide' : 'narrow';
  if (next === _layout) return;
  /* 261118：形态 class 给 CSS 用（.u-wide-only 等），宽屏才显示侧栏开合按钮。 */
  if (_root) _root.classList.toggle('wide', next === 'wide');
  const top = _root.querySelector('.u-top');
  const drawer = _root.querySelector('.u-drawer');
  const toolbar = _root.querySelector('.u-toolbar');
  const filters = _root.querySelector('.u-filters');
  /* ⚠ 元素不齐就**原样返回**：不搬 DOM、也**不改状态**。
     状态先改的话，一旦这里提前返回，就会出现"状态说有侧栏、DOM 里没有"的分裂
     （实测踩过：MP2.layout() 报 narrow，而侧栏明明显示着）。 */
  if (!top || !drawer || !toolbar || !filters) return;
  /* 切换前的宿主（detailHost 依赖 _layout，此刻还是旧形态）—— 搬完要把它清空，
     否则**两处都留一份卡片**（旧的那份只是被 display:none 藏起来，
     切回去就会看到"旧卡 + 新卡"两张）。 */
  const oldHost = detailHost();
  /* 公司面板（🏢）：宽屏时它是**侧栏内的一整块**（铺满侧栏，盖住控件），
     窄屏时它是顶栏下方右对齐的浮层。两种形态的差别交给 CSS 类，不另写一套逻辑。 */
  const cp = _root.querySelector('.u-cp');
  if (next === 'wide') {
    /* ★ 261118 问题1：控件**留在地图浮层**（.u-top 不隐藏），右侧栏只放详情/列表。
       261120：折叠面板整块退役（图层开关进了 chips 行首、统计进了动作组），
       这里连"搬到侧栏"的分支都不用留 —— 少一条路径就少一处能对不上的地方。 */
    if (toolbar.parentNode !== top) top.appendChild(toolbar);
    if (filters.parentNode !== top) top.appendChild(filters);
    if (cp) { _sideEl.appendChild(cp); cp.classList.add('side'); }
    /* ★ 261121：这里原先有 `placeCfg(true)` —— 宽屏把设置面板 #mpCfg 搬进侧栏控件区。
       该做法有个**静默失效**：控件区 `.u-side-ctrl` 是 display:none（261118 控件回浮层时留下的），
       面板搬进去后 rect 恒为 0×0，点 ⋯ 什么也看不到（261121 实测 boxRect={0,0,0,0}）。
       现在设置按钮由 CFG_SCRIPT 统一搬进顶部栏的设置槽（全站同一个位置，与宽窄屏无关），
       面板用 CSS 锚在条下沿 —— 形态切换不再需要管它，所以这条调用整条删掉。 */
    _sideEl.classList.add('on');
    _sideEl.classList.toggle('closed', _sideCollapsed);
    if (_root) { _root.style.setProperty('--u-side-w', _sideW + 'px'); _root.classList.toggle('side-collapsed', _sideCollapsed); }
    _sideEl.style.setProperty('--u-side-w', _sideW + 'px');
    drawer.classList.add('off');
    /* 侧栏在浮层右侧给让位（相机 padding 读 sideWidth()）。 */
    if (_st && _st.onSideLayout) { try { _st.onSideLayout(); } catch (e) { /* 不阻塞 */ } }
  } else {
    top.appendChild(toolbar);
    top.appendChild(filters);
    if (cp) { top.appendChild(cp); cp.classList.remove('side'); }
    /* ★ 261121：`placeCfg(false)`（窄屏把面板搬回 body）同样退役 —— 面板从未离开 body，
       设置按钮在条里，面板锚条下沿，窄屏/宽屏同一套。见上面 wide 分支的说明。 */
    _sideEl.classList.remove('on');
    _sideEl.classList.remove('closed');
    if (_root) _root.classList.remove('side-collapsed');
    top.classList.remove('off');
    drawer.classList.remove('off');
    if (_st && _st.onSideLayout) { try { _st.onSideLayout(); } catch (e) { /* 不阻塞 */ } }
  }
  _layout = next;   // ★ 搬完 DOM 再改状态（见上面的注释）
  const newHost = detailHost();
  if (oldHost && oldHost !== newHost) oldHost.innerHTML = '';   // 清掉旧宿主残留
  redrawDetail();
  /* 形态变了 → 遮挡区域变了（右侧栏 / 抽屉）→ 提示卡要按新投影重量 */
  if (_hudApi && _hudApi.repositionTip) { try { _hudApi.repositionTip(); } catch (e) { /* 不阻塞 */ } }
}

/**
 * 按当前选中渲染抽屉。
 * @param {object|null} sel 选中要素（interactions 的 sel 结构：{kind,which,id,props}）
 */
function renderDrawer(sel) {
  if (!_root) return;
  /* ★ 261117 用户拍板：小卡**只归 hover**，点选不再把它固定在地图上。
     原实现这里调 `hud.setPinned(sel)`，于是点一个点 = 地图固定一张带「展开」的卡
     + 详情宿主再画一份 —— 宽屏右侧栏里两者内容完全重复（用户截图里的现象）。
     新分工：hover → 瞬时小卡（网页端有 hover）；点击 → 详情宿主（窄屏抽屉 / 宽屏侧栏）。
     触摸设备本来就不挂 mousemove（interactions.js 的 canHover），点选直接出详情，正合适。
     ⚠ 调 `setPinned(null)` 而非彻底不调：清掉可能残留的上一张固定卡/pin 态，
       避免形态切换等路径留下孤儿卡。 */
  hud.setPinned(null);
  /* ★ 261118 问题1：宽屏侧栏收起时若选中了点 / 公司，自动展开侧栏 ——
     否则详情渲染进 translateX(100%) 的滑出侧栏，用户什么都看不到（静默失效）。
     只在「有新选中」时展开；清空选中（sel=null）不动开合态。 */
  if (sel && _layout === 'wide' && _sideCollapsed) setSideCollapsed(false);
  const d = detailHost();
  if (!d) return;
  /* ★ 必须在覆盖之前取：下面要按「**上一次显示的是什么**」决定退到哪一级（261009 P0-2）。 */
  const prev = _sel;
  _sel = sel;
  if (!sel) {
    /* 关卡片 = **逐级退出**（261009 P0-2，用户拍板）。三档语义，从上到下：
         ① 上一次是**点位卡**（在公司视图里点了个点）→ 回到**公司卡**（公司视图仍在）；
         ② 上一次已经是**公司卡** → **退出公司视图**（回到只剩底图）；
         ③ 不在公司视图 → 只收起抽屉，**保留**分类筛选与地图上的点。
       ⚠ 老写法只做了 ②/③：`if (st.comp) { renderCompCard(...); return; }` —— 于是
         「点地图空白」在公司视图里**永远退不出去**，反而把抽屉弹成 full；而同一条路径
         还让**点位卡的 ✕** 变成「重开公司卡」。而 `index.js` 的规则②与本段旧注释都写着
         「选了公司 → 关卡片 = 退出公司视图」→ **文档与代码直接矛盾**（261009 实测确认：
         comp 恒为 sh601899、抽屉 full、相机不动）。
       ⚠ 任何一档都要把交互层记的选中**静默清掉**（`dropSel`）—— 否则「收起抽屉后再点
         同一个点」会被 `select()` 的去重判成「没变化」，卡片打不开（261009 P0-3）。 */
    const wasPoint = !!(prev && prev.kind === 'point');
    dropSel();
    const st = store.state();
    if (st.comp) {
      const c = store.compOf(st.comp);
      if (c && wasPoint) { renderCompCard(d, Object.assign({ code: st.comp }, c)); return; }
      store.setComp(null);
    }
    setSnap('closed');   /* 只收抽屉，**不**退出公司视图（见上面注释） */
    /* ★ 261116 任务#6 阶段3：宽屏**没有"抽屉滑走"来把卡片藏起来** ——
       窄屏是靠 transform 把抽屉移出屏幕，卡片内容还留在 DOM 里（下次开时重画）；
       宽屏的卡片就在侧栏里，没有位移可藏 → 必须**直接清空宿主**，
       否则「返回键关不掉详情」（卡片一直挂在侧栏上）。 */
    if (_layout === 'wide' && d) d.innerHTML = '';
    /* ★ 261119 右侧栏默认隐藏：详情关闭后把侧栏收回，恢复地图全宽。
       只在「最终关闭」这一档做 —— 上面「回到公司卡」的分支已提前 return，
       不会走到这里（那档仍要看详情，不该收）。 */
    if (_layout === 'wide') setSideCollapsed(true);
    return;
  }
  return renderPointCard(d, sel, prev);
}

/** 渲染当前选中的公司卡（供页面层在选中公司变化时调）。 */
function renderComp() {
  if (!_root) return;
  const d = detailHost();
  if (!d) return;
  const st = store.state();
  if (!st.comp) {
    const cur = _sel;
    if (cur) { renderPointCard(d, cur); return; }
    setSnap('closed');   /* 同上：只收抽屉，不退出公司视图 */
    /* ★ 261119 右侧栏默认隐藏：退出公司视图且无点位选中 → 收回侧栏。 */
    if (_layout === 'wide') setSideCollapsed(true);
    return;
  }
  /* ★ 261119 右侧栏默认隐藏：点公司（含搜索候选/列表选公司）走的是这条路径，
     不经 renderDrawer 的 1511 行展开逻辑。这里按「有公司要显示」展开侧栏，
     否则详情会渲染进 translateX(100%) 的收起侧栏里，用户什么都看不到。 */
  if (_layout === 'wide' && _sideCollapsed) setSideCollapsed(false);
  const c = store.compOf(st.comp);
  if (!c) {
    /* 索引还没加载完（或这家公司不在索引里）：先给提示，不显示空白抽屉。
       store 加载完会重发一次 comp 事件 → 那一刻才渲染真内容。 */
    ensureSnapBound();
  setSnap('full');
    d.innerHTML = '';
    d.appendChild(el('div', 'u-note', '正在加载公司档案…'));
    return;
  }
  renderCompCard(d, Object.assign({ code: st.comp }, c));
}

/* ─── 对外 ─── */

/* ─── 搜索建议（业界标准：边打字边出候选） ─────────── */

/** 防抖时长（ms）。低于 150 会每敲一下都触发一次 972 点线性扫 + 索引遍历。 */
const SUG_DEBOUNCE = 200;

function hideSug() {
  const s = _root && _root.querySelector('.u-sug');
  if (s) { s.classList.remove('on'); s.innerHTML = ''; }
}

/**
 * 渲染候选列表。
 * @param {Array<{kind:'comp'|'point', label:string, sub:string, payload:any}>} list
 */
function showSug(list) {
  const s = _root && _root.querySelector('.u-sug');
  if (!s) return;
  s.innerHTML = '';
  if (!list || !list.length) {
    s.appendChild(el('div', 'u-sug0', '无匹配'));
    s.classList.add('on');
    return;
  }
  list.forEach((it) => {
    const b = el('button', 'u-su');
    b.type = 'button';
    b.appendChild(el('span', 'su-kind', it.kind === 'comp' ? '公司' : (it.sub || '点位')));
    b.appendChild(el('span', 'su-n', it.label));
    if (it.right) b.appendChild(el('span', 'su-x', it.right));
    b.addEventListener('click', () => {
      hideSug();
      _st.onPick && _st.onPick(it);
    });
    s.appendChild(b);
  });
  s.classList.add('on');
}

/**
 * 装配 UI。
 * @param {object} opt
 * @param {(sel:string[]|null)=>void} opt.onCats  分类筛选。**三态**（261008，见 `points.js`
 *        `pointFilter` 的 ★）：`null` = 没碰过这一维（启动态，chip 全亮）；`[]` = 显式全清
 *        （点位层恒假）；`[部分]` = 只留这些；`[全部]` = 显式全选（等价于不按分类限制）。
 *        ⚠ 别再写成「null = 全选」—— 那是三态化之前的说法（261009 改正）。
 * @param {(q:string)=>Promise<Array>} opt.onSuggest 输入变更 → 候选列表（防抖后调）
 * @param {(it:object)=>void} opt.onPick            点候选 → 落地（选公司/飞过去）
 * @param {(code:string|null)=>void} opt.onComp     选中公司（null = 退出公司视图）
 * @param {()=>void} [opt.onDropSel] 抽屉**不再显示任何点位**时通知（收起 / 换卡 / 退出公司视图）。
 *        页面层据此把交互层记的选中**静默清掉**（261009 P0-3，见 `dropSel()` 的说明）。
 *        ⚠ 与 `onSel(null)` 的区别：那个会走 render（"用户改了选中"），这个只是"卡片没了"。
 * @param {(code:string,x:object)=>void} [opt.onPickPoint] 公司卡里点资产清单一条
 * @param {(name:string)=>void} [opt.onRelComp]      点关联公司一条
 * @param {()=>string} [opt.currentTheme]            当前主题名
 * @param {(t:string)=>void} [opt.setTheme]          切主题
 * @param {(k:string,on:boolean)=>void} [opt.onLayer] 图层开关（转给 hud）
 * @param {(s:string)=>void} [opt.onScope]            视野分段（转给 hud）
 * @param {()=>void} [opt.onReset]                    ⤢ 复位（实现归 index.js）
 * @param {()=>object} [opt.getCamera]                取相机（hud 判当前镜头用）
 * @param {()=>number} [opt.span]                     取可见跨度（hud 判当前镜头用）
 * @param {HTMLElement} [opt.root]                   挂载点（默认 #ui）
 */
export function init(opt) {
  _st = opt || {};
  _root = (opt && opt.root) || document.getElementById('ui') || document.body;
  ensureStyle();

  /* ★ 顶部是**一个流式容器**（261005），行按插入顺序自上而下：
       行1 搜索 + 复位 + 公司列表
       行2 图层开关 + 视野分段      ← hud 建
       行3 分类筛选两行 + 全清（261008）
       行4 统计行                    ← hud 建
     hud 负责建它那两行（它懂自己的数据），本模块只负责**把它们插在对的位置** ——
     这样"上下顺序"这件事仍然只有一处（这里），而 hud 不需要知道 chip 的存在。 */
  const top = el('div', 'u-top');

  const toolbar = el('div', 'u-toolbar');
  const swrap = el('div', 'u-swrap');
  const box = el('input', 'u-search');
  box.type = 'search';
  /* ★ 261116 任务#6：搜索框宽度被挤压（工具条行还要装视野分段与图标钮，实测只剩 ~121px），
     placeholder 去掉空格避免截断。字段本身仍可输入完整关键字。 */
  box.placeholder = '搜公司/代码/矿名';
  /* ⚠ 输入即出候选，不等回车（261003-88 定的成熟交互）。
     ⚠ 下拉**不能挡点地图**：建议列表弹出时它只占顶部一小块，
       用户想关掉它可以点空白 —— 但点空白在地图上会触发「取消选中」，
       那是另一个语义，不冲突。 */
  let sugTimer = 0;
  box.addEventListener('input', () => {
    const q = box.value.trim();
    if (!q) { hideSug(); return; }
    if (sugTimer) clearTimeout(sugTimer);
    sugTimer = setTimeout(() => {
      sugTimer = 0;
      Promise.resolve(_st.onSuggest ? _st.onSuggest(q) : []).then((out) => {
        /* 序号守卫（job.latestOnly）：期间又输入过 → 旧结果作废。
           ⚠ 判据是 `out == null`，**不是 `!out`** —— 空数组是合法结果（搜到 0 个候选
             要真的把下拉清空），写成 `!out` 会把它也丢掉。 */
        if (out == null) return;
        showSug(out);
      });
    }, SUG_DEBOUNCE);
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (sugTimer) { clearTimeout(sugTimer); sugTimer = 0; }
      const q = box.value.trim();
      box.blur();
      hideSug();
      if (q && _st.onEnter) _st.onEnter(q);
    } else if (e.key === 'Escape') {
      hideSug();
    }
  });
  swrap.appendChild(box);
  /* 搜索建议列表：挂在搜索框的包裹层里（`top:100%`），不再靠绝对偏移 ——
     这样"上面多了一行控件"不会把它顶偏。 */
  swrap.appendChild(el('div', 'u-sug'));
  toolbar.appendChild(swrap);

  /* ★ 261008：**不再提供「数据口径与重要说明」按钮**（原 ⚙ / 老页 mpBtnNote）——
     用户要求去掉。正文与弹窗能力本身都还在（hud.openNote / note.js），
     只是地图页不再给它入口。与「主题按钮」261007-179 退役是同一条理由：
     地图页要回答的是「资产在哪」，说明性浮层是打断这件事的东西。 */

  /* ⤢ 复位（老页 mpBtnFit）：清掉全部筛选与选中 + 回默认镜头。
     ⚠ 实现不在本模块 —— 复位要动状态（store）与相机（engine），那是 index.js 的事。 */
  if (_st.onReset) {
    const rb = el('button', 'u-btn', '⤢');
    rb.type = 'button';
    rb.title = '复位（清筛选 + 回默认镜头）';
    rb.addEventListener('click', () => _st.onReset());
    toolbar.appendChild(rb);
  }

  /* ★ 261118 问题1：侧栏开合按钮（◧）。放在浮层工具条里，宽屏才有意义 ——
     窄屏没有右侧栏，按钮用 CSS 的 .u-wide-only 隐藏（在 ensureStyle 里定义）。 */
  const sideBtn = el('button', 'u-btn u-wide-only', '◧');
  sideBtn.type = 'button';
  sideBtn.title = '收起 / 展开详情侧栏';
  sideBtn.addEventListener('click', () => setSideCollapsed(!_sideCollapsed));
  toolbar.appendChild(sideBtn);

  /* ★ 261008：**不再提供 🔗「复制当前视图链接」按钮**（老页 mpBtnLink）—— 用户要求去掉。
     ⚠ 深链**能力**本身保留（index.js 的 copyLink / makeHash 仍导出、探针仍在用它验
       「世界/中国/中间尺度」三档序列化），去掉的只是地图页上这个入口 ——
       本页本来就不回写地址栏，复制出来的链接对用户没有落点。 */

  /* 🏢 公司面板（老页 mpBtnComp）：120 行以外的公司列表。
     ⚠ 家数由 company.js 在索引到位后回调填（索引 184 KB 是懒加载的，
       写死 137 会在数据变了之后**悄悄过期**，而界面上看不出来）。 */
  const cb = el('button', 'u-btn', '🏢');
  cb.type = 'button';
  cb.title = '上市公司列表';
  cb.appendChild(el('em', 'u-cn', ''));
  toolbar.appendChild(cb);

  /* ★ 261007-179：**不再提供地图自己的「主题」按钮** —— 主题只认全局那一套。
     原来这里有一个循环 dark→light→sepia 的按钮，它只改地图的 paint 与 CSS 变量，
     **既不写 `data-theme`、也不持久化**；而壳（build_content 注入层）一广播
     `mp:themechange` 就把地图覆盖回全局主题，刷新后按钮状态还丢 ——
     两套入口管同一份配色，是典型的「同一件事两份实现」。
     现在统一由 `index.js` 订阅全局 `mp:themechange` 来换色（见那里的监听）。 */
  top.appendChild(toolbar);

  /* hud：图层开关 + 视野分段（行2）与统计行（行4）。
     ⚠ 必须在 chip 之前建好 —— 本段末尾 store 订阅要调它的 refresh/counts。 */
  const hudApi = hud.init({
    root: _root,
    host: top,
    onLayer: (k, on) => { if (_st.onLayer) _st.onLayer(k, on); },
    onScope: (s) => { if (_st.onScope) _st.onScope(s); },
    getCamera: () => (_st.getCamera ? _st.getCamera() : null),
    span: () => (_st.span ? _st.span() : null),
    /* ★ 261116 任务#3：提示卡定位。
       `_st.project` 给的是**地图画布**像素，而卡片 left/top 写在 `#ui` 里 —— 两者现在相等，
       纯属两条 CSS 都写了 `top:var(--mp-nav-h,0)`（index2.html 有注释警告过这个耦合）。
       这里显式量 rect 差值补上：哪天约定被改（换父节点 / 给 #map 加偏移 / 某页漏引条高），
       卡片也不会整体偏一个条高 —— 那正是这次要修的症状长相，不能再留同一个入口。 */
    project: (lngLat) => {
      const px = _st.project ? _st.project(lngLat) : null;
      if (!px || !Number.isFinite(px[0]) || !Number.isFinite(px[1])) return null;
      const mapEl = document.getElementById('map');
      if (!mapEl || !_root) return px;
      const mr = mapEl.getBoundingClientRect();
      const ur = _root.getBoundingClientRect();
      return [px[0] + (mr.left - ur.left), px[1] + (mr.top - ur.top)];
    },
    /* 固定卡「展开」：当前 = 抽屉全开；任务#6 换成右侧详情面板时**只改这里**，
       hud 与调用点都不用动（这就是把它做成抽象而不是直接 setSnap 的原因）。 */
    onExpand: () => { expandSel(); },
    /* 数据到位 → 分类表已注入 PT_CATS（hud.js 里先 applyStatsCats 再回调），
       所以这里要**重建** chip（新分类才出现）再刷计数（261007-180；原来只刷数字）。 */
    onData: () => { rebuildChips(); syncChipCounts(); },
  });

  /* 工具条行 = [搜索框][🌍🇨🇳 视野分段][⤢ 复位][◧ 侧栏][🏢 公司]。
     261120：⚙「视图设置」整块退役 —— 它的两块内容都有了更好的去处
     （图层开关进 chips 行首、统计进全选/全清旁边），留着只是个挡 chips 的浮层。 */
  _hudApi = hudApi;
  const firstToolBtn = toolbar.querySelector('.u-btn');
  if (firstToolBtn) toolbar.insertBefore(hudApi.seg, firstToolBtn);
  else toolbar.appendChild(hudApi.seg);

  /* 筛选栏 = `[ .u-frows（两行，行首是图层开关） ][ .u-acts（全选/全清/N 个点） ]`。
     ⚠ 「全选 / 全清」**不能**挂进某一行里，否则会被读成"只对这一行生效"
       （它们是全局的，见 CSS 那段）。 */
  const filters = el('div', 'u-filters');
  const frows = el('div', 'u-frows');
  PT_LAYERS.forEach((w) => buildChips(frows, w));
  filters.appendChild(frows);

  const acts = el('div', 'u-acts');

  /* ★ 261120 新增「全选」：原来只有「全清」没有反向操作 —— 清完想全看回来，
     只能去点右上角 ⤢ 复位（那会连镜头、公司、选中一起清掉，代价太大）。 */
  const all = el('button', 'u-all', '全选');
  all.type = 'button';
  all.title = '显示全部分类（不动镜头、不动公司）';
  all.addEventListener('click', () => {
    /* 送 `null` 而不是"全部类目的数组"：`null` = 没碰过这一维（等价全选，
       points.pointFilter 明确承认这个态）；传数组是**快照**，切层/换公司后
       分类集合一变，快照当场过期。 */
    syncChips(null);
    if (_st) _st.onCats(null);
  });
  acts.appendChild(all);
  _allBtn = all;

  const clr = el('button', 'u-clear', '全清');
  clr.type = 'button';
  clr.title = '清空全部分类勾选（地图只剩底图）';
  clr.addEventListener('click', () => {
    /* ★ 两件事都要做，且顺序无所谓、但缺一不可：
         ① `syncChips([])` 让 chip 全灭（复用同一份画法，不另写一遍 DOM 操作）
         ② 把 `[]` 送进状态 —— 只灭 chip 不改状态的话，地图上的点**不会消失**
            （filter 还按旧分类筛），表现是「按钮点了、chip 灭了、点还在」。
       ⚠ 送 `[]` 而不是 `null`：`null` 是「没碰过这一维」（= 默认态），
         与「用户显式全清」不是一回事 —— 详见 points.js pointFilter 的 ★ 三态。 */
    syncChips([]);
    if (_st) _st.onCats([]);
  });
  acts.appendChild(clr);
  _clearBtn = clr;
  /* 统计「N 个点」跟着动作组（它回答的正是"这些开关的后果是多少"），
     并且**只留数字** —— 原来那句「· 筛 煤炭/核电」与亮着的 chip 完全重复。 */
  if (hudApi.stat) acts.appendChild(hudApi.stat);
  filters.appendChild(acts);

  top.appendChild(filters);

  _root.appendChild(top);

  /* ★ 261116 任务#6：右侧栏（宽屏形态）。默认隐藏，applyLayout() 按**容器宽**决定。
     ★ 261121：控件区 `.u-side-ctrl` 已删 —— 它自 261118「控件回地图浮层」起就是
       `display:none`，唯一的住客是 placeCfg 搬进来的设置面板（也就跟着不可见）。
       现在设置面板归顶部栏（见 CFG_SCRIPT），这个容器没有任何用途，留着只会
       让后来的人以为"侧栏里还有个控件区"。 */
  _sideEl = el('div', 'u-side');
  _sideDetail = el('div', 'u-side-detail');
  _sideGrip = el('div', 'u-side-grip');       // 左边缘拖宽手柄（261118 问题1）
  _sideEl.appendChild(_sideDetail);
  _sideEl.appendChild(_sideGrip);
  _root.style.setProperty('--u-side-w', _sideW + 'px');
  _sideEl.style.setProperty('--u-side-w', _sideW + 'px');
  _root.appendChild(_sideEl);
  bindSideGrip();

  /* 公司面板（🏢，261005 补）：锚在顶栏**下方**（CSS 里 top:100%，不占顶栏的流）。
     ⚠ 必须在 `.u-top` 进文档之后 init：面板打开时要按 `.u-top` 的底边算最大高度，
       早一步量到的 rect 全是 0（元素还没上树），面板会算出一个荒谬的高度。
     ⚠ 「选完就收」是刻意的：手机上面板占 78% 宽，不收掉就看不见地图与公司卡，
       用户会以为"点了没反应"（老页是整页跳走、面板自然消失，语义一致）。
     ⚠ 按钮的 `.on` 态只由 `paintCb()` 这一处写（开、关、选完自动收，都要经过它）——
       商店里有"按钮亮着但面板已经关了"这种事，就是两处各写一次类名写出来的。 */
  const companyApi = company.init({
    root: _root,
    host: top,
    onPick: (code) => { companyApi.close(); paintCb(); if (_st.onComp) _st.onComp(code); },
    onCount: (n) => { const em = cb.querySelector('.u-cn'); if (em) em.textContent = n ? String(n) : ''; },
  });
  function paintCb() { cb.classList.toggle('on', !!companyApi.isOpen()); }
  /* ★★ 261120 修：宽屏时 `.u-cp` 被搬进右侧栏（ui.js 的 applyLayout），而侧栏默认收起
     （translateX(100%)）—— 旧代码只 toggle 面板、不展开侧栏，于是**按钮亮了、
     面板在屏幕外**，用户看到的就是"点了没反应"（用户报的「137 点击无用」）。
     与详情卡/公司卡/设置三处保持一致：宽屏先展开侧栏，再切面板。 */
  cb.addEventListener('click', () => {
    if (_layout === 'wide' && _sideCollapsed) setSideCollapsed(false);
    companyApi.toggle();
    paintCb();
  });

  // 详情抽屉
  const _d = el('div', 'u-drawer');
  _root.appendChild(_d);
  /* 绑三档吸附的拖动（261004-93）。⚠ 必须在**建好 DOM 之后**绑：
     监听挂在 `.u-dhead` 上，而它是抽屉内容渲染时才有的子块——
     所以真正的绑定点放在 renderDrawer/renderComp 首次渲染之后（见 ensureSnapBound）。 */
  _drawerEl = _d;
  registerBackLayers();

  /* 筛选 chip 与公司选择是**互相独立**的两维（261003-88）：
     「选了公司 + 只看贵金属」= 该公司的贵金属点。
     故取消公司时**不动 chips**，反过来清 chips 也不清公司。
     ⚠ 261005 起这里同时负责 chip 计数与统计行 —— 它们与 chip 是同一份状态的两种画法，
       分成两处订阅迟早出现"chip 说 8 个、统计行说 65 个"。 */
  store.on((st2, what) => {
    if (what === 'comp') renderComp();
    syncChipCounts();
    /* 「全清」按钮的可用态跟着状态走（261008）—— 点掉最后一枚 chip 时它要立刻变灰，
       那是**状态**变化而不是点击，所以挂在这里而不是挂在点击回调里。 */
    syncClearBtn();
    syncLayerRows();
    hudApi.refresh();
    /* 公司面板只重画「哪一行是选中态」—— 不重排（列表突然跳位置会让人看不明白）。
       ⚠ 面板没开时它是**空转**（refresh 里先查 .cp-i 有没有），可以放心每帧调。 */
    companyApi.refresh();
  });

  paintVars();
  document.addEventListener('mp:themechange', paintVars);
  syncChipCounts();
  syncLayerRows();
  /* 「全清」的初始可用态（261008）：启动态 cats=null → 有可清 → 亮着。
     这一句不能省 —— 上面那次 store 订阅只负责**变化**，不负责初始。 */
  syncClearBtn();
  /* ★ 261116 任务#6：形态判定 + 跟随容器尺寸变化。
     ⚠ 观察的是 **#ui**（它的宽 = 地图容器宽），不是 window ——
       桌面浏览器分屏 / 侧栏展开时容器会变窄，形态必须跟着容器走。 */
  applyLayout();
  if (window.ResizeObserver) {
    let lastW = _root.clientWidth;
    new ResizeObserver(() => {
      const w = _root.clientWidth;
      if (w === lastW) return;
      lastW = w;
      applyLayout();
    }).observe(_root);
  }
  return { render: renderDrawer, renderComp, syncChips, paint: paintVars, hideSug,
    /* ★ 261116 任务#6：形态与遮挡宽度对外暴露（页面层要用它给相机让位）。 */
    layout: () => _layout,
    sideWidth: () => (_layout === 'wide' && !_sideCollapsed ? _sideW : 0),
    /** 261118 问题1：侧栏抽屉的可观测状态（探针用）。 */
    sideState: () => ({ layout: _layout, collapsed: _sideCollapsed, width: _sideW }),
    toggleSide: () => setSideCollapsed(!_sideCollapsed),
    setSideWidth: (px) => setSideWidth(px),
    applyLayout: applyLayout,
    /** ★ 261119「只筛不弹」：清空详情宿主并收起侧栏/抽屉，**不动 store 选中**。
        供 selectComp(openCard:false) 用 —— store 订阅的 renderComp 会抢先开卡，
        这里在末尾显式清掉，避免宽屏公司卡盖住要看的地图（与窄屏 setSnap('closed') 同义）。 */
    clearDetail: () => {
      const d = detailHost();
      if (d) d.innerHTML = '';
      setSnap('closed');
      if (_layout === 'wide') setSideCollapsed(true);
    },
    hud: hudApi,
    company: companyApi,
    /** 复位用：把搜索框清空（连带收起建议列表）—— 复位要「看起来什么都没选中」。 */
    clearQuery: () => { box.value = ''; hideSug(); },
    /** 一次性提示（复制链接 / 复位这类"画面上没有变化"的动作要给回执）。 */
    toast: (t) => hud.toast(t),
    /* 悬停提示：页面层把 interactions 的 hover 转过来（本模块自己不认识 interactions）。 */
    tip: (h) => hud.tip(h),
    /* 相机 / 尺寸变了 → 提示卡按新投影重量（261116 任务#3）。调用方负责 rAF 合并。 */
    repositionTip: () => hud.repositionTip(),
    /* 固定卡的「展开」也对外暴露一份：搜索/深链等程序化入口若要"直接展开"可以复用。 */
    expandSel: () => expandSel(),
    /* 相机变了 → 视野分段的高亮可能变（用户自由缩放后两个镜头都不亮）。
       ⚠ 走 refreshScope（只动分段那一块）而不是 refresh：相机回调是**每帧**来的，
         整块重绘会在拖动时拖慢帧率。 */
    scopeChanged: () => hudApi.refreshScope() };
}
