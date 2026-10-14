// Tiny static server with a proper MIME map: node tools/serve.mjs [dir] [port]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(process.argv[2] || "app"), port = Number(process.argv[3] || 8765);
const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".onnx": "application/octet-stream", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(root)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
  fs.readFile(p, (e, d) => e ? res.writeHead(404).end("not found") : res.writeHead(200, { "content-type": mime[path.extname(p)] || "application/octet-stream" }).end(d));
}).listen(port, "127.0.0.1");
