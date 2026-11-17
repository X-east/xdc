/* company.js —— 右侧「上市公司」面板（261005 从老页 map_kit 的公司面板整段补回）
   ------------------------------------------------------------------
   负责：把公司索引（`dist/comp_index.json`，137 家）变成**可搜、可排、可翻**的一张列表：
         搜索 + 6 种排序 + 首字母 A→Z 索引 + 按行业/首字母分组。
   不负责：**选中公司之后做什么**（→ index.js 的 selectComp）、公司卡（→ ui.js）、
           数据本身（→ store.js 的 index()）、地图上的点（→ points.js）。

   ★ 为什么单独成模块，而不并进 ui.js
     理由与 hud.js 同一条：ui.js 那条链路的变化原因是**交互口径**（选中 → 卡片），
     本模块的变化原因是**列表口径**（排序键、分组、索引）。混在一起，
     那个已经 980 行的文件会变成"什么都往里塞"，而且这两种改动几乎从不同时发生。

   ★ 老页对照（老页那份在 app/map_kit.py 的 FLOAT_HTML/FLOAT_JS 里，已退役）
     · `#mpComp` 面板（标题 + 家数 + ✕）      → 本模块
     · `#cpSearch` 搜索（名称/代码/首字母）    → 本模块
     · 公司列表排序                             → 本模块
     · `#alphaIndex` 首字母条                 → 本模块
     · 分组列表（组头带家数）                   → 本模块
     · `#mpBtnComp`（🏢 公司 + 家数）          → ui.js 的工具条按钮（本模块只管面板）

   ★ 排序与分组**在前端现算**，不在导出层做（与「业务判断前移到导出层」并不矛盾）
     那条原则针对的是**数据口径**（哪些点属于哪家公司、净利怎么合计口径）；
     排序是**展示顺序**，同一份数据按 6 个键排，导出层做就得存 6 份顺序、
     而且一改排序键就得重跑构建。137 条在前端排序的总成本是微秒级。

   ★ 与老页的一处**有意**不同：老页只把「有矿区」的公司放进面板（0 矿区的列出来
     "在图上无处可去，只会误导"）。本页把 **137 家全列出来**，无资产点的行标「无资产点」，
     点开公司卡会明确写明原因（纯参股平台）。理由：新页的公司卡已经是"信息主体"
     （不只是地图的取景开关），把 15 家真实存在的上市公司从「上市公司」列表里藏掉，
     用户看到的是"数据缺了一块"，而不是"这里没东西"。

   ★ 字号一律用 em、颜色一律用 `--u-*` 变量（与 ui.js / hud.js 同一条理由）：
     本模块的 CSS 不经 build_content.scale_fonts 改写，写死 px 会让设置面板的
     字号档位对它失效；写死颜色则会在浅色/暖色主题下错色。 */

import * as store from './store.js';
import { el } from './dom_kit.js';
import { cateCn } from './theme.js';

const STYLE_ID = 'mp2-cp-css';

/** 只比较当前索引有一致单位的指标。 */
export const SORTS = [
  { k: 'ind', t: '按行业' },
  { k: 'py', t: '按企业首字母（A→Z）' },
  { k: 'roe', t: '按 2025 ROE' },
  { k: 'npts', t: '按关联资产数' },
];

/** 排序/索引用的 2025 年报那一格（取不到给空对象 —— 不要给 undefined，
 *  否则下面每个取值点都得判空一次）。 */
function finOf(c) {
  return (c && c.fin && c.fin.y2025) || {};
}

/** 数值降序比较：**缺失值一律排在最后**（不能当 0 —— 「未披露」与「净利 0」是两件事，
 *  混在一起会让没披露的公司挤掉真正亏损/微利的公司）。 */
function byNumDesc(get) {
  return (a, b) => {
    const va = get(a), vb = get(b);
    const na = (va == null || !isFinite(va)) ? -Infinity : va;
    const nb = (vb == null || !isFinite(vb)) ? -Infinity : vb;
    return nb - na;
  };
}

/* ─── 小工具 ─── */

/** 数值缺失时返回 null。 */
function num(v) {
  const n = Number(v);
  return (v == null || v === '' || !isFinite(n)) ? null : n;
}

/* ─── 排序 / 分组 ─── */

const companyName = (a, b) => String(a.n || '').localeCompare(String(b.n || ''), 'zh');

/**
 * 排序 + 分组。
 * @param {Array<object>} items 公司记录（已按搜索词过滤）
 * @param {string} sort SORTS 里的 k
 * @returns {Array<{title:string, right:string, items:Array}>}
 */
export function group(items, sort) {
  const list = items.slice();
  if (sort === 'ind' || sort === 'py') {
    const groups = new Map();
    for (const company of list.sort(companyName)) {
      const key = sort === 'ind' ? (company.ind || '其他') : (company.py0 || '#');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(company);
    }
    const keys = [...groups.keys()];
    keys.sort((a, b) => sort === 'ind' ? a.localeCompare(b, 'zh') : a.localeCompare(b));
    return keys.map((title) => {
      const members = groups.get(title);
      return { title, kind: sort, items: members, right: members.length + ' 家' };
    });
  }
  const get = sort === 'roe' ? (c) => num(finOf(c).roe) : (c) => num(c.nPts);
  list.sort((a, b) => byNumDesc(get)(a, b) || companyName(a, b));
  return [{ title: '', kind: '', items: list }];
}

/* ─── 状态 ─── */

let _root = null;      // UI 根（#ui）
let _st = null;        // { onPick }
let _panel = null;     // 面板根 .u-cp
let _listEl = null;
let _alEl = null;
let _rows = [];        // 索引记录数组（{code, ...rec} —— code 并进记录里，行与数据一一对应）
let _open = false;
let _sort = 'ind';
let _q = '';
let _busy = false;

/* ─── 渲染 ─── */

/* ⚠ 分类中文名走 theme.js 的 `cateCn`（唯一实现）—— 搜索里要认「金矿」「水电」这类
   矿种/电源类型的中文名（见下面 hasMatch 里的用法），名字与点位卡 / chip 必须同源。
   原先这里另有一份本地实现、回退成空串，与 ui.js / hud.js 的「回退 key」不一致
   （261005-102 P1-3）。别再搬回来。 */

/**
 * 一家公司是否命中搜索词。口径**逐项对齐老页 compFiltered**：
 *   名称 / 代码 / 全拼 / 首字母 / **拼音缩写** / **旗下资产名与分类**
 * 老页最后那项很值钱：打「金矿」能列出所有有金矿的公司 ——
 * 那是"找公司"这个面板最容易想到的用法（我手里有这家公司，但我想找**它有哪类矿**）。
 * ⚠ 老页漏了拼音缩写（`pyAbr`），打「zjky」搜不到紫金矿业 —— 本次补上。
 */
function matches(c, q) {
  if (!q) return true;
  /* ⚠ 单个字母走**首字母组**，不再按"全拼/代码里含这个字母"匹配（261005）：
     老页是全字段子串匹配，于是打一个「z」会列出 86 家 —— 其中**大半是因为深交所
     代码以 `sz` 开头**（sz000878 里就有个 z），和旁边那条 A→Z 索引条说的完全是两件事。
     单字母只可能是"我要 Z 开头的"，所以长度 1 时**只认 py0**（外加名称里真的含这个
     字母的，如「粤电力A」）—— 行为与索引条一致，可预期。 */
  const letter1 = /^[a-z]$/.test(q);
  if (letter1) {
    return String(c.py0 || '').toLowerCase() === q
      || String(c.n || '').toLowerCase().indexOf(q) >= 0;
  }
  if (String(c.n || '').toLowerCase().indexOf(q) >= 0) return true;
  if (String(c.code || '').toLowerCase().indexOf(q) >= 0) return true;
  if (String(c.pyAbr || '').toLowerCase().indexOf(q) >= 0) return true;
  if (String(c.py || '').toLowerCase().indexOf(q) >= 0) return true;
  const pts = c.pts || [];
  for (let i = 0; i < pts.length; i++) {
    if (String(pts[i].n || '').toLowerCase().indexOf(q) >= 0) return true;
    if (q.length > 1 && cateCn(pts[i].c).toLowerCase().indexOf(q) >= 0) return true;
  }
  return false;
}

function visible() {
  return _rows.filter((c) => matches(c, _q));
}

function renderAlpha(list) {
  if (!_alEl) return;
  if (_sort !== 'py') { _alEl.hidden = true; _alEl.innerHTML = ''; return; }
  _alEl.hidden = false;
  const has = {};
  list.forEach((c) => { has[String(c.py0 || '#').toUpperCase()] = 1; });
  _alEl.innerHTML = '';
  ('ABCDEFGHIJKLMNOPQRSTUVWXYZ#').split('').forEach((L) => {
    const s = el('span', has[L] ? '' : 'off', L);
    if (!has[L]) { _alEl.appendChild(s); return; }
    s.dataset.l = L;
    s.addEventListener('click', () => jumpTo(L));
    _alEl.appendChild(s);
  });
}

function jumpTo(L) {
  if (!_listEl) return;
  const heads = _listEl.querySelectorAll('.cp-g');
  for (let i = 0; i < heads.length; i++) {
    const t = heads[i].querySelector('b');
    if (t && t.textContent.trim() === L) {
      /* ⚠ 用 scrollTop 而不是 scrollIntoView：后者在某些 WebView 里会**连带滚动祖先**
         （整页跟着动一下），而这里只该滚列表自己那个容器。 */
      _listEl.scrollTop = heads[i].offsetTop - _listEl.offsetTop;
      heads[i].classList.add('flash');
      setTimeout(() => heads[i].classList.remove('flash'), 750);
      return;
    }
  }
}

function renderList() {
  if (!_listEl) return;
  const list = visible();
  const cnt = _panel.querySelector('.cp-n');
  if (cnt) cnt.textContent = (_q ? '命中 ' : '') + list.length + ' 家';
  renderAlpha(list);
  _listEl.innerHTML = '';
  if (!list.length) {
    _listEl.appendChild(el('div', 'cp-emp', '没有符合条件的企业'));
    return;
  }
  const cur = store.state().comp;
  group(list, _sort).forEach((g) => {
    if (g.title) {
      const h = el('div', 'cp-g');
      h.appendChild(el('b', null, g.title));
      h.appendChild(el('i', null, g.right || ''));
      _listEl.appendChild(h);
    }
    g.items.forEach((c) => {
      const b = el('button', 'cp-i' + (c.code === cur ? ' on' : ''));
      b.type = 'button';
      b.dataset.cd = c.code;
      b.appendChild(el('b', null, c.n || c.code));
      const n = num(c.nPts) || 0;
      b.appendChild(el('em', null, n ? n + ' 个' : '无资产点'));
      b.addEventListener('click', () => { if (_st.onPick) _st.onPick(c.code); });
      _listEl.appendChild(b);
    });
  });
}

/** 面板高度 = **它的宿主**里还剩多少空间。
 *  ⚠ 必须在**打开时**量（顶栏行数会随窗口宽度变：窄屏 chip 换行后顶栏更高）——
 *    写死 vh 会在窄屏上把面板底边推出屏幕。
 *  ★ 261116 任务#6 阶段3：改成按**宿主**算，而不是按视口算 ——
 *    宽屏时面板住在**右侧栏**里（宿主 = .u-side），按视口算会算出一个
 *    「视口高 − 面板顶 − 10」的数，比侧栏矮 10px（实测 790 vs 800），
 *    面板底边就永远差一条。语义也该是「不许超出它的宿主」。 */
function fitHeight() {
  if (!_panel || !_root) return;
  const host = _panel.offsetParent || _root.querySelector('.u-top');
  const hb = host ? host.getBoundingClientRect() : null;
  const pr = _panel.getBoundingClientRect();
  const avail = hb ? (hb.bottom - pr.top) : ((window.innerHeight || 844) - pr.top);
  _panel.style.maxHeight = Math.max(120, Math.round(avail)) + 'px';
}

/* ─── 样式 ─── */

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = [
    /* 面板：贴右侧、锚在顶栏**下方**（top:100% 相对 .u-top，不占它的流）。
       为什么不用固定 top：顶栏行数会随宽度变（窄屏 chip 换行），写死就会错位 ——
       这是 ui.js 早先三处写死偏移互相咬住的那个老毛病的同一类，别再犯一次。 */
    '.u-cp{position:absolute;top:100%;right:0;width:19em;max-width:78vw;display:none;',
    '  flex-direction:column;margin-top:.35em;pointer-events:auto;overflow:hidden;',
    '  border-radius:.6em;border:1px solid var(--u-bd);background:var(--u-panel-solid);',
    '  box-shadow:0 4px 18px rgba(0,0,0,.45);}',
    '.u-cp.on{display:flex;}',
    '.cp-h{display:flex;align-items:center;gap:.4em;padding:.5em .6em;border-bottom:1px solid var(--u-bd);}',
    '.cp-h h4{margin:0;font-size:.8em;font-weight:500;color:var(--u-tx);}',
    '.cp-n{font-size:.7em;color:var(--u-tx3);font-style:normal;}',
    '.cp-x{margin-left:auto;width:1.8em;height:1.8em;border-radius:.9em;font-size:.72em;',
    '  border:1px solid var(--u-bd);background:transparent;color:var(--u-tx2);line-height:1;',
    '  -webkit-tap-highlight-color:transparent;}',
    '.cp-f{display:flex;flex-direction:column;gap:.35em;padding:.5em .6em;border-bottom:1px solid var(--u-bd);}',
    '.cp-q{width:100%;height:2em;padding:0 .6em;border-radius:1em;font-size:.76em;',
    '  border:1px solid var(--u-bd);background:var(--u-panel);color:var(--u-tx);outline:none;',
    '  -webkit-appearance:none;}',
    '.cp-q::placeholder{color:var(--u-tx3);}',
    '.cp-s{width:100%;height:2em;padding:0 .5em;border-radius:.4em;font-size:.74em;',
    '  border:1px solid var(--u-bd);background:var(--u-panel);color:var(--u-tx);}',
    /* 首字母条：横向可滚的一行（26+1 个字母在窄屏上放不下，别挤成两行） */
    '.cp-al{display:flex;gap:.1em;padding:.35em .5em;overflow-x:auto;',
    '  border-bottom:1px solid var(--u-bd);scrollbar-width:none;}',
    '.cp-al::-webkit-scrollbar{display:none;}',
    '.cp-al span{flex:0 0 auto;width:1.25em;height:1.25em;line-height:1.25em;text-align:center;',
    '  border-radius:.3em;font-size:.68em;color:var(--u-tx2);}',
    '.cp-al span.off{color:var(--u-tx3);opacity:.35;}',
    '.cp-al span:not(.off){background:var(--u-panel2);}',
    /* 列表：**只有它自己滚**（面板高 = 视口高 − 顶栏），组头吸顶 */
    '.cp-l{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;}',
    '.cp-g{position:sticky;top:0;display:flex;align-items:center;gap:.4em;padding:.3em .6em;',
    '  background:var(--u-panel-solid);border-bottom:1px solid var(--u-bd);}',
    '.cp-g b{font-size:.72em;font-weight:500;color:var(--u-accent);}',
    '.cp-g i{margin-left:auto;font-style:normal;font-size:.66em;color:var(--u-tx3);}',
    '.cp-g.flash{background:var(--u-panel2);}',
    '.cp-i{display:flex;align-items:center;gap:.4em;width:100%;padding:.45em .6em;',
    '  border:0;border-bottom:1px solid var(--u-bd);background:transparent;',
    '  color:var(--u-tx2);font-size:.76em;text-align:left;',
    '  -webkit-tap-highlight-color:transparent;}',
    '.cp-i b{flex:1;min-width:0;font-weight:400;overflow:hidden;text-overflow:ellipsis;',
    '  white-space:nowrap;}',
    '.cp-i em{flex:0 0 auto;font-style:normal;font-size:.86em;color:var(--u-tx3);}',
    '.cp-i.on{background:var(--u-panel2);color:var(--u-tx);}',
    '.cp-i.on b{font-weight:500;color:var(--u-accent);}',
    '.cp-emp{padding:.8em .6em;font-size:.74em;color:var(--u-tx3);}',
  ].join('');
  document.head.appendChild(s);
}

/* ─── 对外 ─── */

/**
 * 装配面板（不显示；由 toggle/open 决定）。**先建 DOM 再取数据**：
 * 索引 184 KB 要下载，等它会让按钮点下去半天没反应；先给一个"正在加载"的壳。
 * @param {object} opt
 * @param {HTMLElement} opt.root  UI 根（#ui）
 * @param {HTMLElement} opt.host  行容器（ui.js 的 .u-top）—— 面板锚在它下面
 * @param {(code:string)=>void} opt.onPick 点一家公司
 * @param {(n:number)=>void} [opt.onCount] 家数到位（工具条按钮上显示它）
 */
export function init(opt) {
  const o = opt || {};
  _st = o;
  _root = o.root || document.getElementById('ui') || document.body;
  ensureStyle();

  _panel = el('div', 'u-cp');
  const head = el('div', 'cp-h');
  head.appendChild(el('h4', null, '上市公司'));
  head.appendChild(el('span', 'cp-n', ''));
  const x = el('button', 'cp-x', '✕');
  x.type = 'button';
  x.addEventListener('click', () => close());
  head.appendChild(x);
  _panel.appendChild(head);

  const filt = el('div', 'cp-f');
  const q = el('input', 'cp-q');
  q.type = 'search';
  q.placeholder = '搜索企业 / 代码 / 拼音 / 资产名…';
  q.addEventListener('input', () => { _q = q.value.trim().toLowerCase(); renderList(); });
  filt.appendChild(q);
  const sel = el('select', 'cp-s');
  SORTS.forEach((s) => {
    const op = el('option', null, s.t);
    op.value = s.k;
    sel.appendChild(op);
  });
  sel.value = _sort;
  sel.addEventListener('change', () => { _sort = sel.value; renderList(); });
  filt.appendChild(sel);
  _panel.appendChild(filt);

  _alEl = el('div', 'cp-al');
  _alEl.hidden = true;
  _panel.appendChild(_alEl);

  _listEl = el('div', 'cp-l');
  _panel.appendChild(_listEl);

  (o.host || _root).appendChild(_panel);

  /* 返回栈登记（与 ui.js/hud.js 同一条约定：独立打开时入队，注入层启动时排空）。
     order 取 145：小于抽屉的 140？不 —— **大于** 140，因为面板是盖在抽屉之上的独立浮层，
     返回键该先收它。
     ⚠ 261009 更正：这句原先还写着「与说明弹窗(160)、搜索建议(135) 的相对次序也一致」——
       那是错的。搜索建议的 `.u-sug` 是 `z-index:4`（本页最高），**盖在面板之上**，
       所以它的 order 必须**大于** 145；原值 135 比抽屉的 140 还低，实际次序是
       「抽屉 → 面板 → 建议」—— 与视觉叠放正好相反（用户要连按好几次返回才轮到建议）。
       现为：说明弹窗 160 > **搜索建议 150** > 公司面板 145 > 抽屉 140。 */
  const reg = window.__mpBackReg;
  const entry = ['mpComp', 145, () => _open, () => { close(); return true; }];
  if (reg) reg.apply(null, entry);
  else (window.__mpBackQ = window.__mpBackQ || []).push(entry);

  window.addEventListener('resize', () => { if (_open) fitHeight(); });

  /* 261116 任务#4：原来是 `load()` —— 启动就取索引并渲染 137 行（面板却是关着的）。
     改到空闲时补，保住工具条家数、又不和首屏抢主线程/带宽。 */
  scheduleIdleLoad();
  return {
    el: _panel, toggle, open, close, isOpen: () => _open, refresh, jumpTo,
    /* 探针/排障：只读快照（面板开没开、当前排序、列表里各组的标题与家数） */
    probe: () => ({
      open: _open, sort: _sort, q: _q, n: _rows.length,
      groups: _listEl ? Array.prototype.slice.call(_listEl.querySelectorAll('.cp-g'))
        .map((h) => ({ t: h.querySelector('b').textContent, r: h.querySelector('i').textContent })) : [],
      items: _listEl ? _listEl.querySelectorAll('.cp-i').length : 0,
      letters: _alEl && !_alEl.hidden
        ? Array.prototype.slice.call(_alEl.querySelectorAll('span:not(.off)')).map((s) => s.textContent) : null,
    }),
  };
}

/**
 * 索引加载**推迟到空闲**（261116 任务#4）。
 *
 * ★ 为什么：面板默认是关的，但 `init()` 原先无条件 `load()` —— 启动就拉 213KB
 *   `comp_index.json` 并渲染 137 行 DOM，与首屏抢同一条带/同一个主线程。
 *   实测（443×564 / dpr2.5）启动期它是**最慢的一条请求**（557ms，且排在底图大文件后面）。
 * ★ 为什么不干脆"打开面板才加载"：工具条按钮上要显示家数（`onCount` → `.u-cn`），
 *   完全不加载会让那个数字一直是空的 —— 用**空闲时补**保住它，同时不占关键路径。
 * ★ `open()` 里仍有 `if (!_rows.length) load()`：用户先开面板时立即接管，
 *   `_busy` 去重保证不会取两遍。
 */
function scheduleIdleLoad() {
  const run = () => { if (!_open) load(); };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 3000 });
  } else {
    setTimeout(run, 1200);   // Safari 旧版没有 rIC，退回定时器
  }
}

/** 取索引 → 转成数组（带上 code）→ 画一次。失败给空列表 + 明确提示，不静默空白。 */
function load() {
  if (_busy) return;
  _busy = true;
  store.index().then((idx) => {
    _busy = false;
    _rows = Object.keys(idx).map((code) => Object.assign({ code: code }, idx[code]));
    if (_st.onCount) _st.onCount(_rows.length);
    renderList();
  }).catch(() => {
    _busy = false;
    if (_listEl) {
      _listEl.innerHTML = '';
      _listEl.appendChild(el('div', 'cp-emp', '公司索引加载失败（离线首启偶发失败，可关掉面板重开一次）'));
    }
  });
}

/** 状态变了（选中公司变了）→ 只重画行的选中态与计数，**不重排**（会让人看不明白为什么列表跳了）。 */
export function refresh() {
  if (!_panel) return;
  const cur = store.state().comp;
  if (_listEl) {
    _listEl.querySelectorAll('.cp-i').forEach((b) => {
      b.classList.toggle('on', b.dataset.cd === cur);
    });
  }
}

function open() {
  if (!_panel) return;
  _open = true;
  _panel.classList.add('on');
  fitHeight();
  if (!_rows.length) load();
  renderList();
}

function close() {
  if (!_panel) return;
  _open = false;
  _panel.classList.remove('on');
}

function toggle() {
  if (_open) close(); else open();
  return _open;
}
