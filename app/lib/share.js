// Opt-in sharing of a confirmed board as free training data, plus the anonymous visit counter.
// The Worker origin is the ONE constant below; app/_headers connect-src must list exactly the same origin.
export const SHARE_ORIGIN = "https://picchess-share.picchess.workers.dev";
export const SHARE_URL = SHARE_ORIGIN + "/share";
export const HIT_URL = SHARE_ORIGIN + "/hit";
export const APP_VERSION = "0.1";
export const LS_KEY = "picchess-share-optin";

export const isShareOn = (store = globalThis.localStorage) => { try { return store.getItem(LS_KEY) === "1"; } catch { return false; } };
export const setShareOn = (on, store = globalThis.localStorage) => { try { store.setItem(LS_KEY, on ? "1" : "0"); } catch { /* private mode: choice just is not remembered */ } };

// Send only when ticked AND the user has confirmed the position. Failures are silent, no retries.
// ctx: { image (base64), source, corners (0..1 pairs | null), predictedFen }; confirmed: { fen, orientation }
export async function shareBoard({ ctx, correctedFen, orientation, enabled, fetchFn = globalThis.fetch, onDone = () => {} }) {
  if (!enabled || !ctx || !ctx.image || !correctedFen) return false;
  const body = {
    image: ctx.image,
    source: ctx.source,
    orientation: orientation === "b" || orientation === "black" ? "black" : "white",
    sideToMove: correctedFen.split(" ")[1],
    predictedFen: ctx.predictedFen || "",
    correctedFen,
    corners: ctx.source === "photo" ? ctx.corners : null,
    appVersion: APP_VERSION,
  };
  try {
    const r = await fetchFn(SHARE_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "omit", referrerPolicy: "no-referrer" });
    if (r && r.ok) { onDone(); return true; }
  } catch { /* silent */ }
  return false;
}

// Visit counter: day, source and path only. utm_* are removed from the address bar afterwards.
export function countVisit({ loc = globalThis.location, hist = globalThis.history, beacon = (u) => navigator.sendBeacon(u) } = {}) {
  const q = new URLSearchParams(loc.search);
  const src = q.get("utm_source") || "direct";
  try { beacon(`${HIT_URL}?src=${encodeURIComponent(src)}&p=${encodeURIComponent("/")}`); } catch { /* silent */ }
  let changed = false;
  for (const k of [...q.keys()]) if (k.startsWith("utm_")) { q.delete(k); changed = true; }
  if (changed) { const s = q.toString(); try { hist.replaceState(null, "", loc.pathname + (s ? "?" + s : "") + loc.hash); } catch { /* ignore */ } }
}
export const countScan = (beacon = (u) => navigator.sendBeacon(u)) => { try { beacon(`${HIT_URL}?src=scan&p=scan`); } catch { /* silent */ } };

// Re-encode an ImageData/canvas to jpeg that fits 1 MB (shrinks quality, then size). Browser only.
export async function encodeJpeg(canvas, maxBytes = 900 * 1024) {
  let c = canvas;
  for (let attempt = 0; attempt < 6; attempt++) {
    for (const q of [0.85, 0.7, 0.5]) {
      const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", q));
      if (blob && blob.size <= maxBytes) {
        const buf = new Uint8Array(await blob.arrayBuffer());
        let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        return btoa(s);
      }
    }
    const n = document.createElement("canvas"); n.width = Math.round(c.width * 0.75); n.height = Math.round(c.height * 0.75);
    n.getContext("2d").drawImage(c, 0, 0, n.width, n.height); c = n;
  }
  return null;
}
