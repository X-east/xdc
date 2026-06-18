const DATA_URL = "data/site-content.json";
const POSTS_PER_PAGE = 10;

let data = null;
let currentMode = "stock";
let currentPage = 1;
let sortBy = "time";
let selectedInvestors = [];
let selectedStocks = [];
let selectedIndustryL1 = null;
let selectedIndustryL2 = null;
let contentFilter = "all";

async function init() {
    data = await fetch(DATA_URL).then(r => r.json());

    const investors = getAllInvestors();
    selectedInvestors = investors.map(i => i.name);

    const stocks = data.postsJson?.stocks || [];
    selectedStocks = stocks.map(s => s.code);

    renderStats();
    renderModeTabs();
    renderContentFilter();
    renderIndustryFilter();
    if (currentMode === "stock") {
        renderInvestorFilter();
    } else {
        renderStockFilter();
    }
    renderPosts();

    document.getElementById("sort-select").addEventListener("change", (e) => {
        sortBy = e.target.value;
        resetPage();
        renderPosts();
    });
}

function renderStats() {
    const summary = data.summary;
    document.getElementById("stat-posts").textContent = summary.postCount || 0;
    document.getElementById("stat-investors").textContent = summary.investorCount || 0;
    document.getElementById("stat-long").textContent = summary.longArticleCount || 0;
    document.getElementById("stat-stocks").textContent = data.postsJson?.stocks?.length || 0;
    document.getElementById("stat-industries").textContent = Object.keys(data.postsJson?.industries || {}).length;
    document.getElementById("gen-time").textContent = data.generatedAt || "-";
}

function renderModeTabs() {
    const tabs = document.getElementById("mode-tabs");
    tabs.addEventListener("click", (e) => {
        if (e.target.classList.contains("tab-btn")) {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            currentMode = e.target.dataset.mode;
            updateFilterLayout();
            renderPosts();
        }
    });
}

function updateFilterLayout() {
    const filterSection = document.getElementById("filter-section");
    if (currentMode === "stock") {
        filterSection.innerHTML = `
            <div class="filter-group">
                <h3>投资者</h3>
                <div id="investor-filter" class="filter-chips"></div>
            </div>
            <div class="filter-group">
                <h3>内容类型</h3>
                <div id="content-filter" class="filter-chips"></div>
            </div>
            <div class="filter-group">
                <h3>行业分类</h3>
                <div id="industry-filter" class="filter-chips"></div>
            </div>
        `;
        renderInvestorFilter();
    } else {
        filterSection.innerHTML = `
            <div class="filter-group">
                <h3>内容类型</h3>
                <div id="content-filter" class="filter-chips"></div>
            </div>
            <div class="filter-group">
                <h3>股票</h3>
                <div id="stock-filter" class="filter-chips"></div>
            </div>
            <div class="filter-group">
                <h3>行业分类</h3>
                <div id="industry-filter" class="filter-chips"></div>
            </div>
        `;
        renderStockFilter();
    }
    renderContentFilter();
    renderIndustryFilter();
}

function renderContentFilter() {
    const container = document.getElementById("content-filter");
    container.innerHTML = `
        <button class="filter-chip ${contentFilter === "all" ? "active" : ""}" data-filter="all">全部</button>
        <button class="filter-chip ${contentFilter === "stocked" ? "active" : ""}" data-filter="stocked">含股票</button>
        <button class="filter-chip ${contentFilter === "image" ? "active" : ""}" data-filter="image">含图</button>
    `;
    container.onclick = (e) => {
        if (e.target.classList.contains("filter-chip")) {
            contentFilter = e.target.dataset.filter;
            renderContentFilter();
            resetPage();
            renderPosts();
        }
    };
}

function renderInvestorFilter() {
    const container = document.getElementById("investor-filter");
    const investors = getAllInvestors();
    const allSelected = investors.length > 0 && selectedInvestors.length === investors.length;

    container.innerHTML = `
        <button class="filter-chip ${allSelected ? "active" : ""}" data-investor="all">全选 (${investors.length})</button>
        ${investors.map(inv => `
            <button class="filter-chip ${selectedInvestors.includes(inv.name) ? "active" : ""}" data-investor="${inv.name}">
                ${inv.name}
            </button>
        `).join("")}
    `;
    container.onclick = (e) => {
        if (e.target.classList.contains("filter-chip")) {
            const name = e.target.dataset.investor;
            if (name === "all") {
                selectedInvestors = allSelected ? [] : investors.map(i => i.name);
            } else {
                const idx = selectedInvestors.indexOf(name);
                if (idx > -1) {
                    selectedInvestors.splice(idx, 1);
                } else {
                    selectedInvestors.push(name);
                }
            }
            renderInvestorFilter();
            resetPage();
            renderPosts();
        }
    };
}

function getAllInvestors() {
    const map = new Map();
    (data.articleIndex?.authors || []).forEach(inv => {
        map.set(inv.name, {
            name: inv.name,
            count: inv.long_post_count || inv.post_count || 0,
            longArticleCount: inv.long_post_count || 0
        });
    });
    (data.postsJson?.authors || []).forEach(author => {
        const current = map.get(author.name) || { name: author.name, count: 0, longArticleCount: 0 };
        map.set(author.name, {
            ...current,
            count: Math.max(current.count || 0, author.post_count || 0),
            longArticleCount: Math.max(current.longArticleCount || 0, author.long_post_count || 0)
        });
    });
    return Array.from(map.values()).sort((a, b) => (b.count || 0) - (a.count || 0));
}

function renderStockFilter() {
    const container = document.getElementById("stock-filter");
    const stocks = data.postsJson?.stocks || [];
    const allSelected = stocks.length > 0 && selectedStocks.length === stocks.length;

    container.innerHTML = `
        <button class="filter-chip ${allSelected ? "active" : ""}" data-stock="all">全选 (${stocks.length})</button>
        ${stocks.map(stock => `
            <button class="filter-chip ${selectedStocks.includes(stock.code) ? "active" : ""}" data-stock="${stock.code}" title="${stock.name}">
                ${stock.name}
            </button>
        `).join("")}
    `;
    container.onclick = (e) => {
        if (e.target.classList.contains("filter-chip")) {
            const code = e.target.dataset.stock;
            if (code === "all") {
                selectedStocks = allSelected ? [] : stocks.map(s => s.code);
            } else {
                const idx = selectedStocks.indexOf(code);
                if (idx > -1) {
                    selectedStocks.splice(idx, 1);
                } else {
                    selectedStocks.push(code);
                }
            }
            renderStockFilter();
            resetPage();
            renderPosts();
        }
    };
}

function renderIndustryFilter() {
    const container = document.getElementById("industry-filter");
    const industries = data.postsJson?.industries || {};

    const l1Options = Object.keys(industries);
    const subIndustries = selectedIndustryL1 && industries[selectedIndustryL1]
        ? Object.keys(industries[selectedIndustryL1].level2 || {})
        : [];

    let html = '<div class="filter-chips">';
    html += `<button class="filter-chip ${!selectedIndustryL1 ? "active" : ""}" data-l1="">全行业</button>`;
    l1Options.forEach(l1 => {
        html += `<button class="filter-chip ${selectedIndustryL1 === l1 ? "active" : ""}" data-l1="${l1}">${l1}</button>`;
    });
    html += '</div>';

    if (subIndustries.length > 0) {
        html += '<div class="filter-chips" style="margin-top:8px;padding-left:16px;">';
        html += `<button class="filter-chip ${!selectedIndustryL2 ? "active" : ""}" data-l2="">全部细分</button>`;
        subIndustries.forEach(l2 => {
            html += `<button class="filter-chip ${selectedIndustryL2 === l2 ? "active" : ""}" data-l2="${l2}">${l2}</button>`;
        });
        html += '</div>';
    }

    container.innerHTML = html;
    container.onclick = (e) => {
        if (e.target.classList.contains("filter-chip")) {
            if (e.target.dataset.l1 !== undefined) {
                selectedIndustryL1 = e.target.dataset.l1 || null;
                selectedIndustryL2 = null;
            } else if (e.target.dataset.l2 !== undefined) {
                selectedIndustryL2 = e.target.dataset.l2 || null;
            }
            renderIndustryFilter();
            resetPage();
            renderPosts();
        }
    };
}

function resetPage() {
    currentPage = 1;
}

function getAuthorName(post) {
    if (!post.author) return "未知";
    if (typeof post.author === "string") return post.author;
    return post.author.name || "未知";
}

function getFilteredPosts() {
    const posts = data.articleIndex?.posts || [];

    return posts.filter(post => {
        const authorName = getAuthorName(post);
        if (selectedInvestors.length > 0 && !selectedInvestors.includes(authorName)) {
            return false;
        }

        if (selectedStocks.length > 0) {
            const postStockCodes = post.stocks?.map(s => s.code) || [];
            const hasMatch = postStockCodes.some(code => selectedStocks.includes(code));
            if (!hasMatch) return false;
        }

        if (selectedIndustryL1) {
            const postIndustries = post.stocks?.map(s => s.industry?.level1).filter(Boolean) || [];
            if (!postIndustries.includes(selectedIndustryL1)) return false;

            if (selectedIndustryL2) {
                const postL2 = post.stocks?.map(s => s.industry?.level2).filter(Boolean) || [];
                if (!postL2.includes(selectedIndustryL2)) return false;
            }
        }

        if (contentFilter === "stocked") {
            return (post.stocks || []).length > 0;
        } else if (contentFilter === "image") {
            return post.has_images === true;
        }

        return true;
    });
}

function sortPosts(posts) {
    const sorted = [...posts];
    switch (sortBy) {
        case "time":
            return sorted.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        case "likes":
            return sorted.sort((a, b) => (b.likes || 0) - (a.likes || 0));
        case "relevance":
            return sorted.sort((a, b) => {
                let scoreA = 0;
                let scoreB = 0;
                scoreA += (a.likes || 0) * 0.1;
                scoreB += (b.likes || 0) * 0.1;
                scoreA += (a.stocks?.length || 0) * 10;
                scoreB += (b.stocks?.length || 0) * 10;
                return scoreB - scoreA;
            });
        default:
            return sorted;
    }
}

function renderPosts() {
    const posts = sortPosts(getFilteredPosts());
    const total = posts.length;
    const start = (currentPage - 1) * POSTS_PER_PAGE;
    const end = start + POSTS_PER_PAGE;
    const pagePosts = posts.slice(start, end);

    const container = document.getElementById("posts-container");
    const pagination = document.getElementById("pagination");

    if (total === 0) {
        container.innerHTML = `<div class="empty-state">暂无符合条件的帖子</div>`;
        pagination.innerHTML = "";
        document.getElementById("result-count").textContent = "共 0 条结果";
        return;
    }

    container.innerHTML = pagePosts.map(post => `
        <div class="post-card">
            <div class="post-header">
                <span class="post-author">${getAuthorName(post)}</span>
                <span class="post-time">${post.created_at || ""}</span>
                <span class="post-badge long">${post.has_images ? "含图" : "索引"}</span>
            </div>
            <h3 class="post-title">${post.title || "无标题"}</h3>
            <p class="post-content">${truncateContent(post.content_preview || post.summary, 200)}</p>
            <div class="post-meta">
                ${(post.stocks || []).map(s => `<span class="stock-tag" title="${s.code}">${s.name}</span>`).join("")}
                ${[...new Set((post.stocks || []).map(s => s.industry?.level1).filter(Boolean))]
                    .map(ind => `<span class="industry-tag">${ind}</span>`).join("")}
            </div>
            <div class="post-stats">
                <span class="stat-item">👍 ${post.likes || 0}</span>
                <span class="stat-item">💬 ${post.comments || 0}</span>
                <span class="stat-item">🔗 ${post.reposts || 0}</span>
                ${post.url ? `<a class="text-button source-link" href="${post.url}" target="_blank" rel="noreferrer">打开原文</a>` : ""}
            </div>
        </div>
    `).join("");

    const totalPages = Math.ceil(total / POSTS_PER_PAGE);
    pagination.innerHTML = `
        <button class="page-btn" ${currentPage === 1 ? "disabled" : ""} onclick="goToPage(${currentPage - 1})">上一页</button>
        <span class="page-info">第 ${currentPage} / ${totalPages} 页</span>
        <button class="page-btn" ${currentPage === totalPages ? "disabled" : ""} onclick="goToPage(${currentPage + 1})">下一页</button>
    `;

    document.getElementById("result-count").textContent = `共 ${total} 条结果`;
}

function goToPage(page) {
    currentPage = page;
    renderPosts();
    document.getElementById("posts-container").scrollIntoView({ behavior: "smooth" });
}

function truncateContent(text, maxLen) {
    if (!text) return "";
    const clean = text.replace(/\s+/g, " ").trim();
    return clean.length > maxLen ? clean.slice(0, maxLen) + "..." : clean;
}

document.addEventListener("DOMContentLoaded", init);
