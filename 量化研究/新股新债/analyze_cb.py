#!/usr/bin/env python3
"""分析今年上市可转债的上市后表现 — 冲高幅度与盘子大小的关系、上市后平均曲线。

口径：
- T+n：n 为上市后第 n 个交易日，n=0 即上市首日。
- 冲高幅度 = 窗口内最高价 / 100 - 1（面值口径，对应中签者成本）。
- 主窗口 T+20（需样本已上市 21 个交易日以上），T+5 作全样本稳健性对照。
- 控制变量：正股同期（T+5 窗口）涨幅，剔除「正股涨得多所以冲得高」的混杂。
输出 data/可转债上市表现.json，供页面直接渲染。
"""

import json
import math
import statistics as st
from pathlib import Path

# ─── 常量 ───
今年 = 2026
根目录 = Path(__file__).resolve().parent
原始文件 = 根目录 / '数据' / 'raw_2026可转债.json'
输出文件 = 根目录 / 'data' / '可转债上市表现.json'
主窗口 = 20              # 主口径：上市后 20 个交易日内最高价
短窗口 = 5               # 稳健性口径
曲线长度 = 61            # T+0 ~ T+60
分档边界 = [5, 10, 20]   # 亿元：<5 / 5-10 / 10-20 / ≥20


def 相关系数(x: list, y: list) -> float:
    """皮尔逊相关系数。"""
    mx, my = st.mean(x), st.mean(y)
    num = sum((a - mx) * (b - my) for a, b in zip(x, y))
    den = math.sqrt(sum((a - mx) ** 2 for a in x) * sum((b - my) ** 2 for b in y))
    return num / den if den else float('nan')


def 秩(v: list) -> list:
    """把序列换成秩（并列取平均秩）。"""
    order = sorted(range(len(v)), key=lambda i: v[i])
    r = [0.0] * len(v)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and v[order[j + 1]] == v[order[i]]:
            j += 1
        均秩 = (i + j) / 2 + 1
        for k in range(i, j + 1):
            r[order[k]] = 均秩
        i = j + 1
    return r


def 斯皮尔曼(x: list, y: list) -> float:
    return 相关系数(秩(x), 秩(y))


def 正态双尾p(t: float) -> float:
    """t 统计量的双尾 p 值（正态近似，n>30 够用）。"""
    return 2 * (1 - 0.5 * (1 + math.erf(abs(t) / math.sqrt(2))))


def 相关检验(x: list, y: list) -> dict:
    """返回相关系数、t 值与近似 p 值。"""
    r = 相关系数(x, y)
    n = len(x)
    if n < 3 or abs(r) >= 1:
        return {'r': r, 't': float('nan'), 'p': float('nan')}
    t = r * math.sqrt((n - 2) / (1 - r * r))
    return {'r': r, 't': t, 'p': 正态双尾p(t), 'n': n}


def 最小二乘(X: list, y: list) -> dict:
    """多元 OLS：X 为 [常数项, 自变量...] 按行给出，返回系数、R²、t 值。"""
    n, k = len(y), len(X[0])
    XtX = [[sum(X[i][a] * X[i][b] for i in range(n)) for b in range(k)] for a in range(k)]
    Xty = [sum(X[i][a] * y[i] for i in range(n)) for a in range(k)]
    # 增广 [X'X | I | X'y]，高斯-约当消元一次性拿到逆矩阵与解
    m = [XtX[i][:] + [1.0 if i == j else 0.0 for j in range(k)] + [Xty[i]]
         for i in range(k)]
    for c in range(k):
        主元 = max(range(c, k), key=lambda r: abs(m[r][c]))
        m[c], m[主元] = m[主元], m[c]
        除 = m[c][c]
        m[c] = [v / 除 for v in m[c]]
        for r in range(k):
            if r == c:
                continue
            f = m[r][c]
            if f:
                m[r] = [m[r][j] - f * m[c][j] for j in range(2 * k + 1)]
    系数 = [m[i][2 * k] for i in range(k)]
    逆对角 = [m[i][k + i] for i in range(k)]
    拟合 = [sum(X[i][a] * 系数[a] for a in range(k)) for i in range(n)]
    均值 = st.mean(y)
    总平方 = sum((v - 均值) ** 2 for v in y)
    残差平方 = sum((y[i] - 拟合[i]) ** 2 for i in range(n))
    r2 = 1 - 残差平方 / 总平方 if 总平方 else float('nan')
    s2 = 残差平方 / (n - k) if n > k else float('nan')
    标准误 = [math.sqrt(s2 * 逆对角[a]) for a in range(k)]
    t值 = [系数[a] / 标准误[a] if 标准误[a] else float('nan') for a in range(k)]
    return {'系数': 系数, '标准误': 标准误, 't': t值, 'p': [正态双尾p(t) for t in t值],
            'r2': r2, 'n': n, 'k': k}


def 窗口最高(日线: list, k: int):
    """窗口 T+0..T+k 内的最高价；样本不足返回 (None, None)。"""
    段 = 日线[:k + 1]
    if len(段) < min(k + 1, len(日线)) or not 段:
        return (段[-1][3] if 段 else None), (None if not 段 else 段[-1][0])
    最高 = max(段, key=lambda p: p[3])
    return 最高[3], 最高[0]


def 单只指标(债: dict) -> dict:
    """算一只债的全部指标。"""
    日线, 正股 = 债['日线'], 债['正股日线']
    首日 = 日线[0]
    全程高, 全程高日 = 窗口最高(日线, len(日线) - 1)
    高5, 高5日 = 窗口最高(日线, 短窗口)
    高20, 高20日 = 窗口最高(日线, 主窗口) if len(日线) >= 主窗口 + 1 else (None, None)
    最高序号 = max(range(len(日线)), key=lambda i: 日线[i][3])
    # 正股同期涨幅：T+5 作事前可观测的短窗口，T+20 与主窗口对齐
    if 正股:
        j5 = min(短窗口, len(正股) - 1)
        正股涨幅 = round(正股[j5][2] / 正股[0][2] * 100 - 100, 2)
        if len(正股) > 主窗口:
            正股涨幅20 = round(正股[主窗口][2] / 正股[0][2] * 100 - 100, 2)
        else:
            正股涨幅20 = None
    else:
        正股涨幅, 正股涨幅20 = None, None
    # 上市首日转股价值（平价）= 100 / 转股价 × 正股首日收盘，衡量上市时的估值起点
    转股价, 首日平价 = 债.get('转股价'), None
    if 转股价 and 正股:
        首日平价 = round(100 / 转股价 * 正股[0][2], 1)
    # 上市首日口径的正股市值：当前市值 ÷ 现正股价 × 上市首日正股收盘，消除期间涨跌
    市值 = 债.get('正股市值')
    正股流通 = 正股总市值 = 占比 = None
    if 市值 and 正股:
        现价, 首收 = 正股[-1][2], 正股[0][2]
        if 现价:
            正股流通 = round(市值['流通'] / 现价 * 首收, 1)
            正股总市值 = round(市值['总'] / 现价 * 首收, 1)
            占比 = round(债['发行规模'] / 正股流通 * 100, 1) if 正股流通 else None
    return {
        '代码': 债['代码'], '简称': 债['简称'], '正股': 债['正股'],
        '评级': 债['评级'], '规模': 债['发行规模'], '上市日': 债['上市日'],
        '首日平价': 首日平价,
        '正股流通': 正股流通, '正股总市值': 正股总市值, '占比': 占比,
        '交易日': len(日线),
        '首日开': 首日[1], '首日收': 首日[2], '首日高': 首日[3],
        '现价': 日线[-1][2],
        '高5': 高5, '高5日': 高5日,
        '高20': 高20, '高20日': 高20日,
        '全程高': 全程高, '全程高日': 全程高日,
        '最高序号': 最高序号,
        '正股涨幅': 正股涨幅,
        '正股涨幅20': 正股涨幅20,
        '冲高5': None if 高5 is None else round(高5 - 100, 1),
        '冲高20': None if 高20 is None else round(高20 - 100, 1),
        '冲高全程': round(全程高 - 100, 1),
        '首日后再涨': round(全程高 / 首日[2] * 100 - 100, 1),
        '回撤': round(日线[-1][2] / 全程高 * 100 - 100, 1),
    }


def 分档(规模: float) -> str:
    if 规模 < 分档边界[0]:
        return f'<{分档边界[0]} 亿'
    if 规模 < 分档边界[1]:
        return f'{分档边界[0]}-{分档边界[1]} 亿'
    if 规模 < 分档边界[2]:
        return f'{分档边界[1]}-{分档边界[2]} 亿'
    return f'≥{分档边界[2]} 亿'


def 分档统计(样本: list, 字段: str) -> list:
    """按发行规模分档统计冲高幅度的中位数与均值。"""
    顺序 = [f'<{分档边界[0]} 亿', f'{分档边界[0]}-{分档边界[1]} 亿',
            f'{分档边界[1]}-{分档边界[2]} 亿', f'≥{分档边界[2]} 亿']
    桶 = {k: [] for k in 顺序}
    for r in 样本:
        v = r[字段]
        if v is None:
            continue
        桶[分档(r['规模'])].append(v)
    out = []
    for k in 顺序:
        v = 桶[k]
        out.append({'档': k, 'n': len(v),
                    '中位': round(st.median(v), 1) if v else None,
                    '均值': round(st.mean(v), 1) if v else None,
                    '最低': round(min(v), 1) if v else None,
                    '最高': round(max(v), 1) if v else None})
    return out


def 曲线(日线集: list, 字段: str) -> dict:
    """上市后 T+0..T+60 的横截面路径：均值 / 中位数 / 样本数。"""
    点位, 均值, 中位, 数量 = [], [], [], []
    for n in range(曲线长度):
        值 = [d[n][字段] for d in 日线集 if len(d) > n]
        if len(值) < 3:
            break
        点位.append(n)
        均值.append(round(st.mean(值), 2))
        中位.append(round(st.median(值), 2))
        数量.append(len(值))
    return {'T': 点位, '均值': 均值, '中位': 中位, '样本数': 数量}


def main() -> None:
    数据 = json.loads(原始文件.read_text(encoding='utf-8'))
    行 = [单只指标(x) for x in 数据]
    行.sort(key=lambda r: (-r['规模']))

    截止 = max(x['日线'][-1][0] for x in 数据)
    主样本 = [r for r in 行 if r['冲高20'] is not None]
    短样本 = [r for r in 行 if r['冲高5'] is not None]

    # 相关性：规模（取对数）vs 冲高
    x20 = [math.log(r['规模']) for r in 主样本]
    y20 = [r['冲高20'] for r in 主样本]
    x5 = [math.log(r['规模']) for r in 短样本]
    y5 = [r['冲高5'] for r in 短样本]
    p主 = 相关检验(x20, y20)

    # 控制正股涨幅的二元回归（正股涨幅窗口与主窗口对齐）
    可控 = [r for r in 主样本 if r['正股涨幅20'] is not None]
    X单 = [[1.0, math.log(r['规模'])] for r in 可控]
    X双 = [[1.0, math.log(r['规模']), r['正股涨幅20']] for r in 可控]
    y双 = [r['冲高20'] for r in 可控]
    回归单 = 最小二乘(X单, y双)
    回归双 = 最小二乘(X双, y双)
    # 三元：再控制上市首日转股价值，检验盘子效应是否被估值起点解释掉
    三控 = [r for r in 可控 if r['首日平价'] is not None]
    回归三 = (最小二乘([[1.0, math.log(r['规模']), r['正股涨幅20'], r['首日平价']]
                        for r in 三控], [r['冲高20'] for r in 三控])
              if len(三控) > 6 else None)

    # 最高价出现日分布
    峰日 = [r['最高序号'] for r in 行]
    峰日桶 = {}
    for v in 峰日:
        桶 = 'T+0' if v == 0 else ('T+1~5' if v <= 5 else ('T+6~20' if v <= 20 else 'T+20 以后'))
        峰日桶[桶] = 峰日桶.get(桶, 0) + 1

    # ── 对比：债券规模 vs 正股盘子（谁对上市后冲高影响更大）──
    对比样本 = [r for r in 主样本 if r['正股流通'] is not None]
    y对 = [r['冲高20'] for r in 对比样本]
    取名 = {'债': '债券发行规模', '流通': '正股流通市值', '总': '正股总市值', '占比': '债券/正股流通占比(%)'}
    取x = {'债': lambda r: math.log(r['规模']), '流通': lambda r: math.log(r['正股流通']),
           '总': lambda r: math.log(r['正股总市值']), '占比': lambda r: math.log(r['占比'])}
    相关列表 = []
    for k in ['债', '流通', '总', '占比']:
        xx = [取x[k](r) for r in 对比样本]
        相关列表.append({'名': 取名[k], 'pearson': 相关检验(xx, y对),
                         'spearman': 相关检验(秩(xx), 秩(y对)), 'n': len(对比样本)})
    ln债 = [math.log(r['规模']) for r in 对比样本]
    ln流 = [math.log(r['正股流通']) for r in 对比样本]
    ln占 = [math.log(r['占比']) for r in 对比样本]
    y涨 = [r['正股涨幅20'] for r in 对比样本]
    y平 = [r['首日平价'] for r in 对比样本]
    回归A = 最小二乘([[1.0, a] for a in ln债], y对)
    回归B = 最小二乘([[1.0, a] for a in ln流], y对)
    回归C = 最小二乘([[1.0, a, b] for a, b in zip(ln债, ln流)], y对)
    回归E = 最小二乘([[1.0, a, b, c, d] for a, b, c, d in zip(ln债, ln流, y涨, y平)], y对)
    三 = len(对比样本) // 3
    排 = sorted(对比样本, key=lambda r: r['正股流通'])
    分档三 = []
    for 标, g in [('小盘正股', 排[:三]), ('中盘正股', 排[三:2 * 三]), ('大盘正股', 排[2 * 三:])]:
        分档三.append({'段': 标, 'n': len(g),
                       '中位冲高': round(st.median([r['冲高20'] for r in g]), 1),
                       '中位流通': round(st.median([r['正股流通'] for r in g]), 1),
                       '中位债': round(st.median([r['规模'] for r in g]), 1),
                       '中位占比': round(st.median([r['占比'] for r in g]), 1)})

    # 曲线：价格（面值口径）与相对首日收盘的收益率
    价格线 = 曲线([x['日线'] for x in 数据], 2)
    收益集 = []
    for x in 数据:
        首收 = x['日线'][0][2]
        收益集.append([[p[0], 0, p[2] / 首收 * 100 - 100, 0, 0, 0] for p in x['日线']])
    收益线 = 曲线(收益集, 2)

    p主 = 相关检验(x20, y20)  # 已在上方算好，此处仅取用
    结果 = {
        'name': f'{今年} 可转债上市表现',
        'tagline': (f'行情截至 {截止}，共收录 {len(行)} 只可转债。'
                    f'发行规模与 T+{主窗口} 冲高幅度的相关性使用其中 {len(主样本)} 只。'),
        'meta': {
            '样本数': len(行),
            '截止日': 截止,
            '上市区间': f'{min(r["上市日"] for r in 行)} ~ {max(r["上市日"] for r in 行)}',
            '主窗口': f'T+{主窗口}',
            '主样本数': len(主样本),
            '短样本数': len(短样本),
            '封板数': sum(1 for r in 行 if r['首日收'] >= 157.2),
            '首日后再涨中位数': round(st.median([r['首日后再涨'] for r in 行]), 1),
            '数据源': '发行资料 akshare(bond_zh_cov) · 日线腾讯行情(qfq)',
        },
        'kpis': [
            {'v': f'{len(行)} 只', 'l': '收录样本'},
            {'v': f'{st.median([r["首日收"] for r in 行]):.1f}',
             'l': '上市首日收盘中位价'},
            {'v': f'+{st.median([r["冲高5"] for r in 短样本]):.0f}%',
             'l': f'T+{短窗口} 内中位冲高（{len(短样本)} 只）'},
            {'v': f'+{st.median([r["冲高20"] for r in 主样本]):.0f}%',
             'l': f'T+{主窗口} 内中位冲高（{len(主样本)} 只）'},
            {'v': f'T+{int(st.median(峰日))}',
             'l': '最高价出现日（中位）'},
            {'v': f'{st.median([r["现价"] for r in 行]):.1f}',
             'l': '截止日价格中位数（面值 100）'},
        ],
        'corr': {
            '主窗口': {'pearson': p主, 'spearman': 相关检验(秩(x20), 秩(y20)), 'n': len(主样本)},
            '短窗口': {
                'pearson': 相关检验(x5, y5),
                'spearman': 相关检验(秩(x5), 秩(y5)),
                'n': len(短样本),
            },
            '回归单': 回归单,
            '回归双': 回归双,
            '回归三': 回归三,
            '可控样本': len(可控),
        },
        'scatter': [{'规模': r['规模'], '冲高': r['冲高20'], '简称': r['简称'],
                     '正股涨幅': r['正股涨幅20'], '评级': r['评级'],
                     '现价': r['现价']} for r in 主样本],
        '对比': {
            '相关': 相关列表,
            '回归': [
                {'标题': '① 只放债券规模', '变量': ['常数项', 'ln债券规模'], 'res': 回归A},
                {'标题': '② 只放正股流通', '变量': ['常数项', 'ln正股流通'], 'res': 回归B},
                {'标题': '③ 债券规模 + 正股流通', '变量': ['常数项', 'ln债券规模', 'ln正股流通'], 'res': 回归C},
                {'标题': '④ 全模型', '变量': ['常数项', 'ln债券规模', 'ln正股流通', '正股同期涨', '首日平价'], 'res': 回归E},
            ],
            '分档三': 分档三,
            '散点对比': [{'规模': r['规模'], '流通': r['正股流通'], '冲高': r['冲高20'],
                         '简称': r['简称'], '占比': r['占比']} for r in 对比样本],
        },
        'bins20': 分档统计(主样本, '冲高20'),
        'bins5': 分档统计(短样本, '冲高5'),
        'peakday': [{'段': k, 'n': 峰日桶.get(k, 0)}
                    for k in ['T+0', 'T+1~5', 'T+6~20', 'T+20 以后']],
        'curve': {'价格': 价格线, '收益': 收益线},
        'rows': 行,
    }
    输出文件.write_text(json.dumps(结果, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'样本 {len(行)}，主窗口样本 {len(主样本)}')
    print('T+20 冲高 vs ln(规模) pearson %.3f (p=%.4f) spearman %.3f'
          % (结果['corr']['主窗口']['pearson']['r'],
             结果['corr']['主窗口']['pearson']['p'],
             结果['corr']['主窗口']['spearman']['r']))
    print('T+5  pearson %.3f (p=%.4f) spearman %.3f'
          % (结果['corr']['短窗口']['pearson']['r'],
             结果['corr']['短窗口']['pearson']['p'],
             结果['corr']['短窗口']['spearman']['r']))
    print('单元回归 ln(size) 系数 %.2f  R²=%.3f' % (回归单['系数'][1], 回归单['r2']))
    print('二元回归 ln(size) %.2f (t=%.2f, p=%.3f) 正股涨幅 %.3f (t=%.2f, p=%.3f)  R²=%.3f'
          % (回归双['系数'][1], 回归双['t'][1], 回归双['p'][1],
             回归双['系数'][2], 回归双['t'][2], 回归双['p'][2], 回归双['r2']))
    if 回归三:
        print('三元回归 ln(size) %.2f (t=%.2f, p=%.3f) 正股 %.3f (p=%.3f) 首日平价 %.3f (p=%.3f) R²=%.3f'
              % (回归三['系数'][1], 回归三['t'][1], 回归三['p'][1],
                 回归三['系数'][2], 回归三['p'][2], 回归三['系数'][3], 回归三['p'][3], 回归三['r2']))
    for b in 结果['bins20']:
        print('  档', b['档'], 'n=%d' % b['n'], '中位', b['中位'], '均值', b['均值'])
    print('峰日分布', 结果['peakday'])
    print('首日后再涨中位 %.1f%%  现价回撤中位 %.1f%%'
          % (结果['meta']['首日后再涨中位数'], st.median([r['回撤'] for r in 行])))


if __name__ == '__main__':
    main()
