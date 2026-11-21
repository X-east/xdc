/* progress.js —— 地图加载进度条（独立模块）
   ------------------------------------------------------------------
   为什么独立、不塞进 ui.js：
     · 时序：进度条要在 boot 第一步就显示，而 ui.init() 在 `await onceLoaded()`
       之后才跑 —— 早期根本没有 UI 层可挂。
     · 失败安全：加载失败时 index.js 会 `el.innerHTML='…'` 清空 #map 容器，
       进度条挂在 document.body，不会被一起冲掉，能正常显示失败态再淡出。
     · 解耦：本模块只提供 DOM + 状态机，不知道 MapLibre、不碰引擎实例。
       进度数字由 engine.js 通过窄接口上报，index.js 负责编排。

   不负责：进度**数值从哪来**（→ engine.js 的 onLoadProgress 上报、index.js 编排），
           也不负责失败后页面怎么收场（→ index.js 换掉 #map 的内容）。

   API：show() / set(pct,label) / done() / fail(msg) / hide()
   状态：hidden → showing → done|fail（终态后 set 无效，防止后续事件把进度拉回）。
 */

const ID = 'mpLoad';
let _el = null;
let _bar = null;
let _txt = null;
let _pct = null;
let _state = 'hidden';   // hidden | showing | done | fail
let _hideTimer = null;

/* 样式只注入一次。配色跟随全局主题令牌（地图页三主题均为深色画布），
   每个令牌都带深色兜底值 —— 即使主题脚本尚未就绪也有正确视觉。 */
function css() {
  if (document.getElementById('mpLoadCss')) return;
  const s = document.createElement('style');
  s.id = 'mpLoadCss';
  s.textContent = [
    '#' + ID + '{position:fixed;left:50%;top:22%;transform:translateX(-50%);z-index:9000;',
    '  width:min(320px,72vw);padding:14px 16px 13px;border-radius:12px;pointer-events:none;',
    '  background:var(--u-panel-solid,rgba(16,24,38,.94));',
    '  border:1px solid var(--u-bd,rgba(120,150,190,.28));',
    '  box-shadow:0 8px 28px rgba(0,0,0,.45);color:var(--u-tx,#e8eef7);',
    '  font:13px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;',
    '  opacity:0;transition:opacity .25s ease,transform .25s ease;}',
    '#' + ID + '.on{opacity:1;}',
    '#' + ID + '.out{opacity:0;transform:translateX(-50%) translateY(-8px);}',
    '#' + ID + ' .mp-load-hd{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:9px;}',
    '#' + ID + ' .mp-load-t{font-weight:600;font-size:12.5px;}',
    '#' + ID + ' .mp-load-n{font-variant-numeric:tabular-nums;font-size:11.5px;color:var(--u-tx2,#9fb0c5);}',
    '#' + ID + ' .mp-load-track{height:5px;border-radius:3px;overflow:hidden;',
    '  background:var(--u-bd,rgba(120,150,190,.22));}',
    '#' + ID + ' .mp-load-bar{height:100%;width:0;border-radius:3px;',
    '  background:var(--u-accent,#7aa2ff);transition:width .2s ease;}',
    '#' + ID + ' .mp-load-sub{margin-top:7px;font-size:11px;color:var(--u-tx3,#7f92aa);min-height:1em;}',
    '#' + ID + '.fail .mp-load-bar{background:var(--u-neg,#ff6b6b);}',
    '@media (prefers-reduced-motion:reduce){#' + ID + '{transition:none;}#' + ID + ' .mp-load-bar{transition:none;}}',
  ].join('');
  document.head.appendChild(s);
}

function mount() {
  if (_el) return;
  css();
  _el = document.createElement('div');
  _el.id = ID;
  _el.setAttribute('role', 'status');
  _el.setAttribute('aria-live', 'polite');
  _el.innerHTML = '<div class="mp-load-hd"><span class="mp-load-t">正在加载地图</span>'
    + '<span class="mp-load-n">0%</span></div>'
    + '<div class="mp-load-track"><div class="mp-load-bar"></div></div>'
    + '<div class="mp-load-sub"></div>';
  document.body.appendChild(_el);
  _bar = _el.querySelector('.mp-load-bar');
  _txt = _el.querySelector('.mp-load-n');
  _sub = _el.querySelector('.mp-load-sub');
}
let _sub = null;

/** 显示进度条（幂等；终态后不再重启，除非先 hide()）。 */
export function show() {
  if (_state === 'done' || _state === 'fail') return;
  mount();
  _state = 'showing';
  if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }
  _el.classList.remove('out');
  // 强制回流后再加 on，保证从 opacity:0 过渡到 1
  void _el.offsetWidth;
  _el.classList.add('on');
}

/** 更新进度。pct: 0~1；label 可选（右侧百分比旁的补充文案）。 */
export function set(pct, label) {
  if (_state !== 'showing') return;
  const v = Math.max(0, Math.min(1, Number(pct) || 0));
  if (_bar) _bar.style.width = (v * 100).toFixed(1) + '%';
  if (_txt) _txt.textContent = Math.round(v * 100) + '%';
  if (_sub && label) _sub.textContent = label;
}

/** 完成：先置满，再淡出移除。 */
export function done(label) {
  if (_state === 'done' || _state === 'fail') return;
  set(1, label || '加载完成');
  _state = 'done';
  scheduleHide();
}

/** 失败：切红色 + 显示原因，稍后淡出（原页面的错误提示仍保留）。 */
export function fail(msg) {
  if (_state === 'done' || _state === 'fail') return;
  if (_el) _el.classList.add('fail');
  set(1, msg || '加载失败');
  _state = 'fail';
  scheduleHide(2600);
}

function scheduleHide(delay) {
  if (_hideTimer) clearTimeout(_hideTimer);
  _hideTimer = setTimeout(() => {
    if (_el) {
      _el.classList.add('out');
      setTimeout(() => { if (_el && _el.parentNode) _el.parentNode.removeChild(_el); }, 280);
    }
    _state = 'hidden';
  }, delay == null ? 420 : delay);
}

/** 立即隐藏并复位（用于 destroy / 复位场景）。 */
export function hide() {
  if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }
  if (_el && _el.parentNode) _el.parentNode.removeChild(_el);
  _el = _bar = _txt = _sub = null;
  _state = 'hidden';
}

/** 供探针读取当前状态。 */
export function state() { return _state; }
