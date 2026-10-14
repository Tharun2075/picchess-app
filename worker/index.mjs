// PicChess share Worker: POST /share (opt-in training data), /hit and /stats (visit counts only).
// No cookies, no accounts, no raw IPs, no content in logs. Free plan: one R2 bucket + one KV namespace.
import { MAX_BODY, validateShare, corsOrigin, hitKey, cleanSrc, cleanPath } from "./validate.mjs";

const RATE_PER_HOUR = 20, DAILY_CAP = 5000;
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
  const ipKey = "rl|" + (await sha256hex(new TextEncoder().encode(`${env.SALT || "picchess"}|${hour}|${ip}`))).slice(0, 32);
  const used = parseInt((await env.KV.get(ipKey)) || "0", 10);
  if (used >= RATE_PER_HOUR) return reject(req, 429, "rate limit");

  const day = utcDay(now), capKey = "cap|" + day;
  if (parseInt((await env.KV.get(capKey)) || "0", 10) >= DAILY_CAP) return reject(req, 503, "try later");

  let body;
  try { body = JSON.parse(text); } catch { return reject(req, 400, "bad json"); }
  const v = validateShare(body);
  if (!v.ok) return reject(req, v.status, v.error);

  await env.KV.put(ipKey, String(used + 1), { expirationTtl: 7200 });
  const sha = await sha256hex(v.bytes);
  const imgKey = `images/${sha}.${v.ext}`, metaKey = `meta/${sha}.json`;
  const isNew = !(await env.BUCKET.head(metaKey));
  await env.BUCKET.put(imgKey, v.bytes, { httpMetadata: { contentType: v.ext === "jpg" ? "image/jpeg" : "image/webp" } });
  await env.BUCKET.put(metaKey, JSON.stringify({ sha, ...v.value, imageKey: imgKey, receivedAt: utcDay(now) }), { httpMetadata: { contentType: "application/json" } });
  if (isNew) await bump(env.KV, capKey, 2 * 86400);
  counts.accepted++;
  console.log(`share accepted=${counts.accepted} rejected=${counts.rejected}`);
  return reply(req, 200, { ok: true, sha });
}

async function hit(req, env, url, now) {
  const src = cleanSrc(url.searchParams.get("src")), p = cleanPath(url.searchParams.get("p"));
  await bump(env.KV, hitKey(utcDay(now), src, p), 40 * 86400);
  return new Response(null, { status: 204, headers: { "cache-control": "no-store", "access-control-allow-origin": corsOrigin(req.headers.get("origin")) || "*" } });
}

async function stats(req, env, url, now) {
  const days = Math.max(1, Math.min(31, parseInt(url.searchParams.get("days") || "7", 10) || 7));
  const out = {}; let scans = 0;
  for (let i = 0; i < days; i++) {
    const day = utcDay(new Date(now.getTime() - i * 86400000));
    const list = await env.KV.list({ prefix: `hit|${day}|` });
    for (const k of list.keys) {
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
