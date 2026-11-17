/* job.js —— 两条**跨模块复用**的异步口径：懒加载去重、竞态序号
   ------------------------------------------------------------------
   为什么单独一个文件（261006-112 P2-30）：
   这两条口径原先各自手写，同一个需求散成**四种写法** ——
     · ui.js   `_detReq` / `_fullReq`：懒加载 + 在飞去重（失败静默兜底）
     · store.js `_idxJob`：同一件事，但**失败允许重试**
     · index.js `_ptsCache`：只做了缓存、**没做在飞去重** —— 并发调用会重复 fetch 两个
       geojson（`searchPoints` 与 `suggest` 会同时进来）
     · index.js 搜索链路：**完全没做竞态守卫** —— 输入即出候选时，先发的请求可能后到，
       晚到的旧结果覆盖新结果，且不报错
   「同一件事四种写法」正是 dup_contract 要治的。收口到本文件后，新增一处手写副本会被
   机器抓住（`app/tests/dup_contract.py` 登记 `onceJob` / `latestOnly` 的**定义**在本文件
   之外**副本 0**）。

   负责：两条**异步时序**口径的唯一实现 —— 懒加载去重（`onceJob`）、竞态序号守卫（`latestOnly`）。
   不负责：取什么数据、取到怎么用、失败怎么兜底（→ 调用方 store.js / index.js / ui.js）；
           业务状态与渲染（本模块不碰 DOM、不碰 store，零依赖）。
   ★ 本模块只碰「异步取数的时序」，不碰任何业务口径。 */

/**
 * 懒加载 + 在飞去重。
 *
 * 语义：
 *   · 首次调用 → 执行 `load`；
 *   · 在飞期间再调 → **复用同一个 Promise**（不重复发请求）；
 *   · 成功后 → 之后每次同步返回同一个缓存值；
 *   · 失败 → 默认**也缓存**（把 reject 交给调用方兜底，不反复重试）；
 *     `retryOnError` 为 true 时清掉在飞槽位、允许下次重试
 *     （离线首启偶发失败不该永久失败）。
 *
 * @param {() => any} load 真正的加载函数（只在首次 / 重试时执行）
 * @param {{retryOnError?: boolean}} [opt]
 * @returns {() => Promise<any>}
 */
export function onceJob(load, opt) {
  const retry = !!(opt && opt.retryOnError);
  let done = false;
  let val = null;
  let job = null;
  return function run() {
    if (done) return Promise.resolve(val);
    if (job) return job;
    job = Promise.resolve().then(load).then(
      (v) => { done = true; val = v; return v; },
      (e) => { if (retry) job = null; throw e; },
    );
    return job;
  };
}

/**
 * 竞态序号守卫：同一「槽位」上只让**最新一次**调用的结果生效。
 *
 * 返回一个包装函数：被更新的一次调用覆盖后，旧 Promise 解析为 `undefined`。
 * 调用方用 `if (out == null) return;` 丢弃即可。
 * ⚠ **必须是 `== null`，不能写 `!out`** —— 空数组 `[]` 是合法结果
 *   （搜到 0 个候选要真的清空下拉），写成 `!out` 会把它也丢掉。
 *
 * ★ 为什么搜索链路需要它：搜索框是「输入即出候选」，用户连打「紫」「紫金」时两次请求
 *   并发在飞，先发的**可能后到** → 晚到的旧结果覆盖新结果（不报错、只是候选不对）。
 *   `store.js` 的 `setComp` 早就有同一套序号守卫（`_compSeq`），但它是**状态写入**、
 *   返回 bool，契约不同，故未并入本函数 —— 两者语义同源、形态不同。
 *
 * @param {(...a:any[]) => any} fn
 * @returns {(...a:any[]) => Promise<any>}
 */
export function latestOnly(fn) {
  let n = 0;
  return function run(...a) {
    const my = ++n;
    return Promise.resolve(fn(...a)).then((v) => (my === n ? v : undefined));
  };
}
