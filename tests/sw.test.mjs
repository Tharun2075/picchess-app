import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { APP, precacheList, block } from "../tools/stamp-sw.mjs";

const sw = fs.readFileSync(path.join(APP, "sw.js"), "utf8");
const listed = [...sw.match(/const PRECACHE = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

function allFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? allFiles(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}

test("every file in the precache list exists", () => {
  assert.ok(listed.length > 20);
  for (const u of listed) {
    if (u === "./") continue;
    assert.ok(fs.existsSync(path.join(APP, u)), `missing ${u}`);
  }
});

test("precache list covers shell, vendor files and the engine js + wasm", () => {
  for (const u of ["./", "./index.html", "./main.js", "./style.css", "./manifest.webmanifest", "./licenses.html",
    "./engine/stockfish-19-lite-single.js", "./engine/stockfish-19-lite-single.wasm",
    "./vendor/chess.js/chess.js", "./vendor/cm-chessboard/src/Chessboard.js", "./icons/icon-192.png"]) {
    assert.ok(listed.includes(u), `not precached: ${u}`);
  }
});

test("sw.js generated block is current (run: node tools/stamp-sw.mjs)", () => {
  assert.ok(sw.includes(block(precacheList())), "stale precache list or version");
  assert.match(sw, /const CACHE = `picchess-\$\{VERSION\}`/);
  assert.doesNotMatch(sw, /const VERSION = "dev"/);
});

test("no app/ file exceeds 25 MiB (Cloudflare Pages per-file limit)", () => {
  for (const f of allFiles(APP)) {
    assert.ok(fs.statSync(f).size <= 25 * 1024 * 1024, `${f} too large`);
  }
});

test("manifest is valid and its icons exist", () => {
  const m = JSON.parse(fs.readFileSync(path.join(APP, "manifest.webmanifest"), "utf8"));
  assert.equal(m.display, "standalone");
  assert.ok(m.icons.some((i) => i.sizes === "192x192") && m.icons.some((i) => i.sizes === "512x512"));
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(APP, i.src)), i.src);
  assert.ok(fs.existsSync(path.join(APP, m.start_url)));
});

test("_headers: wasm type, security headers, COOP/COEP only commented out", () => {
  const h = fs.readFileSync(path.join(APP, "_headers"), "utf8");
  assert.match(h, /\/engine\/\*\.wasm\n\s+Content-Type: application\/wasm/);
  assert.match(h, /^\s+X-Content-Type-Options: nosniff/m);
  assert.match(h, /^\s+Referrer-Policy: no-referrer/m);
  assert.match(h, /^\s+Content-Security-Policy: .*'self'.*'wasm-unsafe-eval'/m);
  assert.match(h, /^\s*# Cross-Origin-Opener-Policy: same-origin/m);
  assert.match(h, /^\s*# Cross-Origin-Embedder-Policy: require-corp/m);
  assert.doesNotMatch(h, /^\s+Cross-Origin-(Opener|Embedder)/m);
});

test("licenses page names Stockfish GPLv3 with a source link and every vendored folder", () => {
  const l = fs.readFileSync(path.join(APP, "licenses.html"), "utf8");
  assert.match(l, /Stockfish[\s\S]*GPL-3\.0[\s\S]*github\.com\/official-stockfish\/Stockfish/);
  for (const d of fs.readdirSync(path.join(APP, "vendor"), { withFileTypes: true }).filter((e) => e.isDirectory())) {
    assert.ok(l.includes(`vendor/${d.name}/LICENSE`), `licenses.html misses ${d.name}`);
  }
});
