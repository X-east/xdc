const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const SiteData = {
    cache: null,
    async load() {
        if (this.cache) return this.cache;
        try {
            const response = await fetch("data/site-content.json", { cache: "no-store" });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            this.cache = await response.json();
            return this.cache;
        } catch (error) {
            console.warn("无法加载网站数据：", error);
            this.cache = emptyData();
            return this.cache;
        }
    }
};

function emptyData() {
    return {
        generatedAt: "",
        summary: {},
        xueqiu: { investors: [], posts: [], dailyFiles: [], longTexts: [] },
        stocks: { watchlist: [], industryFiles: [] },
        artifacts: [],
        links: []
    };
}

function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
}

function formatNumber(value) {
    const number = Number(value || 0);
    return number.toLocaleString("zh-CN");
}

function shortText(value, max = 160) {
    const text = String(value || "").trim();
    return text.length > max ? `${text.slice(0, max)}...` : text;
}

function fileSize(bytes) {
    const size = Number(bytes || 0);
    if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
    if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${size} B`;
}

function isImage(path) {
    return /\.(png|jpe?g|webp|gif)$/i.test(path || "");
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}
