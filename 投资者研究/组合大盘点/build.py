#!/usr/bin/env python3
"""组合大盘点页面构建 — 把数据与 ECharts 内联进源页面，产出离线单文件。

产物约定（2026-09-15 起）：
    · `index.html` = 手写的状态说明页，**不含任何组合数据**（全量 11.6 万组合不上网）
    · `full.html`  = 全量数据页，仅本地查看；用 `python build.py --full` 生成
  之所以默认不产物：全量页 60MB+，且组合归属/停更口径仍在收敛，不该被误发布上线。
"""

import argparse
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
# F4：复用投资者研究/build.py 的 inject_inv_root，把 :root 深色兜底改由单一真相源注入
sys.path.insert(0, os.path.abspath(os.path.join(ROOT, '..')))
from build import inject_inv_root
# 全站页面条（单一真相源 app/nav_kit.py）：源页手写的 .nav 已删除，由 nav_kit 统一给
_APP = os.path.abspath(os.path.join(ROOT, '..', '..', 'app'))
if _APP not in sys.path:
    sys.path.insert(0, _APP)
import nav_kit
ECHARTS = os.path.normpath(os.path.join(ROOT, '..', '..', '硬资产地图源码', 'dist', 'echarts.min.js'))
SRC = os.path.join(ROOT, 'index.src.html')
FULL = os.path.join(ROOT, 'full.html')
DATA = os.path.join(ROOT, 'data', 'cubes_rank.json')

TAG = re.compile(r'<script src="[^"]*echarts[^"]*"></script>')
DATA_TAG = '/*__DATA__*/ {}'


def build(dst):
    """构建全量单文件页到 dst，返回是否成功"""
    for p in (SRC, DATA, ECHARTS):
        if not os.path.exists(p):
            print('  [FAIL] 缺少文件:', p)
            return False
    html = open(SRC, encoding='utf-8').read()
    if not TAG.search(html):
        print('  [FAIL] 未找到 echarts 引用标签')
        return False
    if DATA_TAG not in html:
        print('  [FAIL] 未找到数据占位符 /*__DATA__*/ {}')
        return False

    dj = open(DATA, encoding='utf-8').read().strip().replace('</', '<\\/')
    html = html.replace(DATA_TAG, dj)

    # 用 lambda 替换，避免 JS 里的反斜杠被 re 当正则模板解析
    js = open(ECHARTS, encoding='utf-8').read()
    html = TAG.sub(lambda m: '<script>\n' + js + '\n</script>', html)

    # F4：注入单一真相源 :root 深色兜底（源页手抄已取缔；--warn/--cyan 等自定义变量保住后写胜出）
    html = inject_inv_root(html)

    # 全站页面条（内联形态：CSS 并进本页已有的 <style>，样式表结束标记仍恰好 1 次）
    html, _bar = nav_kit.inject(html, '投资者研究/组合大盘点/%s' % os.path.basename(dst),
                                inline=True)

    open(dst, 'w', encoding='utf-8').write(html)
    print('  [OK] %s  (%.2f MB)' % (os.path.basename(dst), len(html) / 1048576))
    return True


def main():
    """默认只提示；加 --full 才生成全量页"""
    ap = argparse.ArgumentParser()
    ap.add_argument('--full', action='store_true', help='生成全量数据页到 full.html（仅本地）')
    a = ap.parse_args()
    if not a.full:
        print('  index.html 是手写的状态说明页，不含组合数据（全量 11.6 万组合不上网）。')
        print('  需要本地查看全量页时再跑：python build.py --full  → full.html')
        return 0
    return 0 if build(FULL) else 1


if __name__ == '__main__':
    sys.exit(main())
