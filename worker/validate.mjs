// Pure validation for POST /share and the /hit counters. No I/O, so tests import it directly.
export const MAX_BODY = 1.5 * 1024 * 1024;
export const MAX_IMAGE = 1024 * 1024;
const KEYS = ["image", "source", "orientation", "sideToMove", "predictedFen", "correctedFen", "corners", "appVersion"];
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
// "jpg" | "webp" | null from the magic bytes (not the claim)
export function imageKind(b) {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "webp";
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
  if (!ext) return bad("image must be jpeg or webp");
  if (!["screenshot", "photo"].includes(body.source)) return bad("bad source");
  if (!["white", "black"].includes(body.orientation)) return bad("bad orientation");
  if (!["w", "b"].includes(body.sideToMove)) return bad("bad sideToMove");
  if (body.predictedFen !== "" && !placementOk(body.predictedFen)) return bad("bad predictedFen");
  if (!fenOk(body.correctedFen)) return bad("bad correctedFen");
  if (body.corners !== null) {
    const c = body.corners;
    const ok = Array.isArray(c) && c.length === 4 && c.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1));
    if (!ok) return bad("bad corners");
  }
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
