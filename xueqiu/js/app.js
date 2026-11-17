(function () {
    const state = {
        data: null,
        selectedInvestor: "",
        search: "",
        sort: "time",
        page: 1,
        perPage: 10
    };

    document.addEventListener("DOMContentLoaded", init);

    async function init() {
        state.data = await SiteData.load();
        bindNavigation();
        bindToolbar();
        renderAll();
    }

    function bindNavigation() {
        const toggle = $(".nav-toggle");
        const links = $("#navLinks");

        if (toggle && links) {
            toggle.addEventListener("click", () => {
                const expanded = toggle.getAttribute("aria-expanded") === "true";
                toggle.setAttribute("aria-expanded", String(!expanded));
                links.classList.toggle("open", !expanded);
            });

            links.addEventListener("click", (event) => {
                const target = event.target.closest("a");
                if (!target) return;
                links.classList.remove("open");
                toggle.setAttribute("aria-expanded", "false");
            });
        }

        const favoriteButton = $(".favorites-button");
        const favoriteMenu = $("#favoritesMenu");
        if (favoriteButton && favoriteMenu) {
            favoriteButton.addEventListener("click", () => {
                const open = favoriteButton.getAttribute("aria-expanded") === "true";
                favoriteButton.setAttribute("aria-expanded", String(!open));
                favoriteMenu.classList.toggle("open", !open);
            });

            document.addEventListener("click", (event) => {
                if (!event.target.closest(".favorites")) {
                    favoriteButton.setAttribute("aria-expanded", "false");
                    favoriteMenu.classList.remove("open");
                }
            });
        }

        const sections = $$("main section[id]");
        const navLinks = $$(".nav-links a[href^='#']");
        const observer = new IntersectionObserver((entries) => {
            const visible = entries
                .filter((entry) => entry.isIntersecting)
                .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
            if (!visible) return;
            navLinks.forEach((link) => {
                link.classList.toggle("active", link.getAttribute("href") === `#${visible.target.id}`);
            });
        }, { rootMargin: "-20% 0px -65% 0px", threshold: [0.1, 0.3, 0.6] });

        sections.forEach((section) => observer.observe(section));
    }

    function bindToolbar() {
        const search = $("#globalSearch");
        if (search) {
            search.addEventListener("input", () => {
                state.search = search.value.trim().toLowerCase();
                state.page = 1;
                renderPosts();
                renderStocks();
                renderArtifacts();
                renderArchive();
            });
        }

        const sort = $("#postSort");
        if (sort) {
            sort.addEventListener("change", () => {
                state.sort = sort.value;
                state.page = 1;
                renderPosts();
            });
        }

        const clear = $("#clearInvestor");
        if (clear) {
            clear.addEventListener("click", () => {
                state.selectedInvestor = "";
                state.page = 1;
                renderInvestors();
                renderPosts();
            });
        }
    }

    function renderAll() {
        renderStats();
        renderFavorites();
        renderInvestors();
        renderPosts();
        renderStocks();
        renderArtifacts();
        renderArchive();
    }

    function renderStats() {
        const data = state.data || emptyData();
        const summary = data.summary || {};
        const stats = [
            ["文章索引", summary.longArticleCount || getPosts().length],
            ["投资者", summary.investorCount || getInvestors().length],
            ["自选股", summary.watchlistCount || (data.stocks?.watchlist || []).length],
            ["研究文件", summary.artifactCount || (data.artifacts || []).length],
            ["行业资料", summary.industryCount || (data.stocks?.industryFiles || []).length]
        ];

        $("#heroStats").innerHTML = stats.map(([label, value]) => `
            <div class="metric">
                <span>${escapeHtml(label)}</span>
                <strong>${formatNumber(value)}</strong>
            </div>
        `).join("");

        const updated = data.generatedAt || data.postsJson?.updated_at || "-";
        setText("lastUpdatedHero", updated);
        setText("lastUpdated", `最后更新：${updated}`);
    }

    function renderFavorites() {
        const links = state.data?.links || [];
        const menu = $("#favoritesMenu");
        if (!menu) return;
        if (!links.length) {
            menu.innerHTML = `<p class="empty-inline">暂无收藏链接</p>`;
            return;
        }

        menu.innerHTML = links.map((link) => `
            <a href="${escapeAttr(link.url)}" target="_blank" rel="noreferrer">
                <strong>${escapeHtml(link.title)}</strong>
                <span>${escapeHtml(link.description || link.url)}</span>
            </a>
        `).join("");
    }

    function renderInvestors() {
        const investors = getInvestors();
        const index = $("#investorIndex");
        setText("investorCount", `${formatNumber(investors.length)} 位`);

        if (!index) return;
        if (!investors.length) {
            index.innerHTML = emptyBlock("暂无投资者数据");
            return;
        }

        index.innerHTML = investors.map((investor) => {
            const active = investor.name === state.selectedInvestor;
            return `
                <button class="investor-item ${active ? "active" : ""}" type="button" data-investor="${escapeAttr(investor.name)}">
                    <span>
                        <strong>${escapeHtml(investor.name)}</strong>
                        <small>${formatNumber(investor.postCount)} 篇文章</small>
                    </span>
                    <em>${formatNumber(investor.interactions)}</em>
                </button>
            `;
        }).join("");

        index.onclick = (event) => {
            const button = event.target.closest("[data-investor]");
            if (!button) return;
            event.preventDefault();
            const scrollX = window.scrollX;
            const scrollY = window.scrollY;
            state.selectedInvestor = button.dataset.investor;
            state.page = 1;
            renderInvestors();
            renderPosts();
            restoreScroll(scrollX, scrollY);
        };
    }

    function renderPosts() {
        const allPosts = getFilteredPosts();
        const pageCount = Math.max(1, Math.ceil(allPosts.length / state.perPage));
        state.page = Math.min(state.page, pageCount);
        const start = (state.page - 1) * state.perPage;
        const posts = allPosts.slice(start, start + state.perPage);
        const feed = $("#postFeed");
        const pager = $("#postPager");
        const title = state.selectedInvestor ? `${state.selectedInvestor} 的文章索引` : "全部文章索引";

        setText("selectedInvestorTitle", title);
        setText("postResultText", `共 ${formatNumber(allPosts.length)} 篇文章，当前第 ${state.page} / ${pageCount} 页`);

        if (!feed) return;
        if (!posts.length) {
            feed.innerHTML = emptyBlock("没有匹配的帖子，试试减少筛选条件");
            if (pager) pager.innerHTML = "";
            return;
        }

        feed.innerHTML = posts.map((post) => renderPostCard(post)).join("");
        feed.onclick = (event) => {
            const author = event.target.closest("[data-author]");
            if (author) {
                state.selectedInvestor = author.dataset.author;
                state.page = 1;
                renderInvestors();
                renderPosts();
                return;
            }

            const stock = event.target.closest("[data-stock-search]");
            if (stock) {
                const value = stock.dataset.stockSearch;
                $("#globalSearch").value = value;
                state.search = value.toLowerCase();
                state.page = 1;
                renderPosts();
                renderStocks();
                renderArtifacts();
                renderArchive();
                return;
            }

        };

        if (!pager) return;
        pager.innerHTML = `
            <button type="button" ${state.page <= 1 ? "disabled" : ""} data-page="${state.page - 1}">上一页</button>
            <span>${state.page} / ${pageCount}</span>
            <button type="button" ${state.page >= pageCount ? "disabled" : ""} data-page="${state.page + 1}">下一页</button>
        `;
        pager.onclick = (event) => {
            const button = event.target.closest("[data-page]");
            if (!button || button.disabled) return;
            state.page = Number(button.dataset.page);
            renderPosts();
            $("#investors .panel-main")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        };
    }

    function renderPostCard(post) {
        const preview = shortText(post.contentPreview || post.summary, 260);
        const stockTags = post.stocks.map((stock) => `
            <button class="stock-tag" type="button" data-stock-search="${escapeAttr(stock.name)}">${escapeHtml(stock.name)}</button>
        `).join("");
        const industries = [...new Set(post.stocks.map((stock) => stock.industry?.level1).filter(Boolean))];
        const industryTags = industries.map((industry) => `<span class="industry-tag">${escapeHtml(industry)}</span>`).join("");
        const title = post.title || "文章";
        const badgeLabel = post.hasImages ? "含图" : "索引";

        return `
            <article class="post-card">
                <div class="post-header">
                    <button class="author-link" type="button" data-author="${escapeAttr(post.author)}">${escapeHtml(post.author)}</button>
                    <time>${escapeHtml(post.createdAt || "")}</time>
                    <span class="post-badge long">${badgeLabel}</span>
                </div>
                <h3>
                    ${post.link ? `<a href="${escapeAttr(post.link)}" target="_blank" rel="noreferrer">${escapeHtml(title)}</a>` : escapeHtml(title)}
                </h3>
                <p class="post-content">${escapeHtml(preview || "暂无简介，点击原文查看。")}</p>
                <div class="post-meta">${stockTags}${industryTags}</div>
                <div class="post-footer">
                    <div class="post-stats">
                        <span>赞 ${formatNumber(post.likes)}</span>
                        <span>评 ${formatNumber(post.comments)}</span>
                        <span>转 ${formatNumber(post.reposts)}</span>
                    </div>
                    ${post.link ? `<a class="text-button source-link" href="${escapeAttr(post.link)}" target="_blank" rel="noreferrer">打开原文</a>` : ""}
                </div>
            </article>
        `;
    }

    function renderStocks() {
        const data = state.data || emptyData();
        const watchlist = filterBySearch(data.stocks?.watchlist || [], (stock) => `${stock.name} ${stock.code} ${stock.group}`);
        const mentioned = filterBySearch(data.postsJson?.stocks || [], (stock) => `${stock.name} ${stock.code} ${stock.industry?.level1 || ""}`);
        const watchlistBox = $("#watchlist");
        const mentionedBox = $("#mentionedStocks");

        setText("watchlistCount", `${formatNumber(watchlist.length)} 只`);
        setText("mentionedStockCount", `${formatNumber(mentioned.length)} 只`);

        if (watchlistBox) {
            if (!watchlist.length) {
                watchlistBox.innerHTML = emptyBlock("没有匹配的自选股");
            } else {
                const groups = groupBy(watchlist, (stock) => stock.group || "未分组");
                watchlistBox.innerHTML = Object.entries(groups).map(([group, stocks]) => `
                    <div class="stock-group">
                        <h4>${escapeHtml(group)} <span>${formatNumber(stocks.length)}</span></h4>
                        <div class="stock-rows">
                            ${stocks.slice(0, 16).map((stock) => `
                                <button class="stock-row" type="button" data-watch-stock="${escapeAttr(stock.name)}">
                                    <strong>${escapeHtml(stock.name)}</strong>
                                    <span>${escapeHtml(stock.code)}</span>
                                </button>
                            `).join("")}
                        </div>
                    </div>
                `).join("");

                watchlistBox.onclick = (event) => {
                    const button = event.target.closest("[data-watch-stock]");
                    if (!button) return;
                    $("#globalSearch").value = button.dataset.watchStock;
                    state.search = button.dataset.watchStock.toLowerCase();
                    state.page = 1;
                    renderPosts();
                    renderStocks();
                    renderArtifacts();
                    renderArchive();
                };
            }
        }

        if (mentionedBox) {
            mentionedBox.innerHTML = mentioned.length
                ? mentioned.map((stock) => `
                    <button class="mention-chip" type="button" data-mentioned-stock="${escapeAttr(stock.name)}">
                        <strong>${escapeHtml(stock.name)}</strong>
                        <span>${escapeHtml(stock.code)} · ${formatNumber(stock.mention_count)} 次</span>
                    </button>
                `).join("")
                : emptyBlock("帖子里暂未识别到匹配股票");

            mentionedBox.onclick = (event) => {
                const button = event.target.closest("[data-mentioned-stock]");
                if (!button) return;
                $("#globalSearch").value = button.dataset.mentionedStock;
                state.search = button.dataset.mentionedStock.toLowerCase();
                state.page = 1;
                renderPosts();
                document.getElementById("investors")?.scrollIntoView({ behavior: "smooth" });
            };
        }
    }

    function renderArtifacts() {
        const artifacts = filterBySearch(state.data?.artifacts || [], artifactText);
        const strategic = artifacts.filter((item) => item.category === "策略研究" || isImage(item.url));
        const portfolioBox = $("#portfolioItems");
        const quantBox = $("#quantGroups");

        if (portfolioBox) {
            portfolioBox.innerHTML = strategic.length
                ? strategic.slice(0, 8).map(renderArtifactCard).join("")
                : emptyBlock("没有匹配的策略文件");
        }

        if (quantBox) {
            const groups = groupBy(artifacts, (item) => item.quantGroup || item.category || "其他");
            quantBox.innerHTML = Object.entries(groups).map(([group, items]) => `
                <details class="quant-group" ${group !== "其他" ? "open" : ""}>
                    <summary>
                        <span>${escapeHtml(group)}</span>
                        <em>${formatNumber(items.length)} 个文件</em>
                    </summary>
                    <div class="archive-list dense">
                        ${items.map(renderFileLink).join("")}
                    </div>
                </details>
            `).join("");
        }
    }

    function renderArtifactCard(item) {
        const preview = isImage(item.url)
            ? `<img src="${escapeAttr(item.url)}" alt="${escapeAttr(item.title)}" loading="lazy">`
            : `<div class="file-preview">${escapeHtml((item.name || "").split(".").pop() || "FILE")}</div>`;

        return `
            <a class="artifact-card" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">
                ${preview}
                <span>${escapeHtml(item.quantGroup || item.category || "研究文件")}</span>
                <strong>${escapeHtml(item.title || item.name)}</strong>
                <small>${fileSize(item.size)} · ${formatDate(item.updatedAt)}</small>
            </a>
        `;
    }

    function renderArchive() {
        const data = state.data || emptyData();
        const industryFiles = filterBySearch(data.stocks?.industryFiles || [], artifactText);
        const artifacts = filterBySearch(data.artifacts || [], artifactText);

        setText("industryFileCount", `${formatNumber(industryFiles.length)} 个`);
        setText("fileCount", `${formatNumber(artifacts.length)} 个`);

        const industryBox = $("#industryFiles");
        const fileBox = $("#fileArchive");
        if (industryBox) {
            industryBox.innerHTML = industryFiles.length ? industryFiles.map(renderFileLink).join("") : emptyBlock("没有匹配的行业资料");
        }
        if (fileBox) {
            fileBox.innerHTML = artifacts.length ? artifacts.map(renderFileLink).join("") : emptyBlock("没有匹配的文件");
        }
    }

    function renderFileLink(item) {
        return `
            <a class="file-link" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">
                <span>
                    <strong>${escapeHtml(item.title || item.name)}</strong>
                    <small>${escapeHtml(item.category || item.quantGroup || "文件")} · ${fileSize(item.size)}</small>
                </span>
                <em>${formatDate(item.updatedAt)}</em>
            </a>
        `;
    }

    function getInvestors() {
        return (state.data?.articleIndex?.authors || []).map((item) => ({
            name: item.name,
            postCount: item.long_post_count || item.post_count || 0,
            longCount: item.long_post_count || 0,
            interactions: item.interactions || 0
        })).sort((a, b) => b.longCount - a.longCount);
    }

    function getPosts() {
        return (state.data?.articleIndex?.posts || []).map((post) => ({
            id: String(post.id || `${post.author?.name || "post"}-${post.timestamp || ""}`),
            author: typeof post.author === "string" ? post.author : post.author?.name || "未知",
            title: post.title || "",
            summary: post.summary || post.content_preview || "",
            contentPreview: post.content_preview || post.summary || "",
            link: post.url || post.link || "",
            createdAt: post.created_at || "",
            timestamp: Number(post.timestamp || 0),
            likes: Number(post.likes || 0),
            comments: Number(post.comments || 0),
            reposts: Number(post.reposts || 0),
            characters: Number(post.characters || 0),
            hasImages: Boolean(post.has_images),
            postType: "original_long",
            isLong: true,
            stocks: Array.isArray(post.stocks) ? post.stocks : []
        }));
    }

    function getFilteredPosts() {
        let posts = getPosts();
        if (state.selectedInvestor) {
            posts = posts.filter((post) => post.author === state.selectedInvestor);
        }
        posts = filterBySearch(posts, (post) => [
            post.author,
            post.title,
            post.summary,
            post.contentPreview,
            post.stocks.map((stock) => `${stock.name} ${stock.code} ${stock.industry?.level1 || ""}`).join(" ")
        ].join(" "));

        return posts.sort((a, b) => {
            if (state.sort === "interaction") {
                return interactionScore(b) - interactionScore(a);
            }
            if (state.sort === "length") {
                return (b.characters || 0) - (a.characters || 0);
            }
            return (b.timestamp || 0) - (a.timestamp || 0);
        });
    }

    function interactionScore(post) {
        return Number(post.likes || 0) + Number(post.comments || 0) * 2 + Number(post.reposts || 0) * 3;
    }

    function artifactText(item) {
        return `${item.title || ""} ${item.name || ""} ${item.category || ""} ${item.quantGroup || ""}`;
    }

    function restoreScroll(left, top) {
        const root = document.documentElement;
        const previousBehavior = root.style.scrollBehavior;
        root.style.scrollBehavior = "auto";
        const restore = () => window.scrollTo(left, top);

        restore();
        requestAnimationFrame(() => {
            restore();
            requestAnimationFrame(restore);
        });
        window.setTimeout(() => {
            restore();
            root.style.scrollBehavior = previousBehavior;
        }, 80);
    }

    function filterBySearch(items, textGetter) {
        if (!state.search) return items;
        return items.filter((item) => textGetter(item).toLowerCase().includes(state.search));
    }

    function groupBy(items, getKey) {
        return items.reduce((groups, item) => {
            const key = getKey(item);
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
            return groups;
        }, {});
    }

    function formatDate(value) {
        if (!value) return "-";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
        return date.toLocaleDateString("zh-CN");
    }

    function escapeAttr(value) {
        return escapeHtml(value).replace(/"/g, "&quot;");
    }

    function emptyBlock(text) {
        return `<div class="empty-state">${escapeHtml(text)}</div>`;
    }
})();
