# AGENTS.md（雪球网站子仓库）

本文件是 `雪球网站/` 这个**独立 Git 仓库**的代理工作规范。工作区级规则见上级 `../AGENTS.md`，本文件只写本仓库特有边界。

- 远端：`git@github.com:X-east/xdc.git`
- 部署：`CNAME` 指向自定义域名（`xdcxdc.shop`），静态托管
- 定位：**展示层**。只消费上游产物，不生产数据。

## 一、唯一数据入口

```text
源码/雪球爬虫/数据/雪球.sqlite
  -> 源码/雪球爬虫/scripts/export_posts.py
  -> 输出/爬虫/投资者/posts.json          ← 本仓库唯一内容输入
  -> 雪球网站/scripts/build_site_data.mjs
  -> 雪球网站/data/site-content.json      ← 唯一站点索引
  -> 静态页面
```

铁律（违反即为架构问题，不要绕过）：

1. `输出/爬虫/投资者/posts.json` 是**唯一**内容输入。`raw_posts*.txt`、日报 JSON、旧版 `posts.json`、Markdown 报告都只是归档源，**不得**被本仓库读取。
2. `data/site-content.json` 是**生成产物**，**禁止手工编辑**。要改内容先改 `export_posts.py` 或 `build_site_data.mjs`，再重跑。
3. 业务判断前移到导出层。前端只渲染数据合同，**不做**二次推断（例如不靠标题长度猜是不是长文）。
4. 投资者主视图是**文章索引**，不是全文阅读器：
   - 卡片只含作者 / 标题 / 简介 / 时间 / 标签 / 互动 / 雪球原文链接；
   - 不展示回复流（`post_type === 'reply'` 不进入主视图与搜索）；
   - 不生成 `data/long-posts/posts/*.json`，不在浏览器里抓取雪球或本地详情 JSON；
   - 图片一律在雪球原文查看，本地只提示「含图」。
5. 没有原文链接（`url`）的条目**不进入**主索引，避免死链。

## 二、目录结构与职责

| 路径 | 职责 |
|---|---|
| `index.html` | 门户首页（模块卡片） |
| `investors.html`、`portfolios.html`、`stocks.html`、`quant.html` | 11 行跳转壳，实际逻辑集中在 `index.html` + `js/` |
| `investor-analysis.html` | 投资者分析页 |
| `js/core.js` | 数据加载与共享状态 |
| `js/app.js` | 主渲染：索引卡片、搜索、筛选、分页 |
| `js/analysis.js` | 分析视图渲染 |
| `css/style.css` | 唯一样式表 |
| `data/site-content.json` | 生成产物，唯一站点索引 |
| `scripts/build_site_data.mjs` | 构建脚本（`posts.json` → `site-content.json`） |
| `scripts/serve.mjs` | 本地预览（默认 `http://127.0.0.1:4173/`） |
| `assets/` | 静态资源（`source-data/` 原始素材、`output/` 处理产物） |

## 三、常用命令

```bash
# 构建站点索引
cd "D:/desktop/money/雪球网站"
node scripts/build_site_data.mjs

# 本地预览
node scripts/serve.mjs
# 打开 http://127.0.0.1:4173/

# 语法自检
node --check js/app.js
node --check js/analysis.js
node --check js/core.js
node --check scripts/build_site_data.mjs
```

上游更新（在根目录执行）：

```bash
cd "D:/desktop/money/源码/雪球爬虫"
python scripts/export_posts.py
```

## 四、环境与工具

本机 Python / Node / Edge / SDK / JDK / Gradle 的**绝对路径**、以及「`agent-browser` 不可用、浏览器自动化走 Edge headless + CDP」等硬约束，统一见上级 `../AGENTS.md` §环境与工具（本机实况），本仓库不重复维护。

判「移动端横向溢出」要比 `scrollWidth <= clientWidth`，**不要**拿 `innerWidth` 比（滚动条宽度会被误判成溢出）。

## 五、验证清单

改完数据链路或前端后至少运行：

```bash
node scripts/build_site_data.mjs
node --check js/app.js
node --check scripts/build_site_data.mjs
node -e "const d=require('./data/site-content.json');console.log('posts',(d.posts||[]).length)"
```

人工核查：

- 投资者数量符合预期，不因某次导入只剩一人。
- 主视图**不出现**回复条目；`reply` 条目不在搜索命中里。
- 每张卡片都有可打开的雪球原文链接。
- 搜索 / 筛选 / 分页状态互相一致；空状态说明「当前筛选无结果」而非像数据丢失。
- 不再生成或读取 `data/long-posts/posts/*.json`。
- 移动端无文本溢出、按钮挤压、卡片互相覆盖。

## 六、提交规范

本仓库是**独立 Git 仓库**，与根仓库 `D:/desktop/money` **分开提交**，不要把两边改动混在一次提交里解释。

```bash
git status --short --branch
git add <精确文件路径>          # 绝不 git add -A / git add .
git commit -m "feat(网站): ..."
git push                        # 本仓库有 remote，提交后必须 push
```

- `data/site-content.json` 是生成产物：先确认生成脚本正确，再提交产物。
- 大文件（如 `assets/` 下的全量数据）、临时预览输出不要混入提交。
- 完成一次实质处理后在根仓库 `输出/处理报告/YYMMDD-N 标题.md` 写简短报告（缘由 / 计划 / 过程 / 结果）。

## 七、相关文档

- [上级工作区规范](../AGENTS.md) ← **必读第一入口**
- [数据管线说明](DATA_PIPELINE.md)
- [工作区长期记忆](../.workbuddy/memory/MEMORY.md)
