/* record.js —— 点位记录的**唯一规范器**（「任意来源 → POINT_REC」只有这一道门）
   ------------------------------------------------------------------
   ⚠ 存在的理由（261005-101 R3「数据合同只做了一半」）：同一个点有**三条入口**进 UI ——
     ① 地图点击   （interactions.js，来源 = geojson feature properties）
     ② 搜索候选   （index.js，来源 = 搜索缓存，本身读自 geojson）
     ③ 公司卡资产 （index.js pickAsset，来源 = comp_index.json 的 pts[]）
     另加 ④ 个股页 highlightPoint（来源 = 只有 which + id + 坐标）。
   四条各自手搓 `{id, n, cate/c, lv, ov, cos}` 的形状 —— 字段名（`cate` vs `c`）、
   `ov` 的**类型**（字符串 `'0'/'1'` / 布尔 / 数字）、有没有 `cos` **都不一样** ——
   于是同一只点从不同入口进，卡片上「归属公司」那排时有时无，而**没有任何报错**。

   `ov` 已经是活教材：geojson 里是字符串、comp_index 里是布尔、JS 里 `'0'` 是 truthy
   → `p.ov ? '境外' : '境内'` 在字符串形态下**永远走境外**（261005 实测 972 点无一例外）。
   当时只把 `points.isOv()` 收了口，**没有推广到整体形状** —— 本文件补上这一半。

   ★ 铁律：任何来源进 UI 之前必须过 `normPoint()`。类型/形态判定**只有这一处**。
     判据：`dup_contract` 登记 `normPoint` 只准在 record.js 定义（副本 0）。

   负责：把任意来源的点位记录规范成**唯一形状**（字段名统一 / `ov` 统一三态 / 缺省补齐）。
   不负责：取数（→ index.js / store.js）、渲染卡片（→ ui.js）、
           「谁境外谁境内」的**语义判定**（→ points.isOv，本模块只是**调用**它）。
   ★ 本模块不碰 DOM、不查数据、不认识「公司」——**它只认字段**。 */

import { isOv, whichOfId } from './points.js';

/**
 * 把任意来源的一条点位记录规范成**唯一形状 POINT_REC**。
 *
 * @param {object} src 来源对象。字段名宽松：`cate` / `c` 都吃；`ov` 吃字符串 / 布尔 / 数字；
 *   `which` / `layer` 任给其一即认；`cos` 可缺。
 * @param {'hard'|'power'} [fallbackWhich] 来源完全不含层信息时的层名（地图点击时由交互层给）。
 * @returns {{id:string, which:'hard'|'power', n:string, cate:string, lv:string,
 *            ov:(boolean|null), lng:(number|undefined), lat:(number|undefined), cos:string[]}}
 *   `ov` 是**三态**：true=境外 / false=境内 / **null=来源没给**（"未知" ≠ "境内"）。
 */
export function normPoint(src, fallbackWhich) {
  const s = src || {};
  const id = s.id == null ? '' : String(s.id);
  /* 层名三路取：来源自带（which / layer）→ 调用方给的 fallback → 由 id 前缀推。
     ⚠ 顺序不能反：公司索引的 pts[] **没有层字段**，只能靠 id 前缀；
       地图 feature 也没有，得由交互层把命中层的 which 传进来（fallbackWhich）。 */
  const which = s.which || s.layer || fallbackWhich || whichOfId(id);
  return {
    id,
    which,
    n: s.n == null ? '' : String(s.n),
    cate: s.cate || s.c || '',
    lv: s.lv == null ? '' : String(s.lv),
    /* `ov` 由 points.isOv 判（**唯一判定**，两种形态都吃）。
       ⚠ 别在这里写 `!!s.ov` —— `!!'0'` 是 true，261005 那条坑会原样复发；
       ⚠ 也别把 `undefined` 折成 `false` —— 那会让"没带 ov 的来源"（如 highlightPoint）
         在卡片上被标成「中国境内」。缺失必须是 null，下游 `!= null` 才判得对。 */
    ov: s.ov == null ? null : isOv(s.ov),
    lng: s.lng,
    lat: s.lat,
    /* 归属公司代码列表（不是名字）。缺省空数组 —— 卡片按长度决定要不要渲染那一排。 */
    cos: Array.isArray(s.cos) ? s.cos.slice() : [],
  };
}
