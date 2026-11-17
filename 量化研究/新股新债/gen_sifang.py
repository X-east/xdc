#!/usr/bin/env python3
"""推算四方转债 — 套用「债盘子 vs 正股盘子」模型，生成可预览 HTML。
输入：data/可转债上市表现.json（对比.散点对比）；输出：推算四方转债.html。"""
import json, math, statistics, os, sys

ROOT = 'D:/desktop/money/量化研究/新股新债'
# 全站页面条（← 门户 / 面包屑 / 同级入口）单一真相源 app/nav_kit.py
sys.path.insert(0, os.path.normpath(os.path.join(ROOT, '..', '..', 'app')))
import nav_kit
d = json.load(open(f'{ROOT}/data/可转债上市表现.json', encoding='utf-8'))
c = d['对比']
reg = {m['标题']: m['res'] for m in c['回归']}
scat = c['散点对比']

# ── 四方输入 ──
GUIMO = 10.23            # 发行规模(亿)
LIUTONG_NOW = 38.06      # 正股流通市值(亿, 当前价12.30)
LIUTONG_PEAK = 47.8      # 9/2 价15.46 时约47.8亿
BILI_NOW = GUIMO / LIUTONG_NOW * 100
BILI_PEAK = GUIMO / LIUTONG_PEAK * 100

# ── 模型推算 ──
ln_g = math.log(GUIMO)
y3_low = reg['③ 债券规模 + 正股流通']['系数']
y3_hi = reg['① 只放债券规模']['系数']
def pred3(lt):
    return y3_low[0] + y3_low[1]*ln_g + y3_low[2]*math.log(lt)
def pred1():
    return y3_hi[0] + y3_hi[1]*ln_g
P3_NOW, P3_PEAK = pred3(LIUTONG_NOW), pred3(LIUTONG_PEAK)
P1 = pred1()

# 邻近债
def near(tg, tl, k=6):
    return sorted(scat, key=lambda r: abs(r['规模']-tg)+abs(r['流通']-tl))[:k]

# ── SVG 散点（占比 vs T+20冲高）──
X0, X1, Y0, Y1 = 70, 650, 360, 40
W, H = 680, 420
def px(b): return X0 + (b/55)*(X1-X0)
def py(ch): return Y0 - ((ch-40)/(160-40))*(Y0-Y1)
circles = '\n'.join(
    f'<circle cx="{px(r["占比"]):.1f}" cy="{py(r["冲高"]):.1f}" r="5" '
    f'fill="rgba(244,114,182,.55)" stroke="#0b1119" stroke-width=".6"/>'
    for r in scat)
# 参考线：样本中位占比 / 中位冲高
m_bili = statistics.median([r['占比'] for r in scat])
m_ch = statistics.median([r['冲高'] for r in scat])
# 四方标记（占比中点24, 冲高带 57~81）
b_center = (BILI_NOW + BILI_PEAK)/2
sx = px(b_center); sy_top = py(P3_PEAK); sy_bot = py(57.3)
sifang = (
    f'<line x1="{sx}" y1="{sy_top:.1f}" x2="{sx}" y2="{sy_bot:.1f}" '
    f'stroke="#facc15" stroke-width="2.5" stroke-dasharray="5 4"/>'
    f'<circle cx="{sx:.1f}" cy="{sy_top:.1f}" r="7" fill="#facc15" stroke="#0b1119" stroke-width="1.2"/>'
    f'<circle cx="{sx:.1f}" cy="{sy_bot:.1f}" r="7" fill="#facc15" stroke="#0b1119" stroke-width="1.2"/>'
    f'<text x="{sx+10:.1f}" y="{(sy_top+sy_bot)/2:.1f}" fill="#facc15" font-size="13" '
    f'font-weight="700">四方转债 预测 +{57.3:.0f}~{P3_PEAK:.0f}%</text>'
)
xticks = ''.join(
    f'<text x="{px(v):.1f}" y="{Y0+18}" fill="#9fb0c5" font-size="11" text-anchor="middle">{v}</text>'
    for v in (0,10,20,30,40,50))
yticks = ''.join(
    f'<text x="{X0-8}" y="{py(v)+4:.1f}" fill="#9fb0c5" font-size="11" text-anchor="end">{v}</text>'
    for v in (40,60,80,100,120,140,160))
svg = f'''<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:680px">
  <rect x="0" y="0" width="{W}" height="{H}" fill="#0b1119"/>
  <line x1="{X0}" y1="{Y0}" x2="{X1}" y2="{Y0}" stroke="#33445a" stroke-width="1"/>
  <line x1="{X0}" y1="{Y1}" x2="{X0}" y2="{Y0}" stroke="#33445a" stroke-width="1"/>
  {circles}
  <line x1="{px(m_bili):.1f}" y1="{Y1}" x2="{px(m_bili):.1f}" y2="{Y0}" stroke="#64748b" stroke-width="1" stroke-dasharray="3 3"/>
  <line x1="{X0}" y1="{py(m_ch):.1f}" x2="{X1}" y2="{py(m_ch):.1f}" stroke="#64748b" stroke-width="1" stroke-dasharray="3 3"/>
  {sifang}
  {xticks}{yticks}
  <text x="{(X0+X1)/2:.0f}" y="{H-6}" fill="#cbd5e1" font-size="12" text-anchor="middle">债 / 正股流通占比（%，越大越不稀缺）</text>
  <text x="16" y="{(Y0+Y1)/2:.0f}" fill="#cbd5e1" font-size="12" text-anchor="middle" transform="rotate(-90 16 {(Y0+Y1)/2:.0f})">T+20 冲高（%）</text>
  <text x="{px(m_bili):.1f}" y="{Y1+12}" fill="#64748b" font-size="10" text-anchor="middle">样本中位占比 {m_bili:.1f}%</text>
</svg>'''

neighbors = ''.join(
    f'<tr><td>{r["简称"]}</td><td>{r["规模"]:.1f}</td><td>{r["流通"]:.1f}</td>'
    f'<td>{r["占比"]:.1f}</td><td class="{"pos" if r["冲高"]>0 else "neg"}">+{r["冲高"]:.1f}</td></tr>'
    for r in near(GUIMO, (LIUTONG_NOW+LIUTONG_PEAK)/2))

html = f'''<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>四方转债(113710) 上市表现推算</title>
<style>
*{{box-sizing:border-box}} body{{margin:0;background:#0b1119;color:#e2e8f0;
  font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;padding:22px;line-height:1.6}}
h1{{font-size:20px;margin:0 0 4px}} .sub{{color:#9fb0c5;font-size:13px;margin-bottom:16px}}
.card{{background:#121a26;border:1px solid #233044;border-radius:10px;padding:14px 16px;margin:12px 0}}
.kpi{{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0}}
.k{{background:#16202e;border:1px solid #2a3950;border-radius:8px;padding:10px 14px;min-width:120px}}
.k .v{{font-size:22px;font-weight:700;color:#f472b6}} .k .l{{font-size:11px;color:#9fb0c5}}
table{{width:100%;border-collapse:collapse;font-size:13px;margin-top:6px}}
th,td{{padding:6px 8px;border-bottom:1px solid #233044;text-align:right}}
th:first-child,td:first-child{{text-align:left}} th{{color:#9fb0c5;font-weight:600}}
.pos{{color:#f87171}} .neg{{color:#4ade80}} .yl{{color:#facc15;font-weight:700}}
ul{{margin:6px 0;padding-left:20px;font-size:13px}} li{{margin:4px 0}}
.tag{{display:inline-block;background:#1e293b;border:1px solid #33445a;border-radius:6px;
  padding:2px 8px;font-size:12px;color:#cbd5e1;margin:2px 4px 2px 0}}
</style></head><body>
<h1>四方转债（113710）上市表现推算</h1>
<div class="sub">基于「2026 可转债上市表现」样本的债盘子 vs 正股盘子模型（n=41，尚未上市，属样本外预测）</div>

<div class="kpi">
  <div class="k"><div class="v">10.23亿</div><div class="l">发行规模</div></div>
  <div class="k"><div class="v">38~48亿</div><div class="l">正股流通市值</div></div>
  <div class="k"><div class="v">{BILI_NOW:.0f}~{BILI_PEAK:.0f}%</div><div class="l">债/流通占比</div></div>
  <div class="k"><div class="v">AA</div><div class="l">评级</div></div>
  <div class="k"><div class="v">未上市</div><div class="l">申购 2026-09-03</div></div>
</div>

<div class="card"><h3 style="margin:0 0 8px">① 模型点估计（T+20 内最高价 − 100）</h3>
<table>
<tr><th>方法</th><th>输入</th><th>T+20 冲高</th><th>说明</th></tr>
<tr><td>模型③（债+正股）</td><td>规模10.23 / 流通{LIUTONG_NOW}~{LIUTONG_PEAK}亿</td>
  <td class="yl">+{P3_NOW:.0f}~+{P3_PEAK:.0f}%</td><td>R²=0.27，中枢约 +{(P3_NOW+P3_PEAK)/2:.0f}%</td></tr>
<tr><td>模型①（只债规模）</td><td>规模10.23</td><td>+{P1:.0f}%</td><td>忽略正股，偏高</td></tr>
<tr><td>最邻近债·龙建转债</td><td>规模10.0/流通43.8/占比22.8%</td><td>+57.3%</td><td>实际值，四方最佳类比</td></tr>
<tr><td>样本中位</td><td>—</td><td>+{m_ch:.0f}%</td><td>p25 +65% / p75 +119%</td></tr>
</table></div>

<div class="card"><h3 style="margin:0 0 8px">② 散点定位（占比 vs 冲高）</h3>
{svg}
<div style="font-size:12px;color:#9fb0c5;margin-top:6px">黄线 = 四方预测带；灰虚线 = 样本中位占比 {m_bili:.1f}% 与中位冲高 +{m_ch:.0f}%。
四方占比（{BILI_NOW:.0f}~{BILI_PEAK:.0f}%）高于样本 p75（16.5%），落在低稀缺区。</div>
</div>

<div class="card"><h3 style="margin:0 0 8px">③ 最像四方的样本债</h3>
<table><tr><th>简称</th><th>规模(亿)</th><th>流通(亿)</th><th>占比%</th><th>冲高20</th></tr>{neighbors}</table>
</div>

<div class="card"><h3 style="margin:0 0 8px">④ 首日与窗口路径推算</h3>
<ul>
<li><b>首日：</b>今年 42/56 只首日封板 157.3（沪市首日上限），四方大概率同首日收 <b>≈157.3</b>。</li>
<li><b>窗口最高价：</b>若冲高 +{(P3_NOW+P3_PEAK)/2:.0f}%（中枢），最高价 ≈ <b>177</b>；若跟龙建仅 +57%，最高价 ≈ <b>157</b>（首日即近顶）。</li>
<li><b>首日后再涨：</b>冲高 − 57.3。中枢约 <b>+{(P3_NOW+P3_PEAK)/2-57.3:.0f}%</b>，龙建情形≈0（无续涨）。</li>
</ul></div>

<div class="card"><h3 style="margin:0 0 8px">⑤ 风险与偏差</h3>
<ul>
<li><b>占比偏高（前25%）→ 模型③可能高估。</b>四方债/流通占比 {BILI_NOW:.0f}~{BILI_PEAK:.0f}% 高于样本绝大多数债，单变量占比相关为强负（spearman −0.45）；最邻近的龙建转债仅 +57.3%。</li>
<li><b>转股价值 103.97 偏高。</b>今年样本多为平价&lt;100（靠平价修复拉涨），四方平价已&gt;100，续涨的"平价修复"空间小（模型④中首日平价系数 +0.66 不显著，仅弱提示）。</li>
<li><b>正股近期走弱。</b>四方科技 9/2 收 15.46 → 现 12.30（−20%），上市时正股情绪偏弱，可能压制冲高；模型未控正股短期动量。</li>
<li><b>模型解释力有限。</b>模型③ R²=0.27，单债误差大；样本仅 2026 年新债，含制度性首日封板，若上市时规则/情绪变则失效。</li>
<li><b>结论区间：</b>中枢约 <b>+70%</b>，合理区间 <b>+55%~+80%</b>；偏谨慎看与龙建类似的 +57% 一线。</li>
</ul></div>
<div style="font-size:11px;color:#64748b;margin-top:10px">推算日期 2026-09-09 · 数据源：发行公告/东吴固收点评 + 本页「债盘子 vs 正股盘子」模型 · 仅供研究，非投资建议</div>
</body></html>'''

html, _bar = nav_kit.inject(html, '量化研究/新股新债/推算四方转债.html', inline=True)
assert html.count('</style>') == 1, '样式表结束标记计数异常：%d' % html.count('</style>')
open(f'{ROOT}/推算四方转债.html', 'w', encoding='utf-8').write(html)
print('OK 推算四方转债.html 生成（页面条%s），预测区间 +%.0f~+%.0f%%'
      % ('已内联' if _bar else '已在页面内', P3_NOW, P3_PEAK))
