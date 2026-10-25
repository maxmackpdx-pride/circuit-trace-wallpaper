import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = join(process.cwd(), "public");
const port = Number(process.env.PORT || 8080);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    const path = decodeURIComponent(url.pathname);
    if (path === "/") {
      res.writeHead(302, { location: "/wallpaper/index.html" });
      res.end();
      return;
    }
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    const data = await readFile(file);
    const type = types[extname(file).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "content-type": type, "cache-control": "public, max-age=3600" });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

server.listen(port, "0.0.0.0");
