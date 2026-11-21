# XDC 研究门户 · GitHub Pages 发布仓

本仓是 `X-east/xdc` 的 Pages 发布源，域名 `https://xdcxdc.shop/`。

## 它是什么

工作区 `D:/desktop/money` 的**纯静态发布副本**：根 `index.html` 门户用链接 /
iframe 串起行业研究、个股研究、投资者研究、资产地图、量化、直播等模块。
所有页面走相对路径、fetch 同目录 JSON，不依赖本地 `serve.py`，可直接被 GitHub Pages 托管。

## 怎么更新（★ 不要手改本仓文件）

本仓所有内容由工作区的构建脚本生成。要改页面或数据：

```bash
cd D:/desktop/money
python app/build_static_site.py        # 从各模块重新拼一份静态副本到 雪球网站/
cd 雪球网站
git add -- <改动路径>                   # 精确 add，禁止 git add -A / .
git commit -m "chore(site): 同步门户静态版"
git push origin main
```

构建脚本会：

1. 用 `投资者研究/online/`（echarts 外链共享，约 51MB）而非 604MB 的离线内嵌版；
2. 把门户 iframe 指向在线版索引；
3. 隐藏个股页依赖 `POST /api/apply` 的「存到仓库」按钮（静态站无后端）；
4. 旧雪球站内容移入 `xueqiu/` 存档，不删除。

源模块改动顺序：先在工作区重建对应模块（如 `python 投资者研究/build_online.py`），
再跑本仓构建脚本。详见 `../app/build_static_site.py` 文件头。

## 目录说明

| 路径 | 来源 |
|---|---|
| `index.html` | 工作区根门户 |
| `行业研究/` | `终端/terminal.py publish` 产物 |
| `个股研究/` | `个股研究/stock.html` + `rt/` 运行库 |
| `投资者研究/online/` | `投资者研究/build_online.py` 产物（外链 echarts） |
| `资产地图/新版/` | MapLibre 新版地图 |
| `量化研究/`、`直播专区/`、`我的/` | 同名工作区模块 |
| `xueqiu/` | 旧雪球文章索引站存档（历史保留） |
| `CNAME`、`/.nojekyll` | Pages 自定义域名 / 禁用 Jekyll 处理 |

## 已知限制

- 个股页「存到仓库」按钮在静态版隐藏；要编辑数据需在工作区本地操作后重新发布。
- `行业研究/` 里的 `/index.html#/xxx` 绝对路径返回链接只在域名根托管下成立。
