/* ═══════════════════════════════════════
   雪球研究站 — 核心工具函数
   数据加载、格式化、DOM 工具
   ═══════════════════════════════════════ */

const SITE = {
    /** 网站数据根目录 — 自动检测开发/部署环境 */
    _dataRoot: null,

    /** 缓存已加载的 JSON 数据 */
    _cache: {},

    /**
     * 自动检测数据目录
     * 尝试顺序: ./data/ (部署) -> ../site-data/ (开发)
     */
    async _detectDataRoot() {
        const candidates = ["./data", "../site-data"];
        for (const path of candidates) {
            try {
                const resp = await fetch(`${path}/config.json`);
                if (resp.ok) {
                    console.log(`[core] 数据目录: ${path}`);
                    return path;
                }
            } catch (_) {}
        }
        return candidates[0];
    },

    /**
     * 加载 JSON 数据（带缓存 + 自动路径检测）
     * @param {string} name - 文件名（不含 .json）
     * @returns {Promise<any>}
     */
    async load(name) {
        if (this._cache[name]) return this._cache[name];
        if (!this._dataRoot) {
            this._dataRoot = await this._detectDataRoot();
        }
        try {
            const resp = await fetch(`${this._dataRoot}/${name}.json`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            this._cache[name] = data;
            return data;
        } catch (e) {
            console.warn(`[core] 加载 ${name}.json 失败:`, e.message);
            return null;
        }
    },

    /** 清空缓存 */
    clearCache() {
        this._cache = {};
        this._dataRoot = null;
    }
};


/* ─── 格式化工具 ─── */

/** 格式化数字：1200 → "1,200" */
function fmtNum(n) {
    if (n == null || isNaN(n)) return "0";
    return Number(n).toLocaleString("zh-CN");
}

/** 格式化大数：12345 → "1.2万" */
function fmtLarge(n) {
    if (n == null || isNaN(n)) return "0";
    n = Number(n);
    if (n >= 10000) return (n / 10000).toFixed(1) + "万";
    if (n >= 1000)  return (n / 1000).toFixed(1) + "千";
    return String(n);
}

/** 格式化时间文本 */
function fmtTime(text) {
    if (!text) return "";
    return text;
}

/** 截断文本 */
function truncate(text, maxLen = 200) {
    if (!text) return "";
    return text.length > maxLen ? text.slice(0, maxLen) + "..." : text;
}

/** 高亮搜索关键词 */
function highlight(text, keyword) {
    if (!keyword || !text) return text;
    const re = new RegExp(`(${escapeRegExp(keyword)})`, "gi");
    return text.replace(re, "<mark>$1</mark>");
}

function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


/* ─── DOM 工具 ─── */

/** 选择器简写 */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

/** 创建元素并设置属性和内容 */
function createEl(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === "className") el.className = v;
        else if (k === "innerHTML") el.innerHTML = v;
        else if (k === "textContent") el.textContent = v;
        else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v);
    }
    for (const c of children) {
        if (typeof c === "string") el.appendChild(document.createTextNode(c));
        else if (c instanceof Node) el.appendChild(c);
    }
    return el;
}

/** 显示加载状态 */
function showLoading(container, msg = "加载中...") {
    container.innerHTML = `<div class="loading">${msg}</div>`;
}

/** 显示空状态 */
function showEmpty(container, msg = "暂无数据", icon = "📭") {
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">${icon}</div>
            <p>${msg}</p>
        </div>`;
}


/* ─── 分类标签 ─── */

const CATEGORY_LABELS = {
    deep:   { label: "深度文章", cls: "deep" },
    normal: { label: "普通发言", cls: "normal" },
    short:  { label: "短消息",   cls: "short" },
};

function categoryBadge(cat) {
    const info = CATEGORY_LABELS[cat] || { label: cat, cls: "normal" };
    return `<span class="post-category ${info.cls}">${info.label}</span>`;
}
