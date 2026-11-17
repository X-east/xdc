/* store.js —— 地图页的**四个状态**：选中公司 / 分类筛选 / 搜索词 / 图层开关
   ------------------------------------------------------------------
   负责：状态的唯一存放处 + 变更广播 + 公司索引的懒加载与查询。
   不负责：把状态翻译成引擎的 filter 表达式（→ points.js 的 pointFilter）、
           真的去改图层（→ engine.js）、画界面（→ ui.js / hud.js）。

   ★ 为什么要一个 store（261003-88）
     方向从「全量点位探索」改成「**公司驱动**」之后，同一个「显示哪些点」的判断被
     **三处**需要：分类 chip（ui.js）、公司选择（详情面板）、搜索命中（ui.js 的搜索框）。
     以前 `interactions.setCategories` 自己算 filter 自己调 setFilter；现在还得并上
     「选中公司」这一维 —— 若各写各的，就会出现「chip 说全选、面板说按公司」互相打脸，
     而且**这种错不报错**（只是画出来的点不对）。
     铁律：同一件事只有一份实现 → 状态收在一处，界面只管改状态，渲染由页面层订阅后统一算。

   ★ 显示口径（261116 修订第 1 条；其余仍按 261003-88「没选中的就不显示」）
       · 什么都没选              → **全部点都显示**（默认态 = 全貌）
       · 只选了分类              → 显示该分类的点（全清 = 一个都不显示）
       · 选了公司                → 只显示该公司的点（可再叠加分类）
     第 1 条为什么会变：原口径是「什么都没选 → 点位层全隐藏」，但打开地图第一眼看到的
     是「图层全亮、统计 972 个点、画布上 0 个点」——用户 261116 直接报它坏了。默认态
     给全貌、筛选后才收窄，也是 Google Maps Data Layer 那条范式的实际用法。
     ⚠ 口径实现在 points.js 的 `pointFilter`（唯一一处），统计行在 hud.js `counts()`，
       两者三态一一对应，改一处必须看另一处。

   ★ 第四维「图层开关」（261005 从老页补回）
     老页顶栏有「⛏️ 硬资产 854 / ⚡ 电力 118」两个按钮，新页一开始没有（两层永远都画）。
     补回来后它**是同一件事的又一维**：关掉的层 = 该层 filter 恒假。
     ⚠ 为什么不做成「隐藏图层」（visibility:none）而是走 filter：
       ① filter 已经是「显示哪些点」的唯一实现，再加一套 visibility 就是两份口径，
          两处迟早对不上（本项目反复踩过）；
       ② 恒假 filter 会让拾取自然返回 0（`queryRenderedFeatures` 认 filter），
          而 visibility 得**另外**去改 interactions 的命中层列表。
       一处机制能同时解决渲染与拾取，就不引入第二处。 */

/* ⚠ `dist/` 路径**只有一处口径**（base.js）—— 别在这里写 `'dist/xxx'`。
   写死相对当前页面的 `'dist/'` 只在地图页（恰在包根）成立；嵌进子目录页会 404 且不报错，
   见 base.js 文件头记的那次历史事故（261005-102 补上 store.js 这处漏网的）。 */
import { distUrl } from './base.js';
import { onceJob } from './job.js';

/* 当前状态。`compIds` 是 `comp` 对应的**点位 id 白名单**（由索引算出）——
   ⚠ 为什么状态里要存 id 而不是每次现查：显示口径（pointFilter）必须在
     「设 filter 那一刻」就知道有哪些 id，而索引是懒加载的；把 id 随选中一起
     存下来，渲染路径就完全不依赖索引是否已到位（顺序问题一次性解决）。
   ⚠ 为什么不用公司代码做 filter：见 points.js pointFilter 的注释 ——
     MapLibre 的 legacy filter 对**数组属性**做成员判断一律失效（静默全挡）。 */
let _st = { comp: null, compIds: null, cats: null, query: '', scope: null,
  on: { hard: true, power: true } };
let _idx = null;          // 公司索引（懒加载；**对外可读**，compOf / probe 要用）
let _compSeq = 0;      // setComp 的请求序号（竞态守卫，见那里）
const _subs = new Set();

/**
 * 某一层是否**开着**。缺省为「开」—— 只认显式的 `false`。
 *
 * ⚠ 为什么不是 `!on[k]`：`on` 这一维是 261005 才补的，老调用方（老代码 / 个股页 /
 *   探针）传进来的状态快照**没有这个键**，`!undefined` 会**把层全关掉**
 *   （画面全空、且不报错）。缺省必须是「开」，故只认显式的 false。
 * ★ 全站唯一实现（261006-112 P2-23）：此前这条判据以 `=== false` / `!== false`
 *   两种写法散在 4 个文件 9 处，任一处领会错就是静默错。收口到本函数，
 *   并由 `app/tests/dup_contract.py` 登记「副本 0」。
 * ⚠ `st` **必须显式传**（不设默认值）：`pointFilter(which, st)` 的调用方可能传 null
 *   （老代码 / 个股页 / 探针），若这里回落到「当前状态」，判据就会与调用方看到的快照脱钩
 *   —— 那是另一种静默错。
 * @param {string} k 'hard' | 'power'
 * @param {{on?: Object}|null} st 状态快照（可为 null = 无该维 → 视为「开」）
 * @returns {boolean}
 */
export function isLayerOn(k, st) {
  return !(st && st.on && st.on[k] === false);
}

/** 图层开关快照的**副本**（同 compIds 的理由：调用方不该改到内部对象）。 */
function onSnapshot() {
  return { hard: isLayerOn('hard', _st), power: isLayerOn('power', _st) };
}

/** 当前状态快照（只读）。`compIds` 是副本，防止调用方改到内部数组。 */
export function state() {
  return {
    scope: _st.scope,
    comp: _st.comp,
    compIds: _st.compIds ? _st.compIds.slice() : null,
    cats: _st.cats ? _st.cats.slice() : null,
    query: _st.query,
    on: onSnapshot(),
  };
}

/** 订阅变更。回调 `(快照, 变更键)`；返回退订函数。 */
export function on(fn) {
  _subs.add(fn);
  return () => _subs.delete(fn);
}

function emit(what) {
  const s = state();
  _subs.forEach((f) => {
    try { f(s, what); } catch (e) { console.error('[store] 订阅回调异常', e); }
  });
}

/* ── 三个状态的写入口 ───────────────────────────────── */

/**
 * 选中公司。传 null 取消选择（回到「只剩底图」或「按分类」）。
 * ⚠ **需要索引已加载**：要由公司代码算出它的点位 id 白名单（见文件头 compIds 那段）。
 *   索引没到位时返回 Promise（加载完自动重发），此时 comp 仍是 null ——
 *   宁可「晚一点才显示」，也不给出「显示了但一个点都不画」的中间态。
 * @param {string|null} code 公司代码，如 'sh601899'
 * @returns {Promise<boolean>} 是否已就位
 */
export function setComp(code) {
  const v = code || null;
  if (!v) {
    if (_st.comp === null) return Promise.resolve(true);
    _st.comp = null;
    _st.compIds = null;
    emit('comp');
    return Promise.resolve(true);
  }
  if (_st.comp === v && _st.compIds) return Promise.resolve(true);
  /* 竞态守卫用**请求序号**而不是反推状态（反推要写一堆条件，且漏一条就出错）：
     每次非空请求发一个号，回来时只有「仍是最新那个」才允许落状态。
     ⚠ 早先版本写的是「若当前 comp 不是我要设的那个就丢弃」—— 但取消选择时
       comp 变 null，同样不是「要设的那个」，于是**取消操作会被自己的守卫吃掉**。 */
  _compSeq = (_compSeq || 0) + 1;
  const seq = _compSeq;
  return index().then((idx) => {
    if (seq !== _compSeq) return false;   // 期间又发起过新的选择/取消 → 作废
    const c = idx[v];
    _st.comp = v;
    _st.compIds = c ? (c.pts || []).map((x) => String(x.id)) : [];
    emit('comp');
    return true;
  });
}

/**
 * 分类筛选。**三态**（261008 起，见 `points.js: pointFilter` 的 ★）：
 *   `null` = **没碰过**这一维（启动态，chip 全亮）；`[]` = **显式全清**（点位层恒假）；
 *   `[部分]` = 只留这些分类；`[全部]` = 显式全选（等价于「不按分类限制」）。
 *   ⚠ 别把 `[]` 折成 `null` —— 那是「全清」与「全选」撞成一个状态的老写法（261008 修）。
 * @param {string[]|null} cats
 */
export function setCats(cats) {
  /* ★★ 261009 修正去重判据。原写法：
   *     const same = (_st.cats || null) === (cats || null)
   *       && ((!_st.cats && !cats) || (… _st.cats.every(…) ));
   *   首项对数组**恒为 false**（两个不同引用的数组永不 `===`）→ `&&` 后面那支
   *   **从未执行**（死代码），去重实际只对 `null → null` 生效。
   *   ⚠ 后果不是画面错（多一次 emit，`applyFilters` 幂等），而是
   *     **代码声称的去重与真做的去重不一致** —— 下一个人照它抄就会再抄错一遍。
   *   ⚠ 正解：引用相等与内容相等是**并列**的两个判据，不能让前者当后者的前置条件。
   *     同级 `setScope`（`if (_st.scope === x) return`）与 `setComp`（同值不 emit）都这么写。 */
  const a = _st.cats;
  const b = cats;
  const same = a === b
    || (a == null && b == null)
    || (!!a && !!b && a.length === b.length && a.every((c, i) => c === b[i]));
  if (same) return;
  /* ⚠ `b ? b.slice() : null` —— `[]` 是**真值**，故空数组会原样存下来（不折成 null）。 */
  _st.cats = b ? b.slice() : null;
  emit('cats');
}

/**
 * 境内/境外这一维（个股页的分段控件用；null = 不限）。
 * ⚠ 这是**互斥**维度（境内 or 境外），与 comp/cats 是 AND 关系 —— 见 pointFilter。
 * @param {'cn'|'ov'|null} v
 */
export function setScope(v) {
  const x = v || null;
  if (_st.scope === x) return;
  _st.scope = x;
  emit('scope');
}

/** 搜索词（仅记录，命中处理在页面层）。 */
export function setQuery(q) {
  const v = q || '';
  if (_st.query === v) return;
  _st.query = v;
  emit('query');
}

/**
 * 图层开关（'hard' | 'power'）。关掉的层在 pointFilter 里给**恒假**（见文件头第四维）。
 * ⚠ 默认两层都开 —— 新页一开始的设计就是「硬资产与电力画在同一张底图上」，
 *   开关是**减法**（用户主动关掉某一层），不是"切换成单层模式"。
 * @param {string} key
 * @param {boolean} on
 * @returns {boolean} 是否真的改了
 */
export function setLayerOn(key, on) {
  if (key !== 'hard' && key !== 'power') return false;
  const v = !!on;
  if (_st.on[key] === v) return false;
  _st.on[key] = v;
  emit('layers');
  return true;
}

/* ── 公司索引 ──────────────────────────────────────── */

/* 公司索引的加载槽：懒加载 + 在飞去重（`job.js`），**失败允许重试** ——
   离线首启偶发失败不该永久失败。`_idx` 仍是**对外可读**的缓存本体（compOf / probe 要用），
   故在 load 里回填。 */
const _indexJob = onceJob(
  () => fetch(distUrl('comp_index.json')).then((r) => r.json())
    .then((d) => { _idx = d; return d; }),
  { retryOnError: true },
);

/**
 * 公司索引（懒加载，只抓一次）。
 * ⚠ 为什么不在 boot 时就抓：183 KB 的 JSON，**没人搜索时不需要** ——
 *   默认状态下地图是空的（没选中的不显示），公司索引只有搜索/选公司时才用得上。
 *
 * ⚠ 路径必须走 base.distUrl —— 相对**模块**而不是相对当前页面。
 *   写死 `'dist/comp_index.json'` 只在地图页（恰在包根）成立；一旦按 index.js 的
 *   `boot({container,bare})` 把引擎嵌进子目录页（如个股页），这里会变成
 *   `子目录/dist/comp_index.json` → 404 → 静默返回 `{}` → **公司索引恒空**
 *   （面板 0 家、搜索无公司、地图上该公司的点一个都不显示，只有控制台一条错）。
 *   这就是 base.js 文件头记的那次历史事故，261005-102 补上最后一处漏网的。
 * @returns {Promise<Object>} 代码 → 公司记录
 */
export function index() {
  return _indexJob().catch((e) => {
    console.error('[store] 公司索引加载失败', e);
    return {};
  });
}

/**
 * 取某家公司的记录（同步取；索引没加载完或没这家 → null）。
 * ⚠ 旧写法是 `(_idx && _st.comp === code) ? _idx[code] : (_idx ? _idx[code] : null)`
 *   —— 三元两个分支一样，等于「有没有索引都给同一样东西」，那个 `_st.comp === code`
 *   的判断纯属多余（写的时候以为要限制成「当前选中」，实际调用方要的是任意公司）。
 */
export function compOf(code) {
  return (_idx && code && _idx[code]) || null;
}

/**
 * 按名称/代码搜公司。**前缀优先**：先按开头匹配，再按包含匹配 ——
 * 打「紫金」应该先出「紫金矿业」而不是「XX 紫金矿业」。
 * @param {string} q
 * @returns {Promise<Array<{code:string, name:string, nPts:number, pre:boolean}>>}
 */
export async function searchCompanies(q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return [];
  const idx = await index();
  const pre = [], inc = [];
  for (const code in idx) {
    const c = idx[code] || {};
    const name = String(c.n || '').toLowerCase();
    const cd = String(code).toLowerCase();
    const py = String(c.py || '').toLowerCase();
    if (cd.indexOf(s) === 0 || name.indexOf(s) === 0) pre.push(code);
    else if (cd.indexOf(s) >= 0 || name.indexOf(s) >= 0 || (py && py.indexOf(s) >= 0)) inc.push(code);
  }
  const pick = (arr) => arr.slice(0, 8).map((code) => {
    const c = idx[code] || {};
    return { code: code, name: c.n || code, nPts: c.nPts || 0, ind: c.ind || '' };
  });
  return pick(pre).concat(pick(inc)).slice(0, 10);
}

/** 供探针用：状态与索引的只读快照。 */
export function probe() {
  return { scope: _st.scope, comp: _st.comp, compIdsN: _st.compIds ? _st.compIds.length : 0,
    compIds: _st.compIds ? _st.compIds.slice(0, 60) : null,
    cats: _st.cats ? _st.cats.slice() : null, query: _st.query, on: onSnapshot(),
    idxLoaded: !!_idx, idxN: _idx ? Object.keys(_idx).length : 0 };
}
