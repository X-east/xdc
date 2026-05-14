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
await mkdir(publicOutputRoot, { recursive: true });
await mkdir(publicDataRoot, { recursive: true });

const outputFiles = await copyPublishableFiles(outputRoot, publicOutputRoot, "assets/output", "输出");
const sourceFiles = await copySelectedSourceData(sourceDataRoot, publicDataRoot, "assets/source-data");
const xueqiu = await buildXueqiu(outputFiles);
const stocks = await buildStocks(sourceFiles);
const artifacts = outputFiles
    .filter((item) => !item.relative.includes("爬虫/日报/原始内容"))
    .map((item) => ({
        name: item.name,
        category: categoryFromRelative(item.relative),
        url: item.url,
        size: item.size,
        updatedAt: item.updatedAt
    }))
    .sort(sortByUpdated);

const data = {
    generatedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
    summary: {
        postCount: xueqiu.posts.length,
        investorCount: xueqiu.investors.length,
        artifactCount: artifacts.length + stocks.industryFiles.length + xueqiu.dailyFiles.length + xueqiu.longTexts.length,
        watchlistCount: stocks.watchlist.length
    },
    xueqiu,
    stocks,
    artifacts,
    links
};

await writeFile(path.join(siteRoot, "data", "site-content.json"), JSON.stringify(data, null, 2), "utf8");
console.log(`Generated data/site-content.json with ${data.summary.artifactCount} published files.`);

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

async function buildXueqiu(outputFiles) {
    const dailyFiles = outputFiles.filter((item) => item.relative.includes("爬虫/日报/原始内容") && item.name.endsWith(".json"));
    const longTexts = outputFiles.filter((item) => item.relative.includes("爬虫/投资者") && item.name.endsWith(".txt"));
    const posts = [];
    const investorMap = new Map();

    for (const file of dailyFiles) {
        try {
            const raw = await readFile(file.source, "utf8");
            const json = JSON.parse(raw);
            const users = Array.isArray(json.users) ? json.users : [];
            for (const user of users) {
                const name = user.name || "未知投资者";
                const userPosts = Array.isArray(user.posts) ? user.posts : [];
                const current = investorMap.get(name) || { name, count: 0, interactions: 0 };
                current.count += userPosts.length;

                for (const post of userPosts) {
                    const likes = Number(post.likes || 0);
                    const comments = Number(post.cmts || post.comments || 0);
                    const reposts = Number(post.rpts || post.reposts || 0);
                    current.interactions += likes + comments + reposts;
                    posts.push({
                        investor: name,
                        sourceDate: json.date || "",
                        time: post.time || "",
                        title: post.title || "",
                        text: post.text_preview || post.text || "",
                        link: post.link || "",
                        likes,
                        comments,
                        reposts
                    });
                }

                investorMap.set(name, current);
            }
        } catch (error) {
            console.warn(`Skip invalid JSON: ${file.source}`, error.message);
        }
    }

    return {
        investors: Array.from(investorMap.values()).sort((a, b) => b.interactions - a.interactions),
        posts: posts.sort((a, b) => `${b.sourceDate} ${b.time}`.localeCompare(`${a.sourceDate} ${a.time}`)),
        dailyFiles,
        longTexts
    };
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

function encodePath(relative) {
    return relative.split("/").map(encodeURIComponent).join("/");
}

function stripExtension(name) {
    return name.replace(/\.[^.]+$/, "");
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
