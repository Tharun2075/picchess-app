// Classical board finder for flat images (screenshots, crops). No ML, no DOM.
// Idea: every inner square edge of a board is a long luminance step, so 9 evenly spaced
// vertical and 9 horizontal lines all carry strong gradient along the whole board, while the
// mid-lines of the squares do not. Search (x0, y0, side) maximising line-minus-midline gradient,
// then check that squares alternate light/dark. Own code; the projection-profile idea follows
// the public description of tensorflow_chessbot.
//
// Input image: {width, height, data: RGBA} (an ImageData works). Output coordinates are in input pixels.

const MAX_SIDE = 512;   // analysis resolution
const EDGE_CLAMP = 80;  // limit the influence of a few very strong edges (UI chrome)

function toGray(img, maxSide) {
  const k = Math.max(1, Math.max(img.width, img.height) / maxSide);
  const w = Math.max(1, Math.round(img.width / k)), h = Math.max(1, Math.round(img.height / k));
  const g = new Float32Array(w * h), { data, width } = img;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * img.height) / h), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.height) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * img.width) / w), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * img.width) / w));
      let s = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const o = (yy * width + xx) * 4;
        s += 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]; n++;
      }
      g[y * w + x] = s / n;
    }
  }
  return { w, h, g, scale: w / img.width };
}

function halve(a) {
  const w = a.w >> 1, h = a.h >> 1, g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    g[y * w + x] = (a.g[2 * y * a.w + 2 * x] + a.g[2 * y * a.w + 2 * x + 1] + a.g[(2 * y + 1) * a.w + 2 * x] + a.g[(2 * y + 1) * a.w + 2 * x + 1]) / 4;
  return { w, h, g, scale: a.scale / 2 };
}

// cumV[x*(h+1)+y]: prefix over y of the vertical-edge strength at column boundary x.
// cumH[y*(w+1)+x]: prefix over x of the horizontal-edge strength at row boundary y.
function buildMaps({ w, h, g }) {
  const cumV = new Float32Array((w + 2) * (h + 1)), cumH = new Float32Array((h + 2) * (w + 1));
  const ex = new Float32Array(w + 2), ey = new Float32Array(h + 2);
  const edge = (a, b) => Math.min(EDGE_CLAMP, Math.abs(a - b));
  for (let y = 0; y < h; y++) {
    ex.fill(0);
    for (let x = 1; x < w; x++) ex[x] = edge(g[y * w + x], g[y * w + x - 1]);
    for (let x = 0; x <= w; x++) cumV[x * (h + 1) + y + 1] = cumV[x * (h + 1) + y] + (ex[x - 1 < 0 ? 0 : x - 1] + ex[x] + ex[x + 1]);
  }
  for (let x = 0; x < w; x++) {
    ey.fill(0);
    for (let y = 1; y < h; y++) ey[y] = edge(g[y * w + x], g[(y - 1) * w + x]);
    for (let y = 0; y <= h; y++) cumH[y * (w + 1) + x + 1] = cumH[y * (w + 1) + x] + (ey[y - 1 < 0 ? 0 : y - 1] + ey[y] + ey[y + 1]);
  }
  return { w, h, cumV, cumH };
}

// Mean line gradient minus mean mid-line gradient for a candidate board.
function edgeScore(m, x0, y0, s) {
  const { w, h, cumV, cumH } = m, S = 8 * s;
  const ya = Math.round(y0), yb = Math.round(y0 + S), xa = Math.round(x0), xb = Math.round(x0 + S);
  if (ya < 0 || xa < 0 || yb > h || xb > w) return -1;
  let line = 0, mid = 0;
  for (let k = 0; k <= 8; k++) {
    const x = Math.round(x0 + k * s), y = Math.round(y0 + k * s);
    line += cumV[x * (h + 1) + yb] - cumV[x * (h + 1) + ya];
    line += cumH[y * (w + 1) + xb] - cumH[y * (w + 1) + xa];
    if (k < 8) {
      const xm = Math.round(x0 + (k + 0.5) * s), ym = Math.round(y0 + (k + 0.5) * s);
      mid += cumV[xm * (h + 1) + yb] - cumV[xm * (h + 1) + ya];
      mid += cumH[ym * (w + 1) + xb] - cumH[ym * (w + 1) + xa];
    }
  }
  return (line / (18 * S) - mid / (16 * S)) / 3;
}

function integral({ w, h, g }) {
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += g[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; }
  }
  return I;
}

// Fraction of squares whose corner-patch brightness lies on the side expected from a/b parity,
// plus the light/dark contrast. Pieces sit mid-square, so only the 4 corners of each square are sampled.
function checkerScore(gray, I, x0, y0, s) {
  const { w, h } = gray, W1 = w + 1;
  const a = Math.max(1, Math.round(s * 0.1)), b = Math.max(a + 1, Math.round(s * 0.3));
  const vals = [];
  const sum = (xa, ya, xb, yb) => I[yb * W1 + xb] - I[ya * W1 + xb] - I[yb * W1 + xa] + I[ya * W1 + xa];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const L = x0 + c * s, T = y0 + r * s, R = L + s, B = T + s;
    let t = 0, n = 0;
    for (const [xa, ya] of [[L + a, T + a], [R - b, T + a], [L + a, B - b], [R - b, B - b]]) {
      const xi = Math.round(xa), yi = Math.round(ya), d = Math.max(1, b - a);
      if (xi < 0 || yi < 0 || xi + d > w || yi + d > h) return { agree: 0, contrast: 0 };
      t += sum(xi, yi, xi + d, yi + d); n += d * d;
    }
    vals.push(t / n);
  }
  let m0 = 0, m1 = 0;
  vals.forEach((v, i) => { if (((i >> 3) + (i & 7)) % 2 === 0) m0 += v / 32; else m1 += v / 32; });
  const thr = (m0 + m1) / 2, dir = m0 > m1;
  let ok = 0;
  vals.forEach((v, i) => { const even = ((i >> 3) + (i & 7)) % 2 === 0; if ((v > thr) === (even === dir)) ok++; });
  return { agree: ok / 64, contrast: Math.abs(m0 - m1) };
}

function search(m, minS, maxS, step, region) {
  // best (x0, y0) for each s
  const out = [];
  for (let s = minS; s <= maxS + 1e-9; s += step) {
    let best = { score: -1 };
    const [xa, xb, ya, yb] = region ? [region.xa, region.xb, region.ya, region.yb] : [0, m.w - 8 * s, 0, m.h - 8 * s];
    for (let y0 = Math.max(0, ya); y0 <= yb; y0++) for (let x0 = Math.max(0, xa); x0 <= xb; x0++) {
      const sc = edgeScore(m, x0, y0, s);
      if (sc > best.score) best = { score: sc, x0, y0, s };
    }
    if (best.score >= 0) out.push(best);
  }
  return out;
}

/**
 * Find the board box in a flat image.
 * @returns {{x:number,y:number,size:number,confidence:number}|null} box in input pixels (null if nothing found)
 */
export function findBoard(img) {
  const fine = toGray(img, MAX_SIDE);
  if (Math.min(fine.w, fine.h) < 64) return null;
  const coarse = Math.max(fine.w, fine.h) >= 200 ? halve(fine) : fine;
  const f = fine.w / coarse.w;
  const mc = buildMaps(coarse);
  const minSide = Math.min(coarse.w, coarse.h);
  const cands = search(mc, Math.max(4, (0.3 * minSide) / 8), minSide / 8, 0.5).sort((a, b) => b.score - a.score);
  const picked = [];
  for (const c of cands) {
    if (picked.length >= 5) break;
    if (picked.every((p) => Math.abs(p.x0 - c.x0) > 4 || Math.abs(p.y0 - c.y0) > 4 || Math.abs(p.s - c.s) > 1)) picked.push(c);
  }
  const mf = f === 1 ? mc : buildMaps(fine), I = integral(fine);
  let best = null;
  for (const c of picked) {
    const r = Math.ceil(2 * f) + 1, cx = c.x0 * f, cy = c.y0 * f, cs = c.s * f;
    const fineCands = search(mf, cs - f, cs + f, 0.25, { xa: Math.floor(cx - r), xb: Math.ceil(cx + r), ya: Math.floor(cy - r), yb: Math.ceil(cy + r) });
    for (const fc of fineCands) {
      const ck = checkerScore(fine, I, fc.x0, fc.y0, fc.s);
      const total = fc.score * (0.2 + Math.max(0, (ck.agree - 0.5) * 2) ** 2);
      if (!best || total > best.total) best = { ...fc, ...ck, total };
    }
  }
  if (!best) return null;
  const confidence = Math.max(0, Math.min(1, ((best.agree - 0.6) / 0.35) * Math.min(1, best.score / 6)));
  return { x: best.x0 / fine.scale, y: best.y0 / fine.scale, size: (8 * best.s) / fine.scale, confidence, agree: best.agree, edge: best.score };
}

/** Corners (TL, TR, BR, BL) of a box, for the warp. */
export const boxCorners = ({ x, y, size }) => [[x, y], [x + size, y], [x + size, y + size], [x, y + size]];
