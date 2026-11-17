#!/usr/bin/env python3
"""新股新债页面构建 — 把数据与 ECharts 内联进源页面，产出离线单文件。

两处内联（均用 lambda 替换，避免 JS/JSON 里的反斜杠被 re 当正则模板解析）：
1. <script src="…echarts.min.js">  → 内联 ECharts 源码
2. const DATA = /*__DATA__*/ {}    → 内联 data/<名字>.json（内容与展示分离）
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
ECHARTS = os.path.normpath(os.path.join(ROOT, '..', '..', '硬资产地图源码', 'dist', 'echarts.min.js'))

# 全站页面条（← 门户 / 面包屑 / 同级入口）单一真相源：源页里写死的那条 .back 已删除
_APP = os.path.normpath(os.path.join(ROOT, '..', '..', 'app'))
if _APP not in sys.path:
    sys.path.insert(0, _APP)
import nav_kit

# 需要构建的页面（源文件名去掉 .src.html）
PAGES = ['可转债上市表现']

TAG = re.compile(r'<script src="[^"]*echarts[^"]*"></script>')
DATA_TAG = '/*__DATA__*/ {}'
# 自由文字补充源占位符（见 build() 里的说明；与 DATA_TAG 同一套机制）
NOTE_TAG = '/*__NOTE__*/ {}'


def build(name):
    """构建单个页面，返回是否成功"""
    src = os.path.join(ROOT, name + '.src.html')
    dst = os.path.join(ROOT, name + '.html')
    data = os.path.join(ROOT, 'data', name + '.json')
    if not os.path.exists(src):
        print('  [FAIL] 源文件不存在:', src)
        return False
    if not os.path.exists(ECHARTS):
        print('  [FAIL] echarts 未找到:', ECHARTS)
        return False
    if not os.path.exists(data):
        print('  [FAIL] 数据文件不存在:', data)
        return False
    html = open(src, encoding='utf-8').read()
    if not TAG.search(html):
        print('  [FAIL] 未找到 echarts 引用标签')
        return False
    if DATA_TAG not in html:
        print('  [FAIL] 未找到数据占位符 /*__DATA__*/ {}')
        return False

    dj = open(data, encoding='utf-8').read().strip()
    html = html.replace(DATA_TAG, dj)

    # 自由文字补充（data/<页名>.笔记.json，一页一份）：与结构化数据分开存 ——
    # 结构化那份由 analyze_cb.py 从原始行情**重算覆盖**，手写内容混在一起会被冲掉。
    # 文件是「用出来的」：用户在 App 里第一次改才由 apply_export.py 建，这里允许不存在。
    # `</` → `<\/`：用户文字里可能写 </script>，不转义会把这页脚本提前截断。
    note = os.path.join(ROOT, 'data', name + '.笔记.json')
    nj = '{}'
    if os.path.exists(note):
        nj = open(note, encoding='utf-8').read().strip().replace('</', '<\\/')
    if NOTE_TAG not in html:
        print('  [FAIL] 未找到补充源占位符 /*__NOTE__*/ {}')
        return False
    html = html.replace(NOTE_TAG, nj)
    # 三个字段同时要渲染进 HTML 正文（占位符 __NOTE_<字段>__）——
    # 这里必须 HTML 转义：同一个字符串进 JS 要转义 `/`、进 HTML 要转义 `&<>`，
    # 两种转义不能互相代替（漏一个就是 XSS 或脚本被截断）。
    try:
        ndoc = json.loads(nj) if os.path.exists(note) else {}
    except ValueError as e:
        print('  [FAIL] 补充源不是合法 JSON：%s（%s）' % (note, e))
        return False
    import html as _html
    for f in ('thesis', 'note', 'watch'):
        tag = '/*__NOTE_%s__*/' % f.upper()
        if tag not in html:
            print('  [FAIL] 未找到正文占位符 %s' % tag)
            return False
        html = html.replace(tag, _html.escape(str(ndoc.get(f) or '')))

    js = open(ECHARTS, encoding='utf-8').read()
    html = TAG.sub(lambda m: '<script>\n' + js + '\n</script>', html)

    # 全站页面条：CSS 并进本页已有的 <style>（内联形态，样式表结束标记仍恰好 1 次）
    html, _bar = nav_kit.inject(html, '量化研究/新股新债/%s.html' % name, inline=True)
    if html.count('</style>') != 1:
        print('  [FAIL] 样式表结束标记计数异常: %d' % html.count('</style>'))
        return False

    open(dst, 'w', encoding='utf-8').write(html)
    print('  [OK] %s  (%.2f MB%s)' % (os.path.basename(dst), len(html) / 1048576,
                                      '，页面条已内联' if _bar else ''))
    return True


def main():
    print('构建新股新债页面：')
    ok = sum(1 for p in PAGES if build(p))
    print('完成 %d/%d' % (ok, len(PAGES)))
    return 0 if ok == len(PAGES) else 1


if __name__ == '__main__':
    sys.exit(main())
