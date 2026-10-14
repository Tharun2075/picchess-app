import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { handle } from "../../worker/index.mjs";
import { good, post, fakeKV, fakeR2, jpegB64 } from "./helpers.mjs";

const mk = () => ({ KV: fakeKV(), BUCKET: fakeR2(), SALT: "s" });
const NOW = new Date("2026-10-14T12:00:00Z");

test("accepts a good post, stores image+meta keyed by sha, no Set-Cookie, no raw IP stored", async () => {
  const env = mk();
  const r = await handle(post(good(), { origin: "https://picchess.pages.dev" }), env, NOW);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("set-cookie"), null);
  assert.equal(r.headers.get("access-control-allow-origin"), "https://picchess.pages.dev");
  const sha = crypto.createHash("sha256").update(Buffer.from(jpegB64(), "base64")).digest("hex");
  assert.ok(env.BUCKET.m.has(`images/${sha}.jpg`));
  const meta = JSON.parse(env.BUCKET.m.get(`meta/${sha}.json`));
  assert.equal(meta.receivedAt, "2026-10-14"); assert.equal("image" in meta, false);
  assert.ok(![...env.KV.m.keys()].some((k) => k.includes("1.2.3.4")));
});
test("duplicate sha overwrites, not duplicates, and counts once", async () => {
  const env = mk();
  await handle(post(good()), env, NOW); await handle(post(good({ orientation: "black" })), env, NOW);
  assert.equal(env.BUCKET.m.size, 2);
  assert.equal(env.KV.m.get("cap|2026-10-14"), "1");
  assert.equal(JSON.parse([...env.BUCKET.m].find(([k]) => k.startsWith("meta/"))[1]).orientation, "black");
});
test("21st request from one IP in an hour is 429; other IP fine", async () => {
  const env = mk();
  for (let i = 0; i < 20; i++) assert.equal((await handle(post(good()), env, NOW)).status, 200);
  assert.equal((await handle(post(good()), env, NOW)).status, 429);
  assert.equal((await handle(post(good(), { "cf-connecting-ip": "9.9.9.9" }), env, NOW)).status, 200);
  assert.equal((await handle(post(good()), env, new Date("2026-10-14T13:05:00Z"))).status, 200); // new hour, new key
});
test("daily cap gives 503", async () => {
  const env = mk(); env.KV.m.set("cap|2026-10-14", "5000");
  assert.equal((await handle(post(good()), env, NOW)).status, 503);
});
test("method, size and origin rules", async () => {
  const env = mk();
  assert.equal((await handle(new Request("https://w.test/share"), env, NOW)).status, 405);
  assert.equal((await handle(post("x".repeat(1.6 * 1024 * 1024)), env, NOW)).status, 413);
  assert.equal((await handle(post("{bad"), env, NOW)).status, 400);
  assert.equal((await handle(post({ ...good(), extra: 1 }), env, NOW)).status, 400);
  assert.equal((await handle(post(good(), { origin: "https://evil.example" }), env, NOW)).status, 403);
  assert.equal(env.BUCKET.m.size, 0);
});
test("/hit counts per day|src|path, /stats reports them, no cookies", async () => {
  const env = mk();
  const hit = (q, m = "GET") => handle(new Request("https://w.test/hit?" + q, { method: m }), env, NOW);
  assert.equal((await hit("src=Twitter&p=/")).status, 204);
  await hit("src=twitter&p=/"); await hit("src=scan&p=scan"); await hit("", "POST");
  const r = await handle(new Request("https://w.test/stats?days=7"), env, NOW);
  assert.equal(r.headers.get("set-cookie"), null);
  assert.match(r.headers.get("cache-control"), /max-age=60/);
  const j = await r.json();
  assert.deepEqual(j.days["2026-10-14"], { twitter: 2, scan: 1, direct: 1 });
  assert.equal(j.totalScans, 1);
});
