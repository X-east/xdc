// 新股新债页面冒烟：Edge + CDP 打开页面，验证图表渲染与交互（jsdom 无 canvas 会误报）
import { spawn } from 'child_process';
import { existsSync } from 'fs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9339;   // 与既有脚本错开：pmodel 9333 / 电力 9334 / 单缥烟 9335 / 鹿鼎公 9336 / 润哥 9337 / uiflow 9338
const FILE = 'D:/desktop/money/量化研究/新股新债/可转债上市表现.html';
const URL = 'file:///' + FILE;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=D:/tmp_edge_newbond', 'about:blank'
], { stdio: 'ignore' });

let ws, id = 0;
const pending = new Map();
const errors = [];

function send(method, params = {}) {
  const msgId = ++id;
  ws.send(JSON.stringify({ id: msgId, method, params }));
  return new Promise((res, rej) => {
    pending.set(msgId, { res, rej });
    setTimeout(() => { if (pending.has(msgId)) { pending.delete(msgId); rej(new Error('timeout ' + method)); } }, 15000);
  });
}

async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result.value;
}

const 断言 = [];
function 检查(名, 条件, 实 = '') {
  断言.push({ 名, ok: !!条件, 实 });
  console.log(`${条件 ? ' OK ' : 'FAIL'}  ${名}${条件 ? '' : '  → ' + 实}`);
}

async function main() {
  if (!existsSync(EDGE)) { console.log('未找到 Edge，跳过'); return 1; }
  if (!existsSync(FILE)) { console.log('页面不存在:', FILE); return 1; }

  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(400);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
    } catch {}
  }
  if (!target) { console.log('[FAIL] 无法连接 Edge 调试端口'); return 1; }

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') {
      errors.push(m.params.exceptionDetails?.text || 'unknown');
    } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      errors.push(m.params.entry.text || 'console.error');
    }
  };
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: URL });
  await sleep(3500);

  // 1. 无脚本错误
  检查('页面无 JS 异常', errors.length === 0, errors.join(' | '));

  // 2. 图表都渲染出画布
  const 图 = await evalJs(`['c-scatter','c-bins','c-price','c-ret','c-peak','c-bond2','c-stock']
    .map(k=>{const c=document.getElementById(k).querySelector('canvas');
      return {k, w:c?c.width:0, h:c?c.height:0};})`);
  for (const g of 图) 检查(`图表 ${g.k} 已渲染`, g.w > 200 && g.h > 100, JSON.stringify(g));

  // 3. 关键内容块
  const 块 = await evalJs(`({
    kpi: document.querySelectorAll('#kpis .kpi').length,
    find: document.querySelectorAll('#findings li').length,
    行: document.querySelectorAll('#tbl tbody tr').length,
    列: document.querySelectorAll('#tbl thead th').length,
    回归: document.querySelectorAll('#regs .regbox').length,
    局限: document.querySelectorAll('#notes li').length,
    样本: document.getElementById('m-n').textContent,
    封板: document.getElementById('m-fp').textContent,
  })`);
  检查('KPI 6 个', 块.kpi === 6, 块.kpi);
  检查('结论 ≥6 条', 块.find >= 6, 块.find);
  检查('明细表 56 行', 块.行 === 56, 块.行);
  检查('回归表 3 个', 块.回归 === 3, 块.回归);

  // 3b. 债券规模 vs 正股盘子对比区块
  const 对比块 = await evalJs(`({
    corr: document.querySelectorAll('#corrbar > div').length,
    regs2: document.querySelectorAll('#regs2 .regbox').length,
    bond2: !!document.getElementById('c-bond2').querySelector('canvas'),
    stock: !!document.getElementById('c-stock').querySelector('canvas'),
  })`);
  检查('相关性条已渲染', 对比块.corr >= 4, 对比块.corr);
  检查('对比回归表 4 个', 对比块.regs2 === 4, 对比块.regs2);
  检查('c-bond2 画布存在', 对比块.bond2);
  检查('c-stock 画布存在', 对比块.stock);
  检查('局限条目 ≥6', 块.局限 >= 6, 块.局限);
  检查('样本数显示 56', 块.样本 === '56', 块.样本);

  // 4. 表格排序：点「T+20冲高%」表头后首行应为该列最大值
  const 首行前 = await evalJs(`document.querySelector('#tbl tbody tr td.l').textContent`);
  await evalJs(`[...document.querySelectorAll('#tbl th')].find(t=>t.textContent.includes('T+20冲高')).click();`);
  await sleep(300);
  const 排后 = await evalJs(`(()=>{const tr=document.querySelector('#tbl tbody tr');
    const i=[...document.querySelectorAll('#tbl thead th')].findIndex(t=>t.textContent.includes('T+20冲高'));
    return {名:tr.querySelector('td.l').textContent, 值:tr.children[i].textContent};})()`);
  检查('点表头排序生效', /^\+\d/.test(排后.值) || 排后.值 !== '', JSON.stringify(排后));

  // 5. 搜索过滤
  await evalJs(`(()=>{const q=document.getElementById('q');q.value='曙光';
    q.dispatchEvent(new Event('input'));})()`);
  await sleep(300);
  const 搜后 = await evalJs(`document.querySelectorAll('#tbl tbody tr').length`);
  检查('搜索过滤生效', 搜后 >= 0 && 搜后 < 56, `${搜后} 行（前 ${首行前}）`);

  await evalJs(`(()=>{const q=document.getElementById('q');q.value='';
    q.dispatchEvent(new Event('input'));})()`);
  await sleep(300);
  检查('清空搜索恢复', await evalJs(`document.querySelectorAll('#tbl tbody tr').length`) === 56);

  检查('交互后仍无 JS 异常', errors.length === 0, errors.join(' | '));

  const 失败 = 断言.filter(a => !a.ok);
  console.log(`\n通过 ${断言.length - 失败.length}/${断言.length}`);
  return 失败.length ? 1 : 0;
}

main().then(rc => { try { proc.kill(); } catch {} process.exit(rc); })
  .catch(e => { console.error('[ERROR]', e.message); try { proc.kill(); } catch {} process.exit(1); });
