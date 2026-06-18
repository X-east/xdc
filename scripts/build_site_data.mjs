import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(scriptDir, "..");
const moneyRoot = path.resolve(siteRoot, "..");
const outputRoot = path.join(moneyRoot, "输出");
const sourceDataRoot = path.join(moneyRoot, "数据");
const publicOutputRoot = path.join(siteRoot, "assets", "output");
const publicDataRoot = path.join(siteRoot, "assets", "source-data");
const longPostsRoot = path.join(siteRoot, "data", "long-posts");
const longPostDetailsRoot = path.join(longPostsRoot, "posts");

const links = [
    {
        title: "紫金矿业官网",
        url: "https://www.zijinmining.com/",
        description: "公司公告、业务布局、投资者关系和矿业项目资料。"
    },
    {
        title: "国际铜研究小组",
        url: "https://icsg.org/",
        description: "全球铜矿、精炼铜、需求和供需平衡研究。"
    },
    {
        title: "雪球",
        url: "https://xueqiu.com/",
        description: "投资者观点和市场讨论。"
    },
    {
        title: "巨潮资讯",
        url: "https://www.cninfo.com.cn/",
        description: "A 股公告、定期报告和监管披露。"
    },
    {
        title: "上海证券交易所",
        url: "https://www.sse.com.cn/",
        description: "上交所上市公司公告和市场数据。"
    },
    {
        title: "深圳证券交易所",
        url: "https://www.szse.cn/",
        description: "深交所上市公司公告和市场数据。"
    }
];

const publishExtensions = new Set([".json", ".txt", ".md", ".png", ".jpg", ".jpeg", ".webp", ".csv", ".log"]);
const skipNames = new Set(["database.db", "电力负荷月均日内曲线.zip"]);

await mkdir(path.join(siteRoot, "data"), { recursive: true });
await rm(publicOutputRoot, { recursive: true, force: true });
await rm(publicDataRoot, { recursive: true, force: true });
await rm(longPostsRoot, { recursive: true, force: true });
await mkdir(publicOutputRoot, { recursive: true });
await mkdir(publicDataRoot, { recursive: true });
await mkdir(longPostDetailsRoot, { recursive: true });

const outputFilesInternal = await copyPublishableFiles(outputRoot, publicOutputRoot, "assets/output", "输出");
const sourceFilesInternal = await copySelectedSourceData(sourceDataRoot, publicDataRoot, "assets/source-data");
const postsJsonData = await loadPostsJson();
const longPostsData = await buildLongPostDataset(postsJsonData);
const xueqiuInternal = buildXueqiu(longPostsData.index, outputFilesInternal);
const stocks = await buildStocks(sourceFilesInternal);
const artifacts = outputFilesInternal
    .filter((item) => !item.relative.includes("爬虫/日报/原始内容"))
    .map((item) => ({
        name: item.name,
        title: item.title,
        category: categoryFromRelative(item.relative),
        quantGroup: quantGroupFromRelative(item.relative),
        url: item.url,
        size: item.size,
        updatedAt: item.updatedAt
    }))
    .sort(sortByUpdated);

const xueqiu = stripInternalSources(xueqiuInternal);
const data = {
    generatedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
    summary: {
        postCount: xueqiu.posts.length,
        longArticleCount: xueqiu.longArticles.length,
        investorCount: xueqiu.investors.length,
        artifactCount: artifacts.length + stocks.industryFiles.length + xueqiu.dailyFiles.length + xueqiu.longTexts.length,
        watchlistCount: stocks.watchlist.length,
        stockCount: postsJsonData.stocks.length,
        industryCount: Object.keys(postsJsonData.industries).length
    },
    xueqiu,
    stocks,
    artifacts,
    links,
    longPosts: longPostsData.index,
    postsJson: stripPostsPayload(postsJsonData)
};

await writeFile(path.join(siteRoot, "data", "site-content.json"), JSON.stringify(data, null, 2), "utf8");
console.log(`Generated data/site-content.json with ${data.summary.longArticleCount} long articles and ${data.summary.artifactCount} published files.`);
console.log(`Generated data/long-posts/index.json and ${longPostsData.index.posts.length} long-post detail files.`);
console.log(`Included ${postsJsonData.stocks.length} stocks and ${Object.keys(postsJsonData.industries).length} industries from posts.json`);

async function copyPublishableFiles(sourceRoot, targetRoot, publicPrefix, labelPrefix) {
    const files = [];
    if (!(await exists(sourceRoot))) return files;

    async function walk(current) {
        const entries = await readdir(current, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
                await walk(full);
                continue;
            }

            const ext = path.extname(entry.name).toLowerCase();
            if (!publishExtensions.has(ext) || skipNames.has(entry.name)) continue;

            const info = await stat(full);
            const relative = path.relative(sourceRoot, full).replaceAll("\\", "/");
            const target = path.join(targetRoot, relative);
            await mkdir(path.dirname(target), { recursive: true });
            await copyFile(full, target);

            files.push({
                name: entry.name,
                title: stripExtension(entry.name),
                relative: `${labelPrefix}/${relative}`,
                source: full,
                url: `${publicPrefix}/${encodePath(relative)}`,
                size: info.size,
                updatedAt: info.mtime.toISOString()
            });
        }
    }

    await walk(sourceRoot);
    return files.sort(sortByUpdated);
}

async function copySelectedSourceData(sourceRoot, targetRoot, publicPrefix) {
    const files = [];
    const selected = [
        "我的自选股.csv",
        "股票行业分类/同花顺概念板块.md",
        "股票行业分类/同花顺行业板块.md",
        "股票行业分类/申万行业分类_全部股票.md",
        "股票行业分类/新浪申万一级分类_全部股票.md",
        "股票行业分类/新浪申万二级分类_全部股票.md",
        "股票行业分类/新浪地域板块分类_全部股票.md",
        "股票行业分类/新浪热门概念分类_全部股票.md"
    ];

    for (const relative of selected) {
        const source = path.join(sourceRoot, ...relative.split("/"));
        if (!(await exists(source))) continue;
        const info = await stat(source);
        const target = path.join(targetRoot, relative);
        await mkdir(path.dirname(target), { recursive: true });
        await copyFile(source, target);
        files.push({
            name: path.basename(relative),
            title: stripExtension(path.basename(relative)),
            relative: `数据/${relative}`,
            source,
            url: `${publicPrefix}/${encodePath(relative)}`,
            size: info.size,
            updatedAt: info.mtime.toISOString()
        });
    }

    return files.sort(sortByUpdated);
}

async function loadPostsJson() {
    const postsJsonPath = path.join(outputRoot, "爬虫", "投资者", "posts.json");
    if (!(await exists(postsJsonPath))) {
        console.warn(`posts.json not found at ${postsJsonPath}`);
        return { stocks: [], industries: {}, posts: [], authors: [], stats: {} };
    }
    try {
        const content = await readFile(postsJsonPath, "utf8");
        return JSON.parse(content);
    } catch (error) {
        console.warn(`Failed to parse posts.json: ${error.message}`);
        return { stocks: [], industries: {}, posts: [], authors: [], stats: {} };
    }
}

async function buildLongPostDataset(postsJsonData) {
    const sourcePosts = Array.isArray(postsJsonData.posts) ? postsJsonData.posts : [];
    const longPostCandidates = dedupeLongPosts(sourcePosts.filter(isOriginalLongPost));
    const longPosts = longPostCandidates.filter(isPublishableFullLongPost);
    const summaries = [];
    const authorMap = new Map();

    for (const post of longPosts) {
        const id = stablePostId(post);
        const detailFileName = `${id}.json`;
        const detailUrl = `data/long-posts/posts/${detailFileName}`;
        const content = String(post.content || "").trim();
        const summary = {
            id,
            author: normalizeAuthor(post.author),
            title: post.title || titleFromArticle(authorName(post), post.created_at || "", content, id),
            summary: shortSummary(post.content_preview || content, 220),
            content_preview: shortSummary(post.content_preview || content, 220),
            created_at: post.created_at || "",
            timestamp: Number(post.timestamp || 0),
            likes: Number(post.likes || 0),
            comments: Number(post.comments || 0),
            reposts: Number(post.reposts || 0),
            url: post.url || post.link || "",
            detail_url: detailUrl,
            characters: content.length,
            stocks: Array.isArray(post.stocks) ? post.stocks : [],
            has_images: Boolean(post.has_images),
            attachments: Array.isArray(post.attachments) ? post.attachments : [],
            content_status: inferContentStatus(content)
        };

        summaries.push(summary);
        updateLongAuthor(authorMap, summary);

        await writeFile(
            path.join(longPostDetailsRoot, detailFileName),
            JSON.stringify({
                ...summary,
                content,
                paragraphs: splitArticleParagraphs(content),
                source: "posts.json"
            }, null, 2),
            "utf8"
        );
    }

    const index = {
        version: "3.0",
        source: "posts.json:original_long",
        updated_at: postsJsonData.updated_at || new Date().toLocaleString("zh-CN", { hour12: false }),
        stats: {
            total_long_posts: summaries.length,
            source_long_posts: longPostCandidates.length,
            total_authors: authorMap.size,
            incomplete_long_posts: longPostCandidates.length - summaries.length
        },
        authors: Array.from(authorMap.values()).sort((a, b) => b.long_post_count - a.long_post_count),
        posts: summaries.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    };

    await writeFile(path.join(longPostsRoot, "index.json"), JSON.stringify(index, null, 2), "utf8");
    return { index };
}

function isOriginalLongPost(post) {
    return post?.post_type === "original_long" || post?.is_long_post === true;
}

function isPublishableFullLongPost(post) {
    return inferContentStatus(post?.content || "") === "complete";
}

function dedupeLongPosts(posts) {
    const grouped = new Map();
    for (const post of posts) {
        const key = longDuplicateKey(post);
        const current = grouped.get(key);
        if (!current || longPostQuality(post) > longPostQuality(current)) {
            grouped.set(key, post);
        }
    }
    return Array.from(grouped.values());
}

function longDuplicateKey(post) {
    const author = normalizeAuthor(post.author).id || normalizeAuthor(post.author).name;
    const title = normalizedText(post.title || "");
    const content = normalizedText(post.content || "");
    return [author, title, content.slice(0, 220)].join("|");
}

function longPostQuality(post) {
    const content = String(post.content || "");
    const interactions = Number(post.likes || 0) + Number(post.comments || 0) + Number(post.reposts || 0);
    const url = post.url || post.link || "";
    const complete = inferContentStatus(content) === "complete" ? 1 : 0;
    const realUrl = /xueqiu\.com\/\d+\/\d+/.test(url) ? 1 : 0;
    return content.length * 1000 + interactions + complete * 100 + realUrl * 10;
}

function updateLongAuthor(map, post) {
    const name = post.author.name || "未知投资者";
    const id = post.author.id || "";
    const key = id || name;
    const current = map.get(key) || {
        name,
        id,
        post_count: 0,
        long_post_count: 0,
        interactions: 0
    };
    current.post_count += 1;
    current.long_post_count += 1;
    current.interactions += Number(post.likes || 0) + Number(post.comments || 0) + Number(post.reposts || 0);
    map.set(key, current);
}

function normalizeAuthor(author) {
    if (typeof author === "string") return { name: author || "未知投资者", id: "" };
    return {
        name: author?.name || "未知投资者",
        id: String(author?.id || "")
    };
}

function stablePostId(post) {
    const raw = String(post.id || post.url || `${authorName(post)}-${post.created_at || ""}-${post.title || ""}`);
    const safe = raw.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    return safe || `post-${Math.abs(hashCode(raw))}`;
}

function inferContentStatus(content) {
    const text = String(content || "").trim();
    if (!text) return "missing";
    if (/[.。…]{3,}\s*$/.test(text) || text.endsWith("...") || text.includes("...")) return "preview_only";
    if (text.length < 600) return "too_short";
    return "complete";
}

function normalizedText(value) {
    return String(value || "")
        .replace(/[\ue000-\uf8ff]/g, "")
        .replace(/\s+/g, "")
        .replace(/[.。…]{3,}/g, "")
        .trim();
}

function stripPostsPayload(postsJsonData) {
    const { posts, ...rest } = postsJsonData || {};
    return {
        ...rest,
        posts: []
    };
}

function buildXueqiu(postsJsonData, outputFiles) {
    const dailyFiles = outputFiles.filter((item) => item.relative.includes("爬虫/日报/原始内容") && item.name.endsWith(".json"));
    const longTexts = outputFiles.filter((item) => item.relative.includes("爬虫/投资者") && item.name.endsWith(".txt"));
    const investorMap = new Map();
    const sourcePosts = Array.isArray(postsJsonData.posts) ? postsJsonData.posts : [];
    const posts = sourcePosts.map((post) => {
        const name = authorName(post);
        const key = investorKey(name);
        const current = ensureInvestor(investorMap, name, key);
        const likes = Number(post.likes || 0);
        const comments = Number(post.comments || 0);
        const reposts = Number(post.reposts || 0);
        current.count += 1;
        current.interactions += likes + comments + reposts;
        current.longArticleCount += 1;

        return {
            id: post.id || "",
            investor: name,
            investorKey: key,
            sourceDate: String(post.created_at || post.time || "").slice(0, 10),
            dateTime: post.created_at || post.time || "",
            time: post.created_at || post.time || "",
            title: post.title || "",
            text: post.content_preview || post.summary || "",
            link: post.url || post.link || post.detail_url || "",
            detailUrl: post.detail_url || "",
            likes,
            comments,
            reposts
        };
    });

    const longArticles = sourcePosts
        .map((post) => {
            const name = authorName(post);
            const key = investorKey(name);
            const body = String(post.content_preview || post.summary || "");
            const createdAt = post.created_at || post.time || "";
            return {
                id: post.id || `${key}-${createdAt}`,
                investor: name,
                investorKey: key,
                title: post.title || titleFromArticle(name, createdAt, body, post.id),
                summary: shortSummary(post.content_preview || body, 120),
                text: shortSummary(body, 220),
                paragraphs: [],
                time: createdAt,
                dateTime: createdAt,
                characters: Number(post.characters || body.length),
                likes: Number(post.likes || 0),
                comments: Number(post.comments || 0),
                link: post.url || post.link || "",
                url: post.url || post.link || "",
                detailUrl: post.detail_url || ""
            };
        });

    return {
        investors: Array.from(investorMap.values()).sort(sortInvestors),
        posts: posts.sort((a, b) => String(b.dateTime || "").localeCompare(String(a.dateTime || ""))),
        longArticles: longArticles.sort((a, b) => String(b.dateTime || "").localeCompare(String(a.dateTime || ""))),
        dailyFiles,
        longTexts
    };
}

function authorName(post) {
    if (!post || !post.author) return post.investor || "未知投资者";
    if (typeof post.author === "string") return post.author || "未知投资者";
    return post.author.name || post.investor || "未知投资者";
}

function ensureInvestor(map, name, key) {
    if (!map.has(key)) {
        map.set(key, {
            name,
            key,
            slug: slugify(key),
            initial: initialFromName(name),
            count: 0,
            longArticleCount: 0,
            interactions: 0
        });
    }
    return map.get(key);
}

async function parseLongArticleFile(file, investor, investorKeyValue) {
    const buffer = await readFile(file.source);
    const text = decodeText(buffer).replace(/\r/g, "");
    const chunks = text.split(/\n={10,}\n/).map((chunk) => chunk.trim()).filter(Boolean);
    const articles = [];

    for (let i = 0; i < chunks.length; i += 2) {
        const meta = chunks[i] || "";
        const body = chunks[i + 1] || "";
        if (!meta.includes("长帖子") || !body.trim()) continue;

        const id = matchOne(meta, /ID:\s*(\d+)/);
        const time = matchOne(meta, /时间:\s*([^\n|]+)/)?.trim() || "";
        const characters = Number(matchOne(meta, /字数:\s*(\d+)/) || body.length);
        const likes = Number(matchOne(meta, /👍\s*(\d+)/) || 0);
        const comments = Number(matchOne(meta, /💬\s*(\d+)/) || 0);
        const link = matchOne(meta, /链接:\s*(https?:\/\/\S+)/) || "";
        const cleanBody = body.replace(/\n={10,}$/g, "").trim();
        const firstLine = cleanBody.split(/\n/).find(Boolean) || "";
        const title = titleFromArticle(investor, time, cleanBody, id);
        const summary = shortSummary(firstLine || cleanBody, 120);

        articles.push({
            id: id || `${investorKeyValue}-${articles.length + 1}`,
            investor,
            investorKey: investorKeyValue,
            title,
            summary,
            text: cleanBody,
            paragraphs: splitArticleParagraphs(cleanBody),
            time,
            dateTime: normalizeDateTime(time),
            characters,
            likes,
            comments,
            link,
            url: file.url
        });
    }

    return articles;
}

async function buildStocks(sourceFiles) {
    const watchlistFile = sourceFiles.find((item) => item.name === "我的自选股.csv");
    const watchlist = watchlistFile ? await parseWatchlist(watchlistFile.source) : [];
    const industryFiles = sourceFiles.filter((item) => item.name !== "我的自选股.csv").map((item) => ({
        title: item.title,
        name: item.name,
        category: "股票行业分类",
        url: item.url,
        size: item.size,
        updatedAt: item.updatedAt
    }));

    return { watchlist, industryFiles };
}

async function parseWatchlist(file) {
    const buffer = await readFile(file);
    const text = decodeText(buffer);
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const result = [];
    let group = "未分类";

    for (const line of lines.slice(1)) {
        const cells = splitCsvLine(line);
        const name = (cells[0] || "").trim();
        const code = (cells[1] || "").trim();
        if (!name) continue;
        if (!code) {
            group = name.replace(/[【】—\-\s]/g, "") || group;
            continue;
        }
        result.push({
            name,
            code,
            group,
            expected: cells[2] || "",
            plan: cells[3] || "",
            note: cells[4] || "",
            reportDate: cells[5] || ""
        });
    }

    return result;
}

function splitCsvLine(line) {
    const cells = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (char === "\"") {
            quoted = !quoted;
        } else if (char === "," && !quoted) {
            cells.push(current);
            current = "";
        } else {
            current += char;
        }
    }
    cells.push(current);
    return cells;
}

function stripInternalSources(xueqiu) {
    return {
        ...xueqiu,
        dailyFiles: xueqiu.dailyFiles.map(stripSource),
        longTexts: xueqiu.longTexts.map(stripSource)
    };
}

function stripSource(item) {
    const { source, ...publicItem } = item;
    return publicItem;
}

function decodeText(buffer) {
    const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    if ((utf8.match(/\uFFFD/g) || []).length < 3 && !/[锟斤拷]/.test(utf8.slice(0, 200))) return utf8;
    return new TextDecoder("gb18030").decode(buffer);
}

function categoryFromRelative(relative) {
    if (relative.includes("策略研究")) return "策略研究";
    if (relative.includes("爬虫")) return "爬取内容";
    if (relative.includes("其他")) return "其他";
    return "研究文件";
}

function quantGroupFromRelative(relative) {
    const text = relative.toLowerCase();
    if (text.includes("pairs")) return "配对交易";
    if (text.includes("zscore") || text.includes("arbitrage")) return "距离Z分数套利";
    if (text.includes("财报")) return "财报影响";
    if (text.includes("dynamic")) return "动态轮动";
    if (text.includes("rotation")) return "多股票轮动";
    return "其他";
}

function investorNameFromLongTextFile(name) {
    return stripExtension(name).replace(/^_+/, "").replace(/最长帖子_全文$/, "") || "未知投资者";
}

function investorKey(name) {
    return String(name || "未知投资者").trim().toLowerCase();
}

function initialFromName(name) {
    const first = String(name || "").trim()[0] || "#";
    if (/^[a-z]$/i.test(first)) return first.toUpperCase();
    if (/^\d$/.test(first)) return "#";
    return pinyinInitialFor(first) || "#";
}

function pinyinInitialFor(char) {
    return {
        亲: "Q", 财: "C", 重: "Z", 产: "C", 睿: "R", 股: "G", 翻: "F", 润: "R",
        孤: "G", 黑: "H", 凝: "N",
        张: "Z", 王: "W", 李: "L", 赵: "Z", 陈: "C", 刘: "L", 杨: "Y", 黄: "H",
        周: "Z", 吴: "W", 徐: "X", 孙: "S", 胡: "H", 朱: "Z", 高: "G", 林: "L",
        何: "H", 郭: "G", 马: "M", 罗: "L", 梁: "L", 宋: "S", 郑: "Z", 谢: "X",
        韩: "H", 唐: "T", 冯: "F", 于: "Y", 董: "D", 萧: "X", 程: "C", 曹: "C",
        袁: "Y", 邓: "D", 许: "X", 傅: "F", 沈: "S", 曾: "Z", 彭: "P", 吕: "L",
        苏: "S", 卢: "L", 蒋: "J", 蔡: "C", 贾: "J", 丁: "D", 魏: "W", 薛: "X",
        叶: "Y", 阎: "Y", 余: "Y", 潘: "P", 杜: "D", 戴: "D", 夏: "X", 钟: "Z",
        汪: "W", 田: "T", 任: "R", 姜: "J", 范: "F", 方: "F", 石: "S", 姚: "Y",
        谭: "T", 廖: "L", 邹: "Z", 熊: "X", 金: "J", 陆: "L", 郝: "H", 孔: "K",
        白: "B", 崔: "C", 康: "K", 毛: "M", 邱: "Q", 秦: "Q", 江: "J", 史: "S",
        顾: "G", 侯: "H", 邵: "S", 孟: "M", 龙: "L", 万: "W", 段: "D", 雷: "L",
        钱: "Q", 汤: "T", 尹: "Y", 黎: "L", 易: "Y", 常: "C", 武: "W", 乔: "Q",
        贺: "H", 赖: "L", 龚: "G", 文: "W"
    }[char];
}

function sortInvestors(a, b) {
    const initial = String(a.initial || "#").localeCompare(String(b.initial || "#"));
    if (initial) return initial;
    return String(a.name || "").localeCompare(String(b.name || ""), "zh-CN");
}

function titleFromArticle(investor, time, body, id) {
    const date = String(time || "").slice(0, 10);
    const lead = shortSummary(body, 34).replace(/[。！？].*$/, "");
    return `${investor}长文${date ? ` · ${date}` : ""}${lead ? `：${lead}` : id ? ` #${id}` : ""}`;
}

function splitArticleParagraphs(text) {
    const cleaned = String(text || "").replace(/\r/g, "").trim();
    if (!cleaned) return [];
    const withBreaks = cleaned.replace(/(?<!\d)(?=\d{1,2}[、.])/g, "\n");
    return withBreaks.split(/\n{1,}/).map((line) => line.trim()).filter(Boolean);
}

function normalizeDateTime(time) {
    return String(time || "").replace(/[年月]/g, "-").replace("日", "").trim();
}

function shortSummary(text, max) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

function matchOne(text, pattern) {
    return text.match(pattern)?.[1] || "";
}

function encodePath(relative) {
    return relative.split("/").map(encodeURIComponent).join("/");
}

function stripExtension(name) {
    return name.replace(/\.[^.]+$/, "");
}

function slugify(value) {
    return encodeURIComponent(String(value || "item").replace(/\s+/g, "-"));
}

function hashCode(value) {
    let hash = 0;
    const text = String(value || "");
    for (let i = 0; i < text.length; i += 1) {
        hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    return hash;
}

function sortByUpdated(a, b) {
    return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
}

async function exists(file) {
    try {
        await stat(file);
        return true;
    } catch {
        return false;
    }
}
