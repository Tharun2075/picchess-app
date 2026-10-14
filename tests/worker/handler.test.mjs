import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { handle } from "../../worker/index.mjs";
import { good, post, fakeKV, fakeShares, jpegB64 } from "./helpers.mjs";

const mk = () => ({ KV: fakeKV(), SHARES: fakeShares(), SALT: "s" });
const NOW = new Date("2026-10-14T12:00:00Z");

test("accepts a good post, stores image+meta keyed by sha, no Set-Cookie, no raw IP stored", async () => {
  const env = mk();
  const r = await handle(post(good(), { origin: "https://picchess.pages.dev" }), env, NOW);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("set-cookie"), null);
  assert.equal(r.headers.get("access-control-allow-origin"), "https://picchess.pages.dev");
  const sha = crypto.createHash("sha256").update(Buffer.from(jpegB64(), "base64")).digest("hex");
  const e = env.SHARES.m.get(`img/${sha}.jpg`);
  assert.deepEqual([...e.v], [...Buffer.from(jpegB64(), "base64")]);
  const meta = e.metadata;
  assert.equal(meta.receivedAt, "2026-10-14"); assert.equal("image" in meta, false);
  assert.equal(meta.license, "CC0"); assert.equal(meta.kind, "screenshot"); assert.equal(meta.bottom, "white"); assert.equal(meta.fen, good().correctedFen);
  assert.ok(JSON.stringify(meta).length < 1024);
  assert.ok(![...env.KV.m.keys()].some((k) => k.includes("1.2.3.4")));
});
test("duplicate sha overwrites, not duplicates, and counts once", async () => {
  const env = mk();
  await handle(post(good()), env, NOW); await handle(post(good({ orientation: "black" })), env, NOW);
  assert.equal(env.SHARES.m.size, 1);
  assert.equal(env.KV.m.get("cap|2026-10-14"), "1");
  assert.equal([...env.SHARES.m.values()][0].metadata.orientation, "black");
});
test("21st request from one IP in an hour is 429; other IP fine", async () => {
  const env = mk();
  for (let i = 0; i < 20; i++) assert.equal((await handle(post(good()), env, NOW)).status, 200);
  assert.equal((await handle(post(good()), env, NOW)).status, 429);
  assert.equal((await handle(post(good(), { "cf-connecting-ip": "9.9.9.9" }), env, NOW)).status, 200);
  assert.equal((await handle(post(good()), env, new Date("2026-10-14T13:05:00Z"))).status, 200); // new hour, new key
});
test("daily cap gives 503", async () => {
  const env = mk(); env.KV.m.set("cap|2026-10-14", "900");
  assert.equal((await handle(post(good()), env, NOW)).status, 503);
});
test("method, size and origin rules", async () => {
  const env = mk();
  assert.equal((await handle(new Request("https://w.test/share"), env, NOW)).status, 405);
  assert.equal((await handle(post("x".repeat(401 * 1024)), env, NOW)).status, 413);
  assert.equal((await handle(post("{bad"), env, NOW)).status, 400);
  assert.equal((await handle(post({ ...good(), extra: 1 }), env, NOW)).status, 400);
  assert.equal((await handle(post(good(), { origin: "https://evil.example" }), env, NOW)).status, 403);
  assert.equal(env.SHARES.m.size, 0);
});
test("KV write failure gives 503, not a crash", async () => {
  const env = mk(); env.SHARES.put = async () => { throw new Error("limit"); };
  assert.equal((await handle(post(good()), env, NOW)).status, 503);
});
test("/hit batches: first hit writes, later ones within the hour are pending", async () => {
  const env = mk(); let writes = 0; const put = env.KV.put; env.KV.put = async (...a) => { writes++; return put(...a); };
  const hit = (t) => handle(new Request("https://w.test/hit?src=reddit&p=/"), env, new Date(NOW.getTime() + t));
  await hit(0); await hit(1000); await hit(2000);
  assert.equal(writes, 1); assert.equal(env.KV.m.get("hit|2026-10-14|reddit|/"), "1");
  await hit(3700000); // next hour: flush the 2 pending + this one
  assert.equal(env.KV.m.get("hit|2026-10-14|reddit|/"), "4");
});
test("/hit counts per day|src|path, /stats reports them, no cookies", async () => {
  const env = mk();
  const hit = (q, m = "GET") => handle(new Request("https://w.test/hit?" + q, { method: m }), env, NOW);
  assert.equal((await hit("src=Twitter&p=/")).status, 204);
  await hit("src=scan&p=scan"); await hit("", "POST");
  const r = await handle(new Request("https://w.test/stats?days=7"), env, NOW);
  assert.equal(r.headers.get("set-cookie"), null);
  assert.match(r.headers.get("cache-control"), /max-age=60/);
  const j = await r.json();
  assert.deepEqual(j.days["2026-10-14"], { twitter: 1, scan: 1, direct: 1 });
  assert.equal(j.totalScans, 1);
});
test("/hit is limited per salted IP per hour, read-only when over the limit; other IPs fine", async () => {
  const env = mk(); let writes = 0; const put = env.KV.put; env.KV.put = async (...a) => { writes++; return put(...a); };
  const hit = (ip, t = NOW) => handle(new Request("https://w.test/hit?src=reddit&p=/", { headers: { "cf-connecting-ip": ip } }), env, t);
  for (let i = 0; i < 60; i++) assert.equal((await hit("5.5.5.5")).status, 204);
  const w = writes;
  assert.equal((await hit("5.5.5.5")).status, 429); assert.equal(writes, w);
  assert.equal((await hit("6.6.6.6")).status, 204);
  assert.equal((await hit("5.5.5.5", new Date("2026-10-14T13:05:00Z"))).status, 204); // new hour
  assert.ok(![...env.KV.m.keys()].some((k) => k.includes("5.5.5.5")));
});
test("/stats reads at most 1000 keys, with limit 1000 on the list call", async () => {
  const env = mk(); const lim = []; const list = env.KV.list;
  env.KV.list = async (o) => { lim.push(o.limit); return list(o); };
  for (let i = 0; i < 1200; i++) env.KV.m.set(`hit|2026-10-14|direct|k${i}`, "1");
  let gets = 0; const get = env.KV.get; env.KV.get = async (k) => { gets++; return get(k); };
  const j = await (await handle(new Request("https://w.test/stats?days=7"), env, NOW)).json();
  assert.ok(gets <= 1000); assert.ok(lim.every((l) => l <= 1000)); assert.equal(j.days["2026-10-14"].direct, 1000);
});
