"""行情取数 — 腾讯日线接口，供观点验证计算区间涨跌"""

import json
import time
from pathlib import Path

import requests

# ─── 常量 ───
行情接口 = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get"
请求头 = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
         "Referer": "https://gu.qq.com/"}
K线根数 = 800
缓存目录 = Path(__file__).resolve().parent / "行情缓存"

# 代码 -> 显示名
标的 = {
    "sh000300": "沪深300", "sh000688": "科创50", "sh000905": "中证500",
    "hkHSI": "恒生指数", "hkHSTECH": "恒生科技", "usIXIC": "纳斯达克",
    "sh512480": "半导体ETF", "sh512400": "有色ETF", "sz159870": "化工ETF",
    "sh512010": "医药ETF", "sz159992": "创新药ETF", "sz159755": "电池ETF",
    "sh518880": "黄金ETF", "sh513050": "中概互联ETF", "sh513130": "恒生科技ETF",
    "sh561560": "电力ETF", "sh588000": "科创50ETF", "sh510300": "沪深300ETF",
    "sh600577": "精达股份", "sh600105": "永鼎股份", "sz000969": "安泰科技",
    "sh688122": "西部超导", "sh688639": "华恒生物", "sh601088": "中国神华",
}


def 取日线(代码: str, 起始日: str = "20240101") -> list:
    """取前复权日线，返回 [[日期, 开, 收, 高, 低, 量], ...]"""
    缓存目录.mkdir(parents=True, exist_ok=True)
    缓存 = 缓存目录 / f"{代码}.json"
    if 缓存.exists():
        return json.loads(缓存.read_text(encoding="utf-8"))
    url = f"{行情接口}?param={代码},day,,,{K线根数},qfq"
    for attempt in range(4):
        try:
            r = requests.get(url, headers=请求头, timeout=20)
            node = (r.json().get("data") or {}).get(代码) or {}
            rows = node.get("qfqday") or node.get("day") or []
            if not rows:
                time.sleep(1.5)
                continue
            rows = [list(p) for p in rows if p[0] >= 起始日]
            缓存.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
            return rows
        except Exception as e:
            if attempt == 2:
                print(f"  {代码} 失败 {e}")
                return []
            time.sleep(2)
    return []


def 收盘价(rows: list, 日期: str):
    """取不早于给定日期的首个收盘价，返回 (日期, 收盘)"""
    for r in rows:
        if r[0] >= 日期:
            return r[0], float(r[2])
    return None, None


def 区间涨跌(代码: str, 起: str, 止: str = "") -> dict:
    """计算从起始日到最新（或指定日）的涨跌幅"""
    rows = 取日线(代码)
    if not rows:
        return {"代码": 代码, "错误": "无数据"}
    d0, p0 = 收盘价(rows, 起)
    if p0 is None:
        return {"代码": 代码, "错误": "起始日无数据"}
    if 止:
        d1, p1 = 收盘价(rows, 止)
        if p1 is None:
            _, p1 = rows[-1][0], float(rows[-1][2])
            d1 = rows[-1][0]
    else:
        d1, p1 = rows[-1][0], float(rows[-1][2])
    return {"代码": 代码, "名称": 标的.get(代码, 代码), "起日": d0, "起价": p0,
            "止日": d1, "止价": p1, "涨跌": round((p1 / p0 - 1) * 100, 2)}
