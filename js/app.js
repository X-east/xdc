document.addEventListener("DOMContentLoaded", async () => {
    setupNavigation();
    setupTabs();

    const data = await SiteData.load();
    renderHero(data);
    renderInvestment(data);
    renderLinks(data.links || []);
    renderArchive(data);
    setText("lastUpdated", `最后更新：${data.generatedAt || "--"}`);
});

function setupNavigation() {
    const toggle = $(".nav-toggle");
    const links = $(".nav-links");
    if (!toggle || !links) return;

    toggle.addEventListener("click", () => {
        const open = links.classList.toggle("open");
        toggle.setAttribute("aria-expanded", String(open));
    });

    links.addEventListener("click", (event) => {
        if (event.target.matches("a")) {
            links.classList.remove("open");
            toggle.setAttribute("aria-expanded", "false");
        }
    });
}

function setupTabs() {
    $$(".tab").forEach((tab) => {
        tab.addEventListener("click", () => activateTab(tab.dataset.tab));
    });

    const hash = window.location.hash.replace("#", "");
    if (["investors", "stocks", "portfolios", "quant"].includes(hash)) {
        activateTab(hash);
    }
}

function activateTab(name) {
    $$(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
    $$(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `panel-${name}`));
}

function renderHero(data) {
    const stats = [
        ["雪球帖子", data.summary?.postCount || 0],
        ["投资者", data.summary?.investorCount || 0],
        ["研究文件", data.summary?.artifactCount || 0],
        ["自选股", data.summary?.watchlistCount || 0]
    ];

    $("#heroStats").innerHTML = stats.map(([label, value]) => `
        <div class="metric">
            <strong>${formatNumber(value)}</strong>
            <span>${label}</span>
        </div>
    `).join("");
}

function renderInvestment(data) {
    renderXueqiu(data.xueqiu || {});
    renderStocks(data.stocks || {});
    renderPortfolios(data.artifacts || []);
    renderQuant(data.artifacts || []);
}

function renderXueqiu(xueqiu) {
    const posts = xueqiu.posts || [];
    const investors = xueqiu.investors || [];
    setText("xueqiuCount", `${formatNumber(posts.length)} 条`);

    $("#xueqiuPosts").innerHTML = posts.length ? posts.slice(0, 12).map((post) => `
        <article class="feed-card">
            <div class="feed-title">
                <span>${escapeHtml(post.title || post.investor || "雪球观点")}</span>
                <span class="tag">${escapeHtml(post.sourceDate || "")}</span>
            </div>
            <div class="feed-meta">
                <span>${escapeHtml(post.investor || "未知投资者")}</span>
                <span>${escapeHtml(post.time || "")}</span>
                <span>赞 ${formatNumber(post.likes)}</span>
                <span>评 ${formatNumber(post.comments)}</span>
            </div>
            <div class="feed-preview">${escapeHtml(shortText(post.text, 220))}</div>
            ${post.link ? `<div class="feed-actions"><a class="text-link" href="${escapeHtml(post.link)}" target="_blank" rel="noopener">查看原文</a></div>` : ""}
        </article>
    `).join("") : emptyState("还没有可展示的雪球帖子。");

    $("#investorList").innerHTML = investors.length ? investors.slice(0, 12).map((item) => `
        <div class="compact-item">
            <strong>${escapeHtml(item.name)}</strong>
            <span>${formatNumber(item.count)} 条内容，互动 ${formatNumber(item.interactions)}</span>
        </div>
    `).join("") : emptyState("暂无投资者统计。");
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
        ${watchlist.slice(0, 80).map((stock) => `
            <div class="stock-row">
                <strong>${escapeHtml(stock.name)}</strong>
                <span>${escapeHtml(stock.code || "--")}</span>
                <span>${escapeHtml(stock.group || "未分类")}</span>
            </div>
        `).join("")}
    ` : emptyState("还没有读取到自选股。");

    $("#industryFiles").innerHTML = industryFiles.length ? industryFiles.slice(0, 12).map(fileLink).join("") : emptyState("暂无行业资料。");
}

function renderPortfolios(artifacts) {
    const portfolioItems = artifacts.filter((item) => /rotation|portfolio|final|result|pairs|backtest/i.test(item.name));
    setText("portfolioCount", `${formatNumber(portfolioItems.length)} 项`);
    $("#portfolioItems").innerHTML = portfolioItems.length ? portfolioItems.slice(0, 9).map(artifactCard).join("") : emptyState("暂无组合记录。");
}

function renderQuant(artifacts) {
    const quantImages = artifacts.filter((item) => item.category === "策略研究" && isImage(item.url));
    const quantDocs = artifacts.filter((item) => item.category === "策略研究" && !isImage(item.url));
    setText("quantCount", `${formatNumber(quantImages.length + quantDocs.length)} 项`);
    $("#quantGallery").innerHTML = quantImages.length ? quantImages.slice(0, 9).map(artifactCard).join("") : emptyState("暂无量化图表。");
    $("#quantDocs").innerHTML = quantDocs.length ? quantDocs.slice(0, 14).map(fileLink).join("") : emptyState("暂无日志或结果表。");
}

function renderLinks(links) {
    const fallback = [
        {
            title: "紫金矿业官网",
            url: "https://www.zijinmining.com/",
            description: "公司公告、业务布局和投资者关系。"
        },
        {
            title: "国际铜研究小组",
            url: "https://icsg.org/",
            description: "全球铜矿、精炼铜和消费数据。"
        }
    ];

    const items = links.length ? links : fallback;
    $("#websiteLinks").innerHTML = items.map((link) => `
        <article class="resource-card">
            <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener">
                <strong>${escapeHtml(link.title)}</strong>
                <p>${escapeHtml(link.description || link.url)}</p>
            </a>
        </article>
    `).join("");
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

function emptyState(text) {
    return `<div class="empty">${escapeHtml(text)}</div>`;
}
