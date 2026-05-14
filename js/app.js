/* ═══════════════════════════════════════
   雪球研究站 — 全局应用逻辑
   导航、首页仪表盘
   ═══════════════════════════════════════ */

document.addEventListener("DOMContentLoaded", async () => {
    setupNav();
    await loadHomePage();
});


/* ─── 导航 ─── */

function setupNav() {
    const toggle = $(".nav-toggle");
    const links = $(".nav-links");
    if (toggle) {
        toggle.addEventListener("click", () => links.classList.toggle("open"));
    }
    // 点击导航链接后自动收起菜单
    links?.querySelectorAll("a").forEach(a => {
        a.addEventListener("click", () => links.classList.remove("open"));
    });
}


/* ─── 首页 ─── */

async function loadHomePage() {
    // 只在首页执行
    if (!$("#stats-cards")) return;

    const stats = await SITE.load("stats");
    const config = await SITE.load("config");
    const investors = await SITE.load("investors");

    if (stats) {
        renderStats(stats);
    }
    if (config) {
        const el = $("#footer-updated");
        if (el) el.textContent = `最后更新：${config.built_at || "--"}`;
    }
    if (investors) {
        const el = $("#module-investors");
        if (el) el.textContent = `${investors.length} 位投资者`;
    }

    await loadRecentPosts();
}


function renderStats(stats) {
    setText("stat-investors", fmtNum(stats.total_investors));
    setText("stat-posts", fmtNum(stats.total_posts));
    setText("stat-chars", fmtLarge(stats.total_characters) + "字");
    const interactions = (stats.total_likes || 0) + (stats.total_comments || 0);
    setText("stat-interactions", fmtLarge(interactions) + "次");
}


async function loadRecentPosts() {
    const container = $("#recent-posts");
    if (!container) return;

    const posts = await SITE.load("posts");
    if (!posts || posts.length === 0) {
        container.innerHTML = "<div class='empty-state'><div class='empty-icon'>📭</div><p>暂无帖子数据，请先运行爬虫抓取</p></div>";
        return;
    }

    const recent = posts.slice(0, 10);
    container.innerHTML = recent.map(p => postCardHTML(p)).join("");
}


function postCardHTML(post) {
    const cat = post.category || "";
    const badge = cat ? categoryBadge(cat) : "";
    const preview = truncate(post.text || post.title || "", 150);
    const time = fmtTime(post.created_at_text);

    return `
    <div class="post-card">
        <div class="post-title">${escHtml(post.title || "无标题")}</div>
        <div class="post-meta">
            <span>👤 ${escHtml(post.investor_name)}</span>
            ${badge}
            <span>🕐 ${time}</span>
        </div>
        <div class="post-preview">${escHtml(preview)}</div>
        <div class="post-stats">
            <span>👍 ${fmtNum(post.likes)}</span>
            <span>💬 ${fmtNum(post.comments)}</span>
            <span>🔄 ${fmtNum(post.reposts)}</span>
        </div>
    </div>`;
}


/* ─── 工具 ─── */

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function escHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}
