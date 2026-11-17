# Data Pipeline

The site has one canonical content path:

```text
源码/雪球爬虫/数据/雪球.sqlite
  -> 源码/雪球爬虫/scripts/export_posts.py
  -> 输出/爬虫/投资者/posts.json
  -> 雪球网站/scripts/build_site_data.mjs
  -> 雪球网站/data/site-content.json
```

`posts.json` is the only content input for investor posts in the website build.
Legacy raw text, daily JSON, and long-text files are treated as archive files only.

The investor page is an article link index, not a local full-text reader:

- cards show author, title, summary, time, tags, interactions, and the Xueqiu source URL;
- the build does not generate `data/long-posts/posts/*.json`;
- the browser does not fetch Xueqiu or local detail JSON for full text;
- images are read on the Xueqiu source page after the user opens the original article.

## Update One Investor

From the repository root:

```powershell
cd "D:\Desktop\money\源码\雪球爬虫"
python main.py --user=超级鹿鼎公 --max-pages=200 --headless --no-push
python scripts/export_posts.py

cd "D:\Desktop\money\雪球网站"
node scripts/build_site_data.mjs
```

Then verify the static site locally:

```powershell
node scripts/serve.mjs
```

Open `http://127.0.0.1:4173/`.

## Historical Migration

If `posts.json` has data but SQLite is empty, run this once:

```powershell
cd "D:\Desktop\money"
python "源码\雪球爬虫\scripts\import_posts_json.py"
python "源码\雪球爬虫\scripts\export_posts.py"

cd "D:\Desktop\money\雪球网站"
node scripts/build_site_data.mjs
```
