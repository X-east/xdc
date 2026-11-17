/* dom_kit.js —— 两条**跨模块复用**的 DOM 口径：建节点工厂、事件委托
   ------------------------------------------------------------------
   为什么单独一个文件（261006-113 R2）：
   它们原先各自手写，同一件事散成多份 ——
     · `el(tag, cls, txt)` 在 ui.js / hud.js / company.js **逐字节相同地各写一份**（3 份，
       179 个调用点）。改一处（比如给 cls 加去重、给 txt 加 number 支持）另外两份不会跟，
       于是「同一个工厂」的行为按文件分叉 —— 正是 dup_contract 要治的。
     · 事件委托（监听挂常驻节点 + `e.target.closest(...)` 路由）只有 ui.js 的 `bindSnap`
       一处**正确实现**，且它的正确性只写在注释里（261005-102 P0-1 的根因就是没人知道
       该这么写）。R2 把这条口径提成**具名函数** —— 「查节点后直接绑监听」是禁用写法，
       需要委托时走这里。

   负责：两条**纯 DOM** 口径的唯一实现 —— 建节点（`el`）、事件委托（`delegate`）。
   不负责：任何业务（筛选 / 卡片 / 图层 / 取数）—— 本模块不 import 任何兄弟模块，
           不碰 store，零依赖，谁都能安全地用。

   ★ R2 防线（261006-113）：`dup_contract` 已登记两条硬判据 ——
     ① 「`el` 建节点工厂」副本 0（权威 = 本文件）；
     ② 「查到节点再直接绑监听」**禁用**（`资产地图/src/` 内 0 基线）—— 即把 `querySelector`
        / `getElementById` 的返回值拿去 `addEventListener`，而不走本文件的 `delegate()`。
        症状（P0-1）在 261005-102 就修了，但那只是「修好了一处」；本文件 + 判据才是
        「让下一处写不出来」。
     ⚠ 上面这条注释**刻意不把被禁写法原样写出来** —— 判据是逐行正则，注释里原样抄一遍
        会把判据自己顶红（261006-113 实测：本文件头第一版就是这么被自己抓住的）。 */

/**
 * 建一个元素节点（唯一实现 —— 别在 ui/hud/company 里再写一份）。
 *
 * 语义：
 *   · `cls` 为假值（''/null/undefined）→ **不设 class**（不写 `class=""`）；
 *   · `txt != null` → 设 textContent（**`0` / `''` 都是合法文本，不能写成 `if (txt)`**，
 *     否则「0 个 / 空串」会被静默吞掉）；
 *   · 一律用 `textContent` 不用 `innerHTML` —— 内容常来自数据（公司名 / 分类名），
 *     走 innerHTML 等于把数据当标记解析。
 *
 * @param {string} tag  标签名（'div' / 'span' / 'b' …）
 * @param {string} [cls] 类名（falsy = 不加）
 * @param {string|number} [txt] 文本（`!= null` 才设）
 * @returns {HTMLElement}
 */
export function el(tag, cls, txt) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
}

/**
 * 事件委托：把监听挂**常驻节点**，用 `selector` 路由到真正被点中的元素。
 *
 * 语义：
 *   · 命中判定 = `e.target.closest(selector)`，且命中的节点必须**在 root 内**
 *     （`root` 为 `window` 时没有 `contains`，故该检查在缺失时跳过）；
 *   · 回调签名 `fn(e, hit)` —— `hit` 是匹配到的那个节点（`closest` 的结果）。
 *
 * ★ 为什么必须用它、不许「查到节点再 addEventListener」：
 *   本页的卡片**每次渲染都整块重建**（`renderCompCard` / `renderPointCard` 都是
 *   `d.innerHTML = ''` + 逐个 createElement）。挂在被重建节点上的监听会**连同节点一起被摘掉**，
 *   而那是**静默的** —— 不报错、不白屏，只是那块区域从某一刻起「点不动了」。
 *   261005-102 P0-1 就是这么丢的：`bindSnap` 把 `pointerdown` 绑在当时那个 `.u-dhead` 上 +
 *   用 `_snapBound` 只绑一次 → **从第二张卡起标题栏拖不动**（首屏默认就是第一张卡，长期没被发现）。
 *   委托到常驻节点后，手柄是哪个 DOM 都无所谓 —— 「重建元素」不再能摘下监听。
 *
 * @param {EventTarget} root  常驻节点（`document` / `window` / 模块级单例 `_root` 等）
 * @param {string} selector   命中的 CSS 选择器
 * @param {string} ev         事件名（'click' / 'pointerdown' …）
 * @param {(e: Event, hit: Element) => void} fn  命中回调
 */
export function delegate(root, selector, ev, fn) {
  root.addEventListener(ev, (e) => {
    const t = e.target;
    if (!t || !t.closest) return;
    const hit = t.closest(selector);
    if (!hit) return;
    /* `window` 没有 contains —— 缺了就跳过这一层校验（root 是 window 时本来就「包含一切」）。 */
    if (root.contains && !root.contains(hit)) return;
    fn(e, hit);
  });
}
