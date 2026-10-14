// Usage: node tools/export-dataset.mjs [outdir]   (default data/shares, gitignored)
// Reads the SHARES KV namespace with `wrangler kv key list/get` (free plan, no S3 keys): writes images/<sha>.<ext>
// and manifest.jsonl (one line per sample; canary entries are skipped).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const out = process.argv[2] || "data/shares";
const toml = fs.readFileSync("worker/wrangler.toml", "utf8");
const id = toml.match(/binding = "SHARES"\s*\nid = "([0-9a-f]{32})"/)?.[1];
if (!id) { console.error("SHARES namespace id not found in worker/wrangler.toml"); process.exit(1); }
const wr = (args, enc = "utf8") => execFileSync("npx", ["wrangler", ...args], { cwd: "worker", encoding: enc, maxBuffer: 256 << 20 });

const keys = JSON.parse(wr(["kv", "key", "list", "--namespace-id", id, "--remote"]));
fs.mkdirSync(path.join(out, "images"), { recursive: true });
const lines = [];
for (const k of keys) {
  const m = k.metadata;
  if (!k.name.startsWith("img/") || !m || m.is_canary) continue;
  const file = path.join(out, "images", k.name.slice(4));
  fs.writeFileSync(file, wr(["kv", "key", "get", k.name, "--namespace-id", id, "--remote"], "buffer"));
  lines.push(JSON.stringify({ sha: m.sha, image: path.join("images", k.name.slice(4)), kind: m.kind, bottom: m.bottom, sideToMove: m.sideToMove, predictedFen: m.predictedFen, fen: m.fen, license: m.license, ts: m.ts }));
}
fs.writeFileSync(path.join(out, "manifest.jsonl"), lines.join("\n") + (lines.length ? "\n" : ""));
console.log(`wrote ${lines.length} samples to ${out}`);
