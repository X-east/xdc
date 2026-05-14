/* ═══════════════════════════════════════
   雪球研究站 — 投资者模块
   投资者列表 / 搜索 / 排序 / 详情
   ═══════════════════════════════════════ */

let investorsData = [];
let postsData = [];

document.addEventListener("DOMContentLoaded", async () => {
    setupNav();
    if (!$("#investor-grid")) return;
    await loadInvestors();
    setupSearchSort();
});


async function loadInvestors() {
    investorsData = await SITE.load("investors") || [];

    if (investorsData.length === 0) {
        showEmpty($("#investor-grid"), "暂无投资者数据", "👤");
        return;
    }

    renderInvestors(investorsData);
}


function renderInvestors(list) {
    const grid = $("#investor-grid");
    grid.innerHTML = list.map(inv => `
        <div class="investor-card" onclick="showInvestor('${inv.id}')">
            <div class="investor-name">${escHtml(inv.name)}</div>
            <div class="investor-stats">
                <span>📝 帖子: <strong>${fmtNum(inv.post_count)}</strong></span>
                <span>👍 点赞: <strong>${fmtNum(inv.total_likes)}</strong></span>
                <span>📊 长文: <strong>${fmtNum(inv.deep_count)}</strong></span>
                <span>🕐 更新: <strong>${fmtTime(inv.last_post_time) || "--"}</strong></span>
            </div>
        </div>
    `).join("");
}


function setupSearchSort() {
    const searchInput = $("#investor-search");
    const sortSelect = $("#investor-sort");

    if (!searchInput || !sortSelect) return;

    function filterAndSort() {
        const keyword = searchInput.value.trim().toLowerCase();
        const sortBy = sortSelect.value;

        let filtered = investorsData;
        if (keyword) {
            filtered = investorsData.filter(inv =>
                inv.name.toLowerCase().includes(keyword)
            );
        }

        filtered = [...filtered].sort((a, b) => {
            switch (sortBy) {
                case "posts":   return (b.post_count || 0) - (a.post_count || 0);
                case "likes":   return (b.total_likes || 0) - (a.total_likes || 0);
                case "updated": return (b.last_post_time || "").localeCompare(a.last_post_time || "");
                default:        return a.name.localeCompare(b.name, "zh");
            }
        });

        renderInvestors(filtered);
    }

    searchInput.addEventListener("input", filterAndSort);
    sortSelect.addEventListener("change", filterAndSort);
}


/* ─── 投资者详情 ─── */

async function showInvestor(id) {
    const grid = $("#investor-grid");
    const detail = $("#investor-detail");
    const content = $("#investor-detail-content");

    grid.style.display = "none";
    detail.style.display = "block";

    const inv = investorsData.find(i => i.id === id);
    if (!inv) return;

    const posts = await SITE.load("posts") || [];
    const invPosts = posts.filter(p => p.investor_id === id);

    content.innerHTML = `
        <div class="detail-header">
            <h2>${escHtml(inv.name)}</h2>
            <div class="detail-stats">
                <div class="stat">
                    <div class="stat-value">${fmtNum(inv.post_count)}</div>
                    <div class="stat-label">帖子</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${fmtNum(inv.total_likes)}</div>
                    <div class="stat-label">获赞</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${fmtNum(inv.deep_count)}</div>
                    <div class="stat-label">深度文章</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${fmtNum(inv.total_comments)}</div>
                    <div class="stat-label">评论</div>
                </div>
            </div>
            <p style="margin-top:12px;font-size:13px;color:var(--text-light)">
                📎 <a href="${escHtml(inv.url)}" target="_blank">雪球主页 →</a>
            </p>
        </div>
        <div class="post-list" id="inv-posts">
            ${invPosts.length === 0
                ? "<div class='empty-state'><p>暂无帖子</p></div>"
                : invPosts.map(p => postCardHTML(p)).join("")}
        </div>
    `;
}


function backToList() {
    $("#investor-grid").style.display = "grid";
    $("#investor-detail").style.display = "none";
}
