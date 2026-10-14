import test from "node:test";
import assert from "node:assert/strict";
import { computeHomography, applyHomography, invert3, warpQuad, sliceTiles } from "../app/lib/homography.js";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const sq = [[0, 0], [100, 0], [100, 100], [0, 100]];

test("identity: same four points give the identity matrix", () => {
  const H = computeHomography(sq, sq);
  [1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((v, i) => near(H[i], v));
  const p = applyHomography(H, [37, 61]);
  near(p[0], 37); near(p[1], 61);
});

test("known square-to-quad mapping: corners land on the quad, centre of a trapezoid is above the middle", () => {
  const quad = [[20, 10], [180, 30], [160, 170], [10, 150]];
  const H = computeHomography(sq, quad);
  sq.forEach((p, i) => { const q = applyHomography(H, p); near(q[0], quad[i][0], 1e-6); near(q[1], quad[i][1], 1e-6); });
  // pure scale+translate quad: exact affine
  const A = computeHomography(sq, [[10, 20], [310, 20], [310, 220], [10, 220]]);
  const c = applyHomography(A, [50, 50]);
  near(c[0], 160); near(c[1], 120);
});

test("inverse round-trip error < 0.5 px", () => {
  const quad = [[23.5, 14], [391, 40.25], [372, 405], [-12, 380]];
  const H = computeHomography(sq, quad), Hi = invert3(H);
  let worst = 0;
  for (let x = 0; x <= 100; x += 7) for (let y = 0; y <= 100; y += 9) {
    const back = applyHomography(Hi, applyHomography(H, [x, y]));
    worst = Math.max(worst, Math.hypot(back[0] - x, back[1] - y));
  }
  assert.ok(worst < 0.5, `worst ${worst}`);
});

test("degenerate points throw", () => {
  assert.throws(() => computeHomography(sq, [[0, 0], [0, 0], [0, 0], [0, 0]]));
});

test("warpQuad maps a skewed quad with a coloured quadrant to a straight image", () => {
  // 200x200 image, quad is the box (40,40)-(160,160); left half red, right half blue
  const W = 200, data = new Uint8ClampedArray(W * W * 4);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) data.set(x < 100 ? [255, 0, 0, 255] : [0, 0, 255, 255], (y * W + x) * 4);
  const out = warpQuad({ width: W, height: W, data }, [[40, 40], [160, 40], [160, 160], [40, 160]], 64);
  assert.equal(out.data[(32 * 64 + 5) * 4], 255);
  assert.equal(out.data[(32 * 64 + 58) * 4 + 2], 255);
  const tiles = sliceTiles(out, "w");
  assert.equal(tiles.length, 64);
  assert.equal(tiles[0].data[0], 255);        // a8 (top-left) is red
  assert.equal(tiles[7].data[2], 255);        // h8 (top-right) is blue
  assert.equal(sliceTiles(out, "b")[0].data[2], 255); // black at bottom: a8 sits bottom-right = blue
});
