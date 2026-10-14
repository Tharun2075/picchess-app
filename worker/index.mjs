// PicChess share Worker: POST /share (opt-in training data), /hit and /stats (visit counts only).
// No cookies, no accounts, no raw IPs, no content in logs. Free plan: two KV namespaces (KV = counters, SHARES = images), no R2.
import { MAX_BODY, validateShare, corsOrigin, hitKey, cleanSrc, cleanPath, ipKey } from "./validate.mjs";

const RATE_PER_HOUR = 20, DAILY_CAP = 900; // KV free tier allows 1000 writes/day in total; /hit batching keeps the rest small
const HIT_PER_HOUR = 60;
const STATS_KEY_LIMIT = 1000;
const HIT_FLUSH_MS = 3600000;
const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);
const sha256hex = async (data) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))].map((b) => b.toString(16).padStart(2, "0")).join("");
const counts = { accepted: 0, rejected: 0 };

function reply(req, status, body, extra = {}) {
  const h = new Headers({ "content-type": "application/json", "cache-control": "no-store", ...extra });
  const o = corsOrigin(req.headers.get("origin"));
  if (o) { h.set("access-control-allow-origin", o); h.set("vary", "Origin"); }
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: h });
}
const reject = (req, status, error) => { counts.rejected++; console.log(`share accepted=${counts.accepted} rejected=${counts.rejected}`); return reply(req, status, { error }); };

async function bump(kv, key, ttl) {
  const n = parseInt((await kv.get(key)) || "0", 10) + 1;
  await kv.put(key, String(n), ttl ? { expirationTtl: ttl } : undefined);
  return n;
}

async function share(req, env, now) {
  const origin = req.headers.get("origin");
  if (origin && !corsOrigin(origin)) return reject(req, 403, "origin not allowed");
  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_BODY) return reject(req, 413, "body too large");
  const text = await req.text();
  if (text.length > MAX_BODY) return reject(req, 413, "body too large");

  // per-IP limit: only a salted, hourly-rotating hash is kept, never the address
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  const hour = now.toISOString().slice(0, 13);
  const rlKey = await ipKey("rl|", env.SALT, hour, ip);
  const used = parseInt((await env.KV.get(rlKey)) || "0", 10);
  if (used >= RATE_PER_HOUR) return reject(req, 429, "rate limit");

  const day = utcDay(now), capKey = "cap|" + day;
  if (parseInt((await env.KV.get(capKey)) || "0", 10) >= DAILY_CAP) return reject(req, 503, "try later");

  let body;
  try { body = JSON.parse(text); } catch { return reject(req, 400, "bad json"); }
  const v = validateShare(body);
  if (!v.ok) return reject(req, v.status, v.error);

  const sha = await sha256hex(v.bytes);
  const key = `img/${sha}.${v.ext}`;
  // one KV entry per share: the image bytes, with the small JSON record as KV metadata (limit 1 KB)
  const meta = { sha, ...v.value, kind: v.value.source, bottom: v.value.orientation, fen: v.value.correctedFen, license: "CC0", ts: now.toISOString(), receivedAt: utcDay(now) };
  try {
    const isNew = !(await env.SHARES.getWithMetadata(key, "arrayBuffer")).metadata;
    await env.KV.put(rlKey, String(used + 1), { expirationTtl: 7200 });
    await env.SHARES.put(key, v.bytes, { metadata: meta });
    if (isNew) await bump(env.KV, capKey, 2 * 86400);
  } catch { return reject(req, 503, "try later"); } // e.g. KV daily write limit reached
  counts.accepted++;
  console.log(`share accepted=${counts.accepted} rejected=${counts.rejected}`);
  return reply(req, 200, { ok: true, sha });
}

// Counts are batched per isolate: the first hit of a key writes at once, later hits are added to the
// pending total and flushed at most once per hour per key. Approximate by design (free KV write budget).
const hitState = new WeakMap(), hitSeen = new WeakMap(); // hitSeen: per-isolate hourly-hash counters, no KV write
async function hit(req, env, url, now) {
  const noContent = (extra = 204) => new Response(null, { status: extra, headers: { "cache-control": "no-store", "access-control-allow-origin": corsOrigin(req.headers.get("origin")) || "*" } });
  // same salted per-IP hourly limit as /share; read-only while under it (a counted hit is one KV read, no write), and never a write for an over-limit caller
  const hk = await ipKey("hr|", env.SALT, now.toISOString().slice(0, 13), req.headers.get("cf-connecting-ip") || "unknown");
  const seen = hitSeen.get(env.KV) || hitSeen.set(env.KV, new Map()).get(env.KV);
  const c = (seen.get(hk) || 0) + 1; seen.set(hk, c);
  if (seen.size > 5000) seen.clear();
  if (c > HIT_PER_HOUR) return noContent(429);
  const src = cleanSrc(url.searchParams.get("src")), p = cleanPath(url.searchParams.get("p"));
  const key = hitKey(utcDay(now), src, p);
  let st = hitState.get(env.KV); if (!st) hitState.set(env.KV, st = new Map());
  const e = st.get(key) || { pending: 0, last: 0 };
  e.pending++; st.set(key, e);
  if (now.getTime() - e.last >= HIT_FLUSH_MS) {
    const add = e.pending; e.pending = 0; e.last = now.getTime();
    try {
      const n = parseInt((await env.KV.get(key)) || "0", 10) + add;
      await env.KV.put(key, String(n), { expirationTtl: 40 * 86400 });
    } catch { e.pending += add; }
  }
  return noContent();
}

async function stats(req, env, url, now) {
  const days = Math.max(1, Math.min(31, parseInt(url.searchParams.get("days") || "7", 10) || 7));
  const out = {}; let scans = 0, budget = STATS_KEY_LIMIT; // at most this many keys read in total, one list call per day
  for (let i = 0; i < days && budget > 0; i++) {
    const day = utcDay(new Date(now.getTime() - i * 86400000));
    const list = await env.KV.list({ prefix: `hit|${day}|`, limit: Math.min(1000, budget) });
    for (const k of list.keys.slice(0, budget)) {
      budget--;
      const [, , src, path] = k.name.split("|");
      const n = parseInt((await env.KV.get(k.name)) || "0", 10);
      (out[day] ||= {})[src] = (out[day][src] || 0) + n;
      if (path === "scan") scans += n;
    }
  }
  return new Response(JSON.stringify({ days: out, totalScans: scans }), { headers: { "content-type": "application/json", "cache-control": "public, max-age=60", "access-control-allow-origin": "*" } });
}

export async function handle(req, env, now = new Date()) {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") {
    const o = corsOrigin(req.headers.get("origin"));
    return new Response(null, { status: o ? 204 : 403, headers: o ? { "access-control-allow-origin": o, "access-control-allow-methods": "POST, GET", "access-control-allow-headers": "content-type", "access-control-max-age": "86400", vary: "Origin" } : {} });
  }
  if (url.pathname === "/share") return req.method === "POST" ? share(req, env, now) : reply(req, 405, { error: "POST only" }, { allow: "POST" });
  if (url.pathname === "/hit" && (req.method === "GET" || req.method === "POST")) return hit(req, env, url, now);
  if (url.pathname === "/stats" && req.method === "GET") return stats(req, env, url, now);
  return reply(req, req.method === "GET" || req.method === "POST" ? 404 : 405, { error: "not found" });
}

export default { fetch: (req, env) => handle(req, env) };
