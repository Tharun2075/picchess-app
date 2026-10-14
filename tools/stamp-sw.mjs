// Usage: node tools/stamp-sw.mjs   -> rewrites the generated block of app/sw.js (precache list + version).
// Exports precacheList()/computeVersion() so tests can check the stamp is current.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "app");
const SKIP = new Set(["sw.js", "_headers", ".DS_Store"]);
// Big recogniser files (onnxruntime wasm 14 MB, model 1.3 MB): not installed up front, cached the first time a scan needs them.
export const LAZY_PREFIXES = ["vendor/onnxruntime-web/", "models/"];
const isLazy = (f) => LAZY_PREFIXES.some((p) => f.startsWith(p));

export function allList() {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (SKIP.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(path.relative(APP, p).split(path.sep).join("/"));
    }
  })(APP);
  return out;
}
export const precacheList = () => allList().filter((f) => !isLazy(f));
export const lazyList = () => allList().filter(isLazy);

export function computeVersion(list = precacheList()) {
  const h = crypto.createHash("sha256");
  for (const f of list) { h.update(f); h.update(fs.readFileSync(path.join(APP, f))); }
  return h.digest("hex").slice(0, 12);
}

export function computeMlVersion(list = lazyList()) {
  const h = crypto.createHash("sha256");
  for (const f of list) { h.update(f); h.update(fs.readFileSync(path.join(APP, f))); }
  return h.digest("hex").slice(0, 12);
}

export function block(list = precacheList()) {
  const items = ["./", ...list].map((f) => `  ${JSON.stringify(f === "./" ? f : "./" + f)},`).join("\n");
  return `// BEGIN GENERATED\nconst VERSION = ${JSON.stringify(computeVersion(list))};\nconst ML_VERSION = ${JSON.stringify(computeMlVersion())};\nconst LAZY_PREFIXES = ${JSON.stringify(LAZY_PREFIXES.map((f) => "./" + f))};\nconst PRECACHE = [\n${items}\n];\n// END GENERATED`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const f = path.join(APP, "sw.js");
  const src = fs.readFileSync(f, "utf8");
  const next = src.replace(/\/\/ BEGIN GENERATED[\s\S]*?\/\/ END GENERATED/, block());
  fs.writeFileSync(f, next);
  console.log("stamped", computeVersion());
}
