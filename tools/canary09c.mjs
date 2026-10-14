// node tools/canary09c.mjs docs/proof-09c-payload.json : one real share of the captured board crop to the live Worker, read back by sha256, then delete the key.
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
const p = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const bytes = Buffer.from(p.image, "base64"); fs.writeFileSync("docs/proof-09c-board-crop.jpg", bytes);
const sha = crypto.createHash("sha256").update(bytes).digest("hex");
const body = { image: p.image, ...p.body };
const r = await fetch("https://picchess-share.picchess.workers.dev/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
console.log("POST /share ->", r.status, await r.text(), "\nsha256 sent:", sha, "bytes:", bytes.length);
// negative: the same endpoint must refuse the full screenshot size (414x896 jpeg built by sips)
const id = fs.readFileSync("worker/wrangler.toml", "utf8").match(/binding = "SHARES"\s*\nid = "([0-9a-f]{32})"/)[1];
const wr = (a, enc = "utf8") => execFileSync("npx", ["wrangler", ...a], { cwd: "worker", encoding: enc, maxBuffer: 64 << 20 });
await new Promise((s) => setTimeout(s, 3000));
const got = wr(["kv", "key", "get", `img/${sha}.jpg`, "--namespace-id", id, "--remote"], "buffer");
console.log("sha256 read back:", crypto.createHash("sha256").update(got).digest("hex"), got.equals(bytes) ? "IDENTICAL" : "DIFFERENT");
console.log("metadata:", wr(["kv", "key", "list", "--namespace-id", id, "--remote"]).replace(/\s+/g, " ").slice(0, 700));
wr(["kv", "key", "delete", `img/${sha}.jpg`, "--namespace-id", id, "--remote"]);
console.log("deleted; list now:", wr(["kv", "key", "list", "--namespace-id", id, "--remote"]).trim());
