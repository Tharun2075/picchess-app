// Screenshot -> position. Pure functions, no DOM: used by the browser (onnxruntime-web) and by the tests (onnxruntime-node).
// The model (app/models/squares-screen.json) reads a 256x256 grey board as 64 tiles of 32x32, image-oriented,
// values 0..1 (luma 0.299R+0.587G+0.114B / 255). Output: 13 softmax scores per tile, classes "1KQRBNPkqrbnp".
import { warpQuad } from "./homography.js";

export const CLASSES = "1KQRBNPkqrbnp";
export const BOARD_PX = 256, TILE_PX = 32;

/** RGBA image + 4 corners (TL,TR,BR,BL) -> Float32Array(64*1024), tiles in image order (top-left first). */
export function boardToInput(img, corners) {
  // Training shrank big boards with an area-aware filter (PIL bilinear). A plain bilinear warp would alias, so warp at
  // k times the size (k = whole-number shrink factor) and average k x k blocks.
  const side = Math.hypot(corners[1][0] - corners[0][0], corners[1][1] - corners[0][1]);
  const k = Math.min(8, Math.max(1, Math.round(side / BOARD_PX))), N = BOARD_PX * k;
  const b = warpQuad(img, corners, N), g = new Float32Array(BOARD_PX * BOARD_PX);
  for (let y = 0; y < BOARD_PX; y++) for (let x = 0; x < BOARD_PX; x++) {
    let s = 0;
    for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) {
      const o = ((y * k + dy) * N + x * k + dx) * 4;
      s += 0.299 * b.data[o] + 0.587 * b.data[o + 1] + 0.114 * b.data[o + 2];
    }
    g[y * BOARD_PX + x] = s / (k * k) / 255;
  }
  const out = new Float32Array(64 * TILE_PX * TILE_PX);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) for (let y = 0; y < TILE_PX; y++) {
    const src = (r * TILE_PX + y) * BOARD_PX + c * TILE_PX;
    out.set(g.subarray(src, src + TILE_PX), (r * 8 + c) * TILE_PX * TILE_PX + y * TILE_PX);
  }
  return out;
}

/** probs (Float32Array 64*13, image order) -> per-tile {piece, conf, second, margin}. */
export function readProbs(probs) {
  const tiles = [];
  for (let t = 0; t < 64; t++) {
    let a = -1, b = -1;
    for (let k = 0; k < 13; k++) {
      const p = probs[t * 13 + k];
      if (a < 0 || p > probs[t * 13 + a]) { b = a; a = k; } else if (b < 0 || p > probs[t * 13 + b]) b = k;
    }
    const conf = probs[t * 13 + a], second = probs[t * 13 + b];
    tiles.push({ piece: CLASSES[a], conf, second: CLASSES[b], margin: conf - second });
  }
  return tiles;
}

/** Which colour is at the bottom of the picture? Image-order tiles. White pawns/king sitting lower than black ones => "w". */
export function guessBottom(tiles) {
  let score = 0; // > 0 : white is lower on the screen
  tiles.forEach((t, i) => {
    const row = Math.floor(i / 8) - 3.5;
    if (t.piece === "P") score += row; else if (t.piece === "p") score -= row;
    else if (t.piece === "K") score += 2 * row; else if (t.piece === "k") score -= 2 * row;
  });
  return score >= 0 ? "w" : "b";
}

/** Squares the user should look at: the lowest `lowest` by confidence, every square under `minConf`, every square whose top-2 are within `gap`. */
export function flagSquares(tiles, { lowest = 4, minConf = 0.8, gap = 0.3 } = {}) {
  const flagged = new Set();
  [...tiles.keys()].sort((a, b) => tiles[a].conf - tiles[b].conf).slice(0, lowest).forEach((i) => flagged.add(i));
  tiles.forEach((t, i) => { if (t.conf < minConf || t.margin < gap) flagged.add(i); });
  return [...flagged].sort((a, b) => a - b);
}

const rot = (a) => [...a].reverse(); // 180 degrees: a8..h1 order reversed is h1..a8

/** Image-order tiles -> board in a8..h1 order, given which colour is at the bottom. */
export function orient(tiles, bottom) { return bottom === "w" ? tiles : rot(tiles); }

export function placementOf(pieces) {
  const rows = [];
  for (let r = 0; r < 8; r++) {
    let s = "", n = 0;
    for (let c = 0; c < 8; c++) {
      const p = pieces[r * 8 + c];
      if (p === "1" || p == null) n++; else { if (n) s += n; n = 0; s += p; }
    }
    rows.push(s + (n || ""));
  }
  return rows.join("/");
}

/** Full pipeline. `run(input Float32Array)` -> Promise<Float32Array 64*13>. */
export async function recognise(img, corners, run, { bottom = null } = {}) {
  const tiles = readProbs(await run(boardToInput(img, corners)));
  const b = bottom || guessBottom(tiles);
  const oriented = orient(tiles, b);
  return { bottom: b, guessed: !bottom, squares: oriented, flagged: flagSquares(oriented), fen: placementOf(oriented.map((t) => t.piece)) };
}
