import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const port = Number(process.env.PORT || 4173);
const types = {
    ".html": "text/html;charset=utf-8",
    ".css": "text/css;charset=utf-8",
    ".js": "text/javascript;charset=utf-8",
    ".json": "application/json;charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".csv": "text/csv;charset=utf-8",
    ".txt": "text/plain;charset=utf-8",
    ".md": "text/markdown;charset=utf-8",
    ".log": "text/plain;charset=utf-8"
};

createServer(async (req, res) => {
    const pathname = decodeURIComponent((req.url || "/").split("?")[0]);
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const file = path.resolve(root, relative);

    if (!file.startsWith(root)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }

    try {
        const body = await readFile(file);
        res.writeHead(200, { "Content-Type": types[path.extname(file).toLowerCase()] || "application/octet-stream" });
        res.end(body);
    } catch {
        res.writeHead(404, { "Content-Type": "text/plain;charset=utf-8" });
        res.end("Not found");
    }
}).listen(port, "127.0.0.1", () => {
    console.log(`http://127.0.0.1:${port}`);
});
