#!/usr/bin/env python3
"""抓取今年上市可转债的发行资料与上市后日线 — 腾讯行情接口，落盘为原始 JSON。

同时抓对应正股同期日线，用于在分析时控制「正股涨得多所以转债冲得高」这一混杂因素。
"""

import json
import time
from pathlib import Path

import akshare as ak
import requests

# ─── 常量 ───
今年 = 2026
输出路径 = Path(__file__).resolve().parent / '数据' / f'raw_{今年}可转债.json'
请求头 = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Referer': 'https://gu.qq.com/'}
行情接口 = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get'
实时接口 = 'https://qt.gtimg.cn/q='
批量大小 = 30
重试次数 = 4
请求间隔 = 0.35          # 秒，避免触发限速
K线根数 = 320


def 市场符号(代码: str) -> str:
    """转债：沪市 11 开头 → sh，深市 12 开头 → sz；正股按板块前缀判断。"""
    if 代码.startswith(('11', '6', '9')):
        return 'sh' + 代码
    return 'sz' + 代码


def 取日线(符号: str, 起始日: str) -> list:
    """拉取单只标的自起始日以来的日线，返回 [日期, 开, 收, 高, 低, 量]。"""
    url = f'{行情接口}?param={符号},day,,,{K线根数},qfq'
    for 第 in range(重试次数):
        try:
            r = requests.get(url, headers=请求头, timeout=15)
            d = (r.json().get('data') or {}).get(符号) or {}
            行列表 = d.get('qfqday') or d.get('day') or []
            return [[p[0], float(p[1]), float(p[2]), float(p[3]),
                     float(p[4]), float(p[5])]
                    for p in 行列表 if len(p) >= 6 and p[0] >= 起始日]
        except Exception as e:
            print(f'    [重试 {第 + 1}] {符号} {e}')
            time.sleep(2 * (第 + 1))
    return []


def 取市值(代码组: list) -> dict:
    """批量取正股总市值与流通市值（亿元），返回 {代码: (总, 流通)}。"""
    url = 实时接口 + ','.join(市场符号(c) for c in 代码组)
    for 第 in range(重试次数):
        try:
            r = requests.get(url, headers=请求头, timeout=15)
            r.encoding = 'gbk'
            结果 = {}
            for 行 in r.text.split(';'):
                行 = 行.strip()
                if not 行.startswith('v_'):
                    continue
                字段 = 行.split('="')[1].rstrip('"').split('~')
                if len(字段) < 46:
                    continue
                结果[字段[2]] = (float(字段[45] or 0), float(字段[44] or 0))
            return 结果
        except Exception as e:
            print(f'    [重试 {第 + 1}] 市值批量 {e}')
            time.sleep(2 * (第 + 1))
    return {}


def 取发行列表() -> list:
    """从 akshare 取全量可转债发行资料，只保留今年已上市的。"""
    df = ak.bond_zh_cov()
    df['上市时间'] = df['上市时间'].astype(str).str.slice(0, 10)
    结果 = []
    for _, r in df.iterrows():
        上市 = str(r['上市时间'])
        if not 上市.startswith(str(今年)):
            continue
        try:
            规模 = round(float(r['发行规模']), 3)
        except Exception:
            规模 = None
        try:
            转股价 = round(float(r['转股价']), 3)
        except Exception:
            转股价 = None
        结果.append({
            '代码': str(r['债券代码']),
            '简称': str(r['债券简称']),
            '正股代码': str(r['正股代码']),
            '正股': str(r['正股简称']),
            '评级': str(r['信用评级']),
            '转股价': 转股价,
            '申购日': str(r['申购日期'])[:10],
            '上市日': 上市,
            '发行规模': 规模,
        })
    return 结果


def main() -> None:
    # 增量补齐：已有完整日线的条目直接复用，只重抓缺失的（避免重跑时被限流毁掉已有数据）
    旧表 = {}
    if 输出路径.exists():
        for 旧 in json.loads(输出路径.read_text(encoding='utf-8')):
            旧表[旧['代码']] = 旧
    列表 = 取发行列表()
    缺市值 = [it for it in 列表 if not 旧表.get(it['代码'], {}).get('正股市值')]
    print(f'正股市值待抓 {len(缺市值)} 只')
    for i in range(0, len(缺市值), 批量大小):
        批 = 缺市值[i:i + 批量大小]
        市值表 = 取市值([x['正股代码'] for x in 批])
        for x in 批:
            v = 市值表.get(x['正股代码'])
            x['正股市值'] = {'总': v[0], '流通': v[1]} if v else None
        time.sleep(请求间隔)
    未取到 = [x['简称'] for x in 列表 if not x.get('正股市值')]
    if 未取到:
        print(f'  [警告] 正股市值缺失：{未取到}')

    print(f'今年已上市 {len(列表)} 只，其中 {sum(1 for x in 列表 if x["代码"] in 旧表)} 只已有缓存')
    for i, it in enumerate(列表, 1):
        旧 = 旧表.get(it['代码'], {})
        if 旧.get('日线') and 旧.get('正股日线'):
            it['日线'], it['正股日线'] = 旧['日线'], 旧['正股日线']
        else:
            it['日线'] = 取日线(市场符号(it['代码']), it['上市日'])
            it['正股日线'] = 取日线(市场符号(it['正股代码']), it['上市日'])
            time.sleep(请求间隔)
        print(f'  [{i}/{len(列表)}] {it["代码"]} {it["简称"]} '
              f'转债{len(it["日线"])}根 正股{len(it["正股日线"])}根 转股价{it["转股价"]}')
    输出路径.parent.mkdir(parents=True, exist_ok=True)
    输出路径.write_text(json.dumps(列表, ensure_ascii=False, indent=1), encoding='utf-8')
    缺 = [x['简称'] for x in 列表 if not x['日线']]
    缺股 = [x['简称'] for x in 列表 if not x['正股日线']]
    print(f'写入 {输出路径}；日线缺失 {len(缺)} 只 {缺}；正股缺失 {len(缺股)} 只 {缺股}')


if __name__ == '__main__':
    main()
