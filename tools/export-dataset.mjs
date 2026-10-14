// Usage: node tools/export-dataset.mjs [outfile]   (default data/share-manifest.jsonl, gitignored)
// Lists meta/*.json in the R2 bucket with `wrangler r2 object` (free plan, no S3 API keys) and writes one JSONL line per sample.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BUCKET = "picchess-share";
const out = process.argv[2] || "data/share-manifest.jsonl";
const wr = (args) => execFileSync("npx", ["wrangler", ...args], { cwd: "worker", encoding: "utf8", maxBuffer: 64 << 20 });

// wrangler has no list command on the free path, so keys come from the Worker's bucket via the dashboard-free
// `r2 object get` of an index the operator exports once: pass shas on stdin or in data/share-shas.txt.
const shaFile = "data/share-shas.txt";
const shas = (fs.existsSync(shaFile) ? fs.readFileSync(shaFile, "utf8") : "").split(/\s+/).filter((s) => /^[0-9a-f]{64}$/.test(s));
if (!shas.length) { console.error(`No shas in ${shaFile}. Put one sha per line (from the wrangler r2 listing) and re-run.`); process.exit(1); }
fs.mkdirSync(path.dirname(out), { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "share-"));
const lines = [];
for (const sha of shas) {
  const f = path.join(tmp, sha + ".json");
  wr(["r2", "object", "get", `${BUCKET}/meta/${sha}.json`, "--remote", "--file", f]);
  const m = JSON.parse(fs.readFileSync(f, "utf8"));
  const { sha: _s, source, orientation, sideToMove, predictedFen, correctedFen, corners, imageKey } = m;
  lines.push(JSON.stringify({ sha, source, orientation, sideToMove, predictedFen, correctedFen, corners, imageKey }));
}
fs.writeFileSync(out, lines.join("\n") + "\n");
console.log(`wrote ${lines.length} samples to ${out}`);
