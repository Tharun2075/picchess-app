// 4-point perspective transform (direct linear transform) and image warp. Pure: no DOM.
// Points are [x, y]. Image objects are {width, height, data: RGBA Uint8ClampedArray} (same shape as ImageData).

// Solve A x = b (n x n) by Gauss elimination with partial pivoting.
function solve(A, b) {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let m = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[m][i])) m = r;
    if (Math.abs(A[m][i]) < 1e-12) throw new Error("degenerate point set");
    [A[i], A[m]] = [A[m], A[i]]; [b[i], b[m]] = [b[m], b[i]];
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c];
    x[i] = s / A[i][i];
  }
  return x;
}

// 3x3 matrix (row-major array of 9, h33 = 1) mapping src[i] -> dst[i].
export function computeHomography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  return [...solve(A, b), 1];
}

export function applyHomography(H, [x, y]) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

export function invert3(M) {
  const [a, b, c, d, e, f, g, h, i] = M;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) throw new Error("singular matrix");
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det);
}

// Warp the quadrilateral `corners` (TL, TR, BR, BL in image pixels) to an out x out square (bilinear).
export function warpQuad(img, corners, out = 512) {
  const H = computeHomography([[0, 0], [out, 0], [out, out], [0, out]], corners); // output -> input
  const data = new Uint8ClampedArray(out * out * 4);
  const { width: W, height: Hh, data: s } = img;
  for (let y = 0; y < out; y++) {
    for (let x = 0; x < out; x++) {
      const [u, v] = applyHomography(H, [x + 0.5, y + 0.5]);
      const fx = u - 0.5, fy = v - 0.5;
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const o = (y * out + x) * 4;
      for (let c = 0; c < 4; c++) {
        const px = (xx, yy) => s[(Math.min(Hh - 1, Math.max(0, yy)) * W + Math.min(W - 1, Math.max(0, xx))) * 4 + c];
        data[o + c] = (px(x0, y0) * (1 - tx) + px(x0 + 1, y0) * tx) * (1 - ty) + (px(x0, y0 + 1) * (1 - tx) + px(x0 + 1, y0 + 1) * tx) * ty;
      }
    }
  }
  return { width: out, height: out, data };
}

// Slice a square board image into 64 tiles. Order is always a8,b8,...,h8,a7,...,h1.
// bottom: "w" (White at the bottom of the picture) or "b" (Black at the bottom, board seen from Black's side).
export function sliceTiles(board, bottom = "w") {
  const n = board.width, t = Math.floor(n / 8), tiles = [];
  for (let rank = 8; rank >= 1; rank--) {
    for (let file = 0; file < 8; file++) {
      const col = bottom === "w" ? file : 7 - file, row = bottom === "w" ? 8 - rank : rank - 1;
      const d = new Uint8ClampedArray(t * t * 4);
      for (let y = 0; y < t; y++) {
        const so = ((row * t + y) * n + col * t) * 4;
        d.set(board.data.subarray(so, so + t * 4), y * t * 4);
      }
      tiles.push({ width: t, height: t, data: d });
    }
  }
  return tiles;
}

export const squareNames = () => {
  const out = [];
  for (let r = 8; r >= 1; r--) for (const f of "abcdefgh") out.push(f + r);
  return out;
};
