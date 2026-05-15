document.addEventListener("DOMContentLoaded", async () => {
    setupNavigation();

    const data = await SiteData.load();
    renderHero(data);
    renderFavorites(data.links || []);
    renderInvestors(data.xueqiu || {});
    renderStocks(data.stocks || {});
    renderPortfolios(data.artifacts || []);
    renderQuant(data.artifacts || []);
    renderArchive(data);
    setText("lastUpdated", `最后更新：${data.generatedAt || "--"}`);
});

function setupNavigation() {
    const toggle = $(".nav-toggle");
    const links = $(".nav-links");
    const favoriteButton = $(".favorites-button");
    const favorites = $(".favorites");

    toggle?.addEventListener("click", () => {
        const open = links.classList.toggle("open");
        toggle.setAttribute("aria-expanded", String(open));
    });

    links?.addEventListener("click", (event) => {
        if (event.target.matches("a")) {
            links.classList.remove("open");
            toggle?.setAttribute("aria-expanded", "false");
            setActiveNav(event.target.getAttribute("href"));
        }
    });

    favoriteButton?.addEventListener("click", (event) => {
        event.stopPropagation();
        const open = favorites.classList.toggle("open");
        favoriteButton.setAttribute("aria-expanded", String(open));
    });

    document.addEventListener("click", (event) => {
        if (!favorites?.contains(event.target)) {
            favorites?.classList.remove("open");
            favoriteButton?.setAttribute("aria-expanded", "false");
        }
    });

    window.addEventListener("hashchange", () => setActiveNav(window.location.hash));
    setActiveNav(window.location.hash || "#investors");
}

function setActiveNav(hash) {
    $$(".nav-links a").forEach((link) => {
        link.classList.toggle("active", link.getAttribute("href") === hash);
    });
}

function renderHero(data) {
    const stats = [
        ["雪球帖子", data.summary?.postCount || 0],
        ["长文", data.summary?.longArticleCount || 0],
        ["投资者", data.summary?.investorCount || 0],
        ["自选股", data.summary?.watchlistCount || 0]
    ];

    $("#heroStats").innerHTML = stats.map(([label, value]) => `
        <div class="metric">
            <strong>${formatNumber(value)}</strong>
            <span>${label}</span>
        </div>
    `).join("");
}

function renderFavorites(links) {
    const container = $("#favoritesMenu");
    if (!container) return;

    container.innerHTML = links.map((link) => `
        <a class="favorite-link" href="${escapeHtml(link.url)}" target="_blank" rel="noopener">
            <strong>${escapeHtml(link.title)}</strong>
            <span>${escapeHtml(link.description || link.url)}</span>
        </a>
    `).join("");
}

function renderInvestors(xueqiu) {
    const investors = xueqiu.investors || [];
    const posts = xueqiu.posts || [];
    const longArticles = xueqiu.longArticles || [];
    const totalItems = posts.length + longArticles.length;

    setText("investorCount", `${formatNumber(investors.length)} 位`);
    setText("xueqiuCount", `${formatNumber(totalItems)} 条`);

    const sorted = [...investors].sort((a, b) => {
        const letterCompare = String(a.initial || "#").localeCompare(String(b.initial || "#"));
        if (letterCompare) return letterCompare;
        return String(a.name || "").localeCompare(String(b.name || ""), "zh-CN");
    });

    $("#investorIndex").innerHTML = sorted.length ? groupedInvestorIndex(sorted) : emptyState("暂无投资者。");
    $("#investorContent").innerHTML = sorted.length ? sorted.map((investor) => investorSection(investor, posts, longArticles)).join("") : emptyState("还没有可展示的爬取内容。");
}

function groupedInvestorIndex(investors) {
    const groups = groupBy(investors, (item) => item.initial || "#");
    return Object.entries(groups).map(([letter, list]) => `
        <div class="letter-group">
            <div class="letter">${escapeHtml(letter)}</div>
            <div class="letter-links">
                ${list.map((item) => `
                    <a href="#investor-${escapeHtml(item.slug)}">
                        <strong>${escapeHtml(item.name)}</strong>
                        <span>${formatNumber((item.count || 0) + (item.longArticleCount || 0))} 条</span>
                    </a>
                `).join("")}
            </div>
        </div>
    `).join("");
}

function investorSection(investor, posts, longArticles) {
    const investorPosts = posts.filter((post) => post.investorKey === investor.key);
    const articles = longArticles.filter((article) => article.investorKey === investor.key);
    const items = [
        ...articles.map((article) => ({ type: "article", item: article })),
        ...investorPosts.map((post) => ({ type: "post", item: post }))
    ].sort((a, b) => String(b.item.dateTime || "").localeCompare(String(a.item.dateTime || "")));

    return `
        <article class="investor-section" id="investor-${escapeHtml(investor.slug)}">
            <header class="investor-section-head">
                <div>
                    <span class="letter-badge">${escapeHtml(investor.initial || "#")}</span>
                    <h3>${escapeHtml(investor.name)}</h3>
                </div>
                <div class="investor-stats">
                    <span>${formatNumber(investor.count || 0)} 短帖</span>
                    <span>${formatNumber(investor.longArticleCount || 0)} 长文</span>
                    <span>互动 ${formatNumber(investor.interactions || 0)}</span>
                </div>
            </header>
            <div class="feed-list">
                ${items.length ? items.map(({ type, item }) => type === "article" ? longArticleCard(item) : postCard(item)).join("") : emptyState("暂无内容。")}
            </div>
        </article>
    `;
}

function longArticleCard(article) {
    const paragraphs = article.paragraphs || splitParagraphs(article.text);
    return `
        <article class="feed-card long-article-card">
            <div class="feed-title">
                <a class="article-title" href="${escapeHtml(article.link || article.url || "#")}" target="_blank" rel="noopener" title="${escapeHtml(article.summary || "")}">
                    ${escapeHtml(article.title || "长文")}
                </a>
                <span class="tag">长文</span>
            </div>
            <div class="feed-meta">
                <span>${escapeHtml(article.time || "")}</span>
                <span>${formatNumber(article.characters || 0)} 字</span>
                <span>赞 ${formatNumber(article.likes)}</span>
                <span>评 ${formatNumber(article.comments)}</span>
            </div>
            <p class="feed-preview">${escapeHtml(article.summary || "")}</p>
            <details class="article-reader">
                <summary>展开阅读全文</summary>
                <div class="article-body">
                    ${paragraphs.map((text) => `<p>${escapeHtml(text)}</p>`).join("")}
                </div>
            </details>
        </article>
    `;
}

function postCard(post) {
    const title = post.title || shortText(post.text, 34) || "雪球观点";
    return `
        <article class="feed-card">
            <div class="feed-title">
                <a class="article-title" href="${escapeHtml(post.link || "#")}" target="_blank" rel="noopener" title="${escapeHtml(shortText(post.text, 140))}">
                    ${escapeHtml(title)}
                </a>
                <span class="tag">${escapeHtml(post.sourceDate || "")}</span>
            </div>
            <div class="feed-meta">
                <span>${escapeHtml(post.time || "")}</span>
                <span>赞 ${formatNumber(post.likes)}</span>
                <span>评 ${formatNumber(post.comments)}</span>
                <span>转 ${formatNumber(post.reposts)}</span>
            </div>
            <div class="feed-preview">${escapeHtml(shortText(post.text, 220))}</div>
        </article>
    `;
}

function renderStocks(stocks) {
    const watchlist = stocks.watchlist || [];
    const industryFiles = stocks.industryFiles || [];
    setText("watchlistCount", `${formatNumber(watchlist.length)} 条`);

    $("#watchlist").innerHTML = watchlist.length ? `
        <div class="stock-row header">
            <span>名称</span>
            <span>代码</span>
            <span>分类</span>
        </div>
        ${watchlist.map((stock) => `
            <div class="stock-row">
                <strong>${escapeHtml(stock.name)}</strong>
                <span>${escapeHtml(stock.code || "--")}</span>
                <span>${escapeHtml(stock.group || "未分类")}</span>
            </div>
        `).join("")}
    ` : emptyState("还没有读取到自选股。");

    $("#industryFiles").innerHTML = industryFiles.length ? industryFiles.map(fileLink).join("") : emptyState("暂无行业资料。");
}

function renderPortfolios(artifacts) {
    const portfolioItems = artifacts.filter((item) => /rotation|portfolio|final|result|pairs|backtest/i.test(item.name));
    $("#portfolioItems").innerHTML = portfolioItems.length ? portfolioItems.map(artifactCard).join("") : emptyState("暂无组合记录。");
}

function renderQuant(artifacts) {
    const quantItems = artifacts.filter((item) => item.category === "策略研究");
    const groups = groupBy(quantItems, (item) => item.quantGroup || inferQuantGroup(item.name));
    const groupOrder = ["多股票轮动", "配对交易", "距离Z分数套利", "财报影响", "动态轮动", "其他"];

    $("#quantGroups").innerHTML = groupOrder
        .filter((name) => groups[name]?.length)
        .map((name) => quantGroupBlock(name, groups[name]))
        .join("") || emptyState("暂无量化研究输出。");
}

function quantGroupBlock(name, items) {
    const images = items.filter((item) => isImage(item.url));
    const docs = items.filter((item) => !isImage(item.url));
    return `
        <section class="quant-group">
            <div class="quant-group-head">
                <div>
                    <h3>${escapeHtml(name)}</h3>
                    <p>${escapeHtml(quantDescription(name))}</p>
                </div>
                <span class="count-pill">${formatNumber(items.length)} 项</span>
            </div>
            ${images.length ? `<div class="artifact-grid">${images.map(artifactCard).join("")}</div>` : ""}
            ${docs.length ? `<div class="link-list quant-docs">${docs.map(fileLink).join("")}</div>` : ""}
        </section>
    `;
}

function renderArchive(data) {
    const crawlItems = [
        ...(data.xueqiu?.dailyFiles || []),
        ...(data.xueqiu?.longTexts || [])
    ];
    $("#crawlArchive").innerHTML = crawlItems.length ? crawlItems.map(fileLink).join("") : emptyState("暂无爬取归档。");

    const allFiles = [
        ...(data.artifacts || []),
        ...(data.stocks?.industryFiles || []),
        ...(data.xueqiu?.dailyFiles || []),
        ...(data.xueqiu?.longTexts || [])
    ];
    $("#fileArchive").innerHTML = allFiles.length ? allFiles.map(fileLink).join("") : emptyState("暂无文件。");
}

function artifactCard(item) {
    if (isImage(item.url)) {
        return `
            <article class="artifact-card">
                <a class="has-image" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">
                    <img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.name)}">
                    <div class="artifact-body">
                        <strong>${escapeHtml(item.name)}</strong>
                        <p>${escapeHtml(item.category)} · ${fileSize(item.size)}</p>
                    </div>
                </a>
            </article>
        `;
    }

    return `
        <article class="artifact-card">
            <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">
                <strong>${escapeHtml(item.name)}</strong>
                <p>${escapeHtml(item.category)} · ${fileSize(item.size)}</p>
            </a>
        </article>
    `;
}

function fileLink(item) {
    return `
        <a class="link-item" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">
            <strong>${escapeHtml(item.title || item.name)}</strong>
            <span>${escapeHtml(item.category || item.type || "文件")} · ${fileSize(item.size)}</span>
        </a>
    `;
}

function groupBy(items, getKey) {
    return items.reduce((groups, item) => {
        const key = getKey(item) || "其他";
        groups[key] = groups[key] || [];
        groups[key].push(item);
        return groups;
    }, {});
}

function splitParagraphs(text) {
    const cleaned = String(text || "").replace(/\r/g, "").trim();
    if (!cleaned) return [];
    const withBreaks = cleaned.replace(/(?<!\d)(?=\d{1,2}[、.])/g, "\n");
    return withBreaks.split(/\n{1,}/).map((line) => line.trim()).filter(Boolean);
}

function inferQuantGroup(name) {
    const text = String(name || "").toLowerCase();
    if (text.includes("pairs")) return "配对交易";
    if (text.includes("zscore") || text.includes("arbitrage")) return "距离Z分数套利";
    if (text.includes("财报")) return "财报影响";
    if (text.includes("rotation")) return "多股票轮动";
    if (text.includes("dynamic")) return "动态轮动";
    return "其他";
}

function quantDescription(name) {
    const descriptions = {
        "多股票轮动": "观察多标的轮动策略在不同参数和时期下的表现。",
        "配对交易": "记录价差、协整或相对强弱类交易结果。",
        "距离Z分数套利": "围绕距离和 Z-score 信号的套利回测。",
        "财报影响": "研究财报事件对价格和走势的影响。",
        "动态轮动": "动态权重、动量或趋势轮动类策略输出。",
        "其他": "其他量化实验和临时结果。"
    };
    return descriptions[name] || descriptions["其他"];
}

function emptyState(text) {
    return `<div class="empty">${escapeHtml(text)}</div>`;
}
