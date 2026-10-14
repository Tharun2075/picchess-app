// Pure validation for POST /share and the /hit counters. No I/O, so tests import it directly.
export const MAX_BODY = 400 * 1024;
export const MAX_IMAGE = 250 * 1024;
export const MIN_SIDE = 256, MAX_SIDE = 1024; // the board crop is a square, 512 px from the app
const KEYS = ["image", "source", "orientation", "sideToMove", "predictedFen", "correctedFen", "appVersion"];
const PLACEMENT = /^[pnbrqkPNBRQK1-8]+(\/[pnbrqkPNBRQK1-8]+){7}$/;
const FULL_FEN = /^[pnbrqkPNBRQK1-8\/]+ [wb] (-|[KQkq]{1,4}) (-|[a-h][36]) \d{1,3} \d{1,4}$/;

export function placementOk(p) {
  if (typeof p !== "string" || !PLACEMENT.test(p)) return false;
  let wk = 0, bk = 0;
  for (const rank of p.split("/")) {
    let n = 0;
    for (const c of rank) {
      if (c >= "1" && c <= "8") n += +c; else { n++; if (c === "K") wk++; if (c === "k") bk++; }
    }
    if (n !== 8) return false;
  }
  return wk === 1 && bk === 1;
}
export const fenOk = (f) => typeof f === "string" && f.length <= 100 && FULL_FEN.test(f) && placementOk(f.split(" ")[0]);

export function base64ToBytes(s) {
  if (typeof s !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(s) || s.length % 4 !== 0) return null;
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
// "jpg" | null from the magic bytes (not the claim); only jpeg is accepted now (the app's board crop)
export function imageKind(b) {
  return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? "jpg" : null;
}
// decoded size from the first JPEG start-of-frame marker -> { w, h } | null
export function jpegSize(b) {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    if (m === 0xda) return null;
    i += 2 + len;
  }
  return null;
}

// -> { ok: true, value, bytes, ext } | { ok: false, status, error }
export function validateShare(body) {
  const bad = (error, status = 400) => ({ ok: false, status, error });
  if (!body || typeof body !== "object" || Array.isArray(body)) return bad("body must be an object");
  for (const k of Object.keys(body)) if (!KEYS.includes(k)) return bad(`unknown key ${k}`);
  for (const k of KEYS) if (!(k in body)) return bad(`missing ${k}`);
  if (typeof body.image === "string" && body.image.length > Math.ceil(MAX_IMAGE / 3) * 4 + 4) return bad("image too large", 413);
  const bytes = base64ToBytes(body.image);
  if (!bytes) return bad("image is not base64");
  if (bytes.length > MAX_IMAGE) return bad("image too large", 413);
  const ext = imageKind(bytes);
  if (!ext) return bad("image must be jpeg");
  const sz = jpegSize(bytes);
  if (!sz || sz.w !== sz.h || sz.w < MIN_SIDE || sz.w > MAX_SIDE) return bad("image must be the square board crop (256..1024 px)");
  if (!["screenshot", "photo"].includes(body.source)) return bad("bad source");
  if (!["white", "black"].includes(body.orientation)) return bad("bad orientation");
  if (!["w", "b"].includes(body.sideToMove)) return bad("bad sideToMove");
  if (body.predictedFen !== "" && !placementOk(body.predictedFen)) return bad("bad predictedFen");
  if (!fenOk(body.correctedFen)) return bad("bad correctedFen");
  if (typeof body.appVersion !== "string" || body.appVersion.length === 0 || body.appVersion.length > 32) return bad("bad appVersion");
  const { image, ...meta } = body;
  return { ok: true, value: meta, bytes, ext };
}

// ---- visit counters ----
// sources are an allowlist too, so an attacker cannot mint unbounded counter keys (each is a KV write)
const SOURCES = ["direct", "scan", "twitter", "x", "reddit", "bluesky", "hn", "hackernews", "facebook", "instagram", "github", "email", "producthunt", "linkedin", "youtube", "discord", "mastodon"];
export const cleanSrc = (s) => {
  const t = String(s ?? "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24);
  return !t ? "direct" : SOURCES.includes(t) ? t : "other";
};
// paths are a tiny allowlist so /hit cannot create unbounded KV keys
export const cleanPath = (p) => (["/", "scan"].includes(String(p ?? "")) ? String(p) : "other");
export const hitKey = (day, src, path) => `hit|${day}|${cleanSrc(src)}|${cleanPath(path)}`;

export function corsOrigin(origin) {
  if (!origin) return null;
  if (origin === "https://picchess.pages.dev") return origin;
  return /^http:\/\/localhost(:\d{1,5})?$/.test(origin) ? origin : null;
}

// salted, hourly-rotating hash of the caller address; only the hash is ever stored
export async function ipKey(prefix, salt, hour, ip) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt || "picchess"}|${hour}|${ip}`));
  return prefix + [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
